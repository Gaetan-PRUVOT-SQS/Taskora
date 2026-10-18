import { apiRequest } from "./client.js";

export async function register(name, email, password) {
  return apiRequest("/api/auth/register", {
    method: "POST",
    body: { name: name, email: email, password: password },
  });
}

export async function login(email, password) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: { email: email, password: password },
  });
}

export async function me() {
  return apiRequest("/api/auth/me");
}

export async function logout() {
  return apiRequest("/api/auth/logout", { method: "POST" });
}

export async function changePassword(currentPassword, newPassword) {
  return apiRequest("/api/auth/password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}
