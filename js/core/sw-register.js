if ("serviceWorker" in navigator) {
  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    console.log('[DEBUG SW] Controller changed, reloading...');
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      console.log('[DEBUG SW] Registering service worker...');
      const reg = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      console.log('[DEBUG SW] Service worker registered, scope:', reg.scope);
      await reg.update();
      console.log('[DEBUG SW] Update check completed');

      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    } catch (err) {
      console.error("Service Worker Registrierung fehlgeschlagen:", err);
    }
  });
}
