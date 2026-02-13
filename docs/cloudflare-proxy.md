# Cloudflare Proxy (Terminal)

Use this when you need an HTTPS public URL for local development on port `5174` (for Spotify OAuth callback).

## 1. Install `cloudflared` (Windows, one-time)

PowerShell:

```powershell
winget install --id Cloudflare.cloudflared
```

Verify:

```powershell
cloudflared --version
```

## 2. Start the app on port 5174

From project root:

```powershell
npm run dev
```

## 3. Start Cloudflare tunnel in another terminal

```powershell
cloudflared tunnel --url http://localhost:5174
```

Cloudflare will print a URL like:

`https://<random-name>.trycloudflare.com`

Keep this terminal running.

## 4. Spotify redirect URI

In Spotify Developer Dashboard, add:

`https://<random-name>.trycloudflare.com/auth/spotify/callback`

Important:

1. `trycloudflare.com` URLs are temporary and usually change when you restart the tunnel.
2. If the URL changes, update Spotify redirect URI again.
3. Then reconnect from `/host/setup`.

## 5. Quick troubleshoot

If Vite blocks the host, make sure `vite.config.ts` allows Cloudflare hosts (`.trycloudflare.com`) and restart `npm run dev`.
