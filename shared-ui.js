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

// ---------- Topbar「姓名 (群組)」：如果這個帳號同時在一個以上的群組裡，
// 把群組名稱換成跟全站其他下拉選單同一套外觀的小圓角選單（用 enhanceSelect
// 套上去，不是原生 <select> 那種瀏覽器預設樣式），選別的群組就直接呼叫
// switch_active_group 切換過去並跳到 summary.html，不用特地跑一趟設定頁的
// 「群組」分頁。只有一個群組時沒有切換的必要，維持原本純文字顯示。----------
async function renderWhoamiGroupSwitcher(sb, currentUser, myMember, getDisplayName){
  const nameEl = document.getElementById("whoamiName");
  const textWrap = document.getElementById("whoamiText");
  if(!nameEl || !currentUser) return;
  const displayName = (typeof getDisplayName === "function" ? getDisplayName() : null) || (myMember && myMember.name) || currentUser.email;
  const currentGroupName = (myMember && myMember.groups && myMember.groups.name) || "";

  const oldSwitcher = textWrap && textWrap.querySelector(".whoami-group-switcher");
  if(oldSwitcher) oldSwitcher.remove();

  let groups = [];
  try {
    const { data } = await sb.from("members")
      .select("group_id, groups(name)")
      .eq("user_id", currentUser.id)
      .is("left_at", null);
    groups = data || [];
  } catch(e){}

  nameEl.textContent = displayName;

  if(!myMember || groups.length <= 1){
    if(currentGroupName) nameEl.textContent = displayName + ` (${currentGroupName})`;
    return;
  }

  const sel = document.createElement("select");
  sel.title = "切換群組";
  groups.forEach(g=>{
    const opt = document.createElement("option");
    opt.value = g.group_id;
    opt.textContent = (g.groups && g.groups.name) || "?";
    if(g.group_id === myMember.group_id) opt.selected = true;
    sel.appendChild(opt);
  });

  const wrap = document.createElement("span");
  wrap.className = "whoami-group-switcher";
  wrap.appendChild(sel);
  (textWrap || nameEl.parentNode).appendChild(wrap);
  enhanceSelect(sel);

  sel.addEventListener("change", async ()=>{
    const targetId = sel.value;
    if(!targetId || targetId === myMember.group_id) return;
    const prevValue = myMember.group_id;
    sel.disabled = true;
    enhanceSelect(sel);
    const { error } = await sb.rpc("switch_active_group", { p_group_id: targetId });
    if(error){
      if(typeof sbAlert === "function") await sbAlert("切換失敗：" + error.message, "🔔 Splitbill 錯誤");
      sel.disabled = false;
      sel.value = prevValue;
      enhanceSelect(sel);
      return;
    }
    location.href = "summary.html";
  });
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
// 元件；settings.html 也拿來當切換/建立/加入群組成功的明顯回饋。
// actionLabel/actionFn 是選填的操作按鈕（例如刪除紀錄後的「復原」），
// 按下去會取消自動消失的倒數、立刻關掉 toast 並執行 actionFn。----------
function showToast(title, body, actionLabel, actionFn){
  let container = document.getElementById("sbToastContainer");
  if(!container){
    container = document.createElement("div");
    container.id = "sbToastContainer";
    container.className = "sb-toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "sb-toast";
  const textEl = document.createElement("div");
  textEl.className = "sb-toast-text";
  textEl.innerHTML = body ? `<b>${escapeHtml(title)}</b><span>${escapeHtml(body)}</span>` : `<b>${escapeHtml(title)}</b>`;
  toast.appendChild(textEl);

  const dismiss = () => {
    clearTimeout(autoDismissTimer);
    toast.classList.add("sb-toast-out");
    setTimeout(()=> toast.remove(), 250);
  };

  if(actionLabel && actionFn){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sb-toast-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", ()=>{
      dismiss();
      actionFn();
    });
    toast.appendChild(btn);
  }

  container.appendChild(toast);
  const autoDismissTimer = setTimeout(dismiss, actionLabel ? 5000 : 4000);
}

