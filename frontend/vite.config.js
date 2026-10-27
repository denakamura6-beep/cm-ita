import { defineConfig } from "vite";
// In development, "/api" and "/uploads" (pictures) are forwarded to the backend.
export default defineConfig({
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
