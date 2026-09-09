// ============================================================
// Split Bill — shared app logic, used by currency.html (?c=TWD/JPY/USD/...).
// ============================================================
(function(){
  // 檢查 Supabase SDK 是否成功載入 (防止 CDN 被阻擋導致全頁空白)
  if(typeof window.supabase === "undefined"){
    if(typeof hidePwaSplash === "function") hidePwaSplash();
    const warn = document.getElementById("configWarning");
    if(warn){
      warn.innerHTML = "<h2>" + t("summary.configLoadFailTitle") + "</h2><p class='config-warning-text'>" + t("summary.configLoadFailText") + "</p>";
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
  window.sb = sb;
  const SYM = CURRENCY_SYMBOL;

  // 帳密登入/註冊/忘記密碼/連結帳號失敗時，先判斷是不是幾種已知的常見情況，
  // 不然會顯示 Supabase 原始的英文錯誤，或被誤會成帳號密碼打錯。回傳 null
  // 代表不是這幾種情況，呼叫的地方應該照原本的訊息處理。
  // （登入/註冊本身已經搬去 index.html，這裡只有連結 Google/Discord 帳號會用到。）
  function friendlyAuthErr(error){
    const msg = (error && error.message) || "";
    if(/captcha/i.test(msg)) return t("currency.authErrCaptcha");
    if(/already linked|already exists/i.test(msg)) return t("summary.authErrAlreadyLinked");
    return null;
  }

  // ---------- 全站統一優雅自訂彈窗 (取代瀏覽器原生 alert / confirm) ----------
  function showSbDialog({ title = t("common.notifyDialogTitle"), message = "", confirmText = t("common.confirm"), cancelText = null }){
    return new Promise(resolve => {
      let modal = document.getElementById("sbDialogModal");
      if(!modal){
        modal = document.createElement("div");
        modal.id = "sbDialogModal";
        modal.className = "calc-modal sb-dialog-modal";
        modal.innerHTML = `
          <div class="calc-card card sb-dialog-card">
            <div class="sb-dialog-header">
              <div class="sb-dialog-title" id="sbDialogTitle">${t("common.notifyDialogTitle")}</div>
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

  function sbAlert(message, title = t("common.notifyDialogTitle")){
    return showSbDialog({ title, message, confirmText: t("common.confirm") });
  }

  function sbConfirm(message, title = t("common.confirmDialogTitle")){
    return showSbDialog({ title, message, confirmText: t("common.confirm"), cancelText: t("common.cancel") });
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
      btn.setAttribute("aria-label", show ? t("login.hidePassword") : t("login.showPassword"));
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
    el.textContent = t("currency.exchangeRateHint", {sym: CURRENCY_SYMBOL, rate: rateText});
    el.classList.remove("hidden");
  }
  fetchConversionRate();

  // 📈 匯率走勢：點「即時匯率」那行文字跳出走勢圖（週/月/年可切換）。歷史匯率用
  // fawazahmed0/currency-api（本來就是 fetchConversionRate() 的備援來源之一，
  // 免費、不用 API Key、支援指定日期查詢：把版本號從 "latest" 換成
  // "YYYY-MM-DD" 就能查那天的匯率）——open.er-api.com 那個主要來源沒有
  // 免費的歷史查詢，所以走勢圖這裡只用得到後面這兩個 CDN 來源。
  function fetchHistoricalRate(code, dateStr){
    const lc = code.toLowerCase();
    const sources = [
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/${lc}.json`,
      `https://${dateStr}.currency-api.pages.dev/v1/currencies/${lc}.json`
    ];
    function tryFetch(i){
      if(i >= sources.length) return Promise.resolve(null);
      return fetch(sources[i])
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          const rate = data && data[lc] && data[lc].twd;
          return (rate === undefined || rate === null) ? null : rate;
        })
        .catch(()=> tryFetch(i+1));
    }
    return tryFetch(0);
  }
  // sampleEvery：年區間如果每天都查會是 365 支平行請求，改成每隔幾天抽一筆
  // （年＝每 7 天一筆，約 52 個點），畫趨勢線夠用、也不用真的發那麼多請求。
  async function fetchRateHistory(code, days, sampleEvery){
    sampleEvery = sampleEvery || 1;
    const dates = [];
    const now = new Date();
    for(let i = days - 1; i >= 0; i -= sampleEvery){
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const results = await Promise.all(dates.map(dateStr =>
      fetchHistoricalRate(code, dateStr).then(rate => ({ date: dateStr, rate }))
    ));
    // 抓不到的那天（例如太久以前這個服務還沒開始記錄）直接跳過，不強湊假資料。
    return results.filter(r => r.rate !== null && r.rate !== undefined && r.rate > 0);
  }

  const RATE_TREND_RANGE_CONFIG = {
    week:  { days: 7,   sampleEvery: 1 },
    month: { days: 30,  sampleEvery: 1 },
    year:  { days: 365, sampleEvery: 7 }
  };
  let rateTrendRange = "month";
  let rateTrendPoints = []; // 目前畫在圖上的點（含 x/y/date/rate），滑鼠/手指移動時查最近的點用

  function formatTrendDate(dateStr){
    return dateStr.slice(5).replace("-", "/");
  }

  function renderRateTrendChart(history){
    const bodyEl = document.getElementById("exchangeRateTrendBody");
    if(!bodyEl) return;
    if(!history.length){
      bodyEl.innerHTML = `<p class="filter-hint">${t("currency.rateTrendFailed")}</p>`;
      return;
    }

    const rateLabel = v => v >= 1
      ? v.toLocaleString("zh-TW", { maximumFractionDigits: 2 })
      : v.toLocaleString("zh-TW", { maximumFractionDigits: 4 });

    const rates = history.map(h => h.rate);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const range = (max - min) || (max * 0.02) || 1; // min===max（例如只抓到 1 筆）時避免除以零

    const w = 320, h = 140, padX = 6, padTop = 18, padBottom = 24;
    const plotW = w - padX * 2;
    const plotH = h - padTop - padBottom;
    const n = history.length;

    rateTrendPoints = history.map((pt, i) => ({
      x: n === 1 ? padX + plotW / 2 : padX + (i / (n - 1)) * plotW,
      y: padTop + plotH - ((pt.rate - min) / range) * plotH,
      ...pt
    }));
    const pathD = rateTrendPoints.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
    const first = rateTrendPoints[0];
    const last = rateTrendPoints[rateTrendPoints.length - 1];

    const svg = `<svg viewBox="0 0 ${w} ${h}" class="rate-trend-chart" id="rateTrendSvg" role="img" aria-label="${t("currency.rateTrendAriaLabel")}">
      <path d="${pathD}" class="rate-trend-line" fill="none"/>
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.5" class="rate-trend-dot"/>
      <line id="rateTrendHoverLine" x1="0" y1="${padTop}" x2="0" y2="${padTop + plotH}" class="rate-trend-hover-line" opacity="0"/>
      <circle id="rateTrendHoverDot" cx="0" cy="0" r="4" class="rate-trend-hover-dot" opacity="0"/>
      <text x="${first.x.toFixed(1)}" y="${h - 6}" text-anchor="start" class="rate-trend-date-label">${formatTrendDate(first.date)}</text>
      <text x="${last.x.toFixed(1)}" y="${h - 6}" text-anchor="end" class="rate-trend-date-label">${formatTrendDate(last.date)}</text>
      <rect id="rateTrendHoverArea" x="0" y="0" width="${w}" height="${h}" fill="transparent"/>
    </svg>`;

    bodyEl.innerHTML = `
      <div class="rate-trend-summary">
        <span class="rate-trend-current" id="rateTrendCurrentLabel">${t("currency.rateTrendCurrent", { rate: rateLabel(last.rate) })}</span>
        <span class="rate-trend-range">${t("currency.rateTrendRange", { min: rateLabel(min), max: rateLabel(max) })}</span>
      </div>
      <div class="rate-trend-chart-wrap">
        ${svg}
        <div class="rate-trend-tooltip hidden" id="rateTrendTooltip"></div>
      </div>
      <p class="rate-trend-note">${t("currency.rateTrendSourceNote")}</p>
    `;

    wireRateTrendHover(w, h, rateLabel, last);
  }

  // 手指拖動／滑鼠移到圖表上，找最接近的資料點，顯示那個點的日期跟匯率——
  // 用 pointermove（滑鼠、觸控共用同一套事件）即時抓最近點，不用重畫整張
  // SVG，只更新輔助線/圓點的座標跟提示文字，滑動起來才會滑順。
  function wireRateTrendHover(viewBoxW, viewBoxH, rateLabel, lastPoint){
    const svgEl = document.getElementById("rateTrendSvg");
    const hoverArea = document.getElementById("rateTrendHoverArea");
    const hoverLine = document.getElementById("rateTrendHoverLine");
    const hoverDot = document.getElementById("rateTrendHoverDot");
    const tooltip = document.getElementById("rateTrendTooltip");
    const currentLabel = document.getElementById("rateTrendCurrentLabel");
    if(!svgEl || !hoverArea) return;

    function pickNearestPoint(clientX){
      const rect = svgEl.getBoundingClientRect();
      const relX = ((clientX - rect.left) / rect.width) * viewBoxW;
      let nearest = rateTrendPoints[0];
      let minDist = Infinity;
      rateTrendPoints.forEach(p => {
        const dist = Math.abs(p.x - relX);
        if(dist < minDist){ minDist = dist; nearest = p; }
      });
      return nearest;
    }

    function showPoint(p){
      hoverLine.setAttribute("x1", p.x.toFixed(1));
      hoverLine.setAttribute("x2", p.x.toFixed(1));
      hoverLine.setAttribute("opacity", "1");
      hoverDot.setAttribute("cx", p.x.toFixed(1));
      hoverDot.setAttribute("cy", p.y.toFixed(1));
      hoverDot.setAttribute("opacity", "1");
      if(currentLabel) currentLabel.textContent = t("currency.rateTrendHoverLabel", { date: formatTrendDate(p.date), rate: rateLabel(p.rate) });
      if(tooltip){
        tooltip.textContent = `${formatTrendDate(p.date)} · NT$${rateLabel(p.rate)}`;
        tooltip.classList.remove("hidden");
        const rect = svgEl.getBoundingClientRect();
        const pxX = (p.x / viewBoxW) * rect.width;
        const pxY = (p.y / viewBoxH) * rect.height;
        tooltip.style.left = pxX + "px";
        tooltip.style.top = pxY + "px";
      }
    }

    function resetToLast(){
      hoverLine.setAttribute("opacity", "0");
      hoverDot.setAttribute("opacity", "0");
      if(tooltip) tooltip.classList.add("hidden");
      if(currentLabel) currentLabel.textContent = t("currency.rateTrendCurrent", { rate: rateLabel(lastPoint.rate) });
    }

    hoverArea.addEventListener("pointermove", (e)=> showPoint(pickNearestPoint(e.clientX)));
    hoverArea.addEventListener("pointerdown", (e)=> showPoint(pickNearestPoint(e.clientX)));
    hoverArea.addEventListener("pointerleave", resetToLast);
    // 手機放開手指後，隔一下再自動回到「今日」的資訊，不要讓使用者以為
    // 剛剛滑到的那個過去日期的匯率變成現在的即時匯率。
    hoverArea.addEventListener("pointerup", ()=> setTimeout(resetToLast, 1500));
  }

  async function loadAndRenderRateTrend(){
    const bodyEl = document.getElementById("exchangeRateTrendBody");
    if(bodyEl) bodyEl.innerHTML = `<p class="filter-hint">${t("common.loading")}</p>`;
    const cfg = RATE_TREND_RANGE_CONFIG[rateTrendRange] || RATE_TREND_RANGE_CONFIG.month;
    try {
      const history = await fetchRateHistory(CURRENCY, cfg.days, cfg.sampleEvery);
      renderRateTrendChart(history);
    } catch(err){
      console.error("讀取歷史匯率失敗：", err);
      if(bodyEl) bodyEl.innerHTML = `<p class="filter-hint">${t("currency.rateTrendFailed")}</p>`;
    }
  }

  const exchangeRateHintBtn = document.getElementById("exchangeRateHint");
  const exchangeRateTrendModal = document.getElementById("exchangeRateTrendModal");
  const exchangeRateTrendCloseBtn = document.getElementById("exchangeRateTrendCloseBtn");
  const rateTrendRangeTabs = document.getElementById("rateTrendRangeTabs");
  if(exchangeRateHintBtn && exchangeRateTrendModal){
    exchangeRateHintBtn.addEventListener("click", ()=>{
      exchangeRateTrendModal.classList.add("show");
      const titleEl = document.getElementById("exchangeRateTrendTitle");
      if(titleEl) titleEl.textContent = t("currency.rateTrendTitleWithCode", { code: CURRENCY });
      loadAndRenderRateTrend();
    });
  }
  if(exchangeRateTrendCloseBtn && exchangeRateTrendModal){
    exchangeRateTrendCloseBtn.addEventListener("click", ()=> exchangeRateTrendModal.classList.remove("show"));
  }
  if(rateTrendRangeTabs){
    rateTrendRangeTabs.querySelectorAll(".donut-scope-tab").forEach(tab => {
      tab.addEventListener("click", ()=>{
        rateTrendRangeTabs.querySelectorAll(".donut-scope-tab").forEach(t2 => t2.classList.remove("active"));
        tab.classList.add("active");
        rateTrendRange = tab.dataset.range || "month";
        loadAndRenderRateTrend();
      });
    });
  }

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
  // 實際抓資料的邏輯統一放在 shared-ui.js 的 loadGroupMembers()，
  // summary.html/currency.html/settings.html 三邊共用同一份，這裡只
  // 負責把結果存進這個檔案自己的變數。
  async function loadMembers(){
    const result = await loadGroupMembers(sb, currentUser, showLeftMembers);
    MEMBERS = result.MEMBERS;
    memberById = result.memberById;
    myMember = result.myMember;
    memberRows = result.memberRows;
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

  // 「進階篩選」原本是卡片內展開/收合的區塊，改成彈出視窗，觸發按鈕
  // 移到「與我相關」旁邊的小 chip，篩選邏輯/欄位本身完全沒變，只是
  // 換了個地方顯示。
  const historyFilterModal = document.getElementById("historyFilterModal");
  const historyFilterOpenBtn = document.getElementById("historyFilterOpenBtn");
  const historyFilterCloseBtn = document.getElementById("historyFilterCloseBtn");
  if(historyFilterOpenBtn && historyFilterModal){
    historyFilterOpenBtn.addEventListener("click", ()=>{
      historyFilterModal.classList.add("show");
    });
  }
  if(historyFilterCloseBtn && historyFilterModal){
    historyFilterCloseBtn.addEventListener("click", ()=>{
      historyFilterModal.classList.remove("show");
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
  function NOTIFY_HINT_DEFAULT_FN(){ return t("settings.notifyHintDefault"); }
  function NOTIFY_HINT_BLOCKED_FN(){ return t("settings.notifyHintBlockedBrowser"); }

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
      notifyBtn.title = t("summary.notifyBlockedTitle");
      notifyBtn.classList.remove("active");
      if(notifyHint) notifyHint.textContent = NOTIFY_HINT_BLOCKED_FN();
      return;
    }
    if(notifyHint) notifyHint.textContent = NOTIFY_HINT_DEFAULT_FN();
    if(Notification.permission === "granted"){
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if(sub){
        notifyBtn.textContent = "🔔";
        notifyBtn.title = t("summary.notifyOnTitle");
        notifyBtn.classList.add("active");
        return;
      }
    }
    notifyBtn.textContent = "🔔";
    notifyBtn.title = t("summary.notifyOffTitle");
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
        await sbAlert(t("summary.pushSubFailed"));
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
      await sbAlert(NOTIFY_HINT_BLOCKED_FN());
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

    const actor = memberById[row.created_by] || t("summary.someone");
    let title, body;
    if(table === "expenses"){
      title = payload.eventType === "INSERT" ? t("summary.notifExpenseNew") : t("summary.notifExpenseUpdate");
      let cleanDesc = (row.description || "")
        .replace(/<!--[\s\S]*?-->/gi, "")
        .replace(/<!--AI_RECEIPT_DATA:[\s\S]*?-->/gi, "")
        .replace(/AI_RECEIPT_DATA:[\s\S]*/gi, "")
        .replace(/\s*\[xcur[:_][^\]]+\]/gi, "")
        .trim();
      cleanDesc = cleanDesc.split("\n")[0].replace(/\(AI自動拆單\)/g, "").trim() || t("summary.notifExpenseItemFallback");
      body = t("summary.notifExpenseBody", {actor, desc: cleanDesc, amount: SYM + formatAmt(row.amount)});
    } else {
      title = payload.eventType === "INSERT" ? t("summary.notifRepayNew") : t("summary.notifRepayUpdate");
      body = t("summary.notifRepayBody", {from: memberById[row.from_member] || "?", to: memberById[row.to_member] || "?", amount: SYM + formatAmt(row.amount)});
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

    if(typeof initDesktopShortcuts === "function") initDesktopShortcuts();
    if(typeof initNotificationBell === "function") initNotificationBell(sb, myMember);
    if(typeof initOfflineBanner === "function") initOfflineBanner();

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

    const sharesRatioWrap = document.getElementById("expSharesRatio");
    if(sharesRatioWrap){
      sharesRatioWrap.innerHTML = activeMemberRows.map(ratioRowHTML).join("");
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
        openCalc(expAmtInp, t("summary.amountCalcTargetName"));
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
      getState: () => ({ myMember, MEMBERS, memberById }),
      // 重複支出偵測用：手動新增支出表單本來就會比對 cachedExpenses（見
      // 下面 addExpBtn 那段的「防手滑」邏輯），AI 拆單直接存檔原本沒有
      // 做同一件事，兩邊行為不一致——這裡傳個 getter 進去（不是傳當下
      // 那份陣列快照，因為 aiReceiptDeps 在登入流程一開始就建立好了，
      // 這時 cachedExpenses 可能還是空的；用 getter 確保 ai-receipt.js
      // 拿到的永遠是「呼叫當下」最新的那份）。
      getCachedExpenses: () => cachedExpenses
    };
    const aiReceiptModule = await import("./ai-receipt.js?v=" + APP_VERSION);
    aiReceiptModule.setupAiReceiptModal(aiReceiptDeps);

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
    generateDueRecurringExpenses();
    subscribeRealtime();
    ensurePushSubscribed();
    if(typeof initLocationWeatherWidget === "function") initLocationWeatherWidget().catch(()=>{});

    // 從通知夾點「週期性支出已自動記錄」跳過來的（?openExpense=支出id），
    // 資料載入完直接幫忙開好那筆的明細視窗，不用使用者自己在紀錄裡找。
    const openExpenseId = new URLSearchParams(location.search).get("openExpense");
    if(openExpenseId){
      const targetExp = cachedExpenses.find(e => e.id === openExpenseId);
      if(targetExp) showExpenseDebtDetail(targetExp);
    }

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
      const ratioHintEl = document.getElementById("expRatioHint");
      if(ratioHintEl) ratioHintEl.classList.toggle("hidden", splitMode !== "ratio");
      const sharesRatioEl = document.getElementById("expSharesRatio");
      if(sharesRatioEl) sharesRatioEl.classList.toggle("hidden", splitMode !== "ratio");
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
          ${renderAvatarHTML({ id: mId, name: name }, "avatar-xs")}
          <span class="amt-row-name">${escapeHtml(name)}</span>
          <input type="number" class="amt-row-input exp-addon-input" data-member="${mId}" placeholder="${t("currency.personalAddonPlaceholder")}" min="0" step="1" value="${val}" ${calc ? `data-calc="${escapeHtml(calc)}"` : ''}>
          <button type="button" class="amt-row-calc-btn${calc ? ' has-calc' : ''}" title="${t("common.calculator")}">🧮</button>
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
    hintEl.textContent = n > 0 ? t("summary.perPersonShare", {amount: SYM+formatAmt(perPerson), count: n}) : t("summary.noOneSelectedForShare");
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
      listEl.innerHTML = `<div class="exp-shared-addon-empty">${t("summary.sharedAddonEmpty")}</div>`;
    } else {
      listEl.innerHTML = sharedAddonItems.map(item => {
        const n = item.memberIds.length;
        const perPerson = n > 0 ? Math.floor((Number(item.price) || 0) / n) : 0;
        const hintText = n > 0 ? t("summary.perPersonShare", {amount: SYM+formatAmt(perPerson), count: n}) : t("summary.noOneSelectedForShare");
        return `
          <div class="exp-shared-addon-item" data-id="${item.id}">
            <div class="exp-shared-addon-item-top">
              <input type="text" class="exp-shared-addon-name" placeholder="${t("summary.sharedAddonNamePlaceholder")}" value="${escapeHtml(item.name || "")}">
              <button type="button" class="exp-shared-addon-del" title="${t("settings.delete")}">✕</button>
            </div>
            <div class="input-calc-wrap exp-shared-addon-price-wrap">
              <input type="number" class="exp-shared-addon-price" placeholder="${t("summary.sharedAddonPricePlaceholder")}" min="0" step="1" value="${item.price || ""}">
              <button type="button" class="amt-row-calc-btn input-calc-btn exp-shared-addon-calc-btn" title="${t("common.calculator")}">🧮</button>
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
        calcBtn.addEventListener("click", () => openCalc(priceInp, item.name || t("summary.sharedAddonCalcTargetFallback")));
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
          const label = item.name ? item.name.trim() : t("currency.sharedAddonDefaultLabel");
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
      expAmountLabel.textContent = manualTaxType === "inclusive" ? t("summary.amountLabelInclusive") : t("currency.amountLabelExclusiveFull");
    }
    updateTaxPreview();
    updatePayerSumCheck();
    updateShareSumCheck();
    updateAddonsPreview();
  }

  function collapseTaxBody(){
    const body = document.getElementById("expTaxBody");
    const yesBtn = document.getElementById("expTaxHasYesBtn");
    const noBtn = document.getElementById("expTaxHasNoBtn");
    if(body) body.classList.add("hidden");
    if(yesBtn) yesBtn.classList.remove("active");
    if(noBtn) noBtn.classList.add("active");
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
    const modeText = manualTaxSplitMode === "ratio" ? t("summary.taxModeRatioDesc") : t("currency.taxEqual");
    previewEl.innerHTML = `
      <div>${t("currency.taxPreviewSummary", {subtotal: SYM+formatAmt(subtotal), tax: SYM+formatAmt(tax), total: SYM+formatAmt(total)})}</div>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-top:3px;">
        ${t("currency.taxPreviewMode", {mode: modeText})}
      </div>
    `;
  }

  const expTaxHasYesBtn = document.getElementById("expTaxHasYesBtn");
  const expTaxHasNoBtn = document.getElementById("expTaxHasNoBtn");
  const expTaxBody = document.getElementById("expTaxBody");
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

  // 「有沒有另外加服務費或稅」改成明確的 有/沒有 按鈕，取代原本模糊的
  // 展開/收合圖示——選「沒有」會直接清空稅額欄位（等於原本的清除按鈕）。
  function setManualTaxHasExtra(hasExtra){
    if(expTaxHasYesBtn) expTaxHasYesBtn.classList.toggle("active", hasExtra);
    if(expTaxHasNoBtn) expTaxHasNoBtn.classList.toggle("active", !hasExtra);
    if(expTaxBody) expTaxBody.classList.toggle("hidden", !hasExtra);
    if(!hasExtra){
      if(expTaxInp){ expTaxInp.value = ""; clearRowCalc(expTaxInp); }
      manualTaxSplitMode = "ratio";
      if(expManualTaxRatioBtn) expManualTaxRatioBtn.classList.add("active");
      if(expManualTaxEqualBtn) expManualTaxEqualBtn.classList.remove("active");
    }
    recomputeManualTaxType();
    updateTaxPreview();
    updateManualTaxTypeUI();
  }
  if(expTaxHasYesBtn && expTaxHasNoBtn){
    expTaxHasYesBtn.addEventListener("click", ()=> setManualTaxHasExtra(true));
    expTaxHasNoBtn.addEventListener("click", ()=> setManualTaxHasExtra(false));
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
      openCalc(expTaxInp, t("summary.taxCalcTargetName"));
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
    const taxPart = tax > 0 ? t("currency.addonsPreviewTaxPart", {tax: SYM+formatAmt(tax), total: SYM+formatAmt(total)}) : '';
    previewEl.innerHTML = `
      <div>${t("currency.addonsPreviewSummary", {subtotal: SYM+formatAmt(subtotal), taxPart})}</div>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-top:3px;">
        ${t("currency.addonsPreviewDetail", {addon: SYM+formatAmt(totalAddon), base: SYM+formatAmt(baseAmount), share: SYM+formatAmt(baseShare)})}
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
      toggleAllParticipantsBtn.textContent = nextChecked ? t("currency.deselectAll") : t("summary.selectAll");
      updateAddonsPreview();
    });
  }

  function sumCheckHTML(total, sum){
    const diff = Math.round((total - sum) * 100) / 100;
    if(!total) return "";
    if(Math.abs(diff) < 0.5) return `<span class="sum-ok">${t("summary.sumOk", {amount: SYM+formatAmt(sum)})}</span>`;
    if(diff > 0) return `<span class="sum-warn">${t("summary.sumRemaining", {diff: SYM+formatAmt(diff), sum: SYM+formatAmt(sum), total: SYM+formatAmt(total)})}</span>`;
    return `<span class="sum-warn">${t("summary.sumExceeded", {diff: SYM+formatAmt(Math.abs(diff)), sum: SYM+formatAmt(sum), total: SYM+formatAmt(total)})}</span>`;
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
  // 依比例分攤讀的是「份數」不是金額，欄位結構跟 amtRowHTML 一樣（同樣是
  // .amt-row-input），直接借 readAmountRows() 讀完再把 amount 改名成
  // weight，語意比較清楚，避免呼叫端誤會這是金額。
  function readRatioRows(containerId){
    return readAmountRows(containerId).map(r => ({ member_id: r.member_id, weight: r.amount }));
  }

  // ---------- 付款人/分攤人/參與者 UI 小元件（新增支出用，也給編輯模式的
  // ensureXxx() 系列補選項時共用）----------
  function amtRowHTML(m){
    return `<div class="amt-row">
        ${renderAvatarHTML(m, "avatar-xs")}
        <span class="amt-row-name">${escapeHtml(m.name)}</span>
        <input type="number" class="amt-row-input" data-member="${m.id}" placeholder="0" min="0" step="1">
        <button type="button" class="amt-row-calc-btn" title="${t("common.calculator")}">🧮</button>
      </div>`;
  }
  // 依比例分攤：填的是份數，不是金額，所以沒有小計算機按鈕，右邊加個
  // 「份」字提示單位。
  function ratioRowHTML(m){
    return `<div class="amt-row">
        ${renderAvatarHTML(m, "avatar-xs")}
        <span class="amt-row-name">${escapeHtml(m.name)}</span>
        <input type="number" class="amt-row-input" data-member="${m.id}" placeholder="0" min="0" step="0.5">
        <span class="ratio-row-unit">${t("common.shareUnit")}</span>
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
        ${renderAvatarHTML({ id: memberId, name: memberById[memberId] }, "avatar-xs")}
        <span class="amt-row-name">${escapeHtml(memberById[memberId] || "?")}</span>
        <input type="number" class="amt-row-input" data-member="${memberId}" placeholder="0" min="0" step="1">
        <button type="button" class="amt-row-calc-btn" title="${t("common.calculator")}">🧮</button>`;
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
          if(result === null){ calcDisplay.textContent = t("summary.calcFormatError"); return; }
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
      inp.placeholder = tax > 0 ? t("summary.untaxedAmountPlaceholder") : "0";
    });
    const rows = readAmountRows("expSharesCustom");
    const sumBase = rows.reduce((s,p)=>s+p.amount, 0);
    if(tax > 0){
      const sumWithTax = sumBase + tax;
      document.getElementById("shareSumCheck").innerHTML = `
        <div style="font-size:12px;color:var(--ink-soft);margin-bottom:2px;">
          ${t("currency.customShareSumWithTax", {base: SYM+formatAmt(sumBase), tax: SYM+formatAmt(tax), total: "<b>"+SYM+formatAmt(sumWithTax)+"</b>"})}
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

  // ============================================================
  // 📝 Step-by-step 表單導覽：把原本「送出當下一次檢查全部」的驗證，
  // 拆成每一步按「下一步」時只檢查那一步（規則跟原本完全一樣，只是
  // 檢查的時機提前了）。wizard 本身只負責畫面顯示/步驟索引，見
  // expense-form-shared.js 的 createFormWizard()。
  // ============================================================
  function validateExpStep1(){
    const { total: amount } = getManualExpenseTotals();
    const itemTitle = document.getElementById("expDesc").value.trim();
    if(!amount || amount <= 0) return { ok:false, message:t("currency.amountInvalid") };
    if(!Number.isInteger(amount)) return { ok:false, message:t("summary.amountMustBeInteger") };
    if(!itemTitle) return { ok:false, message:t("currency.itemTitleRequired") };
    return { ok:true };
  }

  function validateExpStep2(){
    if(payerMode === "single") return { ok:true };
    const { total: amount } = getManualExpenseTotals();
    const payers = readAmountRows("expPayers");
    if(!payers.length) return { ok:false, message:t("currency.needAtLeastOnePayer") };
    const payerSum = payers.reduce((s,p)=>s+p.amount, 0);
    if(Math.abs(payerSum - amount) >= 0.5){
      const diff = Math.round((amount - payerSum) * 100) / 100;
      return { ok:false, message: diff > 0
        ? t("summary.payerSumShort", {diff: SYM+formatAmt(diff), total: SYM+formatAmt(amount)})
        : t("summary.payerSumOver", {diff: SYM+formatAmt(Math.abs(diff)), total: SYM+formatAmt(amount)}) };
    }
    return { ok:true };
  }

  function validateExpStep3(){
    const { subtotal, tax: taxAmount, total: amount } = getManualExpenseTotals();
    if(splitMode === "equal"){
      const participants = Array.from(document.querySelectorAll("#expParticipants input:checked")).map(i=>i.value);
      if(!participants.length) return { ok:false, message:t("currency.needAtLeastOneParticipant") };
      const { totalAddon } = getAddonsData();
      if(totalAddon > subtotal && subtotal > 0){
        return { ok:false, message:t("summary.addonExceedsSubtotal", {addon: SYM+formatAmt(totalAddon), subtotal: SYM+formatAmt(subtotal)}) };
      }
    } else if(splitMode === "custom"){
      const customRows = readAmountRows("expSharesCustom");
      if(!customRows.length) return { ok:false, message:t("currency.needAtLeastOneCustomShare") };
      const customBaseSum = customRows.reduce((s,p)=>s+p.amount, 0);
      if(taxAmount > 0){
        if(subtotal > 0 && Math.abs(customBaseSum - subtotal) >= 0.5){
          const diff = Math.round((subtotal - customBaseSum) * 100) / 100;
          return { ok:false, message: diff > 0
            ? t("summary.customShareShort", {diff: SYM+formatAmt(diff), subtotal: SYM+formatAmt(subtotal)})
            : t("summary.customShareOver", {diff: SYM+formatAmt(Math.abs(diff)), subtotal: SYM+formatAmt(subtotal)}) };
        }
      } else {
        if(Math.abs(customBaseSum - amount) >= 0.5){
          const diff = Math.round((amount - customBaseSum) * 100) / 100;
          return { ok:false, message: diff > 0
            ? t("summary.shareSumShort", {diff: SYM+formatAmt(diff), total: SYM+formatAmt(amount)})
            : t("summary.shareSumOver", {diff: SYM+formatAmt(Math.abs(diff)), total: SYM+formatAmt(amount)}) };
        }
      }
    } else {
      // 依比例分攤：份數不用加總到金額，只要求至少一個人有填份數即可，
      // 實際金額換算交給 computeRatioSplitShares() 處理。
      const ratioRows = readRatioRows("expSharesRatio");
      if(!ratioRows.length) return { ok:false, message:t("summary.ratioAtLeastOne") };
    }
    return { ok:true };
  }

  function expWizardStepLabels(){
    return [t("currency.contentSectionTitle"), t("currency.payerSectionTitle"), t("currency.splitSectionTitle"), t("currency.noteDateSectionTitle")];
  }
  function updateExpWizardChrome(index){
    document.querySelectorAll("#expWizardDots .form-wizard-dot").forEach((dot, i)=>{
      dot.classList.toggle("active", i === index);
      dot.classList.toggle("done", i < index);
    });
    const labels = expWizardStepLabels();
    const titleEl = document.getElementById("expWizardStepTitle");
    if(titleEl) titleEl.textContent = t("common.stepFormat", {step: index+1, total: 4, label: labels[index]});
    const backBtn = document.getElementById("expWizardBackBtn");
    if(backBtn) backBtn.classList.toggle("hidden", index === 0);
    const nextBtn = document.getElementById("addExpenseBtn");
    if(nextBtn){
      nextBtn.textContent = (index === labels.length - 1)
        ? (editingExpenseId ? t("currency.updateExpenseSubmit") : t("summary.addExpenseSubmit"))
        : t("common.wizardNext");
    }
  }

  let expWizardInstance = null;
  async function getExpWizard(){
    if(expWizardInstance) return expWizardInstance;
    const formShared = await import("./expense-form-shared.js?v=" + APP_VERSION);
    expWizardInstance = formShared.createFormWizard({
      steps: [
        { id:"content", sectionEl: document.querySelector("#panelExpense .sec-content"), validate: validateExpStep1 },
        { id:"payer", sectionEl: document.querySelector("#panelExpense .sec-payer"), validate: validateExpStep2 },
        { id:"split", sectionEl: document.querySelector("#panelExpense .sec-split"), validate: validateExpStep3 },
        { id:"note", sectionEl: document.querySelector("#panelExpense .sec-note") }
      ],
      onStepChange: updateExpWizardChrome
    });
    return expWizardInstance;
  }
  // 一開始就把 wizard 建起來（不用等使用者按下一步/編輯支出才觸發），
  // 這樣 updateExpWizardChrome(0) 才會立刻跑一次，把 #expWizardStepTitle
  // 從 HTML 裡寫死的中文預設字換成當下語言——不然在切換成日文/英文、
  // 但還沒點過下一步之前，這行小字會一直停留在中文。
  getExpWizard();
  document.addEventListener("splitbill-lang-changed", ()=>{
    if(expWizardInstance) updateExpWizardChrome(expWizardInstance.getCurrentIndex());
  });

  async function resetExpWizardToStep0(){
    const wizard = await getExpWizard();
    wizard.goToStep(0);
  }

  const expWizardBackBtn = document.getElementById("expWizardBackBtn");
  if(expWizardBackBtn){
    expWizardBackBtn.addEventListener("click", async ()=>{
      const wizard = await getExpWizard();
      wizard.goBack();
    });
  }

  const addExpBtn = document.getElementById("addExpenseBtn");
  if(addExpBtn){
    addExpBtn.addEventListener("click", async ()=>{
      const msg = document.getElementById("expMsg");
      const wizard = await getExpWizard();
      if(wizard.getCurrentIndex() < wizard.getStepCount() - 1){
        const result = wizard.goNext();
        if(!result.ok){
          msg.textContent = result.message || "";
          msg.className = "msg error";
        } else {
          msg.textContent = "";
          msg.className = "msg";
        }
        return;
      }

      const { subtotal, tax: taxAmount, total: totalAmount } = getManualExpenseTotals();
      const amount = totalAmount;
      const itemTitle = document.getElementById("expDesc").value.trim();
      const itemNote = (document.getElementById("expNote") ? document.getElementById("expNote").value.trim() : "");
      const expense_date = document.getElementById("expDate").value;

      let payers;
      if(payerMode === "single"){
        const payerCalc = document.getElementById("expAmount").dataset.calc || "";
        const pObj = { member_id: document.getElementById("expPaidBySingle").value, amount };
        if(payerCalc) pObj.calc = payerCalc;
        payers = [pObj];
      } else {
        payers = readAmountRows("expPayers");
      }

      let shares = [];
      if(splitMode === "equal"){
        const participants = Array.from(document.querySelectorAll("#expParticipants input:checked")).map(i=>i.value);
        const { totalAddon, items: addonItems } = getAddonsData();

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
      } else if(splitMode === "custom"){
        const customRows = readAmountRows("expSharesCustom");

        // 均分/自訂分攤的計算已經抽成共用的 expense-form-shared.js（ES
        // module），跟「快速記帳」共用同一套演算法，不用再各自維護一份。
        {
          const formShared = await import("./expense-form-shared.js?v=" + APP_VERSION);
          shares = formShared.computeCustomSplitShares({ subtotal, taxAmount, taxSplitMode: manualTaxSplitMode, rows: customRows });
        }
      } else {
        const ratioRows = readRatioRows("expSharesRatio");
        if(!ratioRows.length){
          msg.textContent = t("summary.ratioAtLeastOne");
          msg.className = "msg error";
          return;
        }
        const formShared = await import("./expense-form-shared.js?v=" + APP_VERSION);
        shares = formShared.computeRatioSplitShares({
          subtotal, taxAmount, taxSplitMode: manualTaxSplitMode,
          rows: ratioRows,
          payerIds: payers.map(p => p.member_id)
        });
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
          const ok = await sbConfirm(t("currency.dupExpenseConfirm", {title: itemTitle, amount: SYM+formatAmt(amount)}), t("currency.dupExpenseTitle"));
          if(!ok) return;
        }
      }

      // 編輯模式下，「記錯幣別」的修正欄位如果有顯示（非跨幣別轉移紀錄）
      // 就用使用者選的幣別；新增支出、或欄位被隱藏（xcur 紀錄）的情況，
      // 幣別還是照這一頁本身的 CURRENCY，行為跟改動前完全一樣。
      const editCurrencyRowEl = document.getElementById("editCurrencyRow");
      const editCurrencySelectEl = document.getElementById("expEditCurrencySelect");
      const editedCurrency = (editingExpenseId && editCurrencyRowEl && !editCurrencyRowEl.classList.contains("hidden") && editCurrencySelectEl && editCurrencySelectEl.value)
        ? editCurrencySelectEl.value
        : CURRENCY;

      const payload = {
        amount,
        description,
        note: itemNote || null,
        expense_date,
        created_by: myMember.id,
        payers,
        shares,
        currency: editedCurrency,
        category: selectedExpCategory || "general"
      };
      const { error } = editingExpenseId
        ? await sb.from("expenses").update(payload).eq("id", editingExpenseId)
        : await sb.from("expenses").insert(payload);
      if(error){ msg.textContent = (editingExpenseId ? t("currency.updateFailed") : t("currency.addFailed")) + error.message; msg.className = "msg error"; return; }

      if(userManuallyPickedCategory && itemTitle){
        const learnKeyword = normalizeCategoryKeyword(getFirstLineDesc(itemTitle));
        if(learnKeyword) saveCategoryLearning(learnKeyword, selectedExpCategory || "general");
      }

      msg.textContent = editingExpenseId ? t("currency.updatedDone") : t("currency.addedDone");
      msg.className = "msg ok";
      const wasEditing = !!editingExpenseId;
      const btn = document.getElementById("addExpenseBtn");

      // 觸發「實體收據印出 ➔ 飛入帳本」動畫
      if(!wasEditing && typeof window.triggerReceiptFlyAnimation === "function"){
        const firstPayerId = (payers && payers[0] && payers[0].member_id);
        const payerName = (firstPayerId && memberById[firstPayerId]) || (myMember && myMember.name) || t("summary.meFallback");
        const catMeta = (window.getCategoryMeta && window.getCategoryMeta(itemTitle, itemNote, selectedExpCategory)) || {};
        window.triggerReceiptFlyAnimation({
          buttonEl: btn,
          desc: itemTitle || t("currency.newExpenseDefaultDesc"),
          amount: amount,
          symbol: SYM || "$",
          categoryIcon: catMeta.icon || "🧾",
          payerName: payerName,
          splitCount: (shares || []).length,
          targetListEl: document.getElementById("expenseList") || document.getElementById("tabExpenses")
        });
      }

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
      document.querySelectorAll("#expPayers .amt-row-input, #expSharesCustom .amt-row-input, #expSharesRatio .amt-row-input, #expAddonsList .exp-addon-input").forEach(i=>{ i.value=""; clearRowCalc(i); });
      document.getElementById("payerSumCheck").innerHTML = "";
      document.getElementById("shareSumCheck").innerHTML = "";
      sharedAddonItems = [];
      setAddonMode("custom");
      const addonsPreview = document.getElementById("expAddonsPreview");
      if(addonsPreview) addonsPreview.classList.add("hidden");
      await resetExpWizardToStep0();
      btn.textContent = wasEditing ? t("currency.updatedCheckmark") : t("currency.addedCheckmark");
      btn.classList.add("btn-success");
      setTimeout(()=>{
        btn.classList.remove("btn-success");
        btn.textContent = t("common.wizardNext");
      }, 1100);

      // 編輯時如果把幣別改掉了，這筆紀錄現在屬於別的幣別頁、在目前這頁
      // 的清單裡會直接消失——問一下要不要順便切過去看，不然使用者會
      // 以為存檔失敗、東西不見了。
      if(wasEditing && editedCurrency !== CURRENCY){
        const targetLabel = (CURRENCIES.find(c => c.code === editedCurrency) || {}).label || editedCurrency;
        const okSwitch = await sbConfirm(t("currency.updateSuccessSwitchPrompt", {title: itemTitle, label: targetLabel}), t("currency.updateSuccessTitle"));
        if(okSwitch){
          location.href = "currency.html?c=" + editedCurrency;
          return;
        }
      }

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

  // 🔁 週期性支出自動產生的那一筆，編輯前先問清楚範圍：「只改這一筆」直接照
  // 平常的編輯流程走；「這筆以後都改」是要調整範本本身（影響以後每一期），
  // 範本編輯表單獨立在設定頁（見使用者需求：跟一般支出的建立/編輯入口分開），
  // 這裡只負責導過去、帶著範本 id。
  function openRecurringEditScopeChoice(e, templateId){
    const modal = document.getElementById("recurringEditScopeModal");
    if(!modal){ startEditExpenseDirect(e); return; }
    const bodyEl = document.getElementById("recurringEditScopeBody");
    const onlyThisBtn = document.getElementById("recurringEditScopeOnlyThisBtn");
    const templateBtn = document.getElementById("recurringEditScopeTemplateBtn");
    const closeBtn = document.getElementById("recurringEditScopeCloseBtn");
    const { title } = splitExpenseTitleAndNote(e.description || "", e.note || "");
    if(bodyEl) bodyEl.textContent = t("currency.recurringEditScopeBody", { title: title || e.description || t("currency.expenseDetailFallback") });
    if(onlyThisBtn){
      onlyThisBtn.onclick = () => {
        modal.classList.remove("show");
        startEditExpenseDirect(e);
      };
    }
    if(templateBtn){
      templateBtn.onclick = () => {
        modal.classList.remove("show");
        location.href = "settings.html?tab=group&editRecurring=" + encodeURIComponent(templateId);
      };
    }
    if(closeBtn) closeBtn.onclick = () => modal.classList.remove("show");
    modal.classList.add("show");
  }

  function startEditExpense(e){
    const recurringTemplateId = isRecurringGeneratedStr(e.description) ? extractRecurringTemplateId(e.description)
      : (isRecurringGeneratedStr(e.note) ? extractRecurringTemplateId(e.note) : null);
    if(recurringTemplateId){
      openRecurringEditScopeChoice(e, recurringTemplateId);
      return;
    }
    startEditExpenseDirect(e);
  }

  function startEditExpenseDirect(e){
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
          storeName: title || t("currency.aiStoreDefaultValue"),
          subtotal: Number(e.amount) || 0,
          taxType: "inclusive",
          taxSplitMode: "ratio",
          items: [{
            id: "item_0_" + Date.now(),
            name: title || t("currency.genericItemFallback"),
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
    document.getElementById("expFormTitle").textContent = t("currency.editingExpenseTitle");

    // 記錯幣別很常見的手滑，開放編輯模式下直接改幣別修正——跨幣別轉移
    // 產生的關聯紀錄（xcur，見下面「跨幣別轉移」那組邏輯）牽涉另一邊
    // 帳本的對應金額，改幣別容易破壞兩邊的關聯，不開放編輯。
    const editCurrencyRow = document.getElementById("editCurrencyRow");
    const editCurrencySelect = document.getElementById("expEditCurrencySelect");
    const isXcurRecordForEdit = isXcurStr(e.description) || isXcurStr(e.note);
    if(editCurrencyRow && editCurrencySelect){
      if(isXcurRecordForEdit){
        editCurrencyRow.classList.add("hidden");
      } else {
        editCurrencySelect.innerHTML = CURRENCIES.map(c => `<option value="${c.code}">${c.label} (${c.code})</option>`).join("");
        editCurrencySelect.value = e.currency || CURRENCY;
        enhanceSelect(editCurrencySelect);
        editCurrencyRow.classList.remove("hidden");
      }
    }

    resetExpWizardToStep0();

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
      const expTaxHasYesBtn = document.getElementById("expTaxHasYesBtn");
      const expTaxHasNoBtn = document.getElementById("expTaxHasNoBtn");
      if(expTaxBody) expTaxBody.classList.remove("hidden");
      if(expTaxHasYesBtn) expTaxHasYesBtn.classList.add("active");
      if(expTaxHasNoBtn) expTaxHasNoBtn.classList.remove("active");
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
    const editCurrencyRow = document.getElementById("editCurrencyRow");
    if(editCurrencyRow) editCurrencyRow.classList.add("hidden");
    document.getElementById("expFormTitle").textContent = t("currency.expFormTitleDefault");
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
      resetExpWizardToStep0();
      document.getElementById("expAmount").value = "";
      const expTaxInp = document.getElementById("expTaxAmount");
      if(expTaxInp){ expTaxInp.value = ""; clearRowCalc(expTaxInp); }
      document.getElementById("expDesc").value = "";
      if(document.getElementById("expNote")) document.getElementById("expNote").value = "";
      document.querySelectorAll("#expPayers .amt-row-input, #expSharesCustom .amt-row-input, #expSharesRatio .amt-row-input, #expAddonsList .exp-addon-input").forEach(i=>{ i.value=""; clearRowCalc(i); });
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

      if(from_member === to_member){ msg.textContent = t("currency.repayFromToSame"); msg.className = "msg error"; return; }
      if(!amount || amount <= 0){ msg.textContent = t("currency.amountInvalid"); msg.className = "msg error"; return; }

      const repayEditCurrencyRowEl = document.getElementById("repayEditCurrencyRow");
      const repayEditCurrencySelectEl = document.getElementById("repayEditCurrencySelect");
      const editedRepayCurrency = (editingRepaymentId && repayEditCurrencyRowEl && !repayEditCurrencyRowEl.classList.contains("hidden") && repayEditCurrencySelectEl && repayEditCurrencySelectEl.value)
        ? repayEditCurrencySelectEl.value
        : CURRENCY;

      const payload = { from_member, to_member, amount, note: note || null, payment_date, created_by: myMember.id, currency: editedRepayCurrency };
      const { error } = editingRepaymentId
        ? await sb.from("repayments").update(payload).eq("id", editingRepaymentId)
        : await sb.from("repayments").insert(payload);
      if(error){ msg.textContent = (editingRepaymentId ? t("currency.updateFailed") : t("currency.addFailed")) + error.message; msg.className = "msg error"; return; }

      msg.textContent = editingRepaymentId ? t("currency.updatedDone") : t("currency.repaymentRecorded");
      msg.className = "msg ok";
      const wasEditing = !!editingRepaymentId;
      addRepayBtn.textContent = wasEditing ? t("currency.updatedCheckmark") : t("currency.recordedCheckmark");
      addRepayBtn.classList.add("btn-success");
      setTimeout(()=>{
        addRepayBtn.classList.remove("btn-success");
        addRepayBtn.textContent = t("currency.recordRepayment");
      }, 1100);
      if(wasEditing) exitEditRepaymentMode();
      document.getElementById("repayAmount").value = "";
      document.getElementById("repayNote").value = "";

      // 編輯時如果把幣別改掉了，這筆紀錄現在屬於別的幣別頁，問一下要不要
      // 順便切過去看（跟支出編輯同一套邏輯）。
      if(wasEditing && editedRepayCurrency !== CURRENCY){
        const targetLabel = (CURRENCIES.find(c => c.code === editedRepayCurrency) || {}).label || editedRepayCurrency;
        const repayTitle = `${memberById[from_member] || "?"} → ${memberById[to_member] || "?"}`;
        const okSwitch = await sbConfirm(t("currency.updateSuccessSwitchPrompt", {title: repayTitle, label: targetLabel}), t("currency.updateSuccessTitle"));
        if(okSwitch){
          location.href = "currency.html?c=" + editedRepayCurrency;
          return;
        }
      }

      await refreshExpenses();
    });
  }

  // ---------- edit repayment ----------
  let editingRepaymentId = null;

  function startEditRepayment(r){
    clearTempEditOptions();
    editingRepaymentId = r.id;
    document.getElementById("repayEditBanner").classList.remove("hidden");
    document.getElementById("repayFormTitle").textContent = t("currency.editingRepaymentTitle");
    document.getElementById("addRepaymentBtn").textContent = t("currency.updateRepaymentSubmit");

    // 跟支出編輯一樣，記錯幣別可以直接在這裡修正；跨幣別轉移產生的
    // 關聯還款紀錄（xcur）不開放編輯，避免弄壞兩邊帳本的連動關係。
    const repayEditCurrencyRow = document.getElementById("repayEditCurrencyRow");
    const repayEditCurrencySelect = document.getElementById("repayEditCurrencySelect");
    const isXcurRepayment = isXcurStr(r.note) || isXcurStr(r.offset_group);
    if(repayEditCurrencyRow && repayEditCurrencySelect){
      if(isXcurRepayment){
        repayEditCurrencyRow.classList.add("hidden");
      } else {
        repayEditCurrencySelect.innerHTML = CURRENCIES.map(c => `<option value="${c.code}">${c.label} (${c.code})</option>`).join("");
        repayEditCurrencySelect.value = r.currency || CURRENCY;
        enhanceSelect(repayEditCurrencySelect);
        repayEditCurrencyRow.classList.remove("hidden");
      }
    }

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
    const repayEditCurrencyRow = document.getElementById("repayEditCurrencyRow");
    if(repayEditCurrencyRow) repayEditCurrencyRow.classList.add("hidden");
    document.getElementById("repayFormTitle").textContent = t("currency.repayFormTitleDefault");
    clearTempEditOptions();
  }

  const cancelRepayEditBtn = document.getElementById("cancelRepayEditBtn");
  if(cancelRepayEditBtn){
    cancelRepayEditBtn.addEventListener("click", ()=>{
      exitEditRepaymentMode();
      document.getElementById("addRepaymentBtn").textContent = t("currency.recordRepayment");
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
      <button type="button" class="btn secondary small pagination-prev" ${page <= 0 ? "disabled" : ""}>${t("common.paginationPrev")}</button>
      <span class="pagination-info">${t("common.paginationInfo", {page: page + 1, total: totalPages})}</span>
      <button type="button" class="btn secondary small pagination-next" ${page >= totalPages - 1 ? "disabled" : ""}>${t("common.paginationNext")}</button>
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

    // 即時同步（Realtime）觸發的重新整理跟頁面初始載入是各自獨立的兩條路徑，
    // 理論上不該同時發生，但偶爾會在 loadMembers() 還沒跑完、myMember
    // 還是 null 時就先被 Realtime callback 觸發——這裡的畫面渲染大量
    // 沒防呆直接讀 myMember.id，硬讀會直接整個 crash 掉。myMember 還沒
    // 準備好就先跳過這次渲染，之後 Realtime 或使用者操作還會再觸發一次。
    if(myMember){
      applyFiltersAndRenderBoth();
    }
    await renderBalances(expenses, repayments, { data: balRows, error: balError });
    if(!balError) renderSettleReminder(repayments, balRows);

    // 如果「往來紀錄」視窗目前開著（例如別人在同一時間新增/編輯了帳目），
    // 用最新資料重新畫一次，數字才不會停在剛打開當下那一刻的舊快照。
    const openPairEl = document.getElementById("matrixDetail");
    if(currentPairDetail && openPairEl && openPairEl.style.display === "block"){
      showPairDetail(currentPairDetail.debtorId, currentPairDetail.creditorId, expenses, repayments);
    }
  }

  // ---------- 固定／週期性支出：到期自動記錄 ----------
  // 算「下一次」到期日：從給定的日期往後推一整個週期。月週期固定在
  // interval_day 號（建立範本時已限制 1~28，不會有月底天數不一致的問題），
  // 週週期單純加 7 天（範本的 next_due_date 本來就已經落在正確的星期幾上）。
  // 這個函式同時用在「建立範本」（算第一次到期日）跟「產生完這期後算下一期」，
  // 邏輯完全一樣，不用寫兩份。
  function computeNextDueDate(intervalUnit, intervalDay, fromDateStr){
    const [y, m, d] = fromDateStr.split("-").map(Number);
    let dt;
    if(intervalUnit === "weekly"){
      dt = new Date(y, m - 1, d + 7);
    } else {
      dt = new Date(y, m, intervalDay); // m（1-based 的當月）在 0-based 月份索引裡剛好就是下個月
    }
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  }

  function renderRecurringAutoBanner(items){
    const banner = document.getElementById("recurringAutoBanner");
    if(!banner) return;
    banner.innerHTML = items.map(({ expense, template }) => {
      const { title } = splitExpenseTitleAndNote(expense.description || "", expense.note || "");
      const label = title || expense.description || t("currency.expenseDetailFallback");
      return `<div class="card recurring-auto-banner-item" data-expense-id="${expense.id}">
        <span class="recurring-auto-banner-text">${t("currency.recurringAutoBannerText", { title: escapeHtml(label), amount: SYM + formatAmt(expense.amount) })}</span>
        <span class="recurring-auto-banner-actions">
          <button type="button" class="link-btn recurring-auto-banner-view" data-expense-id="${expense.id}">${t("currency.recurringAutoBannerViewBtn")}</button>
          <button type="button" class="recurring-auto-banner-close" aria-label="${t("common.close")}">✕</button>
        </span>
      </div>`;
    }).join("");

    banner.querySelectorAll(".recurring-auto-banner-view").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const exp = cachedExpenses.find(e => e.id === btn.dataset.expenseId);
        if(exp) showExpenseDebtDetail(exp);
      });
    });
    banner.querySelectorAll(".recurring-auto-banner-close").forEach(btn=>{
      btn.addEventListener("click", ()=>{ btn.closest(".recurring-auto-banner-item").remove(); });
    });
  }

  // 每次登入／重新整理任何一個幣別頁都會跑一次；多人同時開頁也安全——
  // 用「條件式 UPDATE（WHERE next_due_date 仍然到期）+ .select()」當搶號鎖，
  // 只有真的搶到（回傳陣列非空）的那個客戶端才會繼續往下記錄這一期，
  // 其餘客戶端會發現條件已經不成立（別人已經先更新過 next_due_date 了）
  // 而跳過，不會重複記兩筆帳。
  async function generateDueRecurringExpenses(){
    if(!myMember || !myMember.group_id) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: dueTemplates, error } = await sb
      .from("recurring_expenses")
      .select("*")
      .eq("group_id", myMember.group_id)
      .eq("active", true)
      .lte("next_due_date", todayStr);
    if(error){
      // 資料表可能還沒建立（使用者尚未執行 scripts/recurring_expenses.sql），
      // 靜靜跳過即可，不影響其他既有功能正常使用。
      console.warn("讀取週期性支出範本失敗（可能尚未建立 recurring_expenses 資料表）：", error);
      return;
    }
    if(!dueTemplates || !dueTemplates.length) return;

    const generatedForThisCurrency = [];

    for(const tmpl of dueTemplates){
      const nextDate = computeNextDueDate(tmpl.interval_unit, tmpl.interval_day, tmpl.next_due_date);
      const { data: claimed, error: claimErr } = await sb
        .from("recurring_expenses")
        .update({ next_due_date: nextDate, last_generated_date: todayStr })
        .eq("id", tmpl.id)
        .lte("next_due_date", todayStr)
        .select();
      if(claimErr || !claimed || !claimed.length) continue; // 搶輸了，別人已經處理過這筆

      // note 裡塞 [recurring:範本id] 標記，讓歷史紀錄/明細畫面認得出這筆是週期性
      // 支出自動產生的（見 isRecurringGeneratedStr()/extractRecurringTemplateId()），
      // 使用者編輯這筆帳時才知道要跳「只改這一筆／這筆以後都改」的選擇。
      const payload = {
        group_id: tmpl.group_id,
        description: tmpl.description,
        category: tmpl.category,
        amount: tmpl.amount,
        currency: tmpl.currency,
        payers: tmpl.payers,
        shares: tmpl.shares,
        expense_date: tmpl.next_due_date,
        created_by: tmpl.created_by,
        note: `[recurring:${tmpl.id}]`
      };
      const { data: insertedExp, error: insertErr } = await sb.from("expenses").insert(payload).select().single();
      if(insertErr || !insertedExp){
        console.error("週期性支出自動記錄失敗：", insertErr);
        continue;
      }

      const { title: tmplTitle } = splitExpenseTitleAndNote(tmpl.description || "", "");
      const curObj = CURRENCIES.find(c => c.code === tmpl.currency);
      const notifTitle = t("notif.recurringGeneratedTitle");
      const notifBody = t("notif.recurringGeneratedBody", {
        title: tmplTitle || tmpl.description,
        amount: (curObj ? curObj.symbol : tmpl.currency) + formatAmt(tmpl.amount)
      });
      // notifications 的 RLS 不允許直接幫「其他成員」insert（跟 members/expenses
      // 一樣，任何人都不能代寫別人的資料列）——跟催款提醒（send_debt_reminder）
      // 同一套做法，改叫一支 SECURITY DEFINER RPC，在資料庫端確認呼叫者真的是
      // 這個群組的成員後，才幫忙寫通知。只通知「這筆週期性支出實際牽涉到的人」
      // （付款人＋分攤人），不相干的其他群組成員不會收到——沒道理讓一個跟這筆
      // 帳完全沒關係的人也收到通知。
      const involvedMemberIds = Array.from(new Set([
        ...(tmpl.payers || []).map(p => p.member_id),
        ...(tmpl.shares || []).map(s => s.member_id)
      ]));
      const { error: notifErr } = await sb.rpc("notify_recurring_generated", {
        p_group_id: tmpl.group_id,
        p_member_ids: involvedMemberIds,
        p_title: notifTitle,
        p_body: notifBody,
        p_related_table: "expenses",
        p_related_id: insertedExp.id
      });
      if(notifErr) console.warn("寫入週期性支出通知失敗（可能尚未執行 scripts/recurring_expenses_notify_fn.sql）：", notifErr);

      if(tmpl.currency === CURRENCY){
        generatedForThisCurrency.push({ expense: insertedExp, template: tmpl });
      }
    }

    if(generatedForThisCurrency.length){
      await refreshExpenses();
      renderRecurringAutoBanner(generatedForThisCurrency);
      if(typeof initNotificationBell === "function") initNotificationBell(sb, myMember);
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
      let summaryText = defaultLabel || t("currency.filterAllDefault");
      let badgeHtml = "";

      if(selected.length > 0){
        const selectedItems = options.filter(o => selected.includes(o.value));
        if(selectedItems.length === 1){
          summaryText = selectedItems[0].shortLabel || selectedItems[0].label;
        } else if(selectedItems.length === 2){
          summaryText = `${selectedItems[0].shortLabel || selectedItems[0].label}、${selectedItems[1].shortLabel || selectedItems[1].label}`;
        } else if(selectedItems.length > 2){
          summaryText = t("currency.andNMore", {label: selectedItems[0].shortLabel || selectedItems[0].label, count: selectedItems.length});
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
            <button type="button" class="sb-ms-action-btn select-all-btn">${t("summary.selectAll")}</button>
            <span class="sb-ms-header-sep">|</span>
            <button type="button" class="sb-ms-action-btn clear-all-btn">${t("common.clear")}</button>
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

    // shortLabel 以前用 .slice(0, 2) 硬切前兩個字，中文類別名稱大多剛好
    //兩三個字還看得懂，但日文/英文名稱一截就變成不成意義的字根（例如
    // 「レンタカー」被切成「レン」）。這裡的收合按鈕本來就有 CSS
    // text-overflow:ellipsis，直接用完整名稱、交給 CSS 處理真正超出寬度
    // 的情況就好，不用自己再手動截字串。
    const categoryOptions = Object.keys(CATEGORY_MAP || {}).filter(k => k !== "xcur").map(k => ({
      value: k,
      label: `${CATEGORY_MAP[k].icon} ${CATEGORY_MAP[k].name}`,
      shortLabel: `${CATEGORY_MAP[k].icon} ${CATEGORY_MAP[k].name}`
    }));

    setupMultiSelectDropdown({
      containerId: "filterCategoryDropdown",
      defaultLabel: t("currency.filterAllCategories"),
      options: categoryOptions,
      onChange: () => {
        applyFiltersAndRenderHistory();
      }
    });

    setupMultiSelectDropdown({
      containerId: "filterPayerDropdown",
      defaultLabel: t("currency.filterAllPeople"),
      options: memberOptions,
      onChange: () => {
        applyFiltersAndRenderHistory();
      }
    });

    setupMultiSelectDropdown({
      containerId: "filterInvolvedDropdown",
      defaultLabel: t("currency.filterAllPeople"),
      options: memberOptions,
      onChange: () => {
        applyFiltersAndRenderHistory();
      }
    });

    setupMultiSelectDropdown({
      containerId: "filterRepayFromDropdown",
      defaultLabel: t("currency.filterAllPeople"),
      options: memberOptions,
      onChange: () => {
        applyFiltersAndRenderRepayments();
      }
    });

    setupMultiSelectDropdown({
      containerId: "filterRepayToDropdown",
      defaultLabel: t("currency.filterAllPeople"),
      options: memberOptions,
      onChange: () => {
        applyFiltersAndRenderRepayments();
      }
    });
  }

  function getEffectiveFrom(){
    const fromEl = document.getElementById("filterFrom");
    return fromEl ? fromEl.value : "";
  }

  function highlightSearchMatch(text, query){
    if(!text) return "";
    const safe = escapeHtml(String(text));
    if(!query || !query.trim()) return safe;
    const q = query.trim();
    const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`(${escapedQ})`, 'gi');
    return safe.replace(reg, '<mark class="sb-search-match">$1</mark>');
  }

  let liveSearchKeyword = "";
  const activeMultiFilters = new Set();
  let filterMinAmountVal = null;
  let filterMaxAmountVal = null;

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

    // 全文檢索（包含：說明、備註、金額、付款人、分攤人）
    const searchTarget = [
      e.description || "",
      e.note || "",
      String(e.amount || ""),
      (e.payers || []).map(p => memberById[p.member_id] || "").join(" "),
      (e.shares || []).map(s => memberById[s.member_id] || "").join(" ")
    ].join(" ").toLowerCase();

    if(keyword && !searchTarget.includes(keyword)) return false;
    if(liveSearchKeyword && !searchTarget.includes(liveSearchKeyword)) return false;

    // 類別多選篩選
    if(selectedCats.length > 0){
      const catMeta = (window.getCategoryMeta && window.getCategoryMeta(e.description, e.note, e.category)) || { type: "general" };
      if(!selectedCats.includes(catMeta.type)) return false;
    }

    // 付款人多選篩選
    if(payerIds.length && !(e.payers || []).some(p => payerIds.includes(p.member_id))) return false;

    // 應付人多選篩選
    if(involvedIds.length && !(e.shares || []).some(s => involvedIds.includes(s.member_id))) return false;

    // 🎛️ 多維度快捷篩選 (Multi-dimensional Quick Filters)
    const myId = myMember && myMember.id;
    if(activeMultiFilters.has("involved") && myId){
      if(!(e.shares || []).some(s => s.member_id === myId)) return false;
    }
    if(activeMultiFilters.has("payer_me") && myId){
      if(!(e.payers || []).some(p => p.member_id === myId)) return false;
    }
    if(activeMultiFilters.has("addons")){
      const hasAddons = Boolean(
        (e.description && (e.description.includes("自付") || e.description.includes("加點") || e.description.includes("共同品項") || e.description.includes("<!--AI_RECEIPT_DATA:"))) ||
        (e.note && (e.note.includes("自付") || e.note.includes("加點") || e.note.includes("共同品項")))
      );
      if(!hasAddons) return false;
    }
    if(activeMultiFilters.has("recurring")){
      if(!(isRecurringGeneratedStr(e.description) || isRecurringGeneratedStr(e.note))) return false;
    }

    // 💰 金額區間篩選
    const amt = Number(e.amount) || 0;
    if(filterMinAmountVal !== null && !isNaN(filterMinAmountVal) && amt < filterMinAmountVal) return false;
    if(filterMaxAmountVal !== null && !isNaN(filterMaxAmountVal) && amt > filterMaxAmountVal) return false;

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

    const searchTarget = [
      r.note || "",
      String(r.amount || ""),
      memberById[r.from_member] || "",
      memberById[r.to_member] || ""
    ].join(" ").toLowerCase();

    if(keyword && !searchTarget.includes(keyword)) return false;
    if(liveSearchKeyword && !searchTarget.includes(liveSearchKeyword)) return false;
    if(fromIds.length && !fromIds.includes(r.from_member)) return false;
    if(toIds.length && !toIds.includes(r.to_member)) return false;

    const myId = myMember && myMember.id;
    if(activeMultiFilters.has("involved") && myId){
      if(r.from_member !== myId && r.to_member !== myId) return false;
    }
    if(activeMultiFilters.has("payer_me") && myId){
      if(r.from_member !== myId) return false;
    }

    const amt = Number(r.amount) || 0;
    if(filterMinAmountVal !== null && !isNaN(filterMinAmountVal) && amt < filterMinAmountVal) return false;
    if(filterMaxAmountVal !== null && !isNaN(filterMaxAmountVal) && amt > filterMaxAmountVal) return false;

    return true;
  }

  function updateHistoryFilterStats(filteredItems, isExp){
    let activeFilterCount = 0;
    const fromEl = document.getElementById("filterFrom");
    if(fromEl && fromEl.value) activeFilterCount++;
    const toEl = document.getElementById("filterTo");
    if(toEl && toEl.value) activeFilterCount++;
    const kwEl = document.getElementById("filterKeyword");
    if(kwEl && kwEl.value.trim()) activeFilterCount++;
    if(liveSearchKeyword) activeFilterCount++;
    if(activeMultiFilters.size > 0) activeFilterCount += activeMultiFilters.size;
    if(filterMinAmountVal !== null || filterMaxAmountVal !== null) activeFilterCount++;

    Object.values(multiSelectStates).forEach(arr => {
      if(arr && arr.length) activeFilterCount += arr.length;
    });

    const badge = document.getElementById("filterCountBadge");
    if(badge){
      if(activeFilterCount > 0){
        badge.textContent = activeFilterCount;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }

    const statsWrap = document.getElementById("historyResultStats");
    const statsText = document.getElementById("historyResultStatsText");
    if(statsWrap && statsText){
      if(activeFilterCount > 0 || (isExp && filteredItems.length !== cachedExpenses.length) || (!isExp && filteredItems.length !== cachedRepayments.length)){
        let totalAmt = 0;
        filteredItems.forEach(item => {
          totalAmt += Number(item.amount) || 0;
        });
        statsWrap.classList.remove("hidden");
        statsText.innerHTML = t("currency.historyStatsFound", {count: filteredItems.length, type: isExp ? t("common.expense") : t("common.repayment"), total: SYM+formatAmt(totalAmt)});
      } else {
        statsWrap.classList.add("hidden");
      }
    }
  }

  function applyFiltersAndRenderHistory(){
    expensePage = 0;
    const filtered = cachedExpenses.filter(passesFilter);
    updateHistoryFilterStats(filtered, true);
    renderHistory(filtered);
  }
  function applyFiltersAndRenderRepayments(){
    repaymentPage = 0;
    const filtered = cachedRepayments.filter(passesRepayFilter);
    updateHistoryFilterStats(filtered, false);
    renderRepaymentHistory(filtered);
  }

  ["filterFrom","filterTo","filterKeyword"].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener("input", ()=>{
        applyFiltersAndRenderBoth();
      });
    }
  });

  // 金額區間輸入
  const minAmtInp = document.getElementById("filterMinAmount");
  const maxAmtInp = document.getElementById("filterMaxAmount");
  if(minAmtInp){
    minAmtInp.addEventListener("input", ()=>{
      filterMinAmountVal = minAmtInp.value ? Number(minAmtInp.value) : null;
      document.querySelectorAll("#filterAmtPresets .amt-preset-btn").forEach(b => b.classList.toggle("active", b.dataset.range === "all" && !minAmtInp.value && !maxAmtInp.value));
      applyFiltersAndRenderBoth();
    });
  }
  if(maxAmtInp){
    maxAmtInp.addEventListener("input", ()=>{
      filterMaxAmountVal = maxAmtInp.value ? Number(maxAmtInp.value) : null;
      document.querySelectorAll("#filterAmtPresets .amt-preset-btn").forEach(b => b.classList.toggle("active", b.dataset.range === "all" && !minAmtInp.value && !maxAmtInp.value));
      applyFiltersAndRenderBoth();
    });
  }

  // 金額快捷級距按鈕
  document.querySelectorAll("#filterAmtPresets .amt-preset-btn").forEach(btn => {
    btn.addEventListener("click", ()=>{
      document.querySelectorAll("#filterAmtPresets .amt-preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const range = btn.dataset.range;
      if(range === "all"){
        filterMinAmountVal = null;
        filterMaxAmountVal = null;
        if(minAmtInp) minAmtInp.value = "";
        if(maxAmtInp) maxAmtInp.value = "";
      } else if(range === "small"){
        filterMinAmountVal = null;
        filterMaxAmountVal = 500;
        if(minAmtInp) minAmtInp.value = "";
        if(maxAmtInp) maxAmtInp.value = "500";
      } else if(range === "medium"){
        filterMinAmountVal = 500;
        filterMaxAmountVal = 2000;
        if(minAmtInp) minAmtInp.value = "500";
        if(maxAmtInp) maxAmtInp.value = "2000";
      } else if(range === "large"){
        filterMinAmountVal = 2000;
        filterMaxAmountVal = null;
        if(minAmtInp) minAmtInp.value = "2000";
        if(maxAmtInp) maxAmtInp.value = "";
      }
      applyFiltersAndRenderBoth();
    });
  });

  // 兩邊清單都要重算，但共用的統計列文字最後會被「後執行的那個函式」蓋
  // 過去——所以統一由這個函式決定順序，讓目前看得到的那個 tab 排在最後
  // 執行，畫面上的統計列文字才會跟目前顯示的清單一致。
  function applyFiltersAndRenderBoth(){
    const isExpActive = document.querySelector('.history-type-btn[data-history-type="expense"]')?.classList.contains("active");
    if(isExpActive){
      applyFiltersAndRenderRepayments();
      applyFiltersAndRenderHistory();
    } else {
      applyFiltersAndRenderHistory();
      applyFiltersAndRenderRepayments();
    }
  }

  // 🎛️ 多維度快捷 Chips 事件綁定（常駐區的「與我相關」+ 進階篩選區的其餘 Chips）
  // 一定要限定 [data-quick] 才綁——「🔍 篩選」「📷 收據牆」這幾顆按鈕純粹是外觀
  // 借用同一顆 .multi-chip 樣式，本身不是快捷篩選 chip，之前沒加這個限定條件，
  // 點「🔍 篩選」開進階篩選視窗時會被這裡誤判成「切換一個 data-quick 是
  // undefined 的篩選」，把它也算進 activeMultiFilters 裡，篩選數量 / 結果統計列
  // 因此無緣無故顯示「已篩選」，即使使用者根本沒設定任何條件。
  document.querySelectorAll(".multi-chip[data-quick]").forEach(chip => {
    chip.addEventListener("click", ()=>{
      const quick = chip.dataset.quick;
      if(activeMultiFilters.has(quick)){
        activeMultiFilters.delete(quick);
        chip.classList.remove("active");
      } else {
        activeMultiFilters.add(quick);
        chip.classList.add("active");
      }
      applyFiltersAndRenderBoth();
    });
  });

  // 即時搜尋與分類 Chips 事件綁定
  const liveSearchInp = document.getElementById("historyLiveSearch");
  const liveSearchClear = document.getElementById("historyLiveSearchClear");
  if(liveSearchInp){
    // 加防抖動：紀錄一多，每打一個字就整批重新過濾、重畫列表會感覺到卡，
    // 停手 200ms 後才真的重新整理，打字當下只是單純的輸入框反應。
    let liveSearchDebounceTimer = null;
    liveSearchInp.addEventListener("input", ()=>{
      liveSearchKeyword = liveSearchInp.value.trim().toLowerCase();
      if(liveSearchClear) liveSearchClear.classList.toggle("hidden", !liveSearchKeyword);
      clearTimeout(liveSearchDebounceTimer);
      liveSearchDebounceTimer = setTimeout(()=>{ applyFiltersAndRenderBoth(); }, 200);
    });
  }
  if(liveSearchClear){
    liveSearchClear.addEventListener("click", ()=>{
      if(liveSearchInp) liveSearchInp.value = "";
      liveSearchKeyword = "";
      liveSearchClear.classList.add("hidden");
      applyFiltersAndRenderBoth();
    });
  }
  function resetAllHistoryFilters(){
    document.getElementById("filterFrom").value = "";
    document.getElementById("filterTo").value = "";
    document.getElementById("filterKeyword").value = "";
    if(liveSearchInp) liveSearchInp.value = "";
    if(liveSearchClear) liveSearchClear.classList.add("hidden");
    liveSearchKeyword = "";
    activeMultiFilters.clear();
    filterMinAmountVal = null;
    filterMaxAmountVal = null;
    if(minAmtInp) minAmtInp.value = "";
    if(maxAmtInp) maxAmtInp.value = "";
    document.querySelectorAll("#filterAmtPresets .amt-preset-btn").forEach(c => c.classList.toggle("active", c.dataset.range === "all"));
    document.querySelectorAll(".multi-chip").forEach(c => c.classList.remove("active"));
    Object.keys(multiSelectStates).forEach(k => {
      multiSelectStates[k] = [];
    });
    initFilterMultiSelects();
    applyFiltersAndRenderBoth();
  }

  const filterClearBtn = document.getElementById("filterClearBtn");
  if(filterClearBtn) filterClearBtn.addEventListener("click", resetAllHistoryFilters);

  const statsResetBtn = document.getElementById("historyStatsResetBtn");
  if(statsResetBtn) statsResetBtn.addEventListener("click", resetAllHistoryFilters);

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

  // ---------- 收據圖片總覽牆 ----------
  // 資料直接重用 cachedExpenses（已經是「目前這個幣別」的支出清單，且已按日期新到舊排序），
  // 不用另外打一次 API；縮圖網址是 receipts 這個私有 bucket 的簽名網址，一次簽 300 秒，
  // 開牆時才批次簽、簽過的存 receiptGallerySignedUrlCache 快取，避免縮圖跟燈箱重複簽兩次。
  const RECEIPT_GALLERY_PAGE_SIZE = 20;
  let receiptGalleryItems = [];
  let receiptGalleryShown = 0;
  let receiptGallerySignedUrlCache = {};

  function renderReceiptGalleryEmpty(){
    const grid = document.getElementById("receiptGalleryGrid");
    const loadMoreBtn = document.getElementById("receiptGalleryLoadMoreBtn");
    if(grid) grid.innerHTML = emptyStateHTML("📷", t("currency.receiptGalleryEmpty"), t("currency.receiptGalleryEmptyDesc"));
    if(loadMoreBtn) loadMoreBtn.classList.add("hidden");
  }

  async function loadReceiptGalleryPage(){
    const grid = document.getElementById("receiptGalleryGrid");
    const loadMoreBtn = document.getElementById("receiptGalleryLoadMoreBtn");
    if(!grid) return;
    const batch = receiptGalleryItems.slice(receiptGalleryShown, receiptGalleryShown + RECEIPT_GALLERY_PAGE_SIZE);
    if(!batch.length) return;

    batch.forEach(e => {
      const thumb = document.createElement("div");
      thumb.className = "receipt-gallery-thumb";
      thumb.dataset.expenseId = e.id;
      thumb.innerHTML = `<span class="receipt-gallery-thumb-loading">⏳</span>`;
      thumb.addEventListener("click", () => openReceiptLightbox(e.id));
      grid.appendChild(thumb);
    });
    receiptGalleryShown += batch.length;
    if(loadMoreBtn){
      if(receiptGalleryShown < receiptGalleryItems.length) loadMoreBtn.classList.remove("hidden");
      else loadMoreBtn.classList.add("hidden");
    }

    await Promise.all(batch.map(async e => {
      const thumb = grid.querySelector(`.receipt-gallery-thumb[data-expense-id="${e.id}"]`);
      try {
        let signedUrl = receiptGallerySignedUrlCache[e.id];
        if(!signedUrl){
          const { data, error } = await sb.storage.from("receipts").createSignedUrl(e.receipt_image_path, 300);
          if(error || !data || !data.signedUrl) throw error || new Error("receipt image not found");
          signedUrl = data.signedUrl;
          receiptGallerySignedUrlCache[e.id] = signedUrl;
        }
        if(thumb){
          const { title } = splitExpenseTitleAndNote(e.description || "", e.note || "");
          thumb.innerHTML = `<img src="${signedUrl}" alt="${escapeHtml(title || e.description || "")}"><div class="receipt-gallery-thumb-amt">${SYM}${formatAmt(e.amount)}</div>`;
        }
      } catch(err){
        console.error("載入收據縮圖失敗：", err);
        if(thumb) thumb.innerHTML = `<span class="receipt-gallery-thumb-loading" style="animation:none;opacity:.35;">🚫</span>`;
      }
    }));
  }

  function openReceiptGallery(){
    const modal = document.getElementById("receiptGalleryModal");
    const grid = document.getElementById("receiptGalleryGrid");
    if(!modal || !grid) return;
    grid.innerHTML = "";
    receiptGalleryShown = 0;
    receiptGalleryItems = cachedExpenses.filter(e => e.receipt_image_path);
    modal.classList.add("show");
    if(!receiptGalleryItems.length){
      renderReceiptGalleryEmpty();
      return;
    }
    loadReceiptGalleryPage();
  }

  // 共用的收據燈箱——收據牆縮圖、AI 拆單編輯看板的「查看收據原圖」都走這裡，
  // 兩個地方點開收據照片的體驗（原地放大看、不是跳新分頁）才會一致。
  // onView 沒給的話（例如從 AI 拆單編輯看板開的，本來就已經在編輯這筆帳了，
  // 沒有「查看支出明細」的必要）就把那顆按鈕藏起來。
  window.showReceiptLightbox = function({ imgUrl, title, meta, onView }){
    const modal = document.getElementById("receiptLightboxModal");
    const img = document.getElementById("receiptLightboxImg");
    const descEl = document.getElementById("receiptLightboxDesc");
    const metaEl = document.getElementById("receiptLightboxMeta");
    const viewBtn = document.getElementById("receiptLightboxViewBtn");
    if(!modal || !img) return;
    img.src = imgUrl || "";
    if(descEl) descEl.textContent = title || "";
    if(metaEl) metaEl.textContent = meta || "";
    if(viewBtn){
      if(typeof onView === "function"){
        viewBtn.classList.remove("hidden");
        viewBtn.onclick = () => { modal.classList.remove("show"); onView(); };
      } else {
        viewBtn.classList.add("hidden");
        viewBtn.onclick = null;
      }
    }
    modal.classList.add("show");
  };

  function openReceiptLightbox(expenseId){
    const e = cachedExpenses.find(x => x.id === expenseId);
    if(!e) return;
    const { title } = splitExpenseTitleAndNote(e.description || "", e.note || "");
    window.showReceiptLightbox({
      imgUrl: receiptGallerySignedUrlCache[e.id] || "",
      title: title || e.description || t("currency.expenseDetailFallback"),
      meta: `${e.expense_date || ""}　${SYM}${formatAmt(e.amount)}`,
      onView: () => {
        const galleryModal = document.getElementById("receiptGalleryModal");
        if(galleryModal) galleryModal.classList.remove("show");
        showExpenseDebtDetail(e);
      }
    });
  }

  const receiptGalleryOpenBtn = document.getElementById("receiptGalleryOpenBtn");
  const receiptGalleryModal = document.getElementById("receiptGalleryModal");
  const receiptGalleryCloseBtn = document.getElementById("receiptGalleryCloseBtn");
  const receiptGalleryLoadMoreBtn = document.getElementById("receiptGalleryLoadMoreBtn");
  const receiptLightboxModal = document.getElementById("receiptLightboxModal");
  const receiptLightboxCloseBtn = document.getElementById("receiptLightboxCloseBtn");
  if(receiptGalleryOpenBtn){
    receiptGalleryOpenBtn.addEventListener("click", openReceiptGallery);
  }
  if(receiptGalleryCloseBtn && receiptGalleryModal){
    receiptGalleryCloseBtn.addEventListener("click", ()=> receiptGalleryModal.classList.remove("show"));
  }
  if(receiptGalleryLoadMoreBtn){
    receiptGalleryLoadMoreBtn.addEventListener("click", loadReceiptGalleryPage);
  }
  if(receiptLightboxCloseBtn && receiptLightboxModal){
    receiptLightboxCloseBtn.addEventListener("click", ()=> receiptLightboxModal.classList.remove("show"));
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

  // 跨幣別轉移的識別碼統一用 [xcur:UUID] 這種標記塞進 description/note 裡
  // （見下面產生轉入紀錄那段），這裡從文字裡把它撈出來；舊資料可能是沒有
  // 中括號、直接裸露 UUID 或 xcur_ 開頭的舊格式，所以還是留著備援比對。
  function extractXcurId(str){
    if(!str) return null;
    const bracketMatch = String(str).match(/\[xcur[:_]([^\]]+)\]/i);
    if(bracketMatch) return bracketMatch[1];
    const uuidMatch = String(str).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if(uuidMatch) return uuidMatch[0];
    const legacyMatch = String(str).match(/xcur_[a-zA-Z0-9_-]+/);
    return legacyMatch ? legacyMatch[0] : null;
  }

  // 週期性支出自動產生的那一筆，用 [recurring:範本id] 這種標記塞進 description/note
  // 裡（見 generateDueRecurringExpenses()），跟 xcur 是同一套「隱藏標記」做法——
  // 標記本身會被 splitExpenseTitleAndNote() 從顯示用的標題/備註裡拿掉，編輯存檔時
  // 又會自動黏回新的 description 後面，所以編輯這筆帳不會不小心弄丟這個標記。
  function isRecurringGeneratedStr(str){
    return Boolean(str && String(str).includes("[recurring:"));
  }
  function extractRecurringTemplateId(str){
    if(!str) return null;
    const m = String(str).match(/\[recurring:([^\]]+)\]/i);
    return m ? m[1] : null;
  }

  function splitExpenseTitleAndNote(fullDesc, explicitNote){
    const metaMatches = [];
    const extractMeta = (s) => {
      if(!s) return "";
      return String(s)
        .replace(/<!--[\s\S]*?-->/gi, (m) => { metaMatches.push(m); return ""; })
        .replace(/AI_RECEIPT_DATA:[\s\S]*/gi, "")
        .replace(/\s*\[xcur[:_][^\]]+\]/gi, (m) => { metaMatches.push(m.trim()); return ""; })
        .replace(/\s*\[recurring:[^\]]+\]/gi, (m) => { metaMatches.push(m.trim()); return ""; })
        .trim();
    };

    let cleanedDesc = extractMeta(fullDesc);
    let cleanedExplicitNote = extractMeta(explicitNote);

    let title = "";
    let note = "";

    if(cleanedExplicitNote){
      title = cleanedDesc.replace(/\(AI自動拆單\)/g, "").trim() || t("summary.notifExpenseItemFallback");
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

      title = firstLine.replace(/\(AI自動拆單\)/g, "").trim() || t("summary.notifExpenseItemFallback");
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
      t("currency.xcurRestoreConfirm"),
      t("currency.xcurRestoreTitle")
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
      await sbAlert(t("currency.restoreFailed") + err.error.message, t("settings.errorTitle"));
      return;
    }
    await sbAlert(t("currency.xcurRestoreSuccess"), t("common.notifyDialogTitle"));
    await refreshExpenses();
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
    if(error){ await sbAlert(t("currency.deleteFailed") + error.message, t("settings.errorTitle")); return; }
    await refreshFn();
    showToast(t("currency.deletedToastTitle"), label || "", t("currency.undoLabel"), async ()=>{
      const { error: restoreErr } = await sb.from(table).insert(list);
      if(restoreErr){ await sbAlert(t("currency.undoFailed") + restoreErr.message, t("settings.errorTitle")); return; }
      await refreshFn();
    });
  }

  let expenseById = {};
  let lastFilteredExpenses = [];

  function renderHistory(expenses){
    const el = document.getElementById("expenseHistory");
    if(!el) return;
    lastFilteredExpenses = expenses;
    if(!expenses.length){
      el.innerHTML = cachedExpenses.length
        ? emptyStateHTML("🔍", t("currency.noFilterMatchTitle"), t("currency.noFilterMatchDesc"))
        : emptyStateHTML("🧾", t("currency.noExpensesTitle"), t("currency.noExpensesDesc"));
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
      const d = e.expense_date || t("currency.unspecifiedDate");
      if(!curGroup || curGroup.date !== d){
        curGroup = { date: d, items: [], total: 0 };
        groups.push(curGroup);
      }
      curGroup.items.push(e);
      curGroup.total += Number(e.amount) || 0;
    });

    const searchKw = liveSearchKeyword || (document.getElementById("filterKeyword") ? document.getElementById("filterKeyword").value.trim().toLowerCase() : "");
    const myId = myMember && myMember.id;

    el.innerHTML = groups.map(g => {
      const dateTitle = formatDateGroupTitle(g.date);
      const itemsHtml = g.items.map(e => {
        const { title, note } = splitExpenseTitleAndNote(e.description, e.note);
        const canEdit = isExpenseParty(e, myId) || e.created_by === myId;
        const isXcur = isXcurStr(e.description) || isXcurStr(e.note);
        const xcurId = isXcur ? (extractXcurId(e.description) || extractXcurId(e.note)) : null;
        const isRecurringGenerated = isRecurringGeneratedStr(e.description) || isRecurringGeneratedStr(e.note);
        const isAiSplit = Boolean((e.description && (e.description.includes("<!--AI_RECEIPT_DATA:") || e.description.includes("(AI自動拆單)") || e.description.includes("📋 品項明細"))) || (e.note && e.note.includes("<!--AI_RECEIPT_DATA:")));
        const catMeta = (window.getCategoryMeta && window.getCategoryMeta(title || e.description, e.note, e.category)) || { icon: "🧾", type: "general", name: t("currency.categoryGeneralFallback") };
        const icon = catMeta.icon;
        const payerNames = (e.payers || []).map(p => highlightSearchMatch(memberById[p.member_id] || "?", searchKw)).join("、");
        const shareNames = (e.shares || []).map(s => highlightSearchMatch(memberById[s.member_id] || "?", searchKw)).join("、");
        const shareAvatars = (e.shares || []).slice(0, 4).map(s => renderAvatarHTML({ id: s.member_id, name: memberById[s.member_id] }, "avatar-xs")).join("");
        const shareMore = (e.shares || []).length > 4 ? `<span class="avatar-stack-more">+${(e.shares || []).length - 4}</span>` : "";
        const firstLineNote = note ? note.split("\n")[0].trim() : "";
        const highlightedTitle = highlightSearchMatch(title, searchKw);
        const highlightedNote = highlightSearchMatch(firstLineNote.length > 40 ? firstLineNote.slice(0, 38) + "…" : firstLineNote, searchKw);
        const highlightedAmt = highlightSearchMatch(formatAmt(e.amount), searchKw);
        return `<div class="exp-item" data-id="${e.id}" title="${t("currency.clickToViewDebtDetail")}">
          <div class="exp-cat-badge exp-cat-${catMeta.type}" title="${catMeta.name}">${icon}</div>
          <div class="exp-main">
            <div class="exp-desc">${highlightedTitle}${isAiSplit ? `<span class="ai-split-badge" style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;background:color-mix(in srgb, var(--btn-primary) 14%, var(--paper));color:var(--btn-primary);margin-left:5px;">${t("currency.aiSplitBadge")}</span>` : ""}${isXcur ? `<span class="xcur-badge">${t("currency.xcurBadge")}</span>` : ""}${isRecurringGenerated ? `<span class="recurring-badge">${t("currency.recurringBadge")}</span>` : ""}</div>
            <div class="exp-meta">
              ${firstLineNote ? `<span class="exp-meta-line" style="color:var(--ink);font-weight:600;opacity:0.9;">${t("currency.notePrefix")}${highlightedNote}</span>` : ""}
              <span class="exp-meta-line">${t("currency.timePrefix")}${e.expense_date}${formatTime(e.created_at, e.expense_date) ? " " + formatTime(e.created_at, e.expense_date) : ""}（${highlightSearchMatch(memberById[e.created_by] || "?", searchKw)}）</span>
              <span class="exp-meta-line">${t("currency.paymentPrefix")}${payerNames || "—"}</span>
              <span class="exp-meta-line">${t("currency.owePrefix")}${shareNames || "—"}</span>
            </div>
          </div>
          <div class="exp-right">
            <div class="exp-amt">${SYM}${highlightedAmt}${conversionHint(e.amount)}</div>
            ${canEdit ? `<div class="exp-actions">${isXcur ? `${xcurId ? `<button class="exp-xcur-editrate" data-xcur="${xcurId}" title="${t("currency.editRateTitle")}" aria-label="${t("currency.editRateTitle")}">✎</button>` : ""}<button class="exp-del exp-xcur-restore" data-id="${e.id}" title="${t("currency.restoreThisTransferTitle")}" aria-label="${t("currency.restoreAria")}">↺</button>` : `<button class="exp-edit" data-id="${e.id}" title="${t("common.edit")}">✎</button><button class="exp-del" data-id="${e.id}" title="${t("settings.delete")}">✕</button>`}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      return `
        <div class="exp-date-group">
          <div class="exp-date-group-header">
            <div class="exp-date-group-title">📅 ${dateTitle}</div>
            <div class="exp-date-group-badge">
              <span class="badge-count">${t("common.countUnit", {count: g.items.length})}</span>
              <span class="badge-sep">·</span>
              <span class="badge-subtotal">${t("currency.dailySubtotal")} <b>${SYM}${formatAmt(g.total)}</b></span>
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
        if(!e) return;
        showExpenseDebtDetail(e);
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
            if(error){ await sbAlert(t("currency.deleteFailed") + error.message, t("settings.errorTitle")); return; }
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
        if(typeof openXcurRateEditModal === "function") openXcurRateEditModal(btn.dataset.xcur);
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
        ? emptyStateHTML("🔍", t("currency.noFilterMatchTitle"), t("currency.noFilterMatchDesc"))
        : emptyStateHTML("💸", t("currency.noRepaymentsTitle"), t("currency.noRepaymentsDesc"));
      return;
    }
    const units = groupRepayments(repayments);
    const totalPages = Math.ceil(units.length / historyPageSize);
    if(repaymentPage >= totalPages) repaymentPage = totalPages - 1;
    if(repaymentPage < 0) repaymentPage = 0;
    const pageUnits = units.slice(repaymentPage * historyPageSize, (repaymentPage + 1) * historyPageSize);

    repaymentById = {};
    pageUnits.forEach(u => u.items.forEach(r => { repaymentById[r.id] = r; }));

    const searchKw = liveSearchKeyword || (document.getElementById("filterKeyword") ? document.getElementById("filterKeyword").value.trim().toLowerCase() : "");
    const myId = myMember && myMember.id;

    // 按日期分組呈現
    const groups = [];
    let curGroup = null;
    pageUnits.forEach(u => {
      const d = (u.items && u.items[0] && u.items[0].payment_date) || t("currency.unspecifiedDate");
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
          const canEdit = isRepaymentParty(a, myId);
          const isXcur = isXcurStr(a.offset_group) || isXcurStr(a.note);
          const xcurId = isXcur ? (a.offset_group || extractXcurId(a.note)) : null;
          return `<div class="exp-item">
            <div class="exp-cat-badge" style="background:color-mix(in srgb, #5C7CFA 12%, var(--card));">🔄</div>
            <div class="exp-main">
              <div class="exp-desc">${highlightSearchMatch(memberById[a.from_member] || "?", searchKw)} ↔ ${highlightSearchMatch(memberById[a.to_member] || "?", searchKw)} ${t("currency.mutualOffset")}${isXcur ? `<span class="xcur-badge">${t("currency.convertedToTwd")}</span>` : ""}</div>
              <div class="exp-meta">${t("currency.recordTimePrefix")}${a.payment_date}${formatTime(a.created_at, a.payment_date) ? " " + formatTime(a.created_at, a.payment_date) : ""}（${highlightSearchMatch(memberById[a.created_by] || "?", searchKw)}）</div>
            </div>
            <div class="exp-right">
              <div class="exp-amt">${SYM}${highlightSearchMatch(formatAmt(a.amount), searchKw)}${conversionHint(a.amount)}</div>
              ${canEdit ? `<div class="exp-actions">${(isXcur && xcurId) ? `<button class="exp-xcur-editrate" data-xcur="${xcurId}" title="${t("currency.editRateTitle")}" aria-label="${t("currency.editRateTitle")}">✎</button>` : ""}<button class="exp-del exp-del-group ${isXcur ? "exp-xcur-restore" : ""}" data-group="${a.offset_group}" title="${isXcur ? t("currency.restoreXcurTransferTitle") : t("currency.deleteOffsetGroupTitle")}" aria-label="${isXcur ? t("currency.restoreAria") : t("settings.delete")}">${isXcur ? "↺" : "✕"}</button></div>` : ""}
            </div>
          </div>`;
        }
        const r = u.items[0];
        const canEdit = isRepaymentParty(r, myId) || r.created_by === myId;
        const isXcur = isXcurStr(r.note) || isXcurStr(r.offset_group);
        const xcurId = isXcur ? (r.offset_group || extractXcurId(r.note)) : null;
        const cleanNote = cleanXcurText(r.note);
        return `<div class="exp-item">
          <div class="exp-cat-badge" style="background:color-mix(in srgb, #40C057 12%, var(--card));">💸</div>
          <div class="exp-main">
            <div class="exp-desc">${t("currency.repayFromTo", {from: highlightSearchMatch(memberById[r.from_member] || "?", searchKw), to: highlightSearchMatch(memberById[r.to_member] || "?", searchKw)})}${isXcur ? `<span class="xcur-badge">${t("currency.convertedToTwd")}</span>` : ""}</div>
            <div class="exp-meta">${t("currency.recordTimePrefix")}${r.payment_date}${formatTime(r.created_at, r.payment_date) ? " " + formatTime(r.created_at, r.payment_date) : ""}（${highlightSearchMatch(memberById[r.created_by] || "?", searchKw)}）${cleanNote ? " ・ " + highlightSearchMatch(cleanNote, searchKw) : ""}</div>
          </div>
          <div class="exp-right">
            <div class="exp-amt">${SYM}${highlightSearchMatch(formatAmt(r.amount), searchKw)}${conversionHint(r.amount)}</div>
            ${canEdit ? `<div class="exp-actions">${isXcur ? `${xcurId ? `<button class="exp-xcur-editrate" data-xcur="${xcurId}" title="${t("currency.editRateTitle")}" aria-label="${t("currency.editRateTitle")}">✎</button>` : ""}<button class="exp-del exp-xcur-restore" data-id="${r.id}" title="${t("currency.restoreThisTransferTitle")}" aria-label="${t("currency.restoreAria")}">↺</button>` : `<button class="exp-edit" data-id="${r.id}" title="${t("common.edit")}">✎</button><button class="exp-del" data-id="${r.id}" title="${t("settings.delete")}">✕</button>`}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      return `
        <div class="exp-date-group">
          <div class="exp-date-group-header">
            <div class="exp-date-group-title">📅 ${dateTitle}</div>
            <div class="exp-date-group-badge">
              <span class="badge-count">${t("common.countUnit", {count: g.units.length})}</span>
              <span class="badge-sep">·</span>
              <span class="badge-subtotal">${t("currency.dailySubtotal")} <b>${SYM}${formatAmt(g.total)}</b></span>
            </div>
          </div>
          ${unitsHtml}
        </div>
      `;
    }).join("") + paginationHTML(repaymentPage, totalPages);

    el.querySelectorAll(".exp-del-group").forEach(btn=>{
      btn.addEventListener("click", async (e)=>{
        e.stopPropagation();
        const group = btn.dataset.group;
        const items = cachedRepayments.filter(r => r.offset_group === group);
        if(!items.length) return;
        const rawNote = (items[0] && items[0].note) || "";
        if(isXcurStr(group) || isXcurStr(rawNote)){
          return handleCrossCurrencyDelete(group || rawNote, async ()=>{
            const { error } = await sb.from("repayments").delete().eq("offset_group", group);
            if(error){ await sbAlert(t("currency.deleteFailed") + error.message, t("settings.errorTitle")); return; }
            await refreshExpenses();
          });
        }
        await deleteRowsWithUndo("repayments", items, refreshExpenses, t("currency.oneClickOffsetRecord"));
      });
    });
    el.querySelectorAll(".exp-del:not(.exp-del-group)").forEach(btn=>{
      btn.addEventListener("click", async (e)=>{
        e.stopPropagation();
        const rep = repaymentById[btn.dataset.id];
        const rawNote = (rep && rep.note) || "";
        if(isXcurStr(rawNote)){
          return handleCrossCurrencyDelete(rawNote, async ()=>{
            const { error } = await sb.from("repayments").delete().eq("id", btn.dataset.id);
            if(error){ await sbAlert(t("currency.deleteFailed") + error.message, t("settings.errorTitle")); return; }
            await refreshExpenses();
          });
        }
        if(!rep) return;
        const fromName = memberById[rep.from_member] || t("summary.someone");
        const toName = memberById[rep.to_member] || t("summary.someone");
        await deleteRowsWithUndo("repayments", rep, refreshExpenses, t("currency.repayFromTo", {from: fromName, to: toName}));
      });
    });
    el.querySelectorAll(".exp-edit").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        const rep = repaymentById[btn.dataset.id];
        if(rep) startEditRepayment(rep);
      });
    });
    el.querySelectorAll(".exp-xcur-editrate").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        if(typeof openXcurRateEditModal === "function") openXcurRateEditModal(btn.dataset.xcur);
      });
    });
    const prevBtn = el.querySelector(".pagination-prev");
    if(prevBtn) prevBtn.addEventListener("click", ()=>{ repaymentPage--; renderRepaymentHistory(lastFilteredRepayments); });
    const nextBtn = el.querySelector(".pagination-next");
    if(nextBtn) nextBtn.addEventListener("click", ()=>{ repaymentPage++; renderRepaymentHistory(lastFilteredRepayments); });
  }

  function formatDateGroupTitle(dateStr){
    if(!dateStr) return "";
    try{
      const parts = dateStr.split("-");
      if(parts.length === 3){
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const weekdays = t("currency.weekdays").split(",");
        const weekday = weekdays[d.getDay()] || "";
        return t("currency.dateGroupTitle", {month: Number(parts[1]), day: Number(parts[2]), weekday});
      }
    }catch(e){}
    return dateStr;
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
    if(granularity === "month") return t("currency.monthUnit", {month: start.getMonth() + 1});
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
      wrap.innerHTML = `<p class="filter-hint">${t("currency.noFlowChartData")}</p>`;
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
    wrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="spend-chart" role="img" aria-label="${t("currency.flowChartAriaLabel")}">
      <line x1="0" y1="${midY}" x2="${w}" y2="${midY}" class="flow-zero-line"/>
      ${bars}
    </svg>
    <div class="flow-chart-legend"><span class="legend-up">${t("currency.legendOwe")}</span><span class="legend-down">${t("currency.legendReceived")}</span></div>`;
  }

  function updateChartRangeLabel(bucketStarts){
    const label = document.getElementById("chartRangeLabel");
    if(!label) return;
    const fromLabel = bucketLabel(chartGranularity, bucketStarts[0]);
    const toLabel = chartGranularity === "week"
      ? bucketLabel(chartGranularity, bucketEnd(chartGranularity, bucketStarts[3]))
      : bucketLabel(chartGranularity, bucketStarts[3]);
    label.textContent = chartGranularity === "year" ? t("currency.yearRangeLabel", {from: fromLabel, to: toLabel}) : t("currency.rangeLabel", {from: fromLabel, to: toLabel});
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

  // ==========================================================
  // 催款提醒：呼叫 send_debt_reminder 這支資料庫 RPC，直接寫一筆進
  // notifications 表給欠錢的人看（節流判斷交給後端 RPC，同一組人同一個
  // 幣別 24 小時內只能提醒一次）。矩陣明細彈窗的「提醒對方」按鈕
  // （見 showPairDetail 的 canRemind）用的是這份邏輯。
  // ==========================================================
  async function sendDebtReminderFromBtn(btn){
    const debtorId = btn.dataset.debtor;
    const creditorId = btn.dataset.creditor;
    const amt = Number(btn.dataset.amt) || 0;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("currency.sendingEllipsis");

    const { data, error } = await sb.rpc("send_debt_reminder", {
      p_debtor_member_id: debtorId,
      p_amount: amt,
      p_currency: CURRENCY
    });

    btn.disabled = false;
    btn.textContent = originalText;

    if(error){
      console.error("提醒發送失敗：", error);
      await sbAlert(t("currency.reminderSendFailed"), t("settings.errorTitle"));
      return;
    }
    if(data === "THROTTLED"){
      await sbAlert(t("currency.reminderThrottled"), t("currency.reminderThrottledTitle"));
      return;
    }
    if(data === "FORBIDDEN"){
      await sbAlert(t("currency.reminderSendFailed"), t("settings.errorTitle"));
      return;
    }

    // 站內通知已經寫進去了（上面 RPC 保證的那條路），這裡再「順便」
    // 呼叫一次推播，純加分——刻意不 await、不管成不成功都不影響
    // 使用者看到的「已提醒」結果，對方沒開推播權限也完全沒差。
    sb.functions.invoke("send-reminder", {
      body: { debtorMemberId: debtorId, creditorMemberId: creditorId, amount: amt, currency: CURRENCY }
    }).catch(()=>{});

    await sbAlert(t("currency.reminderSentSuccess", {name: memberById[debtorId] || t("currency.counterpartFallback")}), t("common.notifyDialogTitle"));
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
        const label = amt > 0.05 ? t("summary.owedLabel", {amount: SYM+formatAmt(amt)+conversionHint(amt)}) : amt < -0.05 ? t("summary.oweLabel", {amount: SYM+formatAmt(Math.abs(amt))+conversionHint(Math.abs(amt))}) : t("summary.settledShort");
        return `<div class="balance-row"><span>${escapeHtml(m.name)}</span><span class="amt ${cls}">${label}</span></div>`;
      }).join("");
    }

    // myMember 偶爾會在 loadMembers() 還沒跑完時就先被 Realtime 觸發的
    // refreshExpenses() 呼叫到這裡，這幾行「我自己」相關的畫面沒防呆
    // 直接讀 myMember.id 會整個 crash 掉，先跳過、等 myMember 準備好
    // 之後下一次渲染自然會補上。
    if(myMember){
      const myAmt = balance[myMember.id] || 0;
      const myCls = myAmt > 0.05 ? "pos" : myAmt < -0.05 ? "neg" : "zero";
      const myAbs = Math.abs(myAmt);
      const myBalanceAmtEl = document.getElementById("myBalanceAmt");
      if(myBalanceAmtEl){
        if(myCls === "zero"){
          myBalanceAmtEl.innerHTML = t("summary.settledCheer");
        } else {
          myBalanceAmtEl.innerHTML = myCls === "pos"
            ? t("summary.owedLabel", {amount: SYM+formatAmt(myAbs)+conversionHint(myAbs)})
            : t("summary.oweLabel", {amount: SYM+formatAmt(myAbs)+conversionHint(myAbs)});
        }
        myBalanceAmtEl.className = "my-balance-amt " + myCls;
        // 金額文字（例如「精算済み🎉」）是這裡非同步渲染出來的，比頁面
        // 一開始設定標題文字晚很多；旁邊 myBalanceLabel 那時候量測可用
        // 寬度用的還是還沒放大金額文字前的舊寬度，這裡金額確定之後要
        // 再校正一次，不然日文幣別名稱較長時還是可能撞在一起或跳行。
        if(typeof window.fitTextToOneLine === "function"){
          const balanceLabelEl = document.getElementById("myBalanceLabel");
          if(balanceLabelEl) window.fitTextToOneLine(balanceLabelEl, 11);
        }
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
    }

    chartExpensesCache = expenses;
    chartRepaymentsCache = repayments;
    updateSpendChart();
    renderCategoryDonutChart(expenses);
    renderSpendingInsights(expenses);

    // 這兩個畫面用的是同一份債務資料，算一次共用，不用各自重算一遍
    // buildDebtMatrix()（要重新掃過全部支出/還款，資料一多會是浪費）。
    const owedForRender = buildDebtMatrix(expenses, repayments);
    renderSettlement(expenses, repayments, owedForRender);
    renderDebtMatrix(expenses, repayments, owedForRender);
  }

  // 💸 結算提醒：太久沒還款、但這個幣別還有未結清的餘額時，主動提示一下——
  // 純粹用既有的 repayments 最新日期 + member_balances 算出來，不用另外記錄
  // 「上次結清時間」。跟催款提醒（send_debt_reminder，針對特定一對人）不同，
  // 這個是「整個幣別帳都放很久沒人處理」的整體提醒，一天最多看到一次（用
  // localStorage 記當天有沒有關掉過，跟 matrixShowOnlyMine 同一種輕量作法）。
  const SETTLE_REMINDER_THRESHOLD_DAYS = 30;
  function renderSettleReminder(repayments, balRows){
    const banner = document.getElementById("settleReminderBanner");
    if(!banner) return;

    const hasOutstanding = (balRows || []).some(row => row.currency === CURRENCY && Math.abs(Number(row.balance)) > 0.5);
    if(!hasOutstanding){
      banner.innerHTML = "";
      return;
    }

    const dismissKey = "sb_settle_reminder_dismissed_" + CURRENCY;
    const todayStr = new Date().toISOString().slice(0, 10);
    if(localStorage.getItem(dismissKey) === todayStr){
      banner.innerHTML = "";
      return;
    }

    const relevantRepayments = (repayments || []).filter(r => r.currency === CURRENCY);
    if(!relevantRepayments.length){
      // 從來沒還款紀錄，沒有「上次」可以算，不硬湊一個天數出來誤導使用者。
      banner.innerHTML = "";
      return;
    }
    const lastDateStr = relevantRepayments.reduce((max, r) => r.payment_date > max ? r.payment_date : max, relevantRepayments[0].payment_date);
    const daysSince = Math.floor((new Date(todayStr) - new Date(lastDateStr)) / 86400000);
    if(daysSince < SETTLE_REMINDER_THRESHOLD_DAYS){
      banner.innerHTML = "";
      return;
    }

    banner.innerHTML = `<div class="card recurring-auto-banner-item">
      <span class="recurring-auto-banner-text">${t("currency.settleReminderText", {days: daysSince})}</span>
      <span class="recurring-auto-banner-actions">
        <button type="button" class="link-btn" id="settleReminderGoBtn">${t("currency.settleReminderGoBtn")}</button>
        <button type="button" class="recurring-auto-banner-close" aria-label="${t("common.close")}">✕</button>
      </span>
    </div>`;

    const goBtn = document.getElementById("settleReminderGoBtn");
    if(goBtn){
      goBtn.addEventListener("click", ()=>{
        const repayTab = document.querySelector('.app-tab[data-tab="repay"]');
        if(repayTab) repayTab.click();
      });
    }
    const closeBtn = banner.querySelector(".recurring-auto-banner-close");
    if(closeBtn){
      closeBtn.addEventListener("click", ()=>{
        localStorage.setItem(dismissKey, todayStr);
        banner.innerHTML = "";
      });
    }
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

  // 📈 花費分析加強：最常記的品項排行——同一批 cachedExpenses 資料換角度呈現，
  // 不用多打一次 API。放在花費類別分佈圖旁邊，跟圖表共用同一個「全團支出／
  // 我的支出」範圍開關（donutScope），使用者切了圖表範圍，這裡也要跟著切。
  function renderSpendingInsights(expenses){
    const wrap = document.getElementById("spendingInsights");
    if(!wrap) return;
    const myId = myMember && myMember.id;
    const scoped = donutScope === "my"
      ? (expenses || []).filter(e => (e.shares || []).some(s => s.member_id === myId))
      : (expenses || []);
    if(!scoped.length){
      wrap.innerHTML = "";
      return;
    }

    const titleCounts = {};
    scoped.forEach(e => {
      const { title } = splitExpenseTitleAndNote(e.description || "", e.note || "");
      const key = (title || "").trim();
      if(key) titleCounts[key] = (titleCounts[key] || 0) + 1;
    });

    const topTitles = Object.entries(titleCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    wrap.innerHTML = topTitles.length ? `<div class="spending-insight-row spending-insight-row-top">
      <span class="spending-insight-label">${t("currency.insightTopItemsLabel")}</span>
      <span class="spending-insight-top-list">${topTitles.map(([title, count]) => `<span class="spending-insight-top-chip">${escapeHtml(title)} ×${count}</span>`).join("")}</span>
    </div>` : "";
  }

  function renderCategoryDonutChart(expenses){
    const wrap = document.getElementById("categoryDonutWrap");
    if(!wrap) return;
    let expList = expenses || chartExpensesCache || [];
    const { from, to } = getDonutDateBounds();
    if(from) expList = expList.filter(e => e.expense_date >= from);
    if(to) expList = expList.filter(e => e.expense_date <= to);
    if(!expList.length){
      wrap.innerHTML = `<p class="filter-hint">${t("currency.noExpensesInPeriod")}</p>`;
      return;
    }

    const myId = myMember && myMember.id;
    const filteredExp = donutScope === "my"
      ? expList.filter(e => (e.shares || []).some(s => s.member_id === myId))
      : expList;

    if(!filteredExp.length){
      wrap.innerHTML = `<p class="filter-hint">${donutScope === "my" ? t("currency.noRelatedExpenses") : t("currency.noExpenseRecords")}</p>`;
      return;
    }

    const catMap = {};
    let totalAmt = 0;

    filteredExp.forEach(e => {
      const meta = (window.getCategoryMeta && window.getCategoryMeta(e.description, e.note, e.category)) || { icon: "🧾", name: t("currency.generalExpenseFallback"), type: "general", color: "#868E96" };
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
      wrap.innerHTML = `<p class="filter-hint">${t("currency.noValidExpenseAmount")}</p>`;
      return;
    }

    // SVG 圓餅甜甜圈圖計算
    const size = 180;
    const cx = size / 2, cy = size / 2;
    const r = 68;
    const strokeWidth = 22;
    const circumference = 2 * Math.PI * r;

    let accumulatedPct = 0;
    const paths = catList.map((cat, idx) => {
      const pct = cat.amount / totalAmt;
      const strokeDasharray = `${(pct * circumference).toFixed(2)} ${(circumference * (1 - pct)).toFixed(2)}`;
      const strokeDashoffset = (-accumulatedPct * circumference).toFixed(2);
      accumulatedPct += pct;

      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cat.color}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}" class="donut-slice" data-type="${cat.type}" data-name="${escapeHtml(cat.name)}" data-icon="${cat.icon}" data-color="${cat.color}" data-amt="${formatAmt(cat.amount)}" data-pct="${(pct * 100).toFixed(1)}" data-count="${cat.count}" style="--slice-glow:${cat.color}; animation-delay:${idx * 0.05}s;"></circle>`;
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
          <div class="donut-center-info is-pop" id="donutCenterInfo">
            <span class="donut-center-label">${donutScope === "my" ? t("currency.myExpenseLabel") : t("currency.groupTotalLabel")}</span>
            <span class="donut-center-amt">${SYM}${formatAmt(totalAmt)}</span>
            <span class="donut-center-sub">${t("currency.categoryCountUnit", {count: catList.length})}</span>
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
            <span class="donut-center-sub">${t("currency.pctAndCount", {pct, count: cat.count})}</span>
          `;
          centerInfo.classList.remove("is-pop");
          void centerInfo.offsetWidth;
          centerInfo.classList.add("is-pop");
        }
        wrap.querySelectorAll(".donut-legend-item").forEach(el => el.classList.toggle("active", el.dataset.type === type));
        wrap.querySelectorAll(".donut-slice").forEach(el => el.classList.toggle("active", el.dataset.type === type));
      };

      const resetCat = () => {
        const centerInfo = document.getElementById("donutCenterInfo");
        if(centerInfo){
          centerInfo.innerHTML = `
            <span class="donut-center-label">${donutScope === "my" ? t("currency.myExpenseLabel") : t("currency.groupTotalLabel")}</span>
            <span class="donut-center-amt">${SYM}${formatAmt(totalAmt)}</span>
            <span class="donut-center-sub">${t("currency.categoryCountUnit", {count: catList.length})}</span>
          `;
        }
        wrap.querySelectorAll(".donut-legend-item").forEach(el => el.classList.remove("active"));
        wrap.querySelectorAll(".donut-slice").forEach(el => el.classList.remove("active"));
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
    if(nameEl) nameEl.textContent = catName || t("currency.categoryExpenseFallback");
    if(subEl) subEl.textContent = t("currency.categoryModalSubtitle", {scope: isMyScope ? t("currency.myExpenseScope") : t("currency.groupExpenseScope"), count: matchingExpenses.length, total: SYM+formatAmt(catTotal)});

    const listEl = document.getElementById("catModalList");
    if(listEl){
      if(!matchingExpenses.length){
        listEl.innerHTML = emptyStateHTML("📭", t("currency.noExpensesShort"), t("currency.categoryNoExpensesDesc"));
      } else {
        listEl.innerHTML = matchingExpenses.map(e => {
          const { title, note } = splitExpenseTitleAndNote(e.description, e.note);
          const formattedTime = formatTime(e.created_at, e.expense_date);
          const dateStr = e.expense_date + (formattedTime ? " " + formattedTime : "");

          const payers = e.payers || [];
          const shares = e.shares || [];

          // 付款人：只出現氣泡頭貼
          const payersAvatarsHtml = payers.map(p => {
            const m = (memberRows || activeMembers || []).find(mem => mem.id === p.member_id) || { id: p.member_id, name: (memberById && memberById[p.member_id]) || t("common.memberFallback") };
            return `<span class="cat-exp-avatar-bubble" title="${escapeHtml(t("currency.payerTooltip", {name: m.name, extra: payers.length > 1 ? ` (${SYM}${formatAmt(p.amount)})` : ''}))}">${renderAvatarHTML(m, "avatar-xs")}</span>`;
          }).join("");

          // 應付人：只出現氣泡頭貼
          const sharesAvatarsHtml = shares.map(s => {
            const m = (memberRows || activeMembers || []).find(mem => mem.id === s.member_id) || { id: s.member_id, name: (memberById && memberById[s.member_id]) || t("common.memberFallback") };
            const isMe = s.member_id === myId;
            const extra = (isMe ? t("common.meSuffix") : '') + (shares.length > 1 ? ` (${SYM}${formatAmt(s.amount)})` : '');
            return `<span class="cat-exp-avatar-bubble ${isMe ? 'is-me' : ''}" title="${escapeHtml(t("currency.shareTooltip", {name: m.name, extra}))}">${renderAvatarHTML(m, "avatar-xs")}</span>`;
          }).join("");

          let myShareBadge = "";
          const myShare = shares.find(s => s.member_id === myId);
          if(myShare && Number(myShare.amount) > 0){
            myShareBadge = `<div class="cat-exp-my-share">${t("currency.myShareLabel", {amount: SYM+formatAmt(myShare.amount)})}</div>`;
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
                  <span class="cat-exp-row-label">${t("currency.paymentRowLabel")}</span>
                  <div class="cat-exp-avatar-stack">${payersAvatarsHtml || "—"}</div>
                </div>
                <div class="cat-exp-avatar-row">
                  <span class="cat-exp-row-label">${t("currency.oweRowLabel")}</span>
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
  // 「債務趨勢」跟「花費類別分佈」合併成同一張卡片後，靠這組分頁切換
  // 顯示哪一個內容——兩邊的圖表本來就會各自照原本邏輯載入/更新，這裡
  // 只負責切換 .active class 決定顯示哪一塊，不用額外重新請求資料。
  const summaryChartToggleTabs = document.getElementById("summaryChartToggleTabs");
  if(summaryChartToggleTabs){
    const trendView = document.getElementById("chartToggleViewTrend");
    const donutView = document.getElementById("chartToggleViewDonut");
    summaryChartToggleTabs.querySelectorAll(".chart-toggle-tab").forEach(tab => {
      tab.addEventListener("click", ()=>{
        summaryChartToggleTabs.querySelectorAll(".chart-toggle-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const view = tab.dataset.view;
        if(trendView) trendView.classList.toggle("active", view === "trend");
        if(donutView) donutView.classList.toggle("active", view === "donut");
      });
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
        renderSpendingInsights(chartExpensesCache);
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
      el.innerHTML = `<option value="">${t("currency.allSettledNoTransfer")}</option>`;
      enhanceSelect(el);
      return;
    }
    el.disabled = false;
    el.innerHTML = `<option value="">${t("currency.selectSuggestedRepay")}</option>` + tx.map((tItem,i)=>{
      const twdText = conversionHintText(tItem.amt);
      return `<option value="${i}" data-from="${tItem.from}" data-to="${tItem.to}" data-amt="${tItem.amt}">${t("currency.repayFromTo", {from: escapeHtml(memberById[tItem.from] || "?"), to: escapeHtml(memberById[tItem.to] || "?")})}　${SYM}${formatAmt(tItem.amt)}${twdText ? "（" + twdText + "）" : ""}</option>`;
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
// 單筆支出的淨額拆算 + 事件時間軸債務矩陣
// ============================================================
// computeExpenseNets() / computeExpenseDebts() / buildDebtMatrix() 搬到
// currencies.js 了（currency.html 跟 summary.html 都會載入），這樣個人
// 資料卡的「跟你的關係」才能跟這裡的「逐筆債務表」呼叫同一套演算法、
// 保證數字一致。這幾個名字在這支檔案裡還是可以直接當全域函式呼叫
// （currencies.js 比 app.js 先載入），下面所有呼叫端都不用改。
// ============================================================

// ============================================================
// 債務關係表
// ============================================================

// 表頭/表身的姓名格子最多顯示 5 個字，超過就留前 4 個字加一個 * 代表
// 還有被截掉的部分，格子才不會被長名字撐得忽大忽小。
function truncateNameChars(name, max){
  if(!name) return name;
  return name.length > max ? name.slice(0, max - 1) + "*" : name;
}

// 網頁上的債務關係表（renderDebtMatrix）跟「匯出矩陣圖」（
// renderSettlementImageCanvas）曾經各自算一次「這張表要顯示哪些人、
// 排列順序」，導致自己排第一個、以及「只看跟我相關」篩選這兩件事只有
// 網頁版有做，匯出的圖沒有跟著做，兩邊看起來不一樣。抽出來共用同一個
// 函式，兩邊呼叫都保證排序/篩選結果一致。
function computeDebtMatrixIds(owed){
  const allIds = memberRows.map(m => m.id);

  // 自己排在第一個，一打開就先看到跟自己有關的那一行/列。
  // 「顯示已退出／已銷毀成員」偏好關掉時，memberRows 可能把自己這筆
  // （若剛好也標了已退出）濾掉，所以自己一定要強制留著，owed 本身不受
  // memberRows 篩選影響，補回來一樣抓得到正確金額。
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

  return { allIds, ids };
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


  const { allIds, ids } = computeDebtMatrixIds(owed);

  // 統計逐筆債務表中的總欠款筆數與個人欠款/被欠概況
  let totalActiveDebts = 0;
  let myMatrixIOweTotal = 0;
  let myMatrixIOweCount = 0;
  let myMatrixOwedMeTotal = 0;
  let myMatrixOwedMeCount = 0;
  const myCurrentId = myMember && myMember.id;

  allIds.forEach(c => {
    allIds.forEach(d => {
      if(c === d) return;
      const amt = (owed[c] && owed[c][d]) || 0;
      if(amt > 0.05){
        totalActiveDebts++;
        if(myCurrentId && d === myCurrentId){
          myMatrixIOweTotal += amt;
          myMatrixIOweCount++;
        }
        if(myCurrentId && c === myCurrentId){
          myMatrixOwedMeTotal += amt;
          myMatrixOwedMeCount++;
        }
      }
    });
  });
  window.cachedDetailedDebtCount = totalActiveDebts;

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
          t("currency.debtorHeader") +
        "</th>" +
        '<th rowspan="2">' + t("currency.receivableHeader") + '</th>' +
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
          t("currency.creditorHeader") +
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
                escapeHtml(t("currency.owesTooltip", {debtor: debtorFullName, creditor: creditorFullName, amount: SYM+formatAmt(amount)})) +
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
                escapeHtml(t("currency.settledTooltip", {debtor: debtorFullName, creditor: creditorFullName})) +
                '"' +
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

        '<th class="matrix-foot-label" colspan="2">' + t("currency.payableFooter") + '</th>';


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
  if(textEl) textEl.textContent = matrixShowOnlyMine ? t("currency.fullMatrixLabel") : t("currency.matrixFilterMe");
}

// ==========================================================
// 一鍵複製 LINE 結算文字
// ==========================================================
const copySettlementBtn = document.getElementById("copySettlementBtn");
if(copySettlementBtn){
  copySettlementBtn.addEventListener("click", async ()=>{
    const owed = buildDebtMatrix(cachedExpenses, cachedRepayments);
    const { ids } = computeDebtMatrixIds(owed);
    const groupName = (myMember && myMember.groups && myMember.groups.name) || t("currency.groupNameFallback");
    const localeMap = { "zh-Hant": "zh-TW", ja: "ja-JP", en: "en-US" };
    const nowStr = new Date().toLocaleString(localeMap[getLang()] || "zh-TW", { hour12: false });
    let text = "";

    // 欠款人（debtor）排外層，同一個人要付給不同人的幾筆才會排在一起，
    // 一次轉帳就能把自己那幾筆一起處理完，不用在清單裡跳來跳去找。
    const activeDebts = [];
    ids.forEach(debtorId => {
      ids.forEach(creditorId => {
        if(creditorId === debtorId) return;
        const amt = owed[creditorId] && owed[creditorId][debtorId];
        if(amt && amt > 0.05){
          activeDebts.push({
            debtor: memberById[debtorId] || t("currency.memberFallbackAlt"),
            creditor: memberById[creditorId] || t("currency.memberFallbackAlt"),
            amount: amt
          });
        }
      });
    });

    if(activeDebts.length === 0){
      text = t("currency.allSettledClipboard", {group: groupName, currency: CURRENCY_LABEL, code: CURRENCY, time: nowStr});
    } else {
      const debtLines = activeDebts.map(d => t("currency.debtLineItem", {debtor: d.debtor, creditor: d.creditor, amount: SYM+formatAmt(d.amount)})).join("\n");
      text = t("currency.debtSettlementClipboard", {group: groupName, currency: CURRENCY_LABEL, code: CURRENCY, time: nowStr, count: activeDebts.length, lines: debtLines});
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
      copySettlementBtn.innerHTML = t("currency.copiedSettlementText");
      setTimeout(()=>{ copySettlementBtn.innerHTML = originalHtml; }, 2500);

      await sbAlert(t("currency.copySuccessBody"), t("currency.copySuccessTitle"));
    } catch(err){
      await sbAlert(t("currency.copyFailedPrefix") + err.message, t("currency.copyFailedTitle"));
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
  const { ids } = computeDebtMatrixIds(owed);
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

  const groupName = (myMember && myMember.groups && myMember.groups.name) || t("currency.groupNameFallback");
  const canvasLocaleMap = { "zh-Hant": "zh-TW", ja: "ja-JP", en: "en-US" };
  const nowStr = new Date().toLocaleString(canvasLocaleMap[getLang()] || "zh-TW", { hour12: false });

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
  ctx.fillText(t("currency.settlementImageTitle"), W / 2, 42);

  ctx.fillStyle = dark ? "#A9A7B3" : "#686074";
  ctx.font = "500 14px 'Noto Sans TC', sans-serif";
  ctx.fillText(t("currency.settlementImageSubtitle", {group: groupName, currency: CURRENCY_LABEL, code: CURRENCY, time: nowStr}), W / 2, 68);

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
  ctx.fillText(t("currency.debtorHeader"), tableX + labelColW + nameColW + cellColW * n / 2, tableY + headerRowH / 2 + 1);

  ctx.font = "700 11.5px 'Noto Sans TC', sans-serif";
  ids.forEach((id, i) => {
    const name = truncateNameChars(memberById[id] || "?", 5);
    ctx.fillText(name, colX(i) + cellColW / 2, tableY + headerRowH * 1.5 + 1);
  });

  ctx.font = "700 11px 'Noto Sans TC', sans-serif";
  ctx.fillText(t("currency.receivableHeader"), totalColX + totalColW / 2, tableY + headerRowH);

  // 左側「債權人」欄跟每一列的姓名欄一樣是 headerBg（跟 .matrix-side-label /
  // .matrix-row-name 對應），「債權人」文字直排（由上往下）
  ctx.fillStyle = T.headerBg;
  ctx.fillRect(tableX, tableY + headerRowH * 2, labelColW + nameColW, dataRowH * n);
  ctx.fillStyle = T.headerText;
  drawSettlementVerticalLabel(ctx, t("currency.creditorHeader"), tableX + labelColW / 2, tableY + headerRowH * 2, dataRowH * n, "700 11px 'Noto Sans TC', sans-serif");

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
  ctx.fillText(t("currency.payableFooter"), tableX + labelColW + nameColW / 2, footY + footRowH / 2 + 1);

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
  ctx.fillText(t("currency.generatedBySplitbill"), W / 2, H - cardFooterH / 2 + 4);
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
    exportSettlementImgBtn.innerHTML = t("currency.generatingEllipsis");
    try {
      const canvas = renderSettlementImageCanvas();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if(!blob){
        await sbAlert(t("currency.imageGenFailed"), t("settings.errorTitle"));
        return;
      }

      if(currentSettlementImgUrl) URL.revokeObjectURL(currentSettlementImgUrl);
      currentSettlementImgUrl = URL.createObjectURL(blob);
      const dataUrl = canvas.toDataURL("image/png");

      const img = document.getElementById("settlementImgPreview");
      if(img) img.src = dataUrl || currentSettlementImgUrl;
      if(settlementImgModal) settlementImgModal.classList.add("show");

      const groupName = (myMember && myMember.groups && myMember.groups.name) || t("currency.groupNameFallback");
      const filename = `${t("currency.settlementFilePrefix")}_${groupName}_${CURRENCY}_${new Date().toISOString().slice(0,10)}.png`;
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
                    title: t("currency.shareTitle", {group: groupName}),
                    text: t("currency.shareText", {group: groupName}),
                    url: saved.uri,
                    dialogTitle: t("currency.shareDialogTitle")
                  });
                  return true;
                }
              }
            } else if(window.Capacitor.Plugins.Share){
              await window.Capacitor.Plugins.Share.share({
                title: t("currency.shareTitle", {group: groupName}),
                text: t("currency.shareText", {group: groupName}),
                url: dataUrl || currentSettlementImgUrl,
                dialogTitle: t("currency.shareDialogTitle")
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
                title: t("currency.shareTitle", {group: groupName}),
                text: t("currency.shareText", {group: groupName})
              });
              return true;
            } else {
              await navigator.share({
                title: t("currency.shareTitle", {group: groupName}),
                text: t("currency.shareText", {group: groupName}),
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
              copyBtn.innerHTML = t("currency.copiedCheckmark");
              setTimeout(()=>{ copyBtn.innerHTML = old; }, 2000);
            }
            showToast(t("currency.imageCopiedToastTitle"), t("currency.imageCopiedToastBody"));
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
              showToast(t("currency.imageSavedToastTitle"), t("currency.imageSavedToastBody", {filename}));
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
          sbAlert(t("currency.mobileSaveInstructions"), t("currency.saveToAlbumTitle"));
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
            await sbAlert(t("currency.clipboardUnsupported"), t("currency.copyHintTitle"));
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
      await sbAlert(t("currency.exportImageFailed") + (err.message || t("currency.unknownError")), t("settings.errorTitle"));
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
    .replace(/平分/g, t("currency.calcSharedLabel"))
    .replace(/稅額/g, t("currency.calcTaxLabel"));
}
function showExpenseDebtDetail(e){
  const modal = document.getElementById("expenseDebtModal");
  const titleName = document.getElementById("expDebtModalName");
  const iconEl = document.getElementById("expDebtModalIcon");
  const body = document.getElementById("expDebtModalBody");
  if(!modal || !body) return;

  const { title, note } = splitExpenseTitleAndNote(e.description || "", e.note || "");
  const cleanTitle = title || t("currency.expenseDetailFallback");
  const cleanBodyText = note || "";

  const icon = getCategoryIcon(title || e.description || "", e.category);
  if(iconEl) iconEl.textContent = icon;
  if(titleName){
    const isRecurringGenerated = isRecurringGeneratedStr(e.description) || isRecurringGeneratedStr(e.note);
    titleName.innerHTML = escapeHtml(cleanTitle) + (isRecurringGenerated ? `<span class="recurring-badge">${t("currency.recurringBadge")}</span>` : "");
  }

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
      ? `<button type="button" class="exp-debt-calc-toggle" onclick="this.closest('.exp-debt-row-item-wrap').classList.toggle('is-expanded')" title="${t("currency.toggleCalcTitle")}"><span class="exp-calc-toggle-icon">▾</span></button>`
      : "";
    const expandRow = p.calc
      ? `<div class="exp-debt-calc-expand-row"><div class="exp-debt-calc-badge-expanded" title="${escapeHtml(t("currency.calcFormulaTitle", {calc: p.calc}))}">${escapeHtml(p.calc)}</div></div>`
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
      ? `<button type="button" class="exp-debt-calc-toggle" onclick="this.closest('.exp-debt-row-item-wrap').classList.toggle('is-expanded')" title="${t("currency.toggleCalcTitle")}"><span class="exp-calc-toggle-icon">▾</span></button>`
      : "";
    const expandRow = s.calc
      ? `<div class="exp-debt-calc-expand-row"><div class="exp-debt-calc-badge-expanded" title="${escapeHtml(t("currency.calcFormulaTitle", {calc: relabelCalcText(s.calc)}))}">${escapeHtml(relabelCalcText(s.calc))}</div></div>`
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
          <span style="color:var(--ink-soft);font-size:11.5px;">${t("currency.owesInline")}</span>
          ${renderAvatarHTML({ id: f.creditorId, name: memberById[f.creditorId] }, "avatar-xs")}
          <b>${escapeHtml(memberById[f.creditorId] || "?")}</b>
        </div>
        <div class="exp-debt-flow-amount">${SYM}${formatAmt(f.amount)}</div>
      </div>
    `).join("");
  } else {
    flowsHtml = `<div style="text-align:center;padding:12px;color:var(--ink-soft);font-size:12px;">${t("currency.noDebtRelation")}</div>`;
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
        <th class="matrix-side-label matrix-top-label" colspan="${debtorIds.length}">${t("currency.debtorHeader")}</th>
        <th rowspan="2">${t("currency.receivableHeader")}</th>
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
            return `<td class="matrix-cell has-debt" title="${escapeHtml(t("currency.owesTooltip", {debtor: memberById[dId] || "?", creditor: memberById[cId] || "?", amount: SYM+formatAmt(amt)}))}">${formatAmt(amt)}${conversionHint(amt)}</td>`;
          }
          return `<td class="matrix-cell"></td>`;
        }).join("");

        return `
          <tr>
            ${rIdx === 0 ? `<th class="matrix-side-label matrix-left-label" rowspan="${creditorIds.length}">${t("currency.creditorHeader")}</th>` : ""}
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
        <th class="matrix-foot-label" colspan="2">${t("currency.payableFooter")}</th>
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
        <div class="exp-debt-matrix-title">${t("currency.itemDebtMatrixTitle")}</div>
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
        <div class="exp-debt-matrix-title">${t("currency.debtListTitle")}</div>
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
        <span>${t("currency.noteBreakdownTitle")}</span>
        <div class="ai-copy-btn-group">
          <button type="button" class="ai-btn-copy-compact" id="expDebtCopyCompactBtn" title="${t("currency.copyCompactTitleFull")}">${t("currency.aiCopyCompact")}</button>
          <button type="button" class="ai-btn-copy-full" id="expDebtCopyFullBtn" title="${t("currency.aiCopyFullTitle")}">${t("currency.aiCopyFull")}</button>
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
        <div style="font-size:11.5px;color:var(--ink-soft);font-weight:700;margin-top:2px;">${t("currency.payerListTitle")}</div>
        ${payerDetails}
        <div style="font-size:11.5px;color:var(--ink-soft);font-weight:700;margin-top:8px;">${t("currency.personalShareListTitle")}</div>
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
      const store = (aiData && aiData.storeName) || cleanTitle || t("summary.notifExpenseItemFallback");
      const curCode = e.currency || (aiData && aiData.currencyCode) || CURRENCY;
      const curObj = (CURRENCIES || []).find(c => c.code === curCode);
      const curSym = (curObj && curObj.symbol) || CURRENCY_SYMBOL || "$";
      const totalAmt = Number(e.amount) || 0;

      const lines = [];
      lines.push(t("currency.storeItemLine", {store}));
      if(aiData && aiData.taxType === "inclusive"){
        lines.push(t("currency.totalInclusiveLine", {amount: curSym+formatAmt(totalAmt)}));
      } else if(aiData && (aiData.serviceCharge || aiData.tax)){
        lines.push(t("currency.totalWithTaxLine", {amount: curSym+formatAmt(totalAmt), tax: curSym+formatAmt((aiData.serviceCharge || 0) + (aiData.tax || 0))}));
      } else {
        lines.push(t("currency.totalLine", {amount: curSym+formatAmt(totalAmt)}));
      }
      lines.push(t("currency.memberAmountsHeader"));
      if(e.shares && e.shares.length > 0){
        e.shares.forEach(s => {
          const name = memberById[s.member_id] || "?";
          lines.push(t("currency.memberAmountLine", {name, amount: curSym+formatAmt(s.amount)}));
        });
      } else {
        lines.push(t("currency.equalSplitNote"));
      }

      await copyToClipboard(lines.join("\n"));
      expDebtCopyCompactBtn.textContent = t("currency.copiedCompact");
      setTimeout(()=>{ expDebtCopyCompactBtn.textContent = t("currency.aiCopyCompact"); }, 1500);
    });
  }

  if(expDebtCopyFullBtn){
    expDebtCopyFullBtn.addEventListener("click", async (ev)=>{
      ev.stopPropagation();
      const aiData = extractAiReceiptData(e, memberRows || MEMBERS || []);
      const store = (aiData && aiData.storeName) || cleanTitle || t("summary.notifExpenseItemFallback");
      const curCode = e.currency || (aiData && aiData.currencyCode) || CURRENCY;
      const curObj = (CURRENCIES || []).find(c => c.code === curCode);
      const curSym = (curObj && curObj.symbol) || CURRENCY_SYMBOL || "$";
      const totalAmt = Number(e.amount) || 0;

      let fullText = "";
      if(cleanBodyText && (cleanBodyText.includes("📋 品項明細") || cleanBodyText.includes("🏪 店家："))){
        fullText = cleanBodyText;
      } else {
        const fullLines = [];
        fullLines.push(t("currency.storeItemLine", {store}));
        fullLines.push(t("currency.totalLine", {amount: curSym+formatAmt(totalAmt)}));
        fullLines.push(t("currency.dateLine", {date: e.expense_date || ""}));
        const payerNames = (e.payers || []).map(p => `${memberById[p.member_id] || "?"} (${curSym}${formatAmt(p.amount)})`).join("、");
        if(payerNames) fullLines.push(t("currency.payerLine", {names: payerNames}));
        fullLines.push(t("currency.shareBreakdownHeader"));
        (e.shares || []).forEach(s => {
          const name = memberById[s.member_id] || "?";
          const calc = s.calc ? ` (${s.calc})` : "";
          fullLines.push(t("currency.memberAmountLine", {name, amount: curSym+formatAmt(s.amount)+calc}));
        });
        if(cleanBodyText) fullLines.push(t("currency.noteLine", {note: cleanBodyText}));
        fullText = fullLines.join("\n");
      }

      await copyToClipboard(fullText);
      expDebtCopyFullBtn.textContent = t("currency.copiedFull");
      setTimeout(()=>{ expDebtCopyFullBtn.textContent = t("currency.aiCopyFull"); }, 1500);
    });
  }

  const expDebtModalEditBtn = document.getElementById("expDebtModalEditBtn");
  const expDebtModalRestoreBtn = document.getElementById("expDebtModalRestoreBtn");
  const isExpXcurDetail = isXcurStr(e.description);
  const expXcurIdDetail = isExpXcurDetail ? extractXcurId(e.description) : null;
  const myId = myMember && myMember.id;
  if(expDebtModalEditBtn){
    const canEdit = isExpenseParty(e, myId) || e.created_by === myId;
    if(!canEdit){
      expDebtModalEditBtn.style.display = "none";
    } else if(isExpXcurDetail){
      expDebtModalEditBtn.style.display = expXcurIdDetail ? "inline-flex" : "none";
      expDebtModalEditBtn.textContent = t("currency.editRateBtn");
      expDebtModalEditBtn.title = t("currency.editRateTitle");
      expDebtModalEditBtn.onclick = () => {
        modal.classList.remove("show");
        if(typeof openXcurRateEditModal === "function") openXcurRateEditModal(expXcurIdDetail);
      };
    } else {
      expDebtModalEditBtn.style.display = "inline-flex";
      expDebtModalEditBtn.textContent = t("currency.editShort");
      expDebtModalEditBtn.title = t("currency.editThisExpenseTitle");
      expDebtModalEditBtn.onclick = () => {
        modal.classList.remove("show");
        startEditExpense(e);
      };
    }
  }
  if(expDebtModalRestoreBtn){
    const canEdit = isExpenseParty(e, myId) || e.created_by === myId;
    if(canEdit && isExpXcurDetail){
      expDebtModalRestoreBtn.style.display = "inline-flex";
      expDebtModalRestoreBtn.onclick = () => {
        modal.classList.remove("show");
        handleCrossCurrencyDelete(e.description, async ()=>{
          const { error } = await sb.from("expenses").delete().eq("id", e.id);
          if(error){ await sbAlert(t("currency.deleteFailed") + error.message, t("settings.errorTitle")); return; }
          await refreshExpenses();
        });
      };
    } else {
      expDebtModalRestoreBtn.style.display = "none";
    }
  }

  // receipts bucket 不公開，一定要透過 createSignedUrl() 換一次性短效
  // 網址才能打開，跟「紀錄」側邊欄那顆按鈕同一套邏輯。
  const expDebtModalViewReceiptBtn = document.getElementById("expDebtModalViewReceiptBtn");
  if(expDebtModalViewReceiptBtn){
    if(!e.receipt_image_path){
      expDebtModalViewReceiptBtn.classList.add("hidden");
      expDebtModalViewReceiptBtn.onclick = null;
    } else {
      expDebtModalViewReceiptBtn.classList.remove("hidden");
      expDebtModalViewReceiptBtn.onclick = async () => {
        expDebtModalViewReceiptBtn.disabled = true;
        const originalText = expDebtModalViewReceiptBtn.textContent;
        expDebtModalViewReceiptBtn.textContent = t("currency.loadingWithHourglass");
        try {
          const { data, error } = await sb.storage.from("receipts").createSignedUrl(e.receipt_image_path, 300);
          if(error || !data || !data.signedUrl) throw error || new Error("receipt image not found");
          const { title: receiptTitle } = splitExpenseTitleAndNote(e.description || "", e.note || "");
          window.showReceiptLightbox({
            imgUrl: data.signedUrl,
            title: receiptTitle || e.description || t("currency.expenseDetailFallback"),
            meta: `${e.expense_date || ""}　${SYM}${formatAmt(e.amount)}`
          });
        } catch(err){
          console.error("開啟收據原圖失敗：", err);
          await sbAlert(t("currency.receiptImgExpired"), t("currency.cannotOpenTitle"));
        } finally {
          expDebtModalViewReceiptBtn.disabled = false;
          expDebtModalViewReceiptBtn.textContent = originalText;
        }
      };
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

// ==========================================================
// 編輯「跨幣別債務轉入」當初換算用的匯率——歷史紀錄裡帶 [xcur:UUID]
// 標記的支出/還款，旁邊的 ✎ 按鈕會呼叫這裡。這種轉入紀錄一次會產生
// 兩筆連動的紀錄（外幣帳本一筆還款結清、臺幣帳本一筆對應支出），
// 兩筆用同一個 xcurId 串起來（臺幣支出的 offset_group 沒有這個欄位，
// 是塞進 description 的 [xcur:xxx] 標記；外幣還款則是存在 offset_group
// 欄位），外幣原始金額不變，只重新計算、寫回臺幣那一筆的應付金額。
// 放在這裡（跟 showPairDetail 平行的共用範圍）而不是塞進 showPairDetail
// 內部，是因為歷史紀錄列表（renderHistory/renderRepaymentHistory）跟
// showPairDetail 彈窗上的 ✎ 按鈕都要呼叫到它——原本誤放在 showPairDetail
// 內部時，只有從債務明細彈窗點的那顆會動，歷史紀錄列表那顆因為呼叫端
// 看不到這個函式（不同的閉包範圍）而完全沒反應，且不會有任何錯誤訊息。
// ==========================================================
async function openXcurRateEditModal(xcurId){
  if(!xcurId) return;
  const modal = document.getElementById("xcurRateEditModal");
  if(!modal) return;

  const [{ data: expRows, error: expErr }, { data: repRows, error: repErr }] = await Promise.all([
    sb.from("expenses").select("*").ilike("description", `%[xcur:${xcurId}]%`).limit(1),
    sb.from("repayments").select("*").eq("offset_group", xcurId).limit(1)
  ]);

  if(expErr || repErr || !expRows || !expRows.length || !repRows || !repRows.length){
    await sbAlert(t("currency.xcurFullRecordNotFound"), t("settings.errorTitle"));
    return;
  }

  const expRow = expRows[0];
  const repRow = repRows[0];
  const foreignCurrency = CURRENCIES.find(c => c.code === repRow.currency) || CURRENCIES[0];
  const foreignAmt = Number(repRow.amount) || 0;
  const debtorName = memberById[repRow.from_member] || "?";
  const creditorName = memberById[repRow.to_member] || "?";
  const existingRate = foreignAmt > 0 ? (Number(expRow.amount) || 0) / foreignAmt : 0;

  const routeEl = document.getElementById("xcurRateEditRoute");
  const origAmtEl = document.getElementById("xcurRateEditOrigAmt");
  const ratePrefix = document.getElementById("xcurRateEditPrefix");
  const rateInput = document.getElementById("xcurRateEditInput");
  const resultAmtEl = document.getElementById("xcurRateEditResultAmt");
  const fetchRateBtn = document.getElementById("xcurRateEditFetchRateBtn");
  const saveBtn = document.getElementById("xcurRateEditSaveBtn");
  const closeBtn = document.getElementById("xcurRateEditCloseBtn");

  if(routeEl) routeEl.innerHTML = `<b>${escapeHtml(debtorName)}</b> <span>${t("currency.owesInline")}</span> <b>${escapeHtml(creditorName)}</b>`;
  if(origAmtEl) origAmtEl.textContent = `${foreignCurrency.symbol}${formatAmt(foreignAmt)} ${foreignCurrency.label}`;
  if(ratePrefix) ratePrefix.textContent = `1 ${foreignCurrency.code} = NT$`;
  if(rateInput) rateInput.value = existingRate > 0 ? existingRate : 1;

  function updateCalculation(){
    const r = parseFloat(rateInput.value) || 0;
    const twdAmt = Math.round(foreignAmt * r);
    if(resultAmtEl) resultAmtEl.textContent = `NT$ ${twdAmt.toLocaleString()}`;
  }
  updateCalculation();

  if(rateInput) rateInput.oninput = updateCalculation;

  if(fetchRateBtn){
    fetchRateBtn.onclick = async ()=>{
      const originalText = fetchRateBtn.textContent;
      fetchRateBtn.disabled = true;
      fetchRateBtn.textContent = t("currency.fetchingEllipsis");
      const rate = await fetchRateForCurrencyCode(foreignCurrency.code);
      fetchRateBtn.disabled = false;
      fetchRateBtn.textContent = originalText;
      if(rate){
        rateInput.value = rate;
        updateCalculation();
      } else {
        await sbAlert(t("currency.fetchRateFailed"), t("common.notifyDialogTitle"));
      }
    };
  }

  if(closeBtn){
    closeBtn.onclick = ()=>{ modal.classList.remove("show"); };
  }

  if(saveBtn){
    saveBtn.onclick = async ()=>{
      const r = parseFloat(rateInput.value) || 0;
      if(r <= 0){
        await sbAlert(t("currency.rateMustBePositive"), t("common.notifyDialogTitle"));
        return;
      }
      const newTwdAmt = Math.round(foreignAmt * r);
      if(newTwdAmt <= 0){
        await sbAlert(t("currency.convertedAmountMustBePositive"), t("common.notifyDialogTitle"));
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = t("currency.savingEllipsisPlain");

      const newPayers = (expRow.payers || []).map(p => ({ ...p, amount: newTwdAmt }));
      const newShares = (expRow.shares || []).map(s => ({ ...s, amount: newTwdAmt }));

      const { error: updateExpErr } = await sb.from("expenses").update({
        amount: newTwdAmt,
        note: t("currency.xcurNoteTemplate", {amount: foreignCurrency.symbol+formatAmt(foreignAmt), rate: r}),
        payers: newPayers,
        shares: newShares
      }).eq("id", expRow.id);

      if(updateExpErr){
        await sbAlert(t("currency.updateTwdLedgerFailed") + updateExpErr.message, t("settings.errorTitle"));
        saveBtn.disabled = false;
        saveBtn.textContent = t("currency.saveNewRate");
        return;
      }

      const { error: updateRepErr } = await sb.from("repayments").update({
        note: t("currency.xcurRepayNoteTemplate", {amount: newTwdAmt.toLocaleString(), rate: r, id: xcurId})
      }).eq("id", repRow.id);

      saveBtn.disabled = false;
      saveBtn.textContent = t("currency.saveNewRate");

      if(updateRepErr){
        await sbAlert(t("currency.xcurNoteSyncFailed", {error: updateRepErr.message}), t("common.notifyDialogTitle"));
      }

      modal.classList.remove("show");
      await refreshExpenses();
      await sbAlert(t("currency.rateUpdateSuccess", {rate: r, amount: newTwdAmt.toLocaleString()}), t("common.notifyDialogTitle"));
    };
  }

  modal.classList.add("show");
}

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
  // 顏色一律以「這個頁面的 debtorId（應付方 A）」為準：
  // 在 A 欠 B 的頁面中，只有「A 欠 B」會依增減動態變色：
  // 欠款增加（支出）用紅色（is-owe）、欠款減少（還款/沖銷）用綠色（is-repay）、歸零用灰色（is-owed）。
  // 而反向的「B 欠 A」在此頁面永遠維持中性灰色（is-owed），聚焦主體。
  const balanceText = (fwd, rev, fwdDelta = 0) => {
    if(fwd <= 0.01 && rev <= 0.01){
      return `<div class="ledger-row-balance"><span class="balance-chip is-clear">${t("currency.bothSettledNow")}</span></div>`;
    }
    const fwdCls = fwd <= 0.01 ? "is-owed" : (fwdDelta < -0.01 ? "is-repay" : "is-owe");

    return `<div class="ledger-row-balance">`
      + `<span class="balance-chip ${fwdCls}"><span class="chip-names">${t("currency.debtorOwesCreditor", {debtor: debtorName, creditor: creditorName})}</span> <span class="chip-amt">${SYM}${formatAmt(fwd)}</span></span>`
      + `<span class="balance-chip is-owed"><span class="chip-names">${t("currency.debtorOwesCreditor", {debtor: creditorName, creditor: debtorName})}</span> <span class="chip-amt">${SYM}${formatAmt(rev)}</span></span>`
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
          <span>${t("currency.debtDetailTitle")}</span>
        </div>
        <button type="button" id="matrixDetailClose" class="debt-detail-close" aria-label="${t("common.close")}">✕</button>
      </div>

      <!-- 頂部動態金流傳送條（獨立滿版置中） -->
      <div class="debt-detail-header">
        <div class="debt-flow-header-card ${remainingDebt <= 0.01 ? 'is-settled' : ''}">
          <!-- 應付方 -->
          <div class="debt-flow-party debtor">
            <div class="debt-flow-avatar-wrap">
              ${renderAvatarHTML({ id: debtorId, name: memberById[debtorId] }, "avatar-md")}
              <span class="debt-flow-role-badge debtor">${t("currency.payerRoleBadge")}</span>
            </div>
            <span class="debt-flow-name" title="${escapeHtml(memberById[debtorId] || "")}">${escapeHtml(memberById[debtorId] || "?")}</span>
          </div>

          <!-- 中央金流與金額 -->
          <div class="debt-flow-center">
            <div class="debt-flow-arrow-track">
              <span class="debt-flow-arrow">➔</span>
            </div>
            <div class="debt-flow-amount-pill ${remainingDebt <= 0.01 ? 'settled' : ''}">
              ${remainingDebt > 0.01 ? t("currency.owesAmountPill", {amount: SYM+formatAmt(remainingDebt)}) : t("currency.settledCheckSimple")}
            </div>
          </div>

          <!-- 收款方 -->
          <div class="debt-flow-party creditor">
            <div class="debt-flow-avatar-wrap">
              ${renderAvatarHTML({ id: creditorId, name: memberById[creditorId] }, "avatar-md")}
              <span class="debt-flow-role-badge creditor">${t("currency.receiverRoleBadge")}</span>
            </div>
            <span class="debt-flow-name" title="${escapeHtml(memberById[creditorId] || "")}">${escapeHtml(memberById[creditorId] || "?")}</span>
          </div>
        </div>
      </div>

      <!-- 往來分頁切換器（有歷史結清存檔時顯示） -->
      ${totalCyclePages > 0 ? `
        <div class="debt-cycle-tabs">
          <button type="button" class="debt-cycle-tab ${olderCyclePage === 0 ? 'active' : ''}" id="matrixActiveCycleTab">
            ${t("currency.activeTab", {count: visibleEvents.length})}
          </button>
          <button type="button" class="debt-cycle-tab ${olderCyclePage > 0 ? 'active' : ''}" id="matrixHistoryCycleTab">
            ${t("currency.settledRecordsTab", {count: totalCyclePages})}
          </button>
        </div>
      ` : ""}

      <!-- 往來紀錄主體 -->
      <div class="debt-detail-section">
        <div class="debt-section-title">
          <span class="debt-section-icon">${olderCyclePage > 0 ? '📜' : '📋'}</span>
          <span>${olderCyclePage > 0 ? t("currency.settledRecordsTitle") : t("currency.transactionHistoryTitle")}</span>
          <span class="debt-section-count">${t("common.countUnit", {count: olderCyclePage > 0 ? olderEvents.length : visibleEvents.length})}</span>
          <button type="button" class="ledger-sort-toggle-btn" id="matrixLedgerSortBtn" title="${t("currency.toggleSortDirection")}" aria-label="${t("currency.toggleSortDirection")}">
            ${ledgerSortAsc ? t("currency.sortOldToNew") : t("currency.sortNewToOld")}
          </button>
        </div>

        ${olderCyclePage > 0 ? `
          <!-- 歷史存檔步進卡片 -->
          <div class="debt-archive-stepper-card">
            <button type="button" class="archive-step-btn" id="matrixCyclePrevBtn" ${olderCyclePage >= totalCyclePages ? "disabled" : ""}>${t("currency.prevRound")}</button>
            <div class="archive-step-info">
              <span class="archive-step-title">${t("currency.roundLabel", {round: displayRound, total: totalCyclePages})}</span>
              <span class="archive-step-sub">${t("currency.settledCheckSuffix")}</span>
            </div>
            <button type="button" class="archive-step-btn" id="matrixCycleNextBtn" ${olderCyclePage <= 1 ? "disabled" : ""}>${t("currency.nextRound")}</button>
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
      const myId = myMember && myMember.id;
      const canEditExpense = isExpenseParty(e, myId) || e.created_by === myId;
      const firstLine = getFirstLineDesc(e.description || t("summary.untitledExpense"));
      const isAiSplit = Boolean(e.description && (e.description.includes("<!--AI_RECEIPT_DATA:") || e.description.includes("(AI自動拆單)") || e.description.includes("📋 品項明細")));
      const isExpXcur = isXcurStr(e.description);
      const expXcurId = isExpXcur ? extractXcurId(e.description) : null;
      const catMeta = (window.getCategoryMeta && window.getCategoryMeta(firstLine, e.note, e.category)) || { icon: "🧾" };

      return `
        <div class="ledger-row-wrap ${rowWrapClass(ev)}" data-id="${e.id}">
          <div class="ledger-timeline-node is-expense" title="${t("currency.expenseIconTitle", {icon: catMeta.icon || '🧾'})}">${catMeta.icon || "🧾"}</div>
          <div class="ledger-row ledger-row-open-expense" data-id="${e.id}">
            <div class="ledger-row-header">
              <div class="ledger-row-name">
                ${escapeHtml(firstLine)}${isAiSplit ? `<span class="ai-split-badge" style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:6px;background:color-mix(in srgb, var(--btn-primary) 14%, var(--paper));color:var(--btn-primary);margin-left:5px;">${t("currency.aiShortBadge")}</span>` : ""}${isExpXcur ? `<span class="xcur-badge">${t("currency.xcurBadge")}</span>` : ""}
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
                    ${expXcurId ? `<button type="button" class="exp-xcur-editrate" data-xcur="${expXcurId}" title="${t("currency.editRateTitle")}" aria-label="${t("currency.editRateTitle")}">✎</button>` : ""}
                    <button type="button" class="exp-del debt-exp-del exp-xcur-restore" data-id="${e.id}" title="${t("currency.restoreThisTransferTitle")}" aria-label="${t("currency.restoreAria")}">↺</button>
                  ` : `
                    <button type="button" class="exp-edit debt-exp-edit" data-id="${e.id}" title="${t("common.edit")}" aria-label="${t("common.edit")}">✎</button>
                    <button type="button" class="exp-del debt-exp-del" data-id="${e.id}" title="${t("settings.delete")}" aria-label="${t("settings.delete")}">✕</button>
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
    const myId = myMember && myMember.id;
    const canEditRepay = r.offset_group
      ? isRepaymentParty(r, myId)
      : (isRepaymentParty(r, myId) || r.created_by === myId);
    const isRepXcur = isXcurStr(r.note) || isXcurStr(r.offset_group);
    const repXcurId = isRepXcur ? (r.offset_group || extractXcurId(r.note)) : null;
    return `
      <div class="ledger-row-wrap ${rowWrapClass(ev)}" data-id="${r.id}">
        <div class="ledger-timeline-node is-repay" title="${t("currency.repaymentIconTitle")}">💸</div>
        <div class="ledger-row" onclick="if(!event.target.closest('button')){this.closest('.ledger-row-wrap').classList.toggle('is-expanded')}">
          <div class="ledger-row-header">
            <div class="ledger-row-name">
              ${(r.offset_group && !isXcurStr(r.offset_group)) ? `<span class="champion-tag">${t("currency.offsetTag")}</span> ` : ""}${t("currency.repayFromTo", {from: escapeHtml(memberById[r.from_member] || "?"), to: escapeHtml(memberById[r.to_member] || "?")})}${(isXcurStr(r.note) || isXcurStr(r.offset_group)) ? `<span class="xcur-badge">${t("currency.convertedToTwd")}</span>` : ""}
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
                  ${repXcurId ? `<button class="exp-xcur-editrate" data-xcur="${repXcurId}" title="${t("currency.editRateTitle")}" aria-label="${t("currency.editRateTitle")}">✎</button>` : ""}
                  <button class="exp-del ${r.offset_group ? "debt-repay-del-group" : "debt-repay-del"} exp-xcur-restore" data-id="${r.id}" data-group="${r.offset_group || ""}" title="${t("currency.restoreThisTransferTitle")}" aria-label="${t("currency.restoreAria")}">↺</button>
                ` : `
                  ${!r.offset_group ? `<button class="exp-edit debt-repay-edit" data-id="${r.id}" title="${t("common.edit")}" aria-label="${t("common.edit")}">✎</button>` : ""}
                  <button class="exp-del ${r.offset_group ? "debt-repay-del-group" : "debt-repay-del"}" data-id="${r.id}" data-group="${r.offset_group || ""}" title="${t("settings.delete")}" aria-label="${t("settings.delete")}">✕</button>
                `}
              </div>
            ` : ""}
          </div>
          ${balanceText(ev.balanceForward, ev.balanceReverse, ev.forwardDelta, ev.reverseDelta)}
        </div>
        <div class="ledger-row-detail">
          <div class="debt-info-row">
            <span class="debt-info-label">${t("currency.recordedByLabel")}</span>
            <div class="debt-info-value">${escapeHtml(memberById[r.created_by] || "?")}</div>
          </div>
          ${r.note ? `
            <div class="debt-info-row">
              <span class="debt-info-label">${t("currency.noteLabel")}</span>
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
          ${t("currency.pendingSettleAmount", {amount: SYM+formatAmt(remainingDebt)})}
        </div>
        <div class="debt-empty-text">
          ${t("currency.overpaidExplanation", {name: escapeHtml(memberById[creditorId] || t("currency.counterpartFallback"))})}
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
              <span class="stamp-sub">${t("currency.allClearedSubtext")}</span>
            </div>
          </div>
        </div>
        ${totalCyclePages > 0 ? `
          <button type="button" class="btn secondary small" id="matrixViewHistoryArchiveBtn" style="margin:10px auto 4px;display:block;white-space:nowrap;">
            ${t("currency.settledRecordsRoundsBtn", {count: totalCyclePages})}
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
        <div class="archive-settled-text">${t("currency.roundFullySettled")}</div>
        <button type="button" class="btn secondary small" id="matrixBackToActiveBtn">${t("currency.backToActive")}</button>
      </div>
    `;
  } else {
    // 進行中底部
    if(offsetAmt > 0.01){
      const canOffset = myMember && (debtorId === myMember.id || creditorId === myMember.id);
      html += `
        <div class="debt-offset-card">
          <div class="debt-offset-text">
            ${t("currency.mutualOffsetExplanation", {creditor: escapeHtml(memberById[creditorId] || "?"), debtor: escapeHtml(memberById[debtorId] || "?"), reverseAmount: SYM+formatAmt(reverseDebt), offsetAmount: SYM+formatAmt(offsetAmt)})}
          </div>
          ${canOffset ? `<button type="button" id="matrixDetailOffsetBtn" class="btn secondary small">
            ${t("currency.oneClickOffsetBtn", {amount: SYM+formatAmt(offsetAmt)})}
          </button>` : ""}
        </div>
      `;
    }

    if(remainingDebt <= 0.01 && visibleEvents.length > 0){
      html += `
        <div class="debt-cleared">
          <span class="debt-cleared-icon">✓</span>
          <span>${t("currency.debtFullyCleared")}</span>
        </div>
      `;
    }

    if(remainingDebt > 0.01){
      const canRemind = myMember && creditorId === myMember.id && debtorId !== myMember.id;
      html += `
        <div class="debt-repay-action-wrap" style="display:flex;flex-direction:column;gap:8px;">
          <button type="button" class="btn btn-repay-direct" id="matrixDetailRepayBtn" data-debtor="${debtorId}" data-creditor="${creditorId}" data-amt="${remainingDebt}">
            ${t("currency.recordRepaymentBtn", {debtor: escapeHtml(memberById[debtorId] || "?"), creditor: escapeHtml(memberById[creditorId] || "?"), amount: SYM+formatAmt(remainingDebt)})}
          </button>
          ${CURRENCY !== "TWD" ? `
            <button type="button" class="btn secondary btn-twd-settle" id="matrixDetailTwdSettleBtn" data-debtor="${debtorId}" data-creditor="${creditorId}" data-amt="${remainingDebt}">
              ${t("currency.twdSettleBtn")}
            </button>
          ` : ""}
          ${canRemind ? `
            <button type="button" class="btn-remind-direct" id="matrixDetailRemindBtn" data-debtor="${debtorId}" data-creditor="${creditorId}" data-amt="${remainingDebt}">
              ${t("currency.remindCounterpartBtn")}
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

      if(routeEl) routeEl.innerHTML = `<b>${escapeHtml(debtorName)}</b> <span>${t("currency.owesInline")}</span> <b>${escapeHtml(creditorName)}</b>`;
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
          fetchRateBtn.textContent = t("currency.fetchingEllipsis");
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
        directClearBtn.textContent = t("currency.oneClickSettleHereBtn", {currency: CURRENCY_LABEL});
        directClearBtn.onclick = async ()=>{
          const r = parseFloat(rateInput.value) || (conversionRate || 1);
          const twdAmt = Math.round(amt * r);
          const note = t("currency.directClearNote", {amount: twdAmt.toLocaleString(), rate: r});
          const today = new Date().toISOString().slice(0,10);

          directClearBtn.disabled = true;
          directClearBtn.textContent = t("currency.settlingEllipsis");

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
            await sbAlert(t("currency.settleFailed") + error.message, t("settings.errorTitle"));
            directClearBtn.disabled = false;
            directClearBtn.textContent = t("currency.oneClickSettleHereBtn", {currency: CURRENCY_LABEL});
            return;
          }

          twdSettleModal.classList.remove("show");
          await refreshExpenses();
        };
      }

      if(goTwdBtn){
        goTwdBtn.textContent = t("currency.convertToTwdDebtBtn");
        goTwdBtn.onclick = async ()=>{
          const r = parseFloat(rateInput.value) || (conversionRate || 1);
          const twdAmt = Math.round(amt * r);
          if(twdAmt <= 0){
            await sbAlert(t("currency.convertedAmountMustBePositive"), t("common.notifyDialogTitle"));
            return;
          }

          const xcurId = generateUUID();
          const today = new Date().toISOString().slice(0, 10);

          goTwdBtn.disabled = true;
          goTwdBtn.textContent = t("currency.transferringEllipsis");

          // 1. 在外幣帳本建立還款 (結清外幣欠款)
          const { data: repData, error: repErr } = await sb.from("repayments").insert({
            from_member: fromId,
            to_member: toId,
            amount: amt,
            note: t("currency.xcurRepayNoteTemplate", {amount: twdAmt.toLocaleString(), rate: r, id: xcurId}),
            payment_date: today,
            created_by: myMember.id,
            currency: CURRENCY,
            offset_group: xcurId
          }).select();

          if(repErr){
            await sbAlert(t("currency.transferFailed") + repErr.message, t("settings.errorTitle"));
            goTwdBtn.disabled = false;
            goTwdBtn.textContent = t("currency.convertToTwdDebtBtn");
            return;
          }

          // 2. 在臺幣 (TWD) 帳本建立支出 (使債權人墊付，債務人產生應負擔之欠款)
          const descTitle = t("currency.xcurDebtTransferTitle", {currency: CURRENCY_LABEL, id: xcurId});
          const descNote = t("currency.xcurNoteTemplate", {amount: SYM+formatAmt(amt), rate: r});

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
            await sbAlert(t("currency.writeTwdLedgerFailed") + expErr.message, t("settings.errorTitle"));
            goTwdBtn.disabled = false;
            goTwdBtn.textContent = t("currency.convertToTwdDebtBtn");
            return;
          }

          twdSettleModal.classList.remove("show");
          await refreshExpenses();
          if(typeof fireConfetti === "function") fireConfetti();
          await sbAlert(
            t("currency.xcurTransferSuccessMsg", {
              currency: CURRENCY_LABEL, amount: SYM+formatAmt(amt), twdAmount: twdAmt.toLocaleString(),
              debtor: memberById[fromId] || t("currency.debtorHeader"), creditor: memberById[toId] || t("currency.creditorHeader")
            }),
            t("common.notifyDialogTitle")
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

  // 催款提醒：只有債權人（欠款表裡的「該收」那一方）自己看得到這顆
  // 按鈕，實際發送邏輯是 sendDebtReminderFromBtn()。
  const remindBtn = document.getElementById("matrixDetailRemindBtn");
  if(remindBtn){
    remindBtn.onclick = () => sendDebtReminderFromBtn(remindBtn);
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
          if(error){ await sbAlert(t("currency.deleteFailed") + error.message, t("settings.errorTitle")); return; }
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
      if(typeof openXcurRateEditModal === "function") openXcurRateEditModal(btn.dataset.xcur);
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
          if(error){ await sbAlert(t("currency.deleteFailed") + error.message, t("settings.errorTitle")); return; }
          await refreshExpenses();
        });
      }
      if(btn.classList.contains("debt-repay-del-group")){
        const groupRows = cachedRepayments.filter(x => x.offset_group === btn.dataset.group);
        if(!groupRows.length) return;
        el.style.display = "none";
        await deleteRowsWithUndo("repayments", groupRows, refreshExpenses, t("currency.offsetRecordLabel"));
      } else {
        if(!r) return;
        const label = t("currency.repayArrowLabel", {from: memberById[r.from_member] || "?", to: memberById[r.to_member] || "?"});
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

      const ok = await sbConfirm(t("currency.confirmOffsetAmount", {amount: SYM+formatAmt(offsetAmt)}));
      if(!ok) return;

      offsetBtn.disabled = true;

      const today = new Date().toISOString().slice(0,10);
      const note = t("currency.manualOffsetNote");
      // 用同一個 offset_group 把這兩筆方向相反的還款綁在一起，
      // 歷史紀錄裡才能合併顯示、一起刪除，不會被單獨改掉一半。
      const offsetGroup = crypto.randomUUID();

      const { error } = await sb.from("repayments").insert([
        { from_member: debtorId, to_member: creditorId, amount: offsetAmt, note, payment_date: today, created_by: myMember.id, currency: CURRENCY, offset_group: offsetGroup },
        { from_member: creditorId, to_member: debtorId, amount: offsetAmt, note, payment_date: today, created_by: myMember.id, currency: CURRENCY, offset_group: offsetGroup }
      ]);

      if(error){
        await sbAlert(t("currency.offsetFailed") + error.message, t("settings.errorTitle"));
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

      lines.push(t("currency.csvExpenseSection"));
      lines.push(toCSVRow(t("currency.csvExpenseHeaders", {sym: SYM}).split(",")));
      expenses.forEach(e=>{
        // e.description 可能夾帶 [xcur:...]／[recurring:...]／AI_RECEIPT_DATA 這類隱藏標記
        // （尤其編輯過的週期性支出，標記會被搬進 description，見 splitExpenseTitleAndNote()
        // 的說明）——匯出用乾淨過的標題，不要讓這些內部標記露在使用者看得到的 CSV 裡。
        const { title: cleanTitle } = splitExpenseTitleAndNote(e.description, e.note);
        const payerText = (e.payers || []).map(p => `${memberById[p.member_id] || "?"}${SYM}${p.amount}${p.calc ? `(${p.calc})` : ""}`).join("；");
        const shareText = (e.shares || []).map(s => `${memberById[s.member_id] || "?"}${SYM}${s.amount}${s.calc ? `(${s.calc})` : ""}`).join("；");
        lines.push(toCSVRow([e.expense_date, cleanTitle || e.description, e.amount, payerText, shareText, memberById[e.created_by] || "?"]));
      });

      lines.push("");
      lines.push(t("currency.csvRepaymentSection"));
      lines.push(toCSVRow(t("currency.csvRepaymentHeaders", {sym: SYM}).split(",")));
      repayments.forEach(r=>{
        lines.push(toCSVRow([r.payment_date, memberById[r.from_member] || "?", memberById[r.to_member] || "?", r.amount, r.note || ""]));
      });

      const csv = "\uFEFF" + lines.join("\r\n");
      const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t("currency.csvFilenamePrefix")}_${CURRENCY}_${new Date().toISOString().slice(0,10)}.csv`;
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
