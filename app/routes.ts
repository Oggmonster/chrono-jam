import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("auth/spotify/start", "routes/auth-spotify-start.tsx"),
  route("auth/spotify/callback", "routes/auth-spotify-callback.tsx"),
  route("auth/spotify/refresh", "routes/auth-spotify-refresh.tsx"),
  route("api/room/:roomId", "routes/api-room.tsx"),
  route("api/room/:roomId/events", "routes/api-room-events.tsx"),
  route("host/setup", "routes/host-setup.tsx"),
  route("host/lobby/:roomId", "routes/host-lobby.tsx"),
  route("host/game/:roomId", "routes/host-game.tsx"),
  route("play/join", "routes/play-join.tsx"),
  route("play/lobby/:roomId", "routes/play-lobby.tsx"),
  route("play/game/:roomId", "routes/play-game.tsx"),
  route("results/:roomId", "routes/results.tsx"),
] satisfies RouteConfig;
