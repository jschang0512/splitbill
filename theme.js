// Light/dark theme toggle. The actual theme is applied synchronously by an
// inline <script> at the top of each page's <head> (before first paint, to
// avoid a flash of the wrong theme) — this just reads that value and wires
// up either the visible corner toggle button or exposes the raw toggle
// function for the settings page to call directly.
//
// currency.html／summary.html／settings.html 已經把深淺色（跟語言）收進
// 「設定」頁管理，不再需要角落的浮動按鈕。但 about/privacy/terms/index
// 這幾頁不需要登入就看得到、也進不去「設定」頁，還是要留一顆角落按鈕
// 當唯一切換入口——用「這頁有沒有 #langSwitcher 這個 HTML 區塊」當判斷
// 依據（跟語言切換鈕綁在一起顯示，要嘛兩個都在、要嘛兩個都不在）。
(function themeToggle(){
  const KEY = "splitbill-theme";

  function getPreferred(){
    const applied = document.documentElement.getAttribute("data-theme");
    if(applied === "dark" || applied === "light") return applied;
    try{
      const saved = localStorage.getItem(KEY);
      if(saved === "dark" || saved === "light") return saved;
    }catch(e){}
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }

  let current = getPreferred();
  document.documentElement.setAttribute("data-theme", current);

  function applyToggle(){
    current = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", current);
    try{ localStorage.setItem(KEY, current); }catch(e){}
    // 債務關係表熱圖的顏色是算好直接寫進 inline style 的，不是純 CSS
    // 變數，切換深淺模式不會自動跟著換，這裡另外發一個事件讓 app.js
    // 有機會重畫一次。
    window.dispatchEvent(new CustomEvent("splitbill-theme-change", { detail: { theme: current } }));
    document.querySelectorAll(".theme-toggle").forEach(b => { b.textContent = current === "dark" ? "☀️" : "🌙"; });
  }

  // 設定頁的「深色模式」那一列直接呼叫這個做實際切換，不用找/模擬
  // 點擊角落按鈕。
  window.splitbillToggleTheme = applyToggle;
  window.splitbillGetTheme = () => current;

  function init(){
    // 沒有語言切換鈕的頁面（currency/summary/settings）不建立浮動按鈕。
    if(!document.getElementById("langSwitcher")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", (typeof window.t === "function") ? window.t("shared.themeToggleAria") : "切換深色／淺色模式");
    btn.textContent = current === "dark" ? "☀️" : "🌙";
    btn.addEventListener("click", applyToggle);
    // 掛進 .wrap（跟 .lang-switcher 同一個容器）而不是直接掛在 body 下面——
    // .theme-toggle 是 position:absolute，定位基準是「最近的
    // position:relative 祖先」，掛在 body 下面的話，寬螢幕時 body 是
    // 整個瀏覽器視窗寬，right:14px 就會貼到視窗最右邊、跟置中的內容欄
    // 脫節；.wrap 本身有 max-width 置中，掛進去才會跟語言切換鈕一樣
    // 貼齊內容欄的右邊界。
    (document.querySelector(".wrap") || document.body).appendChild(btn);
    document.addEventListener("splitbill-lang-changed", ()=>{
      if(typeof window.t === "function") btn.setAttribute("aria-label", window.t("shared.themeToggleAria"));
    });
  }
  if(document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
