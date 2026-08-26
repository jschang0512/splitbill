// ============================================================
// Split Bill — 支援的幣別清單。
// 以後要加新幣別（例如去下一個國家旅行），只要在這裡加一筆，
// 不用再建立新的 HTML 檔案、也不用改 currency.html 或 app.js。
// convert:true 表示要在金額旁邊顯示「≈NT$xxx」的臺幣換算提示。
// 排列順序依照台灣人常用/常去的程度，越常用排越前面——設定頁的
// 「顯示幣別」是勾選式的 toggle 按鈕（可以複選），清單順序就是
// 照這裡的陣列順序排。
// ============================================================
const CURRENCIES = [
  { code: "TWD", symbol: "NT$",  label: "臺幣",       flag: "🇹🇼", convert: false },
  { code: "JPY", symbol: "¥",    label: "日幣",       flag: "🇯🇵", convert: true },
  { code: "KRW", symbol: "₩",    label: "韓幣",       flag: "🇰🇷", convert: true },
  { code: "CNY", symbol: "CN¥",  label: "人民幣",     flag: "🇨🇳", convert: true },
  { code: "HKD", symbol: "HK$",  label: "港幣",       flag: "🇭🇰", convert: true },
  { code: "MOP", symbol: "MOP$", label: "澳門幣",     flag: "🇲🇴", convert: true },
  { code: "USD", symbol: "$",    label: "美金",       flag: "🇺🇸", convert: true },
  { code: "VND", symbol: "₫",    label: "越南盾",     flag: "🇻🇳", convert: true },
  { code: "THB", symbol: "฿",    label: "泰銖",       flag: "🇹🇭", convert: true },
  { code: "PHP", symbol: "₱",    label: "菲律賓披索", flag: "🇵🇭", convert: true },
  { code: "SGD", symbol: "S$",   label: "新加坡幣",   flag: "🇸🇬", convert: true },
  { code: "MYR", symbol: "RM",   label: "馬來幣",     flag: "🇲🇾", convert: true },
  { code: "IDR", symbol: "Rp",   label: "印尼盾",     flag: "🇮🇩", convert: true },
  { code: "KHR", symbol: "៛",    label: "柬埔寨瑞爾", flag: "🇰🇭", convert: true },
  { code: "EUR", symbol: "€",    label: "歐元",       flag: "🇪🇺", convert: true },
  { code: "GBP", symbol: "£",    label: "英鎊",       flag: "🇬🇧", convert: true },
  { code: "CHF", symbol: "Fr",   label: "瑞士法郎",   flag: "🇨🇭", convert: true },
  { code: "AUD", symbol: "A$",   label: "澳幣",       flag: "🇦🇺", convert: true },
  { code: "NZD", symbol: "NZ$",  label: "紐幣",       flag: "🇳🇿", convert: true },
  { code: "TRY", symbol: "₺",    label: "土耳其里拉", flag: "🇹🇷", convert: true },
  { code: "CZK", symbol: "Kč",   label: "捷克克朗",   flag: "🇨🇿", convert: true },
  { code: "HUF", symbol: "Ft",   label: "匈牙利福林", flag: "🇭🇺", convert: true },
  { code: "SEK", symbol: "kr",   label: "瑞典克朗",   flag: "🇸🇪", convert: true },
  { code: "NOK", symbol: "kr",   label: "挪威克朗",   flag: "🇳🇴", convert: true },
  { code: "DKK", symbol: "kr",   label: "丹麥克朗",   flag: "🇩🇰", convert: true },
  { code: "ISK", symbol: "kr",   label: "冰島克朗",   flag: "🇮🇸", convert: true }
];

