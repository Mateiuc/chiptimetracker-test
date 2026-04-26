import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { autoBackupService } from "./services/autoBackupService";

// Import PWA Elements for Capacitor Camera to work in web/PWA
import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Define the PWA elements before app renders
defineCustomElements(window);

// One-time service worker + cache reset to free users stuck on a stale PWA bundle.
// Bump the version key whenever a critical bug fix needs to bypass the old SW cache.
const SW_RESET_KEY = "sw_reset_v2";
if (typeof window !== "undefined" && !localStorage.getItem(SW_RESET_KEY)) {
  localStorage.setItem(SW_RESET_KEY, "1");
  (async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn("[sw-reset] failed", e);
    } finally {
      window.location.reload();
    }
  })();
}

// Initialize auto-backup service on app start
autoBackupService.initialize().catch(console.error);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
