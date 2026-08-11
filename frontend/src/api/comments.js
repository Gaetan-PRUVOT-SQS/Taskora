import { apiRequest } from "./client.js";

export async function listComments(cardId) {
  return apiRequest("/api/cards/" + cardId + "/comments");
}

export async function createComment(cardId, body) {
  return apiRequest("/api/cards/" + cardId + "/comments", {
    method: "POST",
    body: { body: body },
  });
}

export async function updateComment(id, body) {
  return apiRequest("/api/comments/" + id, {
    method: "PATCH",
    body: { body: body },
  });
}

export async function deleteComment(id) {
  return apiRequest("/api/comments/" + id, {
    method: "DELETE",
  });
}
