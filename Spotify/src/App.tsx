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

  const API_BASE = "/api/spotify";

  /**
   * ============================
   * CHECK LOGIN STATUS
   * ============================
   */

  useEffect(() => {
    fetch(`${API_BASE}/status`, {
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
   * ACTIONS (FORM-SAFE)
   * ============================
   */

  const login = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = `${API_BASE}/login`;
  };

  const logout = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    await fetch(`${API_BASE}/logout`, {
      credentials: "include",
    });

    setLoggedIn(false);
    setTrack(null);
  };

  const fetchCurrentSong = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);

    const res = await fetch(`${API_BASE}/current-track`, {
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

          <button
            type="button"
            onClick={login}
            style={{ padding: "0.6rem 1rem" }}
          >
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
            <button
              type="button"
              onClick={fetchCurrentSong}
              style={{ padding: "0.6rem 1rem" }}
            >
              Get Current Song
            </button>

            <button
              type="button"
              onClick={logout}
              style={{ padding: "0.6rem 1rem", marginLeft: "1rem" }}
            >
              Logout
            </button>
          </div>

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
