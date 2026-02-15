Spotify’s **Web Playback SDK** is a browser-side JavaScript library that turns your web app into a **Spotify Connect device** (“a player”) so it can **stream audio in the browser** and be controlled like any other Spotify device.

## How it works (mental model)

1. **User authenticates (Spotify OAuth)**

   * You must obtain a **Spotify Web API access token** for a **Premium** user (Web Playback SDK requires Premium). ([developer.spotify.com][1])
   * The token needs scopes like:

     * `streaming`
     * `user-modify-playback-state`
     * (often also) `user-read-playback-state`

2. **Load the SDK script**

   * You include `https://sdk.scdn.co/spotify-player.js` (usually once). ([developer.spotify.com][2])
   * When it’s ready, it calls `window.onSpotifyWebPlaybackSDKReady`.

3. **Create a `Spotify.Player` instance**

   * You instantiate `new Spotify.Player({ name, getOAuthToken, volume })`. ([developer.spotify.com][3])
   * `getOAuthToken(cb)` is called by the SDK whenever it needs a fresh token (so you can rotate/refresh tokens).

4. **Connect = register as a Spotify Connect device**

   * `player.connect()` registers the browser player as an available device and returns success/failure. ([developer.spotify.com][3])
   * You listen for events like `ready` (gives you a `device_id`) and `not_ready`.

5. **Start playback via Spotify Web API**

   * The SDK streams audio, but **starting playback** is typically done via the Web API endpoint **Start/Resume Playback**:

     * `PUT /v1/me/player/play?device_id=...` with `{ uris: ["spotify:track:..."] }` ([developer.spotify.com][4])
   * This is also a good place to handle browser autoplay policies by tying playback to a user click.

---

## React example: play a single track

Below is a minimal component that:

* loads the SDK
* creates/connects a player
* captures `deviceId`
* plays **one track URI** when you click a button

> Assumption: you already have a valid `accessToken` string from your OAuth flow (PKCE recommended).

```jsx
import React, { useEffect, useMemo, useState } from "react";

function loadSpotifySDK() {
  return new Promise((resolve, reject) => {
    // If it already exists, resolve immediately
    if (window.Spotify) return resolve();

    // If script tag already added, wait for readiness callback
    if (document.getElementById("spotify-player-sdk")) {
      const prev = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        prev && prev();
        resolve();
      };
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => resolve();

    const script = document.createElement("script");
    script.id = "spotify-player-sdk";
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function playTrack({ token, deviceId, trackUri }) {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [trackUri] }),
    }
  );

  // 204 = success with no content
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Play failed: ${res.status} ${text}`);
  }
}

export default function SpotifyOneTrackPlayer({
  accessToken,
  trackUri = "spotify:track:11dFghVXANMlKmJXsNCbNl", // example track
}) {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState("idle");

  const canPlay = useMemo(() => Boolean(accessToken && deviceId), [accessToken, deviceId]);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    (async () => {
      setStatus("loading-sdk");
      await loadSpotifySDK();

      if (!isMounted) return;

      setStatus("creating-player");
      const p = new window.Spotify.Player({
        name: "My React Web Player",
        getOAuthToken: (cb) => cb(accessToken),
        volume: 0.8,
      });

      p.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id);
        setStatus("ready");
      });

      p.addListener("not_ready", ({ device_id }) => {
        if (device_id === deviceId) setDeviceId("");
        setStatus("not_ready");
      });

      p.addListener("initialization_error", ({ message }) => setStatus(`init_error: ${message}`));
      p.addListener("authentication_error", ({ message }) => setStatus(`auth_error: ${message}`));
      p.addListener("account_error", ({ message }) => setStatus(`account_error: ${message}`));
      p.addListener("playback_error", ({ message }) => setStatus(`playback_error: ${message}`));

      const connected = await p.connect();
      if (!connected) setStatus("connect_failed");

      setPlayer(p);
    })().catch((e) => setStatus(`error: ${e.message}`));

    return () => {
      isMounted = false;
      // Disconnect on unmount
      if (player) player.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 520 }}>
      <h3>Spotify Web Playback SDK (one track)</h3>
      <div>Status: {status}</div>
      <div>Device ID: {deviceId || "—"}</div>

      <button
        disabled={!canPlay}
        onClick={async () => {
          try {
            setStatus("starting-playback");
            await playTrack({ token: accessToken, deviceId, trackUri });
            setStatus("playing");
          } catch (e) {
            setStatus(`error: ${e.message}`);
          }
        }}
        style={{ marginTop: 12, padding: "8px 12px" }}
      >
        Play track
      </button>

      {player && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button onClick={() => player.pause()}>Pause</button>
          <button onClick={() => player.resume()}>Resume</button>
        </div>
      )}
    </div>
  );
}
```

### Notes / gotchas

* If clicking “Play track” does nothing, open Spotify (desktop/mobile) and ensure your browser device is selected, or explicitly call a **transfer playback** step before playing (some apps do this). The core “start playback” call is the Web API **Start/Resume Playback** endpoint shown above. ([developer.spotify.com][4])
* The SDK creates a Connect device and is initialized via `Spotify.Player(...)` and `player.connect()`. ([developer.spotify.com][3])
* Web Playback SDK requires **Spotify Premium**. ([developer.spotify.com][1])

If you tell me how you’re getting the token (PKCE auth code flow? an existing backend?), I can adapt the example to your exact setup (including refresh handling and recommended scopes).

[1]: https://developer.spotify.com/documentation/web-playback-sdk?utm_source=chatgpt.com "Web Playback SDK"
[2]: https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started?utm_source=chatgpt.com "Getting Started with Web Playback SDK"
[3]: https://developer.spotify.com/documentation/web-playback-sdk/reference?utm_source=chatgpt.com "Web Playback SDK Reference"
[4]: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback?utm_source=chatgpt.com "Start/Resume Playback"
