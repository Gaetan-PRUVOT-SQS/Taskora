// Lecture et écriture de cookies sans dépendance.
// Les valeurs posées par Taskora sont en base64url ou JWT, donc sans
// caractère à échapper.

export function parseCookies(header) {
  const out = {};
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
    if (name && !(name in out)) {
      try {
        out[name] = decodeURIComponent(value);
      } catch (err) {
        out[name] = value;
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

// ajoute un Set-Cookie sans écraser ceux déjà posés sur la réponse
export function appendSetCookie(reply, cookie) {
  const current = reply.getHeader("set-cookie");
  let list = [];
  if (Array.isArray(current)) {
    list = current.slice();
  } else if (typeof current === "string") {
    list = [current];
  }
  list.push(cookie);
  reply.header("set-cookie", list);
}

export function getCookie(request, name) {
  return parseCookies(request.headers.cookie)[name];
}
