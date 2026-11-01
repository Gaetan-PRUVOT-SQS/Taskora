import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Élément #root introuvable");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA : service worker en production uniquement
// en dev on désenregistre un éventuel SW qui cacherait Vite
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", function () {
      void navigator.serviceWorker.register("/sw.js").catch(function () {
        // ignore si indisponible
      });
    });
  } else {
    void navigator.serviceWorker.getRegistrations().then(function (regs) {
      for (let i = 0; i < regs.length; i++) {
        const reg = regs[i];
        if (reg) {
          void reg.unregister();
        }
      }
    });
  }
}