/**
 * 產生全站統一的頂部導覽列（最多 4 顆，超過 4 顆時第 4 顆為「更多 ▾」下拉選單）
 * @param {string|HTMLElement} container - 導覽列容器 ID 或 DOM 元素（通常為 "navLinks"）
 * @param {string} currentCode - 當前頁面代碼："SUMMARY", 幣別代碼如 "TWD", "JPY", 或 "SETTINGS"
 * @param {Array<string>} [shownCodes] - 使用者設定顯示的幣別代碼清單
 */
function renderSplitbillNav(container, currentCode, shownCodes){
  const el = typeof container === "string" ? document.getElementById(container) : container;
  if(!el) return;

  shownCodes = shownCodes || JSON.parse(localStorage.getItem("splitbill-shown-currencies") || "null") || ["TWD"];
  
  // 篩選出勾選顯示的幣別；如果當前在特定幣別頁，確保該幣別出現在清單中
  const activeCurrencies = CURRENCIES.filter(c => shownCodes.includes(c.code) || c.code === currentCode);
  const isSummary = !currentCode || currentCode === "SUMMARY";

  // 第一顆固定是總覽
  let tabsHtml = `<a href="summary.html"${isSummary ? ' class="current"' : ''}>${isSummary ? '總覽' : '← 總覽'}</a>`;

  // 最多 4 顆：
  // 若 activeCurrencies 數量 <= 3：全部直接排開（總覽 + 幣別1 + 幣別2 + 幣別3，共 <= 4 顆）
  if(activeCurrencies.length <= 3){
    activeCurrencies.forEach(c => {
      const isCur = c.code === currentCode;
      tabsHtml += `<a href="currency.html?c=${c.code}"${isCur ? ' class="current"' : ''}>${c.label}</a>`;
    });
  } else {
    // 幣別 > 3 個時（總覽 + 前 2 幣別 + 更多 ▾，共 4 顆）：
    const firstTwo = activeCurrencies.slice(0, 2);
    const overflowList = activeCurrencies.slice(2);

    firstTwo.forEach(c => {
      const isCur = c.code === currentCode;
      tabsHtml += `<a href="currency.html?c=${c.code}"${isCur ? ' class="current"' : ''}>${c.label}</a>`;
    });

    // 判斷當前頁面是否落在 overflowList 裡（例如第 4、5 個幣別）
    const currentInOverflow = overflowList.find(c => c.code === currentCode);
    const dropdownLabel = currentInOverflow ? `${currentInOverflow.label} ▾` : '更多 ▾';
    const isDropdownCurrent = !!currentInOverflow;

    tabsHtml += `
      <div class="nav-dropdown" id="navDropdownWrap">
        <button type="button" class="nav-dropdown-btn${isDropdownCurrent ? ' current' : ''}" id="navDropdownBtn">
          <span>${dropdownLabel}</span>
        </button>
        <div class="nav-dropdown-menu hidden" id="navDropdownMenu">
          ${overflowList.map(c => `
            <a href="currency.html?c=${c.code}" class="nav-dropdown-item${c.code === currentCode ? ' active' : ''}">
              <span>${c.flag || ''} ${c.label}</span>
              <span class="nav-dropdown-code">${c.code}</span>
            </a>
          `).join("")}
        </div>
      </div>
    `;
  }

  el.innerHTML = tabsHtml;

  // 綁定下拉選單開關與點擊外部關閉
  const dropdownBtn = el.querySelector("#navDropdownBtn");
  const dropdownMenu = el.querySelector("#navDropdownMenu");
  if(dropdownBtn && dropdownMenu){
    dropdownBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const isHidden = dropdownMenu.classList.contains("hidden");
      dropdownMenu.classList.toggle("hidden", !isHidden);
      dropdownBtn.classList.toggle("open", isHidden);
    });
  }
}

// 監聽全域點擊以關閉導覽列下拉選單
document.addEventListener("click", (e)=>{
  const wrap = document.getElementById("navDropdownWrap");
  if(wrap && !wrap.contains(e.target)){
    const menu = document.getElementById("navDropdownMenu");
    const btn = document.getElementById("navDropdownBtn");
    if(menu) menu.classList.add("hidden");
    if(btn) btn.classList.remove("open");
  }
});

