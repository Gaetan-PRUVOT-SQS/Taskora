// Secret JWT des tests : tiré au hasard à chaque lancement, jamais versionné.
import crypto from "node:crypto";

export function generateJwtSecret() {
  return crypto.randomBytes(48).toString("base64");
}

export function useTestJwtSecret() {
  if (!process.env.TASKORA_TEST_JWT_SECRET) {
    process.env.TASKORA_TEST_JWT_SECRET = generateJwtSecret();
  }
  process.env.JWT_SECRET = process.env.TASKORA_TEST_JWT_SECRET;
  return process.env.JWT_SECRET;
}
