// Lecture des cookies de session dans une réponse inject().
// Les routes d'auth ne renvoient plus de jeton dans le corps.

export function setCookies(res) {
  const raw = res.headers["set-cookie"];
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

export function cookieValue(res, name) {
  const list = setCookies(res);
  let value;
  for (let i = 0; i < list.length; i++) {
    const first = list[i].split(";")[0];
    const eq = first.indexOf("=");
    if (first.slice(0, eq) === name) {
      value = decodeURIComponent(first.slice(eq + 1));
    }
  }
  return value;
}

export function cookieAttributes(res, name) {
  const list = setCookies(res);
  for (let i = list.length - 1; i >= 0; i--) {
    const parts = list[i].split(";").map(function (p) {
      return p.trim();
    });
    if (parts[0].startsWith(name + "=")) {
      return parts.slice(1);
    }
  }
  return null;
}

// jeton d'accès posé par login / register, pour les tests en Bearer
export function accessTokenOf(res) {
  return cookieValue(res, "__Host-taskora_at");
}

// en-tête Cookie à renvoyer, à partir des Set-Cookie d'une ou plusieurs réponses
export function cookieHeader(jar) {
  return Object.keys(jar)
    .filter(function (k) {
      return jar[k] !== "";
    })
    .map(function (k) {
      return k + "=" + encodeURIComponent(jar[k]);
    })
    .join("; ");
}

export function updateJar(jar, res) {
  const list = setCookies(res);
  for (let i = 0; i < list.length; i++) {
    const first = list[i].split(";")[0];
    const eq = first.indexOf("=");
    jar[first.slice(0, eq)] = decodeURIComponent(first.slice(eq + 1));
  }
  return jar;
}
