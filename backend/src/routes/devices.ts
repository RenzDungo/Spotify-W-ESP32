import { Router } from "express";
import { db } from "../db";

const router = Router();

/* --------------------
   TYPES
-------------------- */
interface Device {
  id: number;
  device_uuid: string;
  spotify_auth_id: number | null;
}

/* --------------------
   REGISTER DEVICE
   (REQUIRES SPOTIFY LOGIN)
-------------------- */
router.post("/register", (req, res) => {
  const { uuid } = req.body;

  // 1️⃣ Validate UUID
  if (!uuid) {
    return res.status(400).json({ error: "Missing uuid" });
  }

  // 2️⃣ Validate Spotify session
  const spotifyAuthId = req.session?.spotify?.spotifyAuthId;

  if (!spotifyAuthId) {
    return res.status(401).json({
      error: "Not authenticated with Spotify",
    });
  }

  try {
    // 3️⃣ Insert device bound to Spotify account
    db.prepare(`
      INSERT INTO devices (device_uuid, spotify_auth_id)
      VALUES (?, ?)
    `).run(uuid, spotifyAuthId);

    res.json({ success: true });
  } catch (err: any) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "Device UUID already registered",
      });
    }

    console.error("Device register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* --------------------
   VERIFY DEVICE
   (ESP32 SAFE)
-------------------- */
router.post("/verify", (req, res) => {
  const { uuid } = req.body;

  if (!uuid) {
    return res.status(400).json({ error: "Missing uuid" });
  }

  const device = db
    .prepare(`SELECT * FROM devices WHERE device_uuid = ?`)
    .get(uuid) as Device | undefined;

  if (!device) {
    return res.status(401).json({ valid: false });
  }

  res.json({
    valid: true,
    linkedToSpotify: device.spotify_auth_id !== null,
    spotify_auth_id: device.spotify_auth_id, // optional, useful for debugging
  });
});

export default router;
