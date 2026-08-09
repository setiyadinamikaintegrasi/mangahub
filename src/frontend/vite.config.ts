import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    proxy: {
      "/api": {
        target: "http://localhost:8200",
        changeOrigin: true,
      },
    },
  },
  // Vite needs to know about nested project root; src is under ./src.
  root: ".",
  build: {
    outDir: "dist",
  },
});
