import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
      },
    },
  },
  envPrefix: ["VITE_"],
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: "hidden",
    rollupOptions: {
      output: {
          manualChunks(id: string) {
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
              return "vendor";
            }
            if (id.includes("node_modules/@tanstack/react-query")) {
              return "query";
            }
          },
        },
    },
  },
  esbuild: {
    drop: ["debugger"],
    pure: ["console.debug", "console.log"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
