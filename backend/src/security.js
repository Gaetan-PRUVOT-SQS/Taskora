// Petites validations sécurité (couleurs, noms de fichiers)

// accepte #RGB, #RRGGBB, #RRGGBBAA uniquement
export function isSafeCssColor(value) {
  if (value === null || value === undefined || value === "") {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim());
}

export function sanitizeFilename(name) {
  const raw = String(name || "file");
  // pas de chemin, pas de retours ligne (header injection)
  let clean = raw.replace(/[/\\]/g, "_").replace(/[\r\n\0"]/g, "");
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, "_");
  clean = clean.slice(0, 120);
  if (!clean || clean === "." || clean === "..") {
    clean = "file";
  }
  return clean;
}

// Content-Disposition sûr
export function contentDispositionAttachment(filename) {
  const safe = sanitizeFilename(filename);
  return 'attachment; filename="' + safe + '"';
}
