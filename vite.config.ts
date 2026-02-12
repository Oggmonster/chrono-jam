import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    allowedHosts: ["localhost", "127.0.0.1", ".trycloudflare.com"],
  },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
});
