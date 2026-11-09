import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard lives in src/dashboard. In dev, Vite proxies /api/ and /site/
// to the Express server so the React app can talk to it on one origin. The keys
// are regexes anchored on the trailing slash so that dashboard modules such as
// /client.ts are never mistaken for API routes.
export default defineConfig({
  root: "src/dashboard",
  plugins: [react()],
  build: { outDir: "../../dist/dashboard", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "^/api/": { target: "http://localhost:8787", changeOrigin: true },
      "^/site/": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
