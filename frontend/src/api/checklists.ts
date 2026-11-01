import { apiRequest } from "./client.ts";
import type { Checklist, ChecklistItem, ChecklistItemPatch, ChecklistPatch } from "../types.ts";

export async function createChecklist(cardId: string, title: string): Promise<Checklist> {
  return apiRequest<Checklist>("/api/cards/" + cardId + "/checklists", {
    method: "POST",
    body: { title: title },
  });
}

export async function updateChecklist(
  id: string,
  data: ChecklistPatch
): Promise<Checklist> {
  return apiRequest<Checklist>("/api/checklists/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteChecklist(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/checklists/" + id, {
    method: "DELETE",
  });
}

export async function createChecklistItem(
  checklistId: string,
  text: string
): Promise<ChecklistItem> {
  return apiRequest<ChecklistItem>("/api/checklists/" + checklistId + "/items", {
    method: "POST",
    body: { text: text },
  });
}

export async function updateChecklistItem(
  id: string,
  data: ChecklistItemPatch
): Promise<ChecklistItem> {
  return apiRequest<ChecklistItem>("/api/checklist-items/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteChecklistItem(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/checklist-items/" + id, {
    method: "DELETE",
  });
}
