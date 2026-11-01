import { apiRequest } from "./client.ts";
import type { SearchResults } from "../types.ts";

export async function search(query: string): Promise<SearchResults> {
  const q = encodeURIComponent(query || "");
  return apiRequest<SearchResults>("/api/search?q=" + q);
}