// ============================================================
// 全站頭貼點擊/觸碰懸浮放大預覽卡片 (Floating Magnified Avatar Card)
// ============================================================
(function initFloatingAvatarTooltip(){
  let cardEl = null;
  let hideTimer = null;

  function getCardEl(){
    if(!cardEl){
      cardEl = document.createElement("div");
      cardEl.id = "sbAvatarFloatingCard";
      cardEl.className = "sb-avatar-floating-card";
      document.body.appendChild(cardEl);
    }
    return cardEl;
  }

  function hideCard(){
    if(cardEl){
      cardEl.classList.remove("show");
    }
    if(hideTimer){
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function showCardForElement(targetEl){
    if(!targetEl) return;
    // 設定頁面與設定相關彈窗/編輯元件不觸發懸浮卡片
    if(location.pathname.endsWith("settings.html") ||
       location.href.includes("settings.html") ||
       targetEl.closest(".settings-card, #avatarCropModal, .avatar-crop-modal, .avatar-preview-wrap, .avatar-editor-modal, .profile-avatar-wrap, .member-manage-pill, .member-manage-row, .settings-section")){
      return;
    }

    // 嚴格排除所有類別相關與圖表元素
    if(targetEl.closest(".donut-slice, .donut-legend-item, .exp-cat-badge, .exp-cat-chip, .category-detail-modal-title, #catModalTitleWrap, .cat-modal-icon, .donut-center-info, .donut-svg-wrap, #donutScopeTabs, .exp-cat-dot")) return;

    // 嚴格限定為人物頭貼元件
    const avatar = targetEl.closest(".sb-avatar, .cat-exp-avatar-bubble, .mem-avatar, .avatar-wrap");
    if(!avatar) return;

    // 1. 取得名稱與原始文字
    let rawName = avatar.dataset.name ||
                  avatar.getAttribute("title") ||
                  avatar.querySelector("[data-name]")?.dataset?.name ||
                  avatar.querySelector(".sb-avatar-img")?.alt || "";

    if(!rawName || rawName === "?") return;

    // 2. 格式化身分標籤與純淨姓名
    let roleBadge = "";
    let cleanName = rawName;
    if(cleanName.startsWith("付款人:") || cleanName.startsWith("付款：")){
      roleBadge = "💳 付款人";
      cleanName = cleanName.replace(/^付款人[:：]\s*/, "");
    } else if(cleanName.startsWith("應付人:") || cleanName.startsWith("應付：")){
      roleBadge = "👥 應付人";
      cleanName = cleanName.replace(/^應付人[:：]\s*/, "");
    }

    let displayName = cleanName.replace(/\s*\([^)]*\)/g, "").trim();
    if(!displayName) displayName = cleanName;

    // 3. 取得頭像圖片或底色與字母
    const imgEl = avatar.querySelector("img");
    const imgSrc = (imgEl && imgEl.style.display !== "none" && imgEl.src) ? imgEl.src : "";
    const initialEl = avatar.querySelector(".sb-avatar-initial");
    const initialBg = (initialEl && initialEl.style.background) ? initialEl.style.background : (window.getAvatarColor ? window.getAvatarColor(displayName) : "#7A6B9E");
    const initialChar = (initialEl && initialEl.textContent ? initialEl.textContent.trim() : displayName.charAt(0).toUpperCase()) || "?";

    // 4. 計算該成員解鎖的勳章
    const memberBadges = (window.getMemberBadges ? window.getMemberBadges(cleanName) : []).slice(0, 4);
    const badgesHtml = memberBadges.length > 0
      ? `<div class="sb-afc-badges">${memberBadges.map(b => `<span class="sb-afc-badge-chip" title="${escapeHtml(b.desc)}">${b.icon} ${escapeHtml(b.name)}</span>`).join("")}</div>`
      : "";

    const card = getCardEl();
    const avatarHtml = imgSrc
      ? `<img src="${imgSrc}" class="sb-afc-avatar-img" alt="${escapeHtml(displayName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span class="sb-afc-avatar-initial" style="display:none;background:${initialBg};">${escapeHtml(initialChar)}</span>`
      : `<span class="sb-afc-avatar-initial" style="background:${initialBg};">${escapeHtml(initialChar)}</span>`;

    card.innerHTML = `
      <div class="sb-afc-avatar-wrap">
        ${avatarHtml}
      </div>
      <div class="sb-afc-info">
        <div class="sb-afc-name-row">
          <span class="sb-afc-name">${escapeHtml(displayName)}</span>
          ${roleBadge ? `<span class="sb-afc-role">${escapeHtml(roleBadge)}</span>` : ''}
        </div>
        ${badgesHtml}
      </div>
      <div class="sb-afc-arrow"></div>
    `;

    // 5. 精準定位至頭貼上方（並支援邊界自動翻轉、寬裕安全邊界與箭頭偏移校正）
    const rect = avatar.getBoundingClientRect();
    card.style.visibility = "hidden";
    card.style.display = "flex";
    card.classList.remove("flipped");

    const cardRect = card.getBoundingClientRect();
    const avatarCenterX = rect.left + rect.width / 2;
    let topPos = rect.top - cardRect.height - 14;

    // 若上方空間不足（< 16px），翻轉至下方
    if(topPos < 16){
      topPos = rect.bottom + 14;
      card.classList.add("flipped");
    }

    // 確保底部也不超出視窗邊界
    topPos = Math.max(12, Math.min(window.innerHeight - cardRect.height - 16, topPos));

    // 左右兩側保留寬裕邊界（至少 18px）
    const sideMargin = 18;
    const minLeft = cardRect.width / 2 + sideMargin;
    const maxLeft = window.innerWidth - cardRect.width / 2 - sideMargin;
    let leftPos = avatarCenterX;
    leftPos = Math.max(minLeft, Math.min(maxLeft, leftPos));

    // 箭頭動態對齊頭貼中心
    const arrow = card.querySelector(".sb-afc-arrow");
    if(arrow){
      const arrowLeft = Math.max(18, Math.min(cardRect.width - 18, (avatarCenterX - (leftPos - cardRect.width / 2))));
      arrow.style.left = `${arrowLeft}px`;
      arrow.style.transform = "translateX(-50%)";
    }

    card.style.top = `${topPos}px`;
    card.style.left = `${leftPos}px`;
    card.style.visibility = "visible";

    // 6. 觸發平滑彈出動畫
    card.classList.add("show");

    if(hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideCard, 2600);
  }

  // 監聽全域點擊
  document.addEventListener("click", (e)=>{
    if(e.target.closest(".donut-slice, .donut-legend-item, .exp-cat-badge, .exp-cat-chip, .category-detail-modal-title, #catModalTitleWrap, .cat-modal-icon, .donut-center-info, .donut-svg-wrap, #donutScopeTabs, .exp-cat-dot")){
      hideCard();
      return;
    }
    const avatar = e.target.closest(".sb-avatar, .cat-exp-avatar-bubble, .mem-avatar, .avatar-wrap");
    if(avatar){
      showCardForElement(avatar);
    } else {
      hideCard();
    }
  }, { passive: true });

  // 滾動時自動隱藏
  window.addEventListener("scroll", hideCard, { passive: true });
})();
