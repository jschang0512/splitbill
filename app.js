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
    // 已登入時，先問清楚「目前啟用的群組是哪個」，查詢才只抓那個群組的
    // 名單。不然 RLS 為了讓設定頁的群組切換器能看到「自己在其他群組的
    // 那幾筆」，會連同其他群組、甚至已經退出的舊群組都一起回來，
    // 混進下拉選單/勾選清單裡變成憑空多出來的怪成員。
    let activeGroupId = null;
    if(currentUser){
      const { data: gid, error: gidError } = await sb.rpc("my_group_id");
      // 查「目前群組」這步失敗的話，寧可名單暫時是空的，也不要往下用沒有
      // group_id 篩選條件的查詢——那樣 RLS 會把使用者所有群組（包含已退出
      // 的）的成員都撈出來，混進成員清單裡，等於洩漏跨群組資料。
      if(gidError){
        console.error("讀取目前群組失敗：", gidError);
        MEMBERS = [];
        memberById = {};
        myMember = null;
        memberRows = [];
        return;
      }
      activeGroupId = gid;
    }
    let query = sb.from("members").select("id,user_id,group_id,name,nickname,email,shown_currencies,left_at,account_deleted_at,groups(name)").order("name");
    if(activeGroupId) query = query.eq("group_id", activeGroupId);
    const { data } = await query;
    MEMBERS = data || [];
    // 已退出／帳號已銷毀的成員，名字後面加上小字標籤方便分辨；
    // memberById 一律用完整名單建立，讓過去的支出/還款紀錄還是查得到名字。
    MEMBERS.forEach(m=>{
      m.accountName = m.name; // 保留帳號原始姓名（不含暱稱/標籤），設定頁「姓名」欄位要用
      if(m.nickname) m.name = m.nickname; // 這個群組如果有另外設定暱稱，畫面上一律優先顯示暱稱
      if(m.account_deleted_at) m.name = m.name + " (銷毀)";
      else if(m.left_at) m.name = m.name + " (退出)";
    });
    memberById = {};
    MEMBERS.forEach(m => memberById[m.id] = m.name);
    myMember = currentUser ? MEMBERS.find(m => m.user_id === currentUser.id && !m.left_at) : null;
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
    return !!loginTime && (Date.now() - loginTime > SESSION_DURATION_MS);
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

  document.querySelectorAll('.split-mode-btn[data-filter-type]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll('.split-mode-btn[data-filter-type]').forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const isExpense = btn.dataset.filterType === "expense";
      document.getElementById("filterExpenseFields").classList.toggle("hidden", !isExpense);
      document.getElementById("filterRepayFields").classList.toggle("hidden", isExpense);
      const body = document.getElementById("filterBody");
      if(body && body.classList.contains("open")) body.style.maxHeight = body.scrollHeight + "px";
    });
  });

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
        alert("開啟通知失敗，請稍後再試一次。");
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
      alert("通知被瀏覽器封鎖了，程式沒辦法自己打開，要自己去手動解除：\n\n手機：瀏覽器選單 → 網站設定（或「這個網站的權限」）→ 通知 → 改成允許\n電腦：網址列左邊的鎖頭／ⓘ 圖示 → 通知 → 改成允許\n\n改完之後重新整理網頁就可以了。");
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

    const actor = memberById[row.created_by] || "有人";
    let title, body;
    if(table === "expenses"){
      title = payload.eventType === "INSERT" ? "📋 新增支出" : "📋 支出更新";
      body = `${actor}：「${row.description}」${SYM}${formatAmt(row.amount)}`;
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

    const whoami = document.getElementById("whoamiName");
    if(whoami){
      const groupName = myMember.groups && myMember.groups.name;
      whoami.textContent = (myMember.name || emailToName(user.email)) + (groupName ? ` (${groupName})` : "");
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
        const initial = (m.name || "?").trim().charAt(0);
        label.innerHTML = `<input type="checkbox" value="${m.id}"><span class="check-pill-avatar">${escapeHtml(initial)}</span><span class="check-pill-name">${escapeHtml(m.name)}</span>`;
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
    if(expAmtInp){
      expAmtInp.addEventListener("input", ()=>{
        updatePayerSumCheck(); updateShareSumCheck();
      });
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
      document.getElementById("expSharesCustom").classList.toggle("hidden", splitMode !== "custom");
      document.getElementById("shareSumCheck").textContent = "";
      if(splitMode === "custom") updateShareSumCheck();
    });
  });

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
    const initial = (m.name || "?").trim().charAt(0);
    label.innerHTML = `<input type="checkbox" value="${m.id}"${checked ? " checked" : ""}><span class="check-pill-avatar">${escapeHtml(initial)}</span><span class="check-pill-name">${escapeHtml(m.name)}</span>`;
    label.querySelector("input").addEventListener("change", (e)=>{
      label.classList.toggle("checked", e.target.checked);
      label.classList.remove("sb-bounce");
      void label.offsetWidth;
      label.classList.add("sb-bounce");
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
    const btn = inp.closest(".amt-row").querySelector(".amt-row-calc-btn");
    if(btn) btn.classList.remove("has-calc");
  }
  function applyRowCalc(inp, calc){
    const btn = inp.closest(".amt-row").querySelector(".amt-row-calc-btn");
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
            calcTargetInput.closest(".amt-row").querySelector(".amt-row-calc-btn").classList.add("has-calc");
            const containerId = calcTargetInput.closest("#expPayers") ? "expPayers" : "expSharesCustom";
            if(containerId === "expPayers") updatePayerSumCheck(); else updateShareSumCheck();
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
    const total = Number(document.getElementById("expAmount").value) || 0;
    const sum = readAmountRows("expPayers").reduce((s,p)=>s+p.amount, 0);
    document.getElementById("payerSumCheck").innerHTML = sumCheckHTML(total, sum);
  }
  function updateShareSumCheck(){
    if(splitMode !== "custom") return;
    const total = Number(document.getElementById("expAmount").value) || 0;
    const sum = readAmountRows("expSharesCustom").reduce((s,p)=>s+p.amount, 0);
    document.getElementById("shareSumCheck").innerHTML = sumCheckHTML(total, sum);
  }

  const addExpBtn = document.getElementById("addExpenseBtn");
  if(addExpBtn){
    addExpBtn.addEventListener("click", async ()=>{
      const amount = Number(document.getElementById("expAmount").value);
      const description = document.getElementById("expDesc").value.trim();
      const expense_date = document.getElementById("expDate").value;
      const msg = document.getElementById("expMsg");

      if(!amount || amount <= 0){ msg.textContent = "請輸入正確金額"; msg.className = "msg error"; return; }
      if(!Number.isInteger(amount)){ msg.textContent = "金額請輸入整數，不支援小數點"; msg.className = "msg error"; return; }
      if(!description){ msg.textContent = "請輸入項目說明"; msg.className = "msg error"; return; }

      let payers;
      if(payerMode === "single"){
        payers = [{ member_id: document.getElementById("expPaidBySingle").value, amount }];
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

        // 編輯模式下，如果金額、分攤名單都跟原本一模一樣，直接沿用原本存的
        // 每人分攤金額，不要重新隨機分配零頭——不然「編輯一筆平分支出、
        // 什麼都沒改就存檔」會悄悄把那 1 塊零頭換給別人吸收，歷史紀錄
        // 在使用者沒感覺到任何改動的情況下憑空變了。
        const origShares = editingExpenseOriginal && editingExpenseOriginal.shares;
        const sameParticipants = origShares && origShares.length === participants.length &&
          new Set(origShares.map(s => s.member_id)).size === participants.length &&
          participants.every(id => origShares.some(s => s.member_id === id));
        const sameAmount = origShares && Math.abs(Number(editingExpenseOriginal.amount) - amount) < 0.005;

        if(editingExpenseId && sameParticipants && sameAmount){
          shares = origShares.map(s => ({ member_id: s.member_id, amount: Number(s.amount) }));
        } else {
          // 除不盡的零頭，優先隨機分給「沒付錢的人」，付款人只有在
          // 沒付錢的人不夠分完零頭時，才會被迫也多分到 1 塊。
          const n = participants.length;
          const base = Math.floor(amount / n);
          const remainder = Math.round(amount - base * n);

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
          participants.forEach(id => { shareAmt[id] = base; });
          priority.slice(0, remainder).forEach(id => { shareAmt[id] += 1; });

          shares = participants.map(id => ({ member_id: id, amount: shareAmt[id] }));
        }
      } else {
        shares = readAmountRows("expSharesCustom");
        if(!shares.length){ msg.textContent = "至少要有一個人分攤"; msg.className = "msg error"; return; }
        const shareSum = shares.reduce((s,p)=>s+p.amount, 0);
        if(Math.abs(shareSum - amount) >= 0.5){
          const diff = Math.round((amount - shareSum) * 100) / 100;
          msg.textContent = diff > 0
            ? `分攤總額還差 ${SYM}${formatAmt(diff)}，跟支出金額 ${SYM}${formatAmt(amount)} 對不上，無法加入`
            : `分攤總額超過 ${SYM}${formatAmt(Math.abs(diff))}，跟支出金額 ${SYM}${formatAmt(amount)} 對不上，無法加入`;
          msg.className = "msg error";
          return;
        }
      }

      // 防手滑：10 分鐘內有一筆金額、說明都一樣的支出，跳出確認提示
      if(!editingExpenseId){
        const now = Date.now();
        const dup = cachedExpenses.find(e =>
          Math.abs(Number(e.amount) - amount) < 0.01 &&
          e.description.trim().toLowerCase() === description.toLowerCase() &&
          e.created_at && (now - new Date(e.created_at).getTime()) < 10 * 60 * 1000
        );
        if(dup && !confirm(`10 分鐘內已經有一筆一樣的「${description}」${SYM}${formatAmt(amount)}，是不是手滑重複記錄了？\n\n按「確定」會繼續新增這一筆，按「取消」則不新增。`)){
          return;
        }
      }

      const payload = { amount, description, expense_date, created_by: myMember.id, payers, shares, currency: CURRENCY };
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
      document.getElementById("expAmount").value = "";
      document.getElementById("expDesc").value = "";
      document.querySelectorAll("#expPayers .amt-row-input, #expSharesCustom .amt-row-input").forEach(i=>{ i.value=""; clearRowCalc(i); });
      document.getElementById("payerSumCheck").innerHTML = "";
      document.getElementById("shareSumCheck").innerHTML = "";
      await refreshExpenses();
    });
  }

  // ---------- edit expense ----------
  let editingExpenseId = null;
  let editingExpenseOriginal = null;

  function startEditExpense(e){
    clearTempEditOptions();
    editingExpenseId = e.id;
    editingExpenseOriginal = e;
    document.getElementById("editBanner").classList.remove("hidden");
    document.getElementById("expFormTitle").textContent = "✎ 編輯支出";
    document.getElementById("addExpenseBtn").textContent = "更新這筆支出";

    document.getElementById("expAmount").value = e.amount;
    document.getElementById("expDesc").value = e.description;
    document.getElementById("expDate").value = e.expense_date;

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
    clearTempEditOptions();
  }

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  if(cancelEditBtn){
    cancelEditBtn.addEventListener("click", ()=>{
      exitEditMode();
      document.getElementById("addExpenseBtn").textContent = "加入這筆支出";
      document.getElementById("expAmount").value = "";
      document.getElementById("expDesc").value = "";
      document.querySelectorAll("#expPayers .amt-row-input, #expSharesCustom .amt-row-input").forEach(i=>{ i.value=""; clearRowCalc(i); });
      document.getElementById("payerSumCheck").innerHTML = "";
      document.getElementById("shareSumCheck").innerHTML = "";
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

  const HISTORY_PAGE_SIZE = 5;
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
    if(keyword && !e.description.toLowerCase().includes(keyword)) return false;
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
    const totalPages = Math.ceil(expenses.length / HISTORY_PAGE_SIZE);
    if(expensePage >= totalPages) expensePage = totalPages - 1;
    if(expensePage < 0) expensePage = 0;
    const pageItems = expenses.slice(expensePage * HISTORY_PAGE_SIZE, (expensePage + 1) * HISTORY_PAGE_SIZE);

    expenseById = {};
    pageItems.forEach(e => { expenseById[e.id] = e; });

    el.innerHTML = pageItems.map(e=>{
      const canEdit = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;
      const payerText = (e.payers || []).map(p => `${escapeHtml(memberById[p.member_id] || "?")}${SYM}${formatAmt(p.amount)}${p.calc ? `（${p.calc}）` : ""}`).join("、");
      const shareText = (e.shares || []).map(s => `${escapeHtml(memberById[s.member_id] || "?")}${SYM}${formatAmt(s.amount)}${s.calc ? `（${s.calc}）` : ""}`).join("、");
      return `<div class="exp-item">
        <div class="exp-main">
          <div class="exp-desc">${escapeHtml(e.description)}</div>
          <div class="exp-meta">
            <span class="exp-meta-line">紀錄時間：${e.expense_date}${formatTime(e.created_at, e.expense_date) ? " " + formatTime(e.created_at, e.expense_date) : ""}（${escapeHtml(memberById[e.created_by] || "?")}）</span>
            <span class="exp-meta-line">付款：${payerText}</span>
            <span class="exp-meta-line">應付：${shareText}</span>
          </div>
        </div>
        <div class="exp-right">
          <div class="exp-amt">${SYM}${formatAmt(e.amount)}${conversionHint(e.amount)}</div>
          ${canEdit ? `<div class="exp-actions"><button class="exp-edit" data-id="${e.id}" title="編輯">✎</button><button class="exp-del" data-id="${e.id}" title="刪除">✕</button></div>` : ""}
        </div>
      </div>`;
    }).join("") + paginationHTML(expensePage, totalPages);
    el.querySelectorAll(".exp-del").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        if(!confirm("確定要刪除這筆紀錄嗎？")) return;
        const { error } = await sb.from("expenses").delete().eq("id", btn.dataset.id);
        if(error){ alert("刪除失敗：" + error.message); return; }
        await refreshExpenses();
      });
    });
    el.querySelectorAll(".exp-edit").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const e = expenseById[btn.dataset.id];
        if(e) startEditExpense(e);
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
    const totalPages = Math.ceil(units.length / HISTORY_PAGE_SIZE);
    if(repaymentPage >= totalPages) repaymentPage = totalPages - 1;
    if(repaymentPage < 0) repaymentPage = 0;
    const pageUnits = units.slice(repaymentPage * HISTORY_PAGE_SIZE, (repaymentPage + 1) * HISTORY_PAGE_SIZE);

    repaymentById = {};
    pageUnits.forEach(u => u.items.forEach(r => { repaymentById[r.id] = r; }));

    el.innerHTML = pageUnits.map(u=>{
      if(u.type === "offset"){
        const [a, b] = u.items;
        // 一鍵抵銷刻意不比照一般支出/還款開放給「記錄者」刪除——抵銷本來就是
        // 兩人互相同意才會按的操作，只有debt關係的雙方才能撤銷。
        const canEdit = isRepaymentParty(a, myMember.id);
        return `<div class="exp-item">
          <div class="exp-main">
            <div class="exp-desc">🔄 ${escapeHtml(memberById[a.from_member] || "?")} ↔ ${escapeHtml(memberById[a.to_member] || "?")} 互相抵銷</div>
            <div class="exp-meta">紀錄時間：${a.payment_date}${formatTime(a.created_at, a.payment_date) ? " " + formatTime(a.created_at, a.payment_date) : ""}（${escapeHtml(memberById[a.created_by] || "?")}）</div>
          </div>
          <div class="exp-right">
            <div class="exp-amt">${SYM}${formatAmt(a.amount)}${conversionHint(a.amount)}</div>
            ${canEdit ? `<div class="exp-actions"><button class="exp-del exp-del-group" data-group="${a.offset_group}" title="刪除這組抵銷">✕</button></div>` : ""}
          </div>
        </div>`;
      }
      const r = u.items[0];
      const canEdit = isRepaymentParty(r, myMember.id) || r.created_by === myMember.id;
      return `<div class="exp-item">
        <div class="exp-main">
          <div class="exp-desc">${escapeHtml(memberById[r.from_member] || "?")} 還 ${escapeHtml(memberById[r.to_member] || "?")}</div>
          <div class="exp-meta">紀錄時間：${r.payment_date}${formatTime(r.created_at, r.payment_date) ? " " + formatTime(r.created_at, r.payment_date) : ""}（${escapeHtml(memberById[r.created_by] || "?")}）${r.note ? " ・ " + escapeHtml(r.note) : ""}</div>
        </div>
        <div class="exp-right">
          <div class="exp-amt">${SYM}${formatAmt(r.amount)}${conversionHint(r.amount)}</div>
          ${canEdit ? `<div class="exp-actions"><button class="exp-edit" data-id="${r.id}" title="編輯">✎</button><button class="exp-del" data-id="${r.id}" title="刪除">✕</button></div>` : ""}
        </div>
      </div>`;
    }).join("") + paginationHTML(repaymentPage, totalPages);
    el.querySelectorAll(".exp-edit").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const r = repaymentById[btn.dataset.id];
        if(r) startEditRepayment(r);
      });
    });
    el.querySelectorAll(".exp-del:not(.exp-del-group)").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        if(!confirm("確定要刪除這筆還款紀錄嗎？")) return;
        const { error } = await sb.from("repayments").delete().eq("id", btn.dataset.id);
        if(error){ alert("刪除失敗：" + error.message); return; }
        await refreshExpenses();
      });
    });
    el.querySelectorAll(".exp-del-group").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        if(!confirm("確定要刪除這組抵銷紀錄嗎？")) return;
        const { error } = await sb.from("repayments").delete().eq("offset_group", btn.dataset.group);
        if(error){ alert("刪除失敗：" + error.message); return; }
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
  // 計算這一組債務的組成與還款紀錄（依時間軸，排除上次結清前的舊明細）
  // 規則：
  // 1. 欠款部分：debtor 欠 creditor 的支出分攤，以及 creditor 轉帳/代墊給 debtor 的款項
  // 2. 還款部分：debtor 還給 creditor 的還款（不含反向還款）
  // 3. 過去若曾結清（欠款降為 0），則結清前的舊支出與舊還款不再顯示，只顯示目前這輪尚未結清的明細
  // ==========================================================

  // 1. 收集所有與 debtorId 和 creditorId 相關的所有事件（支出與還款）
  const allEvents = [];

  expenses.forEach(e => {
    const d1 = expensePairDebt(e, debtorId, creditorId);
    const d2 = expensePairDebt(e, creditorId, debtorId);
    if(d1 > 0.005 || d2 > 0.005){
      allEvents.push({
        type: "expense",
        date: e.expense_date || "",
        createdAt: e.created_at || "",
        expense: e,
        d1, // debtorId 欠 creditorId
        d2, // creditorId 欠 debtorId
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
        allEvents.push({
          type: "repayment_debtor_to_creditor",
          date: r.payment_date || "",
          createdAt: r.created_at || "",
          repayment: r,
          amount,
          id: r.id
        });
      } else if(from === creditorId && to === debtorId){
        allEvents.push({
          type: "repayment_creditor_to_debtor",
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
  allEvents.sort((a, b) => {
    if(a.date !== b.date) return a.date.localeCompare(b.date);
    if(a.createdAt && b.createdAt && a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    const aIsExp = a.type === "expense" ? 0 : 1;
    const bIsExp = b.type === "expense" ? 0 : 1;
    return aIsExp - bIsExp;
  });

  // 3. 沿時間軸追蹤雙向債務與活躍明細清單（與 buildDebtMatrix 100% 同步）
  let debtorOwesCreditor = 0; // debtorId 欠 creditorId
  let creditorOwesDebtor = 0; // creditorId 欠 debtorId
  let activeDebtItems = [];   // 構成 debtorOwesCreditor 的明細 (支出分攤 或 轉帳代墊)
  let activeRepayments = [];  // 用來沖抵 debtorOwesCreditor 的還款明細

  for(const ev of allEvents){
    if(ev.type === "expense"){
      if(ev.d1 > 0.005){
        debtorOwesCreditor += ev.d1;
        activeDebtItems.push({
          type: "expense",
          expense: ev.expense,
          amount: ev.d1,
          date: ev.date,
          createdAt: ev.createdAt,
          id: ev.id
        });
      }
      if(ev.d2 > 0.005){
        creditorOwesDebtor += ev.d2;
      }
    } else if(ev.type === "repayment_debtor_to_creditor"){
      // debtorId 還錢給 creditorId
      let rem = ev.amount;
      const paid = Math.min(debtorOwesCreditor, rem);
      if(paid > 0.005){
        debtorOwesCreditor -= paid;
        rem -= paid;
        activeRepayments.push({
          repayment: ev.repayment,
          amount: paid,
          date: ev.date,
          createdAt: ev.createdAt,
          id: ev.id
        });
        if(debtorOwesCreditor <= 0.005){
          // 欠款已全數還完（結清），重置活躍清單，之前的明細不留到下一輪
          debtorOwesCreditor = 0;
          activeDebtItems = [];
          activeRepayments = [];
        }
      }
      if(rem > 0.005){
        // 多還的溢繳款，反向變成 creditorId 欠 debtorId
        creditorOwesDebtor += rem;
      }
    } else if(ev.type === "repayment_creditor_to_debtor"){
      // creditorId 轉帳/代墊/還款給 debtorId
      let rem = ev.amount;
      const paid = Math.min(creditorOwesDebtor, rem);
      if(paid > 0.005){
        creditorOwesDebtor -= paid;
        rem -= paid;
      }
      if(rem > 0.005){
        // 超過當前反向欠款的金額，形成 debtorId 欠 creditorId 的新債務
        debtorOwesCreditor += rem;
        activeDebtItems.push({
          type: "advance",
          repayment: ev.repayment,
          amount: rem,
          date: ev.date,
          createdAt: ev.createdAt,
          id: ev.id
        });
      }
    }
  }

  // 4. 排序展示清單（最新在最前）
  // 嚴格分區：支出欠款歸「債務組成」，還款轉帳歸「還款紀錄」
  const detailExpenses = activeDebtItems
    .filter(x => x.type === "expense")
    .sort((a, b) => {
      if(b.date !== a.date) return b.date.localeCompare(a.date);
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  // 收集屬於本輪欠款沖銷的還款與抵銷紀錄（結清前的舊還款不混入）
  const detailRepayments = activeRepayments
    .map(x => x.repayment)
    .sort((a, b) => {
      if(b.payment_date !== a.payment_date) return b.payment_date.localeCompare(a.payment_date);
      return (b.created_at || "").localeCompare(a.created_at || "");
    });


  // ==========================================================
  // 金額統計
  // ==========================================================
  //
  // 尚欠金額直接讀 buildDebtMatrix() 算出來的結果，
  // 這樣才會跟債務關係表格子上的數字、以及「還款多找零」
  // 產生的反向欠款，永遠保持一致。
  // ==========================================================

  const owed = buildDebtMatrix(expenses, repayments);

  const remainingDebt =
    (owed[creditorId] && owed[creditorId][debtorId]) || 0;

  // 反方向的欠款：creditorId 這邊如果也欠 debtorId 錢，代表兩人互相欠款，
  // 可以讓使用者一鍵抵銷，不用各自記一筆現金支付。
  const reverseDebt =
    (owed[debtorId] && owed[debtorId][creditorId]) || 0;
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

            <span class="debt-person debtor">
              ${escapeHtml(
                memberById[debtorId] || "?"
              )}
            </span>

            <span class="debt-arrow">
              欠
            </span>

            <span class="debt-person creditor">
              ${escapeHtml(
                memberById[creditorId] || "?"
              )}
            </span>

          </div>

        </div>


        <button
          type="button"
          id="matrixDetailClose"
          class="debt-detail-close"
          aria-label="關閉"
        >
          ×
        </button>

      </div>


      <!-- 債務組成（純支出欠款） -->
      <div class="debt-detail-section">

        <div class="debt-section-title">

          <span class="debt-section-icon">
            📋
          </span>

          <span>
            債務組成
          </span>

          <span class="debt-section-count">
            ${detailExpenses.length} 筆
          </span>

        </div>


        <div class="debt-expense-list">
  `;


  // ==========================================================
  // 支出紀錄（欠款歸欠款）
  // ==========================================================

  if(detailExpenses.length){

    detailExpenses.forEach(item => {

      const e = item.expense;
      const canEditExpense = isExpenseParty(e, myMember.id) || e.created_by === myMember.id;

      const payerText =
        (e.payers || [])
          .map(p =>
            `${escapeHtml(
              memberById[p.member_id] || "?"
            )} ${SYM}${formatAmt(p.amount)}${p.calc ? ` <span class="debt-calc-note">(${escapeHtml(p.calc)})</span>` : ""}`
          )
          .join("、");

      const shareText =
        (e.shares || [])
          .map(s => {
            const isTargetDebtor = s.member_id === debtorId;
            const name = escapeHtml(memberById[s.member_id] || "?");
            const calc = s.calc ? ` <span class="debt-calc-note">(${escapeHtml(s.calc)})</span>` : "";
            if(isTargetDebtor){
              return `<b class="debt-highlight-debtor">${name} ${SYM}${formatAmt(s.amount)}</b>${calc}`;
            }
            return `${name} ${SYM}${formatAmt(s.amount)}${calc}`;
          })
          .join("、");

      html += `
        <div class="debt-expense-card">
          <div class="debt-expense-top">
            <div class="debt-expense-info">
              <div class="debt-expense-name">
                ${escapeHtml(e.description || "未命名支出")}
              </div>
              <div class="debt-expense-date">
                ${escapeHtml(e.expense_date || "")}${formatTime(e.created_at, e.expense_date) ? " " + formatTime(e.created_at, e.expense_date) : ""}（${escapeHtml(memberById[e.created_by] || "?")}）
              </div>
            </div>
            ${canEditExpense ? `
              <div class="debt-expense-actions">
                <button type="button" class="exp-edit debt-exp-edit" data-id="${e.id}" title="編輯" aria-label="編輯">✎</button>
                <button type="button" class="exp-del debt-exp-del" data-id="${e.id}" title="刪除" aria-label="刪除">✕</button>
              </div>
            ` : ""}
          </div>
          <div class="debt-expense-divider"></div>
          <div class="debt-expense-detail">
            <div class="debt-info-row">
              <span class="debt-info-label">付款人</span>
              <span class="debt-info-value">${payerText || "—"}</span>
            </div>
            <div class="debt-info-row">
              <span class="debt-info-label">分攤</span>
              <span class="debt-info-value">${shareText || "—"}</span>
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

    });

  }else{

    html += `

      <div class="debt-empty-state">

        <div class="debt-empty-icon icon-positive">
          ✓
        </div>

        <div class="debt-empty-title">
          找不到相關支出
        </div>

        <div class="debt-empty-text">
          ${
            detailRepayments.length
              ? "這兩人之間沒有共同的支出欠款紀錄，相關還款請見下方「已還款紀錄」。"
              : "目前沒有找到形成這筆債務的支出紀錄。"
          }
        </div>

      </div>

    `;

  }


  html += `

        </div>

      </div>


      <!-- 還款紀錄（還款紀錄歸還款紀錄） -->

  `;


  if(detailRepayments.length){

    html += `

      <div class="debt-detail-section repayment-section">

        <div class="debt-section-title">

          <span class="debt-section-icon">
            💸
          </span>

          <span>
            已還款紀錄
          </span>

          <span class="debt-section-count">
            ${detailRepayments.length} 筆
          </span>

        </div>


        <div class="debt-repayment-list">

    `;


    detailRepayments.forEach(r => {

      const amount =
        Number(r.amount) || 0;
      // 一鍵抵銷維持只有 debt 關係雙方能刪，一般還款則放寬給記錄者也能改/刪。
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

              ${r.offset_group ? `<span class="champion-tag">抵銷</span>` : ""}

              ${escapeHtml(
                memberById[r.from_member] || "?"
              )}

              <span>還</span>

              ${escapeHtml(
                memberById[r.to_member] || "?"
              )}

            </div>


            <div class="debt-repayment-meta">

              ${escapeHtml(
                r.payment_date || ""
              )}${formatTime(r.created_at, r.payment_date) ? " " + formatTime(r.created_at, r.payment_date) : ""}（${escapeHtml(memberById[r.created_by] || "?")}）

              ${
                (r.note && !r.offset_group)
                  ? ` ・ ${escapeHtml(r.note)}`
                  : ""
              }

            </div>

          </div>


          <div class="debt-repayment-right">

            <div class="debt-repayment-amount">
              -${SYM}${formatAmt(amount)}
            </div>

            ${canEditRepay ? `<div class="exp-actions">
              ${!r.offset_group ? `<button class="exp-edit debt-repay-edit" data-id="${r.id}" title="編輯">✎</button>` : ""}
              <button class="exp-del ${r.offset_group ? "debt-repay-del-group" : "debt-repay-del"}" data-id="${r.id}" data-group="${r.offset_group || ""}" title="刪除">✕</button>
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
  // 底部狀態
  // ==========================================================

  if(offsetAmt > 0.01){

    // 抵銷只開放給這筆債務的關係人（債權人或債務人本人），其他人只看得到說明文字。
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

        <span class="debt-cleared-icon">
          ✓
        </span>

        <span>
          這筆債務已全部結清
        </span>

      </div>

    `;

  }

  if(remainingDebt > 0.01){
    html += `
      <div class="debt-repay-action-wrap">
        <button type="button" class="btn btn-repay-direct" id="matrixDetailRepayBtn" data-debtor="${debtorId}" data-creditor="${creditorId}" data-amt="${remainingDebt}">
          💸 記錄還款（${escapeHtml(memberById[debtorId] || "?")} 還 ${escapeHtml(memberById[creditorId] || "?")} ${SYM}${formatAmt(remainingDebt)}）
        </button>
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
      if(!confirm("確定要刪除這筆支出紀錄嗎？")) return;
      const { error } = await sb.from("expenses").delete().eq("id", btn.dataset.id);
      if(error){ alert("刪除失敗：" + error.message); return; }
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

  el.querySelectorAll(".debt-repay-del").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!confirm("確定要刪除這筆還款紀錄嗎？")) return;
      const { error } = await sb.from("repayments").delete().eq("id", btn.dataset.id);
      if(error){ alert("刪除失敗：" + error.message); return; }
      el.style.display = "none";
      await refreshExpenses();
    });
  });

  el.querySelectorAll(".debt-repay-del-group").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!confirm("確定要刪除這組抵銷紀錄嗎？")) return;
      const { error } = await sb.from("repayments").delete().eq("offset_group", btn.dataset.group);
      if(error){ alert("刪除失敗：" + error.message); return; }
      el.style.display = "none";
      await refreshExpenses();
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

      if(!confirm(`確定要抵銷 ${SYM}${formatAmt(offsetAmt)} 嗎？兩人互相的欠款將互相沖銷。`)) return;

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
        alert("抵銷失敗：" + error.message);
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
