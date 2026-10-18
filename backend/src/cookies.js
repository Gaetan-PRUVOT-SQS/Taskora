// Lecture et écriture de cookies sans dépendance.
// Les valeurs posées par Taskora sont en base64url ou JWT, donc sans
// caractère à échapper.

// Les noms viennent du client : ils vont dans une Map, jamais en propriété
// d'objet (un cookie « toString » ou « __proto__ » reste un cookie ordinaire)
export function cookieMap(header) {
  const out = new Map();
  if (typeof header !== "string" || header === "") {
    return out;
  }
  const parts = header.split(";");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const eq = part.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
      value = value.slice(1, -1);
    }
    // premier cookie gagnant, comme les navigateurs l'envoient du plus précis au moins précis
    if (name && !out.has(name)) {
      try {
        out.set(name, decodeURIComponent(value));
      } catch (err) {
        out.set(name, value);
      }
    }
  }
  return out;
}

export function serializeCookie(name, value, options) {
  const opts = options || {};
  let text = name + "=" + encodeURIComponent(value);
  if (opts.maxAge !== undefined) {
    text += "; Max-Age=" + Math.floor(opts.maxAge);
  }
  text += "; Path=" + (opts.path || "/");
  if (opts.httpOnly) {
    text += "; HttpOnly";
  }
  if (opts.secure) {
    text += "; Secure";
  }
  if (opts.sameSite) {
    text += "; SameSite=" + opts.sameSite;
  }
  return text;
}

// ajoute un Set-Cookie sans écraser ceux déjà posés sur la réponse : Fastify
// ajoute lui-même chaque valeur de set-cookie à la liste existante, la relire
// et la renvoyer en entier dupliquait les cookies (Cybersec I-01)
export function appendSetCookie(reply, cookie) {
  reply.header("set-cookie", cookie);
}

export function getCookie(request, name) {
  return cookieMap(request.headers.cookie).get(name);
}
