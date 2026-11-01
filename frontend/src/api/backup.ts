import { ApiError, getToken, isRecord } from "./client.ts";

// télécharge le backup instance (blob tar.gz), réservé à l'admin d'instance
export async function downloadBackup(): Promise<void> {
  const token = getToken();
  const res = await fetch("/api/backup", {
    headers: {
      Authorization: "Bearer " + token,
    },
  });
  if (!res.ok) {
    let message =
      res.status === 403
        ? "Réservé à l'administrateur de l'instance"
        : "Backup impossible";
    try {
      const data: unknown = await res.json();
      if (isRecord(data) && typeof data.error === "string" && data.error) {
        message = data.error;
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "taskora-backup.tar.gz";
  a.click();
  URL.revokeObjectURL(url);
}
