import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { authMiddleware } from "../auth.js";
import { requireOwner, requireMember, getMembership } from "../access.js";
import { logActivity, emitActivity, listActivity } from "../activity.js";

function emit(app, boardId, type, data) {
  if (app.broadcastBoard) {
    app.broadcastBoard(boardId, { type: type, data: data });
  }
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

export async function createInvitesRoutes(app) {
  // owner crée un lien d'invitation
  app.post(
    "/api/boards/:id/invites",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireOwner(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      const days = body.days || 7;
      const email = body.email || null;
      const expires = new Date();
      expires.setDate(expires.getDate() + Number(days));

      const id = uuidv4();
      const token = makeToken();
      const now = new Date().toISOString();

      await app.db
        .prepare(
          `INSERT INTO board_invites
           (id, board_id, token, email, role, expires_at, created_by, created_at)
           VALUES (?, ?, ?, ?, 'member', ?, ?, ?)`
        )
        .run(
          id,
          request.params.id,
          token,
          email,
          expires.toISOString(),
          request.user.id,
          now
        );

      const invite = {
        id: id,
        board_id: request.params.id,
        token: token,
        email: email,
        role: "member",
        expires_at: expires.toISOString(),
        created_at: now,
        url_path: "/invite/" + token,
      };
      return reply.code(201).send(invite);
    }
  );

  // meta publique (board title) pour un token
  app.get("/api/invites/:token", async function (request, reply) {
    const row = await app.db
      .prepare(
        `SELECT i.*, b.title AS board_title
         FROM board_invites i
         JOIN boards b ON b.id = i.board_id
         WHERE i.token = ?`
      )
      .get(request.params.token);

    if (!row) {
      return reply.code(404).send({ error: "Invitation introuvable" });
    }
    if (row.accepted_at) {
      return reply.code(410).send({ error: "Invitation déjà utilisée" });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return reply.code(410).send({ error: "Invitation expirée" });
    }

    return {
      board_id: row.board_id,
      board_title: row.board_title,
      email: row.email,
      expires_at: row.expires_at,
    };
  });

  // accepter l'invitation (JWT requis)
  app.post(
    "/api/invites/:token/accept",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const row = await app.db
        .prepare("SELECT * FROM board_invites WHERE token = ?")
        .get(request.params.token);

      if (!row) {
        return reply.code(404).send({ error: "Invitation introuvable" });
      }
      if (row.accepted_at) {
        return reply.code(410).send({ error: "Invitation déjà utilisée" });
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return reply.code(410).send({ error: "Invitation expirée" });
      }
      if (row.email && row.email !== request.user.email) {
        return reply
          .code(403)
          .send({ error: "Cette invitation est réservée à un autre email" });
      }

      const existing = await getMembership(app.db, row.board_id, request.user.id);
      if (!existing) {
        await app.db
          .prepare(
            "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)"
          )
          .run(row.board_id, request.user.id, row.role || "member");
      }

      const now = new Date().toISOString();
      await app.db
        .prepare(
          "UPDATE board_invites SET accepted_at = ?, accepted_by = ? WHERE id = ?"
        )
        .run(now, request.user.id, row.id);

      const activity = await logActivity(
        app.db,
        row.board_id,
        request.user.id,
        "member.joined",
        { via: "invite", user_id: request.user.id }
      );
      emit(app, row.board_id, "member:added", {
        id: request.user.id,
        name: request.user.name,
        email: request.user.email,
        role: row.role || "member",
      });
      emitActivity(app, row.board_id, activity);

      return {
        board_id: row.board_id,
        role: row.role || "member",
      };
    }
  );

  // liste des invites actives (owner)
  app.get(
    "/api/boards/:id/invites",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireOwner(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const rows = await app.db
        .prepare(
          `SELECT id, board_id, token, email, role, expires_at, created_at, accepted_at
           FROM board_invites
           WHERE board_id = ?
           ORDER BY created_at DESC`
        )
        .all(request.params.id);

      return rows;
    }
  );

  // activity feed
  app.get(
    "/api/boards/:id/activity",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireMember(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }
      const limit = Number(request.query.limit) || 50;
      return await listActivity(app.db, request.params.id, limit);
    }
  );
}
