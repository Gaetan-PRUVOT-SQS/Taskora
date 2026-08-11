import { apiRequest } from "./client.js";

export async function archiveCard(id) {
  return apiRequest("/api/cards/" + id + "/archive", { method: "POST" });
}

export async function unarchiveCard(id) {
  return apiRequest("/api/cards/" + id + "/unarchive", { method: "POST" });
}

export async function archiveColumn(id) {
  return apiRequest("/api/columns/" + id + "/archive", { method: "POST" });
}

export async function unarchiveColumn(id) {
  return apiRequest("/api/columns/" + id + "/unarchive", { method: "POST" });
}
