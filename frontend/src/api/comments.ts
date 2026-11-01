import { apiRequest } from "./client.ts";
import type { Comment } from "../types.ts";

export async function listComments(cardId: string): Promise<Comment[]> {
  return apiRequest<Comment[]>("/api/cards/" + cardId + "/comments");
}

export async function createComment(cardId: string, body: string): Promise<Comment> {
  return apiRequest<Comment>("/api/cards/" + cardId + "/comments", {
    method: "POST",
    body: { body: body },
  });
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  return apiRequest<Comment>("/api/comments/" + id, {
    method: "PATCH",
    body: { body: body },
  });
}

export async function deleteComment(id: string): Promise<unknown> {
  return apiRequest<unknown>("/api/comments/" + id, {
    method: "DELETE",
  });
}
