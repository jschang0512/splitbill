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

// ---------- 成員名單：summary.html / currency.html(app.js) / settings.html
// 原本各自維護一份幾乎一樣的「抓目前群組成員」邏輯，三邊分開改很容易
// 漏掉其中一邊（settings.html 那份就曾經漏了 my_group_id 抓不到時的
// 復原機制）。統一成這一份共用函式，各頁的 loadMembers() 只留自己要
// 把結果存進哪些變數的那幾行。
//
// 回傳 { MEMBERS, memberById, myMember, memberRows }：
// - MEMBERS：目前群組（或這個帳號能看到）的完整成員陣列，name 欄位
//   已經套用暱稱覆蓋、accountName 保留原始帳號姓名。
// - memberById：{ 成員id: 顯示名稱 } 查詢表。
// - myMember：目前登入帳號在這批成員裡對應的那一筆（優先找還在群組
//   內的，找不到才退而求其次抓已退出的那筆），沒登入或找不到則 null。
// - memberRows：依 showLeftMembers 決定要不要把已退出成員也算進去。
async function loadGroupMembers(sb, currentUser, showLeftMembers){
  let activeGroupId = null;
  if(currentUser){
    try {
      const { data: gid, error: gidError } = await sb.rpc("my_group_id");
      if(!gidError && gid) activeGroupId = gid;
    } catch(e){}

    // 如果 my_group_id 沒抓到，從 members 表查出此 user_id 的第一筆啟用群組，
    // 順便把這次查到的結果存回去給下次用（不用等它回來，等了只是白白多卡
    // 一趟網路來回）。
    if(!activeGroupId){
      try {
        const { data: userMembers } = await sb.from("members")
          .select("id,user_id,group_id,name,nickname,email,shown_currencies,left_at,account_deleted_at,groups(name)")
          .eq("user_id", currentUser.id)
          .is("left_at", null)
          .limit(1);
        if(userMembers && userMembers.length > 0){
          activeGroupId = userMembers[0].group_id;
          sb.rpc("set_active_group", { p_group_id: activeGroupId }).catch(()=>{});
        }
      } catch(e){}
    }
  }

  let MEMBERS = [];
  try {
    let query = sb.from("members").select("id,user_id,group_id,name,nickname,email,avatar_url,shown_currencies,left_at,account_deleted_at,groups(name)").order("name");
    if(activeGroupId) query = query.eq("group_id", activeGroupId);
    const { data, error } = await query;
    if(error){
      console.error("讀取群組成員失敗：", error);
      const { data: fallbackData } = await sb.from("members").select("id,user_id,group_id,name,nickname,email,avatar_url,shown_currencies,left_at,account_deleted_at,groups(name)").order("name");
      MEMBERS = fallbackData || [];
    } else {
      MEMBERS = data || [];
    }
  } catch(e){
    console.error("讀取 members 異常：", e);
    MEMBERS = [];
  }

  MEMBERS.forEach(m=>{
    if(m.avatar_url){
      localStorage.setItem("sb_avatar_" + m.id, m.avatar_url);
      if(m.user_id) localStorage.setItem("sb_avatar_" + m.user_id, m.avatar_url);
    } else {
      localStorage.removeItem("sb_avatar_" + m.id);
      if(m.user_id) localStorage.removeItem("sb_avatar_" + m.user_id);
    }
    m.accountName = m.name; // 保留帳號原始姓名（不含暱稱/標籤），設定頁「姓名」欄位要用
    if(m.nickname) m.name = m.nickname; // 這個群組如果有另外設定暱稱，畫面上一律優先顯示暱稱
    // 退出/銷毀的「(退出)」「(銷毀)」後綴現在由資料庫 trigger 直接寫進 nickname，
    // 這裡不用再疊加一次，不然會變成「(銷毀) (銷毀)」。
  });

  const memberById = {};
  MEMBERS.forEach(m => memberById[m.id] = m.name);
  const myMember = currentUser
    ? (MEMBERS.find(m => m.user_id === currentUser.id && !m.left_at) || MEMBERS.find(m => m.user_id === currentUser.id))
    : null;
  const memberRows = showLeftMembers ? MEMBERS : MEMBERS.filter(m => !m.left_at);

  // 舊帳號的頭貼還是存整張圖片的 Base64 文字（v680 以前的做法，塞在
  // avatar_url 欄位裡，每次抓成員清單都要整包一起傳）——這裡偷偷在背景
  // 把它搬去 Storage，只存一個網址回去，不擋畫面渲染，也不用另外跑一次
  // 遷移指令碼：每個人下次登入自己就會被治好，失敗也沒關係，下次登入
  // 再試一次就好。
  if(myMember && myMember.avatar_url && myMember.avatar_url.startsWith("data:") && currentUser){
    migrateLegacyBase64Avatar(sb, currentUser, myMember).catch(()=>{});
  }

  return { MEMBERS, memberById, myMember, memberRows };
}

