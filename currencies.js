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
