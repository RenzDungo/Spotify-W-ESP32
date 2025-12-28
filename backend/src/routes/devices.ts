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
-------------------- */
router.post("/register", (req, res) => {
  const { deviceUUID } = req.body;

  if (!deviceUUID) {
    return res.status(400).json({ error: "Missing deviceUUID" });
  }

  try {
    db.prepare(`
      INSERT INTO devices (device_uuid)
      VALUES (?)
    `).run(deviceUUID);

    res.json({ success: true });
  } catch {
    res.status(409).json({ error: "Device already registered" });
  }
});

/* --------------------
   VERIFY DEVICE
-------------------- */
router.post("/verify", (req, res) => {
  const { deviceUUID } = req.body;

  if (!deviceUUID) {
    return res.status(400).json({ error: "Missing deviceUUID" });
  }

  const device = db
    .prepare(`SELECT * FROM devices WHERE device_uuid = ?`)
    .get(deviceUUID) as Device | undefined;

  if (!device) {
    return res.status(401).json({ valid: false });
  }

  res.json({
    valid: true,
    linkedToSpotify: device.spotify_auth_id !== null
  });
});

export default router;
