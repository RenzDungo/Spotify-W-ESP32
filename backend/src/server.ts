import express from "express";
import cors from "cors";
import http from "http";

import "./db";
import devicesRouter from "./routes/devices";
import spotifyRouter from "./routes/spotify";
import dotenv from "dotenv";
dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
import session from "express-session";
app.use(
  cors({
    origin: "https://spotify.balloonhubgaming.com",
    credentials: true,
  })
);
app.use(
  session({
    name: "spotify.sid",
    secret: "spotify-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "none",   // IMPORTANT
      secure: true,    // true ONLY if https
    },
  })
);

app.use("/api/devices", devicesRouter);
app.use("/api/spotify", spotifyRouter);

const server = http.createServer(app);

const PORT = 3500;
const HOST = "0.0.0.0"; // 👈 expose to LAN

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
