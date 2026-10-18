// Gestion des administrateurs d'instance, à lancer sur le serveur :
//   npm run admin -- grant alice@example.com
//   npm run admin -- revoke alice@example.com
//   npm run admin -- list
// Utilise la même base que l'API (DATABASE_URL).
import { getDb } from "../db.js";
import {
  setInstanceAdmin,
  listInstanceAdmins,
} from "../admin.js";

const usage =
  "Usage : npm run admin -- grant <email> | revoke <email> | list";

async function main(args) {
  const command = args[0];
  const email = args[1];

  if (command !== "list" && command !== "grant" && command !== "revoke") {
    console.error(usage);
    return 2;
  }
  if (command !== "list" && !email) {
    console.error(usage);
    return 2;
  }

  const db = await getDb();
  try {
    if (command === "list") {
      const admins = await listInstanceAdmins(db);
      if (admins.length === 0) {
        console.log("Aucun administrateur.");
      }
      for (let i = 0; i < admins.length; i++) {
        console.log(admins[i].email + "  (" + admins[i].name + ")");
      }
      return 0;
    }

    const found = await setInstanceAdmin(db, email, command === "grant");
    if (!found) {
      console.error("Aucun compte avec l'adresse " + email);
      return 1;
    }
    console.log(
      command === "grant"
        ? email + " est maintenant administrateur."
        : email + " n'est plus administrateur."
    );
    return 0;
  } finally {
    await db.close();
  }
}

main(process.argv.slice(2)).then(
  function (code) {
    process.exitCode = code;
  },
  function (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
);
