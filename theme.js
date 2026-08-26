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

  function init(){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "切換深色／淺色模式");
    btn.textContent = current === "dark" ? "☀️" : "🌙";
    btn.addEventListener("click", ()=>{
      current = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", current);
      btn.textContent = current === "dark" ? "☀️" : "🌙";
      try{ localStorage.setItem(KEY, current); }catch(e){}
    });
    document.body.appendChild(btn);
  }
  if(document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
