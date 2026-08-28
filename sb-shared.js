// ============================================================
// 全站共用的小工具，給 index.html / settings.html / summary.html /
// currency.html（透過 app.js）一起載入使用。
//
// 這幾個原本是四個地方各自複製一份維護的（escapeHtml、自訂下拉選單、
// 滑動式登入過期判斷），改一邊常常忘了改另一邊——例如「複製精簡版/完整版」
// 那次的 cleanNote/copyToClipboard 就是這種複製貼上沒同步造成的 bug。
// 抽成這份共用檔案後，四個地方永遠是同一份程式碼、同一個行為。
//
// forceLogout() 沒有放進來：每個頁面 session 失效後要導去的網址不一樣
// （例如 currency.html 要帶著 ?c=幣別、?redirect= 這些各自的參數），
// 硬塞進共用檔案反而要多繞一層參數傳遞，維持各頁面自己定義、呼叫這裡的
// isSessionExpired()/refreshLoginTime() 就好，是比較單純的做法。
// ============================================================

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ---------- 滑動式登入過期判斷：只要在 12 小時內有繼續使用（換頁、或這頁
// 還開著撐過一次 5 分鐘的檢查），時間就往後推，不會單純因為帳號用得久就
// 被踢出；真的超過 12 小時完全沒有任何動作才會被登出。----------
const LOGIN_TIME_KEY = "sb_login_time";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
function isSessionExpired(){
  const loginTime = Number(localStorage.getItem(LOGIN_TIME_KEY));
  if(!loginTime) return false;
  return (Date.now() - loginTime > SESSION_DURATION_MS);
}
function refreshLoginTime(){
  localStorage.setItem(LOGIN_TIME_KEY, String(Date.now()));
}

// ---------- 全站統一的自訂下拉選單：外觀跟債務趨勢圖的日/週/月/年選單一致。
// 把真正的 <select> 包一層視覺隱藏起來當資料來源，.value/innerHTML/dataset
// 這些既有邏輯完全不用改；每次選項或值有變動，呼叫 enhanceSelect(選到的
// select) 讓畫面上顯示的按鈕/選單重新同步一次即可（第一次呼叫時才會真的
// 建立包裝）。----------
function enhanceSelect(selectEl){
  if(!selectEl) return;
  if(!selectEl._ddSync){
    const wrap = document.createElement("div");
    wrap.className = "dd-select";
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);
    selectEl.tabIndex = -1; // 視覺隱藏的原生 select 不該再佔用 Tab 鍵順序，交給下面的 .dd-btn
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dd-btn";
    btn.innerHTML = '<span class="dd-btn-text"></span><span class="dd-caret">▾</span>';
    const textEl = btn.querySelector(".dd-btn-text");
    const menu = document.createElement("div");
    menu.className = "dd-menu hidden";
    wrap.appendChild(btn);
    wrap.appendChild(menu);

    const closeMenu = () => { menu.classList.add("hidden"); btn.classList.remove("open"); };
    const openMenu = () => { menu.classList.remove("hidden"); btn.classList.add("open"); };
    btn.addEventListener("click", (e)=>{
      e.stopPropagation();
      if(selectEl.disabled) return;
      menu.classList.contains("hidden") ? openMenu() : closeMenu();
    });
    document.addEventListener("click", (e)=>{ if(!wrap.contains(e.target)) closeMenu(); });

    selectEl._ddSync = function(){
      menu.innerHTML = "";
      Array.from(selectEl.options).forEach((o, i)=>{
        const optBtn = document.createElement("button");
        optBtn.type = "button";
        optBtn.className = "dd-option" + (o.selected ? " active" : "");
        optBtn.textContent = o.textContent;
        optBtn.disabled = o.disabled;
        optBtn.addEventListener("click", ()=>{
          selectEl.selectedIndex = i;
          closeMenu();
          selectEl._ddSync();
          selectEl.dispatchEvent(new Event("change", { bubbles:true }));
        });
        menu.appendChild(optBtn);
      });
      const cur = selectEl.selectedOptions[0];
      textEl.textContent = cur ? cur.textContent : "";
      btn.classList.toggle("disabled", !!selectEl.disabled);
      closeMenu();
    };
  }
  selectEl._ddSync();
}

// ---------- 帳務更動的即時通知小提示卡，跟 app.js 的即時同步共用同一套
// 元件；settings.html 也拿來當切換/建立/加入群組成功的明顯回饋。----------
function showToast(title, body){
  let container = document.getElementById("sbToastContainer");
  if(!container){
    container = document.createElement("div");
    container.id = "sbToastContainer";
    container.className = "sb-toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "sb-toast";
  toast.innerHTML = `<b>${escapeHtml(title)}</b>${escapeHtml(body)}`;
  container.appendChild(toast);
  setTimeout(()=>{
    toast.classList.add("sb-toast-out");
    setTimeout(()=> toast.remove(), 250);
  }, 4000);
}
