import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(frontendDir, "..");
const require = createRequire(path.join(frontendDir, "package.json"));

// résout les packages npm depuis frontend/node_modules
// UNIQUEMENT pour les tests hors de frontend/ (sinon React casse en dev)
function resolveFromFrontend() {
  return {
    name: "resolve-from-frontend",
    enforce: "pre",
    resolveId: function (id, importer) {
      // en app normale, laisser Vite faire (interop ESM/CJS)
      if (!importer) {
        return null;
      }
      const fromTest =
        importer.indexOf("/test/") !== -1 ||
        importer.indexOf("\\test\\") !== -1;
      if (!fromTest) {
        return null;
      }
      if (id.startsWith("\0") || id.startsWith(".") || path.isAbsolute(id)) {
        return null;
      }
      if (id.startsWith("/")) {
        return null;
      }
      if (
        id === "vitest" ||
        id.startsWith("vitest/") ||
        id.startsWith("@vitest") ||
        id.startsWith("vite") ||
        id.startsWith("@vite")
      ) {
        return null;
      }
      try {
        return require.resolve(id);
      } catch (err) {
        return null;
      }
    },
  };
}

export default defineConfig({
  plugins: [resolveFromFrontend(), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
    fs: {
      allow: [monorepoRoot],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      path.join(monorepoRoot, "test/unit/frontend/**/*.{test,spec}.{js,jsx}"),
      path.join(
        monorepoRoot,
        "test/functional/frontend/**/*.{test,spec}.{js,jsx}"
      ),
    ],
  },
});
