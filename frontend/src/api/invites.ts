import { apiRequest } from "./client.ts";
import type {
  ActivityEvent,
  InviteAcceptResult,
  InviteCreated,
  InviteMeta,
} from "../types.ts";

export async function createInvite(
  boardId: string,
  data?: { days?: number }
): Promise<InviteCreated> {
  return apiRequest<InviteCreated>("/api/boards/" + boardId + "/invites", {
    method: "POST",
    body: data || {},
  });
}

export async function getInvite(token: string | undefined): Promise<InviteMeta> {
  return apiRequest<InviteMeta>("/api/invites/" + token);
}

export async function acceptInvite(
  token: string | undefined
): Promise<InviteAcceptResult> {
  return apiRequest<InviteAcceptResult>("/api/invites/" + token + "/accept", {
    method: "POST",
    body: {},
  });
}

export async function listActivity(
  boardId: string | undefined,
  limit?: number
): Promise<ActivityEvent[]> {
  const q = limit ? "?limit=" + limit : "";
  return apiRequest<ActivityEvent[]>("/api/boards/" + boardId + "/activity" + q);
}
