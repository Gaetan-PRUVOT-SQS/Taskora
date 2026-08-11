// Petit utilitaire tar.gz (sans dépendance externe)
// Entrées : [{ name: "chemin/fichier", data: Buffer }]

import zlib from "zlib";

function writeOctal(buf, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, "0");
  buf.write(text, offset, length - 1, "ascii");
  buf[offset + length - 1] = 0;
}

function tarHeader(name, size, mtime) {
  const header = Buffer.alloc(512);
  // nom (100 octets max)
  const nameSafe = name.slice(0, 100);
  header.write(nameSafe, 0, "utf8");

  // mode 0644
  writeOctal(header, 100, 8, 0o644);
  // uid / gid
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  // size
  writeOctal(header, 124, 12, size);
  // mtime
  writeOctal(header, 136, 12, Math.floor(mtime / 1000));
  // checksum placeholder spaces
  header.fill(0x20, 148, 156);
  // typeflag '0' = fichier normal
  header[156] = 0x30;
  // magic ustar
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");

  let sum = 0;
  for (let i = 0; i < 512; i++) {
    sum = sum + header[i];
  }
  writeOctal(header, 148, 8, sum);
  // le champ checksum se termine souvent par NUL + espace
  header[155] = 0x20;

  return header;
}

function padTo512(size) {
  const rem = size % 512;
  if (rem === 0) {
    return Buffer.alloc(0);
  }
  return Buffer.alloc(512 - rem);
}

export function createTarGz(entries) {
  const parts = [];
  const now = Date.now();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data || "");
    parts.push(tarHeader(entry.name, data.length, now));
    parts.push(data);
    parts.push(padTo512(data.length));
  }

  // deux blocs vides = fin d'archive tar
  parts.push(Buffer.alloc(1024));

  const tar = Buffer.concat(parts);
  return zlib.gzipSync(tar);
}
