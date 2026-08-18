import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const reactDomDir = dirname(require.resolve("react-dom/package.json"));
const reactPeerDir = resolve(reactDomDir, "../react");

export default defineConfig({
  plugins: [react()],
  test: {
    root: __dirname,
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      react: reactPeerDir,
    },
    dedupe: ["react", "react-dom"],
  },
});
