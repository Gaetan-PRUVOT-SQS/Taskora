// Administrateur d'instance.
// Le rôle vit uniquement en base (users.is_admin). Il ne vient jamais du jeton
// ni d'un champ envoyé par le client, et seul l'exploitant peut le donner,
// avec la commande `npm run admin` côté serveur.

export async function isInstanceAdmin(db, userId) {
  if (typeof userId !== "string" || userId === "") {
    return false;
  }
  const row = await db
    .prepare("SELECT is_admin FROM users WHERE id = ?")
    .get(userId);
  return Boolean(row) && row.is_admin === true;
}

// retourne true si un compte a été trouvé et mis à jour
export async function setInstanceAdmin(db, email, isAdmin) {
  const res = await db
    .prepare("UPDATE users SET is_admin = ? WHERE email = ?")
    .run(isAdmin === true, email);
  return res.changes > 0;
}

export async function listInstanceAdmins(db) {
  return db
    .prepare(
      "SELECT id, email, name FROM users WHERE is_admin = TRUE ORDER BY email ASC"
    )
    .all();
}

// preHandler à placer après authMiddleware
export function requireInstanceAdmin(app) {
  return async function (request, reply) {
    if (!request.user || !request.user.id) {
      return reply.code(401).send({ error: "Non authentifié" });
    }
    let allowed = false;
    try {
      allowed = await isInstanceAdmin(app.db, request.user.id);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: "Erreur serveur" });
    }
    if (!allowed) {
      return reply
        .code(403)
        .send({ error: "Réservé à l'administrateur de l'instance" });
    }
  };
}
