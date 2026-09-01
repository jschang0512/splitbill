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
  // 債務關係表是否只顯示跟我相關的欠款（人數多的群組完整矩陣格子太多、
  // 大部分是空格，先只看自己相關的比較好找重點）。使用者只要手動點過
  // 一次按鈕，就記住這個選擇（存在 localStorage，純個人裝置端偏好，
  // 跟 showLeftMembers 是同一套做法），下次打開不用再點一次；還沒點過
  // 的話，才用「群組人數多寡」自動決定預設值，見 onLoggedIn() 裡的設定。
  const MATRIX_SHOW_ONLY_MINE_KEY = "splitbill-matrix-show-only-mine";
  let matrixShowOnlyMine = localStorage.getItem(MATRIX_SHOW_ONLY_MINE_KEY) === "1";

  // 金額格式化：不進行整數四捨五入，保留精確位數（最多2位小數）
  function formatAmt(v){
    if(v === undefined || v === null || isNaN(v) || Math.abs(v) < 0.001) return "0";
    const num = Number(v);
    return num.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // ---------- optional currency-conversion hint（適用任何幣別，不是只有日幣） ----------
  let conversionRate = null;
  function fetchConversionRate(){
    if(!SHOW_CONVERSION) return Promise.resolve(null);
    const lc = CURRENCY.toLowerCase();
    const sources = [
      { url:`https://open.er-api.com/v6/latest/${CURRENCY}`, parse:d => d && d.rates && d.rates.TWD },
      { url:`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${lc}.json`, parse:d => d && d[lc] && d[lc].twd },
      { url:`https://latest.currency-api.pages.dev/v1/currencies/${lc}.json`, parse:d => d && d[lc] && d[lc].twd }
    ];
    function tryFetch(i){
      if(i >= sources.length) return Promise.resolve(null);
      return fetch(sources[i].url)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          const rate = sources[i].parse(data);
          if(!rate) throw new Error("no rate");
          conversionRate = rate;
          updateExchangeRateHint();
          if(currentUser) refreshExpenses();
          return rate;
        })
        .catch(()=> tryFetch(i+1));
    }
    return tryFetch(0);
  }
  // 跟 fetchConversionRate() 同一套來源，但可以指定任意幣別代碼——用在
  // 「編輯匯率」這類彈窗上，該筆紀錄的原始幣別不一定等於目前頁面本身的
  // CURRENCY（例如在臺幣分頁點開「日幣債務轉入」時，頁面本身是臺幣）。
  function fetchRateForCurrencyCode(code){
    if(!code) return Promise.resolve(null);
    const lc = code.toLowerCase();
    const sources = [
      { url:`https://open.er-api.com/v6/latest/${code}`, parse:d => d && d.rates && d.rates.TWD },
      { url:`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${lc}.json`, parse:d => d && d[lc] && d[lc].twd },
      { url:`https://latest.currency-api.pages.dev/v1/currencies/${lc}.json`, parse:d => d && d[lc] && d[lc].twd }
    ];
    function tryFetch(i){
      if(i >= sources.length) return Promise.resolve(null);
      return fetch(sources[i].url)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          const rate = sources[i].parse(data);
          if(!rate) throw new Error("no rate");
          return rate;
        })
        .catch(()=> tryFetch(i+1));
    }
    return tryFetch(0);
  }
  // 幣別頁最上面秀一行「即時匯率」小字，讓人一眼看到匯率本身，不用
  // 特地去點某一筆支出才看得到換算後的臺幣提示。
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
            // 只是把這次查到的結果順便存起來給下次用，不影響這次要不要往下
            // 進行，不用等它回來——等了只是白白多卡一趟網路來回。
            sb.rpc("set_active_group", { p_group_id: activeGroupId }).catch(()=>{});
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
      // 退出/銷毀的「(退出)」「(銷毀)」後綴現在由資料庫 trigger 直接寫進 nickname，
      // 這裡不用再疊加一次，不然會變成「(銷毀) (銷毀)」。
    });
    memberById = {};
    MEMBERS.forEach(m => memberById[m.id] = m.name);
    myMember = currentUser ? (MEMBERS.find(m => m.user_id === currentUser.id && !m.left_at) || MEMBERS.find(m => m.user_id === currentUser.id)) : null;
    memberRows = showLeftMembers ? MEMBERS : MEMBERS.filter(m => !m.left_at);
  }

  function emailToName(email){
    const m = MEMBERS.find(x=>x.email === email);
    return m ? m.name : email;
  }

  // LOGIN_TIME_KEY/SESSION_DURATION_MS/isSessionExpired()/refreshLoginTime()
  // 移到全站共用的 shared-ui.js 了。登入畫面已經搬去 index.html，這裡
  // session 一失效就直接導過去，帶著 redirect 記住目前這個幣別頁，
  // 登入完成後才回得來——這段導向邏輯是這頁專屬的，所以 forceLogout()
  // 還是留在這裡自己定義。
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

  // showToast() 移到全站共用的 shared-ui.js 了。

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

    currentUser = user;
    window.currentUser = user;

    // 背景非阻塞獲取即時 User 資料（包含其他裝置上傳的最新 avatar_url）
    sb.auth.getUser().then(({ data: freshData, error: freshErr })=>{
      if(!freshErr && freshData && freshData.user){
        currentUser = freshData.user;
        window.currentUser = freshData.user;
      }
    }).catch(()=>{});

    if(appScreen){
      appScreen.style.display = "block";
      if(typeof hidePwaSplash === "function") hidePwaSplash();
      appScreen.classList.add("sb-fade-in");
      requestAnimationFrame(()=>{
        // ?ai=1（從「快速記帳」跳過來要直接開照片拆單）這裡先不處理——
        // aiReceiptBtn 的點擊事件要等 setupAiReceiptModal() 跑過才會綁上
        // 去，這裡（onLoggedIn 剛開始、還在 await loadMembers() 之前）綁
        // 定根本還沒生效，點了也沒反應。改到 setupAiReceiptModal() 之後
        // 處理，詳見下面。
        const requestedTab = new URLSearchParams(location.search).get("tab");
        const tabBtn = requestedTab && document.querySelector(`.app-tab[data-tab="${requestedTab}"]`);
        if(tabBtn) tabBtn.click();
        else moveTabIndicator(document.querySelector(".app-tab.active"));
      });
    }

    try{
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

    // 群組人數多的時候，債務關係表預設先只顯示跟我相關的部分，不然一
    // 打開就是一大片空格子的完整矩陣，很難找到重點；人少的話完整矩陣
    // 本來就一覽無遺，維持預設顯示全部。但使用者只要手動點過一次按鈕，
    // 那個選擇就會一直記住（存在 localStorage），這裡的自動判斷只在
    // 「從來沒手動選過」的情況下才生效，不會蓋掉使用者自己選的結果。
    if(localStorage.getItem(MATRIX_SHOW_ONLY_MINE_KEY) === null){
      matrixShowOnlyMine = memberRows.length > 8;
    }

    // 類別學習清單已經併進 refreshExpenses() 那一批平行查詢裡了（跟支出/
    // 還款/餘額一起發），這裡不用再額外呼叫一次，省一趟多餘的網路來回。

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

    const whoamiAvatarEl = document.getElementById("whoamiAvatar");
    renderWhoamiGroupSwitcher(sb, user, myMember, () => myMember.name || emailToName(user.email));
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

    window.memberRows = memberRows;
    initFilterMultiSelects(memberRows);
    // 成就榜已經拆成獨立的 ES module（achievements.js），用動態 import 載入、
    // 不用靜態 <script> 標籤，也不用等載入順序——呼叫到才抓檔案。getState()
    // 每次都重新讀一次目前的值，不是傳當下的快照，才不會使用者點開成就榜
    // 時看到剛登入那一刻的舊資料。
    import("./achievements.js?v=" + APP_VERSION).then(m => {
      m.initAchievementsModal({
        sb,
        getState: () => ({ myMember, MEMBERS, memberRows, cachedExpenses, cachedRepayments, chartExpensesCache })
      });
    }).catch(e => console.error("載入成就榜模組失敗：", e));

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
        updatePayerSumCheck(); updateShareSumCheck(); updateAddonsPreview(); updateTaxPreview();
      });
    }
    if(expAmtCalcBtn && expAmtInp){
      expAmtCalcBtn.addEventListener("click", ()=>{
        openCalc(expAmtInp, "支出總金額");
      });
    }

    renderAddonsList();

    // AI 拍照拆單已經拆成獨立的 ES module（ai-receipt.js），用動態 import
    // 載入。這裡一定要 await 到載入完成才能繼續，不能發完 import() 就不管
    // ——setupAiReceiptModal() 裡面才會真正把 aiReceiptBtn 的點擊事件綁上
    // 去，如果沒等到就先跑下面「?ai=1 自動點按鈕」的邏輯，會點了沒反應
    // （這正是先前修過的那個時序 bug，換成模組載入之後一樣要小心）。
    const aiReceiptDeps = {
      sb, CURRENCY, CURRENCY_SYMBOL, CURRENCIES, showLeftMembers, refreshExpenses,
      emailToName, getFirstLineDesc, formatTime, formatAmt,
      getState: () => ({ myMember, MEMBERS, memberById })
    };
    const aiReceiptModule = await import("./ai-receipt.js?v=" + APP_VERSION);
    aiReceiptModule.setupAiReceiptModal(aiReceiptDeps);
    aiReceiptModule.fetchSystemGeminiApiKey(sb);

    // 從總表頁「快速記帳」按了「改用照片自動拆單」跳過來的（?ai=1），
    // 直接開拍照拆單看板本身。
    if(new URLSearchParams(location.search).get("ai") === "1"){
      const aiBtn = document.getElementById("aiReceiptBtn");
      if(aiBtn) aiBtn.click();
    }

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

    // 債務關係表熱圖的顏色是算好直接寫進 inline style，不是純 CSS 變數，
    // 使用者切換深淺模式時 theme.js 會發這個事件，這裡收到後用現有快取
    // 的資料重畫一次（不用重打 API），顏色才會馬上跟著換。
    window.addEventListener("splitbill-theme-change", ()=>{
      if(cachedExpenses && cachedRepayments) renderDebtMatrix(cachedExpenses, cachedRepayments);
    });

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
      const shareTaxWarnEl = document.getElementById("expSharesTaxWarn");
      if(shareTaxWarnEl) shareTaxWarnEl.classList.toggle("hidden", splitMode !== "custom");
      document.getElementById("shareSumCheck").textContent = "";
      if(splitMode === "custom") updateShareSumCheck();
      if(splitMode === "equal") renderAddonsList();
    });
  });

  // ---------- 個人自付 / 額外消費 ----------
  // 兩種模式：custom（每人自己填多付多少，例如私人加點）跟 shared（大家一
  // 起買一樣東西、但不是全員分攤，例如點了一輪酒有一兩位不喝，填總價後勾
  // 選要分攤的人，系統平分給勾到的人）。兩種模式最後都會併進同一份
  // {memberId: {rawAmt, finalAmt, calc}} 結構，下游計算完全不用區分來源。
  let addonMode = "custom"; // "custom" | "shared"
  let sharedAddonItems = []; // [{ id, name, price, memberIds: [] }]

  function renderAddonsList(){
    const listEl = document.getElementById("expAddonsList");
    if(!listEl) return;
    // 個人自付要獨立於「怎麼分攤」勾選狀態之外——先決定誰有加點，
    // 分攤名單之後再調整也不會影響已經填好的加點金額。
    const participants = memberRows.filter(m => !m.left_at).map(m => m.id);

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
    renderSharedAddonsList();
    updateAddonsPreview();
  }

  function updateSharedAddonItemHint(rowEl, item){
    const hintEl = rowEl.querySelector(".exp-shared-addon-item-hint");
    if(!hintEl) return;
    const n = item.memberIds.length;
    const perPerson = n > 0 ? Math.floor((Number(item.price) || 0) / n) : 0;
    hintEl.textContent = n > 0 ? `每人 ${SYM}${formatAmt(perPerson)}（共 ${n} 人分攤）` : "尚未勾選分攤的人";
  }

  function renderSharedAddonsList(){
    const listEl = document.getElementById("expSharedAddonsList");
    if(!listEl) return;
    // 跟 renderAddonsList() 一樣，共同品項的可勾選名單獨立於「怎麼分攤」之外，
    // 用全體在團成員，不會因為分攤名單勾選變動而跟著跳動或被清空。
    const participants = memberRows.filter(m => !m.left_at).map(m => m.id);
    const participantSet = new Set(participants);
    // 只有成員真的退出群組時才清掉品項裡的勾選，避免殘留看不到的人
    sharedAddonItems.forEach(item => { item.memberIds = item.memberIds.filter(id => participantSet.has(id)); });

    if(!sharedAddonItems.length){
      listEl.innerHTML = `<div class="exp-shared-addon-empty">還沒有新增任何共同品項</div>`;
    } else {
      listEl.innerHTML = sharedAddonItems.map(item => {
        const n = item.memberIds.length;
        const perPerson = n > 0 ? Math.floor((Number(item.price) || 0) / n) : 0;
        const hintText = n > 0 ? `每人 ${SYM}${formatAmt(perPerson)}（共 ${n} 人分攤）` : "尚未勾選分攤的人";
        return `
          <div class="exp-shared-addon-item" data-id="${item.id}">
            <div class="exp-shared-addon-item-top">
              <input type="text" class="exp-shared-addon-name" placeholder="品項名稱（例如：酒）" value="${escapeHtml(item.name || "")}">
              <button type="button" class="exp-shared-addon-del" title="刪除">✕</button>
            </div>
            <div class="input-calc-wrap exp-shared-addon-price-wrap">
              <input type="number" class="exp-shared-addon-price" placeholder="總價" min="0" step="1" value="${item.price || ""}">
              <button type="button" class="amt-row-calc-btn input-calc-btn exp-shared-addon-calc-btn" title="小計算機">🧮</button>
            </div>
            <div class="exp-shared-addon-members">
              ${participants.map(pid => `
                <label class="check-pill exp-shared-addon-member${item.memberIds.includes(pid) ? ' checked' : ''}">
                  <input type="checkbox" value="${pid}"${item.memberIds.includes(pid) ? " checked" : ""}>
                  ${renderAvatarHTML({ id: pid, name: memberById[pid] }, "avatar-xs")}
                  <span class="check-pill-name">${escapeHtml(memberById[pid] || "?")}</span>
                </label>
              `).join("")}
            </div>
            <div class="exp-shared-addon-item-hint">${hintText}</div>
          </div>
        `;
      }).join("");
    }

    listEl.querySelectorAll(".exp-shared-addon-item").forEach(rowEl => {
      const itemId = rowEl.dataset.id;
      const item = sharedAddonItems.find(x => x.id === itemId);
      if(!item) return;
      const nameInp = rowEl.querySelector(".exp-shared-addon-name");
      if(nameInp) nameInp.addEventListener("input", () => { item.name = nameInp.value; });
      const priceInp = rowEl.querySelector(".exp-shared-addon-price");
      if(priceInp) priceInp.addEventListener("input", () => {
        item.price = Number(priceInp.value) || 0;
        updateSharedAddonItemHint(rowEl, item);
        updateAddonsPreview();
      });
      const calcBtn = rowEl.querySelector(".exp-shared-addon-calc-btn");
      if(calcBtn && priceInp){
        calcBtn.addEventListener("click", () => openCalc(priceInp, item.name || "共同品項總價"));
      }
      const delBtn = rowEl.querySelector(".exp-shared-addon-del");
      if(delBtn) delBtn.addEventListener("click", () => {
        sharedAddonItems = sharedAddonItems.filter(x => x.id !== itemId);
        renderSharedAddonsList();
        updateAddonsPreview();
      });
      rowEl.querySelectorAll(".exp-shared-addon-member input").forEach(chk => {
        chk.addEventListener("change", () => {
          const pid = chk.value;
          chk.closest(".check-pill").classList.toggle("checked", chk.checked);
          if(chk.checked){
            if(!item.memberIds.includes(pid)) item.memberIds.push(pid);
          } else {
            item.memberIds = item.memberIds.filter(id => id !== pid);
          }
          updateSharedAddonItemHint(rowEl, item);
          updateAddonsPreview();
        });
      });
    });
  }

  function getAddonsData(){
    if(addonMode === "shared"){
      const items = {};
      let totalAddon = 0;
      sharedAddonItems.forEach(item => {
        const n = item.memberIds.length;
        const price = Number(item.price) || 0;
        if(n === 0 || price <= 0) return;
        const base = Math.floor(price / n);
        const remainder = Math.round(price - base * n);
        item.memberIds.forEach((mId, idx) => {
          const amt = base + (idx < remainder ? 1 : 0);
          if(amt <= 0) return;
          if(!items[mId]) items[mId] = { rawAmt: 0, finalAmt: 0, calc: "" };
          items[mId].rawAmt += amt;
          items[mId].finalAmt += amt;
          const label = item.name ? item.name.trim() : "共同品項";
          items[mId].calc = items[mId].calc ? `${items[mId].calc}+${label}${amt}` : `${label}${amt}`;
          totalAddon += amt;
        });
      });
      return { totalAddon, items };
    }
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

  function setAddonMode(mode){
    addonMode = mode;
    const toggleEl = document.getElementById("expAddonModeToggle");
    if(toggleEl){
      toggleEl.querySelectorAll(".exp-addon-mode-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.addonMode === mode);
      });
    }
    const customListEl = document.getElementById("expAddonsList");
    const sharedWrapEl = document.getElementById("expSharedAddonsWrap");
    if(customListEl) customListEl.classList.toggle("hidden", mode !== "custom");
    if(sharedWrapEl) sharedWrapEl.classList.toggle("hidden", mode !== "shared");
    updateAddonsPreview();
  }

  const addonModeToggle = document.getElementById("expAddonModeToggle");
  if(addonModeToggle){
    addonModeToggle.querySelectorAll(".exp-addon-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => setAddonMode(btn.dataset.addonMode));
    });
  }

  const sharedAddonAddBtn = document.getElementById("expSharedAddonAddBtn");
  if(sharedAddonAddBtn){
    sharedAddonAddBtn.addEventListener("click", () => {
      sharedAddonItems.push({ id: "sadd_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), name: "", price: 0, memberIds: [] });
      renderSharedAddonsList();
    });
  }

  // ---------- 服務費 / 稅額 (選填) ----------
  let manualTaxSplitMode = "ratio"; // "ratio" | "equal"
  let manualTaxType = "inclusive"; // "inclusive" (內含) | "exclusive" (外加)

  const expAmountLabel = document.getElementById("expAmountLabel");

  function getManualExpenseTotals(){
    const subtotal = Number(document.getElementById("expAmount")?.value) || 0;
    const tax = manualTaxType === "inclusive" ? 0 : (Number(document.getElementById("expTaxAmount")?.value) || 0);
    const total = manualTaxType === "inclusive" ? subtotal : (subtotal + tax);
    return { subtotal, tax, total };
  }

  function updateManualTaxTypeUI(){
    if(expAmountLabel){
      expAmountLabel.textContent = manualTaxType === "inclusive" ? "支出總金額 (已含稅/免稅)" : "未稅金額 / 餐費小計";
    }
    updateTaxPreview();
    updatePayerSumCheck();
    updateShareSumCheck();
    updateAddonsPreview();
  }

  function collapseTaxBody(){
    const body = document.getElementById("expTaxBody");
    const toggle = document.getElementById("expTaxToggle");
    const caret = document.getElementById("expTaxCaret");
    if(body) body.classList.add("hidden");
    if(toggle) toggle.classList.remove("open");
    if(caret) caret.classList.remove("open");
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

  // 稅額是否算在總支出裡，改成只看「稅額欄位有沒有數字」，跟折疊卡片
  // 展開/收合是兩件事——收合起來只是暫時看不到欄位，資料跟計算都還在。
  function recomputeManualTaxType(){
    const v = Number(expTaxInp && expTaxInp.value) || 0;
    manualTaxType = v > 0 ? "exclusive" : "inclusive";
  }
  recomputeManualTaxType();
  // 表單一開啟就同步一次 UI（金額欄位文字等）
  updateManualTaxTypeUI();

  if(expTaxInp){
    expTaxInp.addEventListener("input", ()=>{
      recomputeManualTaxType();
      updateTaxPreview();
      updateManualTaxTypeUI();
    });
  }

  if(expTaxToggle && expTaxBody){
    expTaxToggle.addEventListener("click", ()=>{
      const isHidden = expTaxBody.classList.contains("hidden");
      expTaxBody.classList.toggle("hidden", !isHidden);
      expTaxToggle.classList.toggle("open", isHidden);
      if(expTaxCaret) expTaxCaret.classList.toggle("open", isHidden);
    });
  }
  const expTaxClearBtn = document.getElementById("expTaxClearBtn");
  if(expTaxClearBtn){
    expTaxClearBtn.addEventListener("click", ()=>{
      if(expTaxInp){ expTaxInp.value = ""; clearRowCalc(expTaxInp); }
      manualTaxSplitMode = "ratio";
      if(expManualTaxRatioBtn) expManualTaxRatioBtn.classList.add("active");
      if(expManualTaxEqualBtn) expManualTaxEqualBtn.classList.remove("active");
      recomputeManualTaxType();
      updateTaxPreview();
      updateManualTaxTypeUI();
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

    const taxWarnEl = document.getElementById("expAddonsTaxWarn");
    if(taxWarnEl) taxWarnEl.classList.toggle("hidden", tax <= 0);

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
  const expAddonsClearBtn = document.getElementById("expAddonsClearBtn");
  if(expAddonsClearBtn){
    expAddonsClearBtn.addEventListener("click", ()=>{
      document.querySelectorAll("#expAddonsList .exp-addon-input").forEach(i=>{ i.value=""; clearRowCalc(i); });
      sharedAddonItems = [];
      setAddonMode("custom");
      renderAddonsList();
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
      updateAddonsPreview();
    });
  }

  function sumCheckHTML(total, sum){
    const diff = Math.round((total - sum) * 100) / 100;
    if(!total) return "";
    if(Math.abs(diff) < 0.5) return `<span class="sum-ok">🎉 金額剛好分配完畢（${SYM}${formatAmt(sum)}）</span>`;
    if(diff > 0) return `<span class="sum-warn">⚠️ 尚餘 ${SYM}${formatAmt(diff)} 待分配（已分配 ${SYM}${formatAmt(sum)} / ${SYM}${formatAmt(total)}）</span>`;
    return `<span class="sum-warn">🚨 超出總金額 ${SYM}${formatAmt(Math.abs(diff))}（已分配 ${SYM}${formatAmt(sum)} / ${SYM}${formatAmt(total)}）</span>`;
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
      updateAddonsPreview();
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
            } else if(calcTargetInput.closest(".exp-shared-addon-price-wrap")){
              calcTargetInput.dispatchEvent(new Event("input", { bubbles: true }));
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
    const shareTaxWarnEl = document.getElementById("expSharesTaxWarn");
    if(shareTaxWarnEl) shareTaxWarnEl.classList.toggle("hidden", tax <= 0);
    document.querySelectorAll("#expSharesCustom .amt-row-input").forEach(inp => {
      inp.placeholder = tax > 0 ? "未稅金額" : "0";
    });
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

  // ---------- 支出類別下拉選單 (Category Select) ----------
  let selectedExpCategory = "general";
  let userManuallyPickedCategory = false;

  // ---------- 類別自動分類：學習使用者手動選過的品項/店名 ----------
  // 內建的 CATEGORY_KEYWORDS 是固定字庫，遇到庫裡沒有的店名就猜不到。這裡
  // 額外記一份「這個群組裡，某個品項名稱使用者曾經手動選過哪個類別」，
  // 之後同一個品項名稱（去頭尾空白、忽略大小寫）出現，直接套用學過的
  // 類別，比固定字庫優先；同一群組的其他成員也會一起受惠。
  let categoryLearningMap = {};
  function normalizeCategoryKeyword(s){
    return (s || "").trim().toLowerCase();
  }
  async function saveCategoryLearning(keyword, category){
    if(!keyword || !category || !myMember || !myMember.group_id) return;
    categoryLearningMap[keyword] = category;
    try {
      await sb.from("category_learning").upsert({
        group_id: myMember.group_id,
        keyword,
        category,
        updated_by: myMember.id,
        updated_at: new Date().toISOString()
      }, { onConflict: "group_id,keyword" });
    } catch(e){
      console.warn("儲存類別學習紀錄失敗：", e);
    }
  }
  // 部分符合：只要目前輸入的品項名稱裡「包含」某個學過的關鍵字就套用，
  // 不用整段文字完全一樣。多個關鍵字都命中時，取字數最長的那個（愈長愈
  // 具體，比較不會誤判到不相關的品項上）。
  function findLearnedCategory(typedText){
    const normalizedTyped = normalizeCategoryKeyword(typedText);
    if(!normalizedTyped) return null;
    let bestCategory = null;
    let bestLength = 0;
    Object.keys(categoryLearningMap).forEach(keyword => {
      if(keyword && keyword.length > bestLength && normalizedTyped.includes(keyword)){
        bestCategory = categoryLearningMap[keyword];
        bestLength = keyword.length;
      }
    });
    return bestCategory;
  }

  function updateExpCategoryUI(catType){
    selectedExpCategory = catType || "general";
    const select = document.getElementById("expCategorySelect");
    if(select){
      select.value = selectedExpCategory;
      if(typeof enhanceSelect === "function") enhanceSelect(select);
    }
  }

  const expCategorySelect = document.getElementById("expCategorySelect");
  if(expCategorySelect){
    enhanceSelect(expCategorySelect);
    expCategorySelect.addEventListener("change", ()=>{
      userManuallyPickedCategory = true;
      selectedExpCategory = expCategorySelect.value || "general";
      const learnedHint = document.getElementById("expCategoryLearnedHint");
      if(learnedHint) learnedHint.classList.add("hidden");
    });
  }

  // ============================================================
  const expDescInput = document.getElementById("expDesc");
  if(expDescInput){
    expDescInput.addEventListener("input", ()=>{
      if(!userManuallyPickedCategory || !expDescInput.value.trim()){
        const typed = expDescInput.value.trim();
        const learnedCategory = typed ? findLearnedCategory(typed) : null;
        const learnedHint = document.getElementById("expCategoryLearnedHint");
        if(learnedHint) learnedHint.classList.toggle("hidden", !learnedCategory);
        if(learnedCategory){
          updateExpCategoryUI(learnedCategory);
        } else {
          const meta = window.getCategoryMeta ? window.getCategoryMeta(expDescInput.value) : { type: "general" };
          updateExpCategoryUI(meta.type);
        }
        if(!expDescInput.value.trim()) userManuallyPickedCategory = false;
      }
    });
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
          // 均分/自訂分攤的計算已經抽成共用的 expense-form-shared.js（ES
          // module），跟「快速記帳」共用同一套演算法，不用再各自維護一份。
          const addonAmounts = {};
          Object.keys(addonItems).forEach(id => { addonAmounts[id] = addonItems[id].finalAmt; });
          const formShared = await import("./expense-form-shared.js?v=" + APP_VERSION);
          shares = formShared.computeEqualSplitShares({
            subtotal, taxAmount, taxSplitMode: manualTaxSplitMode,
            participantIds: participants,
            payerIds: payers.map(p => p.member_id),
            addonAmounts
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
        } else {
          if(Math.abs(customBaseSum - amount) >= 0.5){
            const diff = Math.round((amount - customBaseSum) * 100) / 100;
            msg.textContent = diff > 0
              ? `分攤總額還差 ${SYM}${formatAmt(diff)}，跟支出金額 ${SYM}${formatAmt(amount)} 對不上，無法加入`
              : `分攤總額超過 ${SYM}${formatAmt(Math.abs(diff))}，跟支出金額 ${SYM}${formatAmt(amount)} 對不上，無法加入`;
            msg.className = "msg error";
            return;
          }
        }

        // 均分/自訂分攤的計算已經抽成共用的 expense-form-shared.js（ES
        // module），跟「快速記帳」共用同一套演算法，不用再各自維護一份。
        {
          const formShared = await import("./expense-form-shared.js?v=" + APP_VERSION);
          shares = formShared.computeCustomSplitShares({ subtotal, taxAmount, taxSplitMode: manualTaxSplitMode, rows: customRows });
        }
      }

      // 項目保留乾淨標題（若編輯時原紀錄有隱藏 meta 標籤則保留於 description 末端）
      const { meta } = splitExpenseTitleAndNote(
        (editingExpenseOriginal && editingExpenseOriginal.description) || "",
        (editingExpenseOriginal && editingExpenseOriginal.note) || ""
      );
      let fullDescription = itemTitle;
      if(meta){
        const cleanMeta = meta.replace(/<!--?\s*(CAT|LOC):[^-]*-->?/gi, "").trim();
        if(cleanMeta) fullDescription += " " + cleanMeta;
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
        currency: CURRENCY,
        category: selectedExpCategory || "general"
      };
      const { error } = editingExpenseId
        ? await sb.from("expenses").update(payload).eq("id", editingExpenseId)
        : await sb.from("expenses").insert(payload);
      if(error){ msg.textContent = (editingExpenseId ? "更新失敗：" : "新增失敗：") + error.message; msg.className = "msg error"; return; }

      if(userManuallyPickedCategory && itemTitle){
        const learnKeyword = normalizeCategoryKeyword(getFirstLineDesc(itemTitle));
        if(learnKeyword) saveCategoryLearning(learnKeyword, selectedExpCategory || "general");
      }

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
      collapseTaxBody();
      updateManualTaxTypeUI();
      document.getElementById("expDesc").value = "";
      if(document.getElementById("expNote")) document.getElementById("expNote").value = "";
      document.querySelectorAll("#expPayers .amt-row-input, #expSharesCustom .amt-row-input, #expAddonsList .exp-addon-input").forEach(i=>{ i.value=""; clearRowCalc(i); });
      document.getElementById("payerSumCheck").innerHTML = "";
      document.getElementById("shareSumCheck").innerHTML = "";
      sharedAddonItems = [];
      setAddonMode("custom");
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
        let rawContent = numMatch[2].trim();
        rawContent = rawContent.replace(/^品項\s*[:：]\s*/, '').trim();
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
        if(l.includes("原文:") || l.includes("原文：")){
          const origText = l.replace(/^.*?原文\s*[:：]\s*/, '').trim();
          if(origText){
            currentItem.name += " (" + origText + ")";
          }
          return;
        }

        if(l.includes("價格:") || l.includes("價格：")){
          const pMatch = l.match(/價格\s*[:：]\s*[^\d]*([\d,]+(?:\.\d+)?)/);
          if(pMatch){
            currentItem.price = Number(pMatch[1].replace(/,/g, "")) || 0;
          }
          const unitMatch = l.match(/單價\s*[^\d]*([\d,]+(?:\.\d+)?)/);
          if(unitMatch){
            currentItem.price = Number(unitMatch[1].replace(/,/g, "")) || currentItem.price;
          }
          const qtyMatch = l.match(/×\s*(\d+)/);
          if(qtyMatch){
            currentItem.qty = Number(qtyMatch[1]) || 1;
          }
          return;
        }

        if(l.includes("分攤:") || l.includes("分攤：") || l.includes("➔")){
          let claimPart = l.includes("➔") ? l.slice(l.indexOf("➔") + 1).trim() : l.replace(/^.*?分攤\s*[:：]\s*/, '').trim();
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
          return;
        }

        const priceMatch = l.match(/([^0-9\s]*\s*[\d,]+(?:\.\d+)?)$/);
        if(priceMatch && currentItem.price === 0){
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

  // 從 calc 算式字串（例如「平分300+自付200+稅額50」「自付150」「自訂600+稅額60」）
  // 反推出當初分開輸入的 base/自付/稅額三個數字，讓編輯模式能還原原始欄位，
  // 而不是把總金額攤平成看不出組成的自訂金額。
  function parseShareCalc(calc, rawAmount){
    const s = calc || "";
    const taxMatch = s.match(/稅額(\d+(?:\.\d+)?)/);
    const addonMatch = s.match(/自付(\d+(?:\.\d+)?)/);
    const customMatch = s.match(/^自訂(\d+(?:\.\d+)?)/);
    const equalBaseMatch = s.match(/^平分(\d+(?:\.\d+)?)/);
    const addonOnlyMatch = s.match(/^自付(\d+(?:\.\d+)?)$/);
    const tax = taxMatch ? parseFloat(taxMatch[1]) : 0;
    const addon = addonMatch ? parseFloat(addonMatch[1]) : 0;
    if(customMatch){
      return { base: parseFloat(customMatch[1]), addon: 0, tax, isCustom: true, isAddonOnly: false, hasCalc: true };
    }
    if(addonOnlyMatch){
      return { base: 0, addon, tax: 0, isCustom: false, isAddonOnly: true, hasCalc: true };
    }
    if(equalBaseMatch){
      return { base: parseFloat(equalBaseMatch[1]), addon, tax, isCustom: false, isAddonOnly: false, hasCalc: true };
    }
    // 沒有算式可解析：視為單純的一份金額，沒有稅／加點資訊
    return { base: Number(rawAmount) || 0, addon: 0, tax: 0, isCustom: false, isAddonOnly: false, hasCalc: false };
  }

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
    sharedAddonItems = [];
    setAddonMode("custom");
    document.getElementById("editBanner").classList.remove("hidden");
    document.getElementById("expFormTitle").textContent = "✎ 編輯支出";
    document.getElementById("addExpenseBtn").textContent = "更新這筆支出";

    const expAmtInp = document.getElementById("expAmount");
    const singlePayerCalc = (e.payers && e.payers.length === 1 && e.payers[0].calc) || "";

    const { title, note } = splitExpenseTitleAndNote(e.description, e.note);
    document.getElementById("expDesc").value = title;
    if(document.getElementById("expNote")) document.getElementById("expNote").value = note;
    document.getElementById("expDate").value = e.expense_date;
    const catMeta = window.getCategoryMeta ? window.getCategoryMeta(e.description, e.note, e.category) : { type: "general" };
    updateExpCategoryUI(catMeta.type);
    userManuallyPickedCategory = true;

    // 從每一份分攤金額的 calc 算式反推當初的稅額／個人自付，編輯時才能還原
    // 原本的欄位內容，而不是把總金額攤平顯示成看不出組成的數字。
    const editShares = e.shares || [];
    const parsedShares = editShares.map(s => ({ member_id: s.member_id, ...parseShareCalc(s.calc, s.amount) }));
    const restoredTax = parsedShares.reduce((sum, p) => sum + (p.tax || 0), 0);
    const restoredAddonMap = {};
    parsedShares.forEach(p => { if(p.addon > 0) restoredAddonMap[p.member_id] = p.addon; });
    const hasCustomSignature = parsedShares.some(p => p.isCustom);

    expAmtInp.value = Number(e.amount) - restoredTax;
    applyRowCalc(expAmtInp, singlePayerCalc);

    manualTaxType = restoredTax > 0 ? "exclusive" : "inclusive";
    if(restoredTax > 0){
      const expTaxInp = document.getElementById("expTaxAmount");
      if(expTaxInp) expTaxInp.value = restoredTax;
      const expTaxBody = document.getElementById("expTaxBody");
      const expTaxToggle = document.getElementById("expTaxToggle");
      const expTaxCaret = document.getElementById("expTaxCaret");
      if(expTaxBody) expTaxBody.classList.remove("hidden");
      if(expTaxToggle) expTaxToggle.classList.add("open");
      if(expTaxCaret) expTaxCaret.classList.add("open");
    } else {
      collapseTaxBody();
    }
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

    // 「怎麼分攤」的判斷改用還原出來的 base（扣掉稅／個人自付之後的數字），
    // 才不會因為每個人加點金額不同、稅金比例分配尾差等因素，被誤判成自訂金額。
    const baseSharers = parsedShares.filter(p => !p.isAddonOnly);
    const avgBase = baseSharers.length ? baseSharers.reduce((sum, p) => sum + p.base, 0) / baseSharers.length : 0;
    const wasEqualSplit = !hasCustomSignature && baseSharers.length > 0 &&
      baseSharers.every(p => Math.abs(p.base - avgBase) < 1);

    if(wasEqualSplit){
      const equalBtn = document.querySelector('.split-mode-btn[data-mode="equal"]');
      if(equalBtn) equalBtn.click();
      const shareIds = baseSharers.map(p => p.member_id);
      shareIds.forEach(id => ensureParticipantPill(document.getElementById("expParticipants"), id));
      document.querySelectorAll("#expParticipants input").forEach(inp=>{
        const checked = shareIds.includes(inp.value);
        inp.checked = checked;
        inp.closest(".check-pill").classList.toggle("checked", checked);
      });
      if(Object.keys(restoredAddonMap).length){
        renderAddonsList();
        document.querySelectorAll("#expAddonsList .exp-addon-input").forEach(inp=>{
          const amt = restoredAddonMap[inp.dataset.member];
          if(amt) inp.value = amt;
        });
        updateAddonsPreview();
        if(addonsBody){
          addonsBody.classList.remove("hidden");
          if(addonsToggle) addonsToggle.classList.add("open");
          if(addonsCaret) addonsCaret.classList.add("open");
        }
      }
    } else {
      const customBtn = document.querySelector('.split-mode-btn[data-mode="custom"]');
      if(customBtn) customBtn.click();
      parsedShares.forEach(p => ensureAmtRow(document.getElementById("expSharesCustom"), p.member_id));
      document.querySelectorAll("#expSharesCustom .amt-row-input").forEach(inp=>{
        const match = parsedShares.find(p => p.member_id === inp.dataset.member);
        inp.value = match ? match.base : "";
        applyRowCalc(inp, null);
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
    collapseTaxBody();
    updateManualTaxTypeUI();
    document.getElementById("expDesc").value = "";
    if(document.getElementById("expNote")) document.getElementById("expNote").value = "";
    selectedExpCategory = "general";
    userManuallyPickedCategory = false;
    updateExpCategoryUI("general");
    { const learnedHint = document.getElementById("expCategoryLearnedHint"); if(learnedHint) learnedHint.classList.add("hidden"); }
    sharedAddonItems = [];
    setAddonMode("custom");
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
    const gid = (myMember && myMember.group_id) || (MEMBERS[0] && MEMBERS[0].group_id);
    let expQuery = sb.from("expenses").select("*").order("expense_date", { ascending:false }).order("created_at", { ascending:false });
    let repQuery = sb.from("repayments").select("*").order("payment_date", { ascending:false }).order("created_at", { ascending:false });

    if(gid){
      expQuery = expQuery.eq("group_id", gid);
      repQuery = repQuery.eq("group_id", gid);
    } else {
      expQuery = expQuery.eq("currency", CURRENCY);
      repQuery = repQuery.eq("currency", CURRENCY);
    }

    // member_balances 這個 RPC、類別學習清單，跟支出/還款查詢彼此獨立
    // （都是各自從資料庫現況算出來的），一起打出去平行等，不用等前一個
    // 回來才發下一個請求——省下好幾趟往返的時間，畫面才不會一直卡在
    // 「載入中」。
    const balQuery = sb.rpc("member_balances", { p_since: null });
    const catLearnQuery = (myMember && myMember.group_id)
      ? sb.from("category_learning").select("keyword, category").eq("group_id", myMember.group_id)
      : Promise.resolve({ data: [], error: null });

    const [
      { data: allExp, error: expError },
      { data: allRep, error: repError },
      { data: balRows, error: balError },
      { data: catLearnRows, error: catLearnError }
    ] = await Promise.all([expQuery, repQuery, balQuery, catLearnQuery]);

    if(expError || repError){
      console.error("讀取支出/還款失敗：", expError || repError);
      return;
    }

    window.allGroupExpenses = allExp || [];
    window.allGroupRepayments = allRep || [];

    const expenses = (allExp || []).filter(e => e.currency === CURRENCY);
    const repayments = (allRep || []).filter(r => r.currency === CURRENCY);

    cachedExpenses = expenses;
    cachedRepayments = repayments;
    window.cachedExpenses = cachedExpenses;
    window.cachedRepayments = cachedRepayments;

    // 類別學習清單原本是另外、事後才發一次請求，現在併進上面同一批
    // Promise.all 一起平行處理，不用再多等一趟網路來回。
    if(catLearnError){
      console.warn("讀取類別學習紀錄失敗：", catLearnError);
    } else {
      categoryLearningMap = {};
      (catLearnRows || []).forEach(row => { categoryLearningMap[row.keyword] = row.category; });
    }

    applyFiltersAndRenderHistory();
    applyFiltersAndRenderRepayments();
    await renderBalances(expenses, repayments, { data: balRows, error: balError });

    // 如果「往來紀錄」視窗目前開著（例如別人在同一時間新增/編輯了帳目），
    // 用最新資料重新畫一次，數字才不會停在剛打開當下那一刻的舊快照。
    const openPairEl = document.getElementById("matrixDetail");
    if(currentPairDetail && openPairEl && openPairEl.style.display === "block"){
      showPairDetail(currentPairDetail.debtorId, currentPairDetail.creditorId, expenses, repayments);
    }
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

  // ---------- 多選型下拉式選單狀態與元件 (Multi-Select Dropdown Component) ----------
  const multiSelectStates = {
    filterCategoryDropdown: [],
    filterPayerDropdown: [],
    filterInvolvedDropdown: [],
    filterRepayFromDropdown: [],
    filterRepayToDropdown: []
  };

  let cachedFilterMembers = [];

  function setupMultiSelectDropdown({ containerId, defaultLabel, options, onChange }){
    const container = document.getElementById(containerId);
    if(!container) return;

    if(!multiSelectStates[containerId]){
      multiSelectStates[containerId] = [];
    }

    function renderUI(){
      const selected = multiSelectStates[containerId] || [];
      let summaryText = defaultLabel || "全部 (未篩選)";
      let badgeHtml = "";

      if(selected.length > 0){
        const selectedItems = options.filter(o => selected.includes(o.value));
        if(selectedItems.length === 1){
          summaryText = selectedItems[0].shortLabel || selectedItems[0].label;
        } else if(selectedItems.length === 2){
          summaryText = `${selectedItems[0].shortLabel || selectedItems[0].label}、${selectedItems[1].shortLabel || selectedItems[1].label}`;
        } else if(selectedItems.length > 2){
          summaryText = `${selectedItems[0].shortLabel || selectedItems[0].label} 等 ${selectedItems.length} 項`;
        }
        badgeHtml = `<span class="sb-ms-count-badge">${selected.length}</span>`;
      }

      const isOpen = container.classList.contains("open");

      container.innerHTML = `
        <button type="button" class="sb-ms-trigger ${selected.length ? 'has-selection' : ''}">
          <span class="sb-ms-trigger-text">${escapeHtml(summaryText)}</span>
          <div class="sb-ms-trigger-right">
            ${badgeHtml}
            <span class="sb-ms-caret">▾</span>
          </div>
        </button>
        <div class="sb-ms-popover ${isOpen ? 'show' : ''}">
          <div class="sb-ms-header">
            <button type="button" class="sb-ms-action-btn select-all-btn">全選</button>
            <span class="sb-ms-header-sep">|</span>
            <button type="button" class="sb-ms-action-btn clear-all-btn">清除</button>
          </div>
          <div class="sb-ms-list">
            ${options.map(opt => {
              const isChecked = selected.includes(opt.value);
              return `
                <label class="sb-ms-item ${isChecked ? 'checked' : ''}">
                  <input type="checkbox" value="${opt.value}" ${isChecked ? 'checked' : ''}>
                  <div class="sb-ms-item-content">
                    ${opt.iconHtml || ''}
                    <span class="sb-ms-item-label">${escapeHtml(opt.label)}</span>
                  </div>
                </label>
              `;
            }).join("")}
          </div>
        </div>
      `;

      // 綁定事件
      const trigger = container.querySelector(".sb-ms-trigger");
      const popover = container.querySelector(".sb-ms-popover");

      trigger.addEventListener("click", (e)=>{
        e.stopPropagation();
        // 關閉其他開啟中的多選下拉選單
        document.querySelectorAll(".sb-multi-select.open").forEach(ms => {
          if(ms !== container){
            ms.classList.remove("open");
            const p = ms.querySelector(".sb-ms-popover");
            if(p) p.classList.remove("show");
          }
        });

        const willOpen = !container.classList.contains("open");
        container.classList.toggle("open", willOpen);
        if(popover) popover.classList.toggle("show", willOpen);
      });

      popover.addEventListener("click", (e)=>{
        e.stopPropagation();
      });

      const selectAllBtn = popover.querySelector(".select-all-btn");
      if(selectAllBtn){
        selectAllBtn.addEventListener("click", ()=>{
          multiSelectStates[containerId] = options.map(o => o.value);
          renderUI();
          if(onChange) onChange(multiSelectStates[containerId]);
        });
      }

      const clearAllBtn = popover.querySelector(".clear-all-btn");
      if(clearAllBtn){
        clearAllBtn.addEventListener("click", ()=>{
          multiSelectStates[containerId] = [];
          renderUI();
          if(onChange) onChange(multiSelectStates[containerId]);
        });
      }

      popover.querySelectorAll(".sb-ms-item input").forEach(inp => {
        inp.addEventListener("change", ()=>{
          const val = inp.value;
          if(inp.checked){
            if(!multiSelectStates[containerId].includes(val)){
              multiSelectStates[containerId].push(val);
            }
          } else {
            multiSelectStates[containerId] = multiSelectStates[containerId].filter(v => v !== val);
          }
          renderUI();
          if(onChange) onChange(multiSelectStates[containerId]);
        });
      });
    }

    renderUI();
  }

  // 全域點擊關閉所有 multi-select popover
  document.addEventListener("click", (e)=>{
    if(!e.target.closest(".sb-multi-select")){
      document.querySelectorAll(".sb-multi-select.open").forEach(ms => {
        ms.classList.remove("open");
        const p = ms.querySelector(".sb-ms-popover");
        if(p) p.classList.remove("show");
      });
    }
  });

  function initFilterMultiSelects(rows){
    if(rows) cachedFilterMembers = rows;
    const currentMembers = cachedFilterMembers || [];

    const memberOptions = currentMembers.map(m => ({
      value: m.id,
      label: m.name,
      shortLabel: m.name,
      iconHtml: renderAvatarHTML(m, "avatar-xs")
    }));

    const categoryOptions = Object.keys(CATEGORY_MAP || {}).filter(k => k !== "xcur").map(k => ({
      value: k,
      label: `${CATEGORY_MAP[k].icon} ${CATEGORY_MAP[k].name}`,
      shortLabel: `${CATEGORY_MAP[k].icon} ${CATEGORY_MAP[k].name.slice(0, 2)}`,
      iconHtml: `<span class="cat-chip-icon" style="font-size:15px;line-height:1;">${CATEGORY_MAP[k].icon}</span>`
    }));

    setupMultiSelectDropdown({
      containerId: "filterCategoryDropdown",
      defaultLabel: "所有類別 (未篩選)",
      options: categoryOptions,
      onChange: () => {
        applyFiltersAndRenderHistory();
      }
    });

    setupMultiSelectDropdown({
      containerId: "filterPayerDropdown",
      defaultLabel: "所有人 (未篩選)",
      options: memberOptions,
      onChange: () => {
        applyFiltersAndRenderHistory();
      }
    });

    setupMultiSelectDropdown({
      containerId: "filterInvolvedDropdown",
      defaultLabel: "所有人 (未篩選)",
      options: memberOptions,
      onChange: () => {
        applyFiltersAndRenderHistory();
      }
    });

    setupMultiSelectDropdown({
      containerId: "filterRepayFromDropdown",
      defaultLabel: "所有人 (未篩選)",
      options: memberOptions,
      onChange: () => {
        applyFiltersAndRenderRepayments();
      }
    });

    setupMultiSelectDropdown({
      containerId: "filterRepayToDropdown",
      defaultLabel: "所有人 (未篩選)",
      options: memberOptions,
      onChange: () => {
        applyFiltersAndRenderRepayments();
      }
    });
  }

  function getEffectiveFrom(){
    const fromEl = document.getElementById("filterFrom");
    const from = fromEl ? fromEl.value : "";
    if(from) return from;
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0,10);
  }

  let activeQuickCategory = "all";
  let liveSearchKeyword = "";

  function passesFilter(e){
    const from = getEffectiveFrom();
    const toEl = document.getElementById("filterTo");
    const to = toEl ? toEl.value : "";
    const kwEl = document.getElementById("filterKeyword");
    const keyword = kwEl ? kwEl.value.trim().toLowerCase() : "";

    const selectedCats = multiSelectStates.filterCategoryDropdown || [];
    const payerIds = multiSelectStates.filterPayerDropdown || [];
    const involvedIds = multiSelectStates.filterInvolvedDropdown || [];

    if(from && e.expense_date < from) return false;
    if(to && e.expense_date > to) return false;
    if(keyword && !(e.description || "").toLowerCase().includes(keyword) && !(e.note || "").toLowerCase().includes(keyword)) return false;
    if(liveSearchKeyword && !(e.description || "").toLowerCase().includes(liveSearchKeyword) && !(e.note || "").toLowerCase().includes(liveSearchKeyword)) return false;

    // 分類快速 Chip 篩選
    if(activeQuickCategory !== "all"){
      const catMeta = (window.getCategoryMeta && window.getCategoryMeta(e.description, e.note, e.category)) || { type: "general" };
      if(catMeta.type !== activeQuickCategory) return false;
    }

    // 類別多選篩選
    if(selectedCats.length > 0){
      const catMeta = (window.getCategoryMeta && window.getCategoryMeta(e.description, e.note, e.category)) || { type: "general" };
      if(!selectedCats.includes(catMeta.type)) return false;
    }

    // 付款人多選篩選
    if(payerIds.length && !(e.payers || []).some(p => payerIds.includes(p.member_id))) return false;

    // 應付人多選篩選
    if(involvedIds.length && !(e.shares || []).some(s => involvedIds.includes(s.member_id))) return false;

    return true;
  }

  function passesRepayFilter(r){
    const from = getEffectiveFrom();
    const toEl = document.getElementById("filterTo");
    const to = toEl ? toEl.value : "";
    const kwEl = document.getElementById("filterKeyword");
    const keyword = kwEl ? kwEl.value.trim().toLowerCase() : "";

    const fromIds = multiSelectStates.filterRepayFromDropdown || [];
    const toIds = multiSelectStates.filterRepayToDropdown || [];

    if(from && r.payment_date < from) return false;
    if(to && r.payment_date > to) return false;
    if(keyword && !(r.note || "").toLowerCase().includes(keyword)) return false;
    if(liveSearchKeyword && !(r.note || "").toLowerCase().includes(liveSearchKeyword) && !(memberById[r.from_member] || "").toLowerCase().includes(liveSearchKeyword) && !(memberById[r.to_member] || "").toLowerCase().includes(liveSearchKeyword)) return false;
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

  // 即時搜尋與分類 Chips 事件綁定
  const liveSearchInp = document.getElementById("historyLiveSearch");
  const liveSearchClear = document.getElementById("historyLiveSearchClear");
  if(liveSearchInp){
    liveSearchInp.addEventListener("input", ()=>{
      liveSearchKeyword = liveSearchInp.value.trim().toLowerCase();
      if(liveSearchClear) liveSearchClear.classList.toggle("hidden", !liveSearchKeyword);
      applyFiltersAndRenderHistory();
      applyFiltersAndRenderRepayments();
    });
  }
  if(liveSearchClear){
    liveSearchClear.addEventListener("click", ()=>{
      if(liveSearchInp) liveSearchInp.value = "";
      liveSearchKeyword = "";
      liveSearchClear.classList.add("hidden");
      applyFiltersAndRenderHistory();
      applyFiltersAndRenderRepayments();
    });
  }
  document.querySelectorAll("#historyCategoryChips .history-cat-chip").forEach(chip => {
    chip.addEventListener("click", ()=>{
      document.querySelectorAll("#historyCategoryChips .history-cat-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeQuickCategory = chip.dataset.cat || "all";
      applyFiltersAndRenderHistory();
    });
  });

  const filterClearBtn = document.getElementById("filterClearBtn");
  if(filterClearBtn){
    filterClearBtn.addEventListener("click", ()=>{
      document.getElementById("filterFrom").value = "";
      document.getElementById("filterTo").value = "";
      document.getElementById("filterKeyword").value = "";
      if(liveSearchInp) liveSearchInp.value = "";
      if(liveSearchClear) liveSearchClear.classList.add("hidden");
      liveSearchKeyword = "";
      activeQuickCategory = "all";
      document.querySelectorAll("#historyCategoryChips .history-cat-chip").forEach(c => c.classList.toggle("active", c.dataset.cat === "all"));
      Object.keys(multiSelectStates).forEach(k => {
        multiSelectStates[k] = [];
      });
      initFilterMultiSelects();
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

    // 2.1 還款不需分類 Chips，切換時優雅收合
    const catChipsWrap = document.getElementById("historyCategoryChips");
    if(catChipsWrap) catChipsWrap.classList.toggle("hidden", !isExp);

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

  // escapeHtml() / enhanceSelect() 移到全站共用的 shared-ui.js 了。
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
    if(!str) return false;
    const s = String(str);
    if(s.includes("xcur")) return true;
    // 舊版（尚未加上 [xcur:id] 標籤前）的跨幣別轉入格式："日幣債務轉入 (¥5,987 匯率 0.199893)"
    return /債務轉入\s*\([^)]*\)/.test(s);
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

  function extractXcurId(str){
    const m = (str || "").match(/xcur[:_]([a-zA-Z0-9-]+)/i);
    return m ? m[1] : null;
  }

  // ---------- 跨幣別轉入：編輯匯率（重新輸入匯率，即時換算並更新臺幣帳本那筆欠款）----------
  async function openXcurRateEditModal(xcurId){
    const modal = document.getElementById("xcurRateEditModal");
    if(!modal) return;

    const { data: rep, error: repErr } = await sb.from("repayments").select("*").eq("offset_group", xcurId).maybeSingle();
    if(repErr || !rep){
      await sbAlert("找不到對應的原始跨幣別轉移紀錄，無法編輯匯率。", "🔔 Splitbill 錯誤");
      return;
    }
    const { data: expList, error: expErr } = await sb.from("expenses").select("*").ilike("description", `%[xcur:${xcurId}]%`);
    const exp = (expList && expList[0]) || null;
    if(expErr || !exp){
      await sbAlert("找不到對應的臺幣欠款紀錄，無法編輯匯率。", "🔔 Splitbill 錯誤");
      return;
    }

    const amt = Number(rep.amount) || 0;
    const oldRateMatch = (rep.note || "").match(/匯率\s*([\d.]+)/);
    const oldRate = oldRateMatch ? parseFloat(oldRateMatch[1]) : (amt ? (Number(exp.amount) || 0) / amt : 0);

    // 這筆紀錄真正的原始幣別（不是目前頁面本身的 CURRENCY——例如在臺幣
    // 分頁點開「日幣債務轉入」時，頁面本身是臺幣，但這筆紀錄的原始金額是日幣）
    const curMeta = (typeof CURRENCIES !== "undefined" && CURRENCIES.find(c => c.code === rep.currency)) || { symbol: SYM, label: CURRENCY_LABEL };
    const xcurSym = curMeta.symbol;
    const xcurLabel = curMeta.label;

    const routeEl = document.getElementById("xcurRateEditRoute");
    const origAmtEl = document.getElementById("xcurRateEditOrigAmt");
    const prefixEl = document.getElementById("xcurRateEditPrefix");
    const rateInput = document.getElementById("xcurRateEditInput");
    const resultAmtEl = document.getElementById("xcurRateEditResultAmt");
    const saveBtn = document.getElementById("xcurRateEditSaveBtn");
    const closeBtn = document.getElementById("xcurRateEditCloseBtn");
    const fetchRateBtn = document.getElementById("xcurRateEditFetchRateBtn");

    if(routeEl) routeEl.textContent = `${memberById[rep.from_member] || "?"} → ${memberById[rep.to_member] || "?"}`;
    if(origAmtEl) origAmtEl.textContent = `${xcurSym}${formatAmt(amt)} ${xcurLabel}`;
    if(prefixEl) prefixEl.textContent = `1 ${xcurLabel} = NT$`;
    if(rateInput) rateInput.value = oldRate || "";

    function updatePreview(){
      const r = parseFloat(rateInput.value) || 0;
      const twdAmt = Math.round(amt * r);
      if(resultAmtEl) resultAmtEl.textContent = `NT$ ${formatAmt(twdAmt)}`;
    }
    updatePreview();
    if(rateInput) rateInput.oninput = updatePreview;

    if(fetchRateBtn){
      fetchRateBtn.onclick = async ()=>{
        const originalText = fetchRateBtn.textContent;
        fetchRateBtn.disabled = true;
        fetchRateBtn.textContent = "抓取中…";
        const rate = await fetchRateForCurrencyCode(rep.currency);
        fetchRateBtn.disabled = false;
        fetchRateBtn.textContent = originalText;
        if(!rate){
          await sbAlert("即時匯率抓取失敗，請稍後再試或手動輸入。", "🔔 Splitbill 提醒");
          return;
        }
        rateInput.value = rate;
        updatePreview();
      };
    }

    if(saveBtn){
      saveBtn.onclick = async ()=>{
        const r = parseFloat(rateInput.value) || 0;
        if(r <= 0){
          await sbAlert("請輸入有效的匯率", "🔔 Splitbill 提醒");
          return;
        }
        const twdAmt = Math.round(amt * r);
        if(twdAmt <= 0){
          await sbAlert("換算金額必須大於 0", "🔔 Splitbill 提醒");
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = "儲存中…";

        const newDescNote = `${xcurSym}${formatAmt(amt)} 匯率 ${r}`;
        const newPayers = (exp.payers || []).map(p => ({ ...p, amount: twdAmt }));
        const newShares = (exp.shares || []).map(s => ({ ...s, amount: twdAmt }));

        const { error: updExpErr } = await sb.from("expenses").update({
          amount: twdAmt,
          note: newDescNote,
          payers: newPayers,
          shares: newShares
        }).eq("id", exp.id);

        if(updExpErr){
          await sbAlert("更新失敗：" + updExpErr.message, "🔔 Splitbill 錯誤");
          saveBtn.disabled = false;
          saveBtn.textContent = "儲存新匯率";
          return;
        }

        const newRepNote = (rep.note || "").replace(/NT\$[\d,]+\s*\(匯率\s*[\d.]+\)/, `NT$${twdAmt.toLocaleString()} (匯率 ${r})`);
        await sb.from("repayments").update({ note: newRepNote }).eq("id", rep.id);

        modal.classList.remove("show");
        modal.classList.add("hidden");
        await refreshExpenses();
        await sbAlert(`✓ 已更新匯率！臺幣帳本欠款金額已改為 NT$${twdAmt.toLocaleString()}。`, "🔔 Splitbill 通知");
        saveBtn.disabled = false;
        saveBtn.textContent = "儲存新匯率";
      };
    }
    if(closeBtn){
      closeBtn.onclick = ()=>{
        modal.classList.remove("show");
        modal.classList.add("hidden");
      };
    }

    modal.classList.remove("hidden");
    modal.classList.add("show");
  }

  // ---------- 復原刪除：直接刪除（不是延遲後才真的執行），跳出可復原的
  // toast；按「復原」才把暫存的完整資料重新寫回去。故意不用「倒數完才
  // 真的刪除」的做法——如果使用者在倒數期間就切頁或關分頁，計時器會被
  // 中斷、刪除永遠不會發生，資料庫反而卡在「應刪未刪」的曖昧狀態；先
  // 刪除、復原時用暫存資料重新 insert 回去，不管使用者何時離開，資料庫
  // 狀態永遠是確定、乾淨的——這也是為什麼倒數期間離開頁面等同放棄復原。
  async function deleteRowsWithUndo(table, rows, refreshFn, label){
    const list = Array.isArray(rows) ? rows : [rows];
    const ids = list.map(r => r.id);
    const { error } = await sb.from(table).delete().in("id", ids);
    if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
    await refreshFn();
    showToast("🗑️ 已刪除", label || "", "復原", async ()=>{
      const { error: restoreErr } = await sb.from(table).insert(list);
      if(restoreErr){ await sbAlert("復原失敗：" + restoreErr.message, "🔔 Splitbill 錯誤"); return; }
      await refreshFn();
    });
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

    const isDefaultDateFilter = !document.getElementById("filterFrom")?.value;
    const twoWeekHint = isDefaultDateFilter
      ? `<div class="history-twoweek-hint">📅 僅列出近兩週紀錄，若要尋找更早的紀錄請使用篩選功能</div>`
      : "";

    el.innerHTML = twoWeekHint + groups.map(g => {
      const dateTitle = formatDateGroupTitle(g.date);
      const itemsHtml = g.items.map(e => {
        const { title, note } = splitExpenseTitleAndNote(e.description, e.note);
        const canEdit = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;
        const isXcur = isXcurStr(e.description) || isXcurStr(e.note);
        const xcurId = isXcur ? (extractXcurId(e.description) || extractXcurId(e.note)) : null;
        const isAiSplit = Boolean((e.description && (e.description.includes("<!--AI_RECEIPT_DATA:") || e.description.includes("(AI自動拆單)") || e.description.includes("📋 品項明細"))) || (e.note && e.note.includes("<!--AI_RECEIPT_DATA:")));
        const catMeta = (window.getCategoryMeta && window.getCategoryMeta(title || e.description, e.note, e.category)) || { icon: "🧾", type: "general", name: "一般" };
        const icon = catMeta.icon;
        const payerNames = (e.payers || []).map(p => escapeHtml(memberById[p.member_id] || "?")).join("、");
        const shareNames = (e.shares || []).map(s => escapeHtml(memberById[s.member_id] || "?")).join("、");
        const shareAvatars = (e.shares || []).slice(0, 4).map(s => renderAvatarHTML({ id: s.member_id, name: memberById[s.member_id] }, "avatar-xs")).join("");
        const shareMore = (e.shares || []).length > 4 ? `<span class="avatar-stack-more">+${(e.shares || []).length - 4}</span>` : "";
        const firstLineNote = note ? note.split("\n")[0].trim() : "";
        return `<div class="exp-item" data-id="${e.id}" title="點擊查看本項目的債務關係表與品項明細">
          <div class="exp-cat-badge exp-cat-${catMeta.type}" title="${catMeta.name}">${icon}</div>
          <div class="exp-main">
            <div class="exp-desc">${escapeHtml(title)}${isAiSplit ? '<span class="ai-split-badge" style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;background:color-mix(in srgb, var(--btn-primary) 14%, var(--paper));color:var(--btn-primary);margin-left:5px;">🤖 AI 拆單</span>' : ""}${isXcur ? '<span class="xcur-badge">💱 跨幣轉入</span>' : ""}</div>
            <div class="exp-meta">
              ${firstLineNote ? `<span class="exp-meta-line" style="color:var(--ink);font-weight:600;opacity:0.9;">📝 備註：${escapeHtml(firstLineNote.length > 40 ? firstLineNote.slice(0, 38) + "…" : firstLineNote)}</span>` : ""}
              <span class="exp-meta-line">時間：${e.expense_date}${formatTime(e.created_at, e.expense_date) ? " " + formatTime(e.created_at, e.expense_date) : ""}（${escapeHtml(memberById[e.created_by] || "?")}）</span>
              <span class="exp-meta-line">付款：${payerNames || "—"}</span>
              <span class="exp-meta-line">應付：${shareNames || "—"}</span>
            </div>
          </div>
          <div class="exp-right">
            <div class="exp-amt">${SYM}${formatAmt(e.amount)}${conversionHint(e.amount)}</div>
            ${canEdit ? `<div class="exp-actions">${isXcur ? `${xcurId ? `<button class="exp-xcur-editrate" data-xcur="${xcurId}" title="編輯匯率" aria-label="編輯匯率">✎</button>` : ""}<button class="exp-del exp-xcur-restore" data-id="${e.id}" title="還原這筆跨幣別轉移" aria-label="還原">↺</button>` : `<button class="exp-edit" data-id="${e.id}" title="編輯">✎</button><button class="exp-del" data-id="${e.id}" title="刪除">✕</button>`}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      return `
        <div class="exp-date-group">
          <div class="exp-date-group-header">
            <div class="exp-date-group-title">📅 ${dateTitle}</div>
            <div class="exp-date-group-badge">
              <span class="badge-count">${g.items.length} 筆</span>
              <span class="badge-sep">·</span>
              <span class="badge-subtotal">當日小計 <b>${SYM}${formatAmt(g.total)}</b></span>
            </div>
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
        if(!exp) return;
        await deleteRowsWithUndo("expenses", exp, refreshExpenses, getFirstLineDesc(exp.description, exp.note));
      });
    });
    el.querySelectorAll(".exp-edit").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        const exp = expenseById[btn.dataset.id];
        if(exp) startEditExpense(exp);
      });
    });
    el.querySelectorAll(".exp-xcur-editrate").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        openXcurRateEditModal(btn.dataset.xcur);
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
          const xcurId = isXcur ? (a.offset_group || extractXcurId(a.note)) : null;
          return `<div class="exp-item">
            <div class="exp-cat-badge" style="background:color-mix(in srgb, #5C7CFA 12%, var(--card));">🔄</div>
            <div class="exp-main">
              <div class="exp-desc">${escapeHtml(memberById[a.from_member] || "?")} ↔ ${escapeHtml(memberById[a.to_member] || "?")} 互相抵銷${isXcur ? '<span class="xcur-badge">💱 轉為臺幣</span>' : ""}</div>
              <div class="exp-meta">紀錄時間：${a.payment_date}${formatTime(a.created_at, a.payment_date) ? " " + formatTime(a.created_at, a.payment_date) : ""}（${escapeHtml(memberById[a.created_by] || "?")}）</div>
            </div>
            <div class="exp-right">
              <div class="exp-amt">${SYM}${formatAmt(a.amount)}${conversionHint(a.amount)}</div>
              ${canEdit ? `<div class="exp-actions">${(isXcur && xcurId) ? `<button class="exp-xcur-editrate" data-xcur="${xcurId}" title="編輯匯率" aria-label="編輯匯率">✎</button>` : ""}<button class="exp-del exp-del-group ${isXcur ? "exp-xcur-restore" : ""}" data-group="${a.offset_group}" title="${isXcur ? "還原跨幣別轉移" : "刪除這組抵銷"}" aria-label="${isXcur ? "還原" : "刪除"}">${isXcur ? "↺" : "✕"}</button></div>` : ""}
            </div>
          </div>`;
        }
        const r = u.items[0];
        const canEdit = isRepaymentParty(r, myMember.id) || r.created_by === myMember.id;
        const isXcur = isXcurStr(r.note) || isXcurStr(r.offset_group);
        const xcurId = isXcur ? (r.offset_group || extractXcurId(r.note)) : null;
        const cleanNote = cleanXcurText(r.note);
        return `<div class="exp-item">
          <div class="exp-cat-badge" style="background:color-mix(in srgb, #40C057 12%, var(--card));">💸</div>
          <div class="exp-main">
            <div class="exp-desc">${escapeHtml(memberById[r.from_member] || "?")} 還 ${escapeHtml(memberById[r.to_member] || "?")}${isXcur ? '<span class="xcur-badge">💱 轉為臺幣</span>' : ""}</div>
            <div class="exp-meta">紀錄時間：${r.payment_date}${formatTime(r.created_at, r.payment_date) ? " " + formatTime(r.created_at, r.payment_date) : ""}（${escapeHtml(memberById[r.created_by] || "?")}）${cleanNote ? " ・ " + escapeHtml(cleanNote) : ""}</div>
          </div>
          <div class="exp-right">
            <div class="exp-amt">${SYM}${formatAmt(r.amount)}${conversionHint(r.amount)}</div>
            ${canEdit ? `<div class="exp-actions">${isXcur ? `${xcurId ? `<button class="exp-xcur-editrate" data-xcur="${xcurId}" title="編輯匯率" aria-label="編輯匯率">✎</button>` : ""}<button class="exp-del exp-xcur-restore" data-id="${r.id}" title="還原這筆跨幣別轉移" aria-label="還原">↺</button>` : `<button class="exp-edit" data-id="${r.id}" title="編輯">✎</button><button class="exp-del" data-id="${r.id}" title="刪除">✕</button>`}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      return `
        <div class="exp-date-group">
          <div class="exp-date-group-header">
            <div class="exp-date-group-title">📅 ${dateTitle}</div>
            <div class="exp-date-group-badge">
              <span class="badge-count">${g.units.length} 筆</span>
              <span class="badge-sep">·</span>
              <span class="badge-subtotal">當日小計 <b>${SYM}${formatAmt(g.total)}</b></span>
            </div>
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
    el.querySelectorAll(".exp-xcur-editrate").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        openXcurRateEditModal(btn.dataset.xcur);
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
        if(!r) return;
        const label = `${memberById[r.from_member] || "?"} → ${memberById[r.to_member] || "?"}`;
        await deleteRowsWithUndo("repayments", r, refreshExpenses, label);
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
        const groupRows = cachedRepayments.filter(x => x.offset_group === group);
        if(!groupRows.length) return;
        await deleteRowsWithUndo("repayments", groupRows, refreshExpenses, "抵銷紀錄");
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

  // 金額直接印在長條正上方（欠款）或正下方（還款），不用再點一下才看得到。
  function renderFlowChart(data){
    const wrap = document.getElementById("spendChartWrap");
    if(!wrap) return;
    if(!data.some(d => d.owe > 0 || d.received > 0)){
      wrap.innerHTML = `<p class="filter-hint">這段時間沒有跟你相關的支出或還款</p>`;
      return;
    }
    const max = Math.max(1, ...data.map(d => Math.max(d.owe, d.received)));
    const w = 320, padTop = 14, halfH = 34, downLabelGap = 14, dateLabelGap = 22, gap = 14;
    const midY = padTop + halfH;
    const h = midY + halfH + downLabelGap + dateLabelGap;
    const barW = (w - gap * (data.length + 1)) / data.length;
    const bars = data.map((d, i)=>{
      const x = gap + i * (barW + gap);
      const cx = x + barW / 2;
      const upH = d.owe > 0 ? Math.max(3, Math.round((d.owe / max) * halfH)) : 0;
      const downH = d.received > 0 ? Math.max(3, Math.round((d.received / max) * halfH)) : 0;
      const upLabel = d.owe > 0
        ? `<text x="${cx.toFixed(1)}" y="${(midY - upH - 5).toFixed(1)}" text-anchor="middle" class="flow-amt-label up">-${formatAmt(d.owe)}</text>`
        : "";
      const downLabel = d.received > 0
        ? `<text x="${cx.toFixed(1)}" y="${(midY + downH + downLabelGap).toFixed(1)}" text-anchor="middle" class="flow-amt-label down">+${formatAmt(d.received)}</text>`
        : "";
      return `<rect x="${x.toFixed(1)}" y="${(midY - upH).toFixed(1)}" width="${barW.toFixed(1)}" height="${upH}" rx="3" class="flow-bar-up"></rect>
        <rect x="${x.toFixed(1)}" y="${midY}" width="${barW.toFixed(1)}" height="${downH}" rx="3" class="flow-bar-down"></rect>
        ${upLabel}
        ${downLabel}
        <text x="${cx.toFixed(1)}" y="${h - 4}" text-anchor="middle" class="spend-bar-label">${d.label}</text>`;
    }).join("");
    wrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="spend-chart" role="img" aria-label="跟我有關的欠款與還款趨勢">
      <line x1="0" y1="${midY}" x2="${w}" y2="${midY}" class="flow-zero-line"/>
      ${bars}
    </svg>
    <div class="flow-chart-legend"><span class="legend-up">■ 我的欠款</span><span class="legend-down">■ 已收還款</span></div>`;
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
  async function renderBalances(expenses, repayments, preFetchedBalances){
    const { data: balRows, error: balError } = preFetchedBalances || await sb.rpc("member_balances", { p_since: null });
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
    renderCategoryDonutChart(expenses);

    // 這兩個畫面用的是同一份債務資料，算一次共用，不用各自重算一遍
    // buildDebtMatrix()（要重新掃過全部支出/還款，資料一多會是浪費）。
    const owedForRender = buildDebtMatrix(expenses, repayments);
    renderSettlement(expenses, repayments, owedForRender);
    renderDebtMatrix(expenses, repayments, owedForRender);
  }

  // ==========================================================
  // 🍩 花費類別分佈甜甜圈圖 (Category Donut Chart)
  // ==========================================================
  let donutScope = "all"; // "all" | "my"
  let donutTimeRange = "all"; // "all" | "week" | "month" | "year" | "custom"

  // 依「近一週/近一月/近一年」算出 YYYY-MM-DD 起始日；自訂區間則讀兩個
  // date input 的值。跟支出歷史篩選（filterFrom/filterTo）用同一套字串
  // 比對方式（expense_date 本來就是 YYYY-MM-DD，字串排序＝時間排序）。
  function getDonutDateBounds(){
    const todayStr = new Date().toISOString().slice(0, 10);
    if(donutTimeRange === "week"){
      const d = new Date(); d.setDate(d.getDate() - 7);
      return { from: d.toISOString().slice(0, 10), to: todayStr };
    }
    if(donutTimeRange === "month"){
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return { from: d.toISOString().slice(0, 10), to: todayStr };
    }
    if(donutTimeRange === "year"){
      const d = new Date(); d.setFullYear(d.getFullYear() - 1);
      return { from: d.toISOString().slice(0, 10), to: todayStr };
    }
    if(donutTimeRange === "custom"){
      const fromEl = document.getElementById("donutCustomFrom");
      const toEl = document.getElementById("donutCustomTo");
      return { from: fromEl ? fromEl.value : "", to: toEl ? toEl.value : "" };
    }
    return { from: "", to: "" }; // all
  }

  function renderCategoryDonutChart(expenses){
    const wrap = document.getElementById("categoryDonutWrap");
    if(!wrap) return;
    let expList = expenses || chartExpensesCache || [];
    const { from, to } = getDonutDateBounds();
    if(from) expList = expList.filter(e => e.expense_date >= from);
    if(to) expList = expList.filter(e => e.expense_date <= to);
    if(!expList.length){
      wrap.innerHTML = `<p class="filter-hint">這段時間沒有任何支出紀錄</p>`;
      return;
    }

    const myId = myMember && myMember.id;
    const filteredExp = donutScope === "my"
      ? expList.filter(e => (e.shares || []).some(s => s.member_id === myId))
      : expList;

    if(!filteredExp.length){
      wrap.innerHTML = `<p class="filter-hint">${donutScope === "my" ? "目前沒有跟你相關的支出" : "目前沒有支出紀錄"}</p>`;
      return;
    }

    const catMap = {};
    let totalAmt = 0;

    filteredExp.forEach(e => {
      const meta = (window.getCategoryMeta && window.getCategoryMeta(e.description, e.note, e.category)) || { icon: "🧾", name: "一般支出", type: "general", color: "#868E96" };
      let amt = 0;
      if(donutScope === "my"){
        const myShare = (e.shares || []).find(s => s.member_id === myId);
        amt = myShare ? (Number(myShare.amount) || 0) : 0;
      } else {
        amt = Number(e.amount) || 0;
      }
      if(amt > 0.01){
        totalAmt += amt;
        if(!catMap[meta.type]){
          catMap[meta.type] = {
            type: meta.type,
            name: meta.name,
            icon: meta.icon,
            color: meta.color || "#868E96",
            amount: 0,
            count: 0
          };
        }
        catMap[meta.type].amount += amt;
        catMap[meta.type].count += 1;
      }
    });

    const catList = Object.values(catMap).sort((a, b) => b.amount - a.amount);
    if(!catList.length || totalAmt <= 0.01){
      wrap.innerHTML = `<p class="filter-hint">尚無有效支出金額</p>`;
      return;
    }

    // SVG 圓餅甜甜圈圖計算
    const size = 180;
    const cx = size / 2, cy = size / 2;
    const r = 68;
    const strokeWidth = 22;
    const circumference = 2 * Math.PI * r;

    let accumulatedPct = 0;
    const paths = catList.map((cat) => {
      const pct = cat.amount / totalAmt;
      const strokeDasharray = `${(pct * circumference).toFixed(2)} ${(circumference * (1 - pct)).toFixed(2)}`;
      const strokeDashoffset = (-accumulatedPct * circumference).toFixed(2);
      accumulatedPct += pct;

      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cat.color}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}" class="donut-slice" data-type="${cat.type}" data-name="${escapeHtml(cat.name)}" data-icon="${cat.icon}" data-color="${cat.color}" data-amt="${formatAmt(cat.amount)}" data-pct="${(pct * 100).toFixed(1)}" data-count="${cat.count}"></circle>`;
    }).join("");

    const legendHtml = catList.map(cat => {
      const pct = ((cat.amount / totalAmt) * 100).toFixed(1);
      return `
        <div class="donut-legend-item" data-type="${cat.type}" data-name="${escapeHtml(cat.name)}" data-icon="${cat.icon}" data-color="${cat.color}" data-amt="${formatAmt(cat.amount)}" data-pct="${pct}" data-count="${cat.count}">
          <div class="donut-legend-left">
            <span class="donut-legend-dot" style="background:${cat.color};"></span>
            <span class="donut-legend-icon">${cat.icon}</span>
            <span class="donut-legend-name">${escapeHtml(cat.name)}</span>
          </div>
          <div class="donut-legend-right">
            <span class="donut-legend-amt">${SYM}${formatAmt(cat.amount)}</span>
            <span class="donut-legend-pct">${pct}%</span>
          </div>
        </div>
      `;
    }).join("");

    wrap.innerHTML = `
      <div class="donut-main-row">
        <div class="donut-svg-wrap">
          <svg viewBox="0 0 ${size} ${size}" class="donut-svg">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}"></circle>
            ${paths}
          </svg>
          <div class="donut-center-info" id="donutCenterInfo">
            <span class="donut-center-label">${donutScope === "my" ? "我的支出" : "全團總額"}</span>
            <span class="donut-center-amt">${SYM}${formatAmt(totalAmt)}</span>
            <span class="donut-center-sub">${catList.length} 類別</span>
          </div>
        </div>
        <div class="donut-legend-list">
          ${legendHtml}
        </div>
      </div>
    `;

    // 綁定互動事件：懸停或點擊切換中心資訊
    wrap.querySelectorAll(".donut-slice, .donut-legend-item").forEach(item => {
      const type = item.dataset.type;
      const cat = catList.find(c => c.type === type);
      if(!cat) return;

      const showCat = () => {
        const centerInfo = document.getElementById("donutCenterInfo");
        if(centerInfo){
          const pct = ((cat.amount / totalAmt) * 100).toFixed(1);
          centerInfo.innerHTML = `
            <span class="donut-center-label">${cat.icon} ${escapeHtml(cat.name)}</span>
            <span class="donut-center-amt" style="color:${cat.color}">${SYM}${formatAmt(cat.amount)}</span>
            <span class="donut-center-sub">${pct}% · 共 ${cat.count} 筆</span>
          `;
        }
        wrap.querySelectorAll(".donut-legend-item").forEach(el => el.classList.toggle("active", el.dataset.type === type));
      };

      const resetCat = () => {
        const centerInfo = document.getElementById("donutCenterInfo");
        if(centerInfo){
          centerInfo.innerHTML = `
            <span class="donut-center-label">${donutScope === "my" ? "我的支出" : "全團總額"}</span>
            <span class="donut-center-amt">${SYM}${formatAmt(totalAmt)}</span>
            <span class="donut-center-sub">${catList.length} 類別</span>
          `;
        }
        wrap.querySelectorAll(".donut-legend-item").forEach(el => el.classList.remove("active"));
      };

      item.addEventListener("mouseenter", showCat);
      item.addEventListener("mouseleave", resetCat);
      item.addEventListener("click", ()=>{
        showCat();
        showCategoryExpensesModal(cat.type, cat.name, cat.icon, cat.color);
      });
    });
  }

  // ---------- 類別支出明細視窗 (Category Detail Modal) ----------
  function showCategoryExpensesModal(catType, catName, catIcon, catColor){
    const modal = document.getElementById("categoryExpensesModal");
    if(!modal) return;

    const myId = myMember && myMember.id;
    let expList = (cachedExpenses && cachedExpenses.length) ? cachedExpenses : (chartExpensesCache || []);
    const { from: catFrom, to: catTo } = getDonutDateBounds();
    if(catFrom) expList = expList.filter(e => e.expense_date >= catFrom);
    if(catTo) expList = expList.filter(e => e.expense_date <= catTo);
    const isMyScope = donutScope === "my";

    // 篩選出該類別的支出紀錄（依日期新到舊排序）
    const matchingExpenses = expList.filter(e => {
      const meta = (window.getCategoryMeta && window.getCategoryMeta(e.description, e.note, e.category)) || { type: "general" };
      if(meta.type !== catType) return false;
      if(isMyScope){
        return (e.shares || []).some(s => s.member_id === myId);
      }
      return true;
    }).sort((a, b) => (b.expense_date || "").localeCompare(a.expense_date || "") || (b.created_at || "").localeCompare(a.created_at || ""));

    // 計算該類別總額
    let catTotal = 0;
    matchingExpenses.forEach(e => {
      if(isMyScope){
        const myShare = (e.shares || []).find(s => s.member_id === myId);
        catTotal += myShare ? (Number(myShare.amount) || 0) : 0;
      } else {
        catTotal += Number(e.amount) || 0;
      }
    });

    // 更新 Header
    const iconEl = document.getElementById("catModalIcon");
    const nameEl = document.getElementById("catModalName");
    const subEl = document.getElementById("catModalSub");
    if(iconEl) iconEl.textContent = catIcon || "🧾";
    if(nameEl) nameEl.textContent = catName || "類別支出";
    if(subEl) subEl.textContent = `${isMyScope ? "我的支出" : "全團支出"} · 共 ${matchingExpenses.length} 筆 · ${SYM}${formatAmt(catTotal)}`;

    const listEl = document.getElementById("catModalList");
    if(listEl){
      if(!matchingExpenses.length){
        listEl.innerHTML = emptyStateHTML("📭", "暫無支出紀錄", "此類別目前沒有任何支出紀錄。");
      } else {
        listEl.innerHTML = matchingExpenses.map(e => {
          const { title, note } = splitExpenseTitleAndNote(e.description, e.note);
          const formattedTime = formatTime(e.created_at, e.expense_date);
          const dateStr = e.expense_date + (formattedTime ? " " + formattedTime : "");

          const payers = e.payers || [];
          const shares = e.shares || [];

          // 付款人：只出現氣泡頭貼
          const payersAvatarsHtml = payers.map(p => {
            const m = (memberRows || activeMembers || []).find(mem => mem.id === p.member_id) || { id: p.member_id, name: (memberById && memberById[p.member_id]) || "成員" };
            return `<span class="cat-exp-avatar-bubble" title="付款人: ${escapeHtml(m.name)}${payers.length > 1 ? ` (${SYM}${formatAmt(p.amount)})` : ''}">${renderAvatarHTML(m, "avatar-xs")}</span>`;
          }).join("");

          // 應付人：只出現氣泡頭貼
          const sharesAvatarsHtml = shares.map(s => {
            const m = (memberRows || activeMembers || []).find(mem => mem.id === s.member_id) || { id: s.member_id, name: (memberById && memberById[s.member_id]) || "成員" };
            const isMe = s.member_id === myId;
            return `<span class="cat-exp-avatar-bubble ${isMe ? 'is-me' : ''}" title="應付人: ${escapeHtml(m.name)}${isMe ? ' (我)' : ''}${shares.length > 1 ? ` (${SYM}${formatAmt(s.amount)})` : ''}">${renderAvatarHTML(m, "avatar-xs")}</span>`;
          }).join("");

          let myShareBadge = "";
          const myShare = shares.find(s => s.member_id === myId);
          if(myShare && Number(myShare.amount) > 0){
            myShareBadge = `<div class="cat-exp-my-share">我分攤 ${SYM}${formatAmt(myShare.amount)}</div>`;
          }

          return `
            <div class="cat-exp-card" data-id="${e.id}">
              <div class="cat-exp-card-top">
                <div class="cat-exp-info-col">
                  <div class="cat-exp-date"><span class="cat-exp-date-icon">📅</span> ${dateStr}</div>
                  <div class="cat-exp-title">${escapeHtml(title)}</div>
                </div>
                <div class="cat-exp-amt-col">
                  <div class="cat-exp-total-amt">${SYM}${formatAmt(e.amount)}</div>
                  ${myShareBadge}
                </div>
              </div>
              <div class="cat-exp-card-bottom">
                <div class="cat-exp-avatar-row">
                  <span class="cat-exp-row-label">💳 付款</span>
                  <div class="cat-exp-avatar-stack">${payersAvatarsHtml || "—"}</div>
                </div>
                <div class="cat-exp-avatar-row">
                  <span class="cat-exp-row-label">👥 應付</span>
                  <div class="cat-exp-avatar-stack">${sharesAvatarsHtml || "—"}</div>
                </div>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // 關閉其他可能開啟中的彈窗
    document.querySelectorAll(".calc-modal.show, .modal.show").forEach(m => {
      if(m !== modal) m.classList.remove("show");
    });

    modal.classList.add("show");
  }

  const catModalCloseBtn = document.getElementById("catModalCloseBtn");
  if(catModalCloseBtn){
    catModalCloseBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const modal = document.getElementById("categoryExpensesModal");
      if(modal) modal.classList.remove("show");
    });
  }
  const donutScopeTabs = document.getElementById("donutScopeTabs");
  if(donutScopeTabs){
    donutScopeTabs.querySelectorAll(".donut-scope-tab").forEach(tab => {
      tab.addEventListener("click", ()=>{
        donutScopeTabs.querySelectorAll(".donut-scope-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        donutScope = tab.dataset.scope || "all";
        renderCategoryDonutChart(chartExpensesCache);
      });
    });
  }

  // ---- 花費類別分佈：時間區間篩選（全部/近一週/近一月/近一年/自訂）----
  const donutTimeRangeBtn = document.getElementById("donutTimeRangeBtn");
  const donutTimeRangeMenu = document.getElementById("donutTimeRangeMenu");
  const donutTimeRangeText = document.getElementById("donutTimeRangeText");
  const donutCustomRangeRow = document.getElementById("donutCustomRangeRow");
  const donutCustomFrom = document.getElementById("donutCustomFrom");
  const donutCustomTo = document.getElementById("donutCustomTo");
  if(donutTimeRangeBtn && donutTimeRangeMenu){
    donutTimeRangeBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const willOpen = donutTimeRangeMenu.classList.contains("hidden");
      donutTimeRangeMenu.classList.toggle("hidden", !willOpen);
      donutTimeRangeBtn.classList.toggle("open", willOpen);
    });
    donutTimeRangeMenu.querySelectorAll(".chart-gran-option").forEach(opt=>{
      opt.addEventListener("click", ()=>{
        donutTimeRange = opt.dataset.value;
        donutTimeRangeText.textContent = opt.textContent;
        donutTimeRangeMenu.querySelectorAll(".chart-gran-option").forEach(o => o.classList.remove("active"));
        opt.classList.add("active");
        donutTimeRangeMenu.classList.add("hidden");
        donutTimeRangeBtn.classList.remove("open");
        if(donutCustomRangeRow) donutCustomRangeRow.classList.toggle("hidden", donutTimeRange !== "custom");
        renderCategoryDonutChart(chartExpensesCache);
      });
    });
    document.addEventListener("click", (e)=>{
      if(!donutTimeRangeMenu.classList.contains("hidden") && !donutTimeRangeMenu.contains(e.target) && e.target !== donutTimeRangeBtn){
        donutTimeRangeMenu.classList.add("hidden");
        donutTimeRangeBtn.classList.remove("open");
      }
    });
  }
  if(donutCustomFrom) donutCustomFrom.addEventListener("change", () => renderCategoryDonutChart(chartExpensesCache));
  if(donutCustomTo) donutCustomTo.addEventListener("change", () => renderCategoryDonutChart(chartExpensesCache));

  function renderSettlement(expenses, repayments, owed){
    // 跟債務關係表用同一份資料（buildDebtMatrix），
    // 「建議還款方式」的數字才會跟表格上的一致。呼叫端通常已經算好一份
    // 共用傳進來（見下面呼叫處），這裡就不用把所有支出/還款再重算一次；
    // 沒傳的話（保留給其他呼叫方式相容）才自己算。
    owed = owed || buildDebtMatrix(expenses, repayments);
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

// 支出跟還款依實際發生時間排成同一條時間軸，一筆一筆重演：一筆支出發生的
// 當下才會被之後的還款拿去沖銷，不能反過來讓「之後才發生」的支出去彌補
// 「之前就已經多還」的錢。這樣算出來的結果才會跟「債務明細」的往來紀錄
// 時間軸完全一致——同一對人之間如果同時出現雙方互欠（例如提早多還、後來
// 又欠了新的），不會自動幫你合併成一個淨數字，而是誠實地各自列出來，交給
// 「一鍵抵銷」處理。
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

  const events = [];

  expenses.forEach(e=>{
    const debts = computeExpenseDebts(e);
    Object.keys(debts).forEach(creditorId=>{
      Object.keys(debts[creditorId]).forEach(debtorId=>{
        events.push({
          type: "expense",
          creditorId,
          debtorId,
          amount: debts[creditorId][debtorId],
          date: e.expense_date || "",
          createdAt: e.created_at || ""
        });
      });
    });
  });

  (repayments || []).forEach(r=>{
    const payerId = r.from_member;
    const receiverId = r.to_member;
    const amount = Number(r.amount) || 0;
    if(!payerId || !receiverId || payerId === receiverId || amount <= 0.01) return;
    events.push({
      type: "repayment",
      payerId,
      receiverId,
      amount,
      date: r.payment_date || "",
      createdAt: r.created_at || ""
    });
  });

  // 依實際發生時間正序排列（舊到新；同一天同時刻時，支出先於還款發生）
  events.sort((a, b) => {
    const timeA = a.createdAt || (a.date ? a.date + "T00:00:00.000Z" : "");
    const timeB = b.createdAt || (b.date ? b.date + "T00:00:00.000Z" : "");
    if(timeA && timeB && timeA !== timeB) return timeA.localeCompare(timeB);
    const dA = a.date || "", dB = b.date || "";
    if(dA !== dB) return dA.localeCompare(dB);
    const aIsExp = a.type === "expense" ? 0 : 1;
    const bIsExp = b.type === "expense" ? 0 : 1;
    return aIsExp - bIsExp;
  });

  events.forEach(ev=>{
    if(ev.type === "expense"){
      addDebt(ev.creditorId, ev.debtorId, ev.amount);
      return;
    }

    const payerId = ev.payerId;
    const receiverId = ev.receiverId;
    let remaining = ev.amount;

    const receiverDebts = owed[receiverId] || (owed[receiverId] = {});
    const current = receiverDebts[payerId] || 0;
    const paid = Math.min(current, remaining);
    if(paid > 0){
      receiverDebts[payerId] = current - paid;
      if(receiverDebts[payerId] <= 0.01) delete receiverDebts[payerId];
      remaining -= paid;
    }
    // 這筆還款發生的當下，能沖銷的欠款就這麼多，沖不完、多還的部分反過來
    // 記一筆「receiver 欠 payer」——這代表事後編輯把支出改小、或本來就
    // 多還了，都是真實的溢繳，不是錯誤，維持這個行為。
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
  repayments,
  owed
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
  // 取得債務資料（呼叫端通常已經算好一份共用傳進來，跟 renderSettlement()
  // 是同一份資料，不用每次重新整理都把所有支出/還款再算一次；沒傳的話
  // 才自己算，保留給其他呼叫方式相容）
  // ----------------------------------------------------------

  owed = owed || buildDebtMatrix(
    expenses,
    repayments
  );


  const allIds =
    memberRows.map(
      m => m.id
    );

  // 欄位順序把自己排在第一個，一打開就先看到跟自己有關的那一行/列，
  // 不用先掃過其他人才找到自己。
  //
  // 這裡不能只用「排到第一個」處理：設定裡「顯示已退出／已銷毀成員」
  // 這個偏好關掉時，memberRows 會把已退出的成員整個濾掉——如果剛好
  // 我自己這筆成員紀錄也標了已退出（loadMembers() 找不到還在啟用中的
  // 那筆時會退而求其次抓到這筆），我就會直接從 allIds 裡消失，債務
  // 關係表變成完全看不到自己的欠款。這是「要不要顯示其他人」的顯示
  // 偏好，不該連自己的欠款都跟著藏起來，所以自己一定要強制留著。
  // owed 本身是直接從支出/還款原始紀錄算出來的（見 buildDebtMatrix()），
  // 不受 memberRows 篩選影響，所以就算自己不在 memberRows 裡，補回來
  // 一樣抓得到正確的欠款金額。
  if(myMember && myMember.id){
    const meIdx = allIds.indexOf(myMember.id);
    if(meIdx === -1){
      allIds.unshift(myMember.id);
    } else if(meIdx > 0){
      allIds.splice(meIdx, 1);
      allIds.unshift(myMember.id);
    }
  }

  // 「只看跟我相關」：把矩陣縮到只剩我自己，以及跟我之間有欠款往來
  // （不管我欠他還是他欠我）的人，人數多的群組不用面對一大片空格子。
  let ids = allIds;
  if(matrixShowOnlyMine && myMember && myMember.id){
    const relatedIds = new Set([myMember.id]);
    allIds.forEach(otherId => {
      if(otherId === myMember.id) return;
      const oweMe = (owed[myMember.id] && owed[myMember.id][otherId]) || 0;
      const iOwe = (owed[otherId] && owed[otherId][myMember.id]) || 0;
      if(oweMe > 0.05 || iOwe > 0.05) relatedIds.add(otherId);
    });
    ids = allIds.filter(id => relatedIds.has(id));
  }

  // 熱圖用：找出整張表裡金額最大的一格，其他格子的顏色都相對這個最大值
  // 算比例，才能做出「越紅欠越多」這種連續漸層，而不是只有幾檔固定深淺。
  let maxDebtAmount = 0;
  ids.forEach(c => {
    ids.forEach(d => {
      if(c === d) return;
      const amt = (owed[c] && owed[c][d]) || 0;
      if(amt > maxDebtAmount) maxDebtAmount = amt;
    });
  });
  // 單一玫瑰紅色系（跟 app 其他地方「欠款=紅/粉紅」的既定配色語言一致，
  // 例如 balance-chip.is-owe、刪除按鈕 hover），只用深淺表示金額比例，不
  // 摻黃色。文字不跟著底色深淺算同一色相，統一用白字或深紅字兩檔，跟
  // 色塊深淺分開處理，數字才會一直清楚。參數算法抽到 debtHeatParams()，
  // 跟匯出圖片（renderSettlementImageCanvas）共用同一份，兩邊顏色才會
  // 永遠對得起來。
  function debtHeatStyle(amount){
    const p = debtHeatParams(amount, maxDebtAmount, isSettlementDarkTheme());
    const bg = `color-mix(in srgb, hsl(${p.hue}, 82%, ${p.bgLightness}%) ${p.bgPct.toFixed(0)}%, var(--card))`;
    return `background:${bg};color:${p.fg};font-weight:${p.fontWeight};`;
  }


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
                ' style="' + debtHeatStyle(amount) + '"' +
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

            // 沒有欠款不代表這兩人之間從來沒有往來——已結清的舊紀錄還是
            // 看得到，所以這格還是要能點開查看，只是不顯示數字而已。
            tbody +=
              '<td class="matrix-cell matrix-cell-settled"' +
                ' data-creditor="' +
                creditorId +
                '"' +
                ' data-debtor="' +
                debtorId +
                '"' +
                ' title="' +
                escapeHtml(debtorFullName) +
                ' 與 ' +
                escapeHtml(creditorFullName) +
                ' 已結清"' +
              '></td>';

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

  if(typeof syncMatrixFilterMeBtn === "function") syncMatrixFilterMeBtn();


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
    // 實際寬度對不上，導致固定欄跟旁邊的欄位中間出現一道縫。單次補量（字型
    // 載完後再量一次）遇到表格當下還隱藏在未顯示的分頁/區塊裡（量到 0 或
    // 舊值）時還是會量不準，改用 ResizeObserver 持續監看這一格的實際寬度，
    // 不管是字型換裝、分頁切換顯示、視窗縮放，寬度一變就重新同步，才不會
    // 卡在錯的寬度上一直到下次重新渲染整張表。
    if(window.ResizeObserver){
      if(col1Cell._matrixCol1Observer) col1Cell._matrixCol1Observer.disconnect();
      const ro = new ResizeObserver(syncCol1Width);
      ro.observe(col1Cell);
      col1Cell._matrixCol1Observer = ro;
    } else if(document.fonts && document.fonts.ready){
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
      ".has-debt, .matrix-cell-settled"
    )
    .forEach(cell=>{

      cell.addEventListener(
        "click",
        ()=>{

          showPairDetail(
            cell.dataset.debtor,
            cell.dataset.creditor,
            expenses,
            repayments,
            owed
          );

        }
      );

    });

}

// ==========================================================
// 債務關係表：只看跟我相關 / 完整矩陣 切換
// ==========================================================
const matrixFilterMeBtn = document.getElementById("matrixFilterMeBtn");
if(matrixFilterMeBtn){
  matrixFilterMeBtn.addEventListener("click", ()=>{
    matrixShowOnlyMine = !matrixShowOnlyMine;
    localStorage.setItem(MATRIX_SHOW_ONLY_MINE_KEY, matrixShowOnlyMine ? "1" : "0");
    if(cachedExpenses && cachedRepayments) renderDebtMatrix(cachedExpenses, cachedRepayments);
  });
}
function syncMatrixFilterMeBtn(){
  if(!matrixFilterMeBtn) return;
  const textEl = document.getElementById("matrixFilterMeBtnText");
  matrixFilterMeBtn.classList.toggle("active", matrixShowOnlyMine);
  if(textEl) textEl.textContent = matrixShowOnlyMine ? "🔗 查看完整矩陣" : "👤 只看跟我相關";
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

// ==========================================================
// 匯出結算清單圖片——用 Canvas 直接畫一張好看的卡片，不用截圖，
// 方便直接分享到 LINE / 訊息軟體。固定用深紫色漸層（跟登入頁同一套
// 視覺語言），不受檢視者當下淺色/深色模式影響，分享出去的圖永遠一致。
// ==========================================================
function settlementCanvasRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function settlementCanvasTruncate(ctx, text, maxWidth){
  if(ctx.measureText(text).width <= maxWidth) return text;
  for(let len = text.length - 1; len > 0; len--){
    const candidate = text.slice(0, len) + "…";
    if(ctx.measureText(candidate).width <= maxWidth) return candidate;
  }
  return "…";
}

// 「債權人」／「債務人」直排文字：每個字各自置中、由上往下疊，不是把整串字
// 橫著轉 90 度（那樣字會變成橫躺、要側著頭看）。cx 是這一欄的水平中心，
// zoneTop/zoneH 是這個字要置中擺放的那個區塊的上緣與高度。
function drawSettlementVerticalLabel(ctx, text, cx, zoneTop, zoneH, font){
  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = text.split("");
  const lineH = 16;
  const totalH = chars.length * lineH;
  let y = zoneTop + zoneH / 2 - totalH / 2 + lineH / 2;
  chars.forEach(ch => {
    ctx.fillText(ch, cx, y);
    y += lineH;
  });
  ctx.restore();
}

// 匯出圖片要不要用暗色卡片，跟著目前實際套用的深色/淺色模式走（theme.js
// 設在 <html data-theme="dark|light">），不要固定死用某一種，不然淺色模式
// 底下產生出來的圖片顏色會跟使用者當下看到的畫面不一致。
function isSettlementDarkTheme(){
  const attr = document.documentElement.getAttribute("data-theme");
  if(attr === "dark") return true;
  if(attr === "light") return false;
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

// 債務關係表熱圖顏色公式：網頁版（debtHeatStyle）跟匯出圖片
// （renderSettlementImageCanvas）共用同一份參數計算，只有輸出格式不同
// （CSS color-mix 字串 vs. canvas 算好的 rgb() 字串），顏色才會永遠一致。
function debtHeatParams(amount, maxDebtAmount, isDark){
  const ratio = maxDebtAmount > 0 ? Math.min(1, amount / maxDebtAmount) : 0;
  const hue = 345; // 玫瑰紅，跟 app 既有「欠款=紅」的色系一致
  const bgPct = 22 + ratio * 58;
  const bgLightness = isDark ? 42 : 55;
  const useWhiteText = isDark || ratio > 0.35;
  return {
    ratio, hue, bgPct, bgLightness,
    fg: useWhiteText ? "#FFFFFF" : "#7A1030",
    fontWeight: ratio > 0.4 ? 700 : 600
  };
}

// HSL → RGB（canvas fillStyle 沒辦法解析 CSS 的 var()，要跟卡片底色混合
// 就得自己把 hsl() 換算成實際的 rgb 數字再手動內插）。
function hslToRgb255(h, s, l){
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
// 解析 getSettlementTheme() 裡的 "#rrggbb" 或 "rgba(r,g,b,a)" 色碼，取出 rgb。
function parseThemeColorToRgb(str){
  if(str[0] === "#"){
    return [parseInt(str.slice(1,3),16), parseInt(str.slice(3,5),16), parseInt(str.slice(5,7),16)];
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if(m){
    const parts = m[1].split(",").map(s => parseFloat(s.trim()));
    return [parts[0], parts[1], parts[2]];
  }
  return [0, 0, 0];
}
// 熱圖格子在 canvas 上要用的實際顏色：跟網頁版同一套 debtHeatParams()，
// 只是把 color-mix() 換成手動內插出來的 rgb() 字串。cardRgbStr 對應網頁上
// .matrix-cell 的 var(--card)，用 getSettlementTheme() 的 cellBg 當基準色。
function debtHeatCanvasColors(amount, maxDebtAmount, isDark, cardRgbStr){
  const p = debtHeatParams(amount, maxDebtAmount, isDark);
  const hueRgb = hslToRgb255(p.hue, 82, p.bgLightness);
  const cardRgb = parseThemeColorToRgb(cardRgbStr);
  const t = p.bgPct / 100;
  const mixed = [0,1,2].map(i => Math.round(hueRgb[i] * t + cardRgb[i] * (1 - t)));
  return { bg: `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`, fg: p.fg, fontWeight: p.fontWeight };
}

// 這裡的顏色是直接照抄 shared.css 裡 .debt-matrix 實際在用的色碼（包含
// 深色模式的 :root[data-theme="dark"] 覆寫），不是另外設計一套配色——
// 使用者明確要求圖片的表格要跟網頁上長得一模一樣，所以格線有沒有、
// 哪些格子有底色、底色深淺，都要跟 shared.css 對得起來，不能自己加花樣
// （例如原本畫的交錯列底色、強調分隔線、應收款欄特殊底色，網頁上其實
// 都沒有，這裡拿掉了）。
function getSettlementTheme(){
  return isSettlementDarkTheme() ? {
    // .debt-matrix { background }
    tableBg: "rgba(34,34,38,0.92)",
    // .debt-matrix th/td { border-color }
    border: "rgba(255,255,255,0.14)",
    // thead th / matrix-corner / matrix-side-label / matrix-row-name / matrix-total / tfoot th
    headerBg: "rgba(48,48,54,0.9)",
    headerText: "#F5F5F7",
    // matrix-cell（沒有欠款的空格）
    cellBg: "rgba(38,38,42,0.6)",
    // matrix-self（自己欠自己那格）
    selfBg: "rgba(26,26,28,0.7)",
    selfText: "rgba(255,255,255,0.2)",
    accent: "#C6B7FE",
    footerText: "#8873C2"
  } : {
    tableBg: "#FFFFFF",
    border: "#E5E5EA",
    headerBg: "#F4F4F6",
    headerText: "#48484A",
    cellBg: "#FFFFFF",
    selfBg: "#FAF9FA",
    selfText: "rgba(122,107,158,0.35)",
    accent: "#544388",
    footerText: "#726196"
  };
}

// 匯出「債務關係表」完整格子版——跟畫面上 #debtMatrix 同一份資料、同一套
// 欄位（債權人／債務人交叉表 + 應收款/應付款），但畫面上人多的時候要橫向
// 捲動才看得到全部欄位；圖片不用遷就螢幕寬度，直接把所有欄位一次畫出來，
// 分享出去的人不用捲動就能看到完整內容。
function renderSettlementImageCanvas(){
  const owed = buildDebtMatrix(cachedExpenses, cachedRepayments);
  const ids = memberRows.map(m => m.id);
  const n = ids.length;
  const T = getSettlementTheme();
  const dark = isSettlementDarkTheme();

  // 熱圖跟網頁版 debtHeatStyle 共用同一套 debtHeatParams()，這裡一樣要先
  // 找出整張表最大的金額，顏色才會算出跟網頁上一致的比例。
  let maxDebtAmount = 0;
  ids.forEach(c => {
    ids.forEach(d => {
      if(c === d) return;
      const amt = (owed[c] && owed[c][d]) || 0;
      if(amt > maxDebtAmount) maxDebtAmount = amt;
    });
  });

  const groupName = (myMember && myMember.groups && myMember.groups.name) || "分帳群組";
  const nowStr = new Date().toLocaleString("zh-TW", { hour12: false });

  // 尺寸比照網頁 .debt-matrix 實際的緊湊程度（font-size:11.5px、
  // padding:8px 4px、姓名欄 min/max-width 3.2em~5.2em），不要用畫布上
  // 隨手看起來順眼的大小，不然整張表會比網頁鬆散、偏大。
  const PAD = 24;
  const labelColW = 22;
  const nameColW = 64;
  const cellColW = 58;
  const totalColW = 70;
  const headerRowH = 30;
  const dataRowH = 34;
  const footRowH = 32;
  const cardHeaderH = 122;
  const cardFooterH = 44;

  const tableW = labelColW + nameColW + cellColW * n + totalColW;
  const tableH = headerRowH * 2 + dataRowH * n + footRowH;
  const W = tableW + PAD * 2;
  const H = cardHeaderH + tableH + cardFooterH;

  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // 外層卡片背景（標題／頁尾這些「圖片外框」維持自己設計的品牌風格，
  // 使用者這次要求的是「表格本體」要跟網頁一致，不含外框）
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  if(dark){ bgGrad.addColorStop(0, "#232030"); bgGrad.addColorStop(1, "#17151E"); }
  else { bgGrad.addColorStop(0, "#F9F7FB"); bgGrad.addColorStop(1, "#ECE6F2"); }
  ctx.fillStyle = bgGrad;
  settlementCanvasRoundRect(ctx, 0, 0, W, H, 24);
  ctx.fill();

  // 標題／副標置中
  ctx.textAlign = "center";
  ctx.fillStyle = T.accent;
  ctx.font = "700 24px 'Noto Sans TC', sans-serif";
  ctx.fillText("🧮 Splitbill 債務關係表", W / 2, 42);

  ctx.fillStyle = dark ? "#A9A7B3" : "#686074";
  ctx.font = "500 14px 'Noto Sans TC', sans-serif";
  ctx.fillText(`👥 ${groupName}　💰 ${CURRENCY_LABEL} (${CURRENCY})　📅 ${nowStr}`, W / 2, 68);

  // ---------- 表格本體（顏色跟格線都對照 shared.css 的 .debt-matrix） ----------
  const tableX = PAD, tableY = cardHeaderH;
  const colX = i => tableX + labelColW + nameColW + i * cellColW; // 第 i 個成員欄位的左邊界
  const rowY = i => tableY + headerRowH * 2 + i * dataRowH; // 第 i 個成員列的上邊界
  const totalColX = tableX + labelColW + nameColW + cellColW * n;
  const footY = rowY(n);

  ctx.textBaseline = "middle";

  // 表格最外圈要有圓角（呼應網頁 .matrix-scroll{border-radius:12px}），
  // 圖片沒有外層容器可以裁圓角，改用 clip 讓表格本體（底色、每格底色）
  // 都被裁成圓角矩形，四個角落才不會露出方形的底色，外框線另外在最後
  // 用同一個圓角矩形路徑描邊，跟裁切範圍完全對齊。
  const tableRadius = 10;
  ctx.save();
  settlementCanvasRoundRect(ctx, tableX, tableY, tableW, tableH, tableRadius);
  ctx.clip();

  // 表格底色（鋪滿整個表格範圍，之後再疊上各格子自己的底色）
  ctx.fillStyle = T.tableBg;
  ctx.fillRect(tableX, tableY, tableW, tableH);

  // 表頭兩列（債務人／成員名字）＋ 應收款表頭：跟網頁一樣統一用 headerBg，
  // 左上角（債權人/債務人交會處）本身也是跟其他表頭一樣的 headerBg
  // （對應 HTML 的 .matrix-corner{background:#F4F4F6}），只是沒有外框線
  // （.matrix-corner{border:none}），框線的部分留給下面畫格線那段處理。
  ctx.fillStyle = T.headerBg;
  ctx.fillRect(tableX, tableY, tableW, headerRowH * 2);

  ctx.fillStyle = T.headerText;
  // 「債務人」跟網頁一樣是水平文字（.matrix-top-label 沒有 writing-mode，
  // 只有「債權人」.matrix-left-label 才是直排），置中寫在成員欄位上方
  ctx.textAlign = "center";
  ctx.font = "700 11px 'Noto Sans TC', sans-serif";
  ctx.fillText("債務人", tableX + labelColW + nameColW + cellColW * n / 2, tableY + headerRowH / 2 + 1);

  ctx.font = "700 11.5px 'Noto Sans TC', sans-serif";
  ids.forEach((id, i) => {
    const name = truncateNameChars(memberById[id] || "?", 5);
    ctx.fillText(name, colX(i) + cellColW / 2, tableY + headerRowH * 1.5 + 1);
  });

  ctx.font = "700 11px 'Noto Sans TC', sans-serif";
  ctx.fillText("應收款", totalColX + totalColW / 2, tableY + headerRowH);

  // 左側「債權人」欄跟每一列的姓名欄一樣是 headerBg（跟 .matrix-side-label /
  // .matrix-row-name 對應），「債權人」文字直排（由上往下）
  ctx.fillStyle = T.headerBg;
  ctx.fillRect(tableX, tableY + headerRowH * 2, labelColW + nameColW, dataRowH * n);
  ctx.fillStyle = T.headerText;
  drawSettlementVerticalLabel(ctx, "債權人", tableX + labelColW / 2, tableY + headerRowH * 2, dataRowH * n, "700 11px 'Noto Sans TC', sans-serif");

  // 資料列
  ids.forEach((creditorId, r) => {
    const y = rowY(r);
    const cy = y + dataRowH / 2;

    ctx.fillStyle = T.headerText;
    ctx.font = "700 11.5px 'Noto Sans TC', sans-serif";
    ctx.fillText(truncateNameChars(memberById[creditorId] || "?", 5), tableX + labelColW + nameColW / 2, cy + 1);

    let rowTotal = 0;
    ids.forEach((debtorId, c) => {
      const cx = colX(c) + cellColW / 2;
      if(debtorId === creditorId){
        ctx.fillStyle = T.selfBg;
        ctx.fillRect(colX(c), y, cellColW, dataRowH);
        ctx.fillStyle = T.selfText;
        ctx.font = "500 11.5px 'Noto Sans TC', sans-serif";
        ctx.fillText("－", cx, cy + 1);
        return;
      }
      const amt = (owed[creditorId] && owed[creditorId][debtorId]) || 0;
      if(amt > 0.05){
        rowTotal += amt;
        const heat = debtHeatCanvasColors(amt, maxDebtAmount, dark, T.cellBg);
        ctx.fillStyle = heat.bg;
        ctx.fillRect(colX(c), y, cellColW, dataRowH);
        ctx.fillStyle = heat.fg;
        ctx.font = `${heat.fontWeight} 11px 'JetBrains Mono', monospace`;
        ctx.fillText(settlementCanvasTruncate(ctx, formatAmt(amt), cellColW - 10), cx, cy + 1);
      } else {
        ctx.fillStyle = T.cellBg;
        ctx.fillRect(colX(c), y, cellColW, dataRowH);
      }
    });

    ctx.fillStyle = T.headerBg;
    ctx.fillRect(totalColX, y, totalColW, dataRowH);
    ctx.fillStyle = T.headerText;
    ctx.font = "700 11.5px 'JetBrains Mono', monospace";
    ctx.fillText(rowTotal > 0.05 ? formatAmt(rowTotal) : "0", totalColX + totalColW / 2, cy + 1);
  });

  // 底部「應付款」列
  ctx.fillStyle = T.headerBg;
  ctx.fillRect(tableX, footY, tableW, footRowH);
  ctx.fillStyle = T.headerText;
  ctx.font = "700 11px 'Noto Sans TC', sans-serif";
  ctx.fillText("應付款", tableX + labelColW + nameColW / 2, footY + footRowH / 2 + 1);

  ids.forEach((debtorId, c) => {
    let colTotal = 0;
    ids.forEach(creditorId => {
      if(creditorId === debtorId) return;
      colTotal += (owed[creditorId] && owed[creditorId][debtorId]) || 0;
    });
    ctx.font = "700 11px 'JetBrains Mono', monospace";
    ctx.fillText(colTotal > 0.05 ? formatAmt(colTotal) : "0", colX(c) + cellColW / 2, footY + footRowH / 2 + 1);
  });

  // ---------- 格線：網頁上左上角本身（matrix-corner）雖然 border:none，
  // 但外層還有 .matrix-scroll 包一層 border，所以最外圈（最上、最左）視覺上
  // 還是有線；圖片沒有那層外框容器，所以最外圈的線一樣要畫出來，只有真正
  // 「共用同一個儲存格」的內部才不畫線：
  //   ・債務人（colspan=n）：內部（成員欄之間）不畫線，但左右兩側邊界要畫
  //   ・債權人（rowspan=n）：內部（列與列之間）不畫線，但上下兩側邊界要畫
  //   ・應付款（colspan=2，跟 label／name 欄合併）：內部（label／name 中間）不畫線
  // ----------------------------------------------------------
  ctx.strokeStyle = T.border;
  ctx.lineWidth = 1;
  // 直線：label／name／n 個成員欄／應收款，共 n+3 欄，中間需要 n+2 條分隔線
  // （最左、最右兩條外圈線改由下面的圓角矩形描邊負責，這裡不重複畫）。
  for(let c = 1; c <= n + 2; c++){
    const x = c === 1 ? tableX + labelColW
      : c <= n + 1 ? colX(c - 2)
      : totalColX;
    let yStart = tableY;
    let yEnd = tableY + tableH;
    if(c === 1){
      // label／name 欄中間：表頭範圍（matrix-corner）跟表尾範圍（應付款
      // colspan=2）都是合併儲存格，只有中間的資料列才有這條分隔線
      yStart = tableY + headerRowH * 2;
      yEnd = footY;
    } else if(c >= 3 && c <= n + 1){
      // 債務人（colspan=n）內部：成員欄跟成員欄中間，只跳過債務人那一列
      yStart = tableY + headerRowH;
    }
    ctx.beginPath(); ctx.moveTo(x + 0.5, yStart); ctx.lineTo(x + 0.5, yEnd); ctx.stroke();
  }
  // 橫線：header×2／n 個資料列／應付款，共 n+3 列，中間需要 n+2 條分隔線
  // （最上、最下兩條外圈線一樣改由圓角矩形描邊負責）。
  for(let r = 1; r <= n + 2; r++){
    const y = r === 1 ? tableY + headerRowH
      : r <= n + 1 ? rowY(r - 2)
      : footY;
    let xStart = tableX;
    let xEnd = tableX + tableW;
    if(r === 1){
      // 「債務人」「應收款」表頭都是 rowspan=2，這條內部分隔線只在成員
      // 欄位之間畫，不能穿過應收款那一格
      xStart = tableX + labelColW + nameColW;
      xEnd = totalColX;
    } else if(r >= 3 && r <= n + 1){
      xStart = tableX + labelColW; // 「債權人」欄是 rowspan=成員數，內部不分線
    }
    ctx.beginPath(); ctx.moveTo(xStart, y + 0.5); ctx.lineTo(xEnd, y + 0.5); ctx.stroke();
  }

  ctx.restore(); // 解除圓角裁切，外圈線要畫在裁切範圍外緣，不能被裁掉半條線寬
  ctx.save();
  settlementCanvasRoundRect(ctx, tableX + 0.5, tableY + 0.5, tableW - 1, tableH - 1, tableRadius);
  ctx.strokeStyle = T.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillStyle = T.footerText;
  ctx.font = "600 12px 'Noto Sans TC', sans-serif";
  ctx.fillText("由 Splitbill 產生", W / 2, H - cardFooterH / 2 + 4);
  ctx.textAlign = "left";

  return canvas;
}

let currentSettlementImgUrl = null;

const settlementImgModal = document.getElementById("settlementImgModal");
const settlementImgCloseBtn = document.getElementById("settlementImgCloseBtn");

function closeSettlementImgModal(){
  if(settlementImgModal) settlementImgModal.classList.remove("show");
  if(currentSettlementImgUrl){
    URL.revokeObjectURL(currentSettlementImgUrl);
    currentSettlementImgUrl = null;
  }
}
if(settlementImgCloseBtn) settlementImgCloseBtn.addEventListener("click", closeSettlementImgModal);

const exportSettlementImgBtn = document.getElementById("exportSettlementImgBtn");
if(exportSettlementImgBtn){
  exportSettlementImgBtn.addEventListener("click", async ()=>{
    const originalHtml = exportSettlementImgBtn.innerHTML;
    exportSettlementImgBtn.disabled = true;
    exportSettlementImgBtn.innerHTML = "<span>⏳ 產生中…</span>";
    try {
      const canvas = renderSettlementImageCanvas();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if(!blob){
        await sbAlert("圖片產生失敗，請再試一次。", "🔔 Splitbill 錯誤");
        return;
      }

      if(currentSettlementImgUrl) URL.revokeObjectURL(currentSettlementImgUrl);
      currentSettlementImgUrl = URL.createObjectURL(blob);
      const dataUrl = canvas.toDataURL("image/png");

      const img = document.getElementById("settlementImgPreview");
      if(img) img.src = dataUrl || currentSettlementImgUrl;
      if(settlementImgModal) settlementImgModal.classList.add("show");

      const groupName = (myMember && myMember.groups && myMember.groups.name) || "分帳群組";
      const filename = `Splitbill結算_${groupName}_${CURRENCY}_${new Date().toISOString().slice(0,10)}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      const isCapacitor = typeof window.Capacitor !== "undefined" && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform();
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isMobile = isCapacitor || isIOS || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1);

      async function handleMobileShareOrSave(){
        // 1. Capacitor 原生 Share / Filesystem 外掛支援
        if(isCapacitor && window.Capacitor && window.Capacitor.Plugins){
          try {
            if(window.Capacitor.Plugins.Filesystem && window.Capacitor.Plugins.Share){
              const base64Data = (dataUrl || "").split(",")[1];
              if(base64Data){
                const saved = await window.Capacitor.Plugins.Filesystem.writeFile({
                  path: filename,
                  data: base64Data,
                  directory: "CACHE"
                });
                if(saved && saved.uri){
                  await window.Capacitor.Plugins.Share.share({
                    title: `Splitbill 帳務結算 - ${groupName}`,
                    text: `這是 ${groupName} 的帳務結算圖`,
                    url: saved.uri,
                    dialogTitle: "分享結算圖片"
                  });
                  return true;
                }
              }
            } else if(window.Capacitor.Plugins.Share){
              await window.Capacitor.Plugins.Share.share({
                title: `Splitbill 帳務結算 - ${groupName}`,
                text: `這是 ${groupName} 的帳務結算圖`,
                url: dataUrl || currentSettlementImgUrl,
                dialogTitle: "分享結算圖片"
              });
              return true;
            }
          } catch(e){
            console.warn("Capacitor Share Plugin error:", e);
          }
        }

        // 2. 現代瀏覽器 Web Share API
        if(navigator.share){
          try {
            if(navigator.canShare && navigator.canShare({ files: [file] })){
              await navigator.share({
                files: [file],
                title: `Splitbill 帳務結算 - ${groupName}`,
                text: `這是 ${groupName} 的帳務結算圖`
              });
              return true;
            } else {
              await navigator.share({
                title: `Splitbill 帳務結算 - ${groupName}`,
                text: `這是 ${groupName} 的帳務結算圖`,
                url: location.href
              });
              return true;
            }
          } catch(e){
            if(e && e.name === "AbortError") return true; // 使用者主動取消
          }
        }
        return false;
      }

      async function handleCopyImage(){
        if(navigator.clipboard && typeof ClipboardItem !== "undefined"){
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type || "image/png"]: blob })
            ]);
            const copyBtn = document.getElementById("settlementImgCopyBtn");
            if(copyBtn){
              const old = copyBtn.innerHTML;
              copyBtn.innerHTML = "✓ 已複製！";
              setTimeout(()=>{ copyBtn.innerHTML = old; }, 2000);
            }
            showToast("📋 圖片已複製", "可直接切換到 LINE / 社群按「貼上」發送！");
            return true;
          } catch(e){
            console.warn("ClipboardItem write error:", e);
          }
        }
        return false;
      }

      async function handleDirectDownload(){
        // 1. Capacitor 原生儲存檔案
        if(isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem){
          try {
            const base64Data = (dataUrl || "").split(",")[1];
            if(base64Data){
              await window.Capacitor.Plugins.Filesystem.writeFile({
                path: filename,
                data: base64Data,
                directory: "DOCUMENTS"
              });
              showToast("💾 圖片已儲存", `已儲存至裝置「文件 / ${filename}」`);
              return;
            }
          } catch(e){
            console.warn("Capacitor Filesystem write error:", e);
          }
        }

        if(isMobile){
          try {
            const a = document.createElement("a");
            a.href = currentSettlementImgUrl || dataUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => a.remove(), 250);
          } catch(e){}

          // 提示手機長按儲存相簿
          sbAlert("📱 手機儲存相簿教學：\n\n1. 請直接「長按」上方預覽圖片\n2. 選擇「下載圖片 / 儲存影像」或「分享到 LINE」\n即可存入手機相簿或傳送給朋友！", "💡 儲存至相簿");
          return;
        }

        // 電腦版 Web 直接觸發下載
        try {
          const a = document.createElement("a");
          a.href = currentSettlementImgUrl || dataUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => a.remove(), 250);
        } catch(e){
          window.open(currentSettlementImgUrl || dataUrl, "_blank");
        }
      }

      const copyBtn = document.getElementById("settlementImgCopyBtn");
      if(copyBtn){
        copyBtn.onclick = async () => {
          const ok = await handleCopyImage();
          if(!ok){
            await sbAlert("您的裝置暫不支援剪貼簿直接拷貝圖片，請直接「長按上方圖片」選擇「拷貝」或「儲存影像」。", "💡 複製提示");
          }
        };
      }

      const dlBtn = document.getElementById("settlementImgDownloadBtn");
      if(dlBtn){
        dlBtn.onclick = async () => {
          await handleDirectDownload();
        };
      }

      const shareBtn = document.getElementById("settlementImgShareBtn");
      if(shareBtn){
        shareBtn.onclick = async () => {
          const shared = await handleMobileShareOrSave();
          if(!shared){
            const copied = await handleCopyImage();
            if(!copied){
              await handleDirectDownload();
            }
          }
        };
      }
    } catch(err){
      console.error("匯出結算圖片失敗：", err);
      await sbAlert("匯出圖片失敗：" + (err.message || "未知錯誤"), "🔔 Splitbill 錯誤");
    } finally {
      exportSettlementImgBtn.disabled = false;
      exportSettlementImgBtn.innerHTML = originalHtml;
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
// 分攤金額的計算機算式（例如「平分400+自付250+稅額65」）給使用者看時，
// 把內部的詞換成比較好懂的說法——「平分」→「共同支出」、「稅額」→「稅/服務費」，
// 「自付」本來就夠白話不用改。純粹換字，算式還是同一條字串，不拆成好幾行。
function relabelCalcText(calc){
  return String(calc || "")
    .replace(/平分/g, "共同支出")
    .replace(/稅額/g, "稅/服務費");
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

  const icon = getCategoryIcon(title || e.description || "", e.category);
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
      ? `<div class="exp-debt-calc-expand-row"><div class="exp-debt-calc-badge-expanded" title="計算機算式：${escapeHtml(relabelCalcText(s.calc))}">${escapeHtml(relabelCalcText(s.calc))}</div></div>`
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
  const expDebtModalRestoreBtn = document.getElementById("expDebtModalRestoreBtn");
  const isExpXcurDetail = isXcurStr(e.description);
  const expXcurIdDetail = isExpXcurDetail ? extractXcurId(e.description) : null;
  if(expDebtModalEditBtn){
    const canEdit = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;
    if(!canEdit){
      expDebtModalEditBtn.style.display = "none";
    } else if(isExpXcurDetail){
      expDebtModalEditBtn.style.display = expXcurIdDetail ? "inline-flex" : "none";
      expDebtModalEditBtn.textContent = "✎ 編輯匯率";
      expDebtModalEditBtn.title = "編輯匯率";
      expDebtModalEditBtn.onclick = () => {
        modal.classList.remove("show");
        openXcurRateEditModal(expXcurIdDetail);
      };
    } else {
      expDebtModalEditBtn.style.display = "inline-flex";
      expDebtModalEditBtn.textContent = "✎ 編輯";
      expDebtModalEditBtn.title = "編輯此筆支出";
      expDebtModalEditBtn.onclick = () => {
        modal.classList.remove("show");
        startEditExpense(e);
      };
    }
  }
  if(expDebtModalRestoreBtn){
    const canEdit = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;
    if(canEdit && isExpXcurDetail){
      expDebtModalRestoreBtn.style.display = "inline-flex";
      expDebtModalRestoreBtn.onclick = () => {
        modal.classList.remove("show");
        handleCrossCurrencyDelete(e.description, async ()=>{
          const { error } = await sb.from("expenses").delete().eq("id", e.id);
          if(error){ await sbAlert("刪除失敗：" + error.message, "🔔 Splitbill 錯誤"); return; }
          await refreshExpenses();
        });
      };
    } else {
      expDebtModalRestoreBtn.style.display = "none";
    }
  }

  modal.classList.add("show");
}

const expDebtModal = document.getElementById("expenseDebtModal");
const expDebtModalCloseBtn = document.getElementById("expDebtModalCloseBtn");
if(expDebtModalCloseBtn && expDebtModal){
  expDebtModalCloseBtn.addEventListener("click", ()=> expDebtModal.classList.remove("show"));
}

// ============================================================
// 顯示「債務組成」
// ============================================================
let ledgerSortAsc = true; // false = 新到舊，true = 舊到新（預設）
let currentPairDetail = null; // 目前開啟中的往來紀錄視窗是哪一對，null = 沒開
// 「上一輪／下一輪」目前翻到第幾輪已結清的舊週期，改成每一對人各自記一份
// （用 "debtorId|creditorId" 當 key），關掉視窗再打開同一對人，會留在原本
// 看到的那一輪，不用重新按好幾次「上一輪」。
let pairOlderCyclePageMap = {};
function showPairDetail(
  debtorId,
  creditorId,
  expenses,
  repayments,
  owedMatrix
){

  // ==========================================================
  // 建立 / 取得詳細紀錄容器
  // ==========================================================

  currentPairDetail = { debtorId, creditorId };
  const pairKey = debtorId + "|" + creditorId;
  let olderCyclePage = pairOlderCyclePageMap[pairKey] || 0;

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
  // 「往來紀錄」：不再嘗試把某筆還款歸因給某筆支出（那本來就是件模糊、
  // 沒有唯一正確答案的事），改成單純照時間順序列出這兩人之間所有支出跟
  // 還款，每一筆都顯示自己原本、真實的金額，後面附上「累計到這裡，誰欠
  // 誰多少」。這個累計餘額用跟 buildDebtMatrix 完全相同的規則（雙方各自
  // 累計、還款先沖同方向、沖不完的溢出才轉向）逐筆重演，所以走到最後一筆
  // 得到的數字，保證跟上面權威總表算出來的一致。
  // ==========================================================

  // 先建立「每一筆單獨事件」的完整清單（手動抵銷的兩筆還款也各自分開，
  // 不先合併）——這一步一定要含兩邊，不然雙變數重演會漏算其中一邊，導致
  // 算出來的餘額跟權威總表（buildDebtMatrix，兩邊都會處理）對不起來。
  // 合併成一張卡片是「畫面呈現」的事，晚一點再做。
  const timelineEvents = [];

  expenses.forEach(e => {
    const pairDebts = computeExpenseDebts(e);
    const forward = (pairDebts[creditorId] && pairDebts[creditorId][debtorId]) || 0; // debtorId 欠 creditorId
    const reverse = (pairDebts[debtorId] && pairDebts[debtorId][creditorId]) || 0; // creditorId 欠 debtorId
    if(forward > 0.005){
      timelineEvents.push({ type: "expense", expense: e, amount: forward, direction: "forward", date: e.expense_date || "", createdAt: e.created_at || "" });
    } else if(reverse > 0.005){
      timelineEvents.push({ type: "expense", expense: e, amount: reverse, direction: "reverse", date: e.expense_date || "", createdAt: e.created_at || "" });
    }
  });

  repayments.forEach(r => {
    const amount = Number(r.amount) || 0;
    if(amount <= 0.005) return;
    if(r.from_member === debtorId && r.to_member === creditorId){
      timelineEvents.push({ type: "repayment", repayment: r, amount, direction: "forward", date: r.payment_date || "", createdAt: r.created_at || "" });
    } else if(r.from_member === creditorId && r.to_member === debtorId){
      timelineEvents.push({ type: "repayment", repayment: r, amount, direction: "reverse", date: r.payment_date || "", createdAt: r.created_at || "" });
    }
  });

  // 按實際發生時間正序排列（舊到新；同一天同時刻時，支出先於還款發生）
  timelineEvents.sort((a, b) => {
    const timeA = a.createdAt || (a.date ? a.date + "T00:00:00.000Z" : "");
    const timeB = b.createdAt || (b.date ? b.date + "T00:00:00.000Z" : "");
    if(timeA && timeB && timeA !== timeB) return timeA.localeCompare(timeB);
    const dA = a.date || "", dB = b.date || "";
    if(dA !== dB) return dA.localeCompare(dB);
    const aIsExp = a.type === "expense" ? 0 : 1;
    const bIsExp = b.type === "expense" ? 0 : 1;
    return aIsExp - bIsExp;
  });
  // 記錄每筆事件在排序後陣列裡的實際位置——判斷「兩筆事件誰先誰後」要用
  // 這個位置，不能只比對時間字串。時間字串完全相同時（例如同一次「一鍵
  // 抵銷」建立的兩筆還款常常是同一秒），排序結果還是會有固定的先後順序，
  // 但比字串看不出來、會兩邊平手，用位置才抓得到真正誰在陣列裡排在後面。
  timelineEvents.forEach((ev, i) => { ev.orderIndex = i; });

  // 雙變數逐筆重演：forwardBal（debtorId 欠 creditorId）、
  // reverseBal（creditorId 欠 debtorId）各自獨立累計，還款只沖同方向的
  // 餘額，沖不完的部分才轉向溢出到另一邊——這跟 buildDebtMatrix 對還款
  // 的處理規則完全一樣，只是這裡逐筆記錄下每一步的結果。
  let forwardBal = 0, reverseBal = 0;
  timelineEvents.forEach(ev => {
    const beforeForward = forwardBal;
    const beforeReverse = reverseBal;
    if(ev.type === "expense"){
      if(ev.direction === "forward") forwardBal += ev.amount;
      else reverseBal += ev.amount;
    } else if(ev.direction === "forward"){
      const paid = Math.min(forwardBal, ev.amount);
      forwardBal -= paid;
      reverseBal += (ev.amount - paid);
    } else {
      const paid = Math.min(reverseBal, ev.amount);
      reverseBal -= paid;
      forwardBal += (ev.amount - paid);
    }
    ev.balanceForward = Math.round(forwardBal * 100) / 100;
    ev.balanceReverse = Math.round(reverseBal * 100) / 100;
    // debtorId 這個人自己實際欠款有沒有變化，才是決定顏色的依據——例如
    // 反方向的還款如果被反方向既有欠款完全吸收掉，debtorId 自己的欠款
    // 根本沒被動到，就不該染成紅色或綠色，維持中性。
    ev.forwardDelta = Math.round((forwardBal - beforeForward) * 100) / 100;
    ev.reverseDelta = Math.round((reverseBal - beforeReverse) * 100) / 100;
  });

  // 現在才把手動互相抵銷的兩筆還款合併成「一張卡片」方便閱讀——兩邊都已
  // 經在上面正確算進餘額了，這裡只挑其中一筆（先發生的那筆，方向固定是
  // 「debtorId 還 creditorId」）代表整組，並且直接沿用「兩筆都套用完之後」
  // 的餘額快照（也就是兩筆之中比較晚發生那筆的 balanceForward/Reverse），
  // 這樣小計才會是「這組抵銷結束後」的正確結果，不會漏算另一半。
  const offsetPairsByGroup = {};
  timelineEvents.forEach(ev => {
    if(ev.type !== "repayment" || !ev.repayment.offset_group) return;
    const group = offsetPairsByGroup[ev.repayment.offset_group] || (offsetPairsByGroup[ev.repayment.offset_group] = {});
    if(ev.direction === "forward") group.toCreditor = ev;
    else group.toDebtor = ev;
  });
  const skipIds = new Set();
  const mergedCardByGroup = {};
  Object.values(offsetPairsByGroup).forEach(pair => {
    if(!pair.toCreditor || !pair.toDebtor) return;
    const later = pair.toCreditor.orderIndex >= pair.toDebtor.orderIndex ? pair.toCreditor : pair.toDebtor;
    skipIds.add(pair.toCreditor.repayment.id);
    skipIds.add(pair.toDebtor.repayment.id);
    mergedCardByGroup[pair.toCreditor.repayment.offset_group] = {
      type: "repayment",
      repayment: pair.toCreditor.repayment,
      amount: pair.toCreditor.amount,
      direction: "forward",
      date: later.date,
      createdAt: later.createdAt,
      balanceForward: later.balanceForward,
      balanceReverse: later.balanceReverse,
      forwardDelta: Math.round((pair.toCreditor.forwardDelta + pair.toDebtor.forwardDelta) * 100) / 100,
      reverseDelta: Math.round((pair.toCreditor.reverseDelta + pair.toDebtor.reverseDelta) * 100) / 100
    };
  });
  const displayEvents = timelineEvents
    .filter(ev => !(ev.type === "repayment" && skipIds.has(ev.repayment.id)))
    .concat(Object.values(mergedCardByGroup))
    .sort((a, b) => {
      const timeA = a.createdAt || (a.date ? a.date + "T00:00:00.000Z" : "");
      const timeB = b.createdAt || (b.date ? b.date + "T00:00:00.000Z" : "");
      return timeA.localeCompare(timeB);
    });

  // ==========================================================
  // 金額統計（呼叫端／debt矩陣渲染時通常已經算好一份共用傳進來，
  // 不用再把全部支出/還款重新掃一次；沒傳的話才自己算）——這是畫面上方
  // 摘要、下方「一鍵抵銷」「記錄還款」按鈕實際使用的權威數字。
  // ==========================================================
  const owed = owedMatrix || buildDebtMatrix(expenses, repayments);
  const remainingDebt = (owed[creditorId] && owed[creditorId][debtorId]) || 0;
  const reverseDebt = (owed[debtorId] && owed[debtorId][creditorId]) || 0;
  const offsetAmt = Math.min(remainingDebt, reverseDebt);

  // 小計改成短小的色塊（不用完整句子）。顏色以「登入者本人」的角度為準，
  // 不是固定看 debtorId：我欠對方＝紅色（顯眼），對方欠我＝灰色（不顯眼，
  // 沒什麼好緊張的）；如果本人剛好不是這兩人之一（純粹查看別人的帳），才
  // 退回原本「debtorId 欠人用紅、被欠用灰」的預設判斷。
  const debtorName = escapeHtml(memberById[debtorId] || "?");
  const creditorName = escapeHtml(memberById[creditorId] || "?");
  // 顏色一律以「這個頁面的 debtorId（應付方）」為準，不管登入的是誰：
  // debtorId 欠 creditorId／debtorId 還 creditorId 用紅色（顯眼），
  // creditorId 欠 debtorId／creditorId 還 debtorId 用灰色（不顯眼）。
  // 若該筆事件使得欠款「減少」（如還款/抵銷沖銷），欠款膠囊轉為代表減債的綠色（is-repay）。
  const balanceText = (fwd, rev, fwdDelta = 0, revDelta = 0) => {
    if(fwd <= 0.01 && rev <= 0.01){
      return `<div class="ledger-row-balance"><span class="balance-chip is-clear">✓ 雙方此時已結清</span></div>`;
    }
    const fwdCls = fwd <= 0.01 ? "is-owed" : (fwdDelta < -0.01 ? "is-repay" : "is-owe");
    const revCls = rev <= 0.01 ? "is-owed" : (revDelta < -0.01 ? "is-repay" : "is-owe");

    return `<div class="ledger-row-balance">`
      + `<span class="balance-chip ${fwdCls}"><span class="chip-names">${debtorName} 欠 ${creditorName}</span> <span class="chip-amt">${SYM}${formatAmt(fwd)}</span></span>`
      + `<span class="balance-chip ${revCls}"><span class="chip-names">${creditorName} 欠 ${debtorName}</span> <span class="chip-amt">${SYM}${formatAmt(rev)}</span></span>`
      + `</div>`;
  };
  // 單筆事件金額前面的正負號/顏色，改成看這筆事件實際有沒有讓 debtorId
  // 自己的欠款（forwardBal）變動——例如反方向的還款如果被既有的反方向欠款
  // 完全吸收掉，debtorId 自己的欠款根本沒被動到，就不該染紅或染綠，維持
  // 中性色。forwardDelta > 0：debtorId 欠更多了（紅）；< 0：debtorId 欠
  // 變少了（綠，還款專用）；約等於 0：沒影響到 debtorId 自己那筆（中性）。
  const rowColor = (ev) => {
    if(ev.forwardDelta > 0.01) return { cls: "is-debit", sign: "+" };
    if(ev.forwardDelta < -0.01) return { cls: "is-repay", sign: "−" };
    return { cls: "is-credit", sign: ev.type === "expense" ? "+" : "−" };
  };
  // 卡片整體背景色的 class：有真的影響到 debtorId 欠款的卡片才加淺色底，
  // 完全沒影響的維持中性、淡化處理。
  const rowWrapClass = (ev) => {
    const cls = rowColor(ev).cls;
    if(cls === "is-debit") return "is-debit-row";
    if(cls === "is-repay") return "is-repay-row";
    return "is-neutral-row";
  };

  // 兩個方向的支出/還款都顯示在同一條時間軸裡，不再只挑單一方向——這樣
  // 才看得到完整的往來過程，數字也一定跟上面的權威總表一致。
  //
  // 把整條時間軸依「應付人（debtorId）自己的欠款歸零」的每一個時間點切
  // 成一段一段：最新一段（從上一次歸零到現在）永遠直接顯示；再更早的每
  // 一段都收在各自的「查看更早的紀錄」按鈕後面，一次只往前展開一段（回
  // 溯到再前一次歸零），不是一次全部倒出來。如果歸零點剛好就是最後一
  // 筆，至少保留那一筆讓人看到「怎麼結清的」。
  // 連續好幾筆都停在 0（例如結清後又發生幾筆跟這個方向無關的紀錄）算同一次
  // 歸零，只取這一段連續 0 的「最後一筆」當切點，不要每一筆 0 都各自切一
  // 段，否則會冒出好幾個沒有任何事件的空段。如果一開始（時間軸上第一筆
  // 事件）就已經是 0，那只是起始狀態，還沒有真的還清過什麼，不算一次
  // 歸零、不當作切點。
  const zeroIndices = [];
  {
    let i = 0;
    while(i < timelineEvents.length){
      if(timelineEvents[i].balanceForward <= 0.01){
        const runStart = i;
        while(i < timelineEvents.length && timelineEvents[i].balanceForward <= 0.01) i++;
        if(runStart > 0) zeroIndices.push(i - 1);
      } else {
        i++;
      }
    }
  }
  // cutoffTimes：由新到舊排列的切點時間，cutoffTimes[0] 是「最近一次歸零」、
  // cutoffTimes[1] 是「再前一次歸零」……如果整段歷史從未歸零過，退回原本
  // 的預設行為：只有一個切點（第一筆事件本身），代表全部都算「最新」。
  //
  // 如果最近一次歸零剛好就是最後一筆（現在已經結清、後面沒有新動作），
  // 不該把那筆結清事件硬留在「目前」區塊充當還沒結清的樣子——這裡改用一
  // 個比任何真實時間都大的哨兵值當切點，讓「目前」直接淨空、改顯示已結
  // 清；那筆結清事件連同它前面的歷史，一起收進「上一輪」可以回頭查看。
  const FUTURE_SENTINEL = "9999-12-31T23:59:59.999Z";
  const cutoffIndices = zeroIndices.length ? zeroIndices.slice().reverse().map(zi => zi + 1) : [0];
  const cutoffTimes = [];
  cutoffIndices.forEach(idx => {
    const t = idx >= timelineEvents.length
      ? FUTURE_SENTINEL
      : (timelineEvents[idx] ? (timelineEvents[idx].createdAt || (timelineEvents[idx].date ? timelineEvents[idx].date + "T00:00:00.000Z" : "")) : null);
    if(t === null) return;
    if(cutoffTimes[cutoffTimes.length - 1] !== t) cutoffTimes.push(t);
  });

  // 用「切點那一筆的實際發生時間」分段，套用到合併過的顯示清單上（合併
  // 後的清單筆數、順序都跟原始清單不一樣，不能再直接比 index）。
  function segmentIndexForTime(t){
    for(let m = 0; m < cutoffTimes.length; m++){
      if(t >= cutoffTimes[m]) return m;
    }
    return cutoffTimes.length;
  }
  const allEventsDisplayAsc = displayEvents.map(ev => {
    const t = ev.createdAt || (ev.date ? ev.date + "T00:00:00.000Z" : "");
    return { ev, segment: segmentIndexForTime(t) };
  });
  // 預設「新到舊」；使用者可按排序按鈕切換成「舊到新」，狀態存在 ledgerSortAsc。
  const allEventsDisplay = ledgerSortAsc ? allEventsDisplayAsc : allEventsDisplayAsc.slice().reverse();

  const maxSegment = cutoffTimes.length; // 0 = 最新一段，數字愈大代表愈早
  const visibleEvents = allEventsDisplay.filter(x => x.segment === 0).map(x => x.ev);
  // 把每一輪「已經結清的舊週期」各自收成一頁，過濾掉沒有任何事件的「虛擬」
  // 分段（例如這對人之間從來沒有真的歸零過，也不該多出一輪空白的紀錄）。
  // historicalCycles[0] 是離現在最近的一輪，數字愈大愈早。
  const historicalCycles = [];
  for(let s = 1; s <= maxSegment; s++){
    const evs = allEventsDisplay.filter(x => x.segment === s).map(x => x.ev);
    if(evs.length) historicalCycles.push(evs);
  }
  const totalCyclePages = historicalCycles.length;
  if(olderCyclePage > totalCyclePages) olderCyclePage = totalCyclePages;
  pairOlderCyclePageMap[pairKey] = olderCyclePage;
  const olderEvents = olderCyclePage > 0 ? historicalCycles[olderCyclePage - 1] : [];
  // 畫面上顯示的輪數跟內部索引方向相反：內部 olderCyclePage=1 是「離現在
  // 最近的一輪」，但使用者往前（上一輪）翻應該要看到數字愈翻愈小，翻到
  // 最早那一輪剛好是「第 1 輪」，所以顯示用的輪數要反過來算。
  const displayRound = olderCyclePage > 0 ? (totalCyclePages - olderCyclePage + 1) : 0;

  // ==========================================================
  // 建立詳細紀錄
  // ==========================================================
  let html = `
    <div class="debt-detail-panel">

      <!-- 頂部列：左邊大標題，右邊獨立關閉按鈕 -->
      <div class="debt-detail-top-bar">
        <div class="debt-detail-title-main">
          <span class="debt-detail-title-icon">📊</span>
          <span>債務明細</span>
        </div>
        <button type="button" id="matrixDetailClose" class="debt-detail-close" aria-label="關閉">✕</button>
      </div>

      <!-- 頂部動態金流傳送條（獨立滿版置中） -->
      <div class="debt-detail-header">
        <div class="debt-flow-header-card ${remainingDebt <= 0.01 ? 'is-settled' : ''}">
          <!-- 應付方 -->
          <div class="debt-flow-party debtor">
            <div class="debt-flow-avatar-wrap">
              ${renderAvatarHTML({ id: debtorId, name: memberById[debtorId] }, "avatar-md")}
              <span class="debt-flow-role-badge debtor">應付</span>
            </div>
            <span class="debt-flow-name" title="${escapeHtml(memberById[debtorId] || "")}">${escapeHtml(memberById[debtorId] || "?")}</span>
          </div>

          <!-- 中央金流與金額 -->
          <div class="debt-flow-center">
            <div class="debt-flow-arrow-track">
              <span class="debt-flow-arrow">➔</span>
            </div>
            <div class="debt-flow-amount-pill ${remainingDebt <= 0.01 ? 'settled' : ''}">
              ${remainingDebt > 0.01 ? `欠 ${SYM}${formatAmt(remainingDebt)}` : `✓ 已結清`}
            </div>
          </div>

          <!-- 收款方 -->
          <div class="debt-flow-party creditor">
            <div class="debt-flow-avatar-wrap">
              ${renderAvatarHTML({ id: creditorId, name: memberById[creditorId] }, "avatar-md")}
              <span class="debt-flow-role-badge creditor">收款</span>
            </div>
            <span class="debt-flow-name" title="${escapeHtml(memberById[creditorId] || "")}">${escapeHtml(memberById[creditorId] || "?")}</span>
          </div>
        </div>
      </div>

      <!-- 往來分頁切換器（有歷史結清存檔時顯示） -->
      ${totalCyclePages > 0 ? `
        <div class="debt-cycle-tabs">
          <button type="button" class="debt-cycle-tab ${olderCyclePage === 0 ? 'active' : ''}" id="matrixActiveCycleTab">
            🔥 進行中 (${visibleEvents.length})
          </button>
          <button type="button" class="debt-cycle-tab ${olderCyclePage > 0 ? 'active' : ''}" id="matrixHistoryCycleTab">
            📜 歷史存檔 (${totalCyclePages})
          </button>
        </div>
      ` : ""}

      <!-- 往來紀錄主體 -->
      <div class="debt-detail-section">
        <div class="debt-section-title">
          <span class="debt-section-icon">${olderCyclePage > 0 ? '📜' : '📋'}</span>
          <span>${olderCyclePage > 0 ? '歷史存檔' : '往來紀錄'}</span>
          <span class="debt-section-count">${olderCyclePage > 0 ? olderEvents.length : visibleEvents.length} 筆</span>
          <button type="button" class="ledger-sort-toggle-btn" id="matrixLedgerSortBtn" title="切換排序方向" aria-label="切換排序方向">
            ${ledgerSortAsc ? "⬇ 舊到新" : "⬆ 新到舊"}
          </button>
        </div>

        ${olderCyclePage > 0 ? `
          <!-- 歷史存檔步進卡片 -->
          <div class="debt-archive-stepper-card">
            <button type="button" class="archive-step-btn" id="matrixCyclePrevBtn" ${olderCyclePage >= totalCyclePages ? "disabled" : ""}>← 上一輪</button>
            <div class="archive-step-info">
              <span class="archive-step-title">第 ${displayRound} / ${totalCyclePages} 輪</span>
              <span class="archive-step-sub">已結清 ✓</span>
            </div>
            <button type="button" class="archive-step-btn" id="matrixCycleNextBtn" ${olderCyclePage <= 1 ? "disabled" : ""}>下一輪 →</button>
          </div>
        ` : ""}

        <div class="debt-expense-list ${((olderCyclePage > 0 ? olderEvents.length : visibleEvents.length) > 0) ? '' : 'is-empty'}">
  `;

  // ==========================================================
  // 往來紀錄：支出、還款依實際時間排列，每一筆都顯示自己原本的真實金額，
  // 後面附上「小計：走到這裡誰欠誰多少」——不做任何歸因或調整，最後一筆
  // 的小計保證跟上面權威欠款總表一致。
  // ==========================================================
  const renderTimelineCard = (ev) => {
    if(ev.type === "expense"){
      const e = ev.expense;
      const canEditExpense = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;
      const firstLine = getFirstLineDesc(e.description || "未命名支出");
      const isAiSplit = Boolean(e.description && (e.description.includes("<!--AI_RECEIPT_DATA:") || e.description.includes("(AI自動拆單)") || e.description.includes("📋 品項明細")));
      const isExpXcur = isXcurStr(e.description);
      const expXcurId = isExpXcur ? extractXcurId(e.description) : null;
      const catMeta = (window.getCategoryMeta && window.getCategoryMeta(firstLine, e.note, e.category)) || { icon: "🧾" };

      return `
        <div class="ledger-row-wrap ${rowWrapClass(ev)}" data-id="${e.id}">
          <div class="ledger-timeline-node is-expense" title="${catMeta.icon || '🧾'} 支出">${catMeta.icon || "🧾"}</div>
          <div class="ledger-row ledger-row-open-expense" data-id="${e.id}">
            <div class="ledger-row-header">
              <div class="ledger-row-name">
                ${escapeHtml(firstLine)}${isAiSplit ? '<span class="ai-split-badge" style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:6px;background:color-mix(in srgb, var(--btn-primary) 14%, var(--paper));color:var(--btn-primary);margin-left:5px;">🤖 AI</span>' : ""}${isExpXcur ? '<span class="xcur-badge">💱 跨幣轉入</span>' : ""}
              </div>
              <div class="ledger-row-amount ${rowColor(ev).cls}">${rowColor(ev).sign}${SYM}${formatAmt(ev.amount)}</div>
            </div>
            <div class="ledger-row-sub">
              <div class="ledger-row-date">
                ${escapeHtml(e.expense_date || "")}${formatTime(e.created_at, e.expense_date) ? " " + formatTime(e.created_at, e.expense_date) : ""}
              </div>
              ${canEditExpense ? `
                <div class="ledger-row-quick-actions">
                  ${isExpXcur ? `
                    ${expXcurId ? `<button type="button" class="exp-xcur-editrate" data-xcur="${expXcurId}" title="編輯匯率" aria-label="編輯匯率">✎</button>` : ""}
                    <button type="button" class="exp-del debt-exp-del exp-xcur-restore" data-id="${e.id}" title="還原這筆跨幣別轉移" aria-label="還原">↺</button>
                  ` : `
                    <button type="button" class="exp-edit debt-exp-edit" data-id="${e.id}" title="編輯" aria-label="編輯">✎</button>
                    <button type="button" class="exp-del debt-exp-del" data-id="${e.id}" title="刪除" aria-label="刪除">✕</button>
                  `}
                </div>
              ` : ""}
            </div>
            ${balanceText(ev.balanceForward, ev.balanceReverse, ev.forwardDelta, ev.reverseDelta)}
          </div>
        </div>
      `;
    }

    const r = ev.repayment;
    const amount = ev.amount;
    const canEditRepay = r.offset_group
      ? isRepaymentParty(r, myMember.id)
      : (isRepaymentParty(r, myMember.id) || r.created_by === myMember.id);
    const isRepXcur = isXcurStr(r.note) || isXcurStr(r.offset_group);
    const repXcurId = isRepXcur ? (r.offset_group || extractXcurId(r.note)) : null;
    return `
      <div class="ledger-row-wrap ${rowWrapClass(ev)}" data-id="${r.id}">
        <div class="ledger-timeline-node is-repay" title="💸 還款">💸</div>
        <div class="ledger-row" onclick="if(!event.target.closest('button')){this.closest('.ledger-row-wrap').classList.toggle('is-expanded')}">
          <div class="ledger-row-header">
            <div class="ledger-row-name">
              ${(r.offset_group && !isXcurStr(r.offset_group)) ? `<span class="champion-tag">抵銷</span> ` : ""}${escapeHtml(memberById[r.from_member] || "?")} 還 ${escapeHtml(memberById[r.to_member] || "?")}${(isXcurStr(r.note) || isXcurStr(r.offset_group)) ? '<span class="xcur-badge">💱 轉為臺幣</span>' : ""}
            </div>
            <div class="ledger-row-amount ${rowColor(ev).cls}">${rowColor(ev).sign}${SYM}${formatAmt(amount)}</div>
          </div>
          <div class="ledger-row-sub">
            <div class="ledger-row-date">
              ${escapeHtml(r.payment_date || "")}${formatTime(r.created_at, r.payment_date) ? " " + formatTime(r.created_at, r.payment_date) : ""}
            </div>
            ${canEditRepay ? `
              <div class="ledger-row-quick-actions">
                ${isRepXcur ? `
                  ${repXcurId ? `<button class="exp-xcur-editrate" data-xcur="${repXcurId}" title="編輯匯率" aria-label="編輯匯率">✎</button>` : ""}
                  <button class="exp-del ${r.offset_group ? "debt-repay-del-group" : "debt-repay-del"} exp-xcur-restore" data-id="${r.id}" data-group="${r.offset_group || ""}" title="還原這筆跨幣別轉移" aria-label="還原">↺</button>
                ` : `
                  ${!r.offset_group ? `<button class="exp-edit debt-repay-edit" data-id="${r.id}" title="編輯" aria-label="編輯">✎</button>` : ""}
                  <button class="exp-del ${r.offset_group ? "debt-repay-del-group" : "debt-repay-del"}" data-id="${r.id}" data-group="${r.offset_group || ""}" title="刪除" aria-label="刪除">✕</button>
                `}
              </div>
            ` : ""}
          </div>
          ${balanceText(ev.balanceForward, ev.balanceReverse, ev.forwardDelta, ev.reverseDelta)}
        </div>
        <div class="ledger-row-detail">
          <div class="debt-info-row">
            <span class="debt-info-label">記帳者</span>
            <div class="debt-info-value">${escapeHtml(memberById[r.created_by] || "?")}</div>
          </div>
          ${r.note ? `
            <div class="debt-info-row">
              <span class="debt-info-label">備註</span>
              <div class="debt-info-value">${escapeHtml(cleanXcurText(r.note))}</div>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  };

  if(olderCyclePage > 0){
    // 正在瀏覽歷史已結清存檔
    if(olderEvents.length){
      olderEvents.forEach(ev => { html += renderTimelineCard(ev); });
    }
  } else if(visibleEvents.length){
    // 正在瀏覽進行中
    visibleEvents.forEach(ev => { html += renderTimelineCard(ev); });
  } else if(remainingDebt > 0.01){
    // 目前這個方向沒有直接的支出/還款紀錄，但金額卻不是 0——代表這筆欠款
    // 是從對方那邊的多還／溢付轉過來的，不是憑空冒出來的錯誤。
    html += `
      <div class="debt-empty-state">
        <div class="debt-empty-icon">💸</div>
        <div class="debt-empty-title">
          尚有 ${SYM}${formatAmt(remainingDebt)} 待結清
        </div>
        <div class="debt-empty-text">
          目前沒有直接的支出紀錄，此筆款項代表 <b>${escapeHtml(memberById[creditorId] || "對方")}</b> 先前有多還／溢付的款項。
        </div>
      </div>
    `;
  } else {
    // 進行中目前已全數結清
    html += `
      <div class="debt-empty-state">
        <div class="debt-settled-stamp-wrap">
          <div class="debt-settled-stamp">
            <div class="stamp-inner">
              <span class="stamp-check">✓</span>
              <span class="stamp-text">ALL CLEARED</span>
              <span class="stamp-sub">已全數結清</span>
            </div>
          </div>
        </div>
        ${totalCyclePages > 0 ? `
          <button type="button" class="btn secondary small" id="matrixViewHistoryArchiveBtn" style="margin:10px auto 4px;display:block;white-space:nowrap;">
            📜 歷史結清存檔 (${totalCyclePages} 輪)
          </button>
        ` : ""}
      </div>
    `;
  }

  html += `
        </div>
      </div>
  `;

  // ==========================================================
  // 底部狀態與操作列
  // ==========================================================
  if(olderCyclePage > 0){
    // 歷史存檔底部
    html += `
      <div class="debt-archive-footer-card">
        <div class="archive-settled-text">✓ 此輪帳目已全數結清</div>
        <button type="button" class="btn secondary small" id="matrixBackToActiveBtn">↩ 返回進行中</button>
      </div>
    `;
  } else {
    // 進行中底部
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

    if(remainingDebt <= 0.01 && visibleEvents.length > 0){
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
      currentPairDetail = null;
    };
  }

  // ==========================================================
  // 往來紀錄排序方向切換（新到舊 / 舊到新）
  // ==========================================================
  const ledgerSortBtn = document.getElementById("matrixLedgerSortBtn");
  if(ledgerSortBtn){
    ledgerSortBtn.addEventListener("click", ()=>{
      ledgerSortAsc = !ledgerSortAsc;
      showPairDetail(debtorId, creditorId, expenses, repayments, owedMatrix);
    });
  }

  // ==========================================================
  // 進行中 vs 歷史存檔 分頁切換
  // ==========================================================
  const activeCycleTab = document.getElementById("matrixActiveCycleTab");
  if(activeCycleTab){
    activeCycleTab.addEventListener("click", ()=>{
      pairOlderCyclePageMap[pairKey] = 0;
      showPairDetail(debtorId, creditorId, expenses, repayments, owedMatrix);
    });
  }
  const historyCycleTab = document.getElementById("matrixHistoryCycleTab");
  if(historyCycleTab){
    historyCycleTab.addEventListener("click", ()=>{
      pairOlderCyclePageMap[pairKey] = 1;
      showPairDetail(debtorId, creditorId, expenses, repayments, owedMatrix);
    });
  }
  const viewHistoryArchiveBtn = document.getElementById("matrixViewHistoryArchiveBtn");
  if(viewHistoryArchiveBtn){
    viewHistoryArchiveBtn.addEventListener("click", ()=>{
      pairOlderCyclePageMap[pairKey] = 1;
      showPairDetail(debtorId, creditorId, expenses, repayments, owedMatrix);
    });
  }
  const backToActiveBtn = document.getElementById("matrixBackToActiveBtn");
  if(backToActiveBtn){
    backToActiveBtn.addEventListener("click", ()=>{
      pairOlderCyclePageMap[pairKey] = 0;
      showPairDetail(debtorId, creditorId, expenses, repayments, owedMatrix);
    });
  }

  // ==========================================================
  // 已結清的舊週期：上一輪／下一輪
  // ==========================================================
  const cyclePrevBtn = document.getElementById("matrixCyclePrevBtn");
  if(cyclePrevBtn){
    cyclePrevBtn.addEventListener("click", ()=>{
      if(olderCyclePage < totalCyclePages) pairOlderCyclePageMap[pairKey] = olderCyclePage + 1; // 上一輪 = 更早的一輪
      showPairDetail(debtorId, creditorId, expenses, repayments, owedMatrix);
    });
  }
  const cycleNextBtn = document.getElementById("matrixCycleNextBtn");
  if(cycleNextBtn){
    cycleNextBtn.addEventListener("click", ()=>{
      if(olderCyclePage > 1) pairOlderCyclePageMap[pairKey] = olderCyclePage - 1; // 下一輪 = 更接近現在的一輪
      showPairDetail(debtorId, creditorId, expenses, repayments, owedMatrix);
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
        fetchRateBtn.onclick = async ()=>{
          if(conversionRate){
            rateInput.value = conversionRate;
            updateCalculation();
            return;
          }
          const originalText = fetchRateBtn.textContent;
          fetchRateBtn.disabled = true;
          fetchRateBtn.textContent = "抓取中…";
          const rate = await fetchConversionRate();
          fetchRateBtn.disabled = false;
          fetchRateBtn.textContent = originalText;
          rateInput.value = rate || conversionRate || 1;
          updateCalculation();
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
            category: "xcur",
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
      twdSettleModal.classList.add("show");
    };
  }

  // ==========================================================
  // 點支出列（編輯/刪除按鈕以外的地方）直接開啟完整的支出明細彈出視窗。
  // 這裡要用 addEventListener 綁在這個閉包裡呼叫 showExpenseDebtDetail，
  // 不能用 inline onclick——app.js 整份包在最外層的 IIFE 裡，inline
  // onclick 是在全域作用域執行，看不到閉包內部的函式，之前就是這樣點了
  // 沒反應。
  // ==========================================================
  el.querySelectorAll(".ledger-row-open-expense").forEach(rowEl=>{
    rowEl.addEventListener("click", (evt)=>{
      if(evt.target.closest("button")) return;
      const e = expenses.find(x => x.id === rowEl.dataset.id);
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
      if(!e) return;
      el.style.display = "none";
      await deleteRowsWithUndo("expenses", e, refreshExpenses, getFirstLineDesc(e.description, e.note));
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

  el.querySelectorAll(".exp-xcur-editrate").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      el.style.display = "none";
      openXcurRateEditModal(btn.dataset.xcur);
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
        const groupRows = cachedRepayments.filter(x => x.offset_group === btn.dataset.group);
        if(!groupRows.length) return;
        el.style.display = "none";
        await deleteRowsWithUndo("repayments", groupRows, refreshExpenses, "抵銷紀錄");
      } else {
        if(!r) return;
        const label = `${memberById[r.from_member] || "?"} → ${memberById[r.to_member] || "?"}`;
        el.style.display = "none";
        await deleteRowsWithUndo("repayments", r, refreshExpenses, label);
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
      lines.push(toCSVRow(["日期","項目說明",`總金額(${SYM})`,"付款","應付","記帳者"]));
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
