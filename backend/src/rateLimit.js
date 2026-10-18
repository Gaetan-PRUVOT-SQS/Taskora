import rateLimit from "@fastify/rate-limit";

// valeurs par défaut, gardées même si la variable d'environnement est invalide
export const RATE_LIMIT_DEFAULT = 300;
export const AUTH_RATE_LIMIT_DEFAULT = 30;

function positiveInt(raw, fallback) {
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) {
    return n;
  }
  return fallback;
}

export function globalRateLimitMax() {
  return positiveInt(process.env.RATE_LIMIT_MAX, RATE_LIMIT_DEFAULT);
}

// limite par minute et par adresse sur les routes d'authentification
export function authRateLimitMax() {
  return positiveInt(process.env.AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_DEFAULT);
}

export async function registerRateLimit(app) {
  await app.register(rateLimit, {
    global: true,
    max: globalRateLimitMax(),
    timeWindow: "1 minute",
  });
}
