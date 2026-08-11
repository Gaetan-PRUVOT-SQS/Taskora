// Réexporte les deps backend pour les tests hors de backend/
// (Node ESM résout les packages depuis le fichier importateur)
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendPkg = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../backend/package.json"
);
const require = createRequire(backendPkg);

export const WebSocket = require("ws");
export const jwt = require("jsonwebtoken");
