// ============================================================
// Split Bill — service worker：快取 app 本身的檔案，讓手機可以
// 加到主畫面、離線時至少看得到上一次載入的畫面。
//
// 注意：Supabase 的 API 請求（跨網域）完全不經過這個快取，
// 帳務資料永遠直接打網路，不會被離線快取蓋掉變成舊資料。
// ============================================================

importScripts("version.js");
const CACHE_NAME = "splitbill-v" + APP_VERSION;

const APP_SHELL = [
  "index.html",
  "summary.html",
  "currency.html",
  "settings.html",
  "about.html",
  "privacy.html",
  "terms.html",
  "currencies.js",
  "shared.css",
  "theme.css",
  "theme.js",
  "shared-ui.js",
  "app-banner.js",
  "app.js",
  "version.js",
  "manifest.json",
  "icon.svg",
  "icon-mono.svg",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只處理同網域的 GET 請求（app 自己的檔案），其他一律讓瀏覽器照正常方式處理
  if(req.method !== "GET" || url.origin !== self.location.origin){
    return;
  }

  // 先試網路拿最新版本，若網路超過 2.5 秒沒反應（例如 DNS/Cloudflare 切換中）
  // 或離線失敗，立即退回快取，避免使用者畫面卡住乾等幾十秒。
  const fetchWithTimeout = (request, timeoutMs = 2500) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(request, { cache: "reload", signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  event.respondWith(
    fetchWithTimeout(req, 2500)
      .then((response) => {
        if(response && response.ok){
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});

// ============================================================
// Web Push：即使 app 沒開著，也能收到跟自己帳務有關的推播通知
// ============================================================
self.addEventListener("push", (event) => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){}
  const title = data.title || "帳務更動";
  const options = {
    body: data.body || "",
    icon: "icon.svg",
    badge: "icon.svg",
    data: { url: data.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      for(const client of windowClients){
        if(client.url.includes(url) && "focus" in client) return client.focus();
      }
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});