async function migrateLegacyBase64Avatar(sb, currentUser, myMember){
  const blob = await (await fetch(myMember.avatar_url)).blob();
  const path = `${currentUser.id}/avatar.jpg`;
  const { error: uploadErr } = await sb.storage.from("avatars").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true
  });
  if(uploadErr) throw uploadErr;
  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = pub.publicUrl + "?t=" + Date.now();

  const { error: memberErr } = await sb.from("members").update({ avatar_url: avatarUrl }).eq("user_id", currentUser.id);
  if(memberErr) throw memberErr;
  sb.auth.updateUser({ data: { avatar_url: avatarUrl } }).catch(()=>{});

  myMember.avatar_url = avatarUrl;
  localStorage.setItem("sb_avatar_" + myMember.id, avatarUrl);
  if(myMember.user_id) localStorage.setItem("sb_avatar_" + myMember.user_id, avatarUrl);
  localStorage.setItem("sb_my_avatar", avatarUrl);
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

  let autoDismissTimer = null;
  let countdownTimer = null;

  const dismiss = () => {
    if(autoDismissTimer) clearTimeout(autoDismissTimer);
    if(countdownTimer) clearInterval(countdownTimer);
    toast.classList.add("sb-toast-out");
    setTimeout(()=> toast.remove(), 250);
  };

  if(actionLabel && actionFn){
    let remaining = 5;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sb-toast-action";
    btn.textContent = `${actionLabel} (${remaining}s)`;
    btn.addEventListener("click", ()=>{
      dismiss();
      actionFn();
    });
    toast.appendChild(btn);

    const progress = document.createElement("div");
    progress.className = "sb-toast-progress";
    toast.appendChild(progress);

    countdownTimer = setInterval(()=>{
      remaining--;
      if(remaining > 0){
        btn.textContent = `${actionLabel} (${remaining}s)`;
      } else {
        clearInterval(countdownTimer);
      }
    }, 1000);
  }

  container.appendChild(toast);
  autoDismissTimer = setTimeout(dismiss, actionLabel ? 5000 : 4000);
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

    // (退出)/(銷毀) 是資料庫直接寫進暱稱的離開標籤，特地留著不濾掉，
    // 其他括號內容（雜訊）維持原本邏輯照樣清掉。
    let displayName = cleanName.replace(/\s*\((?!退出\)|銷毀\))[^)]*\)/g, "").trim();
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

// ============================================================
// App 已安裝、正在執行時，掃到邀請 QR code（App Links 驗證通過後系統會
// 直接把 https://.../splitbill/index.html?join=代碼 這個網址交給 App，
// 不會另外開系統瀏覽器）——不管使用者這時候人在 index/settings/summary/
// currency 哪一頁，都先把邀請碼存起來；如果已經登入，直接導去設定頁的
// 「用邀請碼加入」，讓使用者接著完成；還沒登入的話不用多做什麼，登入完成
// 後既有流程（showGroupChoiceScreen）本來就會自己讀出這個值來用。
// ============================================================
(function(){
  if(typeof window.Capacitor === "undefined" || !window.Capacitor.Plugins || !window.Capacitor.Plugins.App) return;
  window.Capacitor.Plugins.App.addListener("appUrlOpen", (event)=>{
    if(!event || !event.url) return;
    let joinCode = "";
    try{ joinCode = new URL(event.url).searchParams.get("join") || ""; }catch(e){}
    if(!joinCode) return;
    localStorage.setItem("splitbill-pending-invite-code", joinCode);
    if(window.currentUser){
      location.href = "settings.html";
    }
  });
})();

