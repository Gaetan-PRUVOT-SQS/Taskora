// Lecture minimale d'une archive tar.gz produite par backend/src/tarGz.js
import zlib from "node:zlib";

export function readTarGz(buffer) {
  const tar = zlib.gunzipSync(buffer);
  const files = {};
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(function (b) { return b === 0; })) {
      break;
    }
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(
      header.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim(),
      8
    );
    const start = offset + 512;
    files[name] = tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
  }
  return files;
}
