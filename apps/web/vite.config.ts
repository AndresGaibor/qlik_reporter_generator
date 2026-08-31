import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

const production = process.env.NODE_ENV === "production";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    host: production ? "127.0.0.1" : "localhost",
    port: 4525,
    strictPort: true,
    hmr: production
      ? { host: "localhost", port: 4525 }
      : { host: "localhost" },
    proxy: production
      ? {
          "/api": {
            target: "http://localhost:4523",
            changeOrigin: true,
          },
        }
      : undefined,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});
