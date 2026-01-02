import express from "express";
import dotenv from "dotenv";
import { db } from "../db";
import sharp from  "sharp"
dotenv.config();
const router = express.Router();
interface DeviceRow {
  spotify_auth_id: number;
}
type SpotifyAuthRow = {
  spotify_access_token: string;
  spotify_refresh_token: string;
  spotify_expires_at: number;
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

function rgb565Bmp(
  rgb565: Buffer,
  width: number,
  height: number
): Buffer {
  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const pixelDataSize = width * height * 2;
  const fileSize = fileHeaderSize + dibHeaderSize + pixelDataSize;

  const header = Buffer.alloc(fileHeaderSize + dibHeaderSize);

  // === FILE HEADER ===
  header.write("BM", 0);                         // Signature
  header.writeUInt32LE(fileSize, 2);              // File size
  header.writeUInt32LE(0, 6);                     // Reserved
  header.writeUInt32LE(fileHeaderSize + dibHeaderSize, 10);

  // === DIB HEADER ===
  header.writeUInt32LE(dibHeaderSize, 14);        // DIB size
  header.writeInt32LE(width, 18);
  header.writeInt32LE(-height, 22);               // top-down BMP
  header.writeUInt16LE(1, 26);                    // Planes
  header.writeUInt16LE(16, 28);                   // Bits per pixel
  header.writeUInt32LE(3, 30);                    // BI_BITFIELDS
  header.writeUInt32LE(pixelDataSize, 34);

  // RGB565 masks
  header.writeUInt32LE(0xF800, 54); // Red
  header.writeUInt32LE(0x07E0, 58); // Green
  header.writeUInt32LE(0x001F, 62); // Blue

  return Buffer.concat([header, rgb565]);
}

const SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state", // ✅ REQUIRED
].join(" ");

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


router.post("/current-track-ESP32/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      return res.status(400).json({ error: "Missing UUID" });
    }

    const device = db.prepare(
      `
      SELECT spotify_auth_id
      FROM devices
      WHERE device_uuid = ?
      `
    ).get(uuid) as DeviceRow;

    if (!device) {
      return res.status(401).json({ error: "Device not authorized" });
    }

    let auth = db.prepare<number, SpotifyAuthRow>(
      `
      SELECT
        spotify_access_token,
        spotify_refresh_token,
        spotify_expires_at
      FROM spotify_auth
      WHERE id = ?
      `
    ).get(device.spotify_auth_id);

    if (!auth) {
      return res.status(401).json({ error: "Spotify account not linked" });
    }

    /* ---- REFRESH IF NEEDED ---- */
    if (isTokenExpired(auth.spotify_expires_at)) {
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
          refresh_token: auth.spotify_refresh_token,
        }),
      });

      const data = await response.json();
      const newExpiresAt = Date.now() + data.expires_in * 1000;

      db.prepare(`
        UPDATE spotify_auth
        SET
          spotify_access_token = ?,
          spotify_refresh_token = ?,
          spotify_expires_at = ?
        WHERE id = ?
      `).run(
        data.access_token,
        data.refresh_token ?? auth.spotify_refresh_token,
        newExpiresAt,
        device.spotify_auth_id
      );

      auth = {
        spotify_access_token: data.access_token,
        spotify_refresh_token:
          data.refresh_token ?? auth.spotify_refresh_token,
        spotify_expires_at: newExpiresAt,
      };
    }

    /* ---- CURRENT TRACK ---- */
const trackRes = await fetch(
  "https://api.spotify.com/v1/me/player/currently-playing",
  {
    headers: {
      Authorization: `Bearer ${auth.spotify_access_token}`,
    },
  }
);

if (trackRes.status === 204) {
  console.log("No Track playing")
  return res.json({ playing: false });
}

const track = await trackRes.json();

const album300 =
  track.item?.album?.images?.find((i: any) => i.width === 300)?.url;

if (!album300) {
  console.log("Not playing")
  return res.json({ playing: false });
}

// Download image
const imgRes = await fetch(album300);
const imgBuf = Buffer.from(await imgRes.arrayBuffer());

// Resize + convert to RGB565
const { data, info } = await sharp(imgBuf)
  .resize(135, 135)
  .raw()
  .toBuffer({ resolveWithObject: true });

const rgb565 = Buffer.alloc(info.width * info.height * 2);

for (let i = 0, j = 0; i + 2 < data.length; i += 3, j += 2) {
  const r = data.readUInt8(i) >> 3;
  const g = data.readUInt8(i + 1) >> 2;
  const b = data.readUInt8(i + 2) >> 3;

  rgb565.writeUInt16LE((r << 11) | (g << 5) | b, j);
}