// ============================================================
// 全站統一優雅自訂彈窗 (取代瀏覽器原生 alert / confirm)
// ============================================================
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
    if(bodyEl){
      const safeText = String(message ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      bodyEl.innerHTML = safeText.replace(/\n/g, "<br>");
    }

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

window.showSbDialog = showSbDialog;
window.sbAlert = sbAlert;
window.sbConfirm = sbConfirm;

// ============================================================
// 支出類別自動圖示匹配 (Category Icons)
// ============================================================
function getCategoryIcon(desc){
  const str = String(desc || "").toLowerCase().trim();
  if(!str) return "🧾";
  if(str.includes("xcur") || str.includes("跨幣")) return "💱";
  if(str.includes("拉麵") || str.includes("麵") || str.includes("飯") || str.includes("壽司") || str.includes("居酒屋") || str.includes("燒肉") || str.includes("牛排") || str.includes("火鍋") || str.includes("披薩") || str.includes("漢堡") || str.includes("麥當勞") || str.includes("肯德基") || str.includes("餐") || str.includes("吃") || str.includes("午餐") || str.includes("晚餐") || str.includes("早餐") || str.includes("食") || str.includes("肉") || str.includes("便當")) return "🍜";
  if(str.includes("咖啡") || str.includes("飲料") || str.includes("喝") || str.includes("茶") || str.includes("酒") || str.includes("啤酒") || str.includes("清酒") || str.includes("冰") || str.includes("甜點") || str.includes("蛋糕") || str.includes("宵夜") || str.includes("starbucks") || str.includes("星巴克")) return "☕";
  if(str.includes("租車") || str.includes("油錢") || str.includes("加油") || str.includes("計程車") || str.includes("uber") || str.includes("停車") || str.includes("過路費")) return "🚗";
  if(str.includes("新幹線") || str.includes("地鐵") || str.includes("捷運") || str.includes("火車") || str.includes("高鐵") || str.includes("jr") || str.includes("pass") || str.includes("電車") || str.includes("車票")) return "🚄";
  if(str.includes("機票") || str.includes("飛機") || str.includes("機場") || str.includes("航空")) return "✈️";
  if(str.includes("公車") || str.includes("巴士") || str.includes("bus")) return "🚌";
  if(str.includes("船") || str.includes("渡輪")) return "🚢";
  if(str.includes("飯店") || str.includes("旅館") || str.includes("民宿") || str.includes("hotel") || str.includes("airbnb") || str.includes("住宿") || str.includes("房") || str.includes("溫泉")) return "🏨";
  if(str.includes("門票") || str.includes("票") || str.includes("環球") || str.includes("迪士尼") || str.includes("水族館") || str.includes("動物園") || str.includes("展") || str.includes("纜車") || str.includes("體驗") || str.includes("和服") || str.includes("滑雪")) return "🎟️";
  if(str.includes("超市") || str.includes("超商") || str.includes("藥妝") || str.includes("唐吉") || str.includes("全家") || str.includes("7-11") || str.includes("seven") || str.includes("伴手禮") || str.includes("紀念品") || str.includes("禮物") || str.includes("購物") || str.includes("買") || str.includes("uniqlo") || str.includes("bic")) return "🛍️";
  if(str.includes("藥") || str.includes("醫") || str.includes("診所") || str.includes("保險")) return "💊";
  if(str.includes("wifi") || str.includes("sim") || str.includes("網卡") || str.includes("網路") || str.includes("esim")) return "📶";
  return "🧾";
}

// ============================================================
// 頭像色彩與渲染系統 (Avatar System)
// ============================================================
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #7A6B9E, #A093C2)",
  "linear-gradient(135deg, #5C7CFA, #748FFC)",
  "linear-gradient(135deg, #20C997, #38D9A9)",
  "linear-gradient(135deg, #F76707, #FFA94D)",
  "linear-gradient(135deg, #E64980, #F06595)",
  "linear-gradient(135deg, #BE4BDB, #DA77F2)",
  "linear-gradient(135deg, #1098AD, #22B8CF)",
  "linear-gradient(135deg, #40C057, #69DB7C)"
];

