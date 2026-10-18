// Adresses publiques de l'instance, toujours lues dans la configuration et
// jamais déduites de l'en-tête Host, que le client choisit.
//
// BACKEND_URL : adresse publique de l'API (avec le nginx fourni, celle du
// site). Elle donne le redirect_uri OAuth et fait partie des origines de
// confiance. Obligatoire et en https quand NODE_ENV=production.
// FRONTEND_URL : adresse du front, BACKEND_URL par défaut en production.
// TRUSTED_ORIGINS : autres origines autorisées à écrire avec la session.
//
// Hors production, les valeurs par défaut sont celles du poste de dev
// (API sur localhost:3001, Vite sur localhost:5173).

export const DEV_BACKEND_URL = "http://localhost:3001";
export const DEV_FRONTEND_URL = "http://localhost:5173";

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

// URL de base sans barre finale ; null si invalide
function parseBase(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch (err) {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    return null;
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function originOf(base) {
  return new URL(base).origin;
}

// Lève une erreur si la configuration ne convient pas (appelé au démarrage)
export function checkPublicUrls() {
  const names = ["BACKEND_URL", "FRONTEND_URL"];
  for (let i = 0; i < names.length; i++) {
    const raw = process.env[names[i]];
    if (raw !== undefined && raw !== "" && parseBase(raw) === null) {
      throw new Error(names[i] + " n'est pas une URL http ou https valide");
    }
  }
  if (!isProduction()) {
    return;
  }
  if (!process.env.BACKEND_URL) {
    throw new Error("BACKEND_URL est obligatoire en production (adresse publique, en https)");
  }
  for (let i = 0; i < names.length; i++) {
    const raw = process.env[names[i]];
    if (raw && parseBase(raw).indexOf("https://") !== 0) {
      throw new Error(names[i] + " doit être en https en production");
    }
  }
}

export function backendUrl() {
  if (process.env.BACKEND_URL) {
    const base = parseBase(process.env.BACKEND_URL);
    if (base) {
      return base;
    }
  }
  if (isProduction()) {
    // le démarrage l'a déjà refusé : on ne retombe jamais sur Host
    throw new Error("BACKEND_URL manquant ou invalide");
  }
  return DEV_BACKEND_URL;
}

export function frontendUrl() {
  if (process.env.FRONTEND_URL) {
    const base = parseBase(process.env.FRONTEND_URL);
    if (base) {
      return base;
    }
  }
  return isProduction() ? backendUrl() : DEV_FRONTEND_URL;
}

export function oauthRedirectUri() {
  return backendUrl() + "/api/auth/oauth/github/callback";
}

// origines comparées à l'en-tête Origin, à l'identique
export function trustedOrigins() {
  const list = [];
  function add(base) {
    if (base) {
      const origin = originOf(base);
      if (list.indexOf(origin) === -1) {
        list.push(origin);
      }
    }
  }
  const items = String(process.env.TRUSTED_ORIGINS || "").split(",");
  for (let i = 0; i < items.length; i++) {
    const item = items[i].trim();
    // le joker n'est jamais une origine de confiance
    if (item !== "" && item.indexOf("*") === -1) {
      add(parseBase(item));
    }
  }
  try {
    add(backendUrl());
    add(frontendUrl());
  } catch (err) {
    // production mal configurée : seules les origines listées passent
  }
  return list;
}
