import fs from "fs";
import path from "path";
import { authMiddleware } from "../auth.js";
import { getUploadDir, dumpAllTables } from "../db.js";
import { createTarGz } from "../tarGz.js";

// backup one-click : dump Postgres (JSON) + uploads
export async function createBackupRoutes(app) {
  app.get(
    "/api/backup",
    { preHandler: authMiddleware },
    async function (request, reply) {
      try {
        const entries = [];

        const tables = await dumpAllTables(app.db);
        entries.push({
          name: "postgres-dump.json",
          data: Buffer.from(
            JSON.stringify(
              {
                format: "taskora-pg-dump-v1",
                exported_at: new Date().toISOString(),
                tables: tables,
              },
              null,
              2
            ),
            "utf8"
          ),
        });

        const uploadDir = getUploadDir();
        if (fs.existsSync(uploadDir)) {
          const files = fs.readdirSync(uploadDir);
          for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const full = path.join(uploadDir, fileName);
            let stat;
            try {
              stat = fs.statSync(full);
            } catch (err) {
              continue;
            }
            if (!stat.isFile()) {
              continue;
            }
            if (stat.size > 20 * 1024 * 1024) {
              continue;
            }
            entries.push({
              name: "uploads/" + fileName,
              data: fs.readFileSync(full),
            });
          }
        }

        const manifest = {
          format: "taskora-instance-backup-v1",
          engine: "postgresql",
          exported_at: new Date().toISOString(),
          exported_by: {
            id: request.user.id,
            email: request.user.email,
            name: request.user.name,
          },
          files: entries.map(function (e) {
            return e.name;
          }),
        };
        entries.unshift({
          name: "manifest.json",
          data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
        });

        const gz = createTarGz(entries);
        const stamp = new Date().toISOString().slice(0, 10);
        const filename = "taskora-backup-" + stamp + ".tar.gz";

        reply
          .header("Content-Type", "application/gzip")
          .header(
            "Content-Disposition",
            'attachment; filename="' + filename + '"'
          )
          .send(gz);
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: "Backup impossible" });
      }
    }
  );
}