function getAvatarColor(name){
  if(!name) return AVATAR_GRADIENTS[0];
  let hash = 0;
  for(let i = 0; i < name.length; i++){
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

function renderAvatarHTML(memberOrName, sizeClass = "avatar-sm"){
  let name = "";
  let avatarUrl = "";
  let id = "";
  let userId = "";

  if(typeof memberOrName === "object" && memberOrName !== null){
    name = memberOrName.name || memberOrName.nickname || memberOrName.accountName || "?";
    avatarUrl = memberOrName.avatar_url || "";
    id = memberOrName.id || "";
    userId = memberOrName.user_id || "";
  } else {
    name = String(memberOrName || "?");
  }

  // 自動從全域 MEMBERS 補全 user_id 與關聯資訊
  if(typeof MEMBERS !== "undefined" && Array.isArray(MEMBERS)){
    const matched = MEMBERS.find(m => (id && m.id === id) || (userId && m.user_id === userId) || (name && (m.name === name || m.accountName === name || m.nickname === name)));
    if(matched){
      if(!id && matched.id) id = matched.id;
      if(!userId && matched.user_id) userId = matched.user_id;
      if(!name && (matched.name || matched.accountName)) name = matched.name || matched.accountName;
      if(!avatarUrl && matched.avatar_url) avatarUrl = matched.avatar_url;
    }
  }

  // 1. 判斷是否為目前登入者（跨所有群組通用）
  const myUserAvatar = (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.avatar_url) ||
                       (window.myMember && window.myMember.avatar_url) ||
                       localStorage.getItem("sb_my_avatar") || "";

  const isMe = (window.currentUser && userId && userId === window.currentUser.id) ||
               (window.myMember && id && id === window.myMember.id) ||
               (window.currentUser && id && id === window.currentUser.id) ||
               (window.currentUser && !id && !userId && (
                 name === (window.myMember && window.myMember.name) ||
                 name === (window.myMember && window.myMember.accountName) ||
                 name === (window.currentUser && window.currentUser.email)
               ));

  if(isMe && myUserAvatar){
    avatarUrl = myUserAvatar;
  }

  // 2. 從 global cache 抓
  if(!avatarUrl && window.memberAvatars){
    avatarUrl = (userId && window.memberAvatars[userId]) || (id && window.memberAvatars[id]) || (name && window.memberAvatars[name]) || "";
  }

  // 3. 從 localStorage 抓成員快取（以 user_id 跨群組通用優先）
  if(!avatarUrl){
    try{
      if(userId) avatarUrl = localStorage.getItem("sb_avatar_" + userId) || "";
      if(!avatarUrl && id) avatarUrl = localStorage.getItem("sb_avatar_" + id) || "";
      if(!avatarUrl && name) avatarUrl = localStorage.getItem("sb_avatar_" + name) || "";
    }catch(e){}
  }

  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const safeName = String(name).replace(/"/g, "&quot;");

  if(avatarUrl){
    return `<span class="sb-avatar ${sizeClass}" title="${safeName}"><img src="${avatarUrl}" class="sb-avatar-img" alt="${safeName}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';"><span class="sb-avatar-initial" style="display:none;background:${getAvatarColor(name)};">${initial}</span></span>`;
  }
  return `<span class="sb-avatar ${sizeClass}" title="${safeName}"><span class="sb-avatar-initial" style="background:${getAvatarColor(name)};">${initial}</span></span>`;
}

window.getCategoryIcon = getCategoryIcon;
window.getAvatarColor = getAvatarColor;
window.renderAvatarHTML = renderAvatarHTML;


