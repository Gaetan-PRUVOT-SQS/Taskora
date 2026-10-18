// Accès disque aux pièces jointes.
// Les noms stockés sont générés par le serveur (uuid), jamais tirés du nom
// envoyé par l'utilisateur. Toute lecture, écriture ou suppression repasse par
// resolveStoredFile : nom strict, pas de "..", pas de chemin absolu, chemin
// résolu qui reste dans le dossier d'upload, pas de lien symbolique.
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { getUploadDir } from "./db.js";

// anciens noms "uuid_nom-nettoyé" acceptés en lecture, nouveaux noms = uuid.bin
const STORED_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

export function newStorageName() {
  return uuidv4() + ".bin";
}

function uploadRoot() {
  const dir = path.resolve(getUploadDir());
  // dossier réel, au cas où le dossier d'upload lui-même serait un lien
  return fs.realpathSync(dir);
}

// Renvoie le chemin absolu sûr, ou null si le nom est refusé
export function resolveStoredFile(storageName) {
  if (typeof storageName !== "string" || !STORED_NAME.test(storageName)) {
    return null;
  }
  if (storageName.indexOf("..") !== -1 || path.isAbsolute(storageName)) {
    return null;
  }
  const root = uploadRoot();
  const full = path.resolve(root, storageName);
  if (path.dirname(full) !== root || !full.startsWith(root + path.sep)) {
    return null;
  }
  return full;
}

// Écrit un nouveau fichier, sans jamais suivre ni écraser quoi que ce soit
export function writeStoredFile(storageName, buffer) {
  const full = resolveStoredFile(storageName);
  if (!full) {
    throw new Error("Nom de stockage refusé");
  }
  const fd = fs.openSync(
    full,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW,
    0o600
  );
  try {
    fs.writeSync(fd, buffer);
  } finally {
    fs.closeSync(fd);
  }
}

// Ouvre un fichier existant en lecture. Renvoie { fd, size } ou un code d'erreur
export function openStoredFile(storageName) {
  const full = resolveStoredFile(storageName);
  if (!full) {
    return { error: "invalid" };
  }
  let fd;
  try {
    fd = fs.openSync(full, fs.constants.O_RDONLY | NOFOLLOW);
  } catch (err) {
    return { error: err.code === "ENOENT" ? "missing" : "invalid" };
  }
  const stat = fs.fstatSync(fd);
  if (!stat.isFile()) {
    fs.closeSync(fd);
    return { error: "invalid" };
  }
  return { fd: fd, size: stat.size };
}

// Supprime un fichier ordinaire du dossier d'upload, rien d'autre
export function removeStoredFile(storageName) {
  const full = resolveStoredFile(storageName);
  if (!full) {
    return false;
  }
  let stat;
  try {
    stat = fs.lstatSync(full);
  } catch (err) {
    return false;
  }
  if (!stat.isFile()) {
    return false;
  }
  fs.unlinkSync(full);
  return true;
}
