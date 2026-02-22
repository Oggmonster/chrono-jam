import { redirect } from "react-router";
import type { Route } from "./+types/host-setup";

import { generateRoomCode, normalizeRoomCode } from "~/lib/room-code";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Host Lobby" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const room = normalizeRoomCode(url.searchParams.get("room") ?? "") || generateRoomCode();
  const target = new URL(`/host/lobby/${room}`, request.url);

  for (const key of ["spotify_access_token", "spotify_expires_in", "spotify_scope", "spotify_error"]) {
    const value = url.searchParams.get(key);
    if (value) {
      target.searchParams.set(key, value);
    }
  }

  return redirect(target.toString());
}

export default function HostSetupRedirect() {
  return null;
}
