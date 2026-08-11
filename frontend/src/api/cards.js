import { apiRequest } from "./client.js";

export async function createCard(columnId, title) {
  return apiRequest("/api/columns/" + columnId + "/cards", {
    method: "POST",
    body: { title: title },
  });
}

export async function updateCard(id, data) {
  return apiRequest("/api/cards/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteCard(id) {
  return apiRequest("/api/cards/" + id, {
    method: "DELETE",
  });
}
