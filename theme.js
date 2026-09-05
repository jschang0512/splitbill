// Light/dark theme toggle. The actual theme is applied synchronously by an
// inline <script> at the top of each page's <head> (before first paint, to
// avoid a flash of the wrong theme) — this just reads that value and wires
// up the visible toggle button.
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
  // 帳務相關頁面（summary/currency/settings）把這顆按鈕改成「更多」選單
  // 的開關，深淺色只是選單裡其中一行，不再是按下去直接切換；那幾頁會
  // 自己定義 window.splitbillOpenThemeMenu，這裡有定義到才會改走選單，
  // 其餘頁面（登入、about、隱私權/服務條款…）沒有這個選單、維持原本
  // 按一下立即切換的行為。window.splitbillToggleTheme 是共用的實際切換
  // 邏輯，選單裡的「深色模式」那一行呼叫這個就好，不用另外複製一份。
  window.splitbillToggleTheme = applyToggle;

  function init(){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "切換深色／淺色模式");
    btn.textContent = current === "dark" ? "☀️" : "🌙";
    btn.addEventListener("click", ()=>{
      if(typeof window.splitbillOpenThemeMenu === "function"){
        window.splitbillOpenThemeMenu(btn);
        return;
      }
      applyToggle();
    });
    document.body.appendChild(btn);
  }
  if(document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
