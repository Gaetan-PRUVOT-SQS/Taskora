// Adresses de GitHub pour OAuth, lues dans la configuration.
//
// GITHUB_OAUTH_URL : site qui sert /login/oauth/authorize et
// /login/oauth/access_token (https://github.com par défaut).
// GITHUB_API_URL : API qui sert /user et /user/emails
// (https://api.github.com par défaut).
//
// Elles servent à GitHub Enterprise et au faux fournisseur des tests E2E.
// Toujours en https, sauf hors production vers une adresse de bouclage
// (localhost, 127.0.0.1, ::1) : un jeton GitHub ne part jamais en clair
// sur le réseau.

export const DEFAULT_GITHUB_OAUTH_URL = "https://github.com";
export const DEFAULT_GITHUB_API_URL = "https://api.github.com";

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

// URL de base sans barre finale ; null si refusée
function parseGithubBase(raw, production) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch (err) {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    return null;
  }
  const loopbackHttp = !production && url.protocol === "http:" && LOOPBACK.indexOf(url.hostname) !== -1;
  if (url.protocol !== "https:" && !loopbackHttp) {
    return null;
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function readBase(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const base = parseGithubBase(raw, isProduction());
  if (base === null) {
    // le démarrage l'a déjà refusé : jamais de repli silencieux
    throw new Error(name + " invalide");
  }
  return base;
}

// Lève une erreur si la configuration ne convient pas (appelé au démarrage)
export function checkGithubUrls() {
  const names = ["GITHUB_OAUTH_URL", "GITHUB_API_URL"];
  for (let i = 0; i < names.length; i++) {
    const raw = process.env[names[i]];
    if (raw !== undefined && raw !== "" && parseGithubBase(raw, isProduction()) === null) {
      throw new Error(
        names[i] + " doit être une URL https (http seulement vers localhost, 127.0.0.1 ou ::1 hors production)"
      );
    }
  }
}

export function githubOauthUrl() {
  return readBase("GITHUB_OAUTH_URL", DEFAULT_GITHUB_OAUTH_URL);
}

export function githubApiUrl() {
  return readBase("GITHUB_API_URL", DEFAULT_GITHUB_API_URL);
}
