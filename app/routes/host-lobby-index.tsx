import { redirect } from "react-router";
import type { Route } from "./+types/host-lobby-index";

import { generateRoomCode } from "~/lib/room-code";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const target = new URL(`/host/lobby/${generateRoomCode()}`, request.url);
  for (const [key, value] of url.searchParams.entries()) {
    target.searchParams.append(key, value);
  }

  return redirect(target.toString());
}

export default function HostLobbyIndex() {
  return null;
}
