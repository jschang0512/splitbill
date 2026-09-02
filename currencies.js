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
  { code: "TWD", symbol: "NT$",  label: "臺幣",       flag: "🇹🇼", convert: false, decimals: 0 },
  { code: "JPY", symbol: "¥",    label: "日幣",       flag: "🇯🇵", convert: true,  decimals: 0 },
  { code: "KRW", symbol: "₩",    label: "韓幣",       flag: "🇰🇷", convert: true,  decimals: 0 },
  { code: "CNY", symbol: "CN¥",  label: "人民幣",     flag: "🇨🇳", convert: true,  decimals: 2 },
  { code: "HKD", symbol: "HK$",  label: "港幣",       flag: "🇭🇰", convert: true,  decimals: 2 },
  { code: "MOP", symbol: "MOP$", label: "澳門幣",     flag: "🇲🇴", convert: true,  decimals: 2 },
  { code: "USD", symbol: "$",    label: "美金",       flag: "🇺🇸", convert: true,  decimals: 2 },
  { code: "VND", symbol: "₫",    label: "越南盾",     flag: "🇻🇳", convert: true,  decimals: 0 },
  { code: "THB", symbol: "฿",    label: "泰銖",       flag: "🇹🇭", convert: true,  decimals: 2 },
  { code: "PHP", symbol: "₱",    label: "菲律賓披索", flag: "🇵🇭", convert: true,  decimals: 2 },
  { code: "SGD", symbol: "S$",   label: "新加坡幣",   flag: "🇸🇬", convert: true,  decimals: 2 },
  { code: "MYR", symbol: "RM",   label: "馬來幣",     flag: "🇲🇾", convert: true,  decimals: 2 },
  { code: "IDR", symbol: "Rp",   label: "印尼盾",     flag: "🇮🇩", convert: true,  decimals: 0 },
  { code: "KHR", symbol: "៛",    label: "柬埔寨瑞爾", flag: "🇰🇭", convert: true,  decimals: 0 },
  { code: "EUR", symbol: "€",    label: "歐元",       flag: "🇪🇺", convert: true,  decimals: 2 },
  { code: "GBP", symbol: "£",    label: "英鎊",       flag: "🇬🇧", convert: true,  decimals: 2 },
  { code: "CHF", symbol: "Fr",   label: "瑞士法郎",   flag: "🇨🇭", convert: true,  decimals: 2 },
  { code: "AUD", symbol: "A$",   label: "澳幣",       flag: "🇦🇺", convert: true,  decimals: 2 },
  { code: "NZD", symbol: "NZ$",  label: "紐幣",       flag: "🇳🇿", convert: true,  decimals: 2 },
  { code: "TRY", symbol: "₺",    label: "土耳其里拉", flag: "🇹🇷", convert: true,  decimals: 2 },
  { code: "CZK", symbol: "Kč",   label: "捷克克朗",   flag: "🇨🇿", convert: true,  decimals: 2 },
  { code: "HUF", symbol: "Ft",   label: "匈牙利福林", flag: "🇭🇺", convert: true,  decimals: 0 },
  { code: "SEK", symbol: "kr",   label: "瑞典克朗",   flag: "🇸🇪", convert: true,  decimals: 2 },
  { code: "NOK", symbol: "kr",   label: "挪威克朗",   flag: "🇳🇴", convert: true,  decimals: 2 },
  { code: "DKK", symbol: "kr",   label: "丹麥克朗",   flag: "🇩🇰", convert: true,  decimals: 2 },
  { code: "ISK", symbol: "kr",   label: "冰島克朗",   flag: "🇮🇸", convert: true,  decimals: 0 }
];

// 依照幣別的「最小法定面額」四捨五入（例如美金到分＝2位小數，臺幣/日幣沒有角分＝整數），
// 不能一律無條件四捨五入到整數，否則像 1.99 美元這種金額拆分下去會失真。
function getCurrencyDecimals(code){
  const c = CURRENCIES.find(item => item.code === code);
  return c ? c.decimals : 0;
}
function roundToCurrency(v, code){
  const decimals = getCurrencyDecimals(code);
  const factor = Math.pow(10, decimals);
  return Math.round((Number(v) || 0) * factor) / factor;
}
window.getCurrencyDecimals = getCurrencyDecimals;
window.roundToCurrency = roundToCurrency;

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
// 支出類別自動分析與元資料引擎 (International Category Classification Engine)
// 支援中、英、日、韓、東南亞常用日常、餐飲、交通、景點、購物等關鍵字
// ============================================================
const CATEGORY_MAP = {
  general: { icon: "🧾", name: "一般支出", type: "general", color: "#868E96" },
  food: { icon: "🍜", name: "美食餐飲", type: "food", color: "#F76707" },
  drink: { icon: "☕", name: "飲料甜點", type: "drink", color: "#F59F00" },
  transit: { icon: "🚄", name: "大眾交通", type: "transit", color: "#1C7ED6" },
  car: { icon: "🚗", name: "租車用油", type: "car", color: "#0CA678" },
  flight: { icon: "✈️", name: "機票航班", type: "flight", color: "#1098AD" },
  hotel: { icon: "🏨", name: "住宿溫泉", type: "hotel", color: "#7048E8" },
  ticket: { icon: "🎟️", name: "門票娛樂", type: "ticket", color: "#F59F00" },
  shopping: { icon: "🛍️", name: "購物藥妝", type: "shopping", color: "#E64980" },
  medical: { icon: "💊", name: "醫療藥品", type: "medical", color: "#FA5252" },
  network: { icon: "📶", name: "網卡通訊", type: "network", color: "#40C057" },
  xcur: { icon: "💱", name: "跨幣轉移", type: "xcur", color: "#5C7CFA" }
};
window.CATEGORY_MAP = CATEGORY_MAP;

