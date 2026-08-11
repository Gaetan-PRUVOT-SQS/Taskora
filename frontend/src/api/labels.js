import { apiRequest } from "./client.js";

export async function createLabel(boardId, name, color) {
  return apiRequest("/api/boards/" + boardId + "/labels", {
    method: "POST",
    body: { name: name, color: color },
  });
}

export async function updateLabel(id, data) {
  return apiRequest("/api/labels/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteLabel(id) {
  return apiRequest("/api/labels/" + id, {
    method: "DELETE",
  });
}

export async function addLabelToCard(cardId, labelId) {
  return apiRequest("/api/cards/" + cardId + "/labels", {
    method: "POST",
    body: { labelId: labelId },
  });
}

export async function removeLabelFromCard(cardId, labelId) {
  return apiRequest("/api/cards/" + cardId + "/labels/" + labelId, {
    method: "DELETE",
  });
}
