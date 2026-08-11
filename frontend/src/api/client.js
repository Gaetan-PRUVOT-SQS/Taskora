export function getToken() {
  return localStorage.getItem("taskora_token");
}

export function setToken(token) {
  localStorage.setItem("taskora_token", token);
}

export function clearToken() {
  localStorage.removeItem("taskora_token");
}

export async function apiRequest(path, options) {
  const opts = options || {};
  const headers = Object.assign({}, opts.headers || {});
  const token = getToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  let body = undefined;
  // Content-Type JSON seulement s'il y a un body
  // (sinon DELETE échoue avec Fastify : body vide + application/json)
  if (opts.body !== undefined && opts.body !== null) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(path, {
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