// ============================================================
// 多國同義詞與模糊關鍵字辭庫 (Synonym & Fuzzy Keyword Dictionary)
// ============================================================
const CATEGORY_KEYWORDS = {
  // 1. 美食餐飲
  food: [
    // 常見基本食材與主食（越通俗越好抓，寧可寬鬆一點也不要漏掉）
    "飯", "麵", "米粉", "冬粉", "餅", "魷魚", "花枝", "章魚", "肉", "雞肉", "豬肉", "牛肉", "羊肉", "鴨肉", "魚", "魚肉", "蝦", "蝦子", "螃蟹", "蛤蜊", "蛋", "滷蛋", "茶葉蛋", "豆腐", "臭豆腐乾", "青菜", "蔬菜", "水果", "湯", "羹", "粥", "沙拉", "生菜",
    // 核心動作與餐別
    "吃", "吃飯", "吃肉", "用餐", "料理", "食堂", "餐廳", "小吃", "便當", "早午餐", "早餐", "午餐", "晚餐", "宵夜", "晚飯", "早點", "外送", "外帶", "熱炒", "快炒", "合菜", "桌菜", "辦桌", "美食", "宴席", "合菜", "聚餐", "大餐", "吃到飽", "buffet", "自助餐", "無菜單", "私廚", "omakase", "主廚", "套餐",
    // 料理品類 (台港中日韓東南亞西式)
    "拉麵", "沾麵", "蕎麥麵", "烏龍麵", "意麵", "米粉", "冬粉", "粄條", "刀削麵", "涼麵", "牛肉麵", "湯麵", "乾麵", "炒麵", "炒飯", "燴飯", "油飯", "米糕", "滷肉飯", "魯肉飯", "肉燥飯", "雞肉飯", "火雞肉飯", "爌肉飯", "排骨飯", "排骨酥", "鹹酥雞", "鹽酥雞", "雞排", "碳烤", "炸雞", "韓式炸雞", "水餃", "煎餃", "鍋貼", "蒸餃", "小籠包", "湯包", "生煎包", "包子", "饅頭", "燒餅", "油條", "蛋餅", "飯糰", "割包", "刈包", "臭豆腐", "蚵仔煎", "蚵仔麵線", "麵線", "大腸麵線", "肉圓", "碗粿", "甜不辣", "關東煮", "滷味", "麻辣燙", "東山鴨頭", "燒臘", "叉燒", "油雞", "燒鴨", "燒鵝", "烤鴨", "一鴨三吃", "飲茶", "港點", "茶餐廳", "雲吞", "餛飩", "抄手", "紅油抄手", "腸粉", "蘿蔔糕", "鳳爪", "流沙包", "叉燒包",
    // 鍋物與燒烤排餐
    "火鍋", "麻辣鍋", "涮涮鍋", "石頭火鍋", "鴛鴦鍋", "壽喜燒", "羊肉爐", "薑母鴨", "酸菜白肉鍋", "酸菜魚", "牛排", "豬排", "雞排", "排餐", "鐵板燒", "燒肉", "烤肉", "韓式烤肉", "銅盤烤肉", "炭火燒肉", "和牛", "牛舌", "五花肉", "松阪豬", "串燒", "串炸", "炸豬排", "丼", "丼飯", "牛丼", "豬排丼", "親子丼", "鰻魚飯", "天婦羅", "壽司", "生魚片", "刺身", "握壽司", "軍艦", "手卷", "花壽司", "炙燒", "海鮮丼", "釜飯", "懷石料理",
    // 異國料理 (義美法泰越印墨)
    "披薩", "比薩", "披薩屋", "義大利麵", "燉飯", "千層麵", "焗烤", "漢堡", "潛艇堡", "熱狗堡", "塔可", "墨西哥捲餅", "法式料理", "地中海料理", "西班牙燉飯", "tapas", "印度咖哩", "日式咖哩", "泰式咖哩", "咖哩", "咖喱", "南洋料理", "泰式", "越式", "韓式", "日式", "義式", "法式", "美式", "印度", "部隊鍋", "辣炒年糕", "石鍋拌飯", "蔘雞湯", "炸醬麵", "雪濃湯", "海鮮煎餅", "海南雞", "海南雞飯", "肉骨茶", "叻沙", "冬蔭功", "泰式酸辣湯", "月亮蝦餅", "綠咖哩", "打拋豬", "椒麻雞", "河粉", "越南河粉", "生春捲", "越式麵包", "沙嗲",
    // 連鎖品牌與知名店家 (台灣/日本/全球)
    "鼎泰豐", "添好運", "點水樓", "欣葉", "瓦城", "饗食天堂", "饗饗", "旭集", "饗賓", "探索廚房", "十二廚", "漢來海港", "王品", "西堤", "陶板屋", "夏慕尼", "原燒", "肉次方", "初瓦", "聚", "青花驕", "和牛涮", "嚮辣", "築間", "馬辣", "新馬辣", "老四川", "海底撈", "鼎王", "無老鍋", "這一鍋", "屋馬", "茶六", "碳佐麻里", "乾杯", "胡同", "八方雲集", "四海遊龍", "三商巧福", "鬍鬚張", "大上海", "麥當勞", "肯德基", "摩斯", "漢堡王", "頂呱呱", "拿坡里", "達美樂", "必勝客", "胖老爹", "21世紀", "德州美墨", "一蘭", "一風堂", "天下一品", "麵屋武藏", "花月嵐", "鷹流", "豚骨拉麵", "すき家", "sukiya", "松屋", "matsuya", "吉野家", "yoshinoya", "くら寿司", "藏壽司", "kura", "スシロー", "壽司郎", "sushiro", "はま寿司", "爭鮮", "點爭鮮", "叙々苑", "敘敘苑", "鳥貴族", "磯丸水産", "餃子の王将", "大戸屋", "大戶屋", "やよい軒", "彌生軒", "かつや", "勝博殿", "靜岡勝政", "邁泉", "bb.q", "橋村炸雞", "kyochon", "bhc", "popeyes", "five guys", "shake shack", "in-n-out", "chipotle", "subway", "nandos",
    // 日文關鍵字
    "ラーメン", "らーめん", "つけ麺", "うどん", "そば", "蕎麦", "焼肉", "やきにく", "居酒屋", "いざかや", "定食", "ていしょく", "とんかつ", "豚カツ", "天ぷら", "天麩羅", "寿司", "すし", "鮨", "刺身", "さしみ", "しゃぶしゃぶ", "すき焼き", "おでん", "餃子", "お好み焼き", "たこ焼き", "弁当", "おにぎり", "丼", "牛丼", "カツ丼", "親子丼", "海鮮丼", "焼き鳥", "串カツ", "レストラン", "食堂", "屋台",
    // 英文與國際關鍵字
    "restaurant", "dining", "lunch", "dinner", "breakfast", "brunch", "supper", "meal", "food", "eatery", "bistro", "trattoria", "steakhouse", "diner", "buffet", "takeout", "delivery", "ubereats", "foodpanda", "doordash", "grubhub", "pizza", "pasta", "spaghetti", "lasagna", "risotto", "burger", "steak", "bbq", "barbecue", "grill", "taco", "burrito", "sushi", "sashimi", "poke", "ramen", "noodle", "noodles", "pho", "banh mi", "pad thai", "tom yum", "curry", "satay", "laksa", "dim sum", "dumpling", "gyoza", "paella", "sandwich", "bagel", "salad", "soup", "tapas", "omakase", "mcdonald", "mcdonalds", "kfc", "burger king", "subway", "chipotle", "shake shack", "five guys", "dominos", "pizza hut", "nandos",
    // 台灣在地小吃、夜市與早餐店補充
    "大腸包小腸", "蔥抓餅", "藥燉排骨", "胡椒餅", "棺材板", "鹽水雞", "鹹水雞", "黑輪", "米血", "米血糕", "豬血糕", "美而美", "弘爺漢堡", "拉亞漢堡", "麥味登", "早安美芝城", "呷尚寶", "度小月", "阿宗麵線", "金峰魯肉飯", "紅心地瓜", "御飯糰", "三明治", "蛋餅套餐", "自助餐店", "便當店", "悟饕",
    // 韓文關鍵字
    "먹다", "식당", "맛집", "한식", "분식", "김밥", "떡볶이", "순대", "튀김", "라면", "냉면", "비빔밥", "삼겹살", "갈비", "불고기", "치킨", "족발", "보쌈", "찜닭", "닭갈비", "감자탕", "순두부찌개", "김치찌개", "된장찌개", "부대찌개", "갈비탕", "설렁탕", "곰탕", "삼계탕", "국밥", "해장국", "잡채", "파전", "만두", "초밥", "회", "짬뽕", "짜장면", "탕수육", "마라탕", "훠궈", "브런치", "뷔페", "야식", "배달", "배달의민족", "배민", "요기요", "도시락", "국수", "칼국수", "수제비", "고기집", "육회"
  ],

  // 2. 飲料甜點
  drink: [
    // 常見基本飲品（越通俗越好抓）
    "水", "喝水", "礦泉水", "白開水", "氣泡水", "牛奶", "鮮奶", "優格", "優酪乳", "養樂多", "豆奶",
    // 茶與咖啡
    "咖啡", "拿鐵", "美式", "美式咖啡", "卡布奇諾", "卡布", "義式濃縮", "摩卡", "焦糖瑪奇朵", "瑪奇朵", "馥列白", "生椰拿鐵", "燕麥拿鐵", "冷萃", "手沖", "冰滴", "單品咖啡", "咖啡豆", "奶茶", "鮮奶茶", "紅茶", "綠茶", "青茶", "烏龍茶", "四季春", "金萱", "普洱茶", "鐵觀音", "抹茶", "焙茶", "玄米茶", "冬瓜茶", "花茶", "花草茶", "果茶", "水果茶", "洛神花茶", "仙草茶", "冰沙", "思樂冰", "果汁", "現打果汁", "柳橙汁", "西瓜汁", "木瓜牛奶", "楊枝甘露", "手搖", "手搖飲", "手搖杯", "飲料", "珍奶", "珍珠奶茶", "波霸", "椰果", "仙草", "愛玉", "粉條", "芋圓", "地瓜圓", "粉粿", "芝芝", "奶蓋", "豆花", "豆漿", "米漿", "燕麥奶",
    // 甜品與冰品烘焙
    "剉冰", "刨冰", "雪花冰", "冰淇淋", "霜淇淋", "冰棒", "冰品", "聖代", "甜點", "甜品", "蛋糕", "起司蛋糕", "乳酪蛋糕", "戚風蛋糕", "千層蛋糕", "巴斯克", "生乳捲", "鬆餅", "舒芙蕾", "可麗餅", "泡芙", "閃電泡芙", "水果塔", "派", "檸檬塔", "甜甜圈", "馬卡龍", "司康", "肉桂捲", "提拉米蘇", "奶酪", "布丁", "烤布蕾", "焦糖布丁", "蛋塔", "葡式蛋塔", "可頌", "烘焙", "麵包", "吐司", "生吐司", "貝果", "和菓子", "大福", "草莓大福", "糰子", "蕨餅", "鯛魚燒", "車輪餅", "紅豆餅", "雞蛋糕", "吉拿棒",
    // 酒類與酒吧
    "酒", "啤酒", "生啤", "生啤酒", "精釀啤酒", "黑啤", "白啤", "調酒", "雞尾酒", "威士忌", "白蘭地", "琴酒", "伏特加", "蘭姆酒", "龍舌蘭", "清酒", "純米大吟釀", "大吟釀", "吟釀", "燒酎", "梅酒", "柚子酒", "葡萄酒", "紅酒", "白酒", "香檳", "氣泡酒", "沙瓦", "角嗨", "highball", "酒吧", "餐酒館", "夜店", "lounge", "pub", "bar", "居酒屋", "club",
    // 品牌與連鎖
    "星巴克", "starbucks", "路易莎", "louisa", "cama", "伯朗", "blue bottle", "藍瓶咖啡", "komeda", "客美多", "dottor", "羅多倫", "tullys", "麻古", "麻古茶坊", "迷客夏", "50嵐", "五十嵐", "可不可", "清心", "清心福全", "茶湯會", "歇腳亭", "一芳", "珍煮丹", "龜記", "萬波", "得正", "先喝道", "五桐號", "再睡5分鐘", "春水堂", "翰林茶館", "十盛", "八曜和茶", "約翰紅茶", "天仁茗茶",
    // 日文關鍵字
    "カフェ", "コーヒー", "珈琲", "ラテ", "お茶", "まっちゃ", "スイーツ", "デザート", "ケーキ", "パフェ", "プリン", "クレープ", "パンケーキ", "ドーナツ", "ソフトクリーム", "アイス", "かき氷", "和菓子", "大福", "団子", "ビール", "生ビール", "ハイボール", "サワー", "チューハイ", "日本酒", "焼酎", "ワイン", "シャンパン", "カクテル", "ウィスキー", "バー", "喫茶店", "ベーカリー", "パン屋",
    // 英文關鍵字
    "cafe", "coffee", "espresso", "latte", "cappuccino", "macchiato", "mocha", "americano", "cold brew", "pour over", "tea", "chai", "matcha", "boba", "bubble tea", "milk tea", "juice", "smoothie", "beverage", "ice cream", "gelato", "sorbet", "pastry", "cake", "cupcake", "scone", "croissant", "donut", "doughnut", "waffle", "pancake", "pudding", "tiramisu", "macaron", "chocolate", "bakery", "brewery", "taproom", "beer", "ale", "lager", "ipa", "stout", "wine", "champagne", "cocktail", "liquor", "spirits", "whiskey", "whisky", "gin", "vodka", "rum", "tequila", "sake", "soju", "lounge", "dunkin", "tim hortons", "gong cha",
    // 台灣手搖飲與咖啡連鎖補充
    "大苑子", "日出茶太", "chatime", "喜茶", "老虎堂", "鮮茶道", "水巷茶弄", "comebuy", "康青龍", "樺達奶茶", "御茶園", "costa", "丹堤咖啡", "怡客咖啡", "壹咖啡", "city cafe", "city café", "cama café",
    // 韓文關鍵字
    "커피", "아메리카노", "라떼", "카페라떼", "카푸치노", "에스프레소", "콜드브루", "밀크티", "버블티", "스무디", "주스", "맥주", "소주", "막걸리", "소맥", "하이볼", "와인", "위스키", "칵테일", "스타벅스", "이디야", "투썸플레이스", "메가커피", "빽다방", "컴포즈커피", "커피빈", "폴바셋", "할리스", "디저트", "빙수", "팥빙수", "케이크", "마카롱", "크로플", "붕어빵", "호떡", "떡", "약과", "한과"
  ],

  // 3. 大眾交通
  transit: [
    // 捷運與鐵路
    "捷運", "地鐵", "地鐵站", "地下鐵", "火車", "鐵路", "台鐵", "臺鐵", "高鐵", "新幹線", "特急", "急行", "快速", "普通車", "電車", "區間車", "自強號", "太魯閣", "普悠瑪", "emu3000", "車票", "車資", "票價", "乘車券", "交通卡", "悠遊卡", "一卡通", "icash", "ic卡", "儲值", "八達通", "港鐵", "mtr", "地鐵一日券", "周遊券", "周遊卡", "jr pass", "jr", "suica", "西瓜卡", "pasmo", "icoca", "pitapa", "kitaca", "toica", "manaca", "sugoca", "nimoca", "t-money", "cashbee", "ez-link", "haruka", "skyliner", "n'ex", "成田特快", "京成電鐵", "南海電鐵", "近鐵", "阪急", "阪神", "西武", "東武", "小田急", "京王", "京阪", "名鐵", "西鐵",
    // 公車巴士與渡輪纜車
    "公車", "巴士", "市區公車", "客運", "統聯", "國光", "和欣", "阿羅哈", "觀光巴士", "hop on hop off", "夜行巴士", "高速巴士", "機場巴士", "利木津巴士", "接駁車", "渡輪", "輪渡", "船票", "遊船", "快艇", "水上巴士", "水上計程車", "纜車", "貓纜", "日月潭纜車", "箱根纜車", "昂坪360", "索道", "輕軌", "路面電車", "單軌", "單軌電車", "monorail", "funicular", "gondola", "ropeway", "cable car",
    // 日文關鍵字
    "新幹線", "しんかんせん", "地下鉄", "メトロ", "切符", "きっぷ", "運賃", "定期券", "バス", "都バス", "高速バス", "夜行バス", "フェリー", "ロープウェイ", "ケーブルカー", "モノレール", "駅", "電車代", "交通費", "チャージ",
    // 英文與國際關鍵字
    "transit", "transportation", "metro", "subway", "underground", "tube", "train", "railway", "railroad", "amtrak", "eurostar", "tgv", "ice", "thalys", "renfe", "frecciarossa", "sbb", "obb", "sncf", "db", "ticket", "fare", "pass", "travelcard", "oyster", "smartrip", "clipper", "octopus", "ez-link", "t-money", "bus", "coach", "shuttle", "tram", "streetcar", "trolley", "ferry", "boat", "cable car", "ropeway", "gondola", "funicular", "monorail",
    // 台灣交通補充
    "台北捷運", "北捷", "高雄捷運", "高捷", "桃園捷運", "桃捷", "機場捷運", "機捷", "台灣好行", "微笑單車",
    // 韓文關鍵字
    "지하철", "버스", "택시", "기차", "ktx", "srt", "무궁화호", "새마을호", "시외버스", "고속버스", "공항버스", "리무진버스", "티머니", "캐시비", "교통카드", "환승", "지하철역", "공항철도", "카카오택시", "우버"
  ],

  // 4. 租車用油 / 計程車
  car: [
    // 租車與共享
    "租車", "租賃車", "借車", "租車費", "甲租乙還", "irent", "goshare", "wemo", "格上", "和運", "中租", "times", "orix", "nippon rent a car", "toyota rent a car", "nissan rent a car", "budget", "avis", "hertz", "enterprise", "sixt", "europcar", "共享汽車", "共享機車", "租機車", "租重機", "租單車", "youbike", "ubike",
    // 計程車與叫車
    "計程車", "小黃", "的士", "打車", "叫車", "拼車", "專車", "包車", "包車一日遊", "代駕", "司機", "uber", "lyft", "grab", "bolt", "didi", "滴滴", "kakaotaxi", "gojek", "line taxi", "呼叫小黃", "台灣大車隊", "大都會",
    // 加油用油與停車過路費
    "油錢", "加油", "加油站", "汽油", "柴油", "92", "95", "98", "中油", "台塑", "全國加油站", "shell", "esso", "bp", "eneos", "idemitsu", "停車", "停車場", "停車費", "路邊停車", "嘟嘟房", "times停車場", "車庫", "代客泊車", "valet", "過路費", "國道通行費", "高速公路", "收費站", "通行費", "etc", "e-tag", "罰單", "拖吊", "拖吊費", "洗車", "打蠟", "汽車保養",
    // 台灣機車與電動車補充
    "機車", "摩托車", "檔車", "機車行", "機車保養", "gogoro", "換電站", "光陽", "kymco", "三陽", "sym", "山葉", "yamaha", "光陽機車",
    // 日文關鍵字
    "レンタカー", "カーシェア", "タイムズ", "タクシー", "ガソリン", "給油", "レギュラー", "ハイオク", "軽油", "駐車場", "パーキング", "コインパーキング", "駐車代", "高速代", "有料道路", "洗車", "車検",
    // 英文關鍵字
    "rental car", "car rental", "rent a car", "car hire", "car sharing", "scooter rental", "bike rental", "taxi", "cab", "rideshare", "uber", "lyft", "grab", "bolt", "didi", "ola", "gojek", "driver", "gas", "gasoline", "petrol", "diesel", "fuel", "gas station", "parking", "parking lot", "garage", "valet", "toll", "highway", "expressway", "ezpass", "hertz", "avis", "enterprise", "budget", "sixt", "europcar", "toyota rent", "nissan rent",
    // 韓文關鍵字
    "렌터카", "렌트카", "주유소", "기름값", "주유비", "주차", "주차장", "주차비", "통행료", "하이패스", "세차", "카카오t"
  ],

  // 5. 機票航班
  flight: [
    // 機票與航空公司
    "機票", "飛機", "航班", "航空", "機位", "選位", "行李托運", "托運", "行李超重", "改票", "退票", "燃油附加費", "機場稅", "貴賓室", "長榮", "長榮航空", "華航", "中華航空", "星宇", "星宇航空", "虎航", "台灣虎航", "國泰", "國泰航空", "香港航空", "華信", "立榮", "酷航", "樂桃", "捷星", "亞洲航空", "越捷", "全日空", "日航", "日本航空", "大韓航空", "韓亞航空", "德威航空", "真航空", "濟州航空", "新加坡航空", "阿聯酋", "卡達航空", "土耳其航空", "達美航空", "聯合航空", "美國航空", "加拿大航空", "漢莎航空", "法航", "荷航", "英航", "芬航",
    // 機場與航廈
    "機場", "航廈", "登機", "登機證", "登機門", "出境", "入境", "海關", "候機室", "機場接送", "行李寄存", "飛行機", "航空券", "フライト", "空港", "成田", "羽田", "關空", "関空", "jal", "ana", "peach", "ピーチ", "ジェットスター", "スカイマーク",
    // 英文關鍵字
    "flight", "fly", "air", "airplane", "plane", "airline", "airlines", "airport", "airfare", "air ticket", "boarding", "terminal", "baggage", "luggage", "lounge", "eva air", "china airlines", "starlux", "tigerair", "cathay pacific", "singapore airlines", "emirates", "qatar", "delta", "united", "american airlines", "lufthansa", "air france", "klm", "british airways", "airasia", "scoot", "vietjet", "korean air", "asiana",
    // 韓文關鍵字
    "비행기", "항공권", "항공사", "대한항공", "아시아나항공", "진에어", "제주항공", "티웨이항공", "에어부산", "에어서울", "인천공항", "김포공항", "김해공항", "탑승", "수하물", "수화물", "라운지"
  ],

  // 6. 住宿溫泉
  hotel: [
    // 住宿品類
    "飯店", "旅館", "酒店", "商旅", "商務旅館", "精品旅館", "渡假村", "渡假酒店", "resort", "民宿", "b&b", "guesthouse", "青年旅館", "青旅", "hostel", "膠囊旅館", "背包客棧", "帳篷", "露營", "露營車", "豪華露營", "glamping", "湯屋", "溫泉", "溫泉旅館", "湯宿", "風呂", "露天風呂", "日歸溫泉", "錢湯", "汽車旅館", "摩鐵", "客棧", "villa", "包棟",
    // 訂房與費用
    "住宿", "訂房", "房費", "房租", "押金", "清潔費", "加床", "加人", "延遲退房", "airbnb", "booking", "agoda", "hotels.com", "expedia", "trip.com", "klook住宿", "kkday住宿",
    // 集團與品牌
    "萬豪", "marriott", "希爾頓", "hilton", "洲際", "ihg", "凱悅", "hyatt", "喜來登", "sheraton", "威斯汀", "westin", "麗思卡爾頓", "ritz carlton", "四季", "four seasons", "諾富特", "novotel", "宜必思", "ibis", "apa hotel", "apa", "東橫inn", "toyoko", "dormy inn", "dormy", "super hotel", "route inn", "daiwa roynet", "richmond hotel", "三井花園", "prince hotel", "星野集團", "星野", "hoshino", "虹夕諾雅", "界", "risonare", "omo", "beb",
    // 台灣飯店集團補充
    "老爺酒店", "老爺會館", "晶華酒店", "福華飯店", "兆品酒店", "雲品酒店", "天成飯店", "承億文旅", "涵碧樓", "礁溪老爺", "太魯閣晶英", "晶英酒店", "康華", "神旺", "喜來登台北",
    // 日文關鍵字
    "ホテル", "旅館", "りょかん", "宿", "やど", "温泉", "おんせん", "露天風呂", "銭湯", "民宿", "ペンション", "カプセルホテル", "ゲストハウス", "民泊", "宿泊", "チェックイン", "チェックアウト",
    // 英文關鍵字
    "hotel", "hostel", "resort", "inn", "motel", "lodge", "lodging", "stay", "accommodation", "booking", "reservation", "room", "suite", "villa", "chalet", "cabin", "airbnb", "vrbo", "agoda", "expedia", "hotels.com", "trip.com", "hilton", "marriott", "hyatt", "ihg", "sheraton", "westin", "ritz carlton", "four seasons", "intercontinental", "novotel", "ibis", "best western", "holiday inn", "radisson", "b&b", "guesthouse", "capsule", "camping", "campsite", "glamping", "ryokan", "onsen",
    // 韓文關鍵字
    "호텔", "모텔", "게스트하우스", "펜션", "리조트", "숙박", "체크인", "체크아웃", "찜질방", "사우나"
  ],

  // 7. 門票娛樂景點
  ticket: [
    // 樂園與熱門景點
    "門票", "入場券", "參觀券", "票券", "預約券", "快速通關", "express pass", "fastpass", "環球", "環球影城", "usj", "迪士尼", "迪士尼樂園", "迪士尼海洋", "disneyland", "disneysea", "哈利波特影城", "吉卜力公園", "吉卜力美術館", "樂高樂園", "legoland", "六福村", "九族文化村", "麗寶樂園", "劍湖山", "遠雄海洋公園", "義大世界", "水族館", "海遊館", "美麗海水族館", "xpark", "動物園", "木柵動物園", "植物園", "博物館", "美術館", "故宮", "奇美博物館", "羅浮宮", "大英博物館", "科學館", "天文館", "展覽", "特展", "樂園", "遊樂園", "主題樂園", "摩天輪", "觀景台", "展望台", "101觀景台", "晴空塔", "skytree", "東京鐵塔", "shibuya sky", "阿倍野", "梅田藍天大廈", "巴黎鐵塔", "eiffel", "teamlab",
    // 體驗活動與戶外
    "體驗", "和服", "和服體驗", "浴衣", "韓服", "泰服", "茶道", "料理教室", "手作", "陶藝", "diy", "採果", "採草莓", "賞鯨", "夜釣", "滑雪", "滑雪場", "雪票", "纜車票", "租雪具", "教練費", "潛水", "水肺潛水", "浮潛", "衝浪", "sup", "立槳", "獨木舟", "溯溪", "泛舟", "跳傘", "高空彈跳", "飛行傘", "熱氣球", "賽車", "卡丁車", "密室逃脫", "桌遊", "vr體驗", "保齡球", "ktv", "唱歌", "錢櫃", "好樂迪", "溫泉券", "泡湯券", "按摩", "spa", "泰式按摩", "指壓", "油壓", "足湯", "岩盤浴", "神社", "寺廟", "御守", "拝觀", "參拜", "御朱印", "劇院", "劇場", "百老匯", "歌劇", "音樂劇", "電影", "影城", "戲院", "威秀", "秀泰", "國賓", "演唱會", "音樂會", "live", "祭典", "花火大會", "煙火", "klook", "kkday", "tripadvisor", "getyourguide",
    // 運動票券與場地費用
    "球賽", "球票", "棒球", "看球", "職棒", "中華職棒", "中職", "兄弟象", "統一獅", "樂天桃猿", "富邦悍將", "味全龍", "中信兄弟", "棒球場", "籃球", "籃球賽", "p.league", "sbl", "足球", "足球賽", "世足", "網球", "網球賽", "高爾夫", "高爾夫球場", "揮桿", "健身房", "健身房會員", "健身", "gym", "游泳池", "游泳", "羽球", "羽球場", "羽毛球", "桌球", "撞球", "攀岩", "攀岩館", "壁球", "瑜珈", "瑜伽", "皮拉提斯", "教練課", "運動中心", "體育館", "球場", "場地費", "場租", "路跑", "馬拉松", "運動賽事",
    // 台灣景點補充
    "貓空纜車", "貓纜", "美麗華摩天輪", "兒童新樂園", "佛光山", "中台禪寺", "阿里山", "太魯閣", "日月潭", "高美濕地", "劍湖山世界",
    // 日文關鍵字
    "チケット", "入場券", "拝観料", "ディズニー", "ユニバ", "ジブリ", "ハリーポッター", "チームラボ", "展望台", "スカイツリー", "東京タワー", "通天閣", "観覧車", "映画", "シネマ", "劇場", "舞台", "ライブ", "コンサート", "祭り", "花火大会", "スキー", "スノーボード", "リフト券", "着物", "浴衣", "神社", "お寺", "御朱印", "マッサージ", "エステ", "カラオケ",
    // 英文關鍵字
    "ticket", "tickets", "admission", "entry", "entrance", "pass", "tour", "guided tour", "excursion", "sightseeing", "attraction", "universal studios", "universal", "disney", "disneyland", "disneyworld", "disneysea", "ghibli", "museum", "gallery", "louvre", "aquarium", "zoo", "safari", "theme park", "amusement park", "observation deck", "observatory", "tower", "eiffel", "skytree", "show", "broadway", "musical", "opera", "theatre", "theater", "concert", "gig", "festival", "cinema", "movie", "exhibition", "expo", "ski", "skiing", "snowboard", "snowboarding", "lift ticket", "ski pass", "scuba", "dive", "diving", "snorkeling", "surf", "skydiving", "bungee", "kart", "escape room", "bowling", "karaoke", "spa", "massage",
    // 韓文關鍵字
    "티켓", "입장권", "놀이공원", "에버랜드", "롯데월드", "롯데월드타워", "남산타워", "코엑스", "아쿠아리움", "박물관", "미술관", "전시", "콘서트", "공연", "뮤지컬", "영화", "노래방", "스파", "마사지", "한복", "스키장", "케이블카"
  ],

  // 8. 購物藥妝超商伴手禮
  shopping: [
    // 超市與大賣場超商
    "超市", "大賣場", "量販店", "超商", "便利商店", "雜貨", "全聯", "家樂福", "大潤發", "愛買", "好市多", "costco", "美廉社", "7-11", "711", "小七", "全家", "familymart", "萊爾富", "ok超商", "lawson", "羅森", "唐吉", "唐吉訶德", "驚安", "驚安殿堂", "donki", "loft", "東急hands", "hands", "無印良品", "muji", "大創", "daiso", "seria", "cando", "宜得利", "nitori", "ikea", "aeon", "永旺", "ito yokado", "life超市", "西友", "成城石井", "big c", "lotte mart", "emart",
    // 藥妝與美妝保養
    "藥妝", "藥局", "藥品", "美妝", "保養品", "化妝品", "化妝水", "乳液", "面膜", "防曬", "精華液", "口紅", "香水", "屈臣氏", "watsons", "康是美", "cosmed", "寶雅", "poya", "日藥本舖", "松本清", "matsukiyo", "sundrug", "札幌藥妝", "大國藥妝", "鶴羽藥妝", "tsuruha", "杉藥局", "sugi", "cocokara fine", "tomod's", "sephora",
    // 百貨商場與家電服飾
    "百貨", "百貨公司", "新光三越", "sogo", "遠東百貨", "微風", "台北101", "時代百貨", "三井outlet", "mitsui", "華泰名品城", "lalaport", "parco", "lumine", "丸井", "大丸", "高島屋", "伊勢丹", "阪急", "商場", "購物中心", "outlet", "逛街", "市集", "夜市", "跳蚤市場", "電器", "家電", "3c", "bic camera", "yodobashi", "山田電機", "edion", "sofmap", "燦坤", "全國電子", "apple store", "sony store", "相機", "鏡頭", "手機", "平板", "筆電", "吹風機", "保溫杯", "玩具", "模型", "公仔", "動漫", "animate", "扭蛋", "盲盒", "漫畫", "書", "書店", "誠品", "紀伊國屋", "蔦屋", "文具", "服飾", "服裝", "衣服", "外套", "毛衣", "襯衫", "t恤", "褲子", "牛仔褲", "裙子", "洋裝", "內衣", "發熱衣", "涼感衣", "鞋子", "球鞋", "靴子", "拖鞋", "包包", "背包", "皮夾", "配件", "飾品", "手錶", "眼鏡", "墨鏡", "jins", "owndays", "zoff", "uniqlo", "gu", "zara", "h&m", "gap", "mango", "nike", "adidas", "puma", "new balance", "lululemon", "decathlon",
    // 伴手禮與免稅
    "伴手禮", "土產", "紀念品", "禮物", "手信", "特產", "名產", "鳳梨酥", "太陽餅", "蛋黃酥", "芋頭酥", "牛軋糖", "茶葉", "東京芭娜娜", "白色戀人", "royce", "薯條三兄弟", "kitkat", "免稅", "退稅", "duty free", "tax free", "昇恆昌", "采盟",
    // 台灣超市藥妝與書店補充
    "大樹藥局", "躍獅藥局", "生活藥局", "佳瑪", "松青超市", "楓康超市", "全聯福利中心", "美廉社", "city super", "誠品生活", "金石堂", "三民書局",
    // 日文關鍵字
    "ショッピング", "買い物", "お土産", "おみやげ", "土產", "名物", "銘菓", "薬局", "ドラッグストア", "マツモトキヨシ", "マツキヨ", "サンドラッグ", "スギ薬局", "ツルハ", "ココカラファイン", "ドンキ", "ドンキホーテ", "ビックカメラ", "ヨドバシカメラ", "ヤマダ電機", "エディオン", "ソフマップ", "アニメイト", "まんだらけ", "ユニクロ", "ジーユー", "無印良品", "ロフト", "東急ハンズ", "ハンズ", "ダイソー", "セリア", "キャンドゥ", "イオン", "イトーヨーカドー", "ライフ", "西友", "成城石井", "デパ地下", "百貨店", "高島屋", "三越", "伊勢丹", "松坂屋", "大丸", "そごう", "西武", "阪急", "阪神", "近鉄", "マルイ", "パルコ", "ルミネ", "アトレ", "ららぽーと", "アウトレット", "免税",
    "コンビニ", "セブンイレブン", "セブン-イレブン", "ファミリーマート", "ファミマ", "ローソン", "スーパー", "スーパーマーケット",
    // 英文關鍵字
    "shop", "shopping", "store", "boutique", "mall", "outlet", "market", "bazaar", "supermarket", "grocery", "groceries", "bodega", "convenience store", "souvenir", "souvenirs", "gift", "gifts", "duty free", "target", "walmart", "costco", "carrefour", "whole foods", "trader joe", "trader joes", "woolworths", "coles", "sainsbury", "tesco", "aldi", "lidl", "coop", "boots", "watsons", "sephora", "apple store", "best buy", "zara", "h&m", "uniqlo", "gu", "gap", "mango", "asos", "nike", "adidas", "puma", "lululemon", "decathlon", "ikea", "nitori", "daiso", "muji", "big c", "emart", "lotte mart",
    // 韓文關鍵字
    "쇼핑", "백화점", "롯데백화점", "신세계백화점", "현대백화점", "면세점", "올리브영", "다이소", "이마트", "코스트코", "편의점", "세븐일레븐", "화장품", "기념품", "선물", "특산품", "인삼", "홍삼"
  ],

  // 9. 醫療藥品
  medical: [
    "藥", "西藥", "中藥", "成藥", "醫", "診所", "醫院", "急診", "看診", "門診", "醫生", "牙醫", "拔牙", "洗牙", "眼科", "皮膚科", "骨科", "復健", "掛號費", "健保", "醫療", "醫療費", "醫藥費", "藥品", "處方箋", "感冒藥", "退燒藥", "胃藥", "止痛藥", "普拿疼", "eve", "大正微粒", "太田胃散", "正露丸", "腸胃藥", "止瀉藥", "便秘藥", "過敏藥", "頭痛藥", "暈車藥", "眼藥水", "fx眼藥水", "樂敦", "小花眼藥水", "貼布", "痠痛貼布", "撒隆巴斯", "roihi", "液體ok繃", "ok繃", "繃帶", "紗布", "棉花棒", "消毒水", "優碘", "酒精", "體溫計", "口罩", "維他命", "保健食品", "b群", "益生菌", "魚油", "葉黃素", "膠原蛋白", "健檢", "疫苗", "pcr", "快篩", "保險", "旅遊平安險", "旅平險", "旅遊不便險", "海外突發", "意外險", "醫療險", "病院", "クリニック", "医院", "診療所", "救急", "歯医者", "薬", "くすり", "処方箋", "風邪薬", "胃腸薬", "痛み止め", "頭痛薬", "酔い止め", "目薬", "湿布", "バンドエイド", "保険", "海外旅行保険", "hospital", "clinic", "urgent care", "emergency", "er", "doctor", "physician", "dentist", "pharmacy", "drugstore", "chemist", "medicine", "medication", "pill", "pills", "prescription", "rx", "painkiller", "aspirin", "ibuprofen", "tylenol", "bandaid", "bandage", "insurance", "travel insurance", "medical expense",
    // 台灣醫院補充
    "健保卡", "榮總", "台大醫院", "長庚醫院", "馬偕醫院", "亞東醫院", "新光醫院", "國泰醫院", "三軍總醫院", "萬芳醫院", "振興醫院",
    // 韓文關鍵字
    "약국", "병원", "응급실", "의원", "치과", "피부과", "감기약", "소화제", "진통제", "밴드", "파스", "여행자보험"
  ],

  // 10. 網卡通訊
  network: [
    "網卡", "上網卡", "網路", "通訊", "漫遊", "國際漫遊", "數據漫遊", "原號漫遊", "電信", "esim", "sim", "sim卡", "實體卡", "虛擬卡", "流量", "流量包", "吃到飽", "上網", "wifi", "wi-fi", "wifi機", "隨身wifi", "wifi分享器", "路由器", "租wifi", "中華電信", "遠傳", "台灣大哥大", "台哥大", "airalo", "holafly", "nomad", "djb", "joytel", "飛買家", "wi-ho", "simカード", "ネット", "通信", "ローミング", "ポケットwifi", "wi-fiレンタル", "docomo", "ドコモ", "softbank", "ソフトバンク", "au", "楽天モバイル", "rakuten", "uqモバイル", "ymobile", "ahamo", "povo", "linemo", "sim", "esim", "sim card", "wifi", "wi-fi", "mobile wifi", "pocket wifi", "data", "mobile data", "roaming", "data roaming", "gigabyte", "gb", "unlimited data", "telecom", "network", "broadband", "ais", "true", "dtac", "singtel", "starhub", "m1", "kt", "skt", "lgu+", "docomo", "softbank", "vodafone", "o2", "ee", "three", "orange", "t-mobile", "verizon", "at&t", "mint",
    // 台灣電信補充
    "台灣之星", "亞太電信", "亞太", "台星",
    // 韓文關鍵字
    "유심", "이심", "로밍", "와이파이", "포켓와이파이", "데이터"
  ],

  // 11. 跨幣轉移與手續費
  xcur: [
    "換匯", "結匯", "買匯", "賣匯", "外幣兌換", "換外幣", "外幣提款", "海外提款", "跨國提款", "海外刷卡手續費", "國外交易手續費", "跨國交易手續費", "手續費", "匯差", "換錢", "盤谷銀行", "兆豐", "玉山", "台銀", "superrich", "money exchange", "currency exchange", "fx fee", "foreign exchange", "atm withdrawal", "atm fee", "exchange fee",
    // 韓文關鍵字
    "환전", "환전소", "환율", "수수료"
  ]
};

