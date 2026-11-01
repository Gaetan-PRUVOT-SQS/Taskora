import { apiRequest } from "./client.ts";
import type { Label, LabelPatch } from "../types.ts";

export async function createLabel(
  boardId: string,
  name: string,
  color: string
): Promise<Label> {
  return apiRequest<Label>("/api/boards/" + boardId + "/labels", {
    method: "POST",
    body: { name: name, color: color },
  });
}

export async function updateLabel(id: string, data: LabelPatch): Promise<Label> {
  return apiRequest<Label>("/api/labels/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteLabel(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/labels/" + id, {
    method: "DELETE",
  });
}

export async function addLabelToCard(
  cardId: string,
  labelId: string
): Promise<unknown> {
  return apiRequest<unknown>("/api/cards/" + cardId + "/labels", {
    method: "POST",
    body: { labelId: labelId },
  });
}

export async function removeLabelFromCard(
  cardId: string,
  labelId: string
): Promise<unknown> {
  return apiRequest<unknown>("/api/cards/" + cardId + "/labels/" + labelId, {
    method: "DELETE",
  });
}