// Build BMP
const bmp = rgb565Bmp(rgb565, info.width, info.height);

// ✅ NORMAL JSON RESPONSE
return res.json({
  playing: true,
  track: {
    name: track.item?.name ?? "",
    artist: track.item?.artists?.map((a: any) => a.name).join(", ") ?? "",
  },
  image: {
    format: "bmp",
    width: info.width,
    height: info.height,
    data: bmp.toString("base64"),
  },
});

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

//Play Next Track Route
router.post("/play-next-ESP32", async (req, res) => {
  try {
    const { uuid } = req.body;
    if (!uuid) {
      return res.status(400).json({ error: "Missing UUID" });
    }

    const device = db.prepare<{ spotify_auth_id: number }>(
      `
      SELECT spotify_auth_id
      FROM devices
      WHERE device_uuid = ?
      `
    ).get(uuid) as DeviceRow;

    if (!device) {
      return res.status(401).json({ error: "Device not authorized" });
    }

    let auth = db.prepare<number, SpotifyAuthRow>(
      `
      SELECT
        spotify_access_token,
        spotify_refresh_token,
        spotify_expires_at
      FROM spotify_auth
      WHERE id = ?
      `
    ).get(device.spotify_auth_id);

    if (!auth) {
      return res.status(401).json({ error: "Spotify account not linked" });
    }

    /* ---- REFRESH IF NEEDED ---- */
    if (isTokenExpired(auth.spotify_expires_at)) {
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
          refresh_token: auth.spotify_refresh_token,
        }),
      });

      const data = await response.json();
      const newExpiresAt = Date.now() + data.expires_in * 1000;

      db.prepare(`
        UPDATE spotify_auth
        SET
          spotify_access_token = ?,
          spotify_refresh_token = ?,
          spotify_expires_at = ?
        WHERE id = ?
      `).run(
        data.access_token,
        data.refresh_token ?? auth.spotify_refresh_token,
        newExpiresAt,
        device.spotify_auth_id
      );

      auth = {
        spotify_access_token: data.access_token,
        spotify_refresh_token:
          data.refresh_token ?? auth.spotify_refresh_token,
        spotify_expires_at: newExpiresAt,
      };
    }

    /* ---- PLAY NEXT TRACK ---- */
    const nextRes = await fetch(
      "https://api.spotify.com/v1/me/player/next",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.spotify_access_token}`,
        },
      }
    );

    if (!nextRes.ok) {
      const text = await nextRes.text();
      return res.status(nextRes.status).json({ error: text });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

//Play Prev Track
router.post("/play-prev-ESP32", async (req, res) => {
  try {
    const { uuid } = req.body;
    if (!uuid) {
      return res.status(400).json({ error: "Missing UUID" });
    }

    const device = db.prepare<{ spotify_auth_id: number }>(
      `
      SELECT spotify_auth_id
      FROM devices
      WHERE device_uuid = ?
      `
    ).get(uuid) as DeviceRow;

    if (!device) {
      return res.status(401).json({ error: "Device not authorized" });
    }

    let auth = db.prepare<number, SpotifyAuthRow>(
      `
      SELECT
        spotify_access_token,
        spotify_refresh_token,
        spotify_expires_at
      FROM spotify_auth
      WHERE id = ?
      `
    ).get(device.spotify_auth_id);

    if (!auth) {
      return res.status(401).json({ error: "Spotify account not linked" });
    }

    /* ---- REFRESH IF NEEDED ---- */
    if (isTokenExpired(auth.spotify_expires_at)) {
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
          refresh_token: auth.spotify_refresh_token,
        }),
      });

      const data = await response.json();
      const newExpiresAt = Date.now() + data.expires_in * 1000;

      db.prepare(`
        UPDATE spotify_auth
        SET
          spotify_access_token = ?,
          spotify_refresh_token = ?,
          spotify_expires_at = ?
        WHERE id = ?
      `).run(
        data.access_token,
        data.refresh_token ?? auth.spotify_refresh_token,
        newExpiresAt,
        device.spotify_auth_id
      );

      auth = {
        spotify_access_token: data.access_token,
        spotify_refresh_token:
          data.refresh_token ?? auth.spotify_refresh_token,
        spotify_expires_at: newExpiresAt,
      };
    }

    /* ---- PLAY PREVIOUS TRACK ---- */
    const prevRes = await fetch(
      "https://api.spotify.com/v1/me/player/previous",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.spotify_access_token}`,
        },
      }
    );

    if (!prevRes.ok) {
      const text = await prevRes.text();
      return res.status(prevRes.status).json({ error: text });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
