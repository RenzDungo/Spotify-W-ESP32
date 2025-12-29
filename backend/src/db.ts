import Database from "better-sqlite3";
import path from "path";

/**
 * ============================
 * DATABASE INIT
 * ============================
 */

const dbPath = path.join(__dirname, "..", "database.sqlite");
export const db = new Database(dbPath);

// Enforce FK constraints
db.pragma("foreign_keys = ON");

/**
 * ============================
 * SPOTIFY AUTH TABLE
 * (Account-level OAuth)
 * ============================
 */
db.prepare(`
  CREATE TABLE IF NOT EXISTS spotify_auth (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spotify_access_token TEXT NOT NULL,
    spotify_refresh_token TEXT NOT NULL,
    spotify_expires_at INTEGER NOT NULL
  )
`).run();

/**
 * ============================
 * DEVICES TABLE
 * (ESP32 hardware)
 * ============================
 */
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

/**
 * ============================
 * PREPARED STATEMENTS
 * ============================
 */

// Insert new Spotify auth record
export const insertSpotifyAuth = db.prepare(`
  INSERT INTO spotify_auth (
    spotify_access_token,
    spotify_refresh_token,
    spotify_expires_at
  )
  VALUES (?, ?, ?)
`);

// Update tokens for existing auth record
export const updateSpotifyTokens = db.prepare(`
  UPDATE spotify_auth
  SET
    spotify_access_token = ?,
    spotify_refresh_token = ?,
    spotify_expires_at = ?
  WHERE id = ?
`);

// Get auth record by ID
export const getSpotifyAuthById = db.prepare(`
  SELECT * FROM spotify_auth WHERE id = ?
`);

console.log("✅ Database initialized (devices + spotify_auth)");
