// The service worker: the whole app from one cache per release, cache first, so a match never mixes
// old and new files and an open app makes no requests. VERSION is shipify.json's version (a unit
// test checks it): bump it with every release, so the new release installs as a new worker.
const VERSION = "0.1.1";
const CACHE = `games-${VERSION}`;
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/games/index.json",
  "/lib/app.css",
  "/lib/app.js",
  "/lib/board.js",
  "/lib/cards.js",
  "/lib/deck.js",
  "/lib/engine.js",
  "/lib/input.js",
  "/lib/install.js",
  "/lib/layout.js",
  "/lib/net/local.js",
  "/lib/rng.js",
  "/lib/store.js",
  "/lib/ui.js",
];
// Past the HTTP cache, so a new release never gets an old file.
const fresh = (path) => new Request(path, { cache: "reload" });
const isGameFile = (path) => /^\/games\/[a-z0-9-]+\/[a-z0-9-]+\.js$/.test(path);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL.map(fresh));
      // Fetch again, at this release, the games the last release had saved.
      for (const name of await caches.keys()) {
        if (name === CACHE || !name.startsWith("games-")) continue;
        const old = await caches.open(name);
        const paths = (await old.keys()).map((r) => new URL(r.url).pathname).filter(isGameFile);
        await Promise.all(paths.map((p) => cache.add(fresh(p)).catch(() => {})));
      }
      // The first release takes over at once; a later one waits for the player's tap on Update.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name !== CACHE && name.startsWith("games-")) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

async function save(paths) {
  const cache = await caches.open(CACHE);
  await Promise.all(
    paths.map(async (p) => {
      if (!(await cache.match(p))) await cache.add(fresh(p)).catch(() => {});
    }),
  );
}

self.addEventListener("message", (event) => {
  const msg = event.data ?? {};
  if (msg.t === "skip") self.skipWaiting();
  if (msg.t === "cache" && Array.isArray(msg.urls)) {
    const paths = msg.urls.filter((u) => typeof u === "string" && isGameFile(u));
    event.waitUntil(save(paths).then(() => event.ports[0]?.postMessage({ t: "cached" })));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/health" || url.pathname === "/sw.js" || url.pathname.startsWith("/.well-known/"))
    return;
  event.respondWith(answer(request, url));
});

async function answer(request, url) {
  const cache = await caches.open(CACHE);
  // Every page is the one app page (the single-page fallback).
  const key = request.mode === "navigate" ? "/" : url.pathname;
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await fetch(request);
  // A game folder is saved on its first open.
  if (response.ok && request.mode !== "navigate") await cache.put(key, response.clone());
  return response;
}
