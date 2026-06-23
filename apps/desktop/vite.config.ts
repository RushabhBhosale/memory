import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  root: "src/renderer",
  plugins: [react()],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "@renderer": path.resolve(__dirname, "src/renderer/src")
    }
  }
});
