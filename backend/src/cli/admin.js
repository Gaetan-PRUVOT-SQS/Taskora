// Gestion des administrateurs d'instance, à lancer sur le serveur :
//   npm run admin -- grant alice@example.com
//   npm run admin -- revoke alice@example.com
//   npm run admin -- list
//   npm run admin -- disable alice@example.com   (coupe aussi ses sessions)
//   npm run admin -- enable alice@example.com
// Utilise la même base que l'API (DATABASE_URL).
import { getDb } from "../db.js";
import {
  setInstanceAdmin,
  setUserDisabled,
  listInstanceAdmins,
} from "../admin.js";

const usage =
  "Usage : npm run admin -- grant <email> | revoke <email> | disable <email> | enable <email> | list";

const COMMANDS = ["list", "grant", "revoke", "disable", "enable"];

async function main(args) {
  const command = args[0];
  const email = args[1];

  if (COMMANDS.indexOf(command) === -1) {
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

    let found;
    let message;
    if (command === "grant" || command === "revoke") {
      found = await setInstanceAdmin(db, email, command === "grant");
      message =
        command === "grant"
          ? email + " est maintenant administrateur."
          : email + " n'est plus administrateur.";
    } else {
      found = await setUserDisabled(db, email, command === "disable");
      message =
        command === "disable"
          ? email + " est désactivé, ses sessions sont fermées."
          : email + " est réactivé.";
    }
    if (!found) {
      console.error("Aucun compte avec l'adresse " + email);
      return 1;
    }
    console.log(message);
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
