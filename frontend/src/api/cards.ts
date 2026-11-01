import { apiRequest } from "./client.ts";
import type { Card, CardPatch } from "../types.ts";

export async function createCard(columnId: string, title: string): Promise<Card> {
  return apiRequest<Card>("/api/columns/" + columnId + "/cards", {
    method: "POST",
    body: { title: title },
  });
}

export async function updateCard(id: string, data: CardPatch): Promise<Card> {
  return apiRequest<Card>("/api/cards/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteCard(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/cards/" + id, {
    method: "DELETE",
  });
}
