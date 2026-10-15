import { defineConfig } from "vite";

// Interface web (app/) compilée dans dist/app et servie par server/index.ts.
// En développement : `npm run server` puis `npm run dev:ui` (proxy vers l'API).
export default defineConfig({
  root: "app",
  publicDir: "public",
  build: { outDir: "../dist/app", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4321",
      "/media": "http://127.0.0.1:4321",
      "/fonts": "http://127.0.0.1:4321",
    },
  },
});
