// Préchargé dans le seul processus API des tests E2E (node --import).
// Redirige les appels fetch vers github.com et api.github.com sur le faux
// fournisseur local de fake-github.mjs. Toute autre adresse passe telle quelle.
// Refuse de se charger en production ou vers une adresse qui n'est pas locale.
const target = process.env.TASKORA_FAKE_GITHUB_URL;

if (process.env.NODE_ENV === "production") {
  throw new Error("fake-github-fetch is a test helper and must not run in production");
}
if (!target) {
  throw new Error("fake-github-fetch needs TASKORA_FAKE_GITHUB_URL");
}
const base = new URL(target);
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1") {
  throw new Error("fake-github-fetch only targets http://127.0.0.1, got " + target);
}

const realFetch = globalThis.fetch;

globalThis.fetch = function (input, init) {
  const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const url = new URL(raw);
  if (url.protocol === "https:" && url.hostname === "github.com") {
    return realFetch(base.origin + url.pathname + url.search, init);
  }
  if (url.protocol === "https:" && url.hostname === "api.github.com") {
    return realFetch(base.origin + "/api" + url.pathname + url.search, init);
  }
  return realFetch(input, init);
};
