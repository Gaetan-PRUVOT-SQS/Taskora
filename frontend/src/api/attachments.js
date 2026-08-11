import { apiRequest, getToken } from "./client.js";

export async function listAttachments(cardId) {
  return apiRequest("/api/cards/" + cardId + "/attachments");
}

export async function uploadAttachment(cardId, filename, mime, contentBase64) {
  return apiRequest("/api/cards/" + cardId + "/attachments", {
    method: "POST",
    body: {
      filename: filename,
      mime: mime,
      content_base64: contentBase64,
    },
  });
}

export async function deleteAttachment(id) {
  return apiRequest("/api/attachments/" + id, { method: "DELETE" });
}

export function downloadUrl(id) {
  return "/api/attachments/" + id + "/download";
}

// télécharge avec token (fetch blob)
export async function downloadAttachment(id, filename) {
  const token = getToken();
  const res = await fetch(downloadUrl(id), {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (!res.ok) {
    throw new Error("Téléchargement impossible");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "fichier";
  a.click();
  URL.revokeObjectURL(url);
}
