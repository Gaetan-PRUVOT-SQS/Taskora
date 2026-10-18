/**
 * Niveau : System / Fonctionnel API (ISTQB)
 * Techniques : table de décision (authentifié x admin en base x claim client),
 * transition d'état (accordé puis retiré), devinette d'erreur (élévation par
 * l'inscription, claim dans le jeton, lien symbolique dans les uploads)
 * Constat d'audit : B-01
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { jwt } from "../../support/node-deps.js";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";
import { buildLoggedTestApp } from "../../support/security-app.js";
import { readTarGz } from "../../support/tar.js";
import { setInstanceAdmin } from "../../../backend/src/admin.js";

function captureLogs() {
  const lines = [];
  const stream = new Writable({
    write: function (chunk, enc, cb) {
      const text = chunk.toString();
      text.split("\n").forEach(function (l) {
        if (l.trim()) {
          lines.push(l);
        }
      });
      cb();
    },
  });
  return { stream: stream, lines: lines };
}

function backupLogs(lines) {
  return lines
    .map(function (l) {
      return JSON.parse(l);
    })
    .filter(function (e) {
      return e.event === "backup_access";
    });
}

describe("FUNCTIONAL /api/backup réservé à l'admin d'instance (B-01)", function () {
  let app;
  let logs;
  let uploadDir;
  let outsideFile;
  let admin;
  let member;
  let boardId;

  async function getBackup(token) {
    const headers = {};
    if (token) {
      headers.authorization = "Bearer " + token;
    }
    return app.inject({ method: "GET", url: "/api/backup", headers: headers });
  }

  before(async function () {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "taskora-bkp-"));
    process.env.UPLOAD_DIR = uploadDir;
    // fichier hors du dossier d'upload, atteint par un lien symbolique
    outsideFile = path.join(os.tmpdir(), "taskora-outside-" + process.pid + ".txt");
    fs.writeFileSync(outsideFile, "contenu hors upload");
    fs.symlinkSync(outsideFile, path.join(uploadDir, "lien-sortant"));

    // la limite par défaut (5) est testée à part, ici on enchaîne les appels
    process.env.BACKUP_RATE_LIMIT_MAX = "50";
    logs = captureLogs();
    app = await buildLoggedTestApp(logs.stream);
    delete process.env.BACKUP_RATE_LIMIT_MAX;

    admin = await registerUser(app, "Admin", "bkp-admin@test.com", "secret123");
    member = await registerUser(app, "Membre", "bkp-member@test.com", "secret123");
    assert.equal(await setInstanceAdmin(app.db, "bkp-admin@test.com", true), true);

    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + admin.token },
      payload: { title: "Board sauvegarde" },
    });
    boardId = board.json().id;

    const invite = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/invites",
      headers: { authorization: "Bearer " + admin.token },
      payload: { days: 7 },
    });
    assert.equal(invite.statusCode, 201);

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + admin.token },
    });
    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + detail.json().columns[0].id + "/cards",
      headers: { authorization: "Bearer " + admin.token },
      payload: { title: "Carte avec pièce jointe" },
    });
    const att = await app.inject({
      method: "POST",
      url: "/api/cards/" + card.json().id + "/attachments",
      headers: { authorization: "Bearer " + admin.token },
      payload: {
        filename: "notes.txt",
        mime: "text/plain",
        content_base64: Buffer.from("pièce jointe").toString("base64"),
      },
    });
    assert.equal(att.statusCode, 201);
  });

  after(async function () {
    await closeTestApp(app);
    fs.rmSync(uploadDir, { recursive: true, force: true });
    fs.rmSync(outsideFile, { force: true });
    delete process.env.UPLOAD_DIR;
  });

  it("SEC-BKP-01 sans jeton : 401", async function () {
    const res = await getBackup(null);
    assert.equal(res.statusCode, 401);
  });

  it("SEC-BKP-02 jeton invalide : 401", async function () {
    const res = await getBackup("pas.un.jeton");
    assert.equal(res.statusCode, 401);
  });

  it("SEC-BKP-03 utilisateur inscrit non admin : 403 sans archive", async function () {
    const res = await getBackup(member.token);
    assert.equal(res.statusCode, 403);
    assert.match(res.json().error, /administrateur/);
    assert.ok(!String(res.headers["content-type"]).includes("gzip"));
  });

  it("SEC-BKP-04 l'inscription ne permet pas de se déclarer admin", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Malin",
        email: "bkp-malin@test.com",
        password: "secret123",
        is_admin: true,
        role: "admin",
      },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().user.is_admin, false);
    const row = await app.db
      .prepare("SELECT is_admin FROM users WHERE email = ?")
      .get("bkp-malin@test.com");
    assert.equal(row.is_admin, false);
    assert.equal((await getBackup(res.json().token)).statusCode, 403);
  });

  it("SEC-BKP-05 un claim admin dans le jeton ne suffit pas", async function () {
    const token = jwt.sign(
      {
        id: member.user.id,
        email: member.user.email,
        name: "Membre",
        is_admin: true,
        role: "admin",
      },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" }
    );
    assert.equal((await getBackup(token)).statusCode, 403);
  });

  it("SEC-BKP-06 /api/auth/me renvoie le rôle lu en base", async function () {
    const meAdmin = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + admin.token },
    });
    assert.equal(meAdmin.json().is_admin, true);
    const meMember = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + member.token },
    });
    assert.equal(meMember.json().is_admin, false);
  });

  it("SEC-BKP-07 admin : 200 et archive sans empreinte ni secret", async function () {
    const res = await getBackup(admin.token);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "no-store");

    const files = readTarGz(Buffer.from(res.rawPayload));
    assert.ok(files["manifest.json"]);
    assert.ok(files["postgres-dump.json"]);

    const dump = JSON.parse(files["postgres-dump.json"].toString("utf8"));
    assert.ok(dump.tables.users.length >= 3);
    for (let i = 0; i < dump.tables.users.length; i++) {
      const u = dump.tables.users[i];
      assert.equal("password_hash" in u, false);
      assert.equal("oauth_id" in u, false);
      assert.equal("oauth_provider" in u, false);
    }
    assert.ok(dump.tables.board_invites.length >= 1);
    for (let j = 0; j < dump.tables.board_invites.length; j++) {
      assert.equal("token" in dump.tables.board_invites[j], false);
    }

    // aucune empreinte bcrypt nulle part dans l'archive
    const whole = Object.keys(files)
      .map(function (k) {
        return files[k].toString("utf8");
      })
      .join("\n");
    assert.equal(/\$2[aby]\$\d\d\$/.test(whole), false);
    const invites = await app.db.prepare("SELECT token FROM board_invites").all();
    for (let k = 0; k < invites.length; k++) {
      assert.equal(whole.indexOf(invites[k].token), -1);
    }

    const manifest = JSON.parse(files["manifest.json"].toString("utf8"));
    assert.deepEqual(manifest.exported_by, { id: admin.user.id });

    // pièce jointe incluse, lien symbolique sortant ignoré
    const uploads = Object.keys(files).filter(function (k) {
      return k.indexOf("uploads/") === 0;
    });
    assert.equal(uploads.length, 1);
    assert.equal(files[uploads[0]].toString("utf8"), "pièce jointe");
    assert.equal(whole.indexOf("contenu hors upload"), -1);
  });

  it("SEC-BKP-08 rôle retiré : de nouveau 403", async function () {
    assert.equal(await setInstanceAdmin(app.db, "bkp-admin@test.com", false), true);
    assert.equal((await getBackup(admin.token)).statusCode, 403);
    await setInstanceAdmin(app.db, "bkp-admin@test.com", true);
  });

  it("SEC-BKP-09 chaque tentative est journalisée sans donnée sensible", async function () {
    const entries = backupLogs(logs.lines);
    const outcomes = entries.map(function (e) {
      return e.outcome;
    });
    assert.ok(outcomes.indexOf("unauthenticated") !== -1);
    assert.ok(outcomes.indexOf("denied") !== -1);
    assert.ok(outcomes.indexOf("granted") !== -1);

    const granted = entries.filter(function (e) {
      return e.outcome === "granted";
    })[0];
    assert.equal(granted.userId, admin.user.id);
    assert.equal(granted.status, 200);
    assert.ok(granted.time);

    const denied = entries.filter(function (e) {
      return e.outcome === "denied";
    })[0];
    assert.equal(denied.userId, member.user.id);

    const all = logs.lines.join("\n");
    assert.equal(all.indexOf(admin.token), -1);
    assert.equal(all.indexOf(member.token), -1);
    assert.equal(all.indexOf("bkp-admin@test.com"), -1);
    assert.equal(/\$2[aby]\$\d\d\$/.test(all), false);
  });
  it("SEC-BKP-13 propriétaire d'un board mais pas admin d'instance : 403", async function () {
    const own = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + member.token },
      payload: { title: "Board du membre" },
    });
    assert.equal(own.statusCode, 201);
    const res = await getBackup(member.token);
    assert.equal(res.statusCode, 403);
    assert.equal(res.rawPayload.length < 200, true);
  });

  it("SEC-BKP-14 jetons forgés au nom de l'admin : 401, jamais l'archive", async function () {
    const claims = { id: admin.user.id, email: admin.user.email, name: "Admin" };
    const now = Math.floor(Date.now() / 1000);
    // secret presque identique au vrai
    const other = jwt.sign(claims, process.env.JWT_SECRET + "x", {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    const expired = jwt.sign(Object.assign({ exp: now - 1 }, claims), process.env.JWT_SECRET, {
      algorithm: "HS256",
    });
    const none =
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify(Object.assign({ exp: now + 3600 }, claims))).toString("base64url") +
      ".";
    const parts = member.token.split(".");
    const body = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    body.id = admin.user.id;
    const tampered =
      parts[0] + "." + Buffer.from(JSON.stringify(body)).toString("base64url") + "." + parts[2];
    const cases = { other: other, expired: expired, none: none, tampered: tampered };
    const names = Object.keys(cases);
    for (let i = 0; i < names.length; i++) {
      const res = await getBackup(cases[names[i]]);
      assert.equal(res.statusCode, 401, names[i]);
      assert.ok(!String(res.headers["content-type"]).includes("gzip"), names[i]);
    }
  });

  it("SEC-BKP-15 admin supprimé en base : son jeton encore signé ne donne plus rien", async function () {
    const gone = await registerUser(app, "Parti", "bkp-gone@test.com", "secret123");
    assert.equal(await setInstanceAdmin(app.db, "bkp-gone@test.com", true), true);
    assert.equal((await getBackup(gone.token)).statusCode, 200);
    await app.db.prepare("DELETE FROM users WHERE id = ?").run(gone.user.id);
    assert.equal((await getBackup(gone.token)).statusCode, 403);
  });

  it("SEC-BKP-16 ni jeton de session ni secret JWT dans l'archive ou l'export de board", async function () {
    const res = await getBackup(admin.token);
    assert.equal(res.statusCode, 200);
    const files = readTarGz(Buffer.from(res.rawPayload));
    const whole = Object.keys(files)
      .map(function (k) {
        return files[k].toString("utf8");
      })
      .join("\n");
    assert.equal(whole.indexOf(process.env.JWT_SECRET), -1);
    assert.equal(whole.indexOf(admin.token), -1);
    assert.equal(whole.indexOf(member.token), -1);
    // aucun JWT, quel qu'il soit
    assert.equal(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./.test(whole), false);

    const exp = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId + "/export",
      headers: { authorization: "Bearer " + admin.token },
    });
    assert.equal(exp.statusCode, 200);
    const text = exp.body;
    assert.equal(/\$2[aby]\$\d\d\$/.test(text), false);
    assert.equal(text.indexOf("password_hash"), -1);
    assert.equal(text.indexOf(process.env.JWT_SECRET), -1);
    const invites = await app.db.prepare("SELECT token FROM board_invites").all();
    for (let k = 0; k < invites.length; k++) {
      assert.equal(text.indexOf(invites[k].token), -1);
    }
  });
});

describe("FUNCTIONAL /api/backup limite de débit (B-01)", function () {
  let app;
  let logs;

  before(async function () {
    process.env.BACKUP_RATE_LIMIT_MAX = "2";
    logs = captureLogs();
    app = await buildLoggedTestApp(logs.stream);
  });

  after(async function () {
    delete process.env.BACKUP_RATE_LIMIT_MAX;
    await closeTestApp(app);
  });

  it("SEC-BKP-10 au-delà de la limite : 429, même sans être connecté", async function () {
    const user = await registerUser(app, "Rapide", "bkp-rl@test.com", "secret123");
    const codes = [];
    for (let i = 0; i < 4; i++) {
      // deux appels anonymes puis deux appels connectés, même adresse
      const headers = i < 2 ? {} : { authorization: "Bearer " + user.token };
      const res = await app.inject({
        method: "GET",
        url: "/api/backup",
        headers: headers,
      });
      codes.push(res.statusCode);
    }
    assert.deepEqual(codes, [401, 401, 429, 429]);
    const limited = backupLogs(logs.lines).filter(function (e) {
      return e.outcome === "rate_limited";
    });
    assert.equal(limited.length, 2);
  });
});

describe("FUNCTIONAL inscription fermée (B-01)", function () {
  let app;

  before(async function () {
    app = await buildTestApp();
  });

  after(async function () {
    delete process.env.REGISTRATION_OPEN;
    await closeTestApp(app);
  });

  it("SEC-BKP-11 REGISTRATION_OPEN=false : inscription refusée en 403", async function () {
    process.env.REGISTRATION_OPEN = "false";
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "X", email: "bkp-closed@test.com", password: "secret123" },
    });
    assert.equal(res.statusCode, 403);
    delete process.env.REGISTRATION_OPEN;
    const open = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "X", email: "bkp-closed@test.com", password: "secret123" },
    });
    assert.equal(open.statusCode, 201);
  });
});

describe("FUNCTIONAL /api/backup avec le limiteur global de la prod (B-01)", function () {
  let app;

  before(async function () {
    const Fastify = (await import("fastify")).default;
    const rateLimit = (await import("@fastify/rate-limit")).default;
    const { openTestDb } = await import("../../support/testDb.js");
    const { createBackupRoutes } = await import("../../../backend/src/routes/backup.js");
    // montage comme backend/src/index.js : limiteur global puis routes
    app = Fastify({ logger: false });
    await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
    app.decorate("db", await openTestDb());
    process.env.BACKUP_RATE_LIMIT_MAX = "2";
    await app.register(createBackupRoutes);
    delete process.env.BACKUP_RATE_LIMIT_MAX;
    await app.ready();
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("SEC-BKP-12 la limite propre au backup s'applique sous le limiteur global", async function () {
    const codes = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: "GET", url: "/api/backup" });
      codes.push(res.statusCode);
    }
    assert.deepEqual(codes, [401, 401, 429]);
  });
});
