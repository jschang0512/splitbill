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
    // 核心動作與餐別
    "吃", "吃飯", "吃肉", "用餐", "料理", "食堂", "餐廳", "小吃", "便當", "早午餐", "早餐", "午餐", "晚餐", "宵夜", "晚飯", "早點", "外送", "外帶", "熱炒", "快炒", "合菜", "桌菜", "辦桌", "美食", "宴席",
    // 料理品類 (台港中日韓西)
    "拉麵", "沾麵", "蕎麥麵", "烏龍麵", "意麵", "米粉", "冬粉", "粄條", "刀削麵", "涼麵", "牛肉麵", "湯麵", "乾麵", "炒麵", "炒飯", "丼", "丼飯", "壽司", "生魚片", "刺身", "握壽司", "燒肉", "烤肉", "牛排", "排餐", "鐵板燒", "火鍋", "麻辣鍋", "涮涮鍋", "壽喜燒", "羊肉爐", "薑母鴨", "鍋物", "披薩", "比薩", "漢堡", "潛艇堡", "炸雞", "鹹酥雞", "鹽酥雞", "雞排", "水餃", "煎餃", "鍋貼", "蒸餃", "小籠包", "湯包", "燒餅", "油條", "蛋餅", "飯糰", "割包", "刈包", "臭豆腐", "蚵仔煎", "麵線", "肉圓", "碗粿", "甜不辣", "關東煮", "滷味", "燒臘", "叉燒", "油雞", "燒鴨", "燒鵝", "飲茶", "港點", "茶餐廳", "雲吞", "餛飩", "抄手", "腸粉", "蘿蔔糕", "泰式", "越式", "韓式", "日式", "義式", "法式", "美式", "印度", "咖哩", "咖喱", "串燒", "串炸", "炸豬排", "部隊鍋", "辣炒年糕", "石鍋拌飯", "蔘雞湯", "炸醬麵", "海南雞", "肉骨茶", "叻沙", "冬蔭功", "河粉", "春捲",
    // 品牌與日文
    "鼎泰豐", "點水樓", "八方雲集", "鬍鬚張", "三商巧福", "麥當勞", "肯德基", "摩斯", "漢堡王", "頂呱呱", "拿坡里", "達美樂", "必勝客", "胖老爹", "王品", "西堤", "陶板屋", "原燒", "瓦城", "饗食", "饗饗", "旭集", "一蘭", "一風堂", "天下一品", "すき家", "sukiya", "松屋", "matsuya", "吉野家", "yoshinoya", "くら寿司", "kura", "スシロー", "sushiro", "はま寿司", "叙々苑", "鳥貴族", "磯丸水産", "餃子の王将", "大戸屋", "やよい軒", "かつや", "ラーメン", "らーめん", "つけ麺", "うどん", "そば", "蕎麦", "焼肉", "居酒屋", "定食", "とんかつ", "豚カツ", "天ぷら", "寿司", "すし", "鮨", "刺身", "しゃぶしゃぶ", "すき焼き", "おでん", "餃子", "お好み焼き", "たこ焼き", "弁当", "おにぎり", "kyochon", "bb.q", "bhc",
    // 英文與國際
    "restaurant", "dining", "lunch", "dinner", "breakfast", "brunch", "supper", "meal", "food", "eatery", "bistro", "trattoria", "steakhouse", "diner", "buffet", "takeout", "delivery", "ubereats", "foodpanda", "doordash", "pizza", "pasta", "spaghetti", "lasagna", "risotto", "burger", "steak", "bbq", "barbecue", "grill", "taco", "burrito", "sushi", "sashimi", "poke", "ramen", "noodle", "noodles", "pho", "banh mi", "pad thai", "tom yum", "curry", "satay", "laksa", "dim sum", "dumpling", "gyoza", "paella", "sandwich", "bagel", "salad", "soup", "mcdonald", "mcdonalds", "kfc", "burger king", "subway", "chipotle", "shake shack", "five guys", "dominos", "pizza hut", "nandos"
  ],

  // 2. 飲料甜點
  drink: [
    // 茶與咖啡
    "咖啡", "拿鐵", "美式", "卡布奇諾", "卡布", "義式濃縮", "摩卡", "焦糖瑪奇朵", "瑪奇朵", "冷萃", "手沖", "奶茶", "紅茶", "綠茶", "青茶", "烏龍茶", "普洱茶", "鐵觀音", "抹茶", "焙茶", "玄米茶", "冬瓜茶", "花茶", "果茶", "水果茶", "冰沙", "果汁", "手搖", "手搖飲", "手搖杯", "飲料", "珍奶", "珍珠奶茶", "波霸", "椰果", "仙草", "愛玉", "豆花", "豆漿",
    // 甜品與冰品
    "剉冰", "刨冰", "雪花冰", "冰淇淋", "霜淇淋", "冰棒", "冰品", "甜點", "甜品", "蛋糕", "鬆餅", "舒芙蕾", "可麗餅", "泡芙", "水果塔", "派", "甜甜圈", "馬卡龍", "司康", "肉桂捲", "提拉米蘇", "奶酪", "布丁", "蛋塔", "可頌", "烘焙",
    // 酒類與酒吧
    "酒", "啤酒", "生啤", "精釀啤酒", "調酒", "雞尾酒", "威士忌", "白蘭地", "琴酒", "伏特加", "蘭姆酒", "龍舌蘭", "清酒", "燒酎", "梅酒", "柚子酒", "葡萄酒", "紅酒", "白酒", "香檳", "氣泡酒", "沙瓦", "角嗨", "highball", "酒吧", "餐酒館", "夜店", "pub", "bar",
    // 品牌與日文
    "星巴克", "路易莎", "cama", "伯朗", "麻古", "迷客夏", "50嵐", "五十嵐", "可不可", "清心", "歇腳亭", "一芳", "珍煮丹", "龜記", "萬波", "得正", "先喝道", "五桐號", "再睡5分鐘", "春水堂", "カフェ", "コーヒー", "珈琲", "ラテ", "お茶", "まっちゃ", "スイーツ", "デザート", "ケーキ", "パフェ", "プリン", "クレープ", "パンケーキ", "ドーナツ", "ソフトクリーム", "アイス", "かき氷", "和菓子", "大福", "団子", "ビール", "生ビール", "ハイボール", "サワー", "チューハイ", "日本酒", "焼酎", "ワイン", "シャンパン", "カクテル", "ウィスキー", "バー", "starbucks", "blue bottle", "ドトール", "dottor", "コメダ", "komeda", "タリーズ", "tully", "サンマルク", "猿田彦",
    // 英文與國際
    "cafe", "coffee", "espresso", "latte", "cappuccino", "macchiato", "mocha", "americano", "cold brew", "pour over", "tea", "chai", "matcha", "boba", "bubble tea", "milk tea", "juice", "smoothie", "beverage", "ice cream", "gelato", "sorbet", "pastry", "cake", "cupcake", "scone", "croissant", "donut", "doughnut", "waffle", "pancake", "pudding", "tiramisu", "macaron", "chocolate", "brewery", "taproom", "beer", "ale", "lager", "ipa", "stout", "wine", "champagne", "cocktail", "liquor", "spirits", "whiskey", "whisky", "gin", "vodka", "rum", "tequila", "sake", "soju", "lounge", "dunkin", "tim hortons"
  ],

  // 3. 大眾交通
  transit: [
    "捷運", "地鐵", "地鐵站", "火車", "鐵路", "台鐵", "臺鐵", "高鐵", "新幹線", "特急", "急行", "快速", "普通車", "電車", "車票", "車資", "票價", "乘車券", "交通卡", "悠遊卡", "一卡通", "ic卡", "儲值", "公車", "巴士", "客運", "渡輪", "輪渡", "船票", "遊船", "纜車", "索道", "輕軌", "路面電車", "港鐵", "mtr", "八達通", "地鐵一日券", "周遊券", "jr pass", "jr", "suica", "西瓜卡", "pasmo", "icoca", "pitapa", "kitaca", "toica", "manaca", "sugoca", "nimoca", "新幹線", "しんかんせん", "地下鉄", "メトロ", "切符", "きっぷ", "運賃", "定期券", "バス", "都バス", "高速バス", "夜行バス", "フェリー", "ロープウェイ", "ケーブルカー", "モノレール", "transit", "transportation", "metro", "subway", "underground", "tube", "train", "railway", "railroad", "amtrak", "eurostar", "tgv", "ice", "thalys", "renfe", "frecciarossa", "sbb", "obb", "sncf", "db", "ticket", "fare", "pass", "travelcard", "oyster", "smartrip", "clipper", "octopus", "ez-link", "t-money", "bus", "coach", "shuttle", "tram", "streetcar", "trolley", "ferry", "boat", "cable car", "ropeway", "gondola", "funicular", "monorail"
  ],

  // 4. 租車用油 / 計程車
  car: [
    "租車", "租賃車", "借車", "油錢", "加油", "加油站", "汽油", "柴油", "92", "95", "98", "計程車", "小黃", "的士", "打車", "叫車", "拼車", "專車", "包車", "代駕", "停車", "停車場", "停車費", "車庫", "過路費", "高速公路", "國道", "收費站", "通行費", "罰單", "etc", "e-tag", "洗車", "レンタカー", "カーシェア", "タイムズ", "times", "タクシー", "ガソリン", "給油", "レギュラー", "ハイオク", "軽油", "駐車場", "パーキング", "コインパーキング", "駐車代", "高速代", "有料道路", "rental car", "car rental", "rent a car", "car hire", "car sharing", "taxi", "cab", "rideshare", "uber", "lyft", "grab", "bolt", "didi", "ola", "gojek", "driver", "gas", "gasoline", "petrol", "diesel", "fuel", "gas station", "parking", "parking lot", "garage", "valet", "toll", "highway", "expressway", "ezpass", "hertz", "avis", "enterprise", "budget", "sixt", "europcar", "toyota rent", "nissan rent", "nippon rent", "orix", "times car"
  ],

  // 5. 機票航班
  flight: [
    "機票", "飛機", "航班", "航空", "機場", "航廈", "登機", "機位", "托運", "行李托運", "貴賓室", "長榮", "長榮航空", "華航", "中華航空", "星宇", "星宇航空", "虎航", "台灣虎航", "國泰", "國泰航空", "酷航", "樂桃", "捷星", "亞洲航空", "越捷", "全日空", "日航", "日本航空", "飛行機", "航空券", "フライト", "空港", "成田", "羽田", "関空", "jal", "ana", "peach", "ピーチ", "ジェットスター", "スカイマーク", "flight", "fly", "air", "airplane", "plane", "airline", "airlines", "airport", "airfare", "air ticket", "boarding", "terminal", "baggage", "luggage", "lounge", "eva air", "china airlines", "starlux", "tigerair", "cathay pacific", "singapore airlines", "emirates", "qatar", "delta", "united", "american airlines", "lufthansa", "air france", "klm", "british airways", "airasia", "scoot", "vietjet"
  ],

  // 6. 住宿溫泉
  hotel: [
    "飯店", "旅館", "民宿", "青年旅館", "青旅", "渡假村", "渡假酒店", "溫泉", "溫泉旅館", "湯屋", "湯宿", "住宿", "訂房", "房費", "房租", "押金", "露營", "營地", "帳篷", "膠囊旅館", "商務旅館", "汽車旅館", "摩鐵", "客棧", "ホテル", "旅館", "りょかん", "宿", "やど", "温泉", "おんせん", "露天風呂", "銭湯", "民宿", "ペンション", "カプセルホテル", "ゲストハウス", "民泊", "アパホテル", "apa", "東横イン", "toyoko", "ドーミーイン", "dormy", "スーパーホテル", "ルートイン", "東急ステイ", "ダイワロイネット", "リッチモンド", "星野", "hoshino", "界", "リゾナーレ", "三井ガーデン", "プリンスホテル", "hotel", "hostel", "resort", "inn", "motel", "lodge", "lodging", "stay", "accommodation", "booking", "reservation", "room", "suite", "villa", "chalet", "cabin", "airbnb", "vrbo", "agoda", "expedia", "hotels.com", "trip.com", "hilton", "marriott", "hyatt", "ihg", "sheraton", "westin", "ritz carlton", "four seasons", "intercontinental", "novotel", "ibis", "best western", "holiday inn", "radisson", "b&b", "guesthouse", "capsule", "camping", "campsite", "glamping", "ryokan", "onsen"
  ],

  // 7. 門票娛樂景點
  ticket: [
    "門票", "入場券", "參觀券", "票券", "預約券", "快速通關", "express pass", "fastpass", "環球", "環球影城", "迪士尼", "迪士尼樂園", "迪士尼海洋", "水族館", "動物園", "植物園", "博物館", "美術館", "科學館", "展覽", "特展", "樂園", "遊樂園", "主題樂園", "摩天輪", "觀景台", "展望台", "塔", "晴空塔", "巴黎鐵塔", "劇院", "劇場", "百老匯", "歌劇", "音樂劇", "電影", "影城", "戲院", "演唱會", "音樂會", "live", "祭典", "煙火", "煙火大會", "花火", "體驗", "和服", "浴衣", "滑雪", "滑雪場", "雪票", "纜車票", "租雪具", "潛水", "浮潛", "衝浪", "跳傘", "高空彈跳", "熱氣球", "泛舟", "賽車", "卡丁車", "密室逃脫", "保齡球", "ktv", "唱歌", "溫泉券", "泡湯券", "神社", "寺廟", "御守", "拝觀", "參拜", "klook", "kkday", "tripadvisor", "チケット", "入場券", "拝観料", "ディズニー", "ユニバ", "usj", "ジブリ", "ハリーポッター", "チームラボ", "teamlab", "展望台", "スカイツリー", "東京タワー", "通天閣", "観覧車", "映画", "シネマ", "劇場", "舞台", "ライブ", "コンサート", "祭り", "花火大会", "スキー", "スノーボード", "リフト券", "着物", "浴衣", "神社", "お寺", "御朱印", "ticket", "tickets", "admission", "entry", "entrance", "pass", "tour", "guided tour", "excursion", "sightseeing", "attraction", "universal studios", "universal", "disney", "disneyland", "disneyworld", "disneysea", "ghibli", "museum", "gallery", "louvre", "aquarium", "zoo", "safari", "theme park", "amusement park", "observation deck", "observatory", "tower", "eiffel", "skytree", "show", "broadway", "musical", "opera", "theatre", "theater", "concert", "gig", "festival", "cinema", "movie", "exhibition", "expo", "ski", "skiing", "snowboard", "snowboarding", "lift ticket", "ski pass", "scuba", "dive", "diving", "snorkeling", "surf", "skydiving", "bungee", "kart", "escape room", "bowling", "karaoke", "getyourguide", "viator"
  ],

  // 8. 購物藥妝超商伴手禮
  shopping: [
    "超市", "大賣場", "超商", "便利商店", "雜貨", "藥妝", "藥局", "藥品", "美妝", "保養品", "唐吉", "唐吉訶德", "驚安", "全家", "7-11", "711", "小七", "萊爾富", "ok超商", "伴手禮", "土產", "紀念品", "禮物", "手信", "特產", "名產", "購物", "採購", "買", "百貨", "百貨公司", "商場", "購物中心", "outlet", "逛街", "市集", "夜市", "跳蚤市場", "服飾", "服裝", "衣服", "褲子", "裙子", "外套", "鞋子", "包包", "配件", "飾品", "手錶", "眼鏡", "墨鏡", "電器", "家電", "3c", "相機", "鏡頭", "手機", "平板", "筆電", "吹風機", "保溫杯", "玩具", "模型", "公仔", "動漫", "扭蛋", "盲盒", "漫畫", "書", "文具", "免稅", "退稅", "duty free", "tax free", "屈臣氏", "康是美", "寶雅", "日藥本舖", "松本清", "札幌藥妝", "驚安殿堂", "無印良品", "大創", "宜得利", "家樂福", "大潤發", "愛買", "全聯", "美廉社", "好市多", "costco", "昇恆昌", "ショッピング", "買い物", "お土産", "おみやげ", "土產", "名物", "銘菓", "薬局", "ドラッグストア", "マツモトキヨシ", "マツキヨ", "サンドラッグ", "スギ薬局", "ツルハ", "ココカラファイン", "ドンキ", "ドンキホーテ", "ビックカメラ", "ヨドバシカメラ", "ヤマダ電機", "エディオン", "ソフマップ", "アニメイト", "まんだらけ", "ユニクロ", "ジーユー", "gu", "無印良品", "muji", "ロフト", "loft", "東急ハンズ", "ハンズ", "ダイソー", "セリア", "キャンドゥ", "イオン", "aeon", "イトーヨーカドー", "ライフ", "西友", "成城石井", "デパ地下", "百貨店", "高島屋", "三越", "伊勢丹", "松坂屋", "大丸", "そごう", "西武", "阪急", "阪神", "近鉄", "マルイ", "パルコ", "parco", "ルミネ", "lumine", "アトレ", "ららぽーと", "アウトレット", "免税", "shop", "shopping", "store", "boutique", "mall", "outlet", "market", "bazaar", "supermarket", "grocery", "groceries", "bodega", "convenience store", "souvenir", "souvenirs", "gift", "gifts", "duty free", "target", "walmart", "costco", "carrefour", "whole foods", "trader joe", "trader joes", "woolworths", "coles", "sainsbury", "tesco", "aldi", "lidl", "coop", "boots", "watsons", "sephora", "apple store", "best buy", "zara", "h&m", "uniqlo", "gu", "gap", "mango", "asos", "nike", "adidas", "puma", "lululemon", "decathlon", "ikea", "nitori", "daiso", "muji", "big c", "emart", "lotte mart"
  ],

  // 9. 醫療藥品
  medical: [
    "藥", "醫", "診所", "醫院", "急診", "看診", "門診", "醫生", "牙醫", "眼科", "健保", "醫療", "醫療費", "醫藥費", "藥品", "感冒藥", "胃藥", "止痛藥", "腸胃藥", "頭痛藥", "暈車藥", "貼布", "痠痛貼布", "眼藥水", "繃帶", "紗布", "酒精", "體溫計", "口罩", "處方", "健檢", "疫苗", "保險", "旅遊平安險", "旅平險", "醫療險", "海外突發", "病院", "クリニック", "医院", "診療所", "救急", "歯医者", "薬", "くすり", "処方箋", "風邪薬", "胃腸薬", "痛み止め", "頭痛薬", "酔い止め", "目薬", "湿布", "バンドエイド", "保険", "海外旅行保険", "hospital", "clinic", "urgent care", "emergency", "er", "doctor", "physician", "dentist", "pharmacy", "drugstore", "chemist", "medicine", "medication", "pill", "pills", "prescription", "rx", "painkiller", "aspirin", "ibuprofen", "tylenol", "bandaid", "bandage", "insurance", "travel insurance", "medical expense"
  ],

  // 10. 網卡通訊
  network: [
    "網卡", "網路", "通訊", "漫遊", "電信", "esim", "sim", "sim卡", "實體卡", "流量", "流量包", "吃到飽", "上網", "上網卡", "wifi", "wi-fi", "wifi機", "路由器", "租wifi", "中華電信", "遠傳", "台灣大哥大", "台哥大", "simカード", "ネット", "通信", "ローミング", "ポケットwifi", "wi-fiレンタル", "docomo", "ドコモ", "softbank", "ソフトバンク", "au", "楽天モバイル", "rakuten", "uqモバイル", "ymobile", "ahamo", "povo", "linemo", "sim", "esim", "sim card", "wifi", "wi-fi", "mobile wifi", "pocket wifi", "data", "mobile data", "roaming", "data roaming", "gigabyte", "gb", "unlimited data", "telecom", "network", "broadband", "ais", "true", "dtac", "singtel", "starhub", "m1", "kt", "skt", "lgu+", "docomo", "softbank", "vodafone", "o2", "ee", "three", "orange", "t-mobile", "verizon", "at&t", "mint", "airalo", "holafly", "nomad"
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

function getCategoryMeta(desc, note){
  const fullRaw = String(desc || "") + " " + String(note || "");

  // 1. 優先檢查顯式自訂類別標籤 (例如 <!--CAT:food--> 或 [cat:food])
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

function getCategoryIcon(desc){
  return getCategoryMeta(desc).icon;
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

window.getCategoryIcon = getCategoryIcon;
window.getCategoryMeta = getCategoryMeta;
window.getAvatarColor = getAvatarColor;
window.renderAvatarHTML = renderAvatarHTML;

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
          const meta = window.getCategoryMeta ? window.getCategoryMeta(e.description, e.note) : { type: "general" };
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
          const meta = window.getCategoryMeta ? window.getCategoryMeta(e.description, e.note) : { type: "general" };
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


