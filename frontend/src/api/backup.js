import { getToken } from "./client.js";

// télécharge le backup instance (blob tar.gz)
export async function downloadBackup() {
  const token = getToken();
  const res = await fetch("/api/backup", {
    headers: {
      Authorization: "Bearer " + token,
    },
  });
  if (!res.ok) {
    let message = "Backup impossible";
    try {
      const data = await res.json();
      if (data && data.error) {
        message = data.error;
      }
    } catch (err) {
      // ignore
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "taskora-backup.tar.gz";
  a.click();
  URL.revokeObjectURL(url);
}
