import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA : service worker en production uniquement
// en dev on désenregistre un éventuel SW qui cacherait Vite
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        // ignore si indisponible
      });
    });
  } else {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      for (let i = 0; i < regs.length; i++) {
        regs[i].unregister();
      }
    });
  }
}
