import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "..", "database.sqlite");
export const db = new Database(dbPath);

// Enforce constraints
db.pragma("foreign_keys = ON");

/* --------------------
   SPOTIFY AUTH TABLE
   (Account-level OAuth)
-------------------- */
db.prepare(`
  CREATE TABLE IF NOT EXISTS spotify_auth (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spotify_access_token TEXT,
    spotify_refresh_token TEXT,
    spotify_expires_at INTEGER
  )
`).run();

/* --------------------
   DEVICES TABLE
   (ESP32 hardware only)
-------------------- */
db.prepare(`
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_uuid TEXT UNIQUE NOT NULL,
    spotify_auth_id INTEGER,
    FOREIGN KEY (spotify_auth_id)
      REFERENCES spotify_auth(id)
      ON DELETE SET NULL
  )
`).run();

console.log("✅ Database initialized (devices + spotify_auth)");
