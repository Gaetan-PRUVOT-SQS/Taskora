import { apiRequest } from "./client.js";

export async function createChecklist(cardId, title) {
  return apiRequest("/api/cards/" + cardId + "/checklists", {
    method: "POST",
    body: { title: title },
  });
}

export async function updateChecklist(id, data) {
  return apiRequest("/api/checklists/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteChecklist(id) {
  return apiRequest("/api/checklists/" + id, {
    method: "DELETE",
  });
}

export async function createChecklistItem(checklistId, text) {
  return apiRequest("/api/checklists/" + checklistId + "/items", {
    method: "POST",
    body: { text: text },
  });
}

export async function updateChecklistItem(id, data) {
  return apiRequest("/api/checklist-items/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteChecklistItem(id) {
  return apiRequest("/api/checklist-items/" + id, {
    method: "DELETE",
  });
}
