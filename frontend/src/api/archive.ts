import { apiRequest } from "./client.ts";

export async function archiveCard(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/cards/" + id + "/archive", { method: "POST" });
}

export async function unarchiveCard(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/cards/" + id + "/unarchive", { method: "POST" });
}

export async function archiveColumn(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/columns/" + id + "/archive", { method: "POST" });
}

export async function unarchiveColumn(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/columns/" + id + "/unarchive", { method: "POST" });
}
