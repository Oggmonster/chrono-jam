import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("host/lobby/:roomId", "routes/host-lobby.tsx"),
  route("play/game/:roomId", "routes/play-guess.tsx"),
  route("play/timeline/:roomId", "routes/play-timeline.tsx"),
  route("results/:roomId", "routes/results.tsx"),
] satisfies RouteConfig;