// ============================================================
// 🔔 站內通知夾：取代原本要靠瀏覽器/系統推播權限才會動的通知機制。
// Capacitor（原生 App）用 Google Firebase、網頁版用 Supabase 各自
// 要另外處理推播權限，使用者常常沒開，通知等於白做——改成新增支出/
// 還款、催款提醒都直接寫進 notifications 這張表，不管有沒有開任何
// 系統權限都看得到。三個頁面（summary/currency/settings）登入後都呼叫
// initNotificationBell(sb, myMember)，把小鈴鐺按鈕跟未讀數字掛到頁面
// 上原本 topbar-actions 裡的 #notificationBellContainer。
// ============================================================
async function initNotificationBell(sb, myMember){
  const container = document.getElementById("notificationBellContainer");
  if(!container || !myMember) return;

  container.innerHTML = `
    <div class="notif-bell-wrap" id="notifBellWrap">
      <button type="button" class="icon-btn notif-bell-btn" id="notifBellBtn" title="通知" aria-label="通知">
        🔔<span class="notif-badge hidden" id="notifBadge">0</span>
      </button>
      <div class="notif-panel hidden" id="notifPanel">
        <div class="notif-panel-head">
          <span>通知</span>
          <button type="button" class="link-btn" id="notifMarkAllReadBtn">全部標為已讀</button>
        </div>
        <div class="notif-panel-list" id="notifPanelList"></div>
      </div>
    </div>
  `;

  const bellBtn = document.getElementById("notifBellBtn");
  const panel = document.getElementById("notifPanel");
  const badge = document.getElementById("notifBadge");
  const listEl = document.getElementById("notifPanelList");
  const markAllBtn = document.getElementById("notifMarkAllReadBtn");

  function notifTimeAgo(iso){
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if(mins < 1) return "剛剛";
    if(mins < 60) return mins + " 分鐘前";
    const hrs = Math.floor(mins / 60);
    if(hrs < 24) return hrs + " 小時前";
    const days = Math.floor(hrs / 24);
    if(days < 7) return days + " 天前";
    return new Date(iso).toLocaleDateString("zh-TW");
  }

  async function refreshBadge(){
    const { count, error } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("member_id", myMember.id)
      .eq("is_read", false);
    if(error){
      // 故意不要把「查詢失敗」悄悄當成「0 則通知」處理掉——不然這張表
      // 建錯、RLS 設錯之類的真問題，畫面上永遠只會顯示正常的 0，完全
      // 看不出來哪裡壞了。
      console.error("讀取通知數量失敗：", error);
      return;
    }
    const n = count || 0;
    if(badge){
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.classList.toggle("hidden", n === 0);
    }
  }

  async function loadList(){
    listEl.innerHTML = `<p class="filter-hint">載入中…</p>`;
    const { data, error } = await sb
      .from("notifications")
      .select("id,type,title,body,is_read,created_at")
      .eq("member_id", myMember.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if(error){
      console.error("讀取通知清單失敗：", error);
      listEl.innerHTML = `<p class="filter-hint">通知載入失敗，請稍後再試</p>`;
      return;
    }
    if(!data || !data.length){
      listEl.innerHTML = `<p class="filter-hint">目前沒有任何通知</p>`;
      return;
    }
    listEl.innerHTML = data.map(n => `
      <div class="notif-item${n.is_read ? "" : " unread"}" data-id="${n.id}">
        <div class="notif-item-main">
          <div class="notif-item-title">${n.is_read ? "" : '<span class="notif-unread-dot"></span>'}${escapeHtml(n.title)}</div>
          <div class="notif-item-body">${escapeHtml(n.body)}</div>
          <div class="notif-item-time">${notifTimeAgo(n.created_at)}</div>
        </div>
        <button type="button" class="notif-item-del" data-id="${n.id}" title="刪除這則通知" aria-label="刪除">✕</button>
      </div>
    `).join("");
    listEl.querySelectorAll(".notif-item-main").forEach(el=>{
      el.addEventListener("click", async ()=>{
        const item = el.closest(".notif-item");
        if(item.classList.contains("unread")){
          item.classList.remove("unread");
          await sb.from("notifications").update({ is_read: true }).eq("id", item.dataset.id);
          refreshBadge();
        }
      });
    });
    listEl.querySelectorAll(".notif-item-del").forEach(btn=>{
      btn.addEventListener("click", async (e)=>{
        e.stopPropagation();
        const item = btn.closest(".notif-item");
        const wasUnread = item.classList.contains("unread");
        item.remove();
        await sb.from("notifications").delete().eq("id", btn.dataset.id);
        if(wasUnread) refreshBadge();
        if(!listEl.querySelector(".notif-item")){
          listEl.innerHTML = `<p class="filter-hint">目前沒有任何通知</p>`;
        }
      });
    });
  }

  // 面板固定寬度 320px（窄螢幕會被 CSS 的 max-width 夾住縮小），開啟
  // 當下才用鈴鐺按鈕實際的螢幕座標算 top/left，並且左右都留至少 12px
  // 安全邊界，不管在哪一頁、手機還是電腦，面板都不會被切出螢幕外。
  function positionNotifPanel(){
    const rect = bellBtn.getBoundingClientRect();
    const margin = 12;
    const panelWidth = Math.min(320, window.innerWidth - margin * 2);
    let left = rect.right - panelWidth;
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
    let top = rect.bottom + 10;
    top = Math.min(top, window.innerHeight - 80);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }

  if(bellBtn){
    bellBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const willOpen = panel.classList.contains("hidden");
      if(willOpen) positionNotifPanel();
      panel.classList.toggle("hidden", !willOpen);
      if(willOpen) loadList();
    });
  }
  window.addEventListener("resize", ()=>{
    if(!panel.classList.contains("hidden")) positionNotifPanel();
  });
  document.addEventListener("click", (e)=>{
    if(!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== bellBtn){
      panel.classList.add("hidden");
    }
  });
  if(markAllBtn){
    markAllBtn.addEventListener("click", async ()=>{
      await sb.from("notifications").update({ is_read: true }).eq("member_id", myMember.id).eq("is_read", false);
      listEl.querySelectorAll(".notif-item.unread").forEach(el => el.classList.remove("unread"));
      refreshBadge();
    });
  }

  refreshBadge();

  // 即時更新未讀數字：這個帳號一有新通知寫進來就重新算一次角標，
  // 面板開著的話順便重畫清單，不用手動重新整理頁面才看得到。
  sb.channel("notif-" + myMember.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `member_id=eq.${myMember.id}` }, () => {
      refreshBadge();
      if(!panel.classList.contains("hidden")) loadList();
    })
    .subscribe();
}
window.initNotificationBell = initNotificationBell;
