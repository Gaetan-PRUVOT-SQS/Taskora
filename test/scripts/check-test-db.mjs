// Checks that TEST_DATABASE_URL is set and that the server answers, before
// any test runs. Used by scripts/test-pipeline.sh (SERVICES_CHECK_CMD).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "backend/package.json"));

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error(
    "TEST_DATABASE_URL is not set. The API, security and E2E tests need a real PostgreSQL: " +
      "start one with scripts/test-db.sh start, or set the variable in the CI workflow."
  );
  process.exit(1);
}

let safeUrl = "(unreadable URL)";
try {
  const u = new URL(url);
  u.password = u.password ? "***" : "";
  safeUrl = u.toString();
} catch (err) {
  console.error("TEST_DATABASE_URL is not a valid URL.");
  process.exit(1);
}

const pg = require("pg");
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query("SELECT 1");
  // every test file creates its own database on this server
  const res = await client.query(
    "SELECT rolcreatedb OR rolsuper AS ok FROM pg_roles WHERE rolname = current_user"
  );
  if (!res.rows[0] || !res.rows[0].ok) {
    console.error("The TEST_DATABASE_URL role cannot create databases: " + safeUrl);
    process.exitCode = 1;
  } else {
    console.log("test database reachable: " + safeUrl);
  }
} catch (err) {
  console.error("Cannot reach TEST_DATABASE_URL (" + safeUrl + "): " + err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(function () {});
}
