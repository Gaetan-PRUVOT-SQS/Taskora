// Lecture et contrôle du secret JWT.
// Pas de valeur par défaut : si JWT_SECRET manque ou paraît faible, on refuse
// de signer ou de vérifier quoi que ce soit, et le serveur ne démarre pas.

// 32 octets aléatoires encodés en base64 donnent 43 caractères (sans padding)
export const MIN_SECRET_LENGTH = 43;
export const MIN_SECRET_BITS = 256;
const MIN_DISTINCT_CHARS = 12;

// commande d'aide affichée quand le secret manque : elle génère un secret,
// elle n'en contient aucun
// nosemgrep: ajinabraham.njsscan.generic.hardcoded_secrets.node_secret
export const SECRET_GENERATION_HINT =
  "node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"";

// valeurs déjà publiées dans le dépôt (anciens défauts, CI, tests)
const KNOWN_PUBLIC_SECRETS = [
  "dev-secret-change-me",
  "change-me-in-production",
  "taskora-secret",
  "test-secret",
  "ci-test-secret",
  "e2e-secret",
];

// morceaux typiques d'une valeur d'exemple recopiée telle quelle
const PLACEHOLDER_MARKERS = [
  "change-me",
  "changeme",
  "change_me",
  "replace-with",
  "replace_with",
  "replace-me",
  "replaceme",
  "placeholder",
  "example",
  "your-secret",
  "your_secret",
  "yoursecret",
  "dev-secret",
  "test-secret",
  "taskora-secret",
  "generate-",
];

function bitsPerChar(value) {
  if (/^[0-9a-fA-F]+$/.test(value)) {
    return 4;
  }
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    return 6;
  }
  // ASCII imprimable
  return Math.log2(95);
}

function isRepeatedPattern(value) {
  return /^(.+?)\1+$/s.test(value);
}

// part des caractères qui suivent leur voisin dans l'ordre (abcd..., 1234...)
function sequentialRatio(value) {
  let sequential = 0;
  for (let i = 1; i < value.length; i++) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (diff === 1 || diff === -1 || diff === 0) {
      sequential = sequential + 1;
    }
  }
  return sequential / Math.max(1, value.length - 1);
}

// Retourne { ok: true } ou { ok: false, reason }
export function checkJwtSecret(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: false, reason: "JWT_SECRET n'est pas défini" };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: "JWT_SECRET doit être une chaîne" };
  }
  if (/\s/.test(value)) {
    return {
      ok: false,
      reason: "JWT_SECRET contient des espaces ou des retours à la ligne",
    };
  }

  const lower = value.toLowerCase();
  if (KNOWN_PUBLIC_SECRETS.indexOf(lower) !== -1) {
    return { ok: false, reason: "JWT_SECRET est une valeur publique connue" };
  }
  for (let i = 0; i < PLACEHOLDER_MARKERS.length; i++) {
    if (lower.indexOf(PLACEHOLDER_MARKERS[i]) !== -1) {
      return {
        ok: false,
        reason: "JWT_SECRET ressemble à une valeur d'exemple",
      };
    }
  }

  if (value.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      reason:
        "JWT_SECRET est trop court (" +
        value.length +
        " caractères, minimum " +
        MIN_SECRET_LENGTH +
        ")",
    };
  }

  const payload = value.replace(/=+$/, "");
  const estimatedBits = Math.floor(payload.length * bitsPerChar(payload));
  if (estimatedBits < MIN_SECRET_BITS) {
    return {
      ok: false,
      reason:
        "JWT_SECRET n'apporte pas assez d'aléa (environ " +
        estimatedBits +
        " bits, minimum " +
        MIN_SECRET_BITS +
        ")",
    };
  }

  const counts = {};
  let distinct = 0;
  let maxCount = 0;
  for (let i = 0; i < payload.length; i++) {
    const c = payload[i];
    if (!counts[c]) {
      counts[c] = 0;
      distinct = distinct + 1;
    }
    counts[c] = counts[c] + 1;
    if (counts[c] > maxCount) {
      maxCount = counts[c];
    }
  }
  if (
    distinct < MIN_DISTINCT_CHARS ||
    maxCount / payload.length > 0.25 ||
    isRepeatedPattern(payload) ||
    sequentialRatio(payload) > 0.5
  ) {
    return {
      ok: false,
      reason: "JWT_SECRET n'a pas l'air aléatoire (motif répété ou trop peu varié)",
    };
  }

  return { ok: true };
}

let lastValidated = null;

// Renvoie le secret ou lève une erreur. Appelé à chaque signature et vérification.
export function readJwtSecret() {
  const value = process.env.JWT_SECRET;
  if (lastValidated !== null && value === lastValidated) {
    return value;
  }
  const result = checkJwtSecret(value);
  if (!result.ok) {
    lastValidated = null;
    const err = new Error(
      result.reason +
        ". Définis un secret d'au moins 32 octets aléatoires, par exemple avec : " +
        SECRET_GENERATION_HINT
    );
    err.code = "TASKORA_WEAK_JWT_SECRET";
    throw err;
  }
  lastValidated = value;
  return value;
}
