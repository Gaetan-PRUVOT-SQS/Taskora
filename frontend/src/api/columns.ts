import { apiRequest } from "./client.ts";
import type { Column, ColumnPatch } from "../types.ts";

export async function createColumn(
  boardId: string | undefined,
  title: string
): Promise<Column> {
  return apiRequest<Column>("/api/boards/" + boardId + "/columns", {
    method: "POST",
    body: { title: title },
  });
}

export async function updateColumn(id: string, data: ColumnPatch): Promise<Column> {
  return apiRequest<Column>("/api/columns/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteColumn(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/columns/" + id, {
    method: "DELETE",
  });
}
