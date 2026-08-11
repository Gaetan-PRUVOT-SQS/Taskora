import { apiRequest } from "./client.js";

export async function createInvite(boardId, data) {
  return apiRequest("/api/boards/" + boardId + "/invites", {
    method: "POST",
    body: data || {},
  });
}

export async function getInvite(token) {
  return apiRequest("/api/invites/" + token);
}

export async function acceptInvite(token) {
  return apiRequest("/api/invites/" + token + "/accept", {
    method: "POST",
    body: {},
  });
}

export async function listActivity(boardId, limit) {
  const q = limit ? "?limit=" + limit : "";
  return apiRequest("/api/boards/" + boardId + "/activity" + q);
}
