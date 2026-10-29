/**
 * Niveau : intégration (PGlite)
 * Module : initSchema
 * Technique : exigences, oracle = catalogue pg_indexes
 * Cas : M4 de docs/justifications/socle-exploitation.md
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDb, initSchema } from "../../../backend/src/db.js";

const REQUIRED = [
  "idx_board_members_user",
  "idx_columns_board_pos",
  "idx_cards_column_pos",
  "idx_cards_assignee",
  "idx_cards_archived",
  "idx_labels_board",
  "idx_checklists_card",
  "idx_checklist_items_list",
  "idx_comments_card",
  "idx_attachments_card",
  "idx_activity_board",
  "idx_invites_board",
  "idx_users_oauth",
];

const DROPPED = ["idx_cards_column", "idx_columns_board"];

describe("index Postgres du schéma", function () {
  it("crée les index des filtres et retire les préfixes devenus inutiles", async function () {
    const db = await getDb({ pglite: true });
    try {
      await initSchema(db);
      const rows = await db.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
      );
      const names = rows.rows.map(function (row) {
        return row.indexname;
      });
      for (let i = 0; i < REQUIRED.length; i++) {
        assert.ok(names.indexOf(REQUIRED[i]) !== -1, REQUIRED[i]);
      }
      for (let i = 0; i < DROPPED.length; i++) {
        assert.equal(names.indexOf(DROPPED[i]), -1, DROPPED[i]);
      }
    } finally {
      await db.close();
    }
  });
});
