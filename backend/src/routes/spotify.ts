import express from "express";
import dotenv from "dotenv";
import { db } from "../db";

dotenv.config();
const router = express.Router();
interface DeviceRow {
  spotify_auth_id: number;
}
type SpotifyAuthRow = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
/**
 * ============================
 * CONFIG
 * ============================
 */

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("Missing Spotify client credentials");
}

const SCOPES = ["user-read-playback-state", "user-read-currently-playing"].join(
  " "
);

/**
 * ============================
 * HELPERS
 * ============================
 */

function isTokenExpired(expiresAt: number) {
  return Date.now() >= expiresAt;
}

/**
 * 🔁 Refresh token + UPDATE DATABASE
 */
async function refreshAccessToken(spotifyAuthId: number, refreshToken: string) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  const expiresAt = Date.now() + data.expires_in * 1000;
  const newRefreshToken = data.refresh_token ?? refreshToken;

  // ✅ UPDATE DB (this is what you were missing conceptually)
  db.prepare(
    `
    UPDATE spotify_auth
    SET
      spotify_access_token = ?,
      spotify_refresh_token = ?,
      spotify_expires_at = ?
    WHERE id = ?
  `
  ).run(data.access_token, newRefreshToken, expiresAt, spotifyAuthId);

  return {
    accessToken: data.access_token,
    refreshToken: newRefreshToken,
    expiresAt,
  };
}

/**
 * ============================
 * ROUTES
 * ============================
 */

router.get("/login", (req, res) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

/**
 * 🎧 Spotify OAuth Callback
 * Saves BOTH access + refresh tokens to DB
 */
router.get("/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send("Missing authorization code");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await response.json();
  if (!response.ok) return res.status(500).json(data);

  const expiresAt = Date.now() + data.expires_in * 1000;

  // ✅ INSERT INTO DATABASE
  const result = db
    .prepare(
      `
    INSERT INTO spotify_auth (
      spotify_access_token,
      spotify_refresh_token,
      spotify_expires_at
    ) VALUES (?, ?, ?)
  `
    )
    .run(data.access_token, data.refresh_token, expiresAt);

  // ✅ SESSION STORES ID + CACHE ONLY
  req.session.spotify = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    spotifyAuthId: result.lastInsertRowid as number,
  };

  res.redirect("https://spotify.balloonhubgaming.com");
});

/**
 * 🎶 Current track (ESP32 hits this)
 */
router.get("/current-track", async (req, res) => {
  const spotify = req.session.spotify;

  if (!spotify) {
    return res.status(401).json({ error: "Not logged in" });
  }

  // 🔁 Refresh if expired
  if (isTokenExpired(spotify.expiresAt)) {
    const refreshed = await refreshAccessToken(
      spotify.spotifyAuthId,
      spotify.refreshToken
    );

    spotify.accessToken = refreshed.accessToken;
    spotify.refreshToken = refreshed.refreshToken;
    spotify.expiresAt = refreshed.expiresAt;
  }

  const response = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: {
        Authorization: `Bearer ${spotify.accessToken}`,
      },
    }
  );

  if (response.status === 204) {
    return res.json({ playing: false });
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    return res.status(response.status).json({
      error: "Spotify error",
      details: text,
    });
  }

  res.json(await response.json());
});

/**
 * ============================
 * MISC
 * ============================
 */

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get("/status", (req, res) => {
  if (req.session?.spotify) {
    return res.json({ loggedIn: true });
  }
  res.json({ loggedIn: false });
});


router.post("/current-track-ESP32", async (req,res) => {
  try{
  const {uuid} = req.body;
  if (!uuid) {
    return res.status(400).json({error:"Missing UUID"})
  }
  const device = db.prepare<string, DeviceRow>(
    `
    SELECT spotify_auth_id 
    FROM devices
    WHERE device_uuid = ?
    `
  ).get(uuid)

  if (!device) {
    return res.status(401).json({ error: "Device not authorized" });
  }

  let auth = db.prepare<number,SpotifyAuthRow>(
    `
    SELECT
      access_token,
      refresh_token,
      expires_at
    FROM spotify_auth
    WHERE id = ?
    `
  ).get(device.spotify_auth_id)

  if (!auth) {
    return res.status(401).json({error: "Spotify Account not linked"})
  }

   /* ---- REFRESH IF NEEDED ---- */
    if (isTokenExpired(auth.expires_at)) {
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
            ).toString("base64"),
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: auth.refresh_token,
        }),
      });

      const data = await response.json();

      const newExpiresAt = Date.now() + data.expires_in * 1000;

      db.prepare(`
        UPDATE spotify_auth
        SET access_token = ?, refresh_token = ?, expires_at = ?
        WHERE id = ?
      `).run(
        data.access_token,
        data.refresh_token ?? auth.refresh_token,
        newExpiresAt,
        device.spotify_auth_id
      );

      auth = {
        ...auth,
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? auth.refresh_token,
        expires_at: newExpiresAt,
      };
    }

    /* ---- CURRENT TRACK ---- */
    const trackRes = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${auth.access_token}`,
        },
      }
    );

    if (trackRes.status === 204) {
      return res.json({ playing: false });
    }

    const track = await trackRes.json();

    return res.json({
      playing: true,
      track: {
        name: track.item?.name ?? null,
        artist:
          track.item?.artists?.map((a: any) => a.name).join(", ") ?? null,
        album: track.item?.album?.name ?? null,
        image: track.item?.album?.images?.[2]?.url ?? null,
        progress_ms: track.progress_ms ?? 0,
        duration_ms: track.item?.duration_ms ?? 0,
        is_playing: track.is_playing ?? false,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
})

export default router;
