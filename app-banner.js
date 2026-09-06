// ============================================================
// Splitbill Smart App Download / Install Floating Banner
// ============================================================
(function(){
  // 1. 如果已經在原生 Capacitor APK 裡，絕不顯示提示
  if(typeof window.Capacitor !== "undefined" && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform()){
    return;
  }
  // 2. 如果已經在 PWA 獨立全螢幕模式（已加入主畫面），也不顯示提示
  const isStandalone = !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || !!window.navigator.standalone;
  if(isStandalone) return;

  // 3. 檢查使用者是否在 3 天內關閉過此橫幅
  const DISMISS_KEY = "sb_app_banner_dismissed";
  const dismissedTime = Number(localStorage.getItem(DISMISS_KEY) || 0);
  if(dismissedTime && (Date.now() - dismissedTime < 3 * 24 * 60 * 60 * 1000)){
    return;
  }

  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  // 只針對 Android 或 iOS 行動裝置顯示專屬提示
  if(!isAndroid && !isIOS) return;

  function showBanner(){
    if(document.getElementById("sbAppInstallBanner")) return;

    const banner = document.createElement("div");
    banner.id = "sbAppInstallBanner";
    banner.className = "app-install-banner";

    const tt = (typeof window.t === "function") ? window.t : (k => k);

    if(isAndroid){
      banner.innerHTML = `
        <div class="app-install-top">
          <div class="app-install-icon">🤖</div>
          <div class="app-install-content">
            <div class="app-install-title">
              <span>${tt("banner.androidTitle")}</span>
              <span class="app-install-badge">${tt("banner.recommended")}</span>
            </div>
            <div class="app-install-desc">${tt("banner.androidDesc")}</div>
          </div>
          <button type="button" class="app-install-close" id="sbAppInstallClose" aria-label="${tt("common.close")}">✕</button>
        </div>
        <a class="app-install-btn app-install-btn-wide" href="https://github.com/jschang0512/splitbill/releases/latest/download/splitbill.apk">${tt("banner.downloadApk")}</a>
      `;
    } else if(isIOS){
      banner.innerHTML = `
        <div class="app-install-top">
          <div class="app-install-icon">🍎</div>
          <div class="app-install-content">
            <div class="app-install-title">
              <span>${tt("banner.iosTitle")}</span>
              <span class="app-install-badge">iOS</span>
            </div>
            <div class="app-install-desc">${tt("banner.iosDesc")}</div>
          </div>
          <button type="button" class="app-install-close" id="sbAppInstallClose" aria-label="${tt("common.close")}">✕</button>
        </div>
      `;
    }

    document.body.appendChild(banner);

    // 平滑滑入
    setTimeout(()=>{
      banner.classList.add("show");
    }, 1200);

    const closeBtn = document.getElementById("sbAppInstallClose");
    if(closeBtn){
      closeBtn.addEventListener("click", ()=>{
        banner.classList.remove("show");
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setTimeout(()=> banner.remove(), 400);
      });
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", showBanner);
  } else {
    showBanner();
  }
})();
