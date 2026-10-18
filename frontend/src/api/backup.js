import { sessionFetch } from "./client.js";

// télécharge le backup instance (blob tar.gz), réservé à l'admin d'instance
export async function downloadBackup() {
  const res = await sessionFetch("/api/backup");
  if (!res.ok) {
    let message =
      res.status === 403
        ? "Réservé à l'administrateur de l'instance"
        : "Backup impossible";
    try {
      const data = await res.json();
      if (data && data.error) {
        message = data.error;
      }
    } catch (err) {
      // ignore
    }
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "taskora-backup.tar.gz";
  a.click();
  URL.revokeObjectURL(url);
}
