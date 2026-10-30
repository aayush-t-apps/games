// Installing and offline: the service worker, the "Update ready" prompt, the Install button
// (browsers that send `beforeinstallprompt`) and the iPhone and iPad card (they don't).

/** iPhone, iPad (also iPadOS that says it's a Mac) and iPod, not yet on the Home Screen. */
export function iosCardWanted(nav = navigator, win = window) {
  const ios =
    /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true || win.matchMedia?.("(display-mode: standalone)").matches;
  return ios && !standalone;
}

/**
 * Register the service worker and watch for installs and updates.
 * @param {{onInstallable: (prompt: () => Promise<void>) => void, onUpdate: (apply: () => void) => void}} on
 */
export async function setupInstall({ onInstallable, onUpdate }) {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    onInstallable(async () => {
      await event.prompt();
      await event.userChoice;
    });
  });
  if (!("serviceWorker" in navigator)) return;
  let updating = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only after the player tapped Update: the first install takes over with no reload.
    if (updating) window.location.reload();
  });
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const offer = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      onUpdate(() => {
        updating = true;
        reg.waiting?.postMessage({ t: "skip" });
      });
    };
    offer();
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") offer();
      });
    });
  } catch (error) {
    console.warn("games: no service worker", error);
  }
}

/** Are all these files saved for offline? */
export async function isCached(urls) {
  if (!("caches" in window)) return false;
  const hits = await Promise.all(urls.map((u) => caches.match(u)));
  return hits.every(Boolean);
}

/** Ask the service worker to save these files, then check that each one is saved. */
export async function cacheFiles(urls) {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(resolve, 60_000);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve();
    };
    reg.active?.postMessage({ t: "cache", urls }, [channel.port2]);
  });
  return isCached(urls);
}
