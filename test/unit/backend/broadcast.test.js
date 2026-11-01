/**
 * Salles WebSocket : arrivée, départ, expiration et exclusion d'un membre.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  joinRoom,
  leaveRoom,
  leaveAll,
  kickMember,
  broadcastBoard,
} from "../../../backend/src/broadcast.js";

function fakeSocket(userId, exp) {
  return {
    taskoraUserId: userId,
    taskoraExp: exp,
    readyState: 1,
    sent: [],
    closed: false,
    send: function (payload) {
      this.sent.push(payload);
    },
    close: function () {
      this.closed = true;
      this.readyState = 3;
    },
  };
}

describe("UNIT broadcast", function () {
  it("quitter une salle inconnue ne fait rien", function () {
    const socket = fakeSocket("u1");
    leaveRoom("board-inconnu-" + Date.now(), socket);
    assert.equal(socket.closed, false);
  });

  it("envoie aux sockets ouverts et ferme ceux qui ont expiré", function () {
    const boardId = "board-live-" + Date.now();
    const live = fakeSocket("u1", Math.floor(Date.now() / 1000) + 3600);
    const dead = fakeSocket("u2", 1);
    const closed = fakeSocket("u3", Math.floor(Date.now() / 1000) + 3600);
    closed.readyState = 3;
    joinRoom(boardId, live);
    joinRoom(boardId, dead);
    joinRoom(boardId, closed);

    broadcastBoard(boardId, { type: "card:updated" });
    assert.equal(live.sent.length, 1);
    assert.match(live.sent[0], /card:updated/);
    assert.equal(dead.closed, true);
    assert.equal(closed.sent.length, 0);

    leaveRoom(boardId, live);
    broadcastBoard(boardId, { type: "ping" });
    assert.equal(live.sent.length, 1);

    leaveAll(closed);
    kickMember(boardId, "personne");
    kickMember("salle-vide-" + Date.now(), "u1");
  });

  it("kickMember ferme le socket du membre visé", function () {
    const boardId = "board-kick-" + Date.now();
    const target = fakeSocket("u9");
    const other = fakeSocket("u8");
    joinRoom(boardId, target);
    joinRoom(boardId, other);
    kickMember(boardId, "u9");
    assert.equal(target.closed, true);
    assert.equal(other.closed, false);
    leaveAll(other);
  });
});
