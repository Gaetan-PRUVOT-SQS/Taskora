// Client HTTP du front.
// La session vit dans des cookies HttpOnly posés par l'API : le front ne voit
// jamais le jeton et n'en stocke aucun. Les requêtes qui modifient des données
// renvoient le jeton CSRF (cookie lisible) dans l'en-tête X-CSRF-Token.

const CSRF_COOKIE = "__Host-taskora_csrf";
const CSRF_HEADER = "X-CSRF-Token";
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
// routes où un 401 ne doit pas déclencher de rafraîchissement ; le logout
// marche sans jeton d'accès valide, il n'a jamais besoin d'un refresh avant
const NO_REFRESH = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
];

// ancien stockage du jeton, effacé s'il traîne encore dans le navigateur
try {
  window.localStorage.removeItem("taskora_token");
} catch (err) {
  // stockage indisponible, rien à nettoyer
}

export function readCsrfCookie() {
  const parts = document.cookie ? document.cookie.split(";") : [];
  for (let i = 0; i < parts.length; i++) {
    const item = parts[i].trim();
    if (item.startsWith(CSRF_COOKIE + "=")) {
      return decodeURIComponent(item.slice(CSRF_COOKIE.length + 1));
    }
  }
  return "";
}

let csrfLoading = null;

export async function ensureCsrf() {
  const existing = readCsrfCookie();
  if (existing) {
    return existing;
  }
  if (!csrfLoading) {
    csrfLoading = fetch("/api/auth/csrf", { credentials: "same-origin" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        return readCsrfCookie() || (data && data.csrf_token) || "";
      })
      .finally(function () {
        csrfLoading = null;
      });
  }
  return csrfLoading;
}

// fetch avec les cookies de session et le jeton CSRF si besoin
export async function authFetch(path, init) {
  const opts = Object.assign({}, init || {});
  const method = (opts.method || "GET").toUpperCase();
  const headers = Object.assign({}, opts.headers || {});
  if (SAFE_METHODS.indexOf(method) === -1) {
    const csrf = await ensureCsrf();
    if (csrf) {
      headers[CSRF_HEADER] = csrf;
    }
  }
  opts.method = method;
  opts.headers = headers;
  opts.credentials = "same-origin";
  return fetch(path, opts);
}

let refreshing = null;

export async function refreshSession() {
  if (!refreshing) {
    refreshing = authFetch("/api/auth/refresh", { method: "POST" })
      .then(function (res) {
        return res.ok;
      })
      .catch(function () {
        return false;
      })
      .finally(function () {
        refreshing = null;
      });
  }
  return refreshing;
}

// comme authFetch, mais retente une fois après un 401 si la session se renouvelle
export async function sessionFetch(path, init) {
  let res = await authFetch(path, init);
  if (res.status === 401 && NO_REFRESH.indexOf(path) === -1) {
    const renewed = await refreshSession();
    if (renewed) {
      res = await authFetch(path, init);
    }
  }
  return res;
}

export async function apiRequest(path, options) {
  const opts = options || {};
  const headers = Object.assign({}, opts.headers || {});

  let body = undefined;
  // Content-Type JSON seulement s'il y a un body
  // (sinon DELETE échoue avec Fastify : body vide + application/json)
  if (opts.body !== undefined && opts.body !== null) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await sessionFetch(path, {
    method: opts.method || "GET",
    headers: headers,
    body: body,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = null;
    }
  }
  if (!res.ok) {
    const message = data && data.error ? data.error : "Erreur réseau";
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}
