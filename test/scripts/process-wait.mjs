// Attentes sur les processus lancés par les scripts E2E, sans délai fixe :
// on attend un événement (ligne de log, sortie) avec une durée maximale
// au-delà de laquelle le script échoue.

import { stripVTControlCharacters } from "node:util";

// résout quand la sortie du processus contient le motif, échoue si le
// processus s'arrête avant ou si timeoutMs est dépassé
export function waitForOutput(child, pattern, timeoutMs, name) {
  return new Promise(function (resolve, reject) {
    let seen = "";
    let timer = null;
    function cleanup() {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    }
    function onData(chunk) {
      seen = stripVTControlCharacters(seen + chunk.toString()).slice(-20000);
      if (pattern.test(seen)) {
        cleanup();
        resolve();
      }
    }
    function onExit(code) {
      cleanup();
      reject(new Error(name + " s'est arrêté avant d'être prêt (code " + code + ")"));
    }
    timer = setTimeout(function () {
      cleanup();
      reject(new Error(name + " pas prêt après " + timeoutMs + " ms"));
    }, timeoutMs);
    if (child.exitCode !== null) {
      onExit(child.exitCode);
      return;
    }
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", onExit);
  });
}

function exitOf(child, timeoutMs) {
  return new Promise(function (resolve) {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }
    const timer = setTimeout(function () {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }
    child.once("exit", onExit);
  });
}

function signalGroup(child, signal) {
  try {
    // groupe du processus (detached), pour arrêter aussi le vite lancé par npx
    process.kill(-child.pid, signal);
  } catch (err) {
    // déjà arrêté
  }
}

// SIGTERM, attente de la sortie, puis SIGKILL si le délai est dépassé
export async function stopChild(child, timeoutMs) {
  signalGroup(child, "SIGTERM");
  if (await exitOf(child, timeoutMs)) {
    return true;
  }
  signalGroup(child, "SIGKILL");
  return exitOf(child, timeoutMs);
}
