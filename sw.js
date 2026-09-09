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
  "share-receipt.html",
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

// 📤 分享目標（share_target，見 manifest.json）：手機相簿/相機把收據照片
// 分享進來時，作業系統會直接對這裡 POST 一個 multipart/form-data。靜態
// 網站沒有後端能接 POST，所以在 Service Worker 攔截這個請求、把檔案讀
// 出來存進 IndexedDB，再用 303 redirect 轉成一般 GET，讓瀏覽器正常導向
// share-receipt.html（那邊的頁面腳本會再轉去幣別頁）。跟 splitbillReadLangFromDB()
// 共用同一個 IndexedDB（splitbill-prefs / kv），多一個 key 而已，不用另開資料庫。
function splitbillStoreSharedFile(file){
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("splitbill-prefs", 1);
      req.onupgradeneeded = () => {
        if(!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
      };
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(file, "sharedReceiptFile");
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch(e){ resolve(false); }
      };
      req.onerror = () => resolve(false);
    } catch(e){ resolve(false); }
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if(req.method === "POST" && url.pathname.endsWith("/share-receipt.html")){
    event.respondWith((async () => {
      try {
        const formData = await req.formData();
        const file = formData.get("receipt");
        if(file) await splitbillStoreSharedFile(file);
      } catch(e){}
      return Response.redirect("./share-receipt.html?shared=1", 303);
    })());
    return;
  }

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
//
// data.title 平常是後端（Supabase RPC/edge function）已經組好的通知
// 內容，這邊拿到什麼就顯示什麼，不會另外翻譯——Service Worker 沒有
// UI，沒辦法知道後端傳來的那句話是哪種語言寫的，硬翻反而可能翻錯。
// 這裡只處理「後端完全沒給 title」的極端情況下用的預設標題，這種
// 情況下才需要自己決定要用哪個語言顯示。
//
// Service Worker 是獨立的執行環境，碰不到分頁的 localStorage/i18n.js，
// 使用者目前選的語言是靠 i18n.js 的 syncLangToServiceWorker() 額外
// 寫進 IndexedDB 那份共用儲存空間，這裡讀出來用。
// ============================================================
const SW_FALLBACK_TITLES = {
  "zh-Hant": "帳務更動",
  "ja": "帳務の更新",
  "en": "Account Update"
};

function splitbillReadLangFromDB(){
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("splitbill-prefs", 1);
      req.onupgradeneeded = () => {
        if(!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
      };
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction("kv", "readonly");
          const getReq = tx.objectStore("kv").get("lang");
          getReq.onsuccess = () => resolve(getReq.result || "zh-Hant");
          getReq.onerror = () => resolve("zh-Hant");
        } catch(e){ resolve("zh-Hant"); }
      };
      req.onerror = () => resolve("zh-Hant");
    } catch(e){ resolve("zh-Hant"); }
  });
}

self.addEventListener("push", (event) => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){}

  event.waitUntil((async () => {
    const title = data.title || SW_FALLBACK_TITLES[await splitbillReadLangFromDB()] || SW_FALLBACK_TITLES["zh-Hant"];
    const options = {
      body: data.body || "",
      icon: "icon.svg",
      badge: "icon.svg",
      data: { url: data.url || "./" }
    };
    await self.registration.showNotification(title, options);
  })());
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
