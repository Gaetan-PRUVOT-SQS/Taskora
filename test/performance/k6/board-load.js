// Couvre : AC-NFR-01
// Charge HTTP sur le parcours principal d'un tableau : lister ses tableaux,
// ouvrir un tableau, créer une carte, la déplacer de colonne.
// Profils (variable K6_PROFILE) :
//   smoke : 2 utilisateurs virtuels, 20 s, lancé à chaque pipeline
//   load  : montée à 25 utilisateurs, palier de 1 min, lancé chaque semaine
// Seuils = critère d'acceptation AC-NFR-01 : p95 < 500 ms, moins de 1 % d'erreurs.
// Chaque utilisateur virtuel travaille sur son propre tableau et supprime la
// carte créée en fin d'itération : le tableau garde une taille stable, comme
// une équipe qui crée et range ses cartes. K6_SHARED=1 met tous les
// utilisateurs sur le même tableau, qui grossit sans fin : ce mode sert à
// mesurer la contention (risque résiduel du rapport de campagne), il n'est pas
// lancé par le pipeline.
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:3001";
const PROFILE = __ENV.K6_PROFILE || "smoke";
const SHARED = __ENV.K6_SHARED === "1";
const TEAMS = 25;
// temps de réflexion entre deux itérations, en secondes : sans pause, 25
// utilisateurs envoient près de 10 000 requêtes/s et le limiteur de débit
// par IP répond 429, ce qui ne mesure plus rien d'utile
const THINK = Number(__ENV.K6_THINK || "1");

const PROFILES = {
  smoke: { vus: 2, duration: "20s" },
  load: {
    stages: [
      { duration: "30s", target: 25 },
      { duration: "1m", target: 25 },
      { duration: "15s", target: 0 },
    ],
  },
};

export const options = Object.assign({}, PROFILES[PROFILE], {
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "max"],
});

function auth(token) {
  return { headers: { "Content-Type": "application/json", Authorization: "Bearer " + token } };
}

function json() {
  return { headers: { "Content-Type": "application/json" } };
}

function createTeam(n) {
  const email = "charge-" + Date.now() + "-" + n + "@test.com";
  const reg = http.post(
    BASE + "/api/auth/register",
    JSON.stringify({ name: "Charge " + n, email: email, password: "motdepasse-charge-01" }),
    json()
  );
  if (reg.status !== 201) {
    throw new Error("inscription impossible : " + reg.status + " " + reg.body);
  }
  const token = reg.json("token");
  const board = http.post(BASE + "/api/boards", JSON.stringify({ title: "Tableau de charge " + n }), auth(token));
  const boardId = board.json("id");
  const columns = http.get(BASE + "/api/boards/" + boardId, auth(token)).json("columns");
  return { token: token, boardId: boardId, from: columns[0].id, to: columns[1].id };
}

export function setup() {
  const teams = [];
  const count = SHARED ? 1 : TEAMS;
  for (let n = 0; n < count; n++) {
    teams.push(createTeam(n));
  }
  return { teams: teams };
}

export default function (data) {
  const team = data.teams[(__VU - 1) % data.teams.length];
  const params = auth(team.token);

  group("lister mes tableaux", function () {
    const res = http.get(BASE + "/api/boards", params);
    check(res, { "tableaux 200": (r) => r.status === 200 });
  });

  group("ouvrir le tableau", function () {
    const res = http.get(BASE + "/api/boards/" + team.boardId, params);
    check(res, { "tableau 200": (r) => r.status === 200 });
  });

  group("créer, déplacer puis ranger une carte", function () {
    const created = http.post(
      BASE + "/api/columns/" + team.from + "/cards",
      JSON.stringify({ title: "Carte " + __VU + "-" + __ITER }),
      params
    );
    check(created, { "carte 201": (r) => r.status === 201 });
    if (created.status !== 201) {
      return;
    }
    const cardId = created.json("id");
    const moved = http.patch(
      BASE + "/api/cards/" + cardId,
      JSON.stringify({ column_id: team.to, position: 0 }),
      params
    );
    check(moved, { "déplacement 200": (r) => r.status === 200 });
    if (SHARED) {
      return;
    }
    // sans corps, donc sans Content-Type JSON, comme le client web
    const removed = http.del(BASE + "/api/cards/" + cardId, null, {
      headers: { Authorization: "Bearer " + team.token },
    });
    check(removed, { "suppression 2xx": (r) => r.status >= 200 && r.status < 300 });
  });
  sleep(THINK);
}
