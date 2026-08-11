import { apiRequest } from "./client.js";

export async function search(query) {
  const q = encodeURIComponent(query || "");
  return apiRequest("/api/search?q=" + q);
}
