import { apiRequest } from "./client.js";

export async function listBoards() {
  return apiRequest("/api/boards");
}

export async function createBoard(title, description) {
  return apiRequest("/api/boards", {
    method: "POST",
    body: { title: title, description: description || "" },
  });
}

export async function getBoard(id, options) {
  const opts = options || {};
  let url = "/api/boards/" + id;
  if (opts.archived) {
    url = url + "?archived=1";
  }
  return apiRequest(url);
}

export async function updateBoard(id, data) {
  return apiRequest("/api/boards/" + id, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteBoard(id) {
  return apiRequest("/api/boards/" + id, {
    method: "DELETE",
  });
}

export async function addMember(boardId, email) {
  return apiRequest("/api/boards/" + boardId + "/members", {
    method: "POST",
    body: { email: email },
  });
}

export async function removeMember(boardId, userId) {
  return apiRequest("/api/boards/" + boardId + "/members/" + userId, {
    method: "DELETE",
  });
}

export async function exportBoard(id) {
  return apiRequest("/api/boards/" + id + "/export");
}

export async function importBoard(data) {
  return apiRequest("/api/boards/import", {
    method: "POST",
    body: data,
  });
}
