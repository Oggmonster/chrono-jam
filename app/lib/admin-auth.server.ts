import { buildStateCookie, parseCookieValue } from "~/lib/spotify-oauth.server";

const adminAuthCookieName = "chronojam_admin_auth";
const authCookieValue = "1";
const authCookieTtlSeconds = 60 * 60 * 12;

export function isAdminPasswordConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD?.trim());
}

export function getAdminPassword() {
  const value = process.env.ADMIN_PASSWORD?.trim();
  if (!value) {
    throw new Error("Missing ADMIN_PASSWORD environment variable.");
  }
  return value;
}

export function isAdminAuthenticated(request: Request) {
  const cookieValue = parseCookieValue(request.headers.get("Cookie"), adminAuthCookieName);
  return cookieValue === authCookieValue;
}

export function buildAdminAuthCookie(request: Request, authenticated: boolean) {
  return buildStateCookie(
    adminAuthCookieName,
    authenticated ? authCookieValue : "",
    request,
    authenticated ? authCookieTtlSeconds : 0,
  );
}

