import { apiRequest } from "./client.js";

export async function createColumn(boardId, title) {
  return apiRequest("/api/boards/" + boardId + "/columns", {
    method: "POST",
    body: { title: title },
  });
}

export async function updateColumn(id, data) {
  return apiRequest("/api/columns/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteColumn(id) {
  return apiRequest("/api/columns/" + id, {
    method: "DELETE",
  });
}
