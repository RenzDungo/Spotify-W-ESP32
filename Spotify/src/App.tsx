import { useEffect, useState } from "react";

/**
 * ============================
 * TYPES
 * ============================
 */

type SpotifyArtist = {
  name: string;
};

type SpotifyImage = {
  url: string;
};

type SpotifyAlbum = {
  images: SpotifyImage[];
};

type SpotifyTrackItem = {
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
};

type SpotifyCurrentTrack = {
  item?: SpotifyTrackItem;
  playing?: boolean;
};

/**
 * ============================
 * APP
 * ============================
 */

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [track, setTrack] = useState<SpotifyCurrentTrack | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 🔹 Device registration state
  const [deviceUUID, setDeviceUUID] = useState("");
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);

  const API_BASE = "https://spotify-api.balloonhubgaming.com/api";

  /**
   * ============================
   * CHECK LOGIN STATUS
   * ============================
   */

  useEffect(() => {
    fetch(`${API_BASE}/spotify/status`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        setLoggedIn(data.loggedIn);
        setLoading(false);
      })
      .catch(() => {
        setLoggedIn(false);
        setLoading(false);
      });
  }, []);

  /**
   * ============================
   * ACTIONS
   * ============================
   */

  const login = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    window.location.href = `${API_BASE}/spotify/login`;
  };

  const logout = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    await fetch(`${API_BASE}/spotify/logout`, {
      credentials: "include",
    });

    setLoggedIn(false);
    setTrack(null);
  };

  const fetchCurrentSong = async () => {
    setError(null);

    const res = await fetch(`${API_BASE}/spotify/current-track`, {
      credentials: "include",
    });

    if (res.status === 401) {
      setLoggedIn(false);
      setTrack(null);
      return;
    }

    if (!res.ok) {
      setError("Failed to fetch current song");
      return;
    }

    const data = await res.json();
    setTrack(data);
  };

  /**
   * ============================
   * DEVICE REGISTRATION
   * ============================
   */

  const registerDevice = async () => {
    setDeviceStatus(null);

    // Basic UUID sanity check
    if (!deviceUUID || deviceUUID.length < 8) {
      setDeviceStatus("Invalid UUID");
      return;
    }

    setDeviceLoading(true);

    try {
      const res = await fetch(`${API_BASE}/devices/register`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uuid: deviceUUID }),
      });

      const data = await res.json();

      if (!res.ok) {
        setDeviceStatus(data.error || "Device registration failed");
        return;
      }

      setDeviceStatus("✅ Device successfully registered");
      setDeviceUUID("");
    } catch {
      setDeviceStatus("Network error while registering device");
    } finally {
      setDeviceLoading(false);
    }
  };

  /**
   * ============================
   * RENDER
   * ============================
   */

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "white" }}>
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "2rem",
        minHeight: "100vh",
        background: "#000",
        color: "white",
      }}
    >
      <h1>Spotify Status</h1>

      {/* ----------------------------
           LOGGED OUT
         ---------------------------- */}
      {!loggedIn && (
        <>
          <p>You are not logged in to Spotify.</p>

          <button onClick={login} style={{ padding: "0.6rem 1rem" }}>
            Login with Spotify
          </button>
        </>
      )}

      {/* ----------------------------
           LOGGED IN
         ---------------------------- */}
      {loggedIn && (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <button onClick={fetchCurrentSong} style={{ padding: "0.6rem 1rem" }}>
              Get Current Song
            </button>

            <button
              onClick={logout}
              style={{ padding: "0.6rem 1rem", marginLeft: "1rem" }}
            >
              Logout
            </button>
          </div>

          {/* ============================
              DEVICE REGISTRATION
             ============================ */}
          <div
            style={{
              marginTop: "2rem",
              padding: "1rem",
              border: "1px solid #333",
              maxWidth: "420px",
            }}
          >
            <h2>Register ESP32 Device</h2>

            <input
              type="text"
              placeholder="Device UUID"
              value={deviceUUID}
              onChange={(e) => setDeviceUUID(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem",
                marginBottom: "0.5rem",
              }}
            />

            <button
              onClick={registerDevice}
              disabled={deviceLoading}
              style={{ padding: "0.6rem 1rem" }}
            >
              {deviceLoading ? "Registering…" : "Register Device"}
            </button>

            {deviceStatus && (
              <p style={{ marginTop: "0.5rem" }}>{deviceStatus}</p>
            )}
          </div>

          {/* ============================
              CURRENT TRACK
             ============================ */}
          {error && <p style={{ color: "red" }}>{error}</p>}

          {track?.item ? (
            <div style={{ marginTop: "2rem" }}>
              <img
                src={track.item.album.images[0]?.url}
                alt="Album Art"
                width={200}
              />
              <h2>{track.item.name}</h2>
              <p>
                {track.item.artists.map((a) => a.name).join(", ")}
              </p>
            </div>
          ) : (
            <p style={{ opacity: 0.7 }}>No song currently playing.</p>
          )}
        </>
      )}
    </div>
  );
}

export default App;
