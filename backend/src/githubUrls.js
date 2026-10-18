// Adresses de GitHub pour OAuth, lues dans la configuration.
//
// GITHUB_OAUTH_URL : site qui sert /login/oauth/authorize et
// /login/oauth/access_token (https://github.com par défaut).
// GITHUB_API_URL : API qui sert /user et /user/emails
// (https://api.github.com par défaut).
// GITHUB_ALLOWED_HOSTS : hôtes GitHub Enterprise acceptés en plus de
// github.com et api.github.com, séparés par des virgules (P7-G2).
//
// Elles servent à GitHub Enterprise et au faux fournisseur des tests E2E.
// Toujours en https vers un hôte de la liste, sauf hors production vers une
// adresse de bouclage (localhost, 127.0.0.1, ::1) : un jeton GitHub ne part
// jamais en clair sur le réseau, ni vers un hôte que l'exploitant n'a pas
// nommé. Les appels passent par githubFetch : aucune redirection suivie
// (une 307 renverrait client_secret ailleurs, P7-G1) et un délai (P7-G3).

export const DEFAULT_GITHUB_OAUTH_URL = "https://github.com";
export const DEFAULT_GITHUB_API_URL = "https://api.github.com";
export const DEFAULT_GITHUB_HOSTS = ["github.com", "api.github.com"];
export const GITHUB_FETCH_TIMEOUT_MS = 10000;

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];
// nom d'hôte DNS, avec un port éventuel
const HOST_ENTRY = /^(?=.{1,253}(?::|$))[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::[0-9]{1,5})?$/;

// hôtes acceptés (host au sens URL : nom et port éventuel) ; null si la liste est invalide
function allowedHosts() {
  const raw = process.env.GITHUB_ALLOWED_HOSTS;
  const hosts = DEFAULT_GITHUB_HOSTS.slice();
  if (raw === undefined || raw.trim() === "") {
    return hosts;
  }
  const entries = raw.split(",");
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i].trim().toLowerCase();
    if (!HOST_ENTRY.test(entry)) {
      return null;
    }
    hosts.push(entry);
  }
  return hosts;
}

function hostAllowed(url, production) {
  if (!production && LOOPBACK.indexOf(url.hostname) !== -1) {
    return true;
  }
  const hosts = allowedHosts();
  return hosts !== null && hosts.indexOf(url.host) !== -1;
}

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
  if (!hostAllowed(url, production)) {
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
  if (allowedHosts() === null) {
    throw new Error("GITHUB_ALLOWED_HOSTS doit lister des noms d'hôte séparés par des virgules (port permis)");
  }
  const names = ["GITHUB_OAUTH_URL", "GITHUB_API_URL"];
  for (let i = 0; i < names.length; i++) {
    const raw = process.env[names[i]];
    if (raw !== undefined && raw !== "" && parseGithubBase(raw, isProduction()) === null) {
      throw new Error(
        names[i] +
          " doit être une URL https vers github.com, api.github.com ou un hôte de GITHUB_ALLOWED_HOSTS" +
          " (http seulement vers localhost, 127.0.0.1 ou ::1 hors production)"
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

// fetch vers GitHub : hôte revérifié, aucune redirection suivie, délai borné.
// options.timeoutMs ne sert qu'aux tests.
export async function githubFetch(target, options) {
  const opts = Object.assign({}, options || {});
  const timeoutMs = opts.timeoutMs || GITHUB_FETCH_TIMEOUT_MS;
  delete opts.timeoutMs;
  const url = new URL(target);
  if (parseGithubBase(url.origin, isProduction()) === null) {
    throw new Error("hôte GitHub refusé : " + url.host);
  }
  opts.redirect = "manual";
  opts.signal = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, opts);
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    throw new Error("GitHub a répondu par une redirection (" + res.status + "), non suivie");
  }
  return res;
}
