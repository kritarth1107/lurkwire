import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    base: "./",
    worker: {
      format: "es",
    },
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
      },
    },
    plugins: [
      react(),
      {
        name: "lurkwire-file-protocol",
        transformIndexHtml(html) {
          // file:// loads in the packaged app cannot CORS-fetch classic
          // crossorigin module/script tags, so React never mounts.
          return html.replace(/\scrossorigin(="[^"]*")?/g, "");
        },
      },
    ],
  },
});
