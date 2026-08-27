// ============================================================
// Split Bill — shared app logic, used by currency.html (?c=TWD/JPY/USD/...).
// ============================================================
(function(){
  // 檢查 Supabase SDK 是否成功載入 (防止 CDN 被阻擋導致全頁空白)
  if(typeof window.supabase === "undefined"){
    if(typeof hidePwaSplash === "function") hidePwaSplash();
    const warn = document.getElementById("configWarning");
    if(warn){
      warn.innerHTML = "<h2>⚠️ 載入失敗</h2><p class='config-warning-text'>無法載入 Supabase SDK (cdn.jsdelivr.net)，請檢查網路連線或是否開啟了廣告阻擋套件。</p>";
      warn.classList.remove("hidden");
    }
    return;
  }

  if(!SUPABASE_URL || SUPABASE_URL.startsWith("YOUR_") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.startsWith("YOUR_")){
    if(typeof hidePwaSplash === "function") hidePwaSplash();
    const warn = document.getElementById("configWarning");
    if(warn) warn.classList.remove("hidden");
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const SYM = CURRENCY_SYMBOL;

  // 帳密登入/註冊/忘記密碼/連結帳號失敗時，先判斷是不是幾種已知的常見情況，
  // 不然會顯示 Supabase 原始的英文錯誤，或被誤會成帳號密碼打錯。回傳 null
  // 代表不是這幾種情況，呼叫的地方應該照原本的訊息處理。
  // （登入/註冊本身已經搬去 index.html，這裡只有連結 Google/Discord 帳號會用到。）
  function friendlyAuthErr(error){
    const msg = (error && error.message) || "";
    if(/captcha/i.test(msg)) return "安全驗證還沒完成，請稍等一下再試一次";
    if(/already linked|already exists/i.test(msg)) return "這個帳號已經連結到另一個 Splitbill 帳號了，要先去那邊解除連結（或銷毀那個帳號）才能連過來這裡";
    return null;
  }

  // ---------- 全站統一優雅自訂彈窗 (取代瀏覽器原生 alert / confirm) ----------
  function showSbDialog({ title = "🔔 Splitbill 通知", message = "", confirmText = "確定", cancelText = null }){
    return new Promise(resolve => {
      let modal = document.getElementById("sbDialogModal");
      if(!modal){
        modal = document.createElement("div");
        modal.id = "sbDialogModal";
        modal.className = "calc-modal sb-dialog-modal";
        modal.innerHTML = `
          <div class="calc-card card sb-dialog-card">
            <div class="sb-dialog-header">
              <div class="sb-dialog-title" id="sbDialogTitle">🔔 Splitbill 通知</div>
              <button type="button" class="calc-close" id="sbDialogCloseBtn">✕</button>
            </div>
            <div class="sb-dialog-body" id="sbDialogBody"></div>
            <div class="sb-dialog-actions" id="sbDialogActions"></div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      const titleEl = document.getElementById("sbDialogTitle");
      const bodyEl = document.getElementById("sbDialogBody");
      const actionsEl = document.getElementById("sbDialogActions");
      const closeBtn = document.getElementById("sbDialogCloseBtn");

      if(titleEl) titleEl.textContent = title;
      if(bodyEl) bodyEl.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");

      actionsEl.innerHTML = "";
      if(cancelText){
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn secondary small sb-dialog-cancel";
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = () => {
          modal.classList.remove("show");
          resolve(false);
        };
        actionsEl.appendChild(cancelBtn);
      }

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "btn small sb-dialog-confirm";
      confirmBtn.textContent = confirmText;
      confirmBtn.onclick = () => {
        modal.classList.remove("show");
        resolve(true);
      };
      actionsEl.appendChild(confirmBtn);

      closeBtn.onclick = () => {
        modal.classList.remove("show");
        resolve(false);
      };

      modal.onclick = (e) => {
        if(e.target === modal){
          modal.classList.remove("show");
          resolve(false);
        }
      };

      modal.classList.add("show");
    });
  }

  function sbAlert(message, title = "🔔 Splitbill 通知"){
    return showSbDialog({ title, message, confirmText: "確定" });
  }

  function sbConfirm(message, title = "🔔 Splitbill 確認"){
    return showSbDialog({ title, message, confirmText: "確定", cancelText: "取消" });
  }

  window.sbAlert = sbAlert;
  window.sbConfirm = sbConfirm;

  // ---------- 所有 .msg 狀態訊息（成功/失敗提示）5 秒後自動消失 ----------
  // 用 MutationObserver 統一處理，不用每個 msg.textContent = "..." 的地方都手動加 setTimeout。
  (function(){
    const timers = new WeakMap();
    function scheduleClear(el){
      if(!el.textContent) return;
      if(timers.has(el)) clearTimeout(timers.get(el));
      timers.set(el, setTimeout(()=>{ el.textContent = ""; timers.delete(el); }, 5000));
    }
    new MutationObserver(muts=>{
      const seen = new Set();
      muts.forEach(m=>{
        let el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        while(el && el !== document.body){
          if(el.classList && el.classList.contains("msg")){
            if(!seen.has(el)){ seen.add(el); scheduleClear(el); }
            break;
          }
          el = el.parentElement;
        }
      });
    }).observe(document.body, { childList: true, characterData: true, subtree: true });
  })();

  // ---------- 設定頁裡的 ⓘ 說明按鈕：點了才展開對應的說明文字 ----------
  document.addEventListener("click", (e)=>{
    const btn = e.target.closest(".info-btn");
    if(!btn) return;
    const target = document.getElementById(btn.dataset.infoFor);
    if(target) target.classList.toggle("hidden");
  });

  // ---------- 密碼欄位的小眼睛（顯示/隱藏密碼） ----------
  document.querySelectorAll(".pw-toggle-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const input = btn.closest(".pw-input-wrap").querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "🙈" : "👁️";
      btn.setAttribute("aria-label", show ? "隱藏密碼" : "顯示密碼");
    });
  });

  let currentUser = null;
  // myMember：目前登入的人在「目前啟用群組」裡對應的那一筆 members 資料。
  // members.id 不等於 auth 的 user id（一人可能同時屬於多個群組，每個群組各一筆
  // members 列），所有支出/還款/留言裡代表「我自己」的地方都要用 myMember.id，
  // 不能直接用 currentUser.id。
  let myMember = null;
  let memberRows = [];
  let memberById = {};
  // 是否在債務表／成員清單等畫面顯示已退出或帳號已銷毀的成員（純個人裝置端偏好）
  let showLeftMembers = localStorage.getItem("splitbill-show-left-members") !== "0";

  // 金額格式化：不進行整數四捨五入，保留精確位數（最多2位小數）
  function formatAmt(v){
    if(v === undefined || v === null || isNaN(v) || Math.abs(v) < 0.001) return "0";
    const num = Number(v);
    return num.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // ---------- optional currency-conversion hint（適用任何幣別，不是只有日幣） ----------
  let conversionRate = null;
  function fetchConversionRate(){
    if(!SHOW_CONVERSION) return;
    const lc = CURRENCY.toLowerCase();
    const sources = [
      { url:`https://open.er-api.com/v6/latest/${CURRENCY}`, parse:d => d && d.rates && d.rates.TWD },
      { url:`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${lc}.json`, parse:d => d && d[lc] && d[lc].twd },
      { url:`https://latest.currency-api.pages.dev/v1/currencies/${lc}.json`, parse:d => d && d[lc] && d[lc].twd }
    ];
    function tryFetch(i){
      if(i >= sources.length) return;
      fetch(sources[i].url)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          const rate = sources[i].parse(data);
          if(!rate) throw new Error("no rate");
          conversionRate = rate;
          updateExchangeRateHint();
          if(currentUser) refreshExpenses();
        })
        .catch(()=> tryFetch(i+1));
    }
    tryFetch(0);
  }
  // 幣別頁最上面秀一行「即時匯率」小字，讓人一眼看到匯率本身，不用
  // 特地去點某一筆支出才看得到換算後的台幣提示。
  function updateExchangeRateHint(){
    const el = document.getElementById("exchangeRateHint");
    if(!el || !SHOW_CONVERSION || !conversionRate) return;
    const rateText = conversionRate >= 1
      ? conversionRate.toLocaleString("zh-TW", { maximumFractionDigits: 2 })
      : conversionRate.toLocaleString("zh-TW", { maximumFractionDigits: 4 });
    el.textContent = `💱 即時匯率：${CURRENCY_SYMBOL}1 ≈ NT$${rateText}`;
    el.classList.remove("hidden");
  }
  fetchConversionRate();
  function conversionHintText(amount){
    if(!SHOW_CONVERSION || !conversionRate) return "";
    const converted = (amount * conversionRate).toFixed(0);
    return `≈NT$${Number(converted).toLocaleString()}`;
  }
  function conversionHint(amount){
    const text = conversionHintText(amount);
    return text ? `<span class="twd-hint">${text}</span>` : "";
  }

  const appScreen = document.getElementById("appScreen");

  // ---------- 成員名單：直接從 Supabase members 表讀取，改人不用改程式碼 ----------
  let MEMBERS = [];
  function isRealEmail(email){
    return !!email && !email.endsWith("@splitbill.local");
  }
  async function loadMembers(){
    let activeGroupId = null;
    if(currentUser){
      try {
        const { data: gid, error: gidError } = await sb.rpc("my_group_id");
        if(!gidError && gid) activeGroupId = gid;
      } catch(e){}

      // 如果 my_group_id 沒抓到，從 members 表查出此 user_id 的第一筆啟用群組
      if(!activeGroupId){
        try {
          const { data: userMembers } = await sb.from("members")
            .select("id,user_id,group_id,name,nickname,email,shown_currencies,left_at,account_deleted_at,groups(name)")
            .eq("user_id", currentUser.id)
            .is("left_at", null)
            .limit(1);
          if(userMembers && userMembers.length > 0){
            activeGroupId = userMembers[0].group_id;
            try { await sb.rpc("set_active_group", { p_group_id: activeGroupId }); } catch(e){}
          }
        } catch(e){}
      }
    }

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
      if(m.account_deleted_at) m.name = m.name + " (銷毀)";
      else if(m.left_at) m.name = m.name + " (退出)";
    });
    memberById = {};
    MEMBERS.forEach(m => memberById[m.id] = m.name);
    myMember = currentUser ? (MEMBERS.find(m => m.user_id === currentUser.id && !m.left_at) || MEMBERS.find(m => m.user_id === currentUser.id)) : null;
    memberRows = showLeftMembers ? MEMBERS : MEMBERS.filter(m => !m.left_at);
  }
  const membersLoadedPromise = loadMembers();

  function emailToName(email){
    const m = MEMBERS.find(x=>x.email === email);
    return m ? m.name : email;
  }

  // ---------- 12-hour auto-logout（滑動式：詳見 refreshLoginTime） ----------
  const LOGIN_TIME_KEY = "sb_login_time";
  const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

  function isSessionExpired(){
    const loginTime = Number(localStorage.getItem(LOGIN_TIME_KEY));
    if(!loginTime) return false;
    return (Date.now() - loginTime > SESSION_DURATION_MS);
  }
  // 滑動式：只要在 12 小時內有繼續使用，時間就往後推，不會單純因為
  // 帳號用得久就被踢出；真的超過 12 小時完全沒有任何動作才會被登出。
  function refreshLoginTime(){
    localStorage.setItem(LOGIN_TIME_KEY, String(Date.now()));
  }
  // 登入畫面已經搬去 index.html，這裡 session 一失效就直接導過去，
  // 帶著 redirect 記住目前這個幣別頁，登入完成後才回得來。
  async function forceLogout(){
    try{ await sb.auth.signOut(); }catch(e){}
    localStorage.removeItem(LOGIN_TIME_KEY);
    location.href = "index.html?redirect=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
  }
  setInterval(()=>{ if(isSessionExpired()) forceLogout(); else refreshLoginTime(); }, 5 * 60 * 1000);

  const logoutBtn = document.getElementById("logoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", async ()=>{
      localStorage.removeItem(LOGIN_TIME_KEY);
      await sb.auth.signOut();
      location.href = "index.html";
    });
  }

  const tabIndicator = document.querySelector(".app-tabs .tab-indicator");
  function moveTabIndicator(activeTab){
    if(!tabIndicator || !activeTab) return;
    tabIndicator.style.width = activeTab.offsetWidth + "px";
    tabIndicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
  }
  document.querySelectorAll(".app-tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      document.querySelectorAll(".app-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll(".app-panel").forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");
      moveTabIndicator(tab);
      const panelId = "panel" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
      const panel = document.getElementById(panelId);
      if(panel) panel.classList.add("active");
    });
  });
  window.addEventListener("resize", ()=>{
    moveTabIndicator(document.querySelector(".app-tab.active"));
  });

  const filterToggleHead = document.getElementById("filterToggleHead");
  if(filterToggleHead){
    filterToggleHead.addEventListener("click", ()=>{
      const head = document.getElementById("filterToggleHead");
      const body = document.getElementById("filterBody");
      const open = head.classList.toggle("open");
      body.classList.toggle("open", open);
      body.style.maxHeight = open ? (body.scrollHeight + "px") : "0px";
    });
  }

  // (篩選器切換與歷史紀錄切換統一由 switchHistoryTab 處理)

  // ---------- 帳務更動通知 ----------
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

  // Web Push 公鑰（可公開，用來讓瀏覽器跟推播服務建立訂閱）
  const VAPID_PUBLIC_KEY = "BNR-GFJ6UxpQWVk6ghTFNUl9RYncDp_WX9W6XNA1vqsyWk9zQ4WC5ghAGiuBqqXQhluRiVB7KsAPGxTWNl27JW4";

  function urlBase64ToUint8Array(base64String){
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  const notifyBtn = document.getElementById("notifyBtn");
  const notifyHint = document.getElementById("notifyHint");
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
  const NOTIFY_HINT_DEFAULT = "開啟後，只要有跟你相關的支出或還款有異動就會通知你。";
  const NOTIFY_HINT_BLOCKED = "🔕 通知已經被瀏覽器封鎖了，需要手動解除：\n手機：瀏覽器選單 → 網站設定（或「這個網站的權限」）→ 通知 → 改成允許\n電腦：網址列左邊的鎖頭／ⓘ 圖示 → 通知 → 改成允許\n改完後重新整理網頁即可。";

  async function updateNotifyBtnState(){
    if(!notifyBtn) return;
    if(!pushSupported){
      notifyBtn.classList.add("hidden");
      return;
    }
    notifyBtn.classList.remove("hidden");
    notifyBtn.disabled = false;
    if(Notification.permission === "denied"){
      notifyBtn.textContent = "🔕";
      notifyBtn.title = "通知已被瀏覽器封鎖，點一下看怎麼打開";
      notifyBtn.classList.remove("active");
      if(notifyHint) notifyHint.textContent = NOTIFY_HINT_BLOCKED;
      return;
    }
    if(notifyHint) notifyHint.textContent = NOTIFY_HINT_DEFAULT;
    if(Notification.permission === "granted"){
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if(sub){
        notifyBtn.textContent = "🔔";
        notifyBtn.title = "通知已開啟（點擊關閉）";
        notifyBtn.classList.add("active");
        return;
      }
    }
    notifyBtn.textContent = "🔔";
    notifyBtn.title = "點擊開啟通知";
    notifyBtn.classList.remove("active");
  }

  // 登入後自動嘗試訂閱（預設開啟）；如果瀏覽器已經封鎖或使用者已關閉過，
  // 這裡什麼都不會發生，不會硬跳出來吵。
  async function ensurePushSubscribed(){
    if(!pushSupported || !currentUser) return;
    if(Notification.permission === "denied"){ await updateNotifyBtnState(); return; }

    const permission = await Notification.requestPermission();
    if(permission !== "granted"){ await updateNotifyBtnState(); return; }

    try{
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if(!sub){
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }
      const subJson = sub.toJSON();
      const { error } = await sb.from("push_subscriptions").upsert({
        member_id: myMember.id,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth
      }, { onConflict: "endpoint" });
      if(error){
        // 伺服器沒存到訂閱資料的話，瀏覽器端的訂閱也要一起撤銷，不然按鈕
        // 會顯示「已開啟」但其實永遠收不到通知，使用者完全不會發現。
        console.error("推播訂閱寫入失敗：", error);
        await sub.unsubscribe();
        await sbAlert("開啟通知失敗，請稍後再試一次。");
      }
    }catch(e){
      console.error("推播訂閱失敗：", e);
    }
    await updateNotifyBtnState();
  }

  // 按鈕點擊：目前開著就關掉，目前關著就打開
  async function toggleNotify(){
    if(!pushSupported || !currentUser) return;

    if(Notification.permission === "denied"){
      await sbAlert("通知被瀏覽器封鎖了，程式沒辦法自己打開，要自己去手動解除：\n\n手機：瀏覽器選單 → 網站設定（或「這個網站的權限」）→ 通知 → 改成允許\n電腦：網址列左邊的鎖頭／ⓘ 圖示 → 通知 → 改成允許\n\n改完之後重新整理網頁就可以了。");
      return;
    }

    if(Notification.permission === "granted"){
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if(sub){
        const { error } = await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        if(error) console.error("取消推播訂閱寫入失敗：", error);
        await sub.unsubscribe();
        await updateNotifyBtnState();
        return;
      }
    }

    await ensurePushSubscribed();
  }

  if(notifyBtn){
    updateNotifyBtnState();
    notifyBtn.addEventListener("click", toggleNotify);
  }

  function isRelevantToMe(table, row){
    if(!row || !myMember) return false;
    if(table === "expenses"){
      return (row.payers || []).some(p => p.member_id === myMember.id) ||
             (row.shares || []).some(s => s.member_id === myMember.id);
    }
    if(table === "repayments"){
      return row.from_member === myMember.id || row.to_member === myMember.id;
    }
    return false;
  }

  function notifyRelevantChange(table, payload){
    const row = (payload.new && Object.keys(payload.new).length) ? payload.new : payload.old;
    if(!isRelevantToMe(table, row)) return;
    if(payload.eventType === "DELETE") return; // 刪除先不通知，避免太吵

    // 1. 如果是操作者本人自己的動作，不發送遠端即時廣播通知給自己（避免與本地成功彈窗重疊跳出雙重通知）
    if(myMember && (row.created_by === myMember.id || (table === "repayments" && row.from_member === myMember.id))){
      return;
    }

    const actor = memberById[row.created_by] || "有人";
    let title, body;
    if(table === "expenses"){
      title = payload.eventType === "INSERT" ? "📋 新增支出" : "📋 支出更新";
      let cleanDesc = (row.description || "")
        .replace(/<!--[\s\S]*?-->/gi, "")
        .replace(/<!--AI_RECEIPT_DATA:[\s\S]*?-->/gi, "")
        .replace(/AI_RECEIPT_DATA:[\s\S]*/gi, "")
        .replace(/\s*\[xcur[:_][^\]]+\]/gi, "")
        .trim();
      cleanDesc = cleanDesc.split("\n")[0].replace(/\(AI自動拆單\)/g, "").trim() || "支出項目";
      body = `${actor}：「${cleanDesc}」${SYM}${formatAmt(row.amount)}`;
    } else {
      title = payload.eventType === "INSERT" ? "💸 新增還款" : "💸 還款更新";
      body = `${memberById[row.from_member] || "?"} 還 ${memberById[row.to_member] || "?"}　${SYM}${formatAmt(row.amount)}`;
    }

    showToast(title, body);
    shakeNotifyBtn();

    if(typeof Notification !== "undefined" && Notification.permission === "granted"){
      try{ new Notification(title, { body, icon: "icon.svg" }); }catch(e){}
    }
  }

  function shakeNotifyBtn(){
    if(!notifyBtn || notifyBtn.classList.contains("hidden")) return;
    notifyBtn.classList.remove("notify-shake");
    void notifyBtn.offsetWidth; // 重新觸發動畫
    notifyBtn.classList.add("notify-shake");
  }

  // ---------- 設定入口：設定已經搬到獨立的 settings.html，這裡只留信箱
  // 提醒卡片的「去設定」按鈕，改成導頁而不是開彈窗。 ----------
  const emailReminderBtn = document.getElementById("emailReminderBtn");
  if(emailReminderBtn) emailReminderBtn.addEventListener("click", ()=>{ location.href = "settings.html"; });

  // ---------- main app ----------
  async function onLoggedIn(user){
    if(isSessionExpired()){ await forceLogout(); return; }
    refreshLoginTime();

    // 關鍵：從伺服器獲取即時 User 資料（包含其他裝置上傳的最新 avatar_url）
    let freshUser = user;
    try {
      const { data: freshData, error: freshErr } = await sb.auth.getUser();
      if(!freshErr && freshData && freshData.user){
        freshUser = freshData.user;
      }
    } catch(e){}

    currentUser = freshUser;
    user = freshUser;
    window.currentUser = freshUser;

    if(appScreen){
      appScreen.style.display = "block";
      if(typeof hidePwaSplash === "function") hidePwaSplash();
      appScreen.classList.add("sb-fade-in");
      requestAnimationFrame(()=>{
        // 讓 PWA 主畫面捷徑可以直接跳到指定分頁（?tab=expense 之類的）
        const requestedTab = new URLSearchParams(location.search).get("tab");
        const tabBtn = requestedTab && document.querySelector(`.app-tab[data-tab="${requestedTab}"]`);
        if(tabBtn) tabBtn.click();
        else moveTabIndicator(document.querySelector(".app-tab.active"));
      });
    }

    try{
      await membersLoadedPromise;
      await loadMembers();
    }catch(e){
      // 讀不到成員資料就直接登出，不要卡在半載入的畫面上。
      await forceLogout();
      return;
    }

    // 這個人還沒有任何啟用中的群組（剛註冊、或還沒選群組）：
    // 選擇/建立群組的畫面只做在 index.html，這裡直接導過去，
    // 帶著 redirect 記住這一頁，選完群組後才回得來。
    if(!myMember){
      location.href = "index.html?redirect=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
      return;
    }

    if(!myMember.name && !isRealEmail(myMember.email)){
      // 讀得到成員資料列，但名字跟信箱都是空的——代表資料異常，
      // 與其卡在畫面上一堆轉圈圈，不如直接登出讓使用者重新登入。
      await forceLogout();
      return;
    }

    window.currentUser = user;
    window.myMember = myMember;

    let myAvatar = "";
    if(myMember && myMember.avatar_url){
      myAvatar = myMember.avatar_url;
    } else if(user && user.user_metadata && user.user_metadata.avatar_url){
      myAvatar = user.user_metadata.avatar_url;
    }

    if(myMember){
      myMember.avatar_url = myAvatar;
      if(myAvatar){
        localStorage.setItem("sb_my_avatar", myAvatar);
        if(user && user.id) localStorage.setItem("sb_avatar_" + user.id, myAvatar);
        localStorage.setItem("sb_avatar_" + myMember.id, myAvatar);
        if(myMember.user_id) localStorage.setItem("sb_avatar_" + myMember.user_id, myAvatar);
      } else {
        localStorage.removeItem("sb_avatar_" + myMember.id);
        if(myMember.user_id) localStorage.removeItem("sb_avatar_" + myMember.user_id);
        if(user) localStorage.removeItem("sb_avatar_" + user.id);
        localStorage.removeItem("sb_my_avatar");
      }
    }

    const whoami = document.getElementById("whoamiName");
    const whoamiAvatarEl = document.getElementById("whoamiAvatar");
    if(whoami){
      const groupName = myMember.groups && myMember.groups.name;
      whoami.textContent = (myMember.name || emailToName(user.email)) + (groupName ? ` (${groupName})` : "");
    }
    if(whoamiAvatarEl && myMember){
      whoamiAvatarEl.innerHTML = renderAvatarHTML(myMember, "avatar-md whoami-avatar");
    }

    const myLatestRow = myMember;

    const emailReminderCard = document.getElementById("emailReminderCard");
    if(emailReminderCard){
      emailReminderCard.classList.toggle("hidden", !!(myLatestRow && isRealEmail(myLatestRow.email)));
    }

    if(typeof window.renderNavLinks === "function"){
      window.shownCurrencies = (myLatestRow && myLatestRow.shown_currencies) || ["TWD"];
      localStorage.setItem("splitbill-shown-currencies", JSON.stringify(window.shownCurrencies));
      window.renderNavLinks();
    }

    function buildFilterChecks(containerId){
      const wrap = document.getElementById(containerId);
      if(!wrap) return;
      wrap.innerHTML = "";
      memberRows.forEach(m=>{
        const label = document.createElement("label");
        label.className = "check-pill";
        label.innerHTML = `<input type="checkbox" value="${m.id}">${renderAvatarHTML(m, "avatar-xs")}<span class="check-pill-name">${escapeHtml(m.name)}</span>`;
        label.querySelector("input").addEventListener("change", (e)=>{
          label.classList.toggle("checked", e.target.checked);
          applyFiltersAndRenderHistory();
          applyFiltersAndRenderRepayments();
        });
        wrap.appendChild(label);
      });
    }
    buildFilterChecks("filterPayerChecks");
    buildFilterChecks("filterInvolvedChecks");
    buildFilterChecks("filterRepayFromChecks");
    buildFilterChecks("filterRepayToChecks");

    // 新增支出／還款的付款人・分攤人・還款人下拉/勾選清單，只列出「還在群組裡」的人——
    // 已退出/帳號已銷毀的人不該被選成新支出的付款人。編輯舊紀錄時如果剛好牽涉到
    // 這種人，會由 ensureXxx() 系列函式（定義在下面，outer scope）臨時補一個選項
    // 進去，離開編輯模式再清掉，詳見 clearTempEditOptions()。
    const activeMemberRows = memberRows.filter(m => !m.left_at);

    const paidBySingleSel = document.getElementById("expPaidBySingle");
    if(paidBySingleSel){
      paidBySingleSel.innerHTML = activeMemberRows.map(m =>
        `<option value="${m.id}"${myMember && m.id === myMember.id ? " selected" : ""}>${escapeHtml(m.name)}</option>`
      ).join("");
      enhanceSelect(paidBySingleSel);
    }

    const payersWrap = document.getElementById("expPayers");
    if(payersWrap){
      payersWrap.innerHTML = activeMemberRows.map(amtRowHTML).join("");
      payersWrap.querySelectorAll(".amt-row-input").forEach(inp=>{
        inp.addEventListener("input", ()=>{ clearRowCalc(inp); updatePayerSumCheck(); });
      });
      wireCalcButtons(payersWrap);
    }

    const partWrap = document.getElementById("expParticipants");
    if(partWrap){
      partWrap.innerHTML = "";
      activeMemberRows.forEach(m => partWrap.appendChild(participantPill(m, true)));
    }

    const sharesWrap = document.getElementById("expSharesCustom");
    if(sharesWrap){
      sharesWrap.innerHTML = activeMemberRows.map(amtRowHTML).join("");
      sharesWrap.querySelectorAll(".amt-row-input").forEach(inp=>{
        inp.addEventListener("input", ()=>{ clearRowCalc(inp); updateShareSumCheck(); });
      });
      wireCalcButtons(sharesWrap);
    }

    const expAmtInp = document.getElementById("expAmount");
    const expAmtCalcBtn = document.getElementById("expAmountCalcBtn");
    if(expAmtInp){
      expAmtInp.addEventListener("input", ()=>{
        clearRowCalc(expAmtInp);
        updatePayerSumCheck(); updateShareSumCheck(); updateAddonsPreview();
      });
    }
    if(expAmtCalcBtn && expAmtInp){
      expAmtCalcBtn.addEventListener("click", ()=>{
        openCalc(expAmtInp, "支出總金額");
      });
    }

    renderAddonsList();
    setupAiReceiptModal();
    fetchSystemGeminiApiKey();

    const expDateInp = document.getElementById("expDate");
    if(expDateInp) expDateInp.value = new Date().toISOString().slice(0,10);

    const repayFromSel = document.getElementById("repayFrom");
    const repayToSel = document.getElementById("repayTo");
    if(repayFromSel && repayToSel){
      repayFromSel.innerHTML = ""; repayToSel.innerHTML = "";
      activeMemberRows.forEach(m=>{
        const o1 = document.createElement("option");
        o1.value = m.id; o1.textContent = m.name;
        if(myMember && m.id === myMember.id) o1.selected = true;
        repayFromSel.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = m.id; o2.textContent = m.name;
        repayToSel.appendChild(o2);
      });
      enhanceSelect(repayFromSel);
      enhanceSelect(repayToSel);
    }
    const repayDateInp = document.getElementById("repayDate");
    if(repayDateInp) repayDateInp.value = new Date().toISOString().slice(0,10);

    await refreshExpenses();
    subscribeRealtime();
    ensurePushSubscribed();

    // 處理從外幣「以臺幣結算」跳轉過來的自動填寫
    const urlParams = new URLSearchParams(location.search);
    const prefillFrom = urlParams.get("from");
    const prefillTo = urlParams.get("to");
    const prefillAmt = urlParams.get("amt");
    const prefillNote = urlParams.get("note");
    if(prefillFrom && prefillTo && prefillAmt){
      const repayTabBtn = document.querySelector('.app-tab[data-tab="repay"]');
      if(repayTabBtn) repayTabBtn.click();
      if(repayFromSel) repayFromSel.value = prefillFrom;
      if(repayToSel) repayToSel.value = prefillTo;
      const repayAmountEl = document.getElementById("repayAmount");
      if(repayAmountEl) repayAmountEl.value = prefillAmt;
      const repayNoteEl = document.getElementById("repayNote");
      if(repayNoteEl && prefillNote) repayNoteEl.value = prefillNote;
      if(repayFromSel) enhanceSelect(repayFromSel);
      if(repayToSel) enhanceSelect(repayToSel);
      setTimeout(()=>{
        if(repayAmountEl) repayAmountEl.scrollIntoView({ behavior:"smooth", block:"center" });
      }, 300);
    }
  }

  // ---------- single vs multi payer toggle ----------
  let payerMode = "single";
  document.querySelectorAll('.split-mode-btn[data-payer-mode]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll('.split-mode-btn[data-payer-mode]').forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      payerMode = btn.dataset.payerMode;
      const isMulti = payerMode === "multi";
      const paidBySingleSel = document.getElementById("expPaidBySingle");
      // 包過自訂下拉選單之後，畫面上看得到的其實是外層的 .dd-select 包裝，
      // 不是這顆已經被視覺隱藏的原生 <select> 本身，要切的是包裝的 hidden。
      (paidBySingleSel.closest(".dd-select") || paidBySingleSel).classList.toggle("hidden", isMulti);
      document.getElementById("expPayers").classList.toggle("hidden", !isMulti);
      document.getElementById("payerSumCheck").innerHTML = "";
    });
  });

  // ---------- split-mode toggle ----------
  let splitMode = "equal";

  document.querySelectorAll('.split-mode-btn[data-mode]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll('.split-mode-btn[data-mode]').forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      splitMode = btn.dataset.mode;
      document.getElementById("expParticipants").classList.toggle("hidden", splitMode !== "equal");
      document.getElementById("toggleAllParticipants").classList.toggle("hidden", splitMode !== "equal");
      const addonsContainer = document.getElementById("expAddonsContainer");
      if(addonsContainer) addonsContainer.classList.toggle("hidden", splitMode !== "equal");
      document.getElementById("expSharesCustom").classList.toggle("hidden", splitMode !== "custom");
      document.getElementById("shareSumCheck").textContent = "";
      if(splitMode === "custom") updateShareSumCheck();
      if(splitMode === "equal") renderAddonsList();
    });
  });

  // ---------- 個人自付 / 額外消費 ----------
  function renderAddonsList(){
    const listEl = document.getElementById("expAddonsList");
    if(!listEl) return;
    const participants = Array.from(document.querySelectorAll("#expParticipants input:checked")).map(i=>i.value);
    
    const existingValues = {};
    const existingCalcs = {};
    listEl.querySelectorAll(".exp-addon-input").forEach(inp => {
      existingValues[inp.dataset.member] = inp.value;
      if(inp.dataset.calc) existingCalcs[inp.dataset.member] = inp.dataset.calc;
    });

    listEl.innerHTML = participants.map(mId => {
      const name = memberById[mId] || "?";
      const val = existingValues[mId] || "";
      const calc = existingCalcs[mId] || "";
      return `
        <div class="amt-row exp-addon-row" data-member="${mId}">
          <span class="amt-row-name">${escapeHtml(name)}</span>
          <input type="number" class="amt-row-input exp-addon-input" data-member="${mId}" placeholder="個人自付 (0)" min="0" step="1" value="${val}" ${calc ? `data-calc="${escapeHtml(calc)}"` : ''}>
          <button type="button" class="amt-row-calc-btn${calc ? ' has-calc' : ''}" title="小計算機">🧮</button>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".exp-addon-input").forEach(inp => {
      inp.addEventListener("input", ()=>{
        clearRowCalc(inp);
        updateAddonsPreview();
      });
      inp.addEventListener("change", updateAddonsPreview);
    });

    wireCalcButtons(listEl);
    updateAddonsPreview();
  }

  function getAddonsData(){
    const listEl = document.getElementById("expAddonsList");
    if(!listEl) return { totalAddon: 0, items: {} };
    const items = {};
    let totalAddon = 0;
    listEl.querySelectorAll(".exp-addon-input").forEach(inp => {
      const mId = inp.dataset.member;
      const amt = Number(inp.value) || 0;
      if(amt > 0){
        items[mId] = { rawAmt: amt, finalAmt: amt, calc: inp.dataset.calc || "" };
        totalAddon += amt;
      }
    });
    return { totalAddon, items };
  }

  // ---------- 服務費 / 稅額 (選填) ----------
  let manualTaxSplitMode = "ratio"; // "ratio" | "equal"
  let manualTaxType = "inclusive"; // "inclusive" (內含) | "exclusive" (外加)

  const expTaxTypeInclusive = document.getElementById("expTaxTypeInclusive");
  const expTaxTypeExclusive = document.getElementById("expTaxTypeExclusive");
  const expTaxContainer = document.getElementById("expTaxContainer");
  const expAmountLabel = document.getElementById("expAmountLabel");

  function getManualExpenseTotals(){
    const subtotal = Number(document.getElementById("expAmount")?.value) || 0;
    const tax = manualTaxType === "inclusive" ? 0 : (Number(document.getElementById("expTaxAmount")?.value) || 0);
    const total = manualTaxType === "inclusive" ? subtotal : (subtotal + tax);
    return { subtotal, tax, total };
  }

  function updateManualTaxTypeUI(){
    if(expTaxTypeInclusive) expTaxTypeInclusive.classList.toggle("active", manualTaxType === "inclusive");
    if(expTaxTypeExclusive) expTaxTypeExclusive.classList.toggle("active", manualTaxType === "exclusive");
    if(expTaxContainer){
      expTaxContainer.classList.toggle("hidden", manualTaxType === "inclusive");
    }
    if(expAmountLabel){
      expAmountLabel.textContent = manualTaxType === "inclusive" ? "支出總金額 (已含稅/免稅)" : "未稅金額 / 餐費小計";
    }
    updateTaxPreview();
    updatePayerSumCheck();
    updateShareSumCheck();
    updateAddonsPreview();
  }

  function updateTaxPreview(){
    const previewEl = document.getElementById("expTaxPreview");
    if(!previewEl) return;
    if(manualTaxType === "inclusive"){
      previewEl.classList.add("hidden");
      return;
    }
    const { subtotal, tax, total } = getManualExpenseTotals();
    if(tax <= 0){
      previewEl.classList.add("hidden");
      return;
    }
    previewEl.classList.remove("hidden");
    const modeText = manualTaxSplitMode === "ratio" ? "依照個人消費額比例分配" : "全員平分";
    previewEl.innerHTML = `
      <div>📊 <b>費用加總</b>：小計 ${SYM}${formatAmt(subtotal)} + 服務費/稅 ${SYM}${formatAmt(tax)} = <b>總支出 ${SYM}${formatAmt(total)}</b></div>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-top:3px;">
        分配方式：${modeText}
      </div>
    `;
  }

  const expTaxToggle = document.getElementById("expTaxToggle");
  const expTaxBody = document.getElementById("expTaxBody");
  const expTaxCaret = document.getElementById("expTaxCaret");
  const expTaxInp = document.getElementById("expTaxAmount");
  const expTaxCalcBtn = document.getElementById("expTaxCalcBtn");
  const expManualTaxRatioBtn = document.getElementById("expManualTaxRatioBtn");
  const expManualTaxEqualBtn = document.getElementById("expManualTaxEqualBtn");

  if(expTaxTypeInclusive){
    expTaxTypeInclusive.addEventListener("click", (e)=>{
      e.preventDefault();
      manualTaxType = "inclusive";
      if(expTaxInp) expTaxInp.value = "";
      updateManualTaxTypeUI();
    });
  }
  if(expTaxTypeExclusive){
    expTaxTypeExclusive.addEventListener("click", (e)=>{
      e.preventDefault();
      manualTaxType = "exclusive";
      if(expTaxBody) expTaxBody.classList.remove("hidden");
      if(expTaxToggle) expTaxToggle.classList.add("open");
      if(expTaxCaret) expTaxCaret.classList.add("open");
      updateManualTaxTypeUI();
    });
  }

  if(expTaxToggle && expTaxBody){
    expTaxToggle.addEventListener("click", ()=>{
      const isHidden = expTaxBody.classList.contains("hidden");
      expTaxBody.classList.toggle("hidden", !isHidden);
      expTaxToggle.classList.toggle("open", isHidden);
      if(expTaxCaret) expTaxCaret.classList.toggle("open", isHidden);
      if(isHidden) updateTaxPreview();
    });
  }

  if(expManualTaxRatioBtn && expManualTaxEqualBtn){
    expManualTaxRatioBtn.addEventListener("click", ()=>{
      manualTaxSplitMode = "ratio";
      expManualTaxRatioBtn.classList.add("active");
      expManualTaxEqualBtn.classList.remove("active");
      updateTaxPreview();
      updatePayerSumCheck();
      updateShareSumCheck();
      updateAddonsPreview();
    });
    expManualTaxEqualBtn.addEventListener("click", ()=>{
      manualTaxSplitMode = "equal";
      expManualTaxEqualBtn.classList.add("active");
      expManualTaxRatioBtn.classList.remove("active");
      updateTaxPreview();
      updatePayerSumCheck();
      updateShareSumCheck();
      updateAddonsPreview();
    });
  }

  if(expTaxInp){
    expTaxInp.addEventListener("input", ()=>{
      clearRowCalc(expTaxInp);
      updateTaxPreview();
      updatePayerSumCheck();
      updateShareSumCheck();
      updateAddonsPreview();
    });
  }
  if(expTaxCalcBtn && expTaxInp){
    expTaxCalcBtn.addEventListener("click", ()=>{
      openCalc(expTaxInp, "服務費 / 稅額");
    });
  }

  function updateAddonsPreview(){
    const previewEl = document.getElementById("expAddonsPreview");
    if(!previewEl) return;
    const { subtotal, tax, total } = getManualExpenseTotals();
    const { totalAddon } = getAddonsData();
    const participants = Array.from(document.querySelectorAll("#expParticipants input:checked")).map(i=>i.value);
    
    if(totalAddon <= 0 || participants.length === 0){
      previewEl.classList.add("hidden");
      return;
    }

    const baseAmount = Math.max(0, subtotal - totalAddon);
    const n = participants.length;
    const baseShare = Math.floor(baseAmount / n);

    previewEl.classList.remove("hidden");
    previewEl.innerHTML = `
      <div>📊 <b>分攤試算</b>：不含稅 ${SYM}${formatAmt(subtotal)}${tax > 0 ? ` + 服務費/稅 ${SYM}${formatAmt(tax)} = 總額 ${SYM}${formatAmt(total)}` : ''}</div>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-top:3px;">
        扣除個人自付合計 ${SYM}${formatAmt(totalAddon)} ➔ 共同平分基本額 ${SYM}${formatAmt(baseAmount)}（每人約 ${SYM}${formatAmt(baseShare)}）
      </div>
    `;
  }

  const addonsToggle = document.getElementById("expAddonsToggle");
  const addonsBody = document.getElementById("expAddonsBody");
  const addonsCaret = document.getElementById("expAddonsCaret");
  if(addonsToggle && addonsBody){
    addonsToggle.addEventListener("click", ()=>{
      const isHidden = addonsBody.classList.contains("hidden");
      addonsBody.classList.toggle("hidden", !isHidden);
      addonsToggle.classList.toggle("open", isHidden);
      if(addonsCaret) addonsCaret.classList.toggle("open", isHidden);
      if(isHidden) renderAddonsList();
    });
  }

  const expAmountInput = document.getElementById("expAmount");
  if(expAmountInput){
    expAmountInput.addEventListener("input", ()=>{
      updateTaxPreview();
      updateAddonsPreview();
      updatePayerSumCheck();
      updateShareSumCheck();
    });
  }

  // ---------- 分攤名單：全選／取消全選 ----------
  const toggleAllParticipantsBtn = document.getElementById("toggleAllParticipants");
  if(toggleAllParticipantsBtn){
    toggleAllParticipantsBtn.addEventListener("click", ()=>{
      const inputs = Array.from(document.querySelectorAll("#expParticipants input"));
      if(!inputs.length) return;
      const nextChecked = !inputs.every(inp => inp.checked);
      inputs.forEach(inp=>{
        inp.checked = nextChecked;
        inp.closest(".check-pill").classList.toggle("checked", nextChecked);
      });
      toggleAllParticipantsBtn.textContent = nextChecked ? "取消全選" : "全選";
      renderAddonsList();
    });
  }

  function sumCheckHTML(total, sum){
    const diff = Math.round((total - sum) * 100) / 100;
    if(!total) return "";
    if(Math.abs(diff) < 0.5) return `<span class="sum-ok">✓ 已分配 ${SYM}${formatAmt(sum)}</span>`;
    if(diff > 0) return `<span class="sum-warn">還差 ${SYM}${formatAmt(diff)} 未分配（目前 ${SYM}${formatAmt(sum)} / ${SYM}${formatAmt(total)}）</span>`;
    return `<span class="sum-warn">超過總金額 ${SYM}${formatAmt(Math.abs(diff))}（目前 ${SYM}${formatAmt(sum)} / ${SYM}${formatAmt(total)}）</span>`;
  }

  function readAmountRows(containerId){
    const rows = [];
    document.querySelectorAll(`#${containerId} .amt-row-input`).forEach(inp=>{
      const v = Number(inp.value);
      if(v > 0){
        const row = { member_id: inp.dataset.member, amount: v };
        if(inp.dataset.calc) row.calc = inp.dataset.calc;
        rows.push(row);
      }
    });
    return rows;
  }

  // ---------- 付款人/分攤人/參與者 UI 小元件（新增支出用，也給編輯模式的
  // ensureXxx() 系列補選項時共用）----------
  function amtRowHTML(m){
    return `<div class="amt-row">
        <span class="amt-row-name">${escapeHtml(m.name)}</span>
        <input type="number" class="amt-row-input" data-member="${m.id}" placeholder="0" min="0" step="1">
        <button type="button" class="amt-row-calc-btn" title="小計算機">🧮</button>
      </div>`;
  }
  function participantPill(m, checked){
    const label = document.createElement("label");
    label.className = "check-pill" + (checked ? " checked" : "");
    label.innerHTML = `<input type="checkbox" value="${m.id}"${checked ? " checked" : ""}>${renderAvatarHTML(m, "avatar-xs")}<span class="check-pill-name">${escapeHtml(m.name)}</span>`;
    label.querySelector("input").addEventListener("change", (e)=>{
      label.classList.toggle("checked", e.target.checked);
      label.classList.remove("sb-bounce");
      void label.offsetWidth;
      label.classList.add("sb-bounce");
      renderAddonsList();
    });
    return label;
  }

  // ---------- 編輯模式專用：如果舊紀錄牽涉到已退出/已銷毀的成員，上面的
  // 清單裡不會有這個人（新增支出時故意排除），暫時補一個選項進去才能正確
  // 顯示/儲存，離開編輯模式時再用 clearTempEditOptions() 清掉。----------
  function ensureSelectOption(selectEl, memberId){
    if(!selectEl || !memberId || selectEl.querySelector(`option[value="${memberId}"]`)) return;
    const opt = document.createElement("option");
    opt.value = memberId;
    opt.textContent = memberById[memberId] || "?";
    opt.dataset.tempEditOption = "1";
    selectEl.appendChild(opt);
  }
  function ensureAmtRow(wrapEl, memberId){
    if(!wrapEl || !memberId || wrapEl.querySelector(`.amt-row-input[data-member="${memberId}"]`)) return;
    const div = document.createElement("div");
    div.className = "amt-row";
    div.dataset.tempEditOption = "1";
    div.innerHTML = `
        <span class="amt-row-name">${escapeHtml(memberById[memberId] || "?")}</span>
        <input type="number" class="amt-row-input" data-member="${memberId}" placeholder="0" min="0" step="1">
        <button type="button" class="amt-row-calc-btn" title="小計算機">🧮</button>`;
    wrapEl.appendChild(div);
    const inp = div.querySelector(".amt-row-input");
    inp.addEventListener("input", ()=>{ clearRowCalc(inp); updatePayerSumCheck(); updateShareSumCheck(); });
    wireCalcButtons(div);
  }
  function ensureParticipantPill(wrapEl, memberId){
    if(!wrapEl || !memberId || wrapEl.querySelector(`input[value="${memberId}"]`)) return;
    const label = participantPill({ id: memberId, name: memberById[memberId] || "?" }, false);
    label.dataset.tempEditOption = "1";
    wrapEl.appendChild(label);
  }
  function clearTempEditOptions(){
    document.querySelectorAll('[data-temp-edit-option="1"]').forEach(el => el.remove());
    // 移除的可能是 <option>，下拉選單畫面上顯示的選項清單要跟著重新同步一次，
    // 不然編輯過的那個已退出/已銷毀成員選項會繼續留在畫面上的選單裡。
    [document.getElementById("expPaidBySingle"), document.getElementById("repayFrom"), document.getElementById("repayTo")]
      .forEach(sel => { if(sel && sel._ddSync) sel._ddSync(); });
  }

  // ---------- 小計算機 ----------
  function clearRowCalc(inp){
    delete inp.dataset.calc;
    const btn = inp.closest(".amt-row") ? inp.closest(".amt-row").querySelector(".amt-row-calc-btn") : (inp.parentElement ? inp.parentElement.querySelector(".input-calc-btn") : null);
    if(btn) btn.classList.remove("has-calc");
  }
  function applyRowCalc(inp, calc){
    const btn = inp.closest(".amt-row") ? inp.closest(".amt-row").querySelector(".amt-row-calc-btn") : (inp.parentElement ? inp.parentElement.querySelector(".input-calc-btn") : null);
    if(calc){
      inp.dataset.calc = calc;
      if(btn) btn.classList.add("has-calc");
    } else {
      delete inp.dataset.calc;
      if(btn) btn.classList.remove("has-calc");
    }
  }

  function wireCalcButtons(container){
    container.querySelectorAll(".amt-row-calc-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const row = btn.closest(".amt-row");
        openCalc(row.querySelector(".amt-row-input"), row.querySelector(".amt-row-name").textContent);
      });
    });
  }

  const calcModal = document.getElementById("calcModal");
  const calcDisplay = document.getElementById("calcDisplay");
  const calcTargetNameEl = document.getElementById("calcTargetName");
  let calcTargetInput = null;
  let calcExpr = "";

  function openCalc(inp, name){
    calcTargetInput = inp;
    calcExpr = inp.dataset.calc || "";
    calcTargetNameEl.textContent = name;
    calcDisplay.textContent = calcExpr || "0";
    calcModal.classList.add("show");
  }
  function closeCalc(){
    calcModal.classList.remove("show");
    calcTargetInput = null;
  }
  function safeEvalCalc(expr){
    if(!expr || !/^[0-9+\-*/.()]+$/.test(expr)) return null;
    if(/[+\-*/.]{2,}/.test(expr)) return null;
    try{
      const result = Function(`"use strict"; return (${expr});`)();
      return (typeof result === "number" && isFinite(result)) ? result : null;
    }catch(e){ return null; }
  }
  if(calcModal){
    calcModal.querySelectorAll(".calc-key").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const key = btn.dataset.key;
        if(key === "C"){
          calcExpr = "";
        } else if(key === "back"){
          calcExpr = calcExpr.slice(0, -1);
        } else if(key === "="){
          const result = safeEvalCalc(calcExpr || "0");
          if(result === null){ calcDisplay.textContent = "格式錯誤"; return; }
          const rounded = Math.round(result * 100) / 100;
          if(calcTargetInput){
            calcTargetInput.value = rounded;
            calcTargetInput.dataset.calc = calcExpr;
            const btn = calcTargetInput.closest(".amt-row") ? calcTargetInput.closest(".amt-row").querySelector(".amt-row-calc-btn") : (calcTargetInput.parentElement ? calcTargetInput.parentElement.querySelector(".input-calc-btn") : null);
            if(btn) btn.classList.add("has-calc");

            if(calcTargetInput.id === "expAmount"){
              updatePayerSumCheck();
              updateShareSumCheck();
              updateAddonsPreview();
            } else if(calcTargetInput.closest("#expAddonsList")){
              updateAddonsPreview();
            } else if(calcTargetInput.closest("#expPayers")){
              updatePayerSumCheck();
            } else {
              updateShareSumCheck();
            }
          }
          closeCalc();
          return;
        } else {
          calcExpr += key;
        }
        calcDisplay.textContent = calcExpr || "0";
      });
    });
    const calcCloseBtn = document.getElementById("calcCloseBtn");
    if(calcCloseBtn) calcCloseBtn.addEventListener("click", closeCalc);
    calcModal.addEventListener("click", (e)=>{ if(e.target === calcModal) closeCalc(); });
  }

  function updatePayerSumCheck(){
    if(payerMode !== "multi"){ document.getElementById("payerSumCheck").innerHTML = ""; return; }
    const { total } = getManualExpenseTotals();
    const sum = readAmountRows("expPayers").reduce((s,p)=>s+p.amount, 0);
    document.getElementById("payerSumCheck").innerHTML = sumCheckHTML(total, sum);
  }
  function updateShareSumCheck(){
    if(splitMode !== "custom") return;
    const { subtotal, tax, total } = getManualExpenseTotals();
    const rows = readAmountRows("expSharesCustom");
    const sumBase = rows.reduce((s,p)=>s+p.amount, 0);
    if(tax > 0){
      const sumWithTax = sumBase + tax;
      document.getElementById("shareSumCheck").innerHTML = `
        <div style="font-size:12px;color:var(--ink-soft);margin-bottom:2px;">
          自訂基本消費合計 ${SYM}${formatAmt(sumBase)} + 服務費/稅 ${SYM}${formatAmt(tax)} = <b>${SYM}${formatAmt(sumWithTax)}</b>
        </div>
        ${sumCheckHTML(total, sumWithTax)}
      `;
    } else {
      document.getElementById("shareSumCheck").innerHTML = sumCheckHTML(total, sumBase);
    }
  }

  const addExpBtn = document.getElementById("addExpenseBtn");
  if(addExpBtn){
    addExpBtn.addEventListener("click", async ()=>{
      const { subtotal, tax: taxAmount, total: totalAmount } = getManualExpenseTotals();
      const amount = totalAmount;
      const itemTitle = document.getElementById("expDesc").value.trim();
      const itemNote = (document.getElementById("expNote") ? document.getElementById("expNote").value.trim() : "");
      const expense_date = document.getElementById("expDate").value;
      const msg = document.getElementById("expMsg");

      if(!amount || amount <= 0){ msg.textContent = "請輸入正確金額"; msg.className = "msg error"; return; }
      if(!Number.isInteger(amount)){ msg.textContent = "金額請輸入整數，不支援小數點"; msg.className = "msg error"; return; }
      if(!itemTitle){ msg.textContent = "請輸入項目"; msg.className = "msg error"; return; }

      let payers;
      if(payerMode === "single"){
        const payerCalc = document.getElementById("expAmount").dataset.calc || "";
        const pObj = { member_id: document.getElementById("expPaidBySingle").value, amount };
        if(payerCalc) pObj.calc = payerCalc;
        payers = [pObj];
      } else {
        payers = readAmountRows("expPayers");
        if(!payers.length){ msg.textContent = "至少要有一個人付錢"; msg.className = "msg error"; return; }
        const payerSum = payers.reduce((s,p)=>s+p.amount, 0);
        if(Math.abs(payerSum - amount) >= 0.5){
          const diff = Math.round((amount - payerSum) * 100) / 100;
          msg.textContent = diff > 0
            ? `付款總額還差 ${SYM}${formatAmt(diff)}，跟支出金額 ${SYM}${formatAmt(amount)} 對不上，無法加入`
            : `付款總額超過 ${SYM}${formatAmt(Math.abs(diff))}，跟支出金額 ${SYM}${formatAmt(amount)} 對不上，無法加入`;
          msg.className = "msg error";
          return;
        }
      }

      let shares = [];
      if(splitMode === "equal"){
        const participants = Array.from(document.querySelectorAll("#expParticipants input:checked")).map(i=>i.value);
        if(!participants.length){ msg.textContent = "至少要選一個人分攤"; msg.className = "msg error"; return; }

        const { totalAddon, items: addonItems } = getAddonsData();
        if(totalAddon > subtotal && subtotal > 0){
          msg.textContent = `個人自付總額 (${SYM}${formatAmt(totalAddon)}) 超過不含稅總金額 (${SYM}${formatAmt(subtotal)})`;
          msg.className = "msg error";
          return;
        }

        // 編輯模式下，如果金額、分攤名單都跟原本一模一樣且無新加點與稅額，直接沿用原本存的
        const origShares = editingExpenseOriginal && editingExpenseOriginal.shares;
        const sameParticipants = origShares && origShares.length === participants.length &&
          new Set(origShares.map(s => s.member_id)).size === participants.length &&
          participants.every(id => origShares.some(s => s.member_id === id));
        const sameAmount = origShares && Math.abs(Number(editingExpenseOriginal.amount) - amount) < 0.005;
        const hasAddons = totalAddon > 0;
        const hasTax = taxAmount > 0;

        if(editingExpenseId && sameParticipants && sameAmount && !hasAddons && !hasTax){
          shares = origShares.map(s => ({ member_id: s.member_id, amount: Number(s.amount), calc: s.calc }));
        } else {
          // 扣除個人加點後，剩餘款項由全員平分
          const baseAmount = Math.max(0, subtotal - totalAddon);
          const n = participants.length;
          const base = Math.floor(baseAmount / n);
          const remainder = Math.round(baseAmount - base * n);

          const payerIds = new Set(payers.map(p => p.member_id));
          const shuffle = arr => {
            const a = arr.slice();
            for(let i = a.length - 1; i > 0; i--){
              const j = Math.floor(Math.random() * (i + 1));
              [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
          };
          const priority = [
            ...shuffle(participants.filter(id => !payerIds.has(id))),
            ...shuffle(participants.filter(id => payerIds.has(id)))
          ];

          const shareAmt = {};
          const memberPreTax = {};
          participants.forEach(id => {
            shareAmt[id] = base;
            memberPreTax[id] = base;
          });
          priority.slice(0, remainder).forEach(id => {
            shareAmt[id] += 1;
            memberPreTax[id] += 1;
          });

          // 加回各自的個人自付金額
          participants.forEach(id => {
            const addData = addonItems[id];
            if(addData && addData.finalAmt > 0){
              shareAmt[id] += addData.finalAmt;
              memberPreTax[id] += addData.finalAmt;
            }
          });

          // 分配服務費 / 稅額
          const memberTax = {};
          if(taxAmount > 0){
            if(manualTaxSplitMode === "ratio" && subtotal > 0){
              let taxSum = 0;
              participants.forEach(id => {
                const rawTax = Math.round((memberPreTax[id] / subtotal) * taxAmount);
                memberTax[id] = rawTax;
                taxSum += rawTax;
              });
              const taxDiff = taxAmount - taxSum;
              if(taxDiff !== 0 && participants.length > 0){
                memberTax[participants[0]] += taxDiff;
              }
            } else {
              const baseTax = Math.floor(taxAmount / n);
              const taxRem = taxAmount - (baseTax * n);
              participants.forEach((id, idx) => {
                memberTax[id] = baseTax + (idx < taxRem ? 1 : 0);
              });
            }
          }

          shares = participants.map(id => {
            const baseVal = shareAmt[id];
            const taxVal = memberTax[id] || 0;
            const finalVal = baseVal + taxVal;
            const addData = addonItems[id];

            let calcStr = "";
            if(addData && addData.finalAmt > 0 && taxVal > 0){
              calcStr = `平分${shareAmt[id] - addData.finalAmt}+自付${addData.finalAmt}+稅額${taxVal}`;
            } else if(addData && addData.finalAmt > 0){
              calcStr = `平分${shareAmt[id] - addData.finalAmt}+自付${addData.finalAmt}`;
            } else if(taxVal > 0){
              calcStr = `平分${baseVal}+稅額${taxVal}`;
            }

            const obj = { member_id: id, amount: finalVal };
            if(calcStr) obj.calc = calcStr;
            return obj;
          });
        }
      } else {
        const customRows = readAmountRows("expSharesCustom");
        if(!customRows.length){ msg.textContent = "至少要有一個人分攤"; msg.className = "msg error"; return; }
        const customBaseSum = customRows.reduce((s,p)=>s+p.amount, 0);

        if(taxAmount > 0){
          if(subtotal > 0 && Math.abs(customBaseSum - subtotal) >= 0.5){
            const diff = Math.round((subtotal - customBaseSum) * 100) / 100;
            msg.textContent = diff > 0
              ? `自訂消費總額還差 ${SYM}${formatAmt(diff)}，跟不含稅金額 ${SYM}${formatAmt(subtotal)} 對不上`
              : `自訂消費總額超過 ${SYM}${formatAmt(Math.abs(diff))}，跟不含稅金額 ${SYM}${formatAmt(subtotal)} 對不上`;
            msg.className = "msg error";
            return;
          }

          const activeCustom = customRows.filter(r => r.amount > 0);
          const memberTax = {};
          if(activeCustom.length > 0){
            if(manualTaxSplitMode === "ratio" && customBaseSum > 0){
              let taxSum = 0;
              activeCustom.forEach(r => {
                const rawTax = Math.round((r.amount / customBaseSum) * taxAmount);
                memberTax[r.member_id] = rawTax;
                taxSum += rawTax;
              });
              const taxDiff = taxAmount - taxSum;
              if(taxDiff !== 0){
                memberTax[activeCustom[0].member_id] += taxDiff;
              }
            } else {
              const baseTax = Math.floor(taxAmount / activeCustom.length);
              const taxRem = taxAmount - (baseTax * activeCustom.length);
              activeCustom.forEach((r, idx) => {
                memberTax[r.member_id] = baseTax + (idx < taxRem ? 1 : 0);
              });
            }
          }

          shares = customRows.map(r => {
            const taxVal = memberTax[r.member_id] || 0;
            const finalVal = r.amount + taxVal;
            const calc = taxVal > 0 ? `自訂${r.amount}+稅額${taxVal}` : (r.calc || "");
            const obj = { member_id: r.member_id, amount: finalVal };
            if(calc) obj.calc = calc;
            return obj;
          });
        } else {
          if(Math.abs(customBaseSum - amount) >= 0.5){
            const diff = Math.round((amount - customBaseSum) * 100) / 100;
            msg.textContent = diff > 0
              ? `分攤總額還差 ${SYM}${formatAmt(diff)}，跟支出金額 ${SYM}${formatAmt(amount)} 對不上，無法加入`
              : `分攤總額超過 ${SYM}${formatAmt(Math.abs(diff))}，跟支出金額 ${SYM}${formatAmt(amount)} 對不上，無法加入`;
            msg.className = "msg error";
            return;
          }
          shares = customRows.map(r => {
            const obj = { member_id: r.member_id, amount: r.amount };
            if(r.calc) obj.calc = r.calc;
            return obj;
          });
        }
      }

      // 項目保留乾淨標題（若編輯時原紀錄有隱藏 meta 標籤則保留於 description 末端）
      const { meta } = splitExpenseTitleAndNote(
        (editingExpenseOriginal && editingExpenseOriginal.description) || "",
        (editingExpenseOriginal && editingExpenseOriginal.note) || ""
      );
      let fullDescription = itemTitle;
      if(meta){
        fullDescription += " " + meta;
      }
      const description = fullDescription;

      // 防手滑：10 分鐘內有一筆金額、項目都一樣的支出，跳出確認提示
      if(!editingExpenseId){
        const now = Date.now();
        const dup = cachedExpenses.find(e =>
          Math.abs(Number(e.amount) - amount) < 0.01 &&
          getFirstLineDesc(e.description, e.note).toLowerCase() === itemTitle.toLowerCase() &&
          e.created_at && (now - new Date(e.created_at).getTime()) < 10 * 60 * 1000
        );
        if(dup){
          const ok = await sbConfirm(`10 分鐘內已經有一筆一樣的「${itemTitle}」${SYM}${formatAmt(amount)}，是不是手滑重複記錄了？\n\n按「確定」會繼續新增這一筆，按「取消」則不新增。`, "🔔 重複支出確認");
          if(!ok) return;
        }
      }

      const payload = {
        amount,
        description,
        note: itemNote || null,
        expense_date,
        created_by: myMember.id,
        payers,
        shares,
        currency: CURRENCY
      };
      const { error } = editingExpenseId
        ? await sb.from("expenses").update(payload).eq("id", editingExpenseId)
        : await sb.from("expenses").insert(payload);
      if(error){ msg.textContent = (editingExpenseId ? "更新失敗：" : "新增失敗：") + error.message; msg.className = "msg error"; return; }

      msg.textContent = editingExpenseId ? "已更新！" : "已加入！";
      msg.className = "msg ok";
      const wasEditing = !!editingExpenseId;
      const btn = document.getElementById("addExpenseBtn");
      btn.textContent = wasEditing ? "✓ 已更新" : "✓ 已加入";
      btn.classList.add("btn-success");
      setTimeout(()=>{
        btn.classList.remove("btn-success");
        btn.textContent = "加入這筆支出";
      }, 1100);
      if(wasEditing) exitEditMode();
      const expAmtInp = document.getElementById("expAmount");
      if(expAmtInp){ expAmtInp.value = ""; clearRowCalc(expAmtInp); }
      const expTaxInp = document.getElementById("expTaxAmount");
      if(expTaxInp){ expTaxInp.value = ""; clearRowCalc(expTaxInp); }
      manualTaxSplitMode = "ratio";
      manualTaxType = "inclusive";
      updateManualTaxTypeUI();
      document.getElementById("expDesc").value = "";
      if(document.getElementById("expNote")) document.getElementById("expNote").value = "";
      document.querySelectorAll("#expPayers .amt-row-input, #expSharesCustom .amt-row-input, #expAddonsList .exp-addon-input").forEach(i=>{ i.value=""; clearRowCalc(i); });
      document.getElementById("payerSumCheck").innerHTML = "";
      document.getElementById("shareSumCheck").innerHTML = "";
      const addonsPreview = document.getElementById("expAddonsPreview");
      if(addonsPreview) addonsPreview.classList.add("hidden");
      await refreshExpenses();
    });
  }

  // ---------- AI Receipt Data Extraction & Serialization ----------
  function extractAiReceiptData(descriptionOrExp, members = []){
    let text = "";
    if(typeof descriptionOrExp === "object" && descriptionOrExp !== null){
      text = ((descriptionOrExp.description || "") + "\n" + (descriptionOrExp.note || ""));
    } else {
      text = String(descriptionOrExp || "");
    }
    if(!text) return null;

    // 1. 嘗試解析 JSON 標籤 (支援各類包含/跨行/帶空格變體)
    const match = text.match(/<!--?\s*AI_RECEIPT_DATA:\s*([\s\S]*?)(-->)?/i);
    if(match && match[1]){
      let raw = match[1].trim();
      if(raw.endsWith("-->")) raw = raw.slice(0, -3).trim();
      try {
        return JSON.parse(decodeURIComponent(raw));
      } catch(err){
        try {
          return JSON.parse(raw);
        } catch(e){
          try {
            return JSON.parse(unescape(raw));
          } catch(e2){}
        }
      }
    }

    // 2. 嘗試解析純文字排版收據明細
    if(text.includes("(AI自動拆單)") || text.includes("📋 品項明細") || text.includes("🏪 店家：") || text.includes("➔") || text.match(/\d+\.\s*.*➔/)){
      return parseLegacyAiDescription(text, members);
    }
    return null;
  }

  function parseLegacyAiDescription(description, members = []){
    const clean = (description || "").replace(/<!--AI_RECEIPT_DATA:[\s\S]*?-->/gi, "").trim();
    const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
    let storeName = "聚餐收據";
    let subtotal = 0;
    let serviceCharge = 0;
    let taxType = "exclusive";
    const items = [];

    const storeLine = lines.find(l => l.startsWith("🏪 店家："));
    if(storeLine){
      storeName = storeLine.replace("🏪 店家：", "").trim();
    } else if(lines[0]){
      storeName = lines[0].replace(/\(AI自動拆單\)/g, "").trim();
    }

    const totalLine = lines.find(l => l.startsWith("💰 總額："));
    if(totalLine){
      if(totalLine.includes("已內含稅") || totalLine.includes("免外加")){
        taxType = "inclusive";
      }
      const subMatch = totalLine.match(/小計\s*[^\d]*([\d,]+)/);
      if(subMatch) subtotal = Number(subMatch[1].replace(/,/g, "")) || 0;
      const srvMatch = totalLine.match(/服務費\/稅\s*[^\d]*([\d,]+)/);
      if(srvMatch) serviceCharge = Number(srvMatch[1].replace(/,/g, "")) || 0;
    }

    const memberNameToId = {};
    (members || []).forEach(m => {
      if(m.name) memberNameToId[m.name] = m.id;
      if(m.email) memberNameToId[emailToName(m.email)] = m.id;
    });

    let currentItem = null;
    lines.forEach((l, idx) => {
      const numMatch = l.match(/^(\d+)\.\s*(.*)$/);
      if(numMatch){
        if(currentItem && currentItem.name){
          items.push(currentItem);
        }
        const rawContent = numMatch[2].trim();
        const arrowIdx = rawContent.indexOf("➔");
        if(arrowIdx !== -1){
          const left = rawContent.slice(0, arrowIdx).trim();
          let claimPart = rawContent.slice(arrowIdx + 1).trim();
          const priceMatch = left.match(/^(.*?)\s+([^0-9\s]*\s*[\d,]+(?:\.\d+)?)$/);
          const name = priceMatch ? priceMatch[1].trim() : left;
          const price = priceMatch ? Number(priceMatch[2].replace(/[^\d.]/g, "")) || 0 : 0;
          
          claimPart = claimPart.replace(/\s*\(每人[^\)]*\)/g, "").trim();
          let claimedMemberIds = [];
          if(claimPart.includes("全員") || claimPart.includes("所有人") || claimPart.includes("全體")){
            claimedMemberIds = (members || []).map(m => m.id);
          } else {
            const names = claimPart.split(/[、,]/).map(n => n.trim()).filter(Boolean);
            names.forEach(n => {
              if(memberNameToId[n]) claimedMemberIds.push(memberNameToId[n]);
            });
          }
          items.push({
            id: "item_" + items.length + "_" + Date.now(),
            name,
            price,
            qty: 1,
            claimedMemberIds
          });
          currentItem = null;
        } else {
          const priceMatch = rawContent.match(/^(.*?)\s+([^0-9\s]*\s*[\d,]+(?:\.\d+)?)$/);
          if(priceMatch){
            currentItem = {
              id: "item_" + items.length + "_" + Date.now(),
              name: priceMatch[1].trim(),
              price: Number(priceMatch[2].replace(/[^\d.]/g, "")) || 0,
              qty: 1,
              claimedMemberIds: []
            };
          } else {
            currentItem = {
              id: "item_" + items.length + "_" + Date.now(),
              name: rawContent,
              price: 0,
              qty: 1,
              claimedMemberIds: []
            };
          }
        }
        return;
      }

      if(currentItem){
        const priceMatch = l.match(/([^0-9\s]*\s*[\d,]+(?:\.\d+)?)$/);
        if(priceMatch && currentItem.price === 0 && !l.includes("➔")){
          const p = Number(priceMatch[1].replace(/[^\d.]/g, "")) || 0;
          if(p > 0) currentItem.price = p;
          if(l.startsWith("(") && l.includes(")")){
            const origMatch = l.match(/^\(([\s\S]*?)\)/);
            if(origMatch && origMatch[1]){
              currentItem.name += " (" + origMatch[1] + ")";
            }
          }
          return;
        }

        if(l.includes("➔")){
          let claimPart = l.slice(l.indexOf("➔") + 1).trim();
          claimPart = claimPart.replace(/\s*\(每人[^\)]*\)/g, "").trim();
          let claimedMemberIds = [];
          if(claimPart.includes("全員") || claimPart.includes("所有人") || claimPart.includes("全體")){
            claimedMemberIds = (members || []).map(m => m.id);
          } else {
            const names = claimPart.split(/[、,]/).map(n => n.trim()).filter(Boolean);
            names.forEach(n => {
              if(memberNameToId[n]) claimedMemberIds.push(memberNameToId[n]);
            });
          }
          currentItem.claimedMemberIds = claimedMemberIds;
          items.push(currentItem);
          currentItem = null;
        }
      }
    });

    if(currentItem && currentItem.name){
      items.push(currentItem);
    }

    if(subtotal === 0 && items.length > 0){
      subtotal = items.reduce((acc, it) => acc + (it.price || 0), 0);
    }

    return {
      storeName,
      subtotal,
      serviceCharge,
      tax: 0,
      discount: 0,
      taxSplitMode: "ratio",
      taxType,
      items
    };
  }

  // ---------- edit expense ----------
  let editingExpenseId = null;
  let editingExpenseOriginal = null;

  function startEditExpense(e){
    // 🌟 若為 AI 自動拆單產生的紀錄，直接開啟 AI 拆單編輯看板 (Step 3) 讓使用者自由修改品項與金額！
    let aiData = extractAiReceiptData(e, memberRows || MEMBERS || []);

    const isAiRecord = Boolean(
      (e.description && (e.description.includes("<!--AI_RECEIPT_DATA:") || e.description.includes("AI_RECEIPT_DATA:") || e.description.includes("(AI自動拆單)") || e.description.includes("📋 品項明細"))) ||
      (e.note && (e.note.includes("<!--AI_RECEIPT_DATA:") || e.note.includes("AI_RECEIPT_DATA:") || e.note.includes("🏪 店家：") || e.note.includes("🏪") || e.note.includes("📋 品項明細")))
    );

    if(aiData || isAiRecord){
      if(!aiData){
        const { title } = splitExpenseTitleAndNote(e.description, e.note);
        aiData = {
          storeName: title || "聚餐收據",
          subtotal: Number(e.amount) || 0,
          taxType: "inclusive",
          taxSplitMode: "ratio",
          items: [{
            id: "item_0_" + Date.now(),
            name: title || "消費品項",
            price: Number(e.amount) || 0,
            qty: 1,
            claimedMemberIds: (e.shares || []).map(s => s.member_id)
          }]
        };
      }

      if(typeof window.openAiReceiptEditMode === "function"){
        window.openAiReceiptEditMode(e, aiData);
        return; // 🌟 100% 停留在 AI 拆單編輯看板，絕不跳轉到一般支出分頁！
      }
    }

    // 🌟 以下為「一般手動支出」的編輯邏輯
    clearTempEditOptions();
    editingExpenseId = e.id;
    editingExpenseOriginal = e;
    document.getElementById("editBanner").classList.remove("hidden");
    document.getElementById("expFormTitle").textContent = "✎ 編輯支出";
    document.getElementById("addExpenseBtn").textContent = "更新這筆支出";

    const expAmtInp = document.getElementById("expAmount");
    expAmtInp.value = e.amount;
    const singlePayerCalc = (e.payers && e.payers.length === 1 && e.payers[0].calc) || "";
    applyRowCalc(expAmtInp, singlePayerCalc);

    const { title, note } = splitExpenseTitleAndNote(e.description, e.note);
    document.getElementById("expDesc").value = title;
    if(document.getElementById("expNote")) document.getElementById("expNote").value = note;
    document.getElementById("expDate").value = e.expense_date;
    manualTaxType = "inclusive";
    updateManualTaxTypeUI();

    const payers = e.payers || [];
    const payerModeBtn = document.querySelector(payers.length <= 1 ? '.split-mode-btn[data-payer-mode="single"]' : '.split-mode-btn[data-payer-mode="multi"]');
    if(payerModeBtn) payerModeBtn.click();
    if(payers.length <= 1 && payers[0]){
      ensureSelectOption(document.getElementById("expPaidBySingle"), payers[0].member_id);
      document.getElementById("expPaidBySingle").value = payers[0].member_id;
      enhanceSelect(document.getElementById("expPaidBySingle"));
    } else {
      payers.forEach(p => ensureAmtRow(document.getElementById("expPayers"), p.member_id));
      document.querySelectorAll("#expPayers .amt-row-input").forEach(inp=>{
        const match = payers.find(p => p.member_id === inp.dataset.member);
        inp.value = match ? match.amount : "";
        applyRowCalc(inp, match && match.calc);
      });
    }

    const shares = e.shares || [];
    const avgShare = shares.length ? Number(e.amount) / shares.length : 0;
    const wasEqualSplit = shares.length > 0 && shares.every(s => Math.abs(Number(s.amount) - avgShare) < 1);

    if(wasEqualSplit){
      const equalBtn = document.querySelector('.split-mode-btn[data-mode="equal"]');
      if(equalBtn) equalBtn.click();
      const shareIds = shares.map(s => s.member_id);
      shareIds.forEach(id => ensureParticipantPill(document.getElementById("expParticipants"), id));
      document.querySelectorAll("#expParticipants input").forEach(inp=>{
        const checked = shareIds.includes(inp.value);
        inp.checked = checked;
        inp.closest(".check-pill").classList.toggle("checked", checked);
      });
    } else {
      const customBtn = document.querySelector('.split-mode-btn[data-mode="custom"]');
      if(customBtn) customBtn.click();
      shares.forEach(s => ensureAmtRow(document.getElementById("expSharesCustom"), s.member_id));
      document.querySelectorAll("#expSharesCustom .amt-row-input").forEach(inp=>{
        const match = shares.find(s => s.member_id === inp.dataset.member);
        inp.value = match ? match.amount : "";
        applyRowCalc(inp, match && match.calc);
      });
      updateShareSumCheck();
    }

    document.querySelector('.app-tab[data-tab="expense"]').click();
    document.getElementById("panelExpense").scrollIntoView({ behavior:"smooth", block:"start" });
  }

  function exitEditMode(){
    editingExpenseId = null;
    editingExpenseOriginal = null;
    document.getElementById("editBanner").classList.add("hidden");
    document.getElementById("expFormTitle").textContent = "🧾 新增支出";
    const expAmtInp = document.getElementById("expAmount");
    if(expAmtInp){ expAmtInp.value = ""; clearRowCalc(expAmtInp); }
    const expTaxInp = document.getElementById("expTaxAmount");
    if(expTaxInp){ expTaxInp.value = ""; clearRowCalc(expTaxInp); }
    manualTaxSplitMode = "ratio";
    manualTaxType = "inclusive";
    updateManualTaxTypeUI();
    document.getElementById("expDesc").value = "";
    if(document.getElementById("expNote")) document.getElementById("expNote").value = "";
    clearTempEditOptions();
  }

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  if(cancelEditBtn){
    cancelEditBtn.addEventListener("click", ()=>{
      exitEditMode();
      document.getElementById("addExpenseBtn").textContent = "加入這筆支出";
      document.getElementById("expAmount").value = "";
      const expTaxInp = document.getElementById("expTaxAmount");
      if(expTaxInp){ expTaxInp.value = ""; clearRowCalc(expTaxInp); }
      document.getElementById("expDesc").value = "";
      if(document.getElementById("expNote")) document.getElementById("expNote").value = "";
      document.querySelectorAll("#expPayers .amt-row-input, #expSharesCustom .amt-row-input, #expAddonsList .exp-addon-input").forEach(i=>{ i.value=""; clearRowCalc(i); });
      document.getElementById("payerSumCheck").innerHTML = "";
      document.getElementById("shareSumCheck").innerHTML = "";
      const addonsPreview = document.getElementById("expAddonsPreview");
      if(addonsPreview) addonsPreview.classList.add("hidden");
      const expTaxPreview = document.getElementById("expTaxPreview");
      if(expTaxPreview) expTaxPreview.classList.add("hidden");
    });
  }

  const addRepayBtn = document.getElementById("addRepaymentBtn");
  if(addRepayBtn){
    addRepayBtn.addEventListener("click", async ()=>{
      const from_member = document.getElementById("repayFrom").value;
      const to_member = document.getElementById("repayTo").value;
      const amount = Number(document.getElementById("repayAmount").value);
      const note = document.getElementById("repayNote").value.trim();
      const payment_date = document.getElementById("repayDate").value;
      const msg = document.getElementById("repayMsg");

      if(from_member === to_member){ msg.textContent = "付錢跟收錢不能是同一個人"; msg.className = "msg error"; return; }
      if(!amount || amount <= 0){ msg.textContent = "請輸入正確金額"; msg.className = "msg error"; return; }

      const payload = { from_member, to_member, amount, note: note || null, payment_date, created_by: myMember.id, currency: CURRENCY };
      const { error } = editingRepaymentId
        ? await sb.from("repayments").update(payload).eq("id", editingRepaymentId)
        : await sb.from("repayments").insert(payload);
      if(error){ msg.textContent = (editingRepaymentId ? "更新失敗：" : "新增失敗：") + error.message; msg.className = "msg error"; return; }

      msg.textContent = editingRepaymentId ? "已更新！" : "已記錄還款！";
      msg.className = "msg ok";
      const wasEditing = !!editingRepaymentId;
      addRepayBtn.textContent = wasEditing ? "✓ 已更新" : "✓ 已記錄";
      addRepayBtn.classList.add("btn-success");
      setTimeout(()=>{
        addRepayBtn.classList.remove("btn-success");
        addRepayBtn.textContent = "記錄這筆還款";
      }, 1100);
      if(wasEditing) exitEditRepaymentMode();
      document.getElementById("repayAmount").value = "";
      document.getElementById("repayNote").value = "";
      await refreshExpenses();
    });
  }

  // ---------- edit repayment ----------
  let editingRepaymentId = null;

  function startEditRepayment(r){
    clearTempEditOptions();
    editingRepaymentId = r.id;
    document.getElementById("repayEditBanner").classList.remove("hidden");
    document.getElementById("repayFormTitle").textContent = "✎ 編輯還款";
    document.getElementById("addRepaymentBtn").textContent = "更新這筆還款";

    ensureSelectOption(document.getElementById("repayFrom"), r.from_member);
    ensureSelectOption(document.getElementById("repayTo"), r.to_member);
    document.getElementById("repayFrom").value = r.from_member;
    document.getElementById("repayTo").value = r.to_member;
    enhanceSelect(document.getElementById("repayFrom"));
    enhanceSelect(document.getElementById("repayTo"));
    document.getElementById("repayAmount").value = r.amount;
    document.getElementById("repayNote").value = r.note || "";
    document.getElementById("repayDate").value = r.payment_date;

    document.querySelector('.app-tab[data-tab="repay"]').click();
    document.getElementById("panelRepay").scrollIntoView({ behavior:"smooth", block:"start" });
  }

  function exitEditRepaymentMode(){
    editingRepaymentId = null;
    document.getElementById("repayEditBanner").classList.add("hidden");
    document.getElementById("repayFormTitle").textContent = "💸 記錄還款";
    clearTempEditOptions();
  }

  const cancelRepayEditBtn = document.getElementById("cancelRepayEditBtn");
  if(cancelRepayEditBtn){
    cancelRepayEditBtn.addEventListener("click", ()=>{
      exitEditRepaymentMode();
      document.getElementById("addRepaymentBtn").textContent = "記錄這筆還款";
      document.getElementById("repayAmount").value = "";
      document.getElementById("repayNote").value = "";
    });
  }

  let cachedExpenses = [];
  let cachedRepayments = [];

  let historyPageSize = Number(localStorage.getItem("sb_history_page_size")) || 5;
  let expensePage = 0;
  let repaymentPage = 0;
  function paginationHTML(page, totalPages){
    if(totalPages <= 1) return "";
    return `<div class="pagination">
      <button type="button" class="btn secondary small pagination-prev" ${page <= 0 ? "disabled" : ""}>← 上一頁</button>
      <span class="pagination-info">第 ${page + 1} / ${totalPages} 頁</span>
      <button type="button" class="btn secondary small pagination-next" ${page >= totalPages - 1 ? "disabled" : ""}>下一頁 →</button>
    </div>`;
  }
  async function refreshExpenses(){
    const { data: expenses, error: expError } = await sb.from("expenses")
      .select("*")
      .eq("currency", CURRENCY)
      .order("expense_date", { ascending:false })
      .order("created_at", { ascending:false });
    const { data: repayments, error: repError } = await sb.from("repayments")
      .select("*")
      .eq("currency", CURRENCY)
      .order("payment_date", { ascending:false })
      .order("created_at", { ascending:false });

    // 讀取失敗就先不要用空陣列覆蓋畫面——那樣看起來會像「所有紀錄都不見了」，
    // 寧可維持上一次成功讀到的內容，等下一次重新整理再試。
    if(expError || repError){
      console.error("讀取支出/還款失敗：", expError || repError);
      return;
    }

    cachedExpenses = expenses || [];
    cachedRepayments = repayments || [];
    applyFiltersAndRenderHistory();
    applyFiltersAndRenderRepayments();
    await renderBalances(expenses || [], repayments || []);
  }

  // ---------- 即時同步：別人新增/編輯/刪除支出或還款時，自動重新整理 ----------
  // 需要先在 Supabase 後台的 Database > Replication 把 expenses、repayments
  // 這兩張表加進 supabase_realtime publication，這段程式碼才收得到變動通知。
  let realtimeSubscribed = false;
  function subscribeRealtime(){
    if(realtimeSubscribed) return;
    realtimeSubscribed = true;

    let refreshTimer = null;
    function scheduleRefresh(){
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(()=>{ refreshExpenses(); }, 400);
    }

    // filter 一定要帶 group_id，不然即時同步會把「所有群組」的異動都廣播過來，
    // 雖然畫面上會被 isRelevantToMe() 擋掉不顯示，但資料還是會傳到瀏覽器裡，
    // 等於別的群組的支出內容在網路層/記憶體裡洩漏出來，不是真的隔離。
    // 幣別的篩選改成在收到資料後自己判斷（Realtime 的 filter 一次只能帶一個欄位）。
    sb.channel("splitbill-" + CURRENCY)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `group_id=eq.${myMember.group_id}` }, (payload)=>{
        const row = (payload.new && Object.keys(payload.new).length) ? payload.new : payload.old;
        if(row && row.currency !== CURRENCY) return;
        notifyRelevantChange("expenses", payload);
        scheduleRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "repayments", filter: `group_id=eq.${myMember.group_id}` }, (payload)=>{
        const row = (payload.new && Object.keys(payload.new).length) ? payload.new : payload.old;
        if(row && row.currency !== CURRENCY) return;
        notifyRelevantChange("repayments", payload);
        scheduleRefresh();
      })
      .subscribe();
  }

  function checkedIds(containerId){
    return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(i => i.value);
  }

  function getEffectiveFrom(){
    const fromEl = document.getElementById("filterFrom");
    const from = fromEl ? fromEl.value : "";
    if(from) return from;
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0,10);
  }

  function passesFilter(e){
    const from = getEffectiveFrom();
    const toEl = document.getElementById("filterTo");
    const to = toEl ? toEl.value : "";
    const kwEl = document.getElementById("filterKeyword");
    const keyword = kwEl ? kwEl.value.trim().toLowerCase() : "";
    const payerIds = checkedIds("filterPayerChecks");
    const involvedIds = checkedIds("filterInvolvedChecks");

    if(from && e.expense_date < from) return false;
    if(to && e.expense_date > to) return false;
    if(keyword && !e.description.toLowerCase().includes(keyword) && !(e.note || "").toLowerCase().includes(keyword)) return false;
    if(payerIds.length && !(e.payers || []).some(p => payerIds.includes(p.member_id))) return false;
    if(involvedIds.length && !(e.shares || []).some(s => involvedIds.includes(s.member_id))) return false;
    return true;
  }

  function passesRepayFilter(r){
    const from = getEffectiveFrom();
    const toEl = document.getElementById("filterTo");
    const to = toEl ? toEl.value : "";
    const kwEl = document.getElementById("filterKeyword");
    const keyword = kwEl ? kwEl.value.trim().toLowerCase() : "";
    const fromIds = checkedIds("filterRepayFromChecks");
    const toIds = checkedIds("filterRepayToChecks");

    if(from && r.payment_date < from) return false;
    if(to && r.payment_date > to) return false;
    if(keyword && !(r.note || "").toLowerCase().includes(keyword)) return false;
    if(fromIds.length && !fromIds.includes(r.from_member)) return false;
    if(toIds.length && !toIds.includes(r.to_member)) return false;
    return true;
  }

  function applyFiltersAndRenderHistory(){
    expensePage = 0;
    renderHistory(cachedExpenses.filter(passesFilter));
  }
  function applyFiltersAndRenderRepayments(){
    repaymentPage = 0;
    renderRepaymentHistory(cachedRepayments.filter(passesRepayFilter));
  }

  ["filterFrom","filterTo","filterKeyword"].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener("input", ()=>{
        applyFiltersAndRenderHistory();
        applyFiltersAndRenderRepayments();
      });
    }
  });

  const filterClearBtn = document.getElementById("filterClearBtn");
  if(filterClearBtn){
    filterClearBtn.addEventListener("click", ()=>{
      document.getElementById("filterFrom").value = "";
      document.getElementById("filterTo").value = "";
      document.getElementById("filterKeyword").value = "";
      document.querySelectorAll("#filterPayerChecks input, #filterInvolvedChecks input, #filterRepayFromChecks input, #filterRepayToChecks input").forEach(inp=>{
        inp.checked = false;
        inp.closest(".check-pill").classList.remove("checked");
      });
      applyFiltersAndRenderHistory();
      applyFiltersAndRenderRepayments();
    });
  }

  // ---------- 歷史紀錄類型切換（支出 vs 還款） ----------
  function switchHistoryTab(type){
    const isExp = type === "expense";

    // 1. 更新歷史紀錄切換按鈕
    document.querySelectorAll(".history-type-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.historyType === type);
    });

    // 2. 切換清單顯示
    const expEl = document.getElementById("expenseHistory");
    const repEl = document.getElementById("repaymentHistory");
    if(expEl) expEl.classList.toggle("hidden", !isExp);
    if(repEl) repEl.classList.toggle("hidden", isExp);

    // 3. 同步上方篩選面板的按鈕與欄位
    document.querySelectorAll('.split-mode-btn[data-filter-type]').forEach(b => {
      b.classList.toggle("active", b.dataset.filterType === type);
    });
    const expFields = document.getElementById("filterExpenseFields");
    const repFields = document.getElementById("filterRepayFields");
    if(expFields) expFields.classList.toggle("hidden", !isExp);
    if(repFields) repFields.classList.toggle("hidden", isExp);

    const body = document.getElementById("filterBody");
    if(body && body.classList.contains("open")){
      body.style.maxHeight = body.scrollHeight + "px";
    }

    // 4. 重新渲染對應列表
    if(isExp){
      applyFiltersAndRenderHistory();
    } else {
      applyFiltersAndRenderRepayments();
    }
  }

  // 綁定歷史紀錄上方按鈕
  document.querySelectorAll(".history-type-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      switchHistoryTab(btn.dataset.historyType);
    });
  });

  // 綁定篩選器上方按鈕
  document.querySelectorAll('.split-mode-btn[data-filter-type]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      switchHistoryTab(btn.dataset.filterType);
    });
  });

  // ---------- 每頁筆數下拉式選單 ----------
  const pageSizeSelect = document.getElementById("historyPageSizeSelect");
  if(pageSizeSelect){
    pageSizeSelect.value = String(historyPageSize);
    enhanceSelect(pageSizeSelect);
    pageSizeSelect.addEventListener("change", () => {
      historyPageSize = Number(pageSizeSelect.value) || 5;
      localStorage.setItem("sb_history_page_size", historyPageSize);
      expensePage = 0;
      repaymentPage = 0;
      renderHistory(lastFilteredExpenses);
      renderRepaymentHistory(lastFilteredRepayments);
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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
  function emptyStateHTML(icon, title, text){
    return `<div class="debt-empty-state">
      <div class="debt-empty-icon">${icon}</div>
      <div class="debt-empty-title">${title}</div>
      <div class="debt-empty-text">${text}</div>
    </div>`;
  }
  // 誰能編輯／刪除：改成「這筆帳的債務關係人」都能動，不再限定當初新增的人。
  // 支出：付款人或分攤人都算；還款：付錢方或收錢方都算。
  function isExpenseParty(e, userId){
    return (e.payers || []).some(p => p.member_id === userId) || (e.shares || []).some(s => s.member_id === userId);
  }
  function isRepaymentParty(r, userId){
    return r.from_member === userId || r.to_member === userId;
  }
  function formatTime(createdAt, entryDate){
    if(!createdAt) return "";
    const d = new Date(createdAt);
    if(isNaN(d.getTime())) return "";
    // 只有「記錄當下的日期」跟「這筆款項的日期」是同一天，才顯示時間
    // （例如補記昨天的支出，就只顯示日期；記錄當下這筆的話，時間會永久保留，
    // 不會因為之後過了幾天再回來看就不見）。
    const createdDate = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if(entryDate !== createdDate) return "";
    return d.toLocaleTimeString("zh-TW", { hour:"2-digit", minute:"2-digit", hour12:false });
  }

  // ---------- 跨幣別轉移輔助函式 ----------
  function generateUUID(){
    if(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"){
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function isXcurStr(str){
    return Boolean(str && String(str).includes("xcur"));
  }

  function splitExpenseTitleAndNote(fullDesc, explicitNote){
    const metaMatches = [];
    const extractMeta = (s) => {
      if(!s) return "";
      return String(s)
        .replace(/<!--[\s\S]*?-->/gi, (m) => { metaMatches.push(m); return ""; })
        .replace(/AI_RECEIPT_DATA:[\s\S]*/gi, "")
        .replace(/\s*\[xcur[:_][^\]]+\]/gi, (m) => { metaMatches.push(m.trim()); return ""; })
        .trim();
    };

    let cleanedDesc = extractMeta(fullDesc);
    let cleanedExplicitNote = extractMeta(explicitNote);

    let title = "";
    let note = "";

    if(cleanedExplicitNote){
      title = cleanedDesc.replace(/\(AI自動拆單\)/g, "").trim() || "支出項目";
      note = cleanedExplicitNote;
    } else {
      const lines = cleanedDesc.split("\n").map(l => l.trim()).filter(Boolean);
      let firstLine = lines[0] || "";
      let noteLines = lines.slice(1);

      // 針對舊版跨幣別格式特殊處理："日幣債務轉入 (¥5,987 匯率 0.199893)"
      const xcurMatch = firstLine.match(/^(.*債務轉入)\s*\(([^\)]+)\)$/);
      if(xcurMatch){
        firstLine = xcurMatch[1].trim();
        noteLines.unshift(xcurMatch[2].trim());
      }

      title = firstLine.replace(/\(AI自動拆單\)/g, "").trim() || "支出項目";
      note = noteLines.join("\n").trim();
    }

    const meta = metaMatches.join(" ").trim();
    return { title, note, meta };
  }

  function cleanXcurText(str, explicitNote){
    const { title, note } = splitExpenseTitleAndNote(str, explicitNote);
    return note ? `${title}\n${note}` : title;
  }

  function getFirstLineDesc(str, explicitNote){
    return splitExpenseTitleAndNote(str, explicitNote).title;
  }

  async function handleCrossCurrencyDelete(textOrGroup, fallbackFn){
    const uuidMatch = (textOrGroup || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const legacyMatch = (textOrGroup || "").match(/xcur_[a-zA-Z0-9_-]+/);
    const match = uuidMatch || legacyMatch;
    if(!match){
      return fallbackFn();
    }
    const xcurKey = match[0];
    const ok = await sbConfirm(
      `這是一筆「跨幣別轉移」紀錄！\n\n確定要還原此轉移嗎？\n\n還原後將會同時：\n1. 刪除原外幣的結清紀錄（恢復外幣欠款）\n2. 刪除臺幣帳本中對應的欠款紀錄\n兩邊帳本將完全恢復原狀。`,
      "🔔 Splitbill 還原確認"
    );
    if(!ok) return;

    // 雙向刪除：在外幣 repayments 與臺幣 expenses (比對 description 與 note)
    const promises = [
      sb.from("repayments").delete().ilike("note", `%${xcurKey}%`),
      sb.from("expenses").delete().ilike("description", `%${xcurKey}%`),
      sb.from("expenses").delete().ilike("note", `%${xcurKey}%`)
    ];
    if(uuidMatch){
      promises.push(sb.from("repayments").delete().eq("offset_group", xcurKey));
    }

    const results = await Promise.all(promises);
    const err = results.find(r => r && r.error);
    if(err && err.error){
      await sbAlert("還原失敗：" + err.error.message, "🔔 Splitbill 錯誤");
      return;
    }
    await sbAlert("✓ 已成功還原跨幣別轉移！外幣與臺幣帳本皆已恢復原狀。", "🔔 Splitbill 通知");
    await refreshExpenses();
  }

  function formatDateGroupTitle(dateStr){
    if(!dateStr) return "";
    try{
      const parts = dateStr.split("-");
      if(parts.length === 3){
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
        const weekday = weekdays[d.getDay()] || "";
        return `${Number(parts[1])}月${Number(parts[2])}日 · ${weekday}`;
      }
    }catch(e){}
    return dateStr;
  }

  let expenseById = {};
  let lastFilteredExpenses = [];
  function renderHistory(expenses){
    const el = document.getElementById("expenseHistory");
    if(!el) return;
    lastFilteredExpenses = expenses;
    if(!expenses.length){
      el.innerHTML = cachedExpenses.length
        ? emptyStateHTML("🔍", "沒有符合篩選條件的紀錄", "試試看調整上面的篩選條件")
        : emptyStateHTML("🧾", "還沒有任何支出紀錄", "點上面「支出」分頁新增第一筆吧");
      return;
    }
    const totalPages = Math.ceil(expenses.length / historyPageSize);
    if(expensePage >= totalPages) expensePage = totalPages - 1;
    if(expensePage < 0) expensePage = 0;
    const pageItems = expenses.slice(expensePage * historyPageSize, (expensePage + 1) * historyPageSize);

    expenseById = {};
    pageItems.forEach(e => { expenseById[e.id] = e; });

    // 按日期分組呈現（手帳質感）
    const groups = [];
    let curGroup = null;
    pageItems.forEach(e => {
      const d = e.expense_date || "未指定日期";
      if(!curGroup || curGroup.date !== d){
        curGroup = { date: d, items: [], total: 0 };
        groups.push(curGroup);
      }
      curGroup.items.push(e);
      curGroup.total += Number(e.amount) || 0;
    });

    el.innerHTML = groups.map(g => {
      const dateTitle = formatDateGroupTitle(g.date);
      const itemsHtml = g.items.map(e => {
        const { title, note } = splitExpenseTitleAndNote(e.description, e.note);
        const canEdit = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;
        const isXcur = isXcurStr(e.description) || isXcurStr(e.note);
        const isAiSplit = Boolean((e.description && (e.description.includes("<!--AI_RECEIPT_DATA:") || e.description.includes("(AI自動拆單)") || e.description.includes("📋 品項明細"))) || (e.note && e.note.includes("<!--AI_RECEIPT_DATA:")));
        const icon = getCategoryIcon(title || e.description);
        const payerNames = (e.payers || []).map(p => escapeHtml(memberById[p.member_id] || "?")).join("、");
        const shareNames = (e.shares || []).map(s => escapeHtml(memberById[s.member_id] || "?")).join("、");
        const firstLineNote = note ? note.split("\n")[0].trim() : "";
        return `<div class="exp-item" data-id="${e.id}" title="點擊查看本項目的債務關係表與品項明細">
          <div class="exp-cat-badge">${icon}</div>
          <div class="exp-main">
            <div class="exp-desc">${escapeHtml(title)}${isAiSplit ? '<span class="ai-split-badge" style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;background:color-mix(in srgb, var(--btn-primary) 14%, var(--paper));color:var(--btn-primary);margin-left:5px;">🤖 AI拆單</span>' : ""}${isXcur ? '<span class="xcur-badge">💱 跨幣轉入</span>' : ""}</div>
            <div class="exp-meta">
              ${firstLineNote ? `<span class="exp-meta-line" style="color:var(--ink);font-weight:600;opacity:0.9;">📝 備註：${escapeHtml(firstLineNote.length > 40 ? firstLineNote.slice(0, 38) + "…" : firstLineNote)}</span>` : ""}
              <span class="exp-meta-line">時間：${e.expense_date}${formatTime(e.created_at, e.expense_date) ? " " + formatTime(e.created_at, e.expense_date) : ""}（${escapeHtml(memberById[e.created_by] || "?")}）</span>
              <span class="exp-meta-line">付款：${payerNames || "—"}</span>
              <span class="exp-meta-line">應付：${shareNames || "—"}</span>
            </div>
          </div>
          <div class="exp-right">
            <div class="exp-amt">${SYM}${formatAmt(e.amount)}${conversionHint(e.amount)}</div>
            ${canEdit ? `<div class="exp-actions">${isXcur ? `<button class="exp-del exp-xcur-restore" data-id="${e.id}" title="還原這筆跨幣別轉移" aria-label="還原">↺</button>` : `<button class="exp-edit" data-id="${e.id}" title="編輯">✎</button><button class="exp-del" data-id="${e.id}" title="刪除">✕</button>`}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      return `
        <div class="exp-date-group">
          <div class="exp-date-group-header">
            <div class="exp-date-group-title">📅 ${dateTitle}</div>
            <div class="exp-date-group-badge">共 ${g.items.length} 筆 · 小計 ${SYM}${formatAmt(g.total)}</div>
          </div>
          ${itemsHtml}
        </div>
      `;
    }).join("") + paginationHTML(expensePage, totalPages);

    el.querySelectorAll(".exp-item").forEach(itemEl => {
      itemEl.addEventListener("click", (evt) => {
        if(evt.target.closest(".exp-actions") || evt.target.closest("button")) return;
        const e = expenseById[itemEl.dataset.id];
        if(e) showExpenseDebtDetail(e);
      });
    });

    el.querySelectorAll(".exp-del").forEach(btn=>{
      btn.addEventListener("click", async (e)=>{
        e.stopPropagation();
        const exp = expenseById[btn.dataset.id];
        const rawDesc = (exp && exp.description) || "";
        if(isXcurStr(rawDesc)){
          return handleCrossCurrencyDelete(rawDesc, async ()=>{
            const { error } = await sb.from("expenses").delete().eq("id", btn.dataset.id);
            if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
            await refreshExpenses();
          });
        }
        const ok = await sbConfirm("確定要刪除這筆紀錄嗎？");
        if(!ok) return;
        const { error } = await sb.from("expenses").delete().eq("id", btn.dataset.id);
        if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
        await refreshExpenses();
      });
    });
    el.querySelectorAll(".exp-edit").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        const exp = expenseById[btn.dataset.id];
        if(exp) startEditExpense(exp);
      });
    });
    const prevBtn = el.querySelector(".pagination-prev");
    if(prevBtn) prevBtn.addEventListener("click", ()=>{ expensePage--; renderHistory(lastFilteredExpenses); });
    const nextBtn = el.querySelector(".pagination-next");
    if(nextBtn) nextBtn.addEventListener("click", ()=>{ expensePage++; renderHistory(lastFilteredExpenses); });
  }

  // 把「一鍵抵銷」產生的兩筆方向相反的還款（同一個 offset_group）
  // 合併成一個顯示單位，避免歷史紀錄裡拆成兩筆讓人誤刪一半。
  // 如果篩選條件只留下其中一筆（例如只篩其中一個人），就當一般單筆處理。
  function groupRepayments(repayments){
    const grouped = new Set();
    const units = [];
    repayments.forEach(r=>{
      if(grouped.has(r.id)) return;
      if(r.offset_group){
        const pair = repayments.filter(x => x.offset_group === r.offset_group);
        if(pair.length >= 2){
          pair.forEach(p => grouped.add(p.id));
          units.push({ type:"offset", items: pair });
          return;
        }
      }
      grouped.add(r.id);
      units.push({ type:"single", items:[r] });
    });
    return units;
  }

  let lastFilteredRepayments = [];
  let repaymentById = {};
  function renderRepaymentHistory(repayments){
    const el = document.getElementById("repaymentHistory");
    if(!el) return;
    lastFilteredRepayments = repayments;
    if(!repayments.length){
      el.innerHTML = cachedRepayments.length
        ? emptyStateHTML("🔍", "沒有符合篩選條件的紀錄", "試試看調整上面的篩選條件")
        : emptyStateHTML("💸", "還沒有任何還款紀錄", "有人還錢的時候記得來記一筆");
      return;
    }
    const units = groupRepayments(repayments);
    const totalPages = Math.ceil(units.length / historyPageSize);
    if(repaymentPage >= totalPages) repaymentPage = totalPages - 1;
    if(repaymentPage < 0) repaymentPage = 0;
    const pageUnits = units.slice(repaymentPage * historyPageSize, (repaymentPage + 1) * historyPageSize);

    repaymentById = {};
    pageUnits.forEach(u => u.items.forEach(r => { repaymentById[r.id] = r; }));

    // 按日期分組呈現
    const groups = [];
    let curGroup = null;
    pageUnits.forEach(u => {
      const d = (u.items && u.items[0] && u.items[0].payment_date) || "未指定日期";
      if(!curGroup || curGroup.date !== d){
        curGroup = { date: d, units: [], total: 0 };
        groups.push(curGroup);
      }
      curGroup.units.push(u);
      curGroup.total += Number(u.items[0].amount) || 0;
    });

    el.innerHTML = groups.map(g => {
      const dateTitle = formatDateGroupTitle(g.date);
      const unitsHtml = g.units.map(u => {
        if(u.type === "offset"){
          const [a, b] = u.items;
          const canEdit = isRepaymentParty(a, myMember.id);
          const isXcur = isXcurStr(a.offset_group) || isXcurStr(a.note);
          return `<div class="exp-item">
            <div class="exp-cat-badge" style="background:color-mix(in srgb, #5C7CFA 12%, var(--card));">🔄</div>
            <div class="exp-main">
              <div class="exp-desc">${escapeHtml(memberById[a.from_member] || "?")} ↔ ${escapeHtml(memberById[a.to_member] || "?")} 互相抵銷${isXcur ? '<span class="xcur-badge">💱 轉為臺幣</span>' : ""}</div>
              <div class="exp-meta">紀錄時間：${a.payment_date}${formatTime(a.created_at, a.payment_date) ? " " + formatTime(a.created_at, a.payment_date) : ""}（${escapeHtml(memberById[a.created_by] || "?")}）</div>
            </div>
            <div class="exp-right">
              <div class="exp-amt">${SYM}${formatAmt(a.amount)}${conversionHint(a.amount)}</div>
              ${canEdit ? `<div class="exp-actions"><button class="exp-del exp-del-group ${isXcur ? "exp-xcur-restore" : ""}" data-group="${a.offset_group}" title="${isXcur ? "還原跨幣別轉移" : "刪除這組抵銷"}" aria-label="${isXcur ? "還原" : "刪除"}">${isXcur ? "↺" : "✕"}</button></div>` : ""}
            </div>
          </div>`;
        }
        const r = u.items[0];
        const canEdit = isRepaymentParty(r, myMember.id) || r.created_by === myMember.id;
        const isXcur = isXcurStr(r.note) || isXcurStr(r.offset_group);
        const cleanNote = cleanXcurText(r.note);
        return `<div class="exp-item">
          <div class="exp-cat-badge" style="background:color-mix(in srgb, #40C057 12%, var(--card));">💸</div>
          <div class="exp-main">
            <div class="exp-desc">${escapeHtml(memberById[r.from_member] || "?")} 還 ${escapeHtml(memberById[r.to_member] || "?")}${isXcur ? '<span class="xcur-badge">💱 轉為臺幣</span>' : ""}</div>
            <div class="exp-meta">紀錄時間：${r.payment_date}${formatTime(r.created_at, r.payment_date) ? " " + formatTime(r.created_at, r.payment_date) : ""}（${escapeHtml(memberById[r.created_by] || "?")}）${cleanNote ? " ・ " + escapeHtml(cleanNote) : ""}</div>
          </div>
          <div class="exp-right">
            <div class="exp-amt">${SYM}${formatAmt(r.amount)}${conversionHint(r.amount)}</div>
            ${canEdit ? `<div class="exp-actions">${isXcur ? `<button class="exp-del exp-xcur-restore" data-id="${r.id}" title="還原這筆跨幣別轉移" aria-label="還原">↺</button>` : `<button class="exp-edit" data-id="${r.id}" title="編輯">✎</button><button class="exp-del" data-id="${r.id}" title="刪除">✕</button>`}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      return `
        <div class="exp-date-group">
          <div class="exp-date-group-header">
            <div class="exp-date-group-title">📅 ${dateTitle}</div>
            <div class="exp-date-group-badge">共 ${g.units.length} 筆 · 小計 ${SYM}${formatAmt(g.total)}</div>
          </div>
          ${unitsHtml}
        </div>
      `;
    }).join("") + paginationHTML(repaymentPage, totalPages);
    el.querySelectorAll(".exp-edit").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const r = repaymentById[btn.dataset.id];
        if(r) startEditRepayment(r);
      });
    });
    el.querySelectorAll(".exp-del:not(.exp-del-group)").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const r = repaymentById[btn.dataset.id];
        const rawNote = (r && r.note) || "";
        const rawGroup = (r && r.offset_group) || "";
        if(isXcurStr(rawNote) || isXcurStr(rawGroup)){
          return handleCrossCurrencyDelete(rawNote || rawGroup, async ()=>{
            const { error } = await sb.from("repayments").delete().eq("id", btn.dataset.id);
            if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
            await refreshExpenses();
          });
        }
        const ok = await sbConfirm("確定要刪除這筆還款紀錄嗎？");
        if(!ok) return;
        const { error } = await sb.from("repayments").delete().eq("id", btn.dataset.id);
        if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
        await refreshExpenses();
      });
    });
    el.querySelectorAll(".exp-del-group").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const group = btn.dataset.group;
        if(isXcurStr(group)){
          return handleCrossCurrencyDelete(group, async ()=>{
            const { error } = await sb.from("repayments").delete().eq("offset_group", group);
            if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
            await refreshExpenses();
          });
        }
        const ok = await sbConfirm("確定要刪除這組抵銷紀錄嗎？");
        if(!ok) return;
        const { error } = await sb.from("repayments").delete().eq("offset_group", group);
        if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
        await refreshExpenses();
      });
    });
    const prevBtn = el.querySelector(".pagination-prev");
    if(prevBtn) prevBtn.addEventListener("click", ()=>{ repaymentPage--; renderRepaymentHistory(lastFilteredRepayments); });
    const nextBtn = el.querySelector(".pagination-next");
    if(nextBtn) nextBtn.addEventListener("click", ()=>{ repaymentPage++; renderRepaymentHistory(lastFilteredRepayments); });
  }

  function fireConfetti(){
    const colors = ["#C2445F","#7A6B9E","#2F8F4E","#F5C2CE"];
    const container = document.createElement("div");
    container.className = "sb-confetti";
    for(let i=0;i<26;i++){
      const bit = document.createElement("span");
      bit.style.left = (45 + Math.random()*10) + "%";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = (Math.random()*0.15) + "s";
      bit.style.setProperty("--dx", (Math.random()*220-110) + "px");
      bit.style.setProperty("--rot", (Math.random()*520-260) + "deg");
      container.appendChild(bit);
    }
    document.body.appendChild(container);
    setTimeout(()=>{ container.remove(); }, 1600);
  }
  let lastBalanceCls = null;

  // ---------- 跟我有關的欠款/還款趨勢：可切換週／月／年為一組（一次看 4 格），
  // 往上是我這組要分攤的支出金額（我欠更多了），往下是別人這組還給我的錢
  // （to_member 是我）。
  let chartGranularity = "week"; // week | month | year
  let chartOffset = 0; // 以「4 格」為單位，0=目前這組，負數=往回翻
  let chartExpensesCache = [];
  let chartRepaymentsCache = [];

  function toDateStr(d){
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function startOfWeek(d){
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  }

  // 依目前的粒度（日/週/月/年），算出這一組 4 格各自的起始日。
  function getBucketStarts(granularity, offset){
    const starts = [];
    if(granularity === "day"){
      const anchor = new Date();
      anchor.setHours(0, 0, 0, 0);
      anchor.setDate(anchor.getDate() + offset * 4);
      for(let i = 3; i >= 0; i--) starts.push(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - i));
    } else if(granularity === "week"){
      const anchor = startOfWeek(new Date());
      anchor.setDate(anchor.getDate() + offset * 4 * 7);
      for(let i = 3; i >= 0; i--) starts.push(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - i * 7));
    } else if(granularity === "month"){
      const now = new Date();
      const anchorIndex = now.getMonth() + offset * 4;
      for(let i = 3; i >= 0; i--) starts.push(new Date(now.getFullYear(), anchorIndex - i, 1));
    } else {
      const now = new Date();
      const anchorYear = now.getFullYear() + offset * 4;
      for(let i = 3; i >= 0; i--) starts.push(new Date(anchorYear - i, 0, 1));
    }
    return starts;
  }
  function bucketEnd(granularity, start){
    if(granularity === "day") return start;
    if(granularity === "week") return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    if(granularity === "month") return new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return new Date(start.getFullYear(), 11, 31);
  }
  function bucketLabel(granularity, start){
    if(granularity === "day" || granularity === "week") return `${start.getMonth() + 1}/${start.getDate()}`;
    if(granularity === "month") return `${start.getMonth() + 1}月`;
    return `${start.getFullYear()}`;
  }

  function bucketedPersonalFlow(expenses, repayments, granularity, bucketStarts){
    const myId = myMember && myMember.id;
    return bucketStarts.map(start=>{
      const end = bucketEnd(granularity, start);
      const from = toDateStr(start), to = toDateStr(end);
      const owe = expenses.reduce((sum, e)=>{
        const k = e.expense_date || "";
        if(k < from || k > to) return sum;
        // 呼叫全站統一的 computeExpenseDebts(e)，取得這筆支出實際產生的所有債務配對
        // 算出登入者自己身為債務人（debtor）所欠各債權人的「實際淨欠款」總和，
        // 與債務關係表和債務明細 100% 同步（例如自己先付了 784、分攤 1446，實際欠款即為 662，而非 1446）。
        const debts = computeExpenseDebts(e);
        let myDebt = 0;
        Object.keys(debts).forEach(creditorId=>{
          if(debts[creditorId] && debts[creditorId][myId]){
            myDebt += debts[creditorId][myId];
          }
        });
        return sum + myDebt;
      }, 0);
      const received = repayments.reduce((sum, r)=>{
        const k = r.payment_date || "";
        if(k < from || k > to || r.to_member !== myId) return sum;
        return sum + (Number(r.amount) || 0);
      }, 0);
      return { label: bucketLabel(granularity, start), owe, received };
    });
  }

  // 長條圖點一下（手機是 tap，桌機是 click）才顯示金額，不用滑鼠 hover——
  // 原生 SVG <title> 在手機上點了沒反應，改成自己接 click 事件、
  // 把金額寫到長條下面那行文字，時間/週期已經在長條下方的軸標籤看得到了，
  // 這裡只需要顯示 +/- 金額本身。
  function renderFlowChart(data){
    const wrap = document.getElementById("spendChartWrap");
    if(!wrap) return;
    if(!data.some(d => d.owe > 0 || d.received > 0)){
      wrap.innerHTML = `<p class="filter-hint">這段時間沒有跟你相關的支出或還款</p>`;
      return;
    }
    const max = Math.max(1, ...data.map(d => Math.max(d.owe, d.received)));
    const w = 320, h = 102, midY = 46, halfH = 38, gap = 14;
    const barW = (w - gap * (data.length + 1)) / data.length;
    const bars = data.map((d, i)=>{
      const x = gap + i * (barW + gap);
      const upH = d.owe > 0 ? Math.max(3, Math.round((d.owe / max) * halfH)) : 0;
      const downH = d.received > 0 ? Math.max(3, Math.round((d.received / max) * halfH)) : 0;
      const upTap = d.owe > 0 ? `data-amt="- ${SYM}${formatAmt(d.owe)}"` : "";
      const downTap = d.received > 0 ? `data-amt="+ ${SYM}${formatAmt(d.received)}"` : "";
      return `<rect x="${x.toFixed(1)}" y="${(midY - upH).toFixed(1)}" width="${barW.toFixed(1)}" height="${upH}" rx="3" class="flow-bar-up" ${upTap}></rect>
        <rect x="${x.toFixed(1)}" y="${midY}" width="${barW.toFixed(1)}" height="${downH}" rx="3" class="flow-bar-down" ${downTap}></rect>
        <text x="${(x + barW / 2).toFixed(1)}" y="${h - 4}" text-anchor="middle" class="spend-bar-label">${d.label}</text>`;
    }).join("");
    wrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="spend-chart" role="img" aria-label="跟我有關的欠款與還款趨勢">
      <line x1="0" y1="${midY}" x2="${w}" y2="${midY}" class="flow-zero-line"/>
      ${bars}
    </svg>
    <div class="flow-chart-legend"><span class="legend-up">■ 我的欠款</span><span class="legend-down">■ 已收還款</span></div>
    <p class="flow-chart-tap-hint" id="flowChartTapHint">點長條看金額</p>`;
  }

  function updateChartRangeLabel(bucketStarts){
    const label = document.getElementById("chartRangeLabel");
    if(!label) return;
    const fromLabel = bucketLabel(chartGranularity, bucketStarts[0]);
    const toLabel = chartGranularity === "week"
      ? bucketLabel(chartGranularity, bucketEnd(chartGranularity, bucketStarts[3]))
      : bucketLabel(chartGranularity, bucketStarts[3]);
    label.textContent = chartGranularity === "year" ? `${fromLabel}年 – ${toLabel}年` : `${fromLabel} – ${toLabel}`;
    const nextBtn = document.getElementById("chartNextBtn");
    if(nextBtn) nextBtn.disabled = chartOffset >= 0;
  }

  function updateSpendChart(){
    if(!myMember) return;
    const bucketStarts = getBucketStarts(chartGranularity, chartOffset);
    updateChartRangeLabel(bucketStarts);
    renderFlowChart(bucketedPersonalFlow(chartExpensesCache, chartRepaymentsCache, chartGranularity, bucketStarts));
  }

  const spendChartWrap = document.getElementById("spendChartWrap");
  if(spendChartWrap) spendChartWrap.addEventListener("click", (e)=>{
    const bar = e.target.closest("[data-amt]");
    if(!bar) return;
    const hint = document.getElementById("flowChartTapHint");
    if(hint) hint.textContent = bar.dataset.amt;
  });

  const chartPrevBtn = document.getElementById("chartPrevBtn");
  const chartNextBtn = document.getElementById("chartNextBtn");
  if(chartPrevBtn) chartPrevBtn.addEventListener("click", ()=>{
    chartOffset -= 1;
    updateSpendChart();
  });
  if(chartNextBtn) chartNextBtn.addEventListener("click", ()=>{
    if(chartOffset >= 0) return;
    chartOffset += 1;
    updateSpendChart();
  });
  const chartGranBtn = document.getElementById("chartGranBtn");
  const chartGranMenu = document.getElementById("chartGranMenu");
  const chartGranText = document.getElementById("chartGranText");
  if(chartGranBtn && chartGranMenu){
    chartGranBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const willOpen = chartGranMenu.classList.contains("hidden");
      chartGranMenu.classList.toggle("hidden", !willOpen);
      chartGranBtn.classList.toggle("open", willOpen);
    });
    chartGranMenu.querySelectorAll(".chart-gran-option").forEach(opt=>{
      opt.addEventListener("click", ()=>{
        chartGranularity = opt.dataset.value;
        chartGranText.textContent = opt.textContent;
        chartGranMenu.querySelectorAll(".chart-gran-option").forEach(o => o.classList.remove("active"));
        opt.classList.add("active");
        chartGranMenu.classList.add("hidden");
        chartGranBtn.classList.remove("open");
        chartOffset = 0;
        updateSpendChart();
      });
    });
    document.addEventListener("click", (e)=>{
      if(!chartGranMenu.classList.contains("hidden") && !chartGranMenu.contains(e.target) && e.target !== chartGranBtn){
        chartGranMenu.classList.add("hidden");
        chartGranBtn.classList.remove("open");
      }
    });
  }

  // 每人淨餘額改成呼叫資料庫的 member_balances() 函式算，不在前端重算，
  // 跟總覽頁共用同一份邏輯，不會有算法不一致的風險。
  async function renderBalances(expenses, repayments){
    const { data: balRows, error: balError } = await sb.rpc("member_balances", { p_since: null });
    // 讀不到餘額就先不要動畫面——不然全部人會被算成 0，顯示「已結清 🎉」，
    // 看起來像帳都結清了，其實只是這次查詢失敗。
    if(balError){
      console.error("讀取餘額失敗：", balError);
      return;
    }
    const balance = {};
    memberRows.forEach(m => balance[m.id] = 0);
    (balRows || []).forEach(row=>{
      if(row.currency === CURRENCY) balance[row.member_id] = Number(row.balance);
    });

    const balEl = document.getElementById("balanceList");
    if(balEl){
      balEl.innerHTML = memberRows.map(m=>{
        const amt = balance[m.id] || 0;
        const cls = amt > 0.05 ? "pos" : amt < -0.05 ? "neg" : "zero";
        const label = amt > 0.05 ? `該收 ${SYM}${formatAmt(amt)}${conversionHint(amt)}` : amt < -0.05 ? `該付 ${SYM}${formatAmt(Math.abs(amt))}${conversionHint(Math.abs(amt))}` : "已結清";
        return `<div class="balance-row"><span>${escapeHtml(m.name)}</span><span class="amt ${cls}">${label}</span></div>`;
      }).join("");
    }

    const myAmt = balance[myMember.id] || 0;
    const myCls = myAmt > 0.05 ? "pos" : myAmt < -0.05 ? "neg" : "zero";
    const myAbs = Math.abs(myAmt);
    const myBalanceAmtEl = document.getElementById("myBalanceAmt");
    if(myBalanceAmtEl){
      if(myCls === "zero"){
        myBalanceAmtEl.innerHTML = "已結清 🎉";
      } else {
        const statusText = myCls === "pos" ? "該收" : "該付";
        myBalanceAmtEl.innerHTML = `${statusText} ${SYM}${formatAmt(myAbs)}${conversionHint(myAbs)}`;
      }
      myBalanceAmtEl.className = "my-balance-amt " + myCls;
    }

    const myBalanceEl = document.getElementById("myBalance");
    if(myBalanceEl){
      myBalanceEl.className = "my-balance " + myCls;
      void myBalanceEl.offsetWidth;
      myBalanceEl.classList.add("pulse");
    }

    if(myCls === "zero" && lastBalanceCls !== null && lastBalanceCls !== "zero"){
      fireConfetti();
    }
    lastBalanceCls = myCls;

    chartExpensesCache = expenses;
    chartRepaymentsCache = repayments;
    updateSpendChart();

    renderSettlement(expenses, repayments);
    renderDebtMatrix(expenses, repayments);
  }

  function renderSettlement(expenses, repayments){
    // 跟債務關係表用同一份資料（buildDebtMatrix），
    // 「建議還款方式」的數字才會跟表格上的一致。
    const owed = buildDebtMatrix(expenses, repayments);
    let tx = [];
    Object.keys(owed).forEach(creditorId=>{
      Object.keys(owed[creditorId]).forEach(debtorId=>{
        const amt = owed[creditorId][debtorId];
        if(amt > 0.05) tx.push({ from: debtorId, to: creditorId, amt });
      });
    });
    // 登入者自己該還的款項排在最上面；同一個還款人的項目也排在一起，
    // 群組之間照該還款人的欠款總額由大到小排序，群組內照金額由大到小排序
    const myId = myMember && myMember.id;
    const groups = {};
    tx.forEach(t => { (groups[t.from] = groups[t.from] || []).push(t); });
    Object.values(groups).forEach(g => g.sort((a,b) => b.amt - a.amt));
    const fromIds = Object.keys(groups).sort((a,b) => {
      const aMine = a === myId ? 1 : 0;
      const bMine = b === myId ? 1 : 0;
      if(aMine !== bMine) return bMine - aMine;
      const aTotal = groups[a].reduce((s,t) => s + t.amt, 0);
      const bTotal = groups[b].reduce((s,t) => s + t.amt, 0);
      return bTotal - aTotal;
    });
    tx = fromIds.flatMap(id => groups[id]);

    const el = document.getElementById("settleList");
    if(!el) return;
    if(!tx.length){
      el.disabled = true;
      el.innerHTML = '<option value="">目前帳務已經平衡，不用轉帳給任何人 🎉</option>';
      enhanceSelect(el);
      return;
    }
    el.disabled = false;
    el.innerHTML = '<option value="">請選擇建議還款…</option>' + tx.map((t,i)=>{
      const twdText = conversionHintText(t.amt);
      return `<option value="${i}" data-from="${t.from}" data-to="${t.to}" data-amt="${t.amt}">${escapeHtml(memberById[t.from] || "?")} 還 ${escapeHtml(memberById[t.to] || "?")}　${SYM}${formatAmt(t.amt)}${twdText ? "（" + twdText + "）" : ""}</option>`;
    }).join("");
    enhanceSelect(el);
    el.onchange = ()=>{
      const opt = el.selectedOptions[0];
      if(!opt || !opt.dataset.from) return;
      document.getElementById("repayFrom").value = opt.dataset.from;
      document.getElementById("repayTo").value = opt.dataset.to;
      document.getElementById("repayAmount").value = opt.dataset.amt;
      enhanceSelect(document.getElementById("repayFrom"));
      enhanceSelect(document.getElementById("repayTo"));
      document.getElementById("repayAmount").scrollIntoView({ behavior:"smooth", block:"center" });
    };
  }

  // ---------- debt matrix (債權人 rows × 債務人 columns) ----------

// ============================================================
// 債務計算
// ============================================================
//
// 規則：
// 1. 付款人自己應負擔的部分，不會變成自己欠別人的錢，
//    也不會變成欠別人錢的債務人。
// 2. 多人付款時，先算每個人的「多付 / 少付」，不同筆支出、
//    不同方向的債務彼此不互相抵銷。
// 3. 債務人盡量只還給少數債權人。
// 4. 「建議還款方式」跟「債務關係表」共用同一份 buildDebtMatrix()
//    結果，兩邊數字保證一致。
// ============================================================

// ============================================================
// 債務關係表資料
// ============================================================
//
// 每筆支出 → 個別建立債務
// 還款 → 只沖掉同一對債務
//
// 不會出現：
// A 欠 B
// B 欠 C
// 最後表格卻變成 A 欠 C
// ============================================================

// ============================================================
// 單筆支出的淨額拆算（債務關係表跟債務明細共用同一套算法，
// 避免兩邊數字對不起來）
// ============================================================
//
// 先把每個人「付的錢」跟「該負擔的錢」相抵，抵完還有剩的：
// 剩多的人 = 這筆支出的債權人，剩少（欠）的人 = 債務人。
// 再依債權人各自佔全部債權的比例，把每個債務人的欠款按比例分攤過去。
// ============================================================

function computeExpenseNets(e){

  const paid = {};
  const share = {};

  (e.payers || []).forEach(p=>{
    const amount = Number(p.amount) || 0;
    if(amount <= 0) return;
    paid[p.member_id] = (paid[p.member_id] || 0) + amount;
  });

  (e.shares || []).forEach(s=>{
    const amount = Number(s.amount) || 0;
    if(amount <= 0) return;
    share[s.member_id] = (share[s.member_id] || 0) + amount;
  });

  const ids = new Set([...Object.keys(paid), ...Object.keys(share)]);
  const creditors = [];
  const debtors = [];

  ids.forEach(id=>{
    const net = (paid[id] || 0) - (share[id] || 0);
    if(net > 0.01) creditors.push({ id, amt: net });
    else if(net < -0.01) debtors.push({ id, amt: -net });
  });

  const totalCredit = creditors.reduce((sum, c) => sum + c.amt, 0);

  return { creditors, debtors, totalCredit };
}

// 同一筆支出內，債務人盡量只還給少數幾個債權人 —
// 依「金額由大到小」配對（欠最多的人優先還給收最多的人），
// 而不是每個債權人都分一點小額。
// 債務關係表（buildDebtMatrix）跟債務明細（showPairDetail）
// 都只呼叫這個函式，兩邊數字保證一致。
function computeExpenseDebts(e){
  const { creditors, debtors } = computeExpenseNets(e);

  const cs = creditors.map(c => ({ ...c }))
    .sort((a,b) => b.amt - a.amt || (a.id > b.id ? 1 : -1));
  const ds = debtors.map(d => ({ ...d }))
    .sort((a,b) => b.amt - a.amt || (a.id > b.id ? 1 : -1));

  const result = {};
  let i = 0, j = 0;
  while(i < cs.length && j < ds.length){
    const creditor = cs[i];
    const debtor = ds[j];
    const amount = Math.min(creditor.amt, debtor.amt);
    if(amount > 0.01){
      if(!result[creditor.id]) result[creditor.id] = {};
      result[creditor.id][debtor.id] = (result[creditor.id][debtor.id] || 0) + amount;
      creditor.amt -= amount;
      debtor.amt -= amount;
    }
    if(creditor.amt <= 0.01) i++;
    if(debtor.amt <= 0.01) j++;
  }
  return result;
}

function expensePairDebt(e, debtorId, creditorId){
  const debts = computeExpenseDebts(e);
  return (debts[creditorId] && debts[creditorId][debtorId]) || 0;
}

function buildDebtMatrix(expenses, repayments){

  const owed = {};

  function addDebt(
    creditorId,
    debtorId,
    amount
  ){

    if(!creditorId) return;
    if(!debtorId) return;

    // 不允許自己欠自己
    if(creditorId === debtorId) return;

    if(!Number.isFinite(amount)) return;
    if(amount <= 0.01) return;

    if(!owed[creditorId]){
      owed[creditorId] = {};
    }

    owed[creditorId][debtorId] =
      (owed[creditorId][debtorId] || 0) + amount;
  }


  // ==========================================================
  // 每一筆支出獨立處理
  // ==========================================================
  //
  // 跟 showPairDetail() 共用 computeExpenseDebts()：債務人盡量
  // 只還給少數幾個債權人，兩邊數字保證一致。
  // ==========================================================

  expenses.forEach(e=>{

    const debts = computeExpenseDebts(e);

    Object.keys(debts).forEach(creditorId=>{
      Object.keys(debts[creditorId]).forEach(debtorId=>{
        addDebt(creditorId, debtorId, debts[creditorId][debtorId]);
      });
    });

  });


  // ==========================================================
  // 還款
  // ==========================================================
  //
  // 例如：
  //
  // 原本：
  //
  // C → A 300
  //
  // C 還 A 100
  //
  // 表格只變成：
  //
  // C → A 200
  //
  // 不會把這 100 拿去抵銷 B → C。
  //
  // 找零／多還的處理：
  //
  // 如果 C 還 A 的這筆金額，比 C 當下欠 A 的還多（例如沒有零錢
  // 多還了一點），多還的部分不會憑空消失，而是反過來變成
  // 「A 欠 C」那一筆（用同一個 addDebt，疊加在原本可能已經存在
  // 的 A 欠 C 金額上面，不會拿去互相抵銷）。
  // ==========================================================

  repayments.forEach(r=>{

    const payerId =
      r.from_member;

    const receiverId =
      r.to_member;

    let remaining =
      Number(r.amount) || 0;


    if(!payerId) return;
    if(!receiverId) return;
    if(payerId === receiverId) return;
    if(remaining <= 0.01) return;


    const receiverDebts =
      owed[receiverId] || (owed[receiverId] = {});

    const current =
      receiverDebts[payerId] || 0;


    const paid =
      Math.min(
        current,
        remaining
      );


    if(paid > 0){

      receiverDebts[payerId] =
        current - paid;

      if(
        receiverDebts[payerId] <= 0.01
      ){

        delete receiverDebts[payerId];
      }

      remaining -= paid;
    }


    // 沒有零錢多還的部分，反過來記一筆「receiver 欠 payer」
    if(remaining > 0.01){
      addDebt(payerId, receiverId, remaining);
    }

  });


  return owed;
}


// ============================================================
// 債務關係表
// ============================================================

// 表頭/表身的姓名格子最多顯示 5 個字，超過就留前 4 個字加一個 * 代表
// 還有被截掉的部分，格子才不會被長名字撐得忽大忽小。
function truncateNameChars(name, max){
  if(!name) return name;
  return name.length > max ? name.slice(0, max - 1) + "*" : name;
}

function renderDebtMatrix(
  expenses,
  repayments
){

  const table =
    document.getElementById(
      "debtMatrix"
    );

  if(!table){
    console.warn(
      "找不到 #debtMatrix，無法顯示債務表"
    );
    return;
  }


  // ----------------------------------------------------------
  // 取得債務資料
  // ----------------------------------------------------------

  const owed =
    buildDebtMatrix(
      expenses,
      repayments
    );


  const ids =
    memberRows.map(
      m => m.id
    );


  // ----------------------------------------------------------
  // 表頭
  // ----------------------------------------------------------

  let thead =
    "<thead>" +
      "<tr>" +
        '<th class="matrix-corner" colspan="2" rowspan="2"></th>' +
        '<th class="matrix-side-label matrix-top-label" colspan="' +
          ids.length +
        '">' +
          "債務人" +
        "</th>" +
        '<th rowspan="2">應收款</th>' +
      "</tr>" +
      "<tr>";

  ids.forEach(id=>{
    const fullName = memberById[id] || "?";
    thead +=
      '<th class="matrix-col-name" title="' +
      escapeHtml(fullName) +
      '">' +
      escapeHtml(
        truncateNameChars(fullName, 5)
      ) +
      "</th>";
  });

  thead +=
    "</tr>" +
    "</thead>";

  // ----------------------------------------------------------
  // 表身
  // ----------------------------------------------------------

  let tbody =
    "<tbody>";

  ids.forEach(
    (creditorId, rowIndex)=>{
      tbody += "<tr>";

      // 左側「債權人」
      if(rowIndex === 0){
        tbody +=
          '<th class="matrix-side-label matrix-left-label" rowspan="' +
          ids.length +
          '">' +
          "債權人" +
          "</th>";
      }

      // 債權人姓名
      const creditorFullName = memberById[creditorId] || "?";
      tbody +=
        '<th class="matrix-row-name" title="' +
        escapeHtml(creditorFullName) +
        '">' +
        escapeHtml(
          truncateNameChars(creditorFullName, 5)
        ) +
        "</th>";


      let rowTotal = 0;


      // ------------------------------------------------------
      // 每個債務人
      // ------------------------------------------------------

      ids.forEach(
        debtorId=>{

          // 自己對自己
          if(
            debtorId === creditorId
          ){

            tbody +=
              '<td class="matrix-cell matrix-self">' +
              "-" +
              "</td>";

            return;
          }


          const amount =
            (
              owed[creditorId] &&
              owed[creditorId][debtorId]
            ) || 0;

          const debtorFullName = memberById[debtorId] || "?";

          if(amount > 0.05){

            rowTotal += amount;

            tbody +=
              '<td class="matrix-cell has-debt"' +
                ' data-creditor="' +
                creditorId +
                '"' +
                ' data-debtor="' +
                debtorId +
                '"' +
                ' title="' +
                escapeHtml(debtorFullName) +
                ' 欠 ' +
                escapeHtml(creditorFullName) +
                ' ' +
                SYM +
                formatAmt(amount) +
                '"' +
              ">" +
                formatAmt(amount) +
                conversionHint(amount) +
              "</td>";

          }
          else{

            tbody +=
              '<td class="matrix-cell"></td>';

          }

        }
      );


      // ------------------------------------------------------
      // 每一列最後的「應收款」
      // ------------------------------------------------------

      tbody +=
        '<td class="matrix-total">' +

          (
            rowTotal > 0.05
              ? formatAmt(rowTotal) +
                conversionHint(rowTotal)
              : "0"
          ) +

        "</td>";


      tbody +=
        "</tr>";

    }
  );


  tbody +=
    "</tbody>";


  // ----------------------------------------------------------
  // 最下面的「應付款」
  // ----------------------------------------------------------

  let tfoot =
    "<tfoot>" +

      "<tr>" +

        '<th class="matrix-foot-label" colspan="2">應付款</th>';


  ids.forEach(
    debtorId=>{

      let colTotal = 0;


      ids.forEach(
        creditorId=>{

          if(
            creditorId === debtorId
          ){
            return;
          }


          colTotal +=
            (
              owed[creditorId] &&
              owed[creditorId][debtorId]
            ) || 0;

        }
      );


      tfoot +=
        '<td class="matrix-total">' +

          (
            colTotal > 0.05
              ? formatAmt(colTotal) +
                conversionHint(colTotal)
              : "0"
          ) +

        "</td>";

    }
  );


  tfoot +=
    '<td class="matrix-total"></td>' +

    "</tr>" +

    "</tfoot>";


  // ----------------------------------------------------------
  // 寫入 table
  // ----------------------------------------------------------

  table.innerHTML =
    thead +
    tbody +
    tfoot;


  // ----------------------------------------------------------
  // 滑動表格時固定「債權人」欄（左側前兩欄）
  // ----------------------------------------------------------

  const col1Cell = table.querySelector("tbody .matrix-side-label");
  if(col1Cell){
    const syncCol1Width = () => {
      table.style.setProperty("--matrix-col1-width", col1Cell.getBoundingClientRect().width + "px");
    };
    syncCol1Width();
    // 中文字型是非同步載入的，如果量測時字型還沒載完，寬度會跟字型換好之後的
    // 實際寬度對不上，導致固定欄跟旁邊的欄位中間出現一道縫，字型載完後要重量一次。
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(syncCol1Width);
    }
  }


  // ----------------------------------------------------------
  // 十字高亮 (Crosshair Hover)
  // ----------------------------------------------------------
  const colHeaders = Array.from(table.querySelectorAll("thead tr:nth-child(2) th.matrix-col-name"));
  table.querySelectorAll("tbody tr").forEach(row => {
    const cells = Array.from(row.querySelectorAll("td.matrix-cell"));
    cells.forEach((cell, idx) => {
      cell.addEventListener("mouseenter", () => {
        row.classList.add("matrix-row-hover");
        if(colHeaders[idx]) colHeaders[idx].classList.add("matrix-col-hover");
      });
      cell.addEventListener("mouseleave", () => {
        row.classList.remove("matrix-row-hover");
        if(colHeaders[idx]) colHeaders[idx].classList.remove("matrix-col-hover");
      });
    });
  });

  // ----------------------------------------------------------
  // 點擊債務格 → 顯示相關紀錄
  // ----------------------------------------------------------

  table
    .querySelectorAll(
      ".has-debt"
    )
    .forEach(cell=>{

      cell.addEventListener(
        "click",
        ()=>{

          showPairDetail(
            cell.dataset.debtor,
            cell.dataset.creditor,
            expenses,
            repayments
          );

        }
      );

    });

}

// ==========================================================
// 一鍵複製 LINE 結算文字
// ==========================================================
const copySettlementBtn = document.getElementById("copySettlementBtn");
if(copySettlementBtn){
  copySettlementBtn.addEventListener("click", async ()=>{
    const owed = buildDebtMatrix(cachedExpenses, cachedRepayments);
    const activeDebts = [];
    const ids = memberRows.map(m => m.id);

    ids.forEach(creditorId => {
      ids.forEach(debtorId => {
        if(creditorId === debtorId) return;
        const amt = owed[creditorId] && owed[creditorId][debtorId];
        if(amt && amt > 0.05){
          activeDebts.push({
            debtor: memberById[debtorId] || "某成員",
            creditor: memberById[creditorId] || "某成員",
            amount: amt
          });
        }
      });
    });

    const groupName = (myMember && myMember.groups && myMember.groups.name) || "分帳群組";
    const nowStr = new Date().toLocaleString("zh-TW", { hour12: false });
    let text = "";

    if(activeDebts.length === 0){
      text = `🎉【Splitbill 帳務結算】\n👥 群組：${groupName}\n💰 幣別：${CURRENCY_LABEL} (${CURRENCY})\n📅 結算時間：${nowStr}\n\n✨ 目前所有款項皆已結清，沒有任何未結債務！`;
    } else {
      const debtLines = activeDebts.map(d => `• ${d.debtor} 應付 ${d.creditor}：${SYM}${formatAmt(d.amount)}`).join("\n");
      text = `🧾【Splitbill 帳務結算】\n👥 群組：${groupName}\n💰 幣別：${CURRENCY_LABEL} (${CURRENCY})\n📅 結算時間：${nowStr}\n------------------------\n📌 應結清款項明細：\n${debtLines}\n------------------------\n✨ 總計 ${activeDebts.length} 筆未結清款項，請確認後完成轉帳！`;
    }

    try {
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }

      const originalHtml = copySettlementBtn.innerHTML;
      copySettlementBtn.innerHTML = "<span>✓ 已複製結算文字</span>";
      setTimeout(()=>{ copySettlementBtn.innerHTML = originalHtml; }, 2500);

      await sbAlert(`已成功將結算清單複製到剪貼簿！\n\n可直接貼到 LINE 或 WhatsApp 群組與大家核對。`, "📋 結算清單複製成功");
    } catch(err){
      await sbAlert("複製失敗，請手動複製：" + err.message, "🔔 Splitbill 提醒");
    }
  });
}

// ============================================================
// ============================================================
// 顯示單筆支出的「項目債務明細」
// - 1 個付款人 + 多個應付人：使用「債務清單」（不用債務關係表）
// - 多個付款人 + 多個應付人：使用「債務關係表」（不用債務清單）
// - 計算機算式記錄在最上面的「應付人」（不用「應付分攤人」）
// ============================================================
// AI 收據拆單那邊有一份一模一樣的 copyToClipboard()，但那份是定義在
// 另一個函式裡面、只有那個閉包看得到，這裡（showExpenseDebtDetail 是
// 頂層函式）呼叫不到，所以另外放一份在頂層讓這裡也能用。
async function copyToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch(e){}
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch(e){
    ta.remove();
    return false;
  }
}
function showExpenseDebtDetail(e){
  const modal = document.getElementById("expenseDebtModal");
  const titleName = document.getElementById("expDebtModalName");
  const iconEl = document.getElementById("expDebtModalIcon");
  const body = document.getElementById("expDebtModalBody");
  if(!modal || !body) return;

  const { title, note } = splitExpenseTitleAndNote(e.description || "", e.note || "");
  const cleanTitle = title || "支出明細";
  const cleanBodyText = note || "";

  const icon = getCategoryIcon(title || e.description || "");
  if(iconEl) iconEl.textContent = icon;
  if(titleName) titleName.textContent = cleanTitle;

  const debts = computeExpenseDebts(e);

  // 判斷是否為多位付款人
  const activePayers = (e.payers || []).filter(p => Number(p.amount) > 0.005);
  const isMultiPayer = activePayers.length > 1;

  // 收集所有相關成員（僅付款人、分攤人、以及產生債權債務者，不相干的人不出現在表格中）
  const involvedSet = new Set();
  (e.payers || []).forEach(p => { if(Number(p.amount) > 0.005) involvedSet.add(p.member_id); });
  (e.shares || []).forEach(s => { if(Number(s.amount) > 0.005) involvedSet.add(s.member_id); });
  Object.keys(debts).forEach(cId => {
    involvedSet.add(cId);
    Object.keys(debts[cId] || {}).forEach(dId => {
      if((debts[cId][dId] || 0) > 0.005) involvedSet.add(dId);
    });
  });

  // 依成員原始順序排列相關成員
  let relevantMembers = (memberRows || []).filter(m => involvedSet.has(m.id));
  if(relevantMembers.length === 0){
    involvedSet.forEach(id => {
      relevantMembers.push({ id, name: memberById[id] || "?" });
    });
  }

  // 建立付款金額字典
  const paidMap = {};
  (e.payers || []).forEach(p => {
    paidMap[p.member_id] = (paidMap[p.member_id] || 0) + (Number(p.amount) || 0);
  });

  // 付款人列表（若有計算機算式則預設收合，金額左側提供 ▾ 展開按鈕，展開後於下一行靠右完整呈現）
  const payerDetails = (e.payers || []).map(p => {
    const name = escapeHtml(memberById[p.member_id] || "?");
    const amt = `${SYM}${formatAmt(p.amount)}`;
    const toggleBtn = p.calc
      ? `<button type="button" class="exp-debt-calc-toggle" onclick="this.closest('.exp-debt-row-item-wrap').classList.toggle('is-expanded')" title="展開/收合計算機算式"><span class="exp-calc-toggle-icon">▾</span></button>`
      : "";
    const expandRow = p.calc
      ? `<div class="exp-debt-calc-expand-row"><div class="exp-debt-calc-badge-expanded" title="計算機算式：${escapeHtml(p.calc)}">${escapeHtml(p.calc)}</div></div>`
      : "";

    return `<div class="exp-debt-row-item-wrap">
      <div class="exp-debt-row-item">
        <span class="exp-debt-row-name">${renderAvatarHTML({ id: p.member_id, name: memberById[p.member_id] }, "avatar-xs")} ${name}</span>
        <div class="exp-debt-row-right">
          ${toggleBtn}
          <b>${amt}</b>
        </div>
      </div>
      ${expandRow}
    </div>`;
  }).join("");

  // 個人分攤額列表（忠實呈現每個人該筆項目的原始分攤金額，若有算式則預設收合，金額左側提供 ▾ 展開按鈕，展開後於下一行靠右完整呈現）
  const shareDetails = (e.shares || []).map(s => {
    const name = escapeHtml(memberById[s.member_id] || "?");
    const amt = `${SYM}${formatAmt(s.amount)}`;
    const toggleBtn = s.calc
      ? `<button type="button" class="exp-debt-calc-toggle" onclick="this.closest('.exp-debt-row-item-wrap').classList.toggle('is-expanded')" title="展開/收合計算機算式"><span class="exp-calc-toggle-icon">▾</span></button>`
      : "";
    const expandRow = s.calc
      ? `<div class="exp-debt-calc-expand-row"><div class="exp-debt-calc-badge-expanded" title="計算機算式：${escapeHtml(s.calc)}">${escapeHtml(s.calc)}</div></div>`
      : "";

    return `<div class="exp-debt-row-item-wrap">
      <div class="exp-debt-row-item">
        <span class="exp-debt-row-name">${renderAvatarHTML({ id: s.member_id, name: memberById[s.member_id] }, "avatar-xs")} ${name}</span>
        <div class="exp-debt-row-right">
          ${toggleBtn}
          <b>${amt}</b>
        </div>
      </div>
      ${expandRow}
    </div>`;
  }).join("");

  // 構建債務流向列表（單付款人使用）
  const flowItems = [];
  Object.keys(debts).forEach(cId => {
    Object.keys(debts[cId] || {}).forEach(dId => {
      const amt = debts[cId][dId] || 0;
      if(amt > 0.005){
        flowItems.push({ creditorId: cId, debtorId: dId, amount: amt });
      }
    });
  });

  let flowsHtml = "";
  if(flowItems.length > 0){
    flowsHtml = flowItems.map(f => `
      <div class="exp-debt-flow-card">
        <div style="display:inline-flex;align-items:center;gap:6px;">
          ${renderAvatarHTML({ id: f.debtorId, name: memberById[f.debtorId] }, "avatar-xs")}
          <b>${escapeHtml(memberById[f.debtorId] || "?")}</b>
          <span style="color:var(--ink-soft);font-size:11.5px;">欠</span>
          ${renderAvatarHTML({ id: f.creditorId, name: memberById[f.creditorId] }, "avatar-xs")}
          <b>${escapeHtml(memberById[f.creditorId] || "?")}</b>
        </div>
        <div class="exp-debt-flow-amount">${SYM}${formatAmt(f.amount)}</div>
      </div>
    `).join("");
  } else {
    flowsHtml = `<div style="text-align:center;padding:12px;color:var(--ink-soft);font-size:12px;">此筆為個人支出，未產生雙方債務關係。</div>`;
  }

  // 找出有實質債權的成員（列：應收款 > 0）與有實質債務的成員（欄：應付款 > 0）
  // 消除空白列與空白欄
  const creditorIds = [];
  const debtorIds = [];

  (memberRows || []).forEach(m => {
    const hasReceivable = Object.values(debts[m.id] || {}).some(amt => amt > 0.005);
    if(hasReceivable) creditorIds.push(m.id);

    const hasPayable = Object.keys(debts).some(cId => (debts[cId][m.id] || 0) > 0.005);
    if(hasPayable) debtorIds.push(m.id);
  });

  // 補齊未在 memberRows 中的其他成員
  Object.keys(debts).forEach(cId => {
    if(!creditorIds.includes(cId) && Object.values(debts[cId] || {}).some(amt => amt > 0.005)){
      creditorIds.push(cId);
    }
    Object.keys(debts[cId] || {}).forEach(dId => {
      if(!debtorIds.includes(dId) && (debts[cId][dId] || 0) > 0.005){
        debtorIds.push(dId);
      }
    });
  });

  // 構建與總表一致的精簡債務關係表（無任何空白行與空白欄）
  const theadHtml = `
    <thead>
      <tr>
        <th class="matrix-corner" colspan="2" rowspan="2"></th>
        <th class="matrix-side-label matrix-top-label" colspan="${debtorIds.length}">債務人</th>
        <th rowspan="2">應收款</th>
      </tr>
      <tr>
        ${debtorIds.map(dId => `<th class="matrix-col-name" title="${escapeHtml(memberById[dId] || "?")}">${escapeHtml(truncateNameChars(memberById[dId] || "?", 5))}</th>`).join("")}
      </tr>
    </thead>
  `;

  let grandTotal = 0;
  const tbodyHtml = `
    <tbody>
      ${creditorIds.map((cId, rIdx) => {
        let rowTotal = 0;
        const cells = debtorIds.map(dId => {
          if(cId === dId){
            return `<td class="matrix-cell matrix-self">-</td>`;
          }
          const amt = (debts[cId] && debts[cId][dId]) || 0;
          if(amt > 0.005){
            rowTotal += amt;
            grandTotal += amt;
            return `<td class="matrix-cell has-debt" title="${escapeHtml(memberById[dId] || "?")} 欠 ${escapeHtml(memberById[cId] || "?")} ${SYM}${formatAmt(amt)}">${formatAmt(amt)}${conversionHint(amt)}</td>`;
          }
          return `<td class="matrix-cell"></td>`;
        }).join("");

        return `
          <tr>
            ${rIdx === 0 ? `<th class="matrix-side-label matrix-left-label" rowspan="${creditorIds.length}">債權人</th>` : ""}
            <th class="matrix-row-name" title="${escapeHtml(memberById[cId] || "?")}">${escapeHtml(truncateNameChars(memberById[cId] || "?", 5))}</th>
            ${cells}
            <td class="matrix-total">${rowTotal > 0.005 ? formatAmt(rowTotal) + conversionHint(rowTotal) : "0"}</td>
          </tr>
        `;
      }).join("")}
    </tbody>
  `;

  const tfootHtml = `
    <tfoot>
      <tr>
        <th class="matrix-foot-label" colspan="2">應付款</th>
        ${debtorIds.map(dId => {
          let colTotal = 0;
          creditorIds.forEach(cId => {
            if(cId !== dId){
              colTotal += ((debts[cId] && debts[cId][dId]) || 0);
            }
          });
          return `<td class="matrix-total">${colTotal > 0.005 ? formatAmt(colTotal) + conversionHint(colTotal) : "0"}</td>`;
        }).join("")}
        <td class="matrix-total">${grandTotal > 0.005 ? formatAmt(grandTotal) + conversionHint(grandTotal) : "0"}</td>
      </tr>
    </tfoot>
  `;

  let dynamicDebtSection = "";
  if(isMultiPayer && creditorIds.length > 0 && debtorIds.length > 0){
    // 多個付款人：顯示「債務關係表」（不用債務清單）
    dynamicDebtSection = `
      <div class="exp-debt-matrix-section">
        <div class="exp-debt-matrix-title">📊 本項目債務關係表</div>
        <div class="exp-debt-table-wrap">
          <table class="debt-matrix">
            ${theadHtml}
            ${tbodyHtml}
            ${tfootHtml}
          </table>
        </div>
      </div>
    `;
  } else {
    // 1 個付款人：顯示「債務清單」（不用債務關係表）
    dynamicDebtSection = `
      <div class="exp-debt-matrix-section">
        <div class="exp-debt-matrix-title">⚡ 債務清單</div>
        <div class="exp-debt-flows">
          ${flowsHtml}
        </div>
      </div>
    `;
  }

  // 備註沒有內容的話，整張「備註與分攤明細」卡片（含複製精簡版/完整版按鈕）
  // 就不出現——沒有備註可看時，只留一個空標題反而顯得突兀。
  let breakdownCardHtml = cleanBodyText ? `
    <div class="exp-debt-breakdown-card">
      <div class="exp-debt-breakdown-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span>📝 備註與分攤明細</span>
        <div class="ai-copy-btn-group">
          <button type="button" class="ai-btn-copy-compact" id="expDebtCopyCompactBtn" title="複製精簡版總額與每人應付金額">⚡ 複製精簡版</button>
          <button type="button" class="ai-btn-copy-full" id="expDebtCopyFullBtn" title="複製完整品項明細與算式">📋 複製完整版</button>
        </div>
      </div>
      <div class="exp-debt-breakdown-content">${escapeHtml(cleanBodyText)}</div>
    </div>
  ` : '';

  body.innerHTML = `
    <div class="exp-debt-info-card">
      <div class="exp-debt-info-top">
        <span class="exp-debt-info-date">📅 ${escapeHtml(e.expense_date || "")}${formatTime(e.created_at, e.expense_date) ? " " + formatTime(e.created_at, e.expense_date) : ""}（${escapeHtml(memberById[e.created_by] || "?")}）</span>
        <span class="exp-debt-info-total">${SYM}${formatAmt(e.amount)}</span>
      </div>
      <div class="exp-debt-info-list">
        <div style="font-size:11.5px;color:var(--ink-soft);font-weight:700;margin-top:2px;">💰 付款人</div>
        ${payerDetails}
        <div style="font-size:11.5px;color:var(--ink-soft);font-weight:700;margin-top:8px;">👥 個人分攤額</div>
        ${shareDetails}
      </div>
    </div>

    ${breakdownCardHtml}

    ${dynamicDebtSection}
  `;

  // 綁定明細複製按鈕事件
  const expDebtCopyCompactBtn = body.querySelector("#expDebtCopyCompactBtn");
  const expDebtCopyFullBtn = body.querySelector("#expDebtCopyFullBtn");

  if(expDebtCopyCompactBtn){
    expDebtCopyCompactBtn.addEventListener("click", async (ev)=>{
      ev.stopPropagation();
      const aiData = extractAiReceiptData(e, memberRows || MEMBERS || []);
      const store = (aiData && aiData.storeName) || cleanTitle || "支出項目";
      const curCode = e.currency || (aiData && aiData.currencyCode) || CURRENCY;
      const curObj = (CURRENCIES || []).find(c => c.code === curCode);
      const curSym = (curObj && curObj.symbol) || CURRENCY_SYMBOL || "$";
      const totalAmt = Number(e.amount) || 0;

      const lines = [];
      lines.push(`🏪 店家/項目：${store}`);
      if(aiData && aiData.taxType === "inclusive"){
        lines.push(`💰 總額：${curSym}${formatAmt(totalAmt)} (已內含稅)`);
      } else if(aiData && (aiData.serviceCharge || aiData.tax)){
        lines.push(`💰 總額：${curSym}${formatAmt(totalAmt)} (含服務費/稅 ${curSym}${formatAmt((aiData.serviceCharge || 0) + (aiData.tax || 0))})`);
      } else {
        lines.push(`💰 總額：${curSym}${formatAmt(totalAmt)}`);
      }
      lines.push(`\n👥 各成員應付金額：`);
      if(e.shares && e.shares.length > 0){
        e.shares.forEach(s => {
          const name = memberById[s.member_id] || "?";
          lines.push(`  ・${name}：${curSym}${formatAmt(s.amount)}`);
        });
      } else {
        lines.push(`  (全員平分)`);
      }

      await copyToClipboard(lines.join("\n"));
      expDebtCopyCompactBtn.textContent = "✓ 已複製精簡版";
      setTimeout(()=>{ expDebtCopyCompactBtn.textContent = "⚡ 複製精簡版"; }, 1500);
    });
  }

  if(expDebtCopyFullBtn){
    expDebtCopyFullBtn.addEventListener("click", async (ev)=>{
      ev.stopPropagation();
      const aiData = extractAiReceiptData(e, memberRows || MEMBERS || []);
      const store = (aiData && aiData.storeName) || cleanTitle || "支出項目";
      const curCode = e.currency || (aiData && aiData.currencyCode) || CURRENCY;
      const curObj = (CURRENCIES || []).find(c => c.code === curCode);
      const curSym = (curObj && curObj.symbol) || CURRENCY_SYMBOL || "$";
      const totalAmt = Number(e.amount) || 0;

      let fullText = "";
      if(cleanBodyText && (cleanBodyText.includes("📋 品項明細") || cleanBodyText.includes("🏪 店家："))){
        fullText = cleanBodyText;
      } else {
        const fullLines = [];
        fullLines.push(`🏪 店家/項目：${store}`);
        fullLines.push(`💰 總額：${curSym}${formatAmt(totalAmt)}`);
        fullLines.push(`📅 日期：${e.expense_date || ""}`);
        const payerNames = (e.payers || []).map(p => `${memberById[p.member_id] || "?"} (${curSym}${formatAmt(p.amount)})`).join("、");
        if(payerNames) fullLines.push(`💰 付款人：${payerNames}`);
        fullLines.push(`\n👥 分攤明細：`);
        (e.shares || []).forEach(s => {
          const name = memberById[s.member_id] || "?";
          const calc = s.calc ? ` (${s.calc})` : "";
          fullLines.push(`  ・${name}：${curSym}${formatAmt(s.amount)}${calc}`);
        });
        if(cleanBodyText) fullLines.push(`\n📝 備註：\n${cleanBodyText}`);
        fullText = fullLines.join("\n");
      }

      await copyToClipboard(fullText);
      expDebtCopyFullBtn.textContent = "✓ 已複製完整版";
      setTimeout(()=>{ expDebtCopyFullBtn.textContent = "📋 複製完整版"; }, 1500);
    });
  }

  const expDebtModalEditBtn = document.getElementById("expDebtModalEditBtn");
  if(expDebtModalEditBtn){
    const canEdit = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;
    expDebtModalEditBtn.style.display = canEdit ? "inline-flex" : "none";
    expDebtModalEditBtn.onclick = () => {
      modal.classList.remove("show");
      startEditExpense(e);
    };
  }

  modal.classList.add("show");
}

const expDebtModal = document.getElementById("expenseDebtModal");
const expDebtModalCloseBtn = document.getElementById("expDebtModalCloseBtn");
if(expDebtModalCloseBtn && expDebtModal){
  expDebtModalCloseBtn.addEventListener("click", ()=> expDebtModal.classList.remove("show"));
}
if(expDebtModal){
  expDebtModal.addEventListener("click", (e)=>{
    if(e.target === expDebtModal) expDebtModal.classList.remove("show");
  });
}

// ============================================================
// 顯示「債務組成」
// ============================================================
function showPairDetail(
  debtorId,
  creditorId,
  expenses,
  repayments
){

  // ==========================================================
  // 建立 / 取得詳細紀錄容器
  // ==========================================================

  let el = document.getElementById("matrixDetail");

  if(!el){

    el = document.createElement("div");

    el.id = "matrixDetail";

    const table =
      document.getElementById("debtMatrix");

    if(table && table.parentElement){
      table.parentElement.appendChild(el);
    }else{
      document.body.appendChild(el);
    }
  }


  // ==========================================================
  // ==========================================================
  // ==========================================================
  // 計算「debtorId 欠 creditorId」的組成支出與還款紀錄（雙向時間軸追蹤）
  // 規則：
  // 1. 欠款部分：收集 debtorId 欠 creditorId 的支出分攤
  // 2. 還款部分：收集 debtorId 還給 creditorId 的還款紀錄
  // 3. 找零溢付：收集 creditorId 償還 debtorId 時超出先前欠款之溢付部分
  // 4. 時間切點：沿時間軸追蹤累積欠款，只要被還款沖銷至 0（結清），切點自動往後移
  // ==========================================================

  // 1. 收集雙方之間所有可能影響欠款關係的支出與還款事件
  const allPairEvents = [];

  expenses.forEach(e => {
    const d1 = expensePairDebt(e, debtorId, creditorId); // debtorId 欠 creditorId
    const d2 = expensePairDebt(e, creditorId, debtorId); // creditorId 欠 debtorId
    if(d1 > 0.005){
      allPairEvents.push({
        type: "expense_debt",
        date: e.expense_date || "",
        createdAt: e.created_at || "",
        expense: e,
        d1,
        id: e.id
      });
    }
    if(d2 > 0.005){
      allPairEvents.push({
        type: "expense_credit",
        date: e.expense_date || "",
        createdAt: e.created_at || "",
        expense: e,
        d2,
        id: e.id
      });
    }
  });

  repayments.forEach(r => {
    const from = r.from_member;
    const to = r.to_member;
    const amount = Number(r.amount) || 0;
    if(amount > 0.005){
      if(from === debtorId && to === creditorId){
        allPairEvents.push({
          type: "repayment_debt",
          date: r.payment_date || "",
          createdAt: r.created_at || "",
          repayment: r,
          amount,
          id: r.id
        });
      } else if(from === creditorId && to === debtorId){
        allPairEvents.push({
          type: "repayment_credit",
          date: r.payment_date || "",
          createdAt: r.created_at || "",
          repayment: r,
          amount,
          id: r.id
        });
      }
    }
  });

  // 2. 按時間正序排列（舊到新；同一天同時刻時，支出先於還款發生）
  allPairEvents.sort((a, b) => {
    if(a.date !== b.date) return a.date.localeCompare(b.date);
    if(a.createdAt && b.createdAt && a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    const aIsExp = a.type.startsWith("expense") ? 0 : 1;
    const bIsExp = b.type.startsWith("expense") ? 0 : 1;
    return aIsExp - bIsExp;
  });

  // 3. 雙向追蹤時間軸，精確捕獲直接支出、還款、與還款溢付找零
  let debtorOwesCreditor = 0;
  let creditorOwesDebtor = 0;
  const pairEventsForDebtor = [];

  for(let i = 0; i < allPairEvents.length; i++){
    const ev = allPairEvents[i];
    if(ev.type === "expense_debt"){
      debtorOwesCreditor += ev.d1;
      pairEventsForDebtor.push({
        type: "expense",
        date: ev.date,
        createdAt: ev.createdAt,
        expense: ev.expense,
        d1: ev.d1,
        id: ev.id
      });
    } else if(ev.type === "repayment_debt"){
      const paid = Math.min(debtorOwesCreditor, ev.amount);
      debtorOwesCreditor -= paid;
      pairEventsForDebtor.push({
        type: "repayment",
        date: ev.date,
        createdAt: ev.createdAt,
        repayment: ev.repayment,
        amount: ev.amount,
        id: ev.id
      });
      if(ev.amount > paid){
        creditorOwesDebtor += (ev.amount - paid);
      }
    } else if(ev.type === "expense_credit"){
      creditorOwesDebtor += ev.d2;
    } else if(ev.type === "repayment_credit"){
      const paid = Math.min(creditorOwesDebtor, ev.amount);
      creditorOwesDebtor -= paid;
      const overpaid = ev.amount - paid;
      if(overpaid > 0.005){
        debtorOwesCreditor += overpaid;
        pairEventsForDebtor.push({
          type: "overpayment",
          date: ev.date,
          createdAt: ev.createdAt,
          repayment: ev.repayment,
          d1: overpaid,
          amount: overpaid,
          id: ev.id
        });
      }
    }
  }

  // 4. 找出 debtorId 欠 creditorId 的最近一次結清點
  let runDebt = 0;
  let lastZeroIndex = 0;

  for(let i = 0; i < pairEventsForDebtor.length; i++){
    const ev = pairEventsForDebtor[i];
    if(ev.type === "expense" || ev.type === "overpayment"){
      runDebt += ev.d1;
    } else if(ev.type === "repayment"){
      runDebt -= ev.amount;
    }
    if(runDebt <= 0.005){
      runDebt = 0;
      lastZeroIndex = i + 1;
    }
  }

  const activeEvents = pairEventsForDebtor.slice(lastZeroIndex);
  const settledHistory = pairEventsForDebtor.slice(0, lastZeroIndex);

  const detailExpenses = activeEvents
    .filter(ev => ev.type === "expense" || ev.type === "overpayment")
    .sort((a, b) => {
      if(b.date !== a.date) return b.date.localeCompare(a.date);
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  const detailRepayments = activeEvents
    .filter(ev => ev.type === "repayment")
    .map(ev => ev.repayment)
    .sort((a, b) => {
      if(b.payment_date !== a.payment_date) return b.payment_date.localeCompare(a.payment_date);
      return (b.created_at || "").localeCompare(a.created_at || "");
    });

  const settledExpenses = settledHistory
    .filter(ev => ev.type === "expense" || ev.type === "overpayment")
    .sort((a, b) => {
      if(b.date !== a.date) return b.date.localeCompare(a.date);
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  const settledRepayments = settledHistory
    .filter(ev => ev.type === "repayment")
    .map(ev => ev.repayment)
    .sort((a, b) => {
      if(b.payment_date !== a.payment_date) return b.payment_date.localeCompare(a.payment_date);
      return (b.created_at || "").localeCompare(a.created_at || "");
    });

  const totalSettledCount = settledExpenses.length + settledRepayments.length;

  // ==========================================================
  // 金額統計
  // ==========================================================
  const owed = buildDebtMatrix(expenses, repayments);
  const remainingDebt = (owed[creditorId] && owed[creditorId][debtorId]) || 0;
  const reverseDebt = (owed[debtorId] && owed[debtorId][creditorId]) || 0;
  const offsetAmt = Math.min(remainingDebt, reverseDebt);

  // ==========================================================
  // 建立詳細紀錄
  // ==========================================================
  let html = `
    <div class="debt-detail-panel">

      <!-- 頂部標題 -->
      <div class="debt-detail-header">
        <div class="debt-detail-title-wrap">
          <div class="debt-detail-eyebrow">
            債務明細
          </div>
          <div class="debt-detail-title">
            <span class="debt-person debtor" style="display:inline-flex;align-items:center;gap:6px;">
              ${renderAvatarHTML({ id: debtorId, name: memberById[debtorId] }, "avatar-sm")}
              ${escapeHtml(memberById[debtorId] || "?")}
            </span>
            <span class="debt-arrow">
              欠
            </span>
            <span class="debt-person creditor" style="display:inline-flex;align-items:center;gap:6px;">
              ${renderAvatarHTML({ id: creditorId, name: memberById[creditorId] }, "avatar-sm")}
              ${escapeHtml(memberById[creditorId] || "?")}
            </span>
          </div>
        </div>
        <button type="button" id="matrixDetailClose" class="debt-detail-close" aria-label="關閉">×</button>
      </div>

      <!-- 債務組成 -->
      <div class="debt-detail-section">
        <div class="debt-section-title">
          <span class="debt-section-icon">📋</span>
          <span>債務組成</span>
          <span class="debt-section-count">${detailExpenses.length} 筆</span>
        </div>
        <div class="debt-expense-list">
  `;

  // ==========================================================
  // 支出紀錄與溢付找零
  // ==========================================================
  if(detailExpenses.length){
    detailExpenses.forEach(item => {
      if(item.type === "overpayment"){
        const r = item.repayment;
        const canEditRepay = r.offset_group
          ? isRepaymentParty(r, myMember.id)
          : (isRepaymentParty(r, myMember.id) || r.created_by === myMember.id);
        html += `
          <div class="debt-expense-card overpayment-card">
            <div class="debt-expense-top">
              <div class="debt-expense-info">
                <div class="debt-expense-name">
                  💸 還款溢付找零 <span class="badge-overpay">找零款</span>
                </div>
                <div class="debt-expense-date">
                  ${escapeHtml(item.date || "")}${formatTime(item.createdAt, item.date) ? " " + formatTime(item.createdAt, item.date) : ""}（來自 ${escapeHtml(memberById[creditorId] || "?")} 轉帳 ${SYM}${formatAmt(r.amount)} 之溢付款項）
                </div>
              </div>
              ${canEditRepay ? `
                <div class="debt-expense-actions">
                  ${!r.offset_group ? `<button type="button" class="exp-edit debt-repay-edit" data-id="${r.id}" title="編輯" aria-label="編輯">✎</button>` : ""}
                  <button type="button" class="exp-del ${r.offset_group ? "debt-repay-del-group" : "debt-repay-del"}" data-id="${r.id}" data-group="${r.offset_group || ""}" title="刪除" aria-label="刪除">✕</button>
                </div>
              ` : ""}
            </div>
            <div class="debt-expense-divider"></div>
            <div class="debt-expense-detail">
              <div class="debt-info-row">
                <span class="debt-info-label">來源</span>
                <span class="debt-info-value">${escapeHtml(memberById[creditorId] || "?")} 先前償還欠款時多付之溢收款</span>
              </div>
              <div class="debt-formed-row">
                <div class="debt-formed-route">
                  <b>${escapeHtml(memberById[debtorId] || "?")}</b> <span>欠</span> <b>${escapeHtml(memberById[creditorId] || "?")}</b>
                </div>
                <div class="debt-formed-amount">
                  ${SYM}${formatAmt(item.amount)}
                </div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      const e = item.expense;
      const canEditExpense = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;
      const isD1 = item.d1 > 0.005;
      const formedAmount = isD1 ? item.d1 : item.d2;

      // 計算機算式故意不塞進這張卡片——算式字串常常很長（例如多筆金額相加除份數），
      // 這裡空間窄，硬塞只會把卡片撐破。完整算式改成點卡片彈出「跟紀錄分頁一模一樣」
      // 的 showExpenseDebtDetail() 彈出視窗看，那邊本來就有摺疊/展開算式的機制。
      const payerText = (e.payers || []).map(p =>
        `<span class="debt-payer-item">${escapeHtml(memberById[p.member_id] || "?")} ${SYM}${formatAmt(p.amount)}</span>`
      ).join("、");

      const shareItems = (e.shares || []).map(s => {
        const isTargetDebtor = s.member_id === debtorId;
        const name = escapeHtml(memberById[s.member_id] || "?");
        if(isTargetDebtor){
          return `<div class="debt-share-item"><b class="debt-highlight-debtor">${name} ${SYM}${formatAmt(s.amount)}</b></div>`;
        }
        return `<div class="debt-share-item"><span>${name} ${SYM}${formatAmt(s.amount)}</span></div>`;
      }).join("");

      const firstLine = getFirstLineDesc(e.description || "未命名支出");
      const isAiSplit = Boolean(e.description && (e.description.includes("<!--AI_RECEIPT_DATA:") || e.description.includes("(AI自動拆單)") || e.description.includes("📋 品項明細")));

      html += `
        <div class="debt-expense-card" data-id="${e.id}">
          <div class="debt-expense-top">
            <div class="debt-expense-info">
              <div class="debt-expense-name">
                ${escapeHtml(firstLine)}${isAiSplit ? '<span class="ai-split-badge" style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;background:color-mix(in srgb, var(--btn-primary) 14%, var(--paper));color:var(--btn-primary);margin-left:5px;">🤖 AI拆單</span>' : ""}${isXcurStr(e.description) ? '<span class="xcur-badge">💱 跨幣轉入</span>' : ""}
              </div>
              <div class="debt-expense-date">
                ${escapeHtml(e.expense_date || "")}${formatTime(e.created_at, e.expense_date) ? " " + formatTime(e.created_at, e.expense_date) : ""}（${escapeHtml(memberById[e.created_by] || "?")}）
              </div>
            </div>
            ${canEditExpense ? `
              <div class="debt-expense-actions">
                ${isXcurStr(e.description) ? `
                  <button type="button" class="exp-del debt-exp-del exp-xcur-restore" data-id="${e.id}" title="還原這筆跨幣別轉移" aria-label="還原">↺</button>
                ` : `
                  <button type="button" class="exp-edit debt-exp-edit" data-id="${e.id}" title="編輯" aria-label="編輯">✎</button>
                  <button type="button" class="exp-del debt-exp-del" data-id="${e.id}" title="刪除" aria-label="刪除">✕</button>
                `}
              </div>
            ` : ""}
          </div>
          <div class="debt-expense-divider"></div>
          <div class="debt-expense-detail">
            <div class="debt-info-row">
              <span class="debt-info-label">付款人</span>
              <div class="debt-info-value">${payerText || "—"}</div>
            </div>
            <div class="debt-info-row">
              <span class="debt-info-label">分攤</span>
              <div class="debt-info-value debt-share-list">${shareItems || "—"}</div>
            </div>
            <div class="debt-formed-row">
              <div class="debt-formed-route">
                ${isD1 ? `<b>${escapeHtml(memberById[debtorId] || "?")}</b> <span>欠</span> <b>${escapeHtml(memberById[creditorId] || "?")}</b>` : `<b>${escapeHtml(memberById[creditorId] || "?")}</b> <span>欠</span> <b>${escapeHtml(memberById[debtorId] || "?")} (抵銷)</b>`}
              </div>
              <div class="debt-formed-amount"${!isD1 ? ' style="color:var(--positive-text);"' : ""}>
                ${!isD1 ? "- " : ""}${SYM}${formatAmt(formedAmount)}
              </div>
            </div>
          </div>
        </div>
      `;
    });
  }else{
    html += `
      <div class="debt-empty-state">
        <div class="debt-empty-icon icon-positive">
          ✓
        </div>
        <div class="debt-empty-title">
          找不到未結清支出
        </div>
        <div class="debt-empty-text">
          ${
            detailRepayments.length
              ? "這兩人之間沒有共同的支出欠款紀錄，相關還款請見下方「已還款紀錄」。"
              : totalSettledCount > 0
              ? "先前的債務已全數結清，可點擊下方「查看更早的已結清歷史」查看紀錄。"
              : "目前沒有找到形成這筆債務的支出紀錄。"
          }
        </div>
      </div>
    `;
  }

  html += `
        </div>
      </div>
  `;

  // ==========================================================
  // 還款紀錄
  // ==========================================================
  if(detailRepayments.length){
    html += `
      <div class="debt-detail-section repayment-section">
        <div class="debt-section-title">
          <span class="debt-section-icon">💸</span>
          <span>已還款紀錄</span>
          <span class="debt-section-count">${detailRepayments.length} 筆</span>
        </div>
        <div class="debt-repayment-list">
    `;

    detailRepayments.forEach(r => {
      const amount = Number(r.amount) || 0;
      const canEditRepay = r.offset_group
        ? isRepaymentParty(r, myMember.id)
        : (isRepaymentParty(r, myMember.id) || r.created_by === myMember.id);

      html += `
        <div class="debt-repayment-card">
          <div class="debt-repayment-icon">
            ${r.offset_group ? "🔄" : "✓"}
          </div>
          <div class="debt-repayment-main">
            <div class="debt-repayment-route">
              ${(r.offset_group && !isXcurStr(r.offset_group)) ? `<span class="champion-tag">抵銷</span>` : ""}
              ${escapeHtml(memberById[r.from_member] || "?")}
              <span>還</span>
              ${escapeHtml(memberById[r.to_member] || "?")}
              ${(isXcurStr(r.note) || isXcurStr(r.offset_group)) ? '<span class="xcur-badge">💱 轉為臺幣</span>' : ""}
            </div>
            <div class="debt-repayment-meta">
              ${escapeHtml(r.payment_date || "")}${formatTime(r.created_at, r.payment_date) ? " " + formatTime(r.created_at, r.payment_date) : ""}（${escapeHtml(memberById[r.created_by] || "?")}）
              ${(r.note && !r.offset_group) ? ` ・ ${escapeHtml(cleanXcurText(r.note))}` : (r.note && isXcurStr(r.offset_group)) ? ` ・ ${escapeHtml(cleanXcurText(r.note))}` : ""}
            </div>
          </div>
          <div class="debt-repayment-right">
            <div class="debt-repayment-amount">
              - ${SYM}${formatAmt(amount)}
            </div>
            ${canEditRepay ? `<div class="exp-actions">
              ${(isXcurStr(r.note) || isXcurStr(r.offset_group)) ? `
                <button class="exp-del ${r.offset_group ? "debt-repay-del-group" : "debt-repay-del"} exp-xcur-restore" data-id="${r.id}" data-group="${r.offset_group || ""}" title="還原這筆跨幣別轉移" aria-label="還原">↺</button>
              ` : `
                ${!r.offset_group ? `<button class="exp-edit debt-repay-edit" data-id="${r.id}" title="編輯">✎</button>` : ""}
                <button class="exp-del ${r.offset_group ? "debt-repay-del-group" : "debt-repay-del"}" data-id="${r.id}" data-group="${r.offset_group || ""}" title="刪除">✕</button>
              `}
            </div>` : ""}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  }

  // ==========================================================
  // 查看更早的已結清歷史（折疊）
  // ==========================================================
  if(totalSettledCount > 0){
    html += `
      <div class="debt-settled-history-section">
        <button type="button" class="btn-toggle-settled-history" id="matrixToggleSettledBtn">
          <span>📜 查看更早的已結清歷史 (${totalSettledCount} 筆)</span>
          <span class="settled-toggle-arrow">▼</span>
        </button>
        <div class="debt-settled-history-list hidden" id="matrixSettledHistoryList">
          ${settledExpenses.map(item => {
            if(item.type === "overpayment"){
              return `
                <div class="debt-expense-card is-settled-card">
                  <div class="debt-expense-top">
                    <div class="debt-expense-info">
                      <div class="debt-expense-name">
                        💸 還款溢付找零 <span class="settled-tag">已結清</span>
                      </div>
                      <div class="debt-expense-date">${escapeHtml(item.date || "")}（來自 ${escapeHtml(memberById[creditorId] || "?")} 溢付）</div>
                    </div>
                  </div>
                  <div class="debt-formed-row">
                    <div class="debt-formed-route"><b>${escapeHtml(memberById[debtorId] || "?")}</b> <span>欠</span> <b>${escapeHtml(memberById[creditorId] || "?")}</b></div>
                    <div class="debt-formed-amount">${SYM}${formatAmt(item.amount)}</div>
                  </div>
                </div>
              `;
            }
            const e = item.expense;
            const isD1 = item.d1 > 0.005;
            const formedAmount = isD1 ? item.d1 : (item.d2 || item.amount);
            const firstLine = getFirstLineDesc(e.description || "未命名支出");
            return `
              <div class="debt-expense-card is-settled-card">
                <div class="debt-expense-top">
                  <div class="debt-expense-info">
                    <div class="debt-expense-name">
                      ${escapeHtml(firstLine)} <span class="settled-tag">已結清</span>
                    </div>
                    <div class="debt-expense-date">${escapeHtml(e.expense_date || "")}（${escapeHtml(memberById[e.created_by] || "?")}）</div>
                  </div>
                </div>
                <div class="debt-formed-row">
                  <div class="debt-formed-route"><b>${escapeHtml(memberById[debtorId] || "?")}</b> <span>欠</span> <b>${escapeHtml(memberById[creditorId] || "?")}</b></div>
                  <div class="debt-formed-amount">${SYM}${formatAmt(formedAmount)}</div>
                </div>
              </div>
            `;
          }).join("")}
          ${settledRepayments.map(r => {
            const amount = Number(r.amount) || 0;
            return `
              <div class="debt-repayment-card is-settled-card">
                <div class="debt-repayment-icon">✓</div>
                <div class="debt-repayment-main">
                  <div class="debt-repayment-route">
                    ${escapeHtml(memberById[r.from_member] || "?")} <span>還</span> ${escapeHtml(memberById[r.to_member] || "?")}
                    <span class="settled-tag">已結清</span>
                  </div>
                  <div class="debt-repayment-meta">${escapeHtml(r.payment_date || "")}${r.note ? ` ・ ${escapeHtml(cleanXcurText(r.note))}` : ""}</div>
                </div>
                <div class="debt-repayment-right">
                  <div class="debt-repayment-amount">- ${SYM}${formatAmt(amount)}</div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  // ==========================================================
  // 底部狀態
  // ==========================================================
  if(offsetAmt > 0.01){
    const canOffset = myMember && (debtorId === myMember.id || creditorId === myMember.id);
    html += `
      <div class="debt-offset-card">
        <div class="debt-offset-text">
          ${escapeHtml(memberById[creditorId] || "?")} 同時也欠 ${escapeHtml(memberById[debtorId] || "?")}
          ${SYM}${formatAmt(reverseDebt)}，可以互相抵銷 ${SYM}${formatAmt(offsetAmt)}，
          不用實際付現金。
        </div>
        ${canOffset ? `<button type="button" id="matrixDetailOffsetBtn" class="btn secondary small">
          一鍵抵銷 ${SYM}${formatAmt(offsetAmt)}
        </button>` : ""}
      </div>
    `;
  }

  if(remainingDebt <= 0.01){
    html += `
      <div class="debt-cleared">
        <span class="debt-cleared-icon">✓</span>
        <span>這筆債務已全部結清</span>
      </div>
    `;
  }

  if(remainingDebt > 0.01){
    html += `
      <div class="debt-repay-action-wrap" style="display:flex;flex-direction:column;gap:8px;">
        <button type="button" class="btn btn-repay-direct" id="matrixDetailRepayBtn" data-debtor="${debtorId}" data-creditor="${creditorId}" data-amt="${remainingDebt}">
          💸 記錄還款（${escapeHtml(memberById[debtorId] || "?")} 還 ${escapeHtml(memberById[creditorId] || "?")} ${SYM}${formatAmt(remainingDebt)}）
        </button>
        ${CURRENCY !== "TWD" ? `
          <button type="button" class="btn secondary btn-twd-settle" id="matrixDetailTwdSettleBtn" data-debtor="${debtorId}" data-creditor="${creditorId}" data-amt="${remainingDebt}">
            💱 以臺幣結算
          </button>
        ` : ""}
      </div>
    `;
  }

  html += `

    </div>

  `;


  // ==========================================================
  // 寫入畫面
  // ==========================================================

  el.innerHTML = html;

  el.style.display = "block";

  // ==========================================================
  // 關閉
  // ==========================================================

  const closeBtn =
    document.getElementById(
      "matrixDetailClose"
    );


  if(closeBtn){
    closeBtn.onclick = ()=>{
      el.style.display = "none";
    };
  }

  // ==========================================================
  // 查看更早的已結清歷史展開/折疊
  // ==========================================================
  const toggleSettledBtn = document.getElementById("matrixToggleSettledBtn");
  const settledListEl = document.getElementById("matrixSettledHistoryList");
  if(toggleSettledBtn && settledListEl){
    toggleSettledBtn.addEventListener("click", ()=>{
      const isHidden = settledListEl.classList.toggle("hidden");
      const arrow = toggleSettledBtn.querySelector(".settled-toggle-arrow");
      if(arrow) arrow.textContent = isHidden ? "▼" : "▲";
    });
  }

  // ==========================================================
  // 前往記錄還款（自動帶入資訊並切換至還款頁）
  // ==========================================================
  const repayDirectBtn = document.getElementById("matrixDetailRepayBtn");
  if(repayDirectBtn){
    repayDirectBtn.onclick = ()=>{
      const fromId = repayDirectBtn.dataset.debtor;
      const toId = repayDirectBtn.dataset.creditor;
      const amt = repayDirectBtn.dataset.amt;

      // 1. 關閉明細
      el.style.display = "none";

      // 2. 切換至還款分頁
      const repayTabBtn = document.querySelector('.app-tab[data-tab="repay"]');
      if(repayTabBtn) repayTabBtn.click();

      // 3. 自動帶入付款人、收款人與金額
      const repayFromEl = document.getElementById("repayFrom");
      const repayToEl = document.getElementById("repayTo");
      const repayAmountEl = document.getElementById("repayAmount");

      if(repayFromEl) repayFromEl.value = fromId;
      if(repayToEl) repayToEl.value = toId;
      if(repayAmountEl) repayAmountEl.value = amt;

      if(repayFromEl) enhanceSelect(repayFromEl);
      if(repayToEl) enhanceSelect(repayToEl);

      // 4. 聚焦金額輸入框
      setTimeout(()=>{
        if(repayAmountEl){
          repayAmountEl.scrollIntoView({ behavior:"smooth", block:"center" });
          repayAmountEl.focus();
        }
      }, 150);
    };
  }

  // ==========================================================
  // 以臺幣結算（換算匯率並前往臺幣帳本記錄）
  // ==========================================================
  const twdSettleBtn = document.getElementById("matrixDetailTwdSettleBtn");
  const twdSettleModal = document.getElementById("twdSettleModal");
  if(twdSettleBtn && twdSettleModal){
    twdSettleBtn.onclick = ()=>{
      const fromId = twdSettleBtn.dataset.debtor;
      const toId = twdSettleBtn.dataset.creditor;
      const amt = Number(twdSettleBtn.dataset.amt) || 0;
      const debtorName = memberById[fromId] || "?";
      const creditorName = memberById[toId] || "?";

      // 關閉明細
      el.style.display = "none";

      const routeEl = document.getElementById("twdSettleRoute");
      const origAmtEl = document.getElementById("twdSettleOrigAmt");
      const ratePrefix = document.getElementById("twdSettleRatePrefix");
      const rateInput = document.getElementById("twdSettleRateInput");
      const resultAmtEl = document.getElementById("twdSettleResultAmt");
      const resultFormulaEl = document.getElementById("twdSettleResultFormula");
      const fetchRateBtn = document.getElementById("twdSettleFetchRateBtn");
      const goTwdBtn = document.getElementById("twdSettleGoTwdBtn");
      const closeTwdBtn = document.getElementById("twdSettleCloseBtn");

      if(routeEl) routeEl.innerHTML = `<b>${escapeHtml(debtorName)}</b> <span>欠</span> <b>${escapeHtml(creditorName)}</b>`;
      if(origAmtEl) origAmtEl.textContent = `${SYM}${formatAmt(amt)} ${CURRENCY_LABEL}`;
      if(ratePrefix) ratePrefix.textContent = `1 ${CURRENCY} = NT$`;

      let currentRate = conversionRate || 1;
      if(rateInput) rateInput.value = currentRate;

      function updateCalculation(){
        const r = parseFloat(rateInput.value) || 0;
        const twdAmt = Math.round(amt * r);
        if(resultAmtEl) resultAmtEl.textContent = `NT$ ${twdAmt.toLocaleString()}`;
        if(resultFormulaEl) resultFormulaEl.textContent = `${SYM}${formatAmt(amt)} × ${r} = NT$${twdAmt.toLocaleString()}`;
      }

      if(rateInput){
        rateInput.oninput = updateCalculation;
      }
      if(fetchRateBtn){
        fetchRateBtn.onclick = ()=>{
          if(conversionRate){
            rateInput.value = conversionRate;
            updateCalculation();
          } else {
            fetchConversionRate();
            setTimeout(()=>{
              rateInput.value = conversionRate || 1;
              updateCalculation();
            }, 600);
          }
        };
      }

      updateCalculation();

      const directClearBtn = document.getElementById("twdSettleDirectClearBtn");
      if(directClearBtn){
        directClearBtn.disabled = false;
        directClearBtn.textContent = `在此一鍵結清 (${CURRENCY_LABEL}欠款歸零)`;
        directClearBtn.onclick = async ()=>{
          const r = parseFloat(rateInput.value) || (conversionRate || 1);
          const twdAmt = Math.round(amt * r);
          const note = `以臺幣 NT$${twdAmt.toLocaleString()} 結清 (匯率 ${r})`;
          const today = new Date().toISOString().slice(0,10);

          directClearBtn.disabled = true;
          directClearBtn.textContent = "結清中…";

          const { error } = await sb.from("repayments").insert({
            from_member: fromId,
            to_member: toId,
            amount: amt,
            note: note,
            payment_date: today,
            created_by: myMember.id,
            currency: CURRENCY
          });

          if(error){
            await sbAlert("結清失敗：" + error.message, "🔔 Splitbill 錯誤");
            directClearBtn.disabled = false;
            directClearBtn.textContent = `在此一鍵結清 (${CURRENCY_LABEL}欠款歸零)`;
            return;
          }

          twdSettleModal.classList.remove("show");
          await refreshExpenses();
        };
      }

      if(goTwdBtn){
        goTwdBtn.textContent = "轉為臺幣欠款";
        goTwdBtn.onclick = async ()=>{
          const r = parseFloat(rateInput.value) || (conversionRate || 1);
          const twdAmt = Math.round(amt * r);
          if(twdAmt <= 0){
            await sbAlert("換算金額必須大於 0", "🔔 Splitbill 提醒");
            return;
          }

          const xcurId = generateUUID();
          const today = new Date().toISOString().slice(0, 10);

          goTwdBtn.disabled = true;
          goTwdBtn.textContent = "轉移中…";

          // 1. 在外幣帳本建立還款 (結清外幣欠款)
          const { data: repData, error: repErr } = await sb.from("repayments").insert({
            from_member: fromId,
            to_member: toId,
            amount: amt,
            note: `轉為臺幣欠款 NT$${twdAmt.toLocaleString()} (匯率 ${r}) [xcur:${xcurId}]`,
            payment_date: today,
            created_by: myMember.id,
            currency: CURRENCY,
            offset_group: xcurId
          }).select();

          if(repErr){
            await sbAlert("轉移失敗：" + repErr.message, "🔔 Splitbill 錯誤");
            goTwdBtn.disabled = false;
            goTwdBtn.textContent = "轉為臺幣欠款";
            return;
          }

          // 2. 在臺幣 (TWD) 帳本建立支出 (使債權人墊付，債務人產生應負擔之欠款)
          const descTitle = `${CURRENCY_LABEL}債務轉入 [xcur:${xcurId}]`;
          const descNote = `${SYM}${formatAmt(amt)} 匯率 ${r}`;

          const { error: expErr } = await sb.from("expenses").insert({
            description: descTitle,
            note: descNote,
            amount: twdAmt,
            expense_date: today,
            created_by: myMember.id,
            currency: "TWD",
            payers: [{ member_id: toId, amount: twdAmt }],
            shares: [{ member_id: fromId, amount: twdAmt }]
          });

          if(expErr){
            if(repData && repData[0]){
              await sb.from("repayments").delete().eq("id", repData[0].id);
            }
            await sbAlert("寫入臺幣帳本失敗：" + expErr.message, "🔔 Splitbill 錯誤");
            goTwdBtn.disabled = false;
            goTwdBtn.textContent = "轉為臺幣欠款";
            return;
          }

          twdSettleModal.classList.remove("show");
          await refreshExpenses();
          if(typeof fireConfetti === "function") fireConfetti();
          await sbAlert(
            `🎉 轉移成功！\n\n1. ${CURRENCY_LABEL}欠款 ${SYM}${formatAmt(amt)} 已結清歸零。\n2. 已在「臺幣帳本」自動新增 NT$${twdAmt.toLocaleString()} 欠款（由 ${memberById[fromId] || "債務人"} 欠 ${memberById[toId] || "債權人"}），並自動與既有臺幣款項合併結算。\n\n※ 若有需要，雙方隨時可於歷史紀錄點擊 ↺ 一鍵還原兩邊帳本。`,
            "🔔 Splitbill 通知"
          );
        };
      }

      if(closeTwdBtn){
        closeTwdBtn.onclick = ()=>{
          twdSettleModal.classList.remove("show");
        };
      }
      twdSettleModal.onclick = (e)=>{
        if(e.target === twdSettleModal) twdSettleModal.classList.remove("show");
      };

      twdSettleModal.classList.add("show");
    };
  }

  // ==========================================================
  // 點卡片本身（不含編輯/刪除按鈕）彈出跟「記錄」分頁完全一樣的
  // showExpenseDebtDetail() 詳細視窗，裡面才看得到完整計算機算式。
  // ==========================================================
  el.querySelectorAll(".debt-expense-card[data-id]").forEach(cardEl=>{
    cardEl.addEventListener("click", (evt)=>{
      if(evt.target.closest(".debt-expense-actions") || evt.target.closest("button")) return;
      const e = expenses.find(x => x.id === cardEl.dataset.id);
      if(e) showExpenseDebtDetail(e);
    });
  });

  // ==========================================================
  // 支出／還款的編輯、刪除（權限跟「記錄」分頁一致，只有本人能動）
  // ==========================================================

  el.querySelectorAll(".debt-exp-edit").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const e = expenses.find(x => x.id === btn.dataset.id);
      if(!e) return;
      el.style.display = "none";
      startEditExpense(e);
    });
  });

  el.querySelectorAll(".debt-exp-del").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const e = expenses.find(x => x.id === btn.dataset.id);
      const rawDesc = (e && e.description) || "";
      if(isXcurStr(rawDesc)){
        el.style.display = "none";
        return handleCrossCurrencyDelete(rawDesc, async ()=>{
          const { error } = await sb.from("expenses").delete().eq("id", btn.dataset.id);
          if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
          await refreshExpenses();
        });
      }
      const ok = await sbConfirm("確定要刪除這筆支出紀錄嗎？");
      if(!ok) return;
      const { error } = await sb.from("expenses").delete().eq("id", btn.dataset.id);
      if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
      el.style.display = "none";
      await refreshExpenses();
    });
  });

  el.querySelectorAll(".debt-repay-edit").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const r = repayments.find(x => x.id === btn.dataset.id);
      if(!r) return;
      el.style.display = "none";
      startEditRepayment(r);
    });
  });

  el.querySelectorAll(".debt-repay-del, .debt-repay-del-group").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const r = repayments.find(x => x.id === btn.dataset.id);
      const rawNote = (r && r.note) || "";
      const rawGroup = (r && r.offset_group) || btn.dataset.group || "";
      if(isXcurStr(rawNote) || isXcurStr(rawGroup)){
        el.style.display = "none";
        return handleCrossCurrencyDelete(rawNote || rawGroup, async ()=>{
          const { error } = await sb.from("repayments").delete().eq("id", btn.dataset.id);
          if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
          await refreshExpenses();
        });
      }
      if(btn.classList.contains("debt-repay-del-group")){
        const ok = await sbConfirm("確定要刪除這組抵銷紀錄嗎？");
        if(!ok) return;
        const { error } = await sb.from("repayments").delete().eq("offset_group", btn.dataset.group);
        if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
        el.style.display = "none";
        await refreshExpenses();
      } else {
        const ok = await sbConfirm("確定要刪除這筆還款紀錄嗎？");
        if(!ok) return;
        const { error } = await sb.from("repayments").delete().eq("id", btn.dataset.id);
        if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
        el.style.display = "none";
        await refreshExpenses();
      }
    });
  });


  // ==========================================================
  // 一鍵抵銷
  // ==========================================================

  const offsetBtn =
    document.getElementById(
      "matrixDetailOffsetBtn"
    );

  if(offsetBtn){

    offsetBtn.onclick = async ()=>{

      const ok = await sbConfirm(`確定要抵銷 ${SYM}${formatAmt(offsetAmt)} 嗎？兩人互相的欠款將互相沖銷。`);
      if(!ok) return;

      offsetBtn.disabled = true;

      const today = new Date().toISOString().slice(0,10);
      const note = "手動抵銷";
      // 用同一個 offset_group 把這兩筆方向相反的還款綁在一起，
      // 歷史紀錄裡才能合併顯示、一起刪除，不會被單獨改掉一半。
      const offsetGroup = crypto.randomUUID();

      const { error } = await sb.from("repayments").insert([
        { from_member: debtorId, to_member: creditorId, amount: offsetAmt, note, payment_date: today, created_by: myMember.id, currency: CURRENCY, offset_group: offsetGroup },
        { from_member: creditorId, to_member: debtorId, amount: offsetAmt, note, payment_date: today, created_by: myMember.id, currency: CURRENCY, offset_group: offsetGroup }
      ]);

      if(error){
        await sbAlert("抵銷失敗：" + error.message, "🔔 Splitbill 錯誤");
        offsetBtn.disabled = false;
        return;
      }

      el.style.display = "none";
      await refreshExpenses();

    };

  }


  // ==========================================================
  // 自動捲到詳細紀錄
  // ==========================================================

  setTimeout(()=>{

    el.scrollIntoView({
      behavior:"smooth",
      block:"nearest"
    });

  },50);

}



  function toCSVField(v){
    let s = String(v ?? "");
    // 開頭是 =/+/-/@ 的話，Excel/Sheets 開啟時可能當公式執行（CSV injection），
    // 前面補一個單引號讓它變回純文字，不影響 Excel 顯示。
    if(/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSVRow(fields){
    return fields.map(toCSVField).join(",");
  }

  const exportBtn = document.getElementById("exportCsvBtn");
  if(exportBtn){
    exportBtn.addEventListener("click", ()=>{
      const expenses = cachedExpenses.filter(passesFilter);
      const repayments = cachedRepayments.filter(passesRepayFilter);
      const lines = [];

      lines.push("支出紀錄");
      lines.push(toCSVRow(["日期","項目說明",`總金額(${SYM})`,"付款","應付","記錄者"]));
      expenses.forEach(e=>{
        const payerText = (e.payers || []).map(p => `${memberById[p.member_id] || "?"}${SYM}${p.amount}${p.calc ? `(${p.calc})` : ""}`).join("；");
        const shareText = (e.shares || []).map(s => `${memberById[s.member_id] || "?"}${SYM}${s.amount}${s.calc ? `(${s.calc})` : ""}`).join("；");
        lines.push(toCSVRow([e.expense_date, e.description, e.amount, payerText, shareText, memberById[e.created_by] || "?"]));
      });

      lines.push("");
      lines.push("還款紀錄");
      lines.push(toCSVRow(["日期","誰還錢","誰收錢",`金額(${SYM})`,"備註"]));
      repayments.forEach(r=>{
        lines.push(toCSVRow([r.payment_date, memberById[r.from_member] || "?", memberById[r.to_member] || "?", r.amount, r.note || ""]));
      });

      const csv = "\uFEFF" + lines.join("\r\n");
      const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `帳務紀錄_${CURRENCY}_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  // ==========================================================================
  // AI 聚餐發票/收據拍照自動拆單 (Gemini 1.5 Flash Vision)
  // ==========================================================================
  let isAiReceiptModalInitialized = false;
  let currentReceiptData = null;
  let receiptClaimItems = [];
  let taxSplitMode = "ratio"; // "ratio" | "equal"

  function compressImageForAI(file, maxDimension = 2048, quality = 0.92){
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDimension || height > maxDimension){
          if(width > height){
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const base64Data = canvas.toDataURL("image/jpeg", quality);
        const pureBase64 = base64Data.split(",")[1];
        resolve({ pureBase64, mimeType: "image/jpeg" });
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  let systemGeminiApiKey = localStorage.getItem("sb_cached_sys_gemini_key") || "";

  async function fetchSystemGeminiApiKey(){
    try {
      if(typeof sb !== "undefined" && sb && sb.from){
        const { data, error } = await sb.from("app_settings").select("value").eq("key", "gemini_api_key").single();
        if(data && data.value && data.value.trim()){
          systemGeminiApiKey = data.value.trim();
          localStorage.setItem("sb_cached_sys_gemini_key", systemGeminiApiKey);
          return systemGeminiApiKey;
        }
      }
    } catch(e){
      console.warn("fetchSystemGeminiApiKey Supabase error, trying REST fallback:", e);
    }

    // Direct REST API Fallback
    try {
      const res = await fetch("https://ofevarwtqzvzrvhbanmf.supabase.co/rest/v1/app_settings?key=eq.gemini_api_key&select=value", {
        headers: {
          "apikey": "sb_publishable_pWT6foelsonrb1sLMXhnCw_oA3ytvaX",
          "Authorization": "Bearer sb_publishable_pWT6foelsonrb1sLMXhnCw_oA3ytvaX"
        }
      });
      if(res.ok){
        const list = await res.json();
        if(Array.isArray(list) && list.length > 0 && list[0].value){
          systemGeminiApiKey = list[0].value.trim();
          localStorage.setItem("sb_cached_sys_gemini_key", systemGeminiApiKey);
          return systemGeminiApiKey;
        }
      }
    } catch(restErr){
      console.warn("REST app_settings fetch error:", restErr);
    }

    return systemGeminiApiKey || "";
  }

  async function getEffectiveGeminiKey(){
    let userKey = (localStorage.getItem("splitbill_gemini_api_key") || "").trim();
    if(userKey) return userKey;
    return await fetchSystemGeminiApiKey();
  }

  async function parseReceiptWithGemini(pureBase64, mimeType = "image/jpeg", apiKey = ""){
    const activeKey = (apiKey || "").trim() || await getEffectiveGeminiKey();
    if(!activeKey){
      throw new Error("請先在「⚙️ 設定」中填寫 Gemini API Key，或由管理員於資料庫設定系統預設金鑰。");
    }

    const prompt = `You are an expert multilingual receipt & invoice OCR parsing AI. Analyze the image carefully.
Extract all receipt details and output in STRICT JSON format (no markdown, no backticks, only valid raw JSON):
{
  "storeName": "Natural Traditional Chinese name with original in parentheses (e.g. '唐吉訶德 (ドン・キホーテ)', '一蘭拉麵 (一蘭)', '星巴克 (Starbucks)')",
  "currencyCode": "Detected 3-letter currency code (e.g. 'JPY', 'TWD', 'KRW', 'USD', 'EUR', 'THB', 'VND', 'SGD', 'HKD', 'CNY', 'GBP', 'AUD')",
  "date": "Receipt date in YYYY-MM-DD format if found, otherwise empty string",
  "time": "Receipt time in HH:MM format if found, otherwise empty string",
  "subtotal": 0,
  "serviceCharge": 0,
  "tax": 0,
  "discount": 0,
  "totalAmount": 0,
  "items": [
    {
      "name": "Natural, recognizable Traditional Chinese Name (Original Foreign Name)",
      "price": 0,
      "qty": 1
    }
  ]
}

CRITICAL TRANSLATION & NAMING GUIDELINES:
1. NEVER do rigid, awkward, word-for-word machine translation. Translations must be natural, appetizing, and match everyday Traditional Chinese (Taiwan/Hong Kong) common usage and vocabulary.
2. FAMOUS BRAND NAMES & POPULAR PRODUCTS: Keep widely recognized English or popular brand names rather than awkward phonetic literal translations:
   - 'キットカット' (KitKat) -> 'KitKat 巧克力' (DO NOT translate to '奇巧' or '奇巧巧克力')
   - 'オトナの甘さ' / 'オトナの甘' -> '大人味微甜 / 黑巧克力' (DO NOT translate to '成人甜味')
   - Example: '★キットカット オトナの甘' -> 'KitKat 大人味巧克力 (★キットカット オトナの甘)'
   - 'ポッキー' (Pocky) -> 'Pocky 巧克力棒' (DO NOT translate to '百奇')
   - 'ブラックサンダー' -> '雷神巧克力'
   - 'じゃがりこ' / 'カルビー' -> 'Calbee 薯條 / 餅乾'
   - 'コカ・コーラ' -> '可口可樂' / 'ZERO 可樂'
   - '午後的紅茶' -> '午後紅茶 (奶茶/檸檬茶/紅茶)'
   - 'レッドブル' -> 'Red Bull 紅牛能量飲'
   - 'モンスター' -> 'Monster 魔爪能量飲'
   - 'ハーゲンダッツ' -> '哈根達斯 冰淇淋'
   - 'スターバックス' -> '星巴克'
3. RESTAURANT & FOOD DISHES: Use clear, everyday dining terms:
   - '唐揚げ' -> '日式唐揚炸雞'
   - '生ビール' / '生中' -> '生啤酒 (中杯)'
   - 'ハイボール' -> 'Highball 角嗨/威士忌蘇打'
   - 'サワー' -> '沙瓦'
   - 'カルビ' -> '牛五花'
   - 'ロース' -> '牛里肌 / 豬里肌'
   - 'ハラミ' -> '牛橫膈膜'
   - 'タン' / '牛タン' -> '牛舌'
   - 'つくね' -> '雞肉丸'
   - '枝豆' -> '毛豆'
   - 'お通し' -> '開胃小菜 / 居酒屋前菜'
   - '替玉' -> '加麵 / 續麵'
   - '餃子' -> '煎餃'
   - 'デザート' -> '甜點'
4. FORMAT: Always use '通俗自然中文名稱 (原文)' for foreign items. If the receipt is already in Chinese, just output the Chinese name directly.
5. NUMBERS: 'price' must be total line price (unit price * qty). 'totalAmount', 'subtotal', 'serviceCharge', 'tax', 'discount' must be clean numbers without symbols.`;

    // 1. 支援 OpenRouter (sk-or-...)
    if(activeKey.startsWith("sk-or-")){
      const orModels = [
        "openrouter/auto",
        "openrouter/free",
        "google/gemma-4-26b-a4b-it:free",
        "google/gemma-4-31b-it:free"
      ];
      let lastOrErr = null;
      for(const om of orModels){
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${activeKey}`,
              "HTTP-Referer": "https://jschang0512.github.io/splitbill",
              "X-Title": "Splitbill Receipt OCR"
            },
            body: JSON.stringify({
              model: om,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${pureBase64}` } }
                ]
              }],
              max_tokens: 8192,
              temperature: 0.1
            })
          });
          if(!res.ok){
            const err = await res.json().catch(()=>({}));
            lastOrErr = new Error((err && err.error && err.error.message) || `OpenRouter HTTP ${res.status}`);
            continue;
          }
          const data = await res.json();
          const rawText = data?.choices?.[0]?.message?.content || "{}";
          const cleaned = rawText.replace(/\`\`\`json/gi, "").replace(/\`\`\`/g, "").trim();
          return JSON.parse(cleaned);
        } catch(e){
          lastOrErr = e;
        }
      }
      throw lastOrErr || new Error("OpenRouter AI 辨識失敗，請稍候重試。");
    }

    // 2. 支援 OpenAI (sk-...)
    if(activeKey.startsWith("sk-")){
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${pureBase64}` } }
            ]
          }],
          max_tokens: 8192,
          temperature: 0.1
        })
      });
      if(!res.ok){
        const err = await res.json().catch(()=>({}));
        throw new Error((err && err.error && err.error.message) || `OpenAI HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content || "{}";
      const cleaned = rawText.replace(/\`\`\`json/gi, "").replace(/\`\`\`/g, "").trim();
      return JSON.parse(cleaned);
    }

    // 3. 原生 Google Gemini API (支援官方最新多模態模型)
    const candidateModels = [
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-flash-latest"
    ];

    let lastErr = null;
    for(const model of candidateModels){
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": activeKey
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: pureBase64
                  }
                }
              ]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              maxOutputTokens: 8192,
              temperature: 0.1
            }
          })
        });

        if(!response.ok){
          const err = await response.json().catch(()=>({}));
          const msg = (err && err.error && err.error.message) || `HTTP ${response.status}`;
          lastErr = new Error(msg);
          continue;
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const cleaned = rawText.replace(/\`\`\`json/gi, "").replace(/\`\`\`/g, "").trim();
        return JSON.parse(cleaned);
      } catch(e){
        lastErr = e;
      }
    }

    throw lastErr || new Error("AI 辨識收據失敗，請確認網路連線或金鑰是否正確。");
  }

    function setupAiReceiptModal(){
    const modal = document.getElementById("aiReceiptModal");
    const openBtn = document.getElementById("aiReceiptBtn");
    const closeBtn = document.getElementById("aiReceiptModalCloseBtn");
    const cameraInp = document.getElementById("aiReceiptCameraInput");
    const galleryInp = document.getElementById("aiReceiptGalleryInput");
    const fileInp = document.getElementById("aiReceiptFileInput");
    const selectFileBtn = document.getElementById("aiReceiptSelectFileBtn");
    const dropzone = document.getElementById("aiReceiptDropzone");

    const uploadScreen = document.getElementById("aiReceiptUploadScreen");
    const cropScreen = document.getElementById("aiReceiptCropScreen");
    const loadingScreen = document.getElementById("aiReceiptLoadingScreen");
    const claimScreen = document.getElementById("aiReceiptClaimScreen");

    // Crop UI elements
    const cropCanvas = document.getElementById("aiCropCanvas");
    const cropRotateBtn = document.getElementById("aiCropRotateBtn");
    const cropResetBtn = document.getElementById("aiCropResetBtn");
    const cropRetakeBtn = document.getElementById("aiCropRetakeBtn");
    const cropConfirmBtn = document.getElementById("aiCropConfirmBtn");

    const storeInputEl = document.getElementById("aiReceiptStoreInput");
    const storeTotalEl = document.getElementById("aiReceiptStoreTotal");
    const totalInputEl = document.getElementById("aiReceiptTotalInput");
    const totalCurSymEl = document.getElementById("aiReceiptTotalCurSym");
    const subtotalInputEl = document.getElementById("aiReceiptSubtotalInput");
    const subtotalCurSymEl = document.getElementById("aiReceiptSubtotalCurSym");
    const serviceInputEl = document.getElementById("aiReceiptServiceInput");
    const serviceCurSymEl = document.getElementById("aiReceiptServiceCurSym");
    const discountRowEl = document.getElementById("aiReceiptDiscountRow");
    const discountInputEl = document.getElementById("aiReceiptDiscountInput");
    const discountCurSymEl = document.getElementById("aiReceiptDiscountCurSym");
    const itemsListEl = document.getElementById("aiReceiptItemsList");
    const membersGridEl = document.getElementById("aiReceiptMembersGrid");
    const addItemBtn = document.getElementById("aiReceiptAddItemBtn");
    const ratioBtn = document.getElementById("aiTaxRatioBtn");
    const equalBtn = document.getElementById("aiTaxEqualBtn");
    const taxTypeExclusiveBtn = document.getElementById("aiTaxTypeExclusive");
    const taxTypeInclusiveBtn = document.getElementById("aiTaxTypeInclusive");
    const aiTaxSplitToggle = document.getElementById("aiTaxSplitToggle");
    const retakeBtn = document.getElementById("aiReceiptRetakeBtn");

    // 直接記帳與幣別相關元素
    const aiReceiptCurrencySelect = document.getElementById("aiReceiptCurrencySelect");
    const aiPayerModeSingle = document.getElementById("aiPayerModeSingle");
    const aiPayerModeMulti = document.getElementById("aiPayerModeMulti");
    const aiPayerSingleRow = document.getElementById("aiPayerSingleRow");
    const aiPayerMultiPanel = document.getElementById("aiPayerMultiPanel");
    const aiPaidBySingle = document.getElementById("aiPaidBySingle");
    const aiPayerMultiList = document.getElementById("aiPayerMultiList");
    const aiPayerSumCheck = document.getElementById("aiPayerSumCheck");
    const aiExpenseDate = document.getElementById("aiExpenseDate");
    const aiExpenseTime = document.getElementById("aiExpenseTime");
    const aiBreakdownContent = document.getElementById("aiBreakdownContent");
    const aiDirectSaveBtn = document.getElementById("aiReceiptDirectSaveBtn");

    let aiPayerMode = "single";
    let taxType = "exclusive"; // "exclusive" (外加) | "inclusive" (內含)
    let selectedReceiptCurrency = CURRENCY;
    let editingAiExpenseId = null;
    let editingAiExpenseOriginal = null;
    let selectedHighlightMemberId = null;

    function getReceiptSymbol(){
      const c = (CURRENCIES || []).find(item => item.code === selectedReceiptCurrency);
      return (c && c.symbol) || CURRENCY_SYMBOL || "$";
    }

    function getReceiptCurrencyLabel(){
      const c = (CURRENCIES || []).find(item => item.code === selectedReceiptCurrency);
      return (c && c.label) || selectedReceiptCurrency;
    }

    // 🌟 供外部編輯呼叫：開啟 AI 拆單編輯看板 (Step 3) 讓使用者自由修改品項與金額！
    window.openAiReceiptEditMode = function(expense, aiData){
      const modalEl = document.getElementById("aiReceiptModal");
      if(!modalEl){
        console.error("aiReceiptModal not found in DOM");
        return false;
      }
      try {
        // 關閉其他可能開啟中的明細或計算彈窗
        document.querySelectorAll(".calc-modal.show, .modal.show").forEach(m => {
          if(m !== modalEl) m.classList.remove("show");
        });

        editingAiExpenseId = expense ? expense.id : null;
        editingAiExpenseOriginal = expense || null;

        currentReceiptData = {
          storeName: (aiData && aiData.storeName) || (expense && expense.description) || "聚餐收據",
          currencyCode: (expense && expense.currency) || (aiData && aiData.currencyCode) || CURRENCY,
          subtotal: Number(aiData && aiData.subtotal) || Number(expense && expense.amount) || 0,
          serviceCharge: Number(aiData && aiData.serviceCharge) || 0,
          tax: Number(aiData && aiData.tax) || 0,
          discount: Number(aiData && aiData.discount) || 0,
          totalAmount: Number(expense && expense.amount) || 0
        };

        taxSplitMode = (aiData && aiData.taxSplitMode) || "ratio";
        taxType = (aiData && aiData.taxType) || ((aiData && (aiData.serviceCharge || aiData.tax)) ? "exclusive" : "inclusive");
        selectedReceiptCurrency = (expense && expense.currency) || (aiData && aiData.currencyCode) || CURRENCY;
        if(aiReceiptCurrencySelect) aiReceiptCurrencySelect.value = selectedReceiptCurrency;

        receiptClaimItems = ((aiData && aiData.items) || []).map((it, idx) => ({
          id: it.id || ("item_" + idx + "_" + Date.now()),
          name: it.name || `品項 ${idx + 1}`,
          price: Number(it.price) || 0,
          qty: Number(it.qty) || 1,
          claimedMemberIds: Array.isArray(it.claimedMemberIds) ? [...it.claimedMemberIds] : []
        }));

        if(!receiptClaimItems.length){
          receiptClaimItems.push({
            id: "item_0_" + Date.now(),
            name: currentReceiptData.storeName || "消費總額",
            price: Number(expense && expense.amount) || 0,
            qty: 1,
            claimedMemberIds: (expense && expense.shares) ? expense.shares.map(s => s.member_id) : []
          });
        }

        if(aiExpenseDate){
          aiExpenseDate.value = (expense && expense.expense_date) || (aiData && aiData.date) || "";
        }
        if(aiExpenseTime){
          aiExpenseTime.value = (aiData && aiData.time) || (expense && formatTime(expense.created_at, expense.expense_date)) || "";
        }

        const payers = (expense && expense.payers) || (aiData && aiData.payers) || [];
        if(payers.length > 1){
          aiPayerMode = "multi";
        } else {
          aiPayerMode = "single";
        }

        if(aiDirectSaveBtn){
          aiDirectSaveBtn.textContent = "💾 確認更新";
        }

        renderClaimBoard();

        if(aiPayerMode === "single" && payers[0] && aiPaidBySingle){
          aiPaidBySingle.value = payers[0].member_id;
        } else if(aiPayerMode === "multi" && aiPayerMultiList){
          payers.forEach(p => {
            const inp = aiPayerMultiList.querySelector(`.ai-multi-payer-input[data-id="${p.member_id}"]`);
            if(inp) inp.value = p.amount;
          });
          updateMultiPayerSumCheck();
        }

        showScreen("claim");
        modalEl.classList.add("show");
        return true;
      } catch(err){
        console.error("openAiReceiptEditMode error:", err);
        showScreen("claim");
        modalEl.classList.add("show");
        return true;
      }
    };

    if(!modal || !openBtn) return;
    if(isAiReceiptModalInitialized) return;
    isAiReceiptModalInitialized = true;

    // 初始化幣別選單 (依序呈現：中文幣別 (符號)，例如 日幣 (¥))
    if(aiReceiptCurrencySelect){
      aiReceiptCurrencySelect.innerHTML = (CURRENCIES || []).map(c => `
        <option value="${c.code}" ${c.code === CURRENCY ? 'selected' : ''}>
          ${c.label} (${c.symbol})
        </option>
      `).join("");

      aiReceiptCurrencySelect.addEventListener("change", ()=>{
        selectedReceiptCurrency = aiReceiptCurrencySelect.value;
        renderClaimBoard();
      });
    }

    if(totalInputEl){
      totalInputEl.addEventListener("input", (e)=>{
        if(!currentReceiptData) currentReceiptData = {};
        currentReceiptData.totalAmount = Number(e.target.value) || 0;
        currentReceiptData._customTotal = true;
        updateCalculationsAndBadges();
      });
    }
    if(subtotalInputEl){
      subtotalInputEl.addEventListener("input", (e)=>{
        if(!currentReceiptData) currentReceiptData = {};
        currentReceiptData.subtotal = Number(e.target.value) || 0;
        currentReceiptData._customSubtotal = true;
        updateCalculationsAndBadges();
      });
    }
    if(serviceInputEl){
      serviceInputEl.addEventListener("input", (e)=>{
        if(!currentReceiptData) currentReceiptData = {};
        currentReceiptData.serviceCharge = Number(e.target.value) || 0;
        currentReceiptData.tax = 0;
        updateCalculationsAndBadges();
      });
    }
    if(discountInputEl){
      discountInputEl.addEventListener("input", (e)=>{
        if(!currentReceiptData) currentReceiptData = {};
        currentReceiptData.discount = Number(e.target.value) || 0;
        updateCalculationsAndBadges();
      });
    }

    // Cropper State
    let currentRawImage = null;
    let cropAngle = 0; // 0, 90, 180, 270
    let cropRect = { x: 0.03, y: 0.03, w: 0.94, h: 0.94 }; // 預設全覆蓋長方形
    let dragMode = null; // "move" | "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r"
    let dragStartX = 0, dragStartY = 0;
    let dragStartRect = null;

    function showScreen(screen){
      const up = document.getElementById("aiReceiptUploadScreen");
      const cr = document.getElementById("aiReceiptCropScreen");
      const ld = document.getElementById("aiReceiptLoadingScreen");
      const cl = document.getElementById("aiReceiptClaimScreen");
      if(up) up.classList.toggle("hidden", screen !== "upload");
      if(cr) cr.classList.toggle("hidden", screen !== "crop");
      if(ld) ld.classList.toggle("hidden", screen !== "loading");
      if(cl) cl.classList.toggle("hidden", screen !== "claim");
    }

    async function openModal(initialScreen = "upload"){
      showScreen(initialScreen);
      modal.classList.add("show");
    }

    function closeModal(){
      modal.classList.remove("show");
      editingAiExpenseId = null;
      editingAiExpenseOriginal = null;
      if(aiDirectSaveBtn) aiDirectSaveBtn.textContent = "💾 確認無誤，立即記帳";
    }

    // 點擊頂部「📷 照片自動拆單」按鈕，開啟選擇面板
    openBtn.addEventListener("click", ()=>{
      openModal("upload");
    });

    if(closeBtn) closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e)=>{ if(e.target === modal) closeModal(); });

    // 拍照/相簿按鈕本身就是 <label for="...">，點下去瀏覽器就會原生觸發
    // 對應的 <input type="file">，不需要再額外用 JS 補一次 .click()——
    // 這裡原本兩層都會觸發（label 原生一次 + JS 判斷 e.target 不是 input
    // 本尊、又補click 一次），在桌機/Android 大多沒事，但在 iOS
    // Safari／WKWebView 上一次手勢連續觸發兩次選檔會讓相機/相簿的
    // pending 對話框互相打架，導致拍完照或選完照片後 change 事件
    // 沒有正常觸發，卡在上傳畫面跳不到裁切/擷取那一步。拿掉多餘的
    // JS 觸發，只留瀏覽器原生的 label 行為即可。
    if(selectFileBtn && fileInp){
      selectFileBtn.addEventListener("click", ()=> {
        try { fileInp.click(); } catch(err){}
      });
    }

    [cameraInp, galleryInp, fileInp].forEach(inp => {
      if(inp){
        inp.addEventListener("change", (e)=>{
          const file = (inp.files && inp.files[0]) || (e.target && e.target.files && e.target.files[0]);
          if(file){
            loadReceiptImageForCrop(file);
          }
        });
      }
    });

    if(dropzone){
      dropzone.addEventListener("dragover", (e)=>{ e.preventDefault(); dropzone.classList.add("dragover"); });
      dropzone.addEventListener("dragleave", ()=>{ dropzone.classList.remove("dragover"); });
      dropzone.addEventListener("drop", (e)=>{
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]){
          loadReceiptImageForCrop(e.dataTransfer.files[0]);
        }
      });
    }

    // 支援剪貼簿貼上 (Ctrl + V)
    window.addEventListener("paste", (e)=>{
      const items = e.clipboardData && e.clipboardData.items;
      if(!items) return;
      for(let i = 0; i < items.length; i++){
        if(items[i].type.indexOf("image") !== -1){
          const file = items[i].getAsFile();
          if(file) loadReceiptImageForCrop(file);
          break;
        }
      }
    });

    // 載入圖片並進入裁切模式（支援相機高畫質照片與手機降採樣防崩潰）
    function loadReceiptImageForCrop(file){
      if(!file) return;

      const finishCropInit = (loadedImg) => {
        currentRawImage = loadedImg;
        cropAngle = 0;
        cropRect = { x: 0.03, y: 0.03, w: 0.94, h: 0.94 };
        openModal("crop");
        setTimeout(()=>{
          renderCropCanvas();
        }, 30);
      };

      try {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const maxDim = 2048;
          if(width > maxDim || height > maxDim){
            const ratio = maxDim / Math.max(width, height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, width, height);

            const scaledImg = new Image();
            scaledImg.onload = () => {
              URL.revokeObjectURL(objectUrl);
              finishCropInit(scaledImg);
            };
            scaledImg.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              finishCropInit(img);
            };
            scaledImg.src = canvas.toDataURL("image/jpeg", 0.92);
            return;
          }

          URL.revokeObjectURL(objectUrl);
          finishCropInit(img);
        };

        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          // 備援 FileReader
          const reader = new FileReader();
          reader.onload = (e) => {
            const fallbackImg = new Image();
            fallbackImg.onload = () => finishCropInit(fallbackImg);
            fallbackImg.onerror = () => {
              sbAlert("無法載入此照片，請換另一張照片重試。", "載入失敗");
            };
            fallbackImg.src = e.target.result;
          };
          reader.onerror = () => {
            sbAlert("無法讀取此相片檔案，請重試。", "讀取失敗");
          };
          reader.readAsDataURL(file);
        };

        img.src = objectUrl;
      } catch(err){
        console.error("loadReceiptImageForCrop error:", err);
        const reader = new FileReader();
        reader.onload = (e) => {
          const fallbackImg = new Image();
          fallbackImg.onload = () => finishCropInit(fallbackImg);
          fallbackImg.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    }

    // 取得旋轉後的圖片寬高
    function getRotatedDimensions(){
      if(!currentRawImage) return { w: 1, h: 1 };
      const is90 = cropAngle === 90 || cropAngle === 270;
      return {
        w: is90 ? currentRawImage.height : currentRawImage.width,
        h: is90 ? currentRawImage.width : currentRawImage.height
      };
    }

    // 繪製裁切畫布
    function renderCropCanvas(){
      if(!cropCanvas || !currentRawImage) return;
      const ctx = cropCanvas.getContext("2d");
      const { w: origW, h: origH } = getRotatedDimensions();

      const maxDisplayW = Math.min(window.innerWidth - 64, 420);
      const maxDisplayH = 340;
      const scale = Math.min(maxDisplayW / origW, maxDisplayH / origH, 1);

      const dispW = Math.round(origW * scale);
      const dispH = Math.round(origH * scale);
      const dpr = Math.max(window.devicePixelRatio || 1, 2);

      cropCanvas.width = Math.round(dispW * dpr);
      cropCanvas.height = Math.round(dispH * dpr);
      cropCanvas.style.width = dispW + "px";
      cropCanvas.style.height = dispH + "px";

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, dispW, dispH);

      // 旋轉並繪製原圖
      ctx.translate(dispW / 2, dispH / 2);
      ctx.rotate((cropAngle * Math.PI) / 180);
      const is90 = cropAngle === 90 || cropAngle === 270;
      const drawW = (is90 ? dispH : dispW);
      const drawH = (is90 ? dispW : dispH);
      ctx.drawImage(currentRawImage, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      ctx.save();
      ctx.scale(dpr, dpr);

      // 繪製半透明暗色遮罩
      const rx = cropRect.x * dispW;
      const ry = cropRect.y * dispH;
      const rw = cropRect.w * dispW;
      const rh = cropRect.h * dispH;

      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, dispW, ry); // 上
      ctx.fillRect(0, ry, rx, rh); // 左
      ctx.fillRect(rx + rw, ry, dispW - (rx + rw), rh); // 右
      ctx.fillRect(0, ry + rh, dispW, dispH - (ry + rh)); // 下

      // 繪製裁切邊框
      ctx.strokeStyle = "#8A79B3";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rx, ry, rw, rh);

      // 繪製九宮格輔助線
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(rx + rw / 3, ry); ctx.lineTo(rx + rw / 3, ry + rh);
      ctx.moveTo(rx + (rw * 2) / 3, ry); ctx.lineTo(rx + (rw * 2) / 3, ry + rh);
      ctx.moveTo(rx, ry + rh / 3); ctx.lineTo(rx + rw, ry + rh / 3);
      ctx.moveTo(rx, ry + (rh * 2) / 3); ctx.lineTo(rx + rw, ry + (rh * 2) / 3);
      ctx.stroke();
      ctx.setLineDash([]);

      // 繪製 4 個頂角 L 型加強邊角
      const cornerBracketLen = Math.min(22, Math.min(rw, rh) / 2);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(rx, ry + cornerBracketLen); ctx.lineTo(rx, ry); ctx.lineTo(rx + cornerBracketLen, ry);
      ctx.moveTo(rx + rw - cornerBracketLen, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cornerBracketLen);
      ctx.moveTo(rx, ry + rh - cornerBracketLen); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cornerBracketLen, ry + rh);
      ctx.moveTo(rx + rw - cornerBracketLen, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cornerBracketLen);
      ctx.stroke();

      // 繪製 4 個頂角圓形觸控把手
      const handleRadius = 7.5;
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#5A4B7C";
      ctx.lineWidth = 2.5;

      const corners = [
        [rx, ry],
        [rx + rw, ry],
        [rx, ry + rh],
        [rx + rw, ry + rh]
      ];

      corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      if(rw > 60 && rh > 60){
        const midPoints = [
          [rx + rw / 2, ry],
          [rx + rw / 2, ry + rh],
          [rx, ry + rh / 2],
          [rx + rw, ry + rh / 2]
        ];
        ctx.fillStyle = "#E8E2F4";
        ctx.strokeStyle = "#5A4B7C";
        ctx.lineWidth = 2;
        midPoints.forEach(([mx, my]) => {
          ctx.beginPath();
          ctx.arc(mx, my, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }

      ctx.restore();
    }

    // 裁切手勢
    if(cropCanvas){
      function getCanvasPointer(e){
        const rect = cropCanvas.getBoundingClientRect();
        return {
          px: e.clientX - rect.left,
          py: e.clientY - rect.top,
          normX: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
          normY: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
          dispW: rect.width,
          dispH: rect.height
        };
      }

      cropCanvas.addEventListener("pointerdown", (e)=>{
        e.preventDefault();
        try { cropCanvas.setPointerCapture(e.pointerId); } catch(err){}
        const p = getCanvasPointer(e);
        dragStartX = p.normX;
        dragStartY = p.normY;
        dragStartRect = { ...cropRect };

        const rx = cropRect.x * p.dispW;
        const ry = cropRect.y * p.dispH;
        const rw = cropRect.w * p.dispW;
        const rh = cropRect.h * p.dispH;
        const hitRadius = 32;

        const dTL = Math.hypot(p.px - rx, p.py - ry);
        const dTR = Math.hypot(p.px - (rx + rw), p.py - ry);
        const dBL = Math.hypot(p.px - rx, p.py - (ry + rh));
        const dBR = Math.hypot(p.px - (rx + rw), p.py - (ry + rh));

        if(dTL <= hitRadius) dragMode = "tl";
        else if(dTR <= hitRadius) dragMode = "tr";
        else if(dBL <= hitRadius) dragMode = "bl";
        else if(dBR <= hitRadius) dragMode = "br";
        else if(Math.abs(p.py - ry) <= 18 && p.px >= rx && p.px <= rx + rw) dragMode = "t";
        else if(Math.abs(p.py - (ry + rh)) <= 18 && p.px >= rx && p.px <= rx + rw) dragMode = "b";
        else if(Math.abs(p.px - rx) <= 18 && p.py >= ry && p.py <= ry + rh) dragMode = "l";
        else if(Math.abs(p.px - (rx + rw)) <= 18 && p.py >= ry && p.py <= ry + rh) dragMode = "r";
        else if(p.px >= rx && p.px <= rx + rw && p.py >= ry && p.py <= ry + rh) dragMode = "move";
        else dragMode = null;
      });

      cropCanvas.addEventListener("pointermove", (e)=>{
        const p = getCanvasPointer(e);
        if(!dragMode || !dragStartRect){
          const rx = cropRect.x * p.dispW;
          const ry = cropRect.y * p.dispH;
          const rw = cropRect.w * p.dispW;
          const rh = cropRect.h * p.dispH;
          const dTL = Math.hypot(p.px - rx, p.py - ry);
          const dTR = Math.hypot(p.px - (rx + rw), p.py - ry);
          const dBL = Math.hypot(p.px - rx, p.py - (ry + rh));
          const dBR = Math.hypot(p.px - (rx + rw), p.py - (ry + rh));

          if(dTL <= 25 || dBR <= 25) cropCanvas.style.cursor = "nwse-resize";
          else if(dTR <= 25 || dBL <= 25) cropCanvas.style.cursor = "nesw-resize";
          else if(Math.abs(p.py - ry) <= 14 || Math.abs(p.py - (ry + rh)) <= 14) cropCanvas.style.cursor = "ns-resize";
          else if(Math.abs(p.px - rx) <= 14 || Math.abs(p.px - (rx + rw)) <= 14) cropCanvas.style.cursor = "ew-resize";
          else if(p.px >= rx && p.px <= rx + rw && p.py >= ry && p.py <= ry + rh) cropCanvas.style.cursor = "move";
          else cropCanvas.style.cursor = "default";
          return;
        }

        e.preventDefault();
        const dx = p.normX - dragStartX;
        const dy = p.normY - dragStartY;

        let { x: sx, y: sy, w: sw, h: sh } = dragStartRect;
        let nx = sx, ny = sy, nw = sw, nh = sh;
        const minW = 0.04, minH = 0.04;

        if(dragMode === "move"){
          nx = Math.max(0, Math.min(1 - sw, sx + dx));
          ny = Math.max(0, Math.min(1 - sh, sy + dy));
        } else if(dragMode === "tl"){
          nx = Math.max(0, Math.min(sx + sw - minW, sx + dx));
          ny = Math.max(0, Math.min(sy + sh - minH, sy + dy));
          nw = (sx + sw) - nx;
          nh = (sy + sh) - ny;
        } else if(dragMode === "tr"){
          ny = Math.max(0, Math.min(sy + sh - minH, sy + dy));
          nw = Math.max(minW, Math.min(1 - sx, sw + dx));
          nh = (sy + sh) - ny;
        } else if(dragMode === "bl"){
          nx = Math.max(0, Math.min(sx + sw - minW, sx + dx));
          nw = (sx + sw) - nx;
          nh = Math.max(minH, Math.min(1 - sy, sh + dy));
        } else if(dragMode === "br"){
          nw = Math.max(minW, Math.min(1 - sx, sw + dx));
          nh = Math.max(minH, Math.min(1 - sy, sh + dy));
        } else if(dragMode === "t"){
          ny = Math.max(0, Math.min(sy + sh - minH, sy + dy));
          nh = (sy + sh) - ny;
        } else if(dragMode === "b"){
          nh = Math.max(minH, Math.min(1 - sy, sh + dy));
        } else if(dragMode === "l"){
          nx = Math.max(0, Math.min(sx + sw - minW, sx + dx));
          nw = (sx + sw) - nx;
        } else if(dragMode === "r"){
          nw = Math.max(minW, Math.min(1 - sx, sw + dx));
        }

        cropRect = { x: nx, y: ny, w: nw, h: nh };
        renderCropCanvas();
      });

      const endPointer = (e)=>{
        if(dragMode){
          try { cropCanvas.releasePointerCapture(e.pointerId); } catch(err){}
          dragMode = null;
          dragStartRect = null;
        }
      };
      cropCanvas.addEventListener("pointerup", endPointer);
      cropCanvas.addEventListener("pointercancel", endPointer);
    }

    if(cropRotateBtn){
      cropRotateBtn.addEventListener("click", ()=>{
        cropAngle = (cropAngle + 90) % 360;
        cropRect = { x: 0.03, y: 0.03, w: 0.94, h: 0.94 };
        renderCropCanvas();
      });
    }

    if(cropResetBtn){
      cropResetBtn.addEventListener("click", ()=>{
        cropRect = { x: 0, y: 0, w: 1, h: 1 };
        renderCropCanvas();
      });
    }

    if(cropRetakeBtn){
      cropRetakeBtn.addEventListener("click", ()=>{
        openModal("upload");
      });
    }

    // 裁切完成並開始辨識
    if(cropConfirmBtn){
      cropConfirmBtn.addEventListener("click", async ()=>{
        if(!currentRawImage) return;
        const key = await getEffectiveGeminiKey();
        showScreen("loading");

        try {
          const { w: rotW, h: rotH } = getRotatedDimensions();
          const targetW = Math.round(rotW * cropRect.w);
          const targetH = Math.round(rotH * cropRect.h);

          const offCanvas = document.createElement("canvas");
          const maxDim = 2048;
          let finalW = targetW, finalH = targetH;
          if(finalW > maxDim || finalH > maxDim){
            if(finalW > finalH){
              finalH = Math.round((finalH * maxDim) / finalW);
              finalW = maxDim;
            } else {
              finalW = Math.round((finalW * maxDim) / finalH);
              finalH = maxDim;
            }
          }

          offCanvas.width = finalW;
          offCanvas.height = finalH;
          const offCtx = offCanvas.getContext("2d");

          const tempRotCanvas = document.createElement("canvas");
          tempRotCanvas.width = rotW;
          tempRotCanvas.height = rotH;
          const tempRotCtx = tempRotCanvas.getContext("2d");
          tempRotCtx.translate(rotW / 2, rotH / 2);
          tempRotCtx.rotate((cropAngle * Math.PI) / 180);
          const is90 = cropAngle === 90 || cropAngle === 270;
          const dw = is90 ? rotH : rotW;
          const dh = is90 ? rotW : rotH;
          tempRotCtx.drawImage(currentRawImage, -dw / 2, -dh / 2, dw, dh);

          const sx = Math.round(rotW * cropRect.x);
          const sy = Math.round(rotH * cropRect.y);
          offCtx.drawImage(tempRotCanvas, sx, sy, targetW, targetH, 0, 0, finalW, finalH);

          const base64Data = offCanvas.toDataURL("image/jpeg", 0.92);
          const pureBase64 = base64Data.split(",")[1];

          const parsed = await parseReceiptWithGemini(pureBase64, "image/jpeg", key);
          currentReceiptData = parsed;

          // 自動偵測幣別並切換下拉選單
          const detectedCurCode = (parsed.currencyCode || "").trim().toUpperCase();
          const matchedCur = (CURRENCIES || []).find(c => c.code === detectedCurCode);
          if(matchedCur){
            selectedReceiptCurrency = matchedCur.code;
          } else {
            selectedReceiptCurrency = CURRENCY;
          }
          if(aiReceiptCurrencySelect) aiReceiptCurrencySelect.value = selectedReceiptCurrency;

          // 智慧偵測內含稅 vs 外加稅費：若品項加總已等於總金額，預設切換為內含稅
          const itemsSum = (parsed.items || []).reduce((acc, it) => acc + (Number(it.price || it.amount || it.total || 0)), 0);
          const parsedTotal = Number(parsed.totalAmount) || 0;
          if(parsedTotal > 0 && Math.abs(itemsSum - parsedTotal) <= 1){
            taxType = "inclusive";
          } else {
            taxType = (parsed.serviceCharge || parsed.tax) ? "exclusive" : "inclusive";
          }

          // 自動讀取發票明細上的日期與時間
          if(aiExpenseDate){
            if(parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)){
              aiExpenseDate.value = parsed.date;
            } else {
              const now = new Date();
              const yyyy = now.getFullYear();
              const mm = String(now.getMonth() + 1).padStart(2, '0');
              const dd = String(now.getDate()).padStart(2, '0');
              aiExpenseDate.value = `${yyyy}-${mm}-${dd}`;
            }
          }
          if(aiExpenseTime){
            if(parsed.time && /^\d{1,2}:\d{2}$/.test(parsed.time)){
              aiExpenseTime.value = parsed.time.padStart(5, '0');
            } else {
              const now = new Date();
              const hh = String(now.getHours()).padStart(2, '0');
              const min = String(now.getMinutes()).padStart(2, '0');
              aiExpenseTime.value = `${hh}:${min}`;
            }
          }
          
          receiptClaimItems = (parsed.items || []).map((it, idx) => {
            const rawName = (it.name || it.item || it.description || it.title || it.dish || "").trim();
            return {
              id: "item_" + idx + "_" + Date.now(),
              name: rawName || `品項 ${idx + 1}`,
              price: Number(it.price || it.amount || it.total || 0),
              qty: Number(it.qty || 1),
              claimedMemberIds: []
            };
          });

          if(!receiptClaimItems.length){
            receiptClaimItems.push({
              id: "item_0_" + Date.now(),
              name: "消費總額",
              price: Number(parsed.totalAmount) || 0,
              qty: 1,
              claimedMemberIds: []
            });
          }

          renderClaimBoard();
          showScreen("claim");
        } catch(err){
          console.error("AI 辨識收據失敗：", err);
          await sbAlert("AI 辨識收據失敗：" + (err.message || "未知錯誤") + "。請確認網路連線或嘗試重新拍攝一張清晰的照片。", "📷 辨識失敗");
          showScreen("crop");
        }
      });
    }

    // 付款模式切換監聽
    if(aiPayerModeSingle && aiPayerModeMulti){
      aiPayerModeSingle.addEventListener("click", ()=>{
        aiPayerMode = "single";
        updatePayerModeUI();
      });
      aiPayerModeMulti.addEventListener("click", ()=>{
        aiPayerMode = "multi";
        updatePayerModeUI();
      });
    }

    function updatePayerModeUI(){
      if(aiPayerModeSingle) aiPayerModeSingle.classList.toggle("active", aiPayerMode === "single");
      if(aiPayerModeMulti) aiPayerModeMulti.classList.toggle("active", aiPayerMode === "multi");
      if(aiPayerSingleRow) aiPayerSingleRow.classList.toggle("hidden", aiPayerMode !== "single");
      if(aiPayerMultiPanel) aiPayerMultiPanel.classList.toggle("hidden", aiPayerMode !== "multi");
      updateMultiPayerSumCheck();
    }

    function updateMultiPayerSumCheck(){
      if(aiPayerMode !== "multi" || !aiPayerSumCheck) return;
      const { subtotal, netExtraFees } = calculateMemberTotals();
      const calculatedTotal = Math.round(subtotal + netExtraFees);
      const finalTotal = currentReceiptData && currentReceiptData.totalAmount ? Number(currentReceiptData.totalAmount) : calculatedTotal;
      const curSym = getReceiptSymbol();

      let sum = 0;
      if(aiPayerMultiList){
        aiPayerMultiList.querySelectorAll(".ai-multi-payer-input").forEach(inp => {
          sum += Number(inp.value) || 0;
        });
      }
      const diff = Math.round((finalTotal - sum) * 100) / 100;
      if(Math.abs(diff) < 0.5){
        aiPayerSumCheck.innerHTML = `<span style="color:var(--positive-text);font-weight:700;">✓ 付款金額完全相符 (${curSym}${formatAmt(sum)})</span>`;
      } else if(diff > 0){
        aiPayerSumCheck.innerHTML = `<span style="color:var(--negative-text);font-weight:600;">⚠️ 付款總和還差 ${curSym}${formatAmt(diff)}（目標 ${curSym}${formatAmt(finalTotal)}）</span>`;
      } else {
        aiPayerSumCheck.innerHTML = `<span style="color:var(--negative-text);font-weight:600;">⚠️ 付款總和超過 ${curSym}${formatAmt(Math.abs(diff))}（目標 ${curSym}${formatAmt(finalTotal)}）</span>`;
      }
    }

    function renderClaimBoard(){
      if(!currentReceiptData) return;

      const activeMembers = (MEMBERS || []).filter(m => showLeftMembers || !m.left_at);
      const curSym = getReceiptSymbol();

      // 1. 可編輯店家名稱
      if(storeInputEl){
        storeInputEl.value = currentReceiptData.storeName || "聚餐收據";
      }

      // 2. 幣別選擇下拉選單同步與幣別符號更新
      if(aiReceiptCurrencySelect){
        aiReceiptCurrencySelect.value = selectedReceiptCurrency;
      }
      if(totalCurSymEl) totalCurSymEl.textContent = curSym;
      if(subtotalCurSymEl) subtotalCurSymEl.textContent = curSym;
      if(serviceCurSymEl) serviceCurSymEl.textContent = curSym;
      if(discountCurSymEl) discountCurSymEl.textContent = "-" + curSym;

      // 3. 日期與時間若尚未設定則預設當前時間
      if(aiExpenseDate && !aiExpenseDate.value){
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        aiExpenseDate.value = `${yyyy}-${mm}-${dd}`;
      }
      if(aiExpenseTime && !aiExpenseTime.value){
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        aiExpenseTime.value = `${hh}:${min}`;
      }

      // 4. 單人付款下拉選單
      if(aiPaidBySingle){
        aiPaidBySingle.innerHTML = activeMembers.map(m => `
          <option value="${m.id}" ${myMember && myMember.id === m.id ? 'selected' : ''}>
            ${escapeHtml(m.name || emailToName(m.email))}
          </option>
        `).join("");
      }

      // 5. 多人付款清單
      if(aiPayerMultiList){
        aiPayerMultiList.innerHTML = activeMembers.map(m => `
          <div class="ai-payer-multi-row">
            <span style="display:flex;align-items:center;gap:5px;font-size:12.5px;">
              ${renderAvatarHTML(m, "avatar-xs")}
              ${escapeHtml(m.name || emailToName(m.email))}
            </span>
            <div class="ai-receipt-price-wrap" style="width:125px;">
              <span class="ai-receipt-cur-prefix">${curSym}</span>
              <input type="number" class="ai-receipt-item-price ai-multi-payer-input" data-id="${m.id}" placeholder="0" min="0" step="any">
            </div>
          </div>
        `).join("");

        aiPayerMultiList.querySelectorAll(".ai-multi-payer-input").forEach(inp => {
          inp.addEventListener("input", updateMultiPayerSumCheck);
        });
      }

      if(ratioBtn) ratioBtn.classList.toggle("active", taxSplitMode === "ratio");
      if(equalBtn) equalBtn.classList.toggle("active", taxSplitMode === "equal");
      if(taxTypeExclusiveBtn) taxTypeExclusiveBtn.classList.toggle("active", taxType === "exclusive");
      if(taxTypeInclusiveBtn) taxTypeInclusiveBtn.classList.toggle("active", taxType === "inclusive");
      if(aiTaxSplitToggle){
        aiTaxSplitToggle.classList.toggle("hidden", taxType === "inclusive");
        aiTaxSplitToggle.style.display = (taxType === "inclusive") ? "none" : "flex";
      }
      const serviceCol = document.getElementById("aiReceiptServiceCol");
      if(serviceCol) serviceCol.style.opacity = (taxType === "inclusive") ? "0.45" : "1";

      // 6. 渲染品項清單（高度一致、平分按鈕置於金額下方、大頭貼不顯示幾分之幾）
      if(itemsListEl){
        itemsListEl.innerHTML = receiptClaimItems.map((item, idx) => {
          const isClaimed = item.claimedMemberIds.length > 0;
          const isAllClaimed = activeMembers.length > 0 && activeMembers.every(m => item.claimedMemberIds.includes(m.id));

          // 成員大頭貼氣泡流 (選中後不顯示幾分之幾)
          const memberBubblesHTML = activeMembers.map(m => {
            const hasClaimed = item.claimedMemberIds.includes(m.id);
            return `
              <div class="ai-avatar-bubble ${hasClaimed ? 'active' : ''}" data-item-id="${item.id}" data-member-id="${m.id}" title="${escapeHtml(m.name || emailToName(m.email))}">
                <div class="ai-bubble-avatar-wrap">
                  ${renderAvatarHTML(m, "avatar-xs ai-bubble-avatar")}
                  ${hasClaimed ? '<span class="ai-bubble-check-badge">✓</span>' : ''}
                </div>
                <span class="ai-bubble-name">${escapeHtml(m.name || emailToName(m.email))}</span>
              </div>
            `;
          }).join("");

          const count = item.claimedMemberIds.length;
          const perPersonPrice = count > 1 ? Math.round(item.price / count) : 0;
          let floatBadgeHTML = "";
          if(count === 0){
            floatBadgeHTML = `<span class="ai-card-float-badge unclaimed">⚠️ 待認領</span>`;
          } else if(count > 1){
            floatBadgeHTML = `<span class="ai-card-float-badge per-person" title="${count} 人分攤，每人約 ${curSym}${formatAmt(perPersonPrice)}">每人 ${curSym}${formatAmt(perPersonPrice)}</span>`;
          }

          return `
            <div class="ai-receipt-item-card ${isClaimed ? 'is-claimed' : 'is-unclaimed'}" data-id="${item.id}">
              ${floatBadgeHTML}
              <!-- 頂部列：序號 + 品名 (flex-1 撐滿) + [金額 + 刪除] (標準單行排版不推擠) -->
              <div class="ai-item-main-row">
                <span class="ai-item-tag-num">${idx + 1}</span>
                <input type="text" class="ai-receipt-item-name" value="${escapeHtml(item.name || '')}" placeholder="品名 中文翻譯(原文)" data-id="${item.id}">
                <div class="ai-item-price-col">
                  <div class="ai-receipt-price-wrap">
                    <span class="ai-receipt-cur-prefix">${curSym}</span>
                    <input type="number" class="ai-receipt-item-price" value="${item.price}" min="0" step="any" placeholder="0" data-id="${item.id}">
                  </div>
                  <button type="button" class="ai-receipt-item-del" data-id="${item.id}" title="刪除此品項" aria-label="刪除">✕</button>
                </div>
              </div>

              <!-- 下方認領區：左邊是大頭貼氣泡流，右邊是所有人平分按鈕 (正位於金額下方) -->
              <div class="ai-receipt-claims-row-wrap">
                <div class="ai-avatar-bubbles-row">
                  ${memberBubblesHTML}
                </div>
                <div class="ai-all-btn-col">
                  <button type="button" class="ai-bubble-all-btn ${isAllClaimed ? 'active' : ''}" data-id="${item.id}">
                    ${isAllClaimed ? '✕ 取消全員' : '⚡ 所有人平分'}
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join("");

        // 綁定品項事件
        itemsListEl.querySelectorAll(".ai-receipt-item-name").forEach(inp => {
          inp.addEventListener("input", (e)=>{
            const it = receiptClaimItems.find(x => x.id === e.target.dataset.id);
            if(it) it.name = e.target.value;
            updateCalculationsAndBadges();
          });
        });

        itemsListEl.querySelectorAll(".ai-receipt-item-price").forEach(inp => {
          inp.addEventListener("input", (e)=>{
            const it = receiptClaimItems.find(x => x.id === e.target.dataset.id);
            if(it) it.price = Number(e.target.value) || 0;
            updateCalculationsAndBadges();
          });
        });

        itemsListEl.querySelectorAll(".ai-receipt-item-del").forEach(btn => {
          btn.addEventListener("click", ()=>{
            receiptClaimItems = receiptClaimItems.filter(x => x.id !== btn.dataset.id);
            renderClaimBoard();
          });
        });

        itemsListEl.querySelectorAll(".ai-avatar-bubble").forEach(bubble => {
          bubble.addEventListener("click", ()=>{
            const itemId = bubble.dataset.itemId;
            const memberId = bubble.dataset.memberId;
            const it = receiptClaimItems.find(x => x.id === itemId);
            if(!it) return;
            const idx = it.claimedMemberIds.indexOf(memberId);
            if(idx !== -1){
              it.claimedMemberIds.splice(idx, 1);
            } else {
              it.claimedMemberIds.push(memberId);
            }
            renderClaimBoard();
          });
        });

        itemsListEl.querySelectorAll(".ai-bubble-all-btn").forEach(btn => {
          btn.addEventListener("click", ()=>{
            const it = receiptClaimItems.find(x => x.id === btn.dataset.id);
            if(!it) return;
            const allIds = activeMembers.map(m => m.id);
            const isAll = allIds.every(id => it.claimedMemberIds.includes(id));
            if(isAll){
              it.claimedMemberIds = [];
            } else {
              it.claimedMemberIds = [...allIds];
            }
            renderClaimBoard();
          });
        });
      }

      updateCalculationsAndBadges();
      updatePayerModeUI();
    }

    function calculateMemberTotals(){
      const subtotal = receiptClaimItems.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
      const service = Number(currentReceiptData && currentReceiptData.serviceCharge) || 0;
      const tax = Number(currentReceiptData && currentReceiptData.tax) || 0;
      const discount = Number(currentReceiptData && currentReceiptData.discount) || 0;
      const netExtraFees = taxType === "inclusive" ? 0 : ((service + tax) - discount);

      const activeMembers = (MEMBERS || []).filter(m => showLeftMembers || !m.left_at);
      const claimedMemberIdSet = new Set();
      receiptClaimItems.forEach(it => it.claimedMemberIds.forEach(id => claimedMemberIdSet.add(id)));

      const memberCalcMap = {};
      activeMembers.forEach(m => {
        memberCalcMap[m.id] = {
          member: m,
          itemSum: 0,
          formulas: [],
          taxShare: 0,
          total: 0
        };
      });

      receiptClaimItems.forEach(it => {
        const count = it.claimedMemberIds.length;
        if(count > 0){
          const sharePrice = (Number(it.price) || 0) / count;
          it.claimedMemberIds.forEach(mId => {
            if(memberCalcMap[mId]){
              memberCalcMap[mId].itemSum += sharePrice;
              memberCalcMap[mId].formulas.push(count > 1 ? `${Math.round(it.price)}/${count}` : `${Math.round(it.price)}`);
            }
          });
        }
      });

      const claimingCount = claimedMemberIdSet.size || activeMembers.length;
      activeMembers.forEach(m => {
        const data = memberCalcMap[m.id];
        if(data.itemSum > 0 || claimedMemberIdSet.has(m.id)){
          if(taxType === "inclusive"){
            data.taxShare = 0;
            data.total = Math.round(data.itemSum);
          } else {
            if(taxSplitMode === "ratio"){
              data.taxShare = subtotal > 0 ? (data.itemSum / subtotal) * netExtraFees : 0;
            } else {
              data.taxShare = claimingCount > 0 ? netExtraFees / claimingCount : 0;
            }
            data.total = Math.round(data.itemSum + data.taxShare);
          }
        }
      });

      return { memberCalcMap, subtotal, netExtraFees };
    }

    function generateBreakdownSummary(memberCalcMap, subtotal, netExtraFees, finalTotal){
      const lines = [];
      const curSym = getReceiptSymbol();
      const store = (storeInputEl && storeInputEl.value.trim()) || (currentReceiptData && currentReceiptData.storeName) || "聚餐收據";
      lines.push(`🏪 店家：${store}`);
      if(taxType === "inclusive"){
        lines.push(`💰 總額：${curSym}${formatAmt(finalTotal)} (已內含稅，品項小計 ${curSym}${formatAmt(subtotal)})`);
      } else {
        lines.push(`💰 總額：${curSym}${formatAmt(finalTotal)} (小計 ${curSym}${formatAmt(subtotal)} + 服務費/稅 ${curSym}${formatAmt(netExtraFees)})`);
      }
      lines.push(`\n📋 品項明細：`);
      receiptClaimItems.forEach((it, idx) => {
        const claimNames = it.claimedMemberIds.map(id => memberById[id] || id).join("、");
        const count = it.claimedMemberIds.length;
        const perPerson = count > 1 ? ` (每人 ${curSym}${formatAmt(Math.round(it.price / count))})` : "";
        const claimText = claimNames ? `➔ ${claimNames}${perPerson}` : `➔ 無人認領`;

        const rawName = (it.name || "品項").trim();
        const parenMatch = rawName.match(/^(.*?)\s*\(([\s\S]*?)\)$/);
        if(parenMatch && parenMatch[1].trim() && parenMatch[2].trim()){
          const zhName = parenMatch[1].trim();
          const origName = parenMatch[2].trim();
          lines.push(`  ${idx + 1}. ${zhName}\n     (${origName}) ${curSym}${formatAmt(it.price)}\n     ${claimText}`);
        } else {
          lines.push(`  ${idx + 1}. ${rawName} ${curSym}${formatAmt(it.price)}\n     ${claimText}`);
        }
      });
      lines.push(`\n👥 各成員應付金額：`);
      const activeMembers = (MEMBERS || []).filter(m => showLeftMembers || !m.left_at);
      activeMembers.forEach(m => {
        const d = memberCalcMap[m.id];
        if(d && d.total > 0){
          const taxPart = (taxType !== "inclusive" && d.taxShare) ? ` (含服務費 ${curSym}${formatAmt(Math.round(d.taxShare))})` : "";
          lines.push(`  ・${m.name}：${curSym}${formatAmt(d.total)}${taxPart}`);
        }
      });
      return lines.join("\n");
    }

    function generateCompactBreakdownSummary(memberCalcMap, subtotal, netExtraFees, finalTotal){
      const lines = [];
      const curSym = getReceiptSymbol();
      const store = (storeInputEl && storeInputEl.value.trim()) || (currentReceiptData && currentReceiptData.storeName) || "聚餐收據";
      lines.push(`🏪 店家：${store}`);
      if(taxType === "inclusive"){
        lines.push(`💰 總額：${curSym}${formatAmt(finalTotal)} (已內含稅)`);
      } else {
        lines.push(`💰 總額：${curSym}${formatAmt(finalTotal)} (小計 ${curSym}${formatAmt(subtotal)} + 服務費/稅 ${curSym}${formatAmt(netExtraFees)})`);
      }
      lines.push(`\n👥 各成員應付金額：`);
      const activeMembers = (MEMBERS || []).filter(m => showLeftMembers || !m.left_at);
      let count = 0;
      activeMembers.forEach(m => {
        const d = memberCalcMap[m.id];
        if(d && d.total > 0){
          lines.push(`  ・${m.name}：${curSym}${formatAmt(d.total)}`);
          count++;
        }
      });
      if(count === 0){
        lines.push(`  (尚未認領品項)`);
      }
      return lines.join("\n");
    }

    async function copyToClipboard(text){
      if(navigator.clipboard && navigator.clipboard.writeText){
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch(e){}
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch(e){
        ta.remove();
        return false;
      }
    }

    function updateMemberHighlightInItems(){
      if(!itemsListEl) return;
      itemsListEl.querySelectorAll(".ai-receipt-item-card").forEach(card => {
        const itemId = card.dataset.id;
        const it = receiptClaimItems.find(x => x.id === itemId);
        if(!selectedHighlightMemberId){
          card.classList.remove("is-highlighted-by-member", "is-dimmed-by-filter");
        } else {
          const hasMember = it && it.claimedMemberIds.includes(selectedHighlightMemberId);
          card.classList.toggle("is-highlighted-by-member", hasMember);
          card.classList.toggle("is-dimmed-by-filter", !hasMember);
        }
      });
    }

    function updateCalculationsAndBadges(){
      const { memberCalcMap, subtotal, netExtraFees } = calculateMemberTotals();
      const discount = Number(currentReceiptData && currentReceiptData.discount) || 0;
      const calculatedTotal = taxType === "inclusive" ? Math.round(subtotal - discount) : Math.round(subtotal + netExtraFees);
      const finalTotal = currentReceiptData && currentReceiptData._customTotal ? Number(currentReceiptData.totalAmount) : (currentReceiptData && currentReceiptData.totalAmount ? Number(currentReceiptData.totalAmount) : calculatedTotal);
      const curSym = getReceiptSymbol();

      // 更新可編輯的小計、服務費、折扣與總計輸入框
      if(subtotalInputEl && document.activeElement !== subtotalInputEl) subtotalInputEl.value = subtotal;
      if(serviceInputEl && document.activeElement !== serviceInputEl) {
        const service = Number(currentReceiptData && currentReceiptData.serviceCharge) || 0;
        const tax = Number(currentReceiptData && currentReceiptData.tax) || 0;
        serviceInputEl.value = service + tax;
      }
      if(discountInputEl && document.activeElement !== discountInputEl) {
        const discountVal = Number(currentReceiptData && currentReceiptData.discount) || 0;
        discountInputEl.value = discountVal;
      }
      if(totalInputEl && document.activeElement !== totalInputEl) totalInputEl.value = finalTotal;

      if(discountRowEl){
        const discountVal = Number(currentReceiptData && currentReceiptData.discount) || 0;
        discountRowEl.classList.toggle("hidden", discountVal <= 0);
      }

      // 更新頂部防漏單進度條
      const totalItemsCount = receiptClaimItems.length;
      const unclaimedCount = receiptClaimItems.filter(it => it.claimedMemberIds.length === 0).length;
      const claimedItemsCount = totalItemsCount - unclaimedCount;
      const claimPercent = totalItemsCount > 0 ? Math.round((claimedItemsCount / totalItemsCount) * 100) : 0;

      const progressStatsEl = document.getElementById("aiClaimProgressStats");
      const progressFillEl = document.getElementById("aiClaimProgressFill");
      const progressStatusEl = document.getElementById("aiClaimProgressStatus");
      
      if(progressStatsEl) progressStatsEl.textContent = `${claimedItemsCount} / ${totalItemsCount} 品項已認領 (${claimPercent}%)`;
      if(progressFillEl) progressFillEl.style.width = `${claimPercent}%`;
      if(progressStatusEl){
        if(totalItemsCount === 0){
          progressStatusEl.textContent = "尚無品項";
          progressStatusEl.className = "ai-claim-progress-status";
        } else if(unclaimedCount === 0){
          progressStatusEl.textContent = "✨ 太棒了！全部品項皆已全部分攤完畢，可進行儲存";
          progressStatusEl.className = "ai-claim-progress-status complete";
        } else {
          progressStatusEl.textContent = `⚠️ 尚有 ${unclaimedCount} 個品項未認領，需全數認領後方可儲存`;
          progressStatusEl.className = "ai-claim-progress-status warning";
        }
      }

      // 模式切換按鈕高亮與分攤選單顯示/隱藏
      if(taxTypeExclusiveBtn) taxTypeExclusiveBtn.classList.toggle("active", taxType === "exclusive");
      if(taxTypeInclusiveBtn) taxTypeInclusiveBtn.classList.toggle("active", taxType === "inclusive");
      if(aiTaxSplitToggle){
        aiTaxSplitToggle.classList.toggle("hidden", taxType === "inclusive");
        aiTaxSplitToggle.style.display = (taxType === "inclusive") ? "none" : "flex";
      }
      const serviceCol = document.getElementById("aiReceiptServiceCol");
      if(serviceCol) serviceCol.style.opacity = (taxType === "inclusive") ? "0.45" : "1";

      // 檢查 小計 (+ 服務費/稅) 是否等於 總計
      const isTotalMatching = Math.abs(calculatedTotal - finalTotal) < 0.5;
      const mismatchWarningEl = document.getElementById("aiTotalMismatchWarning");
      if(mismatchWarningEl){
        if(!isTotalMatching){
          if(taxType === "inclusive"){
            mismatchWarningEl.innerHTML = `⚠️ 目前為「內含稅」模式：小計 (<b>${curSym}${formatAmt(subtotal)}</b>) 與總計 (<b>${curSym}${formatAmt(finalTotal)}</b>) 不相符。若此發票有額外服務費/稅，請切換為「外加稅費」模式。`;
          } else {
            const diff = Math.round((finalTotal - calculatedTotal) * 100) / 100;
            mismatchWarningEl.innerHTML = `⚠️ 目前為「外加稅費」模式：小計 (${curSym}${formatAmt(subtotal)}) ＋ 服務費/稅 (${curSym}${formatAmt(netExtraFees)}) ＝ <b>${curSym}${formatAmt(calculatedTotal)}</b>，與總計 (<b>${curSym}${formatAmt(finalTotal)}</b>) 不相符${diff > 0 ? `（少 ${curSym}${formatAmt(diff)}）` : `（多 ${curSym}${formatAmt(Math.abs(diff))}）`}。若發票已內含稅，可切換為「內含稅」模式。`;
          }
          mismatchWarningEl.classList.remove("hidden");
        } else {
          mismatchWarningEl.textContent = "";
          mismatchWarningEl.classList.add("hidden");
        }
      }

      // 控制儲存按鈕狀態 (未認領完成不能儲存、金額不相符不能儲存)
      if(aiDirectSaveBtn){
        if(unclaimedCount > 0){
          aiDirectSaveBtn.disabled = true;
          aiDirectSaveBtn.classList.add("btn-disabled");
          aiDirectSaveBtn.textContent = `⚠️ 尚有 ${unclaimedCount} 個品項未認領`;
        } else if(!isTotalMatching){
          aiDirectSaveBtn.disabled = true;
          aiDirectSaveBtn.classList.add("btn-disabled");
          aiDirectSaveBtn.textContent = taxType === "inclusive" ? "⚠️ 金額不相符 (品項小計 ≠ 總計)" : "⚠️ 金額不相符 (小計 + 服務費/稅 ≠ 總計)";
        } else {
          aiDirectSaveBtn.disabled = false;
          aiDirectSaveBtn.classList.remove("btn-disabled");
          aiDirectSaveBtn.textContent = editingAiExpenseId ? "💾 確認更新" : "💾 確認無誤，立即記帳";
        }
      }

      if(membersGridEl){
        const activeMembers = (MEMBERS || []).filter(m => showLeftMembers || !m.left_at);
        membersGridEl.innerHTML = activeMembers.map(m => {
          const data = memberCalcMap[m.id] || { total: 0 };
          const isSelected = (selectedHighlightMemberId === m.id);
          return `
            <div class="ai-receipt-member-badge clickable ${isSelected ? 'active' : ''}" data-member-id="${m.id}" title="點擊${isSelected ? '取消高亮' : '高亮'}此成員認領的品項">
              <div class="ai-receipt-member-left">
                ${renderAvatarHTML(m, "avatar-xs")}
                <span class="ai-receipt-member-name">${escapeHtml(m.name || emailToName(m.email))}</span>
              </div>
              <b class="ai-receipt-member-amt">${curSym}${formatAmt(data.total)}</b>
            </div>
          `;
        }).join("");

        membersGridEl.querySelectorAll(".ai-receipt-member-badge").forEach(badge => {
          badge.addEventListener("click", ()=>{
            const mId = badge.dataset.memberId;
            if(selectedHighlightMemberId === mId){
              selectedHighlightMemberId = null;
            } else {
              selectedHighlightMemberId = mId;
            }
            updateMemberHighlightInItems();
            updateCalculationsAndBadges();
          });
        });
      }

      updateMemberHighlightInItems();

      if(aiBreakdownContent){
        aiBreakdownContent.textContent = generateBreakdownSummary(memberCalcMap, subtotal, netExtraFees, finalTotal);
      }

      updateMultiPayerSumCheck();
    }

    // 複製明細按鈕事件綁定
    const copyCompactBtn = document.getElementById("aiCopyCompactBtn");
    const copyFullBtn = document.getElementById("aiCopyFullBtn");

    if(copyCompactBtn){
      copyCompactBtn.addEventListener("click", async ()=>{
        const { memberCalcMap, subtotal, netExtraFees } = calculateMemberTotals();
        const discount = Number(currentReceiptData && currentReceiptData.discount) || 0;
        const calculatedTotal = taxType === "inclusive" ? Math.round(subtotal - discount) : Math.round(subtotal + netExtraFees);
        const finalTotal = currentReceiptData && currentReceiptData._customTotal ? Number(currentReceiptData.totalAmount) : (currentReceiptData && currentReceiptData.totalAmount ? Number(currentReceiptData.totalAmount) : calculatedTotal);
        const summary = generateCompactBreakdownSummary(memberCalcMap, subtotal, netExtraFees, finalTotal);
        await copyToClipboard(summary);
        copyCompactBtn.textContent = "✓ 已複製精簡版";
        setTimeout(()=>{ copyCompactBtn.textContent = "⚡ 複製精簡版"; }, 1500);
      });
    }

    if(copyFullBtn){
      copyFullBtn.addEventListener("click", async ()=>{
        const { memberCalcMap, subtotal, netExtraFees } = calculateMemberTotals();
        const discount = Number(currentReceiptData && currentReceiptData.discount) || 0;
        const calculatedTotal = taxType === "inclusive" ? Math.round(subtotal - discount) : Math.round(subtotal + netExtraFees);
        const finalTotal = currentReceiptData && currentReceiptData._customTotal ? Number(currentReceiptData.totalAmount) : (currentReceiptData && currentReceiptData.totalAmount ? Number(currentReceiptData.totalAmount) : calculatedTotal);
        const summary = generateBreakdownSummary(memberCalcMap, subtotal, netExtraFees, finalTotal);
        await copyToClipboard(summary);
        copyFullBtn.textContent = "✓ 已複製完整版";
        setTimeout(()=>{ copyFullBtn.textContent = "📋 複製完整版"; }, 1500);
      });
    }

    if(addItemBtn){
      addItemBtn.addEventListener("click", ()=>{
        receiptClaimItems.push({
          id: "item_" + Date.now(),
          name: "自訂品項",
          price: 0,
          qty: 1,
          claimedMemberIds: []
        });
        renderClaimBoard();
      });
    }

    if(taxTypeExclusiveBtn){
      taxTypeExclusiveBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        taxType = "exclusive";
        if(currentReceiptData) currentReceiptData._customTotal = false;
        renderClaimBoard();
        updateCalculationsAndBadges();
      });
    }

    if(taxTypeInclusiveBtn){
      taxTypeInclusiveBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        taxType = "inclusive";
        if(currentReceiptData){
          currentReceiptData._customTotal = false;
          currentReceiptData.serviceCharge = 0;
          currentReceiptData.tax = 0;
        }
        if(serviceInputEl) serviceInputEl.value = 0;
        const { subtotal } = calculateMemberTotals();
        const discount = Number(currentReceiptData && currentReceiptData.discount) || 0;
        const newTotal = Math.round(subtotal - discount);
        if(currentReceiptData) currentReceiptData.totalAmount = newTotal;
        if(totalInputEl) totalInputEl.value = newTotal;
        renderClaimBoard();
        updateCalculationsAndBadges();
      });
    }

    if(ratioBtn){
      ratioBtn.addEventListener("click", ()=>{
        taxSplitMode = "ratio";
        renderClaimBoard();
      });
    }

    if(equalBtn){
      equalBtn.addEventListener("click", ()=>{
        taxSplitMode = "equal";
        renderClaimBoard();
      });
    }

    if(retakeBtn){
      retakeBtn.addEventListener("click", ()=>{
        showScreen("upload");
      });
    }

    // 🌟 一鍵直接記帳（無需跳回支出表單）
    if(aiDirectSaveBtn){
      aiDirectSaveBtn.addEventListener("click", async ()=>{
        const rawStore = (storeInputEl && storeInputEl.value.trim()) || (currentReceiptData && currentReceiptData.storeName) || "聚餐收據";
        const storeName = getFirstLineDesc(rawStore).replace(/\(AI自動拆單\)/g, "").trim() || "聚餐收據";
        const { memberCalcMap, subtotal, netExtraFees } = calculateMemberTotals();
        const calculatedTotal = Math.round(subtotal + netExtraFees);
        const finalTotal = currentReceiptData && currentReceiptData.totalAmount ? Number(currentReceiptData.totalAmount) : calculatedTotal;
        const curSym = getReceiptSymbol();
        const curLabel = getReceiptCurrencyLabel();

        const unclaimedItems = receiptClaimItems.filter(it => it.claimedMemberIds.length === 0);
        if(unclaimedItems.length > 0){
          await sbAlert(`還有 ${unclaimedItems.length} 個品項尚未認領，請點擊成員頭像完成所有品項的分攤認領後，再進行儲存記帳！`, "⚠️ 請先完成所有品項認領");
          return;
        }

        if(!finalTotal || finalTotal <= 0){
          await sbAlert("總金額不能為 0！請確認品項金額。", "金額錯誤");
          return;
        }

        if(Math.abs(calculatedTotal - finalTotal) >= 0.5){
          if(taxType === "inclusive"){
            await sbAlert(`目前為「內含稅」模式，品項小計 (${curSym}${formatAmt(subtotal)}) 與總計 (${curSym}${formatAmt(finalTotal)}) 不符！\n\n若此發票有額外服務費或稅額需疊加，請切換至「外加稅費」模式。`, "⚠️ 金額不相符");
          } else {
            await sbAlert(`小計 (${curSym}${formatAmt(subtotal)}) ＋ 服務費/稅 (${curSym}${formatAmt(netExtraFees)}) ＝ ${curSym}${formatAmt(calculatedTotal)}，與總計 (${curSym}${formatAmt(finalTotal)}) 不符！\n\n若此發票已內含稅，請切換至「內含稅」模式。`, "⚠️ 金額不相符");
          }
          return;
        }

        // 1. 付款人校驗
        let payers = [];
        if(aiPayerMode === "single"){
          const payerId = aiPaidBySingle ? aiPaidBySingle.value : (myMember && myMember.id);
          if(!payerId){
            await sbAlert("請選擇付款人！", "付款人未選");
            return;
          }
          payers = [{ member_id: payerId, amount: finalTotal }];
        } else {
          if(aiPayerMultiList){
            aiPayerMultiList.querySelectorAll(".ai-multi-payer-input").forEach(inp => {
              const amt = Number(inp.value) || 0;
              if(amt > 0) payers.push({ member_id: inp.dataset.id, amount: amt });
            });
          }
          if(!payers.length){
            await sbAlert("多人付款模式下至少需有一人輸入付款金額！", "付款人未填");
            return;
          }
          const payerSum = payers.reduce((acc, p) => acc + p.amount, 0);
          if(Math.abs(payerSum - finalTotal) >= 0.5){
            await sbAlert(`付款人總額 (${curSym}${formatAmt(payerSum)}) 與支出總額 (${curSym}${formatAmt(finalTotal)}) 不符，請調整！`, "付款總額不符");
            return;
          }
        }

        // 2. 分攤人與份額校驗
        const activeMembers = (MEMBERS || []).filter(m => showLeftMembers || !m.left_at);
        let shares = activeMembers.filter(m => (memberCalcMap[m.id]?.total || 0) > 0).map(m => {
          const d = memberCalcMap[m.id];
          return {
            member_id: m.id,
            amount: d.total,
            calc: d.formulas.join("+") + (d.taxShare ? `+服務費${Math.round(d.taxShare)}` : "")
          };
        });

        // 若無人點選認領，則全員平分
        if(!shares.length){
          const base = Math.floor(finalTotal / activeMembers.length);
          const rem = finalTotal - (base * activeMembers.length);
          shares = activeMembers.map((m, idx) => ({
            member_id: m.id,
            amount: base + (idx < rem ? 1 : 0),
            calc: "全員平分"
          }));
        }

        // 微調分攤加總確保與 finalTotal 100% 吻合
        const shareSum = shares.reduce((acc, s) => acc + s.amount, 0);
        const diff = finalTotal - shareSum;
        if(diff !== 0 && shares.length > 0){
          shares[0].amount += diff;
        }

        // 3. 組合金額組成明細文字與完整狀態結構
        const expenseDate = (aiExpenseDate && aiExpenseDate.value) || new Date().toISOString().split("T")[0];
        const breakdownSummary = generateBreakdownSummary(memberCalcMap, subtotal, netExtraFees, finalTotal);
        const aiReceiptMeta = {
          storeName,
          currencyCode: selectedReceiptCurrency,
          subtotal,
          serviceCharge: Number(currentReceiptData && currentReceiptData.serviceCharge) || 0,
          tax: Number(currentReceiptData && currentReceiptData.tax) || 0,
          discount: Number(currentReceiptData && currentReceiptData.discount) || 0,
          taxSplitMode,
          taxType,
          date: expenseDate,
          time: (aiExpenseTime && aiExpenseTime.value) || "",
          payerMode: aiPayerMode,
          payers,
          items: receiptClaimItems.map(it => ({
            id: it.id,
            name: it.name,
            price: it.price,
            qty: it.qty || 1,
            claimedMemberIds: [...it.claimedMemberIds]
          }))
        };
        const metaComment = `\n<!--AI_RECEIPT_DATA:${encodeURIComponent(JSON.stringify(aiReceiptMeta))}-->`;
        const aiNote = `${breakdownSummary}${metaComment}`;

        aiDirectSaveBtn.disabled = true;
        aiDirectSaveBtn.textContent = "⏳ 正在儲存中…";

        try {
          const payload = {
            amount: finalTotal,
            description: storeName,
            note: aiNote,
            expense_date: expenseDate,
            created_by: editingAiExpenseOriginal ? editingAiExpenseOriginal.created_by : (myMember ? myMember.id : activeMembers[0].id),
            payers,
            shares,
            currency: selectedReceiptCurrency
          };

          if(editingAiExpenseId){
            const { error } = await sb.from("expenses").update(payload).eq("id", editingAiExpenseId);
            if(error) throw error;

            closeModal();
            await refreshExpenses();
            await sbAlert(`🎉 已成功更新「${storeName}」支出明細！`, "更新成功");
          } else {
            const { error } = await sb.from("expenses").insert(payload);
            if(error) throw error;

            closeModal();

            if(selectedReceiptCurrency !== CURRENCY){
              const okSwitch = await sbConfirm(`🎉 已成功直接記錄「${storeName}」總額 ${curSym}${formatAmt(finalTotal)} 至【${curLabel}區】！\n\n是否立即切換至【${curLabel}區】查看此筆支出？`, "記帳成功");
              if(okSwitch){
                location.href = "currency.html?c=" + selectedReceiptCurrency;
              } else {
                await refreshExpenses();
              }
            } else {
              await refreshExpenses();
              await sbAlert(`🎉 已成功直接記錄「${storeName}」總額 ${curSym}${formatAmt(finalTotal)}！`, "記帳成功");
            }
          }
        } catch(saveErr){
          console.error("Direct save expense error:", saveErr);
          await sbAlert("記帳失敗：" + (saveErr.message || "伺服器錯誤"), "記帳失敗");
        } finally {
          aiDirectSaveBtn.disabled = false;
          aiDirectSaveBtn.textContent = editingAiExpenseId ? "💾 確認修改並更新支出" : "💾 確認無誤，立即記帳";
        }
      });
    }
  }

  setupAiReceiptModal();

  // ---------- boot: check for an existing session ----------
  (async function boot(){
    const goToLogin = () => {
      location.href = "index.html?redirect=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
    };
    try {
      const { data:{ session } } = await sb.auth.getSession();
      if(session && session.user){
        await onLoggedIn(session.user);
      } else {
        goToLogin();
      }
    } catch(e) {
      console.error("Boot error:", e);
      goToLogin();
    }
  })();
})();
