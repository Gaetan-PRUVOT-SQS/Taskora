import { apiRequest, getToken } from "./client.ts";
import type { Attachment } from "../types.ts";

export async function listAttachments(cardId: string): Promise<Attachment[]> {
  return apiRequest<Attachment[]>("/api/cards/" + cardId + "/attachments");
}

export async function uploadAttachment(
  cardId: string,
  filename: string,
  mime: string,
  contentBase64: string
): Promise<Attachment> {
  return apiRequest<Attachment>("/api/cards/" + cardId + "/attachments", {
    method: "POST",
    body: {
      filename: filename,
      mime: mime,
      content_base64: contentBase64,
    },
  });
}

export async function deleteAttachment(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/attachments/" + id, { method: "DELETE" });
}

export function downloadUrl(id: string): string {
  return "/api/attachments/" + id + "/download";
}

// télécharge avec token (fetch blob)
export async function downloadAttachment(
  id: string,
  filename: string
): Promise<void> {
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
