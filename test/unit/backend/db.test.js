/**
 * Level: unit (backend)
 * Module: db.js (query wrapper, no real database)
 * Techniques: equivalence partitioning, branch coverage on the result mapping,
 *   error guessing on transactions (rollback when the callback throws)
 * Conditions: C-DB-01 to C-DB-07
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toPgParams, wrapQueryClient } from "../../../backend/src/db.js";

function fakeClient(result) {
  const calls = [];
  return {
    calls: calls,
    query: async function (sql, params) {
      calls.push({ sql: sql, params: params });
      if (typeof result === "function") {
        return result(sql, params);
      }
      return result;
    },
  };
}

describe("unit db wrapper", function () {
  it("C-DB-01 toPgParams numbers the placeholders in order", function () {
    assert.equal(
      toPgParams("SELECT * FROM t WHERE a = ? AND b = ? OR c = ?"),
      "SELECT * FROM t WHERE a = $1 AND b = $2 OR c = $3"
    );
  });

  it("C-DB-02 toPgParams leaves a query without placeholder untouched", function () {
    assert.equal(toPgParams("SELECT 1"), "SELECT 1");
  });

  it("C-DB-03 get returns the first row or undefined", async function () {
    const db = wrapQueryClient(fakeClient({ rows: [{ id: 1 }, { id: 2 }] }));
    assert.deepEqual(await db.prepare("SELECT ?").get(5), { id: 1 });
    const empty = wrapQueryClient(fakeClient({ rows: [] }));
    assert.equal(await empty.prepare("SELECT 1").get(), undefined);
  });

  it("C-DB-04 all passes params through and returns [] when rows is missing", async function () {
    const client = fakeClient({});
    const db = wrapQueryClient(client);
    assert.deepEqual(await db.prepare("SELECT ? , ?").all("a", 2), []);
    assert.deepEqual(client.calls[0], { sql: "SELECT $1 , $2", params: ["a", 2] });
  });

  it("C-DB-05 run maps rowCount (pg) and affectedRows (PGlite)", async function () {
    const pgLike = wrapQueryClient(fakeClient({ rowCount: 3 }));
    assert.deepEqual(await pgLike.prepare("DELETE").run(), { changes: 3, rowCount: 3 });
    const lite = wrapQueryClient(fakeClient({ affectedRows: 2 }));
    assert.deepEqual(await lite.prepare("DELETE").run(), { changes: 2, rowCount: 2 });
    const none = wrapQueryClient(fakeClient({}));
    assert.deepEqual(await none.prepare("DELETE").run(), { changes: 0, rowCount: 0 });
  });

  it("C-DB-06 transaction commits when the callback succeeds", async function () {
    const client = fakeClient({ rows: [] });
    const db = wrapQueryClient(client);
    await db.transaction(async function (tx) {
      await tx.prepare("UPDATE t SET a = ?").run(1);
    });
    assert.deepEqual(
      client.calls.map(function (c) {
        return c.sql;
      }),
      ["BEGIN", "UPDATE t SET a = $1", "COMMIT"]
    );
  });

  it("C-DB-07 transaction rolls back and rethrows when the callback fails", async function () {
    const client = fakeClient({ rows: [] });
    const db = wrapQueryClient(client);
    await assert.rejects(
      db.transaction(async function () {
        throw new Error("boom");
      }),
      /boom/
    );
    assert.deepEqual(
      client.calls.map(function (c) {
        return c.sql;
      }),
      ["BEGIN", "ROLLBACK"]
    );
  });

  it("C-DB-08 pool transaction uses one connection and releases it", async function () {
    const conn = fakeClient({ rows: [] });
    let released = 0;
    conn.release = function () {
      released = released + 1;
    };
    const pool = {
      query: async function () {
        return { rows: [] };
      },
      connect: async function () {
        return conn;
      },
    };
    const db = wrapQueryClient(pool, { isPool: true });
    await assert.rejects(
      db.transaction(async function (tx) {
        await tx.prepare("INSERT").run();
        throw new Error("fail");
      })
    );
    assert.deepEqual(
      conn.calls.map(function (c) {
        return c.sql;
      }),
      ["BEGIN", "INSERT", "ROLLBACK"]
    );
    assert.equal(released, 1);
  });
});