// ============================================================
// 智慧模糊正規化與多層權重分析引擎 (Smart Fuzzy & Score Engine)
// ============================================================
function normalizeFuzzyText(text){
  if(!text) return "";
  return String(text)
    .normalize("NFKC") // 全形轉半形、字元正規化
    .toLowerCase()
    .replace(/[\s\-_,.:;!?'"()（）「」『』【】\[\]\/\\#+*~`@$%^&=<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(s1, s2) {
  if (Math.abs(s1.length - s2.length) > 2) return 99;
  const m = s1.length, n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// ============================================================
// 💱 跨幣別統一折算臺幣 (TWD) 匯率表與轉換工具
// ============================================================
const DEFAULT_RATES_TO_TWD = {
  TWD: 1,
  JPY: 0.21,
  KRW: 0.024,
  CNY: 4.45,
  HKD: 4.12,
  MOP: 3.98,
  USD: 32.2,
  VND: 0.0013,
  THB: 0.94,
  PHP: 0.57,
  SGD: 24.6,
  MYR: 7.3,
  IDR: 0.0020,
  KHR: 0.0078,
  EUR: 35.1,
  GBP: 41.5,
  CHF: 36.8,
  AUD: 21.2,
  NZD: 19.5,
  TRY: 0.94,
  CZK: 1.40,
  HUF: 0.088,
  SEK: 3.12,
  NOK: 3.02,
  DKK: 4.70,
  ISK: 0.24
};

function convertToTWD(amount, currencyCode){
  const amt = Number(amount) || 0;
  if(!currencyCode || currencyCode === "TWD") return amt;
  const rate = (window.cachedExchangeRates && window.cachedExchangeRates[currencyCode]) || 
               DEFAULT_RATES_TO_TWD[currencyCode] || 1;
  return amt * rate;
}

window.DEFAULT_RATES_TO_TWD = DEFAULT_RATES_TO_TWD;
window.convertToTWD = convertToTWD;

function getCategoryMeta(desc, note, categoryCol){
  // 0. 有真正的 category 欄位資料就直接採用，不用再靠文字猜測
  if(categoryCol && CATEGORY_MAP[categoryCol]) return CATEGORY_MAP[categoryCol];

  const fullRaw = String(desc || "") + " " + String(note || "");

  // 1. 優先檢查顯式自訂類別標籤（舊資料相容用，例如 <!--CAT:food--> 或 [cat:food]）
  const explicitMatch = fullRaw.match(/<!--?\s*CAT:([a-z0-9_-]+)\s*-->?/i) || fullRaw.match(/\[cat:([a-z0-9_-]+)\]/i);
  if(explicitMatch && explicitMatch[1]){
    const catKey = explicitMatch[1].toLowerCase();
    if(CATEGORY_MAP[catKey]) return CATEGORY_MAP[catKey];
  }

  const rawClean = fullRaw.toLowerCase().trim();
  if(!rawClean) return CATEGORY_MAP.general;

  // 跨幣轉移
  if(rawClean.includes("xcur") || rawClean.includes("跨幣")) {
    return CATEGORY_MAP.xcur;
  }

  const norm = normalizeFuzzyText(fullRaw);
  if(!norm) return CATEGORY_MAP.general;

  const tokens = norm.split(" ").filter(t => t.length > 0);

  // 2. 智慧權重計分系統 (Scoring Engine with Fuzzy Matching)
  const scores = {};
  let highestScore = 0;
  let bestCategory = "general";
  let bestMatchLen = 0;

  Object.keys(CATEGORY_KEYWORDS).forEach(cat => {
    scores[cat] = 0;
    const keywords = CATEGORY_KEYWORDS[cat];

    for(let i = 0; i < keywords.length; i++){
      const kw = keywords[i].toLowerCase().trim();
      if(!kw) continue;

      let matched = false;
      let weight = 0;

      // 1. 完全或子字串包含
      if(rawClean.includes(kw) || norm.includes(kw)){
        matched = true;
        weight = kw.length >= 4 ? 5 : (kw.length >= 2 ? 3 : 1.5);
      } else {
        // 2. 單詞 Token 模糊比對（容許拼字前綴、縮寫、小錯字）
        for(let t = 0; t < tokens.length; t++){
          const tok = tokens[t];
          if(tok.length < 3) continue;

          // 前綴比對 (e.g. starbuck vs starbucks, disney vs disneyland)
          if(tok.length >= 4 && (kw.startsWith(tok) || tok.startsWith(kw))){
            matched = true;
            weight = Math.max(weight, 3.5);
            break;
          }

          // 編輯距離比對 (容許 1 個錯字，e.g. starbuks vs starbucks, restarant vs restaurant)
          if(tok.length >= 5 && kw.length >= 5 && editDistance(tok, kw) <= 1){
            matched = true;
            weight = Math.max(weight, 3);
            break;
          }
        }
      }

      if(matched){
        scores[cat] += weight;
        if(scores[cat] > highestScore || (scores[cat] === highestScore && kw.length > bestMatchLen)){
          highestScore = scores[cat];
          bestCategory = cat;
          bestMatchLen = kw.length;
        }
      }
    }
  });

  if(highestScore > 0 && CATEGORY_MAP[bestCategory]){
    return CATEGORY_MAP[bestCategory];
  }

  return CATEGORY_MAP.general;
}

function getCategoryIcon(desc, categoryCol){
  return getCategoryMeta(desc, undefined, categoryCol).icon;
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

  // 1. 精準從全域 MEMBERS 尋找對應成員的 avatar_url（以 ID 或 user_id 優先）
  if(typeof MEMBERS !== "undefined" && Array.isArray(MEMBERS)){
    let matched = null;
    if(id) matched = MEMBERS.find(m => m.id === id);
    if(!matched && userId) matched = MEMBERS.find(m => m.user_id === userId);
    if(!matched && name && name !== "?") matched = MEMBERS.find(m => m.name === name || m.accountName === name);

    if(matched){
      if(!id && matched.id) id = matched.id;
      if(!userId && matched.user_id) userId = matched.user_id;
      if(!name && (matched.name || matched.accountName)) name = matched.name || matched.accountName;
      if(matched.avatar_url) avatarUrl = matched.avatar_url;
    }
  }

  // 2. 判斷是否為目前登入者（以 Supabase 資料庫中的 myMember.avatar_url 為第一優先）
  const isMe = (window.currentUser && userId && userId === window.currentUser.id) ||
               (window.myMember && id && id === window.myMember.id) ||
               (window.currentUser && id && id === window.currentUser.id);

  if(isMe){
    const myDbAvatar = (window.myMember && window.myMember.avatar_url) ||
                       (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.avatar_url) || "";
    if(myDbAvatar) avatarUrl = myDbAvatar;
  }

  // 3. 從本地快取抓取（嚴格限制只用 userId 或 id，絕不用 name 避免同名誤抓）
  if(!avatarUrl){
    try{
      if(userId) avatarUrl = localStorage.getItem("sb_avatar_" + userId) || "";
      if(!avatarUrl && id) avatarUrl = localStorage.getItem("sb_avatar_" + id) || "";
    }catch(e){}
  }

  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const safeName = String(name).replace(/"/g, "&quot;");

  if(avatarUrl){
    return `<span class="sb-avatar ${sizeClass}" title="${safeName}" data-name="${safeName}"><img src="${avatarUrl}" class="sb-avatar-img" alt="${safeName}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';"><span class="sb-avatar-initial" style="display:none;background:${getAvatarColor(name)};">${initial}</span></span>`;
  }
  return `<span class="sb-avatar ${sizeClass}" title="${safeName}" data-name="${safeName}"><span class="sb-avatar-initial" style="background:${getAvatarColor(name)};">${initial}</span></span>`;
}

function triggerReceiptFlyAnimation(opts = {}){
  const {
    buttonEl,
    desc = "支出項目",
    amount = 0,
    symbol = "$",
    categoryIcon = "🧾",
    payerName = "成員",
    splitCount = 1,
    targetListEl = null,
    onComplete = null
  } = opts;

  const overlay = document.createElement("div");
  overlay.className = "sb-receipt-spool-overlay";

  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const paper = document.createElement("div");
  paper.className = "sb-receipt-paper";
  paper.innerHTML = `
    <div class="sb-receipt-head">
      <div class="sb-receipt-store">${categoryIcon} <span>${typeof escapeHtml === "function" ? escapeHtml(desc || "新增支出") : (desc || "新增支出")}</span></div>
      <div class="sb-receipt-date">${dateStr}</div>
    </div>
    <div class="sb-receipt-body">
      <div class="sb-receipt-row">
        <span class="sb-receipt-desc">${typeof escapeHtml === "function" ? escapeHtml(desc || "一般消費") : (desc || "一般消費")}</span>
        <span class="sb-receipt-amt">${symbol}${typeof formatAmt === "function" ? formatAmt(amount) : amount}</span>
      </div>
      <div class="sb-receipt-row sb-receipt-meta">
        <span>付款: ${typeof escapeHtml === "function" ? escapeHtml(payerName) : payerName}</span>
        <span>${splitCount > 1 ? `${splitCount} 人分攤` : "個人專屬"}</span>
      </div>
    </div>
    <div class="sb-receipt-foot">
      <div class="sb-receipt-barcode"></div>
      <div class="sb-receipt-stamp">✓ PAID & LOGGED</div>
    </div>
  `;

  overlay.appendChild(paper);
  document.body.appendChild(overlay);

  if(buttonEl && typeof buttonEl.getBoundingClientRect === "function"){
    const btnRect = buttonEl.getBoundingClientRect();
    const paperTop = Math.max(20, Math.min(window.innerHeight - 240, btnRect.top - 120));
    const paperLeft = Math.max(16, Math.min(window.innerWidth - 244, btnRect.left + (btnRect.width / 2) - 114));
    paper.style.top = `${paperTop}px`;
    paper.style.left = `${paperLeft}px`;
  }

  // 第一階段：滑出並停留展示
  setTimeout(() => {
    let endX = window.innerWidth / 2;
    let endY = window.innerHeight - 100;

    const target = targetListEl || document.getElementById("expenseList") || document.getElementById("quickExpenseModal") || document.querySelector(".exp-item");
    if(target && typeof target.getBoundingClientRect === "function"){
      const targetRect = target.getBoundingClientRect();
      if(targetRect.height > 0 && targetRect.width > 0){
        endX = targetRect.left + targetRect.width / 2;
        endY = Math.min(window.innerHeight - 80, Math.max(60, targetRect.top + 60));
      }
    }

    const currentRect = paper.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;
    const deltaX = endX - currentCenterX;
    const deltaY = endY - currentCenterY;

    // 第二階段：實體收據直接優雅滑翔飛入目標帳本中（無光球）
    paper.style.transition = "transform 0.46s cubic-bezier(0.2, 0.8, 0.25, 1), opacity 0.42s ease";
    paper.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.18) rotate(4deg)`;
    paper.style.opacity = "0";

    setTimeout(() => {
      if(target){
        target.classList.remove("sb-ledger-ripple");
        void target.offsetWidth;
        target.classList.add("sb-ledger-ripple");
      }
      setTimeout(() => {
        overlay.remove();
        if(typeof onComplete === "function") onComplete();
      }, 150);
    }, 460);

  }, 850);
}

function openFinancialKeypad(targetInput, onConfirm){
  if(!targetInput) return;
  const old = document.getElementById("sbFinancialKeypadDrawer");
  if(old) old.remove();

  const drawer = document.createElement("div");
  drawer.id = "sbFinancialKeypadDrawer";
  drawer.className = "sb-numpad-drawer";

  let curVal = String(targetInput.value || "");
  let expression = curVal === "0" ? "" : curVal;

  const updateDisplay = () => {
    const disp = document.getElementById("sbNumpadDisplayAmt");
    if(disp){
      disp.textContent = expression || "0";
    }
  };

  drawer.innerHTML = `
    <div class="sb-numpad-header">
      <div class="sb-numpad-display-amt" id="sbNumpadDisplayAmt">${expression || "0"}</div>
      <button type="button" class="sb-numpad-close-btn" id="sbNumpadCloseBtn">✕ 關閉</button>
    </div>
    <div class="sb-numpad-grid">
      <button type="button" class="sb-numpad-key" data-key="7">7</button>
      <button type="button" class="sb-numpad-key" data-key="8">8</button>
      <button type="button" class="sb-numpad-key" data-key="9">9</button>
      <button type="button" class="sb-numpad-key key-op" data-key="/">÷</button>

      <button type="button" class="sb-numpad-key" data-key="4">4</button>
      <button type="button" class="sb-numpad-key" data-key="5">5</button>
      <button type="button" class="sb-numpad-key" data-key="6">6</button>
      <button type="button" class="sb-numpad-key key-op" data-key="*">×</button>

      <button type="button" class="sb-numpad-key" data-key="1">1</button>
      <button type="button" class="sb-numpad-key" data-key="2">2</button>
      <button type="button" class="sb-numpad-key" data-key="3">3</button>
      <button type="button" class="sb-numpad-key key-op" data-key="-">-</button>

      <button type="button" class="sb-numpad-key" data-key=".">.</button>
      <button type="button" class="sb-numpad-key" data-key="0">0</button>
      <button type="button" class="sb-numpad-key key-op" data-key="backspace">⌫</button>
      <button type="button" class="sb-numpad-key key-op" data-key="+">+</button>

      <button type="button" class="sb-numpad-key key-op" data-key="clear" style="grid-column: span 2; font-size:15px;">清空 C</button>
      <button type="button" class="sb-numpad-key key-confirm" data-key="confirm" style="grid-column: span 2;">✓ 完成</button>
    </div>
  `;

  document.body.appendChild(drawer);

  const calculate = (str) => {
    try {
      const sanitized = str.replace(/[^0-9+\-*/.]/g, '');
      if(!sanitized) return 0;
      const fn = new Function(`return (${sanitized})`);
      const res = fn();
      return isFinite(res) ? Math.round(res * 100) / 100 : 0;
    } catch(e) {
      return null;
    }
  };

  drawer.querySelectorAll(".sb-numpad-key").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      if(key === "confirm"){
        const finalVal = calculate(expression);
        if(finalVal !== null){
          targetInput.value = finalVal;
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));
          targetInput.dispatchEvent(new Event("change", { bubbles: true }));
          if(onConfirm) onConfirm(finalVal);
        }
        drawer.remove();
        return;
      }
      if(key === "clear"){
        expression = "";
        updateDisplay();
        return;
      }
      if(key === "backspace"){
        expression = expression.slice(0, -1);
        updateDisplay();
        return;
      }
      if(["+", "-", "*", "/"].includes(key)){
        if(expression && !["+", "-", "*", "/"].includes(expression.slice(-1))){
          expression += key;
        }
        updateDisplay();
        return;
      }
      if(key === "."){
        if(!expression.endsWith(".")){
          expression += ".";
        }
        updateDisplay();
        return;
      }
      expression += key;
      updateDisplay();
    });
  });

  const closeBtn = document.getElementById("sbNumpadCloseBtn");
  if(closeBtn){
    closeBtn.addEventListener("click", () => drawer.remove());
  }
}

window.getCategoryIcon = getCategoryIcon;
window.getCategoryMeta = getCategoryMeta;
window.getAvatarColor = getAvatarColor;
window.renderAvatarHTML = renderAvatarHTML;
window.triggerReceiptFlyAnimation = triggerReceiptFlyAnimation;
window.openFinancialKeypad = openFinancialKeypad;

// ============================================================
// 🎖️ 成員成就與趣味勳章系統 (Member Achievements & Badges - 跨幣別大一統)
// ============================================================
const BADGES_CATALOG = [
  {
    id: "big_spender",
    icon: "👑",
    name: "代付大金主",
    desc: "全團歷史累積代付總金額最高者（跨幣別折算 TWD）",
    check: (m, expList, repList, membersList) => {
      const exps = window.allGroupExpenses || expList || window.cachedExpenses || [];
      let allMembers = (membersList && membersList.length) ? membersList : (window.memberRows || window.MEMBERS || []);
      if(!allMembers || !allMembers.length){
        const idMap = new Map();
        exps.forEach(e => {
          (e.payers || []).forEach(p => p.member_id && idMap.set(p.member_id, { id: p.member_id, name: p.member_id }));
          (e.shares || []).forEach(s => s.member_id && idMap.set(s.member_id, { id: s.member_id, name: s.member_id }));
        });
        allMembers = Array.from(idMap.values());
      }
      if(!allMembers.length) return false;

      let maxPaidTWD = 0;
      let topPayerId = null;

      allMembers.forEach(mem => {
        const memId = mem.id || mem;
        const totalPaidTWD = exps.reduce((sum, e) => {
          const p = (e.payers || []).find(x => x.member_id === memId);
          return sum + (p ? convertToTWD(p.amount, e.currency) : 0);
        }, 0);
        if(totalPaidTWD > 1 && totalPaidTWD > maxPaidTWD){
          maxPaidTWD = totalPaidTWD;
          topPayerId = memId;
        }
      });

      const currentMId = m.id || m;
      return !!(topPayerId && topPayerId === currentMId);
    }
  },
  {
    id: "debt_demon",
    icon: "😈",
    name: "欠款大魔王",
    desc: "目前全團累積淨欠款最高者（跨幣別折算 TWD）",
    check: (m, expList, repList, membersList) => {
      const exps = window.allGroupExpenses || expList || window.cachedExpenses || [];
      const reps = window.allGroupRepayments || repList || window.cachedRepayments || [];
      
      let allMembers = (membersList && membersList.length) ? membersList : (window.memberRows || window.MEMBERS || []);
      if(!allMembers || !allMembers.length){
        const idMap = new Map();
        exps.forEach(e => {
          (e.payers || []).forEach(p => p.member_id && idMap.set(p.member_id, { id: p.member_id, name: p.member_id }));
          (e.shares || []).forEach(s => s.member_id && idMap.set(s.member_id, { id: s.member_id, name: s.member_id }));
        });
        reps.forEach(r => {
          if(r.from_member) idMap.set(r.from_member, { id: r.from_member, name: r.from_member });
          if(r.to_member) idMap.set(r.to_member, { id: r.to_member, name: r.to_member });
        });
        allMembers = Array.from(idMap.values());
      }

      if(!allMembers.length) return false;

      let maxDebtTWD = 0;
      let worstMemberId = null;

      allMembers.forEach(mem => {
        const memId = mem.id || mem;
        let paidTWD = 0, shareTWD = 0, repaidTWD = 0, receivedTWD = 0;

        exps.forEach(e => {
          const cur = e.currency || "TWD";
          const p = (e.payers || []).find(x => x.member_id === memId);
          if(p) paidTWD += convertToTWD(p.amount, cur);
          const s = (e.shares || []).find(x => x.member_id === memId);
          if(s) shareTWD += convertToTWD(s.amount, cur);
        });

        reps.forEach(r => {
          const cur = r.currency || "TWD";
          if(r.from_member === memId) repaidTWD += convertToTWD(r.amount, cur);
          if(r.to_member === memId) receivedTWD += convertToTWD(r.amount, cur);
        });

        const netTWD = (paidTWD + repaidTWD) - (shareTWD + receivedTWD);
        const debtTWD = -netTWD; // 正數代表淨欠款
        if(debtTWD > 1 && debtTWD > maxDebtTWD){
          maxDebtTWD = debtTWD;
          worstMemberId = memId;
        }
      });

      const currentMId = m.id || m;
      return !!(worstMemberId && (worstMemberId === currentMId));
    }
  },
  {
    id: "foodie",
    icon: "🍜",
    name: "米其林老饕",
    desc: "餐飲類別支出超過個人總支出的 25%",
    check: (m, expList) => {
      const memId = m.id || m;
      let foodAmt = 0, totalShare = 0;
      (expList || []).forEach(e => {
        const s = (e.shares || []).find(x => x.member_id === memId);
        if(s){
          const amt = Number(s.amount) || 0;
          totalShare += amt;
          const meta = window.getCategoryMeta ? window.getCategoryMeta(e.description, e.note, e.category) : { type: "general" };
          if(meta.type === "food" || meta.type === "drink") foodAmt += amt;
        }
      });
      return totalShare > 0 && foodAmt > 0 && (foodAmt / totalShare >= 0.25);
    }
  },
  {
    id: "shopaholic",
    icon: "🛍️",
    name: "購物狂熱者",
    desc: "購物類別支出超過個人總支出的 25%",
    check: (m, expList) => {
      const memId = m.id || m;
      let shopAmt = 0, totalShare = 0;
      (expList || []).forEach(e => {
        const s = (e.shares || []).find(x => x.member_id === memId);
        if(s){
          const amt = Number(s.amount) || 0;
          totalShare += amt;
          const meta = window.getCategoryMeta ? window.getCategoryMeta(e.description, e.note, e.category) : { type: "general" };
          if(meta.type === "shopping") shopAmt += amt;
        }
      });
      return totalShare > 0 && shopAmt > 0 && (shopAmt / totalShare >= 0.25);
    }
  },
  {
    id: "speedy_settler",
    icon: "⚡",
    name: "秒速結清手",
    desc: "最近一次完成結清還款的人",
    check: (m, expList, repList) => {
      const reps = repList || window.cachedRepayments || [];
      if(!reps || !reps.length) return false;
      const sorted = [...reps].sort((a, b) => {
        const tA = new Date(a.payment_date || a.created_at || 0).getTime();
        const tB = new Date(b.payment_date || b.created_at || 0).getTime();
        return tB - tA;
      });
      const latest = sorted[0];
      if(!latest) return false;
      const currentMId = m.id || m;
      return latest.from_member === currentMId;
    }
  },
  {
    id: "ai_master",
    icon: "🤖",
    name: "AI 拆單達人",
    desc: "全團使用 AI 照片收據自動拆單次數最多者",
    check: (m, expList, repList, membersList) => {
      const exps = expList || window.cachedExpenses || [];
      let allMembers = (membersList && membersList.length) ? membersList : (window.memberRows || window.MEMBERS || []);
      if(!allMembers.length){
        const idMap = new Map();
        exps.forEach(e => {
          (e.payers || []).forEach(p => p.member_id && idMap.set(p.member_id, { id: p.member_id, name: p.member_id }));
          (e.shares || []).forEach(s => s.member_id && idMap.set(s.member_id, { id: s.member_id, name: s.member_id }));
          if(e.created_by) idMap.set(e.created_by, { id: e.created_by, name: e.created_by });
        });
        allMembers = Array.from(idMap.values());
      }
      if(!allMembers.length) return false;

      let maxCount = 0;
      let topMemberId = null;

      allMembers.forEach(mem => {
        const memId = mem.id || mem;
        const count = exps.filter(e => {
          const isCreator = e.created_by === memId;
          const isAi = (e.description && (e.description.includes("AI_RECEIPT_DATA") || e.description.includes("AI自動拆單"))) ||
                       (e.note && (e.note.includes("AI_RECEIPT_DATA") || e.note.includes("AI自動拆單")));
          return isCreator && isAi;
        }).length;

        if(count > 0 && count > maxCount){
          maxCount = count;
          topMemberId = memId;
        }
      });

      const currentMId = m.id || m;
      return !!(topMemberId && topMemberId === currentMId);
    }
  },
  {
    id: "math_wizard",
    icon: "🎯",
    name: "精算大師",
    desc: "近兩週內參與分攤超過 10 筆支出（跨幣別）",
    check: (m, expList) => {
      const exps = window.allGroupExpenses || expList || window.cachedExpenses || [];
      const memId = m.id || m;
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const count = exps.filter(e => {
        const d = new Date(e.expense_date || e.created_at || 0).getTime();
        if(d < twoWeeksAgo) return false;
        return (e.shares || []).some(s => s.member_id === memId);
      }).length;
      return count >= 10;
    }
  }
];

function getMemberBadges(memberIdOrName, expenses, repayments, membersList){
  if(!memberIdOrName) return [];
  const expList = window.allGroupExpenses || expenses || window.cachedExpenses || window.chartExpensesCache || [];
  const repList = window.allGroupRepayments || repayments || window.cachedRepayments || [];
  const members = (membersList && membersList.length) ? membersList : (window.memberRows || window.MEMBERS || []);
  
  let targetStr = (typeof memberIdOrName === "object" && memberIdOrName !== null)
    ? (memberIdOrName.id || memberIdOrName.name || "")
    : String(memberIdOrName).replace(/^付款人[:：]\s*/, "").replace(/^應付人[:：]\s*/, "").replace(/\s*\([^)]*\)/g, "").trim();

  let matchedMember = members.find(x => 
    x.id === targetStr || 
    x.name === targetStr || 
    x.accountName === targetStr ||
    (targetStr && x.name && (x.name.includes(targetStr) || targetStr.includes(x.name)))
  );

  const m = matchedMember || (typeof memberIdOrName === "object" && memberIdOrName !== null ? memberIdOrName : { id: targetStr, name: targetStr });

  return BADGES_CATALOG.filter(b => {
    try {
      return b.check(m, expList, repList, members);
    } catch(e){
      return false;
    }
  });
}

window.BADGES_CATALOG = BADGES_CATALOG;
window.getMemberBadges = getMemberBadges;

// app.js 裡也有一份一樣的 formatAmt()，但那份是包在它自己的 IIFE 裡、
// 外部檔案看不到——這裡單獨留一份給這個檔案自己的函式用，邏輯要跟
// app.js 那份保持一致（不四捨五入成整數，最多顯示到小數點後兩位）。
function formatAmt(v){
  if(v === undefined || v === null || isNaN(v) || Math.abs(v) < 0.001) return "0";
  const num = Number(v);
  return num.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ============================================================
// 🗂️ 電腦版固定導航側邊欄 (Desktop Sidebar)
// ============================================================
// 幣別帳本清單的顯示順序，直接照 shownCurrenciesList 陣列本身的順序排
// （不是照 CURRENCIES 主清單的固定順序），這樣「幣別帳本」底下的項目
// 才能拖拉調整順序、存起來下次還是同一個順序。
// onReorder(newOrderCodes) 是選填的callback，拖放完成後會呼叫，讓呼叫端
// （每一頁自己的 sb/myMember）決定怎麼存回資料庫——sidebar 本身不知道
// 目前登入的是誰、要用哪個 supabase client，所以不自己直接寫資料庫。
function renderDesktopSidebar(targetContainerId, activePage, currentCurrencyCode, shownCurrenciesList, onReorder){
  const el = document.getElementById(targetContainerId);
  if(!el) return;

  const shown = shownCurrenciesList || window.shownCurrencies || ["TWD"];
  const currenciesList = shown.map(code => CURRENCIES.find(c => c.code === code)).filter(Boolean);
  const isSummaryActive = activePage === "SUMMARY";

  el.innerHTML = `
    <aside class="sb-desktop-sidebar">
      <div class="sb-sidebar-brand">
        <svg class="app-logo" viewBox="0 0 512 512" aria-hidden="true">
          <path class="s1" d="M256,238 L118.5,138.1 A170,170 0 0,1 393.5,138.1 Z"/>
          <path class="s2" d="M271.6,265 L426.9,195.9 A170,170 0 0,1 289.4,434.1 Z"/>
          <path class="s3" d="M240.4,265 L222.6,434.1 A170,170 0 0,1 85.1,195.9 Z"/>
        </svg>
        <span class="sb-sidebar-brand-title">Splitbill 帳務系統</span>
      </div>

      <div class="sb-sidebar-nav-list">
        <a href="summary.html" class="sb-sidebar-nav-item ${isSummaryActive ? 'active' : ''}">
          <span>📊 帳務總覽</span>
          <span class="key-shortcut-hint">1</span>
        </a>
      </div>

      <div class="sb-sidebar-section-title">幣別帳本</div>
      <div class="sb-sidebar-nav-list" id="sbSidebarCurList">
        ${currenciesList.map(c => `
          <a href="currency.html?c=${c.code}" class="sb-sidebar-nav-item sb-sidebar-draggable ${(!isSummaryActive && currentCurrencyCode === c.code) ? 'active' : ''}" draggable="true" data-code="${c.code}">
            <span>${c.flag || "💰"} ${c.label}</span>
            <span class="sb-sidebar-badge">${c.code}</span>
            <span class="sb-sidebar-grip" title="拖拉調整順序" aria-hidden="true">⠿</span>
          </a>
        `).join("")}
      </div>

      <div class="sb-sidebar-section-title">工具與設定</div>
      <div class="sb-sidebar-nav-list">
        <button type="button" class="sb-sidebar-nav-item" id="desktopOpenAchievementsBtn" style="border:none;background:transparent;cursor:pointer;width:100%;text-align:left;">
          <span>🎖️ 成就榜</span>
        </button>
        <a href="settings.html" class="sb-sidebar-nav-item ${activePage === 'SETTINGS' ? 'active' : ''}">
          <span>⚙️ 系統設定</span>
        </a>
      </div>

      <div class="sb-sidebar-footer">
        <button type="button" class="btn secondary small" id="desktopLogoutBtn" style="width:100%;">登出</button>
      </div>
    </aside>
  `;

  const achBtn = el.querySelector("#desktopOpenAchievementsBtn");
  if(achBtn){
    achBtn.addEventListener("click", () => {
      const modal = document.getElementById("achievementsModal");
      if(modal){
        modal.classList.remove("hidden");
        modal.classList.add("show");
      }
    });
  }

  const logoutBtn = el.querySelector("#desktopLogoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", () => {
      const origLogout = document.getElementById("logoutBtn");
      if(origLogout) origLogout.click();
    });
  }

  // ---------- 幣別帳本拖拉排序 ----------
  const curListEl = el.querySelector("#sbSidebarCurList");
  if(curListEl){
    let dragEl = null;

    curListEl.addEventListener("dragstart", (e) => {
      const item = e.target.closest(".sb-sidebar-draggable");
      if(!item) return;
      dragEl = item;
      item.classList.add("sb-sidebar-dragging");
      if(e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });

    curListEl.addEventListener("dragend", () => {
      if(dragEl) dragEl.classList.remove("sb-sidebar-dragging");
      curListEl.querySelectorAll(".sb-sidebar-drop-target").forEach(i => i.classList.remove("sb-sidebar-drop-target"));
      dragEl = null;
    });

    curListEl.addEventListener("dragover", (e) => {
      if(!dragEl) return;
      e.preventDefault();
      const item = e.target.closest(".sb-sidebar-draggable");
      curListEl.querySelectorAll(".sb-sidebar-drop-target").forEach(i => i.classList.remove("sb-sidebar-drop-target"));
      if(item && item !== dragEl) item.classList.add("sb-sidebar-drop-target");
    });

    curListEl.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = e.target.closest(".sb-sidebar-draggable");
      curListEl.querySelectorAll(".sb-sidebar-drop-target").forEach(i => i.classList.remove("sb-sidebar-drop-target"));
      if(!target || !dragEl || target === dragEl) return;

      const items = Array.from(curListEl.children);
      const dragIdx = items.indexOf(dragEl);
      const targetIdx = items.indexOf(target);
      if(dragIdx < targetIdx) target.after(dragEl);
      else target.before(dragEl);

      const newOrder = Array.from(curListEl.children).map(a => a.dataset.code);
      if(typeof onReorder === "function") onReorder(newOrder);
    });
  }
}
window.renderDesktopSidebar = renderDesktopSidebar;

// ============================================================
// ⌨️ 電腦版專屬：鍵盤快捷鍵體系 (Desktop Keyboard Shortcuts)
// ============================================================
function initDesktopShortcuts(){
  if(window.sbShortcutsBound) return;
  window.sbShortcutsBound = true;

  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    const isInput = tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable);

    if(e.key === "Escape"){
      document.querySelectorAll(".calc-modal.show, .modal.show").forEach(m => {
        m.classList.remove("show");
        m.classList.add("hidden");
      });
      const numpad = document.getElementById("sbFinancialKeypadDrawer");
      if(numpad) numpad.remove();
      return;
    }

    if(isInput) return;

    // N or Ctrl+K / Cmd+K: Open Quick Expense
    if((e.key === "n" || e.key === "N") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")){
      e.preventDefault();
      const openQuick = document.getElementById("openQuickExpenseBtn") || document.getElementById("openExpenseModalBtn");
      if(openQuick) openQuick.click();
      return;
    }

    // / or Ctrl+F / Cmd+F: Focus search
    if(e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f")){
      const searchInp = document.getElementById("historySearchInput");
      if(searchInp){
        e.preventDefault();
        searchInp.focus();
        searchInp.select();
      }
      return;
    }

    // 1: Jump to summary
    if(e.key === "1"){
      if(!location.pathname.includes("summary.html")){
        location.href = "summary.html";
      }
    }
  });
}
window.initDesktopShortcuts = initDesktopShortcuts;

// ============================================================
// 📈 電腦版專屬：4 大 KPI 數據橫條渲染 (Desktop KPI Metrics)
// ============================================================
function renderDesktopKpiStrip(containerId, stats){
  const el = document.getElementById(containerId);
  if(!el || !stats) return;

  const { totalGroupSpend = 0, myTotalPaid = 0, myNetBalance = 0, unsettledCount = 0, currencySymbol = "$" } = stats;
  const netCls = myNetBalance > 0.05 ? "pos" : myNetBalance < -0.05 ? "neg" : "zero";
  const netSign = myNetBalance > 0.05 ? "+" : "";

  el.innerHTML = `
    <div class="desktop-kpi-grid">
      <div class="desktop-kpi-card">
        <div class="desktop-kpi-header">
          <span>全團總支出</span>
          <span class="desktop-kpi-icon">💰</span>
        </div>
        <div class="desktop-kpi-val">${currencySymbol}${formatAmt(totalGroupSpend)}</div>
        <div class="desktop-kpi-sub">目前群組累積總花費</div>
      </div>

      <div class="desktop-kpi-card">
        <div class="desktop-kpi-header">
          <span>我的總代墊</span>
          <span class="desktop-kpi-icon">👑</span>
        </div>
        <div class="desktop-kpi-val">${currencySymbol}${formatAmt(myTotalPaid)}</div>
        <div class="desktop-kpi-sub">${totalGroupSpend > 0 ? `佔全團約 ${Math.round((myTotalPaid / totalGroupSpend) * 100)}%` : '尚未有代墊紀錄'}</div>
      </div>

      <div class="desktop-kpi-card">
        <div class="desktop-kpi-header">
          <span>我的淨餘額</span>
          <span class="desktop-kpi-icon">⚖️</span>
        </div>
        <div class="desktop-kpi-val ${netCls}">${netSign}${currencySymbol}${formatAmt(myNetBalance)}</div>
        <div class="desktop-kpi-sub">${myNetBalance > 0.05 ? '🎉 處於應收回款狀態' : myNetBalance < -0.05 ? '💸 需分攤給其他人' : '✨ 目前已結清'}</div>
      </div>

      <div class="desktop-kpi-card">
        <div class="desktop-kpi-header">
          <span>待結清筆數</span>
          <span class="desktop-kpi-icon">👥</span>
        </div>
        <div class="desktop-kpi-val">${unsettledCount} 筆</div>
        <div class="desktop-kpi-sub">建議還款路徑數</div>
      </div>
    </div>
  `;
}
window.renderDesktopKpiStrip = renderDesktopKpiStrip;

// ============================================================
// 🔍 電腦版專屬：滑鼠懸停透視卡片 (Desktop Hover Inspector)
// ============================================================
function initDesktopHoverInspector(){
  if(window.innerWidth < 9999) return;
  let inspector = document.getElementById("sbDesktopHoverInspector");
  if(!inspector){
    inspector = document.createElement("div");
    inspector.id = "sbDesktopHoverInspector";
    inspector.className = "desktop-hover-inspector hidden";
    document.body.appendChild(inspector);
  }

  document.addEventListener("mousemove", (e) => {
    if(!inspector.classList.contains("show")) return;
    const offset = 16;
    let x = e.clientX + offset;
    let y = e.clientY + offset;
    const rect = inspector.getBoundingClientRect();
    if(x + rect.width > window.innerWidth) x = e.clientX - rect.width - offset;
    if(y + rect.height > window.innerHeight) y = e.clientY - rect.height - offset;
    inspector.style.left = x + "px";
    inspector.style.top = y + "px";
  });

  document.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".matrix-cell.has-debt, .matrix-cell.matrix-cell-settled");
    if(!cell) return;
    const title = cell.getAttribute("title") || "";
    if(!title) return;
    inspector.innerHTML = `<div class="desktop-hover-inspector-title">往來明細</div><div class="desktop-hover-inspector-row">${title}</div>`;
    inspector.classList.remove("hidden");
    inspector.classList.add("show");
  });

  document.addEventListener("mouseout", (e) => {
    const cell = e.target.closest(".matrix-cell.has-debt, .matrix-cell.matrix-cell-settled");
    if(!cell) return;
    inspector.classList.remove("show");
    inspector.classList.add("hidden");
  });
}
window.initDesktopHoverInspector = initDesktopHoverInspector;


