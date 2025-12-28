import express from "express";
import dotenv from "dotenv";
dotenv.config();
const router = express.Router();

/**
 * ============================
 * CONFIG
 * ============================
 */

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REDIRECT_URI = "http://127.0.0.1:5500/api/spotify/callback";


if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("Missing Spotify client credentials");
}

const SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
].join(" ");

/**
 * ============================
 * HELPERS
 * ============================
 */

function isTokenExpired(expiresAt: number) {
  return Date.now() >= expiresAt;
}

async function refreshAccessToken(refreshToken: string) {
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

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
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

router.get("/callback", async (req, res) => {
  const code = req.query.code as string;

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

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

  if (!response.ok) {
    return res.status(500).json(data);
  }

  req.session.spotify = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  res.redirect("/");

});

router.get("/current-track", async (req, res) => {
  const spotify = req.session.spotify;

  if (!spotify) {
    return res.status(401).json({ error: "Not logged in" });
  }

  if (isTokenExpired(spotify.expiresAt)) {
    const refreshed = await refreshAccessToken(spotify.refreshToken);
    spotify.accessToken = refreshed.accessToken;
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

  res.json(await response.json());
});

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

export default router;
