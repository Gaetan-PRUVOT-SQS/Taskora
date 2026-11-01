import { apiRequest } from "./client.ts";
import type { BoardDetail, BoardPatch, BoardSummary } from "../types.ts";

export async function listBoards(): Promise<BoardSummary[]> {
  return apiRequest<BoardSummary[]>("/api/boards");
}

export async function createBoard(
  title: string,
  description: string
): Promise<BoardSummary> {
  return apiRequest<BoardSummary>("/api/boards", {
    method: "POST",
    body: { title: title, description: description || "" },
  });
}

export async function getBoard(
  id: string | undefined,
  options?: { archived?: boolean }
): Promise<BoardDetail> {
  const opts = options || {};
  let url = "/api/boards/" + id;
  if (opts.archived) {
    url = url + "?archived=1";
  }
  return apiRequest<BoardDetail>(url);
}

export async function updateBoard(
  id: string,
  data: BoardPatch
): Promise<BoardSummary> {
  return apiRequest<BoardSummary>("/api/boards/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteBoard(id: string | undefined): Promise<unknown> {
  return apiRequest<unknown>("/api/boards/" + id, {
    method: "DELETE",
  });
}

export async function addMember(
  boardId: string | undefined,
  email: string
): Promise<unknown> {
  return apiRequest<unknown>("/api/boards/" + boardId + "/members", {
    method: "POST",
    body: { email: email },
  });
}

export async function removeMember(
  boardId: string | undefined,
  userId: string
): Promise<unknown> {
  return apiRequest<unknown>("/api/boards/" + boardId + "/members/" + userId, {
    method: "DELETE",
  });
}

export async function exportBoard(id: string | undefined): Promise<unknown> {
  return apiRequest<unknown>("/api/boards/" + id + "/export");
}

export async function importBoard(data: unknown): Promise<BoardSummary> {
  return apiRequest<BoardSummary>("/api/boards/import", {
    method: "POST",
    body: data,
  });
}
