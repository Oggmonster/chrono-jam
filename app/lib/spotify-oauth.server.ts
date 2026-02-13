const spotifyScopes = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
];

export const spotifyStateCookieName = "chronojam_spotify_state";
export const spotifyRefreshCookieName = "chronojam_spotify_refresh";

function getRequiredEnv(name: "SPOTIFY_CLIENT_ID" | "SPOTIFY_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSpotifyClientId() {
  return getRequiredEnv("SPOTIFY_CLIENT_ID");
}

export function getSpotifyClientSecret() {
  return getRequiredEnv("SPOTIFY_CLIENT_SECRET");
}

function getPublicProtocol(request: Request, host: string) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https" ? "https" : "http";
  }

  const cfVisitor = request.headers.get("cf-visitor");
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor) as { scheme?: string };
      if (parsed.scheme === "https") {
        return "https";
      }
    } catch {
      // Ignore malformed header values.
    }
  }

  if (host.endsWith(".trycloudflare.com")) {
    return "https";
  }

  const fromUrl = new URL(request.url).protocol.replace(":", "");
  return fromUrl === "https" ? "https" : "http";
}

function getPublicOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const host = forwardedHost ?? hostHeader ?? url.host;
  const protocol = getPublicProtocol(request, host);

  return `${protocol}://${host}`;
}

export function getSpotifyRedirectUri(request: Request) {
  const configured = process.env.SPOTIFY_REDIRECT_URI;
  if (configured) {
    return configured;
  }

  const origin = getPublicOrigin(request);
  return `${origin}/auth/spotify/callback`;
}

export function getSpotifyScopeParam() {
  return spotifyScopes.join(" ");
}

export function randomState(size = 16) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseCookieValue(cookieHeader: string | null, key: string) {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(";").map((part) => part.trim());
  for (const pair of pairs) {
    const [cookieKey, ...rest] = pair.split("=");
    if (cookieKey === key) {
      return rest.join("=");
    }
  }

  return null;
}

export function buildStateCookie(name: string, value: string, request: Request, maxAgeSeconds = 600) {
  const protocol = getPublicProtocol(request, new URL(request.url).host);
  const securePart = protocol === "https" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${securePart}`;
}

export function clearStateCookie(name: string, request: Request) {
  return buildStateCookie(name, "", request, 0);
}

export function buildRefreshCookie(value: string, request: Request, maxAgeSeconds = 60 * 60 * 24 * 30) {
  return buildStateCookie(spotifyRefreshCookieName, encodeURIComponent(value), request, maxAgeSeconds);
}

export function clearRefreshCookie(request: Request) {
  return clearStateCookie(spotifyRefreshCookieName, request);
}
