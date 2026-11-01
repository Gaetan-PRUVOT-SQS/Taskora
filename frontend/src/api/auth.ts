import { apiRequest } from "./client.ts";
import type { AuthSession, User } from "../types.ts";

export async function register(
  name: string,
  email: string,
  password: string
): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/register", {
    method: "POST",
    body: { name: name, email: email, password: password },
  });
}

export async function login(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/login", {
    method: "POST",
    body: { email: email, password: password },
  });
}

export async function me(): Promise<User> {
  return apiRequest<User>("/api/auth/me");
}
