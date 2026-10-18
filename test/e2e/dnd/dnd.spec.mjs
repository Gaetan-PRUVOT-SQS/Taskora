/**
 * E2E navigateur réel : Drag & Drop HTML5 (ISTQB système / UI)
 * Lancé par test/scripts/run-e2e-dnd.mjs, qui démarre le backend et le frontend
 * et passe l'adresse du frontend dans E2E_BASE_URL
 *
 * Note : Playwright dragTo souris ne remplit pas dataTransfer HTML5.
 * On simule dragstart/drop avec DataTransfer (événements navigateur réels).
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
const email = "e2e-dnd-" + Date.now() + "@test.com";
const password = "secret123";

async function html5DropCard(page, cardId, fromColumnId, toColumnId) {
  await page.evaluate(
    function (args) {
      const target = document.querySelector(
        '[data-column-id="' + args.toColumnId + '"]'
      );
      if (!target) {
        throw new Error("colonne cible introuvable");
      }
      const dt = new DataTransfer();
      dt.setData("cardId", args.cardId);
      dt.setData("fromColumnId", args.fromColumnId);
      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      );
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      );
    },
    {
      cardId: cardId,
      fromColumnId: fromColumnId,
      toColumnId: toColumnId,
    }
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE + "/register");
    await page.getByLabel("Nom").fill("E2E DnD");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: /créer mon compte/i }).click();
    await page.waitForURL(function (url) {
      return !url.pathname.includes("register");
    });

    await page.getByPlaceholder("Nom du nouveau board").fill("Board DnD");
    await page.getByRole("button", { name: /^Créer$/i }).click();
    await page.waitForURL(/\/boards\//);

    const firstColumn = page.locator(".column").first();
    const secondColumn = page.locator(".column").nth(1);
    const addInput = firstColumn.locator('input[name="cardTitle"]');

    await addInput.fill("Carte A");
    await firstColumn.locator('button[type="submit"]').click();
    await page.waitForSelector(".card:has-text('Carte A')");

    await addInput.fill("Carte B");
    await firstColumn.locator('button[type="submit"]').click();
    await page.waitForSelector(".card:has-text('Carte B')");

    const cardA = page.locator(".card", { hasText: "Carte A" });
    const cardId = await cardA.getAttribute("data-card-id");
    const fromColumnId = await cardA.getAttribute("data-column-id");
    const toColumnId = await secondColumn.getAttribute("data-column-id");

    assert.ok(cardId, "data-card-id manquant");
    assert.ok(fromColumnId, "data-column-id source manquant");
    assert.ok(toColumnId, "data-column-id cible manquant");

    // 1) Vérifie que l'élément est draggable (contrat UI)
    const draggable = await cardA.getAttribute("draggable");
    assert.equal(draggable, "true");

    // 2) Drop HTML5 réel (DataTransfer) dans le navigateur
    await html5DropCard(page, cardId, fromColumnId, toColumnId);

    // attendre PATCH + rechargement board
    await page.waitForFunction(
      function (args) {
        const col = document.querySelector(
          '[data-column-id="' + args.toColumnId + '"]'
        );
        if (!col) {
          return false;
        }
        const cards = col.querySelectorAll(".card");
        for (let i = 0; i < cards.length; i++) {
          if (cards[i].getAttribute("data-card-id") === args.cardId) {
            return true;
          }
        }
        return false;
      },
      { cardId: cardId, toColumnId: toColumnId },
      { timeout: 5000 }
    );

    // Carte B encore en 1re colonne
    const stillInFirst = await firstColumn
      .locator('.card:has-text("Carte B")')
      .count();
    assert.ok(stillInFirst >= 1, "Carte B devrait rester en colonne 1");

    console.log("E2E DnD OK");
  } finally {
    await browser.close();
  }
}

main().catch(function (err) {
  console.error("E2E DnD FAIL:", err.message);
  process.exit(1);
});
