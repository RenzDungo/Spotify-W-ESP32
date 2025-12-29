import "express-session";

declare module "express-session" {
  interface SessionData {
    spotify?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      spotifyAuthId: number;
    };
  }
}
