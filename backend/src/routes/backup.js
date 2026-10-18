import fs from "fs";
import path from "path";
import rateLimit from "@fastify/rate-limit";
import { authMiddleware } from "../auth.js";
import { requireInstanceAdmin } from "../admin.js";
import {
  getUploadDir,
  dumpTablesForBackup,
  BACKUP_EXCLUDED_COLUMNS,
} from "../db.js";
import { createTarGz } from "../tarGz.js";

function backupRateLimitMax() {
  const n = Number(process.env.BACKUP_RATE_LIMIT_MAX);
  if (Number.isInteger(n) && n > 0) {
    return n;
  }
  return 5;
}

function outcomeFor(statusCode) {
  if (statusCode === 200) {
    return "granted";
  }
  if (statusCode === 401) {
    return "unauthenticated";
  }
  if (statusCode === 403) {
    return "denied";
  }
  if (statusCode === 429) {
    return "rate_limited";
  }
  return "failed";
}

// Trace chaque tentative : qui, quand (horodatage du log), résultat.
// Ni jeton, ni email, ni contenu de l'archive.
function logBackupAccess(request, reply) {
  const outcome = outcomeFor(reply.statusCode);
  const entry = {
    event: "backup_access",
    outcome: outcome,
    status: reply.statusCode,
    userId: request.user && request.user.id ? request.user.id : null,
    ip: request.ip,
  };
  if (outcome === "granted") {
    request.log.info(entry, "backup access granted");
  } else if (outcome === "failed") {
    request.log.error(entry, "backup access failed");
  } else {
    request.log.warn(entry, "backup access " + outcome);
  }
}

// Sauvegarde de l'instance (dump JSON + pièces jointes), réservée à
// l'administrateur d'instance. Les secrets ne sont jamais exportés.
export async function createBackupRoutes(app) {
  // la limite de la route ne doit jamais dépendre de la façon dont l'app est
  // montée : si le limiteur n'est pas déjà là, on l'ajoute pour ce plugin seul
  if (!app.hasDecorator("rateLimit")) {
    await app.register(rateLimit, { global: false });
  }

  app.get(
    "/api/backup",
    {
      config: {
        rateLimit: {
          max: backupRateLimitMax(),
          timeWindow: "15 minutes",
        },
      },
      preHandler: [authMiddleware, requireInstanceAdmin(app)],
      onResponse: async function (request, reply) {
        logBackupAccess(request, reply);
      },
    },
    async function (request, reply) {
      try {
        const entries = [];

        const tables = await dumpTablesForBackup(app.db);
        entries.push({
          name: "postgres-dump.json",
          data: Buffer.from(
            JSON.stringify(
              {
                format: "taskora-pg-dump-v2",
                exported_at: new Date().toISOString(),
                excluded_columns: BACKUP_EXCLUDED_COLUMNS,
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
            // ouvert sans suivre de lien, puis contrôlé et lu sur le même
            // descripteur : un fichier remplacé entre le contrôle et la
            // lecture ne peut plus faire sortir du dossier
            let fd;
            try {
              fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
            } catch (err) {
              continue;
            }
            try {
              const stat = fs.fstatSync(fd);
              // fichiers ordinaires seulement
              if (stat.isFile() && stat.size <= 20 * 1024 * 1024) {
                entries.push({
                  name: "uploads/" + fileName,
                  data: fs.readFileSync(fd),
                });
              }
            } finally {
              fs.closeSync(fd);
            }
          }
        }

        const manifest = {
          format: "taskora-instance-backup-v2",
          engine: "postgresql",
          exported_at: new Date().toISOString(),
          exported_by: { id: request.user.id },
          excluded_columns: BACKUP_EXCLUDED_COLUMNS,
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

        return reply
          .header("Content-Type", "application/gzip")
          .header("Cache-Control", "no-store")
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
