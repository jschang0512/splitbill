// ============================================================
// AI 拍照拆單子系統（ES module）
// 從 app.js 抽出來獨立成一支檔案。對外匯出 setupAiReceiptModal(deps) 與
// fetchSystemGeminiApiKey(sb)，deps 是明確傳進來的依賴物件：
//   - deps.sb、deps.CURRENCY、deps.CURRENCY_SYMBOL、deps.CURRENCIES、
//     deps.showLeftMembers、deps.refreshExpenses、deps.emailToName、
//     deps.getFirstLineDesc、deps.formatTime、deps.formatAmt
//     這些在 app.js 那邊的生命週期內不會被重新賦值，傳一次靜態值就好。
//   - deps.myMember/deps.MEMBERS/deps.memberById 這三個在 app.js 裡是會
//     隨時被重新賦值的 let 變數（例如切換群組、成員異動），改成一律透過
//     deps.getState() 在真正要用的當下才讀最新值，不是傳建立當下的快照，
//     不然使用者實際點開/操作 AI 拆單看板時，看到的可能是登入那一刻的
//     舊資料。deps.getState() 回傳 { myMember, MEMBERS, memberById }。
// escapeHtml/enhanceSelect/sbAlert/sbConfirm/renderAvatarHTML/
// getCurrencyDecimals/roundToCurrency 是 shared-ui.js/currencies.js 裡
// 用 function 宣告的全域函式，classic script 跟 ES module 都看得到，
// 這裡直接呼叫、不用另外傳。
// 呼叫端在 app.js 裡用 import("./ai-receipt.js") 動態載入。
// ============================================================

  // ==========================================================================
  // AI 聚餐發票/收據拍照自動拆單 (Gemini 1.5 Flash Vision)
  // ==========================================================================
  let isAiReceiptModalInitialized = false;
  let currentReceiptData = null;
  let receiptClaimItems = [];
  let taxSplitMode = "ratio"; // "ratio" | "equal"
  // 裁切完成、送去給 AI 辨識的那張圖（純 base64，不含 data: 前綴），只有
  // 使用者在存檔畫面勾選「保留原圖」時才會真的上傳到 Storage；編輯既有
  // 支出（不是重新拍照）時沒有這張圖可用，此時維持 null，存檔那邊會
  // 自動跳過上傳。
  let currentReceiptImageBase64 = null;

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

  // 舊版這裡會直接從 app_settings 資料表把「系統預設金鑰」讀到前端明碼
  // （甚至還有一段用 anon key 打 REST API 的 fallback），導致任何人不用
  // 登入都能把金鑰撈走。金鑰已改成只存在 Edge Function（見
  // supabase/functions/gemini-receipt-proxy）的環境變數，前端完全碰不到；
  // 這裡只保留「使用者自己填的個人 Key」這條路徑，沒填的話交給後端代打。
  try { localStorage.removeItem("sb_cached_sys_gemini_key"); } catch(e){}

  function getPersonalGeminiKey(){
    return (localStorage.getItem("splitbill_gemini_api_key") || "").trim();
  }

  async function parseReceiptWithGemini(pureBase64, mimeType = "image/jpeg", apiKey = "", sb){
    const activeKey = (apiKey || "").trim();
    if(!activeKey){
      // 沒有自己填 Key → 呼叫後端 Edge Function 代打，系統金鑰只存在
      // 後端環境變數，這裡永遠拿不到、也不需要拿到。
      if(!sb || !sb.functions){
        throw new Error("請先在「⚙️ 設定」中填寫 Gemini API Key。");
      }
      const { data, error } = await sb.functions.invoke("gemini-receipt-proxy", {
        body: { image: pureBase64, mimeType }
      });
      if(error || !data || data.error){
        throw new Error((data && data.error) || (error && error.message) || "系統預設 AI 額度暫時無法使用，請先在「⚙️ 設定」中填寫自己的 Gemini API Key。");
      }
      return data.data;
    }

    const prompt = `You are an expert multilingual receipt & invoice OCR parsing AI. Analyze the image carefully.
Extract all receipt details and output in STRICT JSON format (no markdown, no backticks, only valid raw JSON):
{
  "storeName": "Natural Traditional Chinese store name with branch, district, station or location if printed on the receipt (e.g. '星巴克 淺草雷門店 (Starbucks)', '唐吉訶德 澀谷本店 (ドン・キホーテ)', '一蘭拉麵 淺草店', '鼎泰豐 101店')",
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
5. NUMBERS: 'price' must be the UNIT price for a single item (NOT the line total). If the receipt only shows a line total and a quantity, divide: price = printed_line_total / qty. 'totalAmount', 'subtotal', 'serviceCharge', 'tax', 'discount' must be clean numbers without symbols.
6. QUANTITY: Read the actual quantity printed on the receipt for each line (look for patterns like 'x3', '×3', '3個', '3個入', a standalone number column, etc.) and put it in 'qty'. Default to 1 only if no quantity is shown or the line is clearly a single unit. Do NOT guess a quantity that wasn't printed.`;

    // 1. 支援 OpenRouter (sk-or-...)
    if(activeKey.startsWith("sk-or-")){
      // 優先試免費模型（:free 後綴，OpenRouter 保證不收費），openrouter/auto
      // 是會依實際路由到的模型正常計費的付費選項，只留在最後當保底
      // fallback（前面免費的都失敗、例如當天免費額度用完時才會用到）。
      const orModels = [
        "google/gemma-4-31b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "openrouter/free",
        "openrouter/auto"
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

  // 使用者在存檔畫面勾選「保留原圖」時才會呼叫：把裁切後送去給 AI 辨識
  // 的同一張圖上傳到 receipts bucket（不公開，只有同群組成員讀得到），
  // 上傳失敗只記 log、不擋主流程——支出本身已經存成功了，原圖只是加分
  // 附件，不該讓這一步的失敗讓使用者誤以為整筆記帳失敗。
  async function uploadReceiptImage(sb, groupId, expenseId, pureBase64){
    try {
      const blob = await (await fetch(`data:image/jpeg;base64,${pureBase64}`)).blob();
      const path = `${groupId}/${expenseId}.jpg`;
      const { error: upErr } = await sb.storage.from("receipts").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if(upErr){ console.error("收據原圖上傳失敗：", upErr); return; }
      const { error: updErr } = await sb.from("expenses").update({ receipt_image_path: path }).eq("id", expenseId);
      if(updErr) console.error("收據原圖路徑寫入失敗：", updErr);
    } catch(e){ console.error("收據原圖上傳異常：", e); }
  }

  export function setupAiReceiptModal(deps){
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
    let selectedReceiptCurrency = deps.CURRENCY;
    let editingAiExpenseId = null;
    let editingAiExpenseOriginal = null;

    function getReceiptSymbol(){
      const c = (deps.CURRENCIES || []).find(item => item.code === selectedReceiptCurrency);
      return (c && c.symbol) || deps.CURRENCY_SYMBOL || "$";
    }

    // 四捨五入到目前選擇幣別的最小法定面額（例如美金到分，臺幣/日幣沒有角分則到整數）
    function roundAmt(v){
      return roundToCurrency(v, selectedReceiptCurrency);
    }

    function getReceiptCurrencyLabel(){
      const c = (deps.CURRENCIES || []).find(item => item.code === selectedReceiptCurrency);
      return (c && c.label) || selectedReceiptCurrency;
    }

    // 只有編輯「當初有勾選保留原圖」的既有支出時才會顯示這顆按鈕。
    // receipts bucket 是不公開的，一定要透過 createSignedUrl() 換一次性
    // 的短效網址才能打開，不能直接組 public URL（會被 RLS 擋掉）。
    function setupViewReceiptImageButton(expense){
      const btn = document.getElementById("aiViewReceiptImgBtn");
      if(!btn) return;
      if(!expense || !expense.receipt_image_path){
        btn.classList.add("hidden");
        btn.onclick = null;
        return;
      }
      btn.classList.remove("hidden");
      btn.onclick = async ()=>{
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "⏳ 載入中…";
        try {
          const { data, error } = await deps.sb.storage.from("receipts").createSignedUrl(expense.receipt_image_path, 300);
          if(error || !data || !data.signedUrl) throw error || new Error("找不到這張收據原圖");
          window.open(data.signedUrl, "_blank", "noopener");
        } catch(err){
          console.error("開啟收據原圖失敗：", err);
          await sbAlert("找不到這張收據原圖，可能已經超過 180 天保留期限被清除了。", "無法開啟");
        } finally {
          btn.disabled = false;
          btn.textContent = originalText;
        }
      };
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
          currencyCode: (expense && expense.currency) || (aiData && aiData.currencyCode) || deps.CURRENCY,
          subtotal: Number(aiData && aiData.subtotal) || Number(expense && expense.amount) || 0,
          serviceCharge: Number(aiData && aiData.serviceCharge) || 0,
          tax: Number(aiData && aiData.tax) || 0,
          discount: Number(aiData && aiData.discount) || 0,
          totalAmount: Number(expense && expense.amount) || 0
        };

        taxSplitMode = (aiData && aiData.taxSplitMode) || "ratio";
        taxType = (aiData && aiData.taxType) || ((aiData && (aiData.serviceCharge || aiData.tax)) ? "exclusive" : "inclusive");
        selectedReceiptCurrency = (expense && expense.currency) || (aiData && aiData.currencyCode) || deps.CURRENCY;
        if(aiReceiptCurrencySelect) aiReceiptCurrencySelect.value = selectedReceiptCurrency;

        receiptClaimItems = ((aiData && aiData.items) || []).map((it, idx) => ({
          id: it.id || ("item_" + idx + "_" + Date.now()),
          name: it.name || `品項 ${idx + 1}`,
          price: Number(it.price) || 0,
          qty: Number(it.qty) || 1,
          claimedMemberIds: Array.isArray(it.claimedMemberIds) ? [...it.claimedMemberIds] : [],
          memberQty: (it.memberQty && typeof it.memberQty === "object") ? { ...it.memberQty } : {},
          qtyMode: !!it.qtyMode
        }));

        if(!receiptClaimItems.length){
          receiptClaimItems.push({
            id: "item_0_" + Date.now(),
            name: currentReceiptData.storeName || "消費總額",
            price: Number(expense && expense.amount) || 0,
            qty: 1,
            claimedMemberIds: (expense && expense.shares) ? expense.shares.map(s => s.member_id) : [],
            memberQty: {},
            qtyMode: false
          });
        }

        if(aiExpenseDate){
          aiExpenseDate.value = (expense && expense.expense_date) || (aiData && aiData.date) || "";
        }
        if(aiExpenseTime){
          aiExpenseTime.value = (aiData && aiData.time) || (expense && deps.formatTime(expense.created_at, expense.expense_date)) || "";
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

        setupViewReceiptImageButton(expense);

        renderClaimBoard();

        const initialCat = (expense && window.getCategoryMeta && window.getCategoryMeta(expense.description, expense.note, expense.category).type) ||
                           (window.getCategoryMeta && window.getCategoryMeta(currentReceiptData.storeName).type) ||
                           "food";
        updateAiCategoryUI(initialCat);

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

    // AI 拆單類別選擇器 (下拉式選單)
    let selectedAiCategory = "food";

    function updateAiCategoryUI(catType){
      selectedAiCategory = catType || "food";
      const select = document.getElementById("aiCategorySelect");
      if(select){
        select.value = selectedAiCategory;
        if(typeof enhanceSelect === "function") enhanceSelect(select);
      }
    }

    const aiCategorySelect = document.getElementById("aiCategorySelect");
    if(aiCategorySelect){
      aiCategorySelect.addEventListener("change", ()=>{
        selectedAiCategory = aiCategorySelect.value || "food";
      });
    }

    if(storeInputEl){
      storeInputEl.addEventListener("input", ()=>{
        const meta = window.getCategoryMeta ? window.getCategoryMeta(storeInputEl.value) : { type: "food" };
        if(meta && meta.type !== "general"){
          updateAiCategoryUI(meta.type);
        }
        // 店名輸入框改了，下面「金額組成明細」預覽裡的「🏪 店家：」那行
        // 也要跟著重畫，不然會停在 AI 剛辨識出來那一刻的舊店名。
        updateCalculationsAndBadges();
      });
    }

    // 初始化幣別選單 (依序呈現：中文幣別 (符號)，例如 日幣 (¥))
    if(aiReceiptCurrencySelect){
      aiReceiptCurrencySelect.innerHTML = (deps.CURRENCIES || []).map(c => `
        <option value="${c.code}" ${c.code === deps.CURRENCY ? 'selected' : ''}>
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
      if(screen === "claim") showAiClaimSubStep(0);
    }

    // ============================================================
    // 📝 品項認領 → 付款人/日期 → 分攤預覽送出：延伸上面 showScreen()
    // 同一套 classList.toggle("hidden", ...) 模式，只是這裡切的是
    // aiReceiptClaimScreen 內部的 3 個子畫面。跟「新增支出」表單的
    // createFormWizard() 是刻意分開的兩套邏輯（見計畫文件）。
    // ============================================================
    const aiClaimSubStepLabels = ["品項認領","付款人/日期","分攤預覽送出"];
    let aiClaimSubStepIndex = 0;

    function getUnclaimedItemsCount(){
      return receiptClaimItems.filter(it => it.qtyMode
        ? !Object.values(it.memberQty || {}).some(v => (Number(v) || 0) > 0)
        : it.claimedMemberIds.length === 0).length;
    }

    function validateAiPayers(finalTotal){
      const curSym = getReceiptSymbol();
      if(aiPayerMode === "single"){
        const payerId = aiPaidBySingle ? aiPaidBySingle.value : (deps.getState().myMember && deps.getState().myMember.id);
        if(!payerId) return { ok:false, message:"請選擇付款人！" };
        return { ok:true, payers: [{ member_id: payerId, amount: finalTotal }] };
      }
      const payers = [];
      if(aiPayerMultiList){
        aiPayerMultiList.querySelectorAll(".ai-multi-payer-input").forEach(inp => {
          const amt = Number(inp.value) || 0;
          if(amt > 0) payers.push({ member_id: inp.dataset.id, amount: amt });
        });
      }
      if(!payers.length) return { ok:false, message:"多人付款模式下至少需有一人輸入付款金額！" };
      const payerSum = payers.reduce((acc, p) => acc + p.amount, 0);
      if(Math.abs(payerSum - finalTotal) >= 0.5){
        return { ok:false, message:`付款人總額 (${curSym}${deps.formatAmt(payerSum)}) 與支出總額 (${curSym}${deps.formatAmt(finalTotal)}) 不符，請調整！` };
      }
      return { ok:true, payers };
    }

    function updateAiClaimWizardChrome(index){
      document.querySelectorAll("#aiClaimWizardDots .form-wizard-dot").forEach((dot, i)=>{
        dot.classList.toggle("active", i === index);
        dot.classList.toggle("done", i < index);
      });
      const titleEl = document.getElementById("aiClaimWizardStepTitle");
      if(titleEl) titleEl.textContent = `步驟 ${index+1} / 3・${aiClaimSubStepLabels[index]}`;
      const backBtn = document.getElementById("aiClaimWizardBackBtn");
      if(backBtn) backBtn.classList.toggle("hidden", index === 0);
      const nextBtn = document.getElementById("aiClaimWizardNextBtn");
      if(nextBtn) nextBtn.classList.toggle("hidden", index === aiClaimSubStepLabels.length - 1);
    }

    function showAiClaimSubStep(index){
      if(index < 0 || index > 2) return;
      aiClaimSubStepIndex = index;
      const step1 = document.getElementById("aiClaimSubStep1");
      const step2 = document.getElementById("aiClaimSubStep2");
      const step3 = document.getElementById("aiClaimSubStep3");
      if(step1) step1.classList.toggle("hidden", index !== 0);
      if(step2) step2.classList.toggle("hidden", index !== 1);
      if(step3) step3.classList.toggle("hidden", index !== 2);
      updateAiClaimWizardChrome(index);
    }

    function goAiClaimNext(){
      const msgTarget = document.getElementById("aiClaimWizardMsg");
      if(aiClaimSubStepIndex === 0){
        const unclaimedCount = getUnclaimedItemsCount();
        if(unclaimedCount > 0){
          if(msgTarget){ msgTarget.textContent = `還有 ${unclaimedCount} 個品項尚未認領，請先完成所有品項的分攤認領`; msgTarget.className = "msg error"; }
          return;
        }
      } else if(aiClaimSubStepIndex === 1){
        const { subtotal, netExtraFees } = calculateMemberTotals();
        const calculatedTotal = taxType === "inclusive" ? roundAmt(subtotal - (Number(currentReceiptData && currentReceiptData.discount) || 0)) : roundAmt(subtotal + netExtraFees);
        const finalTotal = currentReceiptData && currentReceiptData.totalAmount ? Number(currentReceiptData.totalAmount) : calculatedTotal;
        const result = validateAiPayers(finalTotal);
        if(!result.ok){
          if(msgTarget){ msgTarget.textContent = result.message; msgTarget.className = "msg error"; }
          return;
        }
      }
      if(msgTarget){ msgTarget.textContent = ""; msgTarget.className = "msg"; }
      showAiClaimSubStep(Math.min(aiClaimSubStepIndex + 1, 2));
    }

    function goAiClaimBack(){
      showAiClaimSubStep(Math.max(aiClaimSubStepIndex - 1, 0));
    }

    let aiProgressInterval = null;
    let currentAiPercent = 0;

    function updateAiProgress(percent, phaseText){
      const fillEl = document.getElementById("aiProgressBarFill");
      const numEl = document.getElementById("aiProgressPercent");
      const phaseEl = document.getElementById("aiProgressPhase");

      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      if(fillEl) fillEl.style.width = `${clamped}%`;
      if(numEl) numEl.textContent = `${clamped}%`;
      if(phaseEl && phaseText) phaseEl.textContent = phaseText;
    }

    function startAiProgress(){
      stopAiProgress();
      currentAiPercent = 8;
      updateAiProgress(currentAiPercent, "照片影像前處理與旋轉校正…");

      const startTime = Date.now();
      aiProgressInterval = setInterval(()=>{
        const elapsed = Date.now() - startTime;
        let target = 8;
        let phaseText = "AI 智慧解析中…";

        if(elapsed < 500){
          target = 8 + Math.floor((elapsed / 500) * 20); // 8% -> 28%
          phaseText = "照片影像最佳化與壓縮…";
        } else if(elapsed < 1800){
          target = 28 + Math.floor(((elapsed - 500) / 1300) * 32); // 28% -> 60%
          phaseText = "傳送至 AI 多模態視覺模型…";
        } else if(elapsed < 4500){
          target = 60 + Math.floor(((elapsed - 1800) / 2700) * 28); // 60% -> 88%
          phaseText = "智慧掃描品項、數量、單價與稅率…";
        } else {
          target = Math.min(97, 88 + Math.floor(((elapsed - 4500) / 3500) * 9)); // 88% -> 97%
          phaseText = "結構化校驗與幣別運算中…";
        }

        if(target > currentAiPercent){
          currentAiPercent = target;
          updateAiProgress(currentAiPercent, phaseText);
        }
      }, 70);
    }

    function finishAiProgress(){
      if(aiProgressInterval){
        clearInterval(aiProgressInterval);
        aiProgressInterval = null;
      }
      currentAiPercent = 100;
      updateAiProgress(100, "解析完成！即將進入拆單…");
    }

    function stopAiProgress(){
      if(aiProgressInterval){
        clearInterval(aiProgressInterval);
        aiProgressInterval = null;
      }
      currentAiPercent = 0;
      updateAiProgress(0, "準備解析…");
    }

    async function openModal(initialScreen = "upload"){
      showScreen(initialScreen);
      modal.classList.add("show");
    }

    function closeModal(){
      modal.classList.remove("show");
      stopAiProgress();
      editingAiExpenseId = null;
      editingAiExpenseOriginal = null;
      currentReceiptImageBase64 = null;
      const keepImageChk = document.getElementById("aiReceiptKeepImageChk");
      if(keepImageChk) keepImageChk.checked = false;
      setupViewReceiptImageButton(null);
      if(aiDirectSaveBtn) aiDirectSaveBtn.textContent = "💾 確認無誤，立即記帳";
    }

    // 點擊頂部「📷 照片自動拆單」按鈕，開啟選擇面板
    openBtn.addEventListener("click", ()=>{
      openModal("upload");
    });

    if(closeBtn) closeBtn.addEventListener("click", closeModal);

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
        const key = getPersonalGeminiKey();
        showScreen("loading");
        startAiProgress();

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
          currentReceiptImageBase64 = pureBase64;

          const parsed = await parseReceiptWithGemini(pureBase64, "image/jpeg", key, deps.sb);

          // 品質檢查：AI 沒有丟出例外不代表真的辨識到東西——照片太模糊、
          // 拍到跟收據無關的畫面時，常常會回傳「有結構但是空的」JSON
          // （items 是空陣列、totalAmount 是 0），過去這種情況會被當成
          // 辨識成功、直接把使用者帶進一個空空如也的拆單畫面。這裡明確
          // 判定「完全沒有任何可用的品項或金額」為辨識失敗，回到拍照畫面
          // 讓使用者重拍或改用手動記帳，不要讓他們走進死胡同才發現。
          const hasUsableItems = Array.isArray(parsed.items) && parsed.items.some(it => Number(it.price || it.amount || it.total || 0) > 0);
          const hasUsableTotal = Number(parsed.totalAmount) > 0;
          if(!hasUsableItems && !hasUsableTotal){
            throw new Error("辨識結果是空的，沒有讀到任何品項或金額");
          }

          currentReceiptData = parsed;

          // 自動偵測幣別並切換下拉選單
          const detectedCurCode = (parsed.currencyCode || "").trim().toUpperCase();
          const matchedCur = (deps.CURRENCIES || []).find(c => c.code === detectedCurCode);
          if(matchedCur){
            selectedReceiptCurrency = matchedCur.code;
          } else {
            selectedReceiptCurrency = deps.CURRENCY;
          }
          if(aiReceiptCurrencySelect) aiReceiptCurrencySelect.value = selectedReceiptCurrency;

          // 智慧偵測內含稅 vs 外加稅費：若品項加總已等於總金額，預設切換為內含稅
          // （price 是單價，要乘上數量才是這一行真正的小計，不能直接加總單價）
          const itemsSum = (parsed.items || []).reduce((acc, it) => acc + (Number(it.price || it.amount || it.total || 0) * Number(it.qty || 1)), 0);
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
              claimedMemberIds: [],
              memberQty: {},
              qtyMode: false
            };
          });

          if(!receiptClaimItems.length){
            receiptClaimItems.push({
              id: "item_0_" + Date.now(),
              name: "消費總額",
              price: Number(parsed.totalAmount) || 0,
              qty: 1,
              claimedMemberIds: [],
              memberQty: {},
              qtyMode: false
            });
          }

          const autoCat = window.getCategoryMeta ? window.getCategoryMeta(parsed.storeName || (parsed.items && parsed.items[0]?.name) || "").type : "food";
          updateAiCategoryUI(autoCat);
          renderClaimBoard();
          finishAiProgress();
          await new Promise(r => setTimeout(r, 260));
          showScreen("claim");
        } catch(err){
          stopAiProgress();
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
      const calculatedTotal = roundAmt(subtotal + netExtraFees);
      const finalTotal = currentReceiptData && currentReceiptData.totalAmount ? Number(currentReceiptData.totalAmount) : calculatedTotal;
      const curSym = getReceiptSymbol();

      let sum = 0;
      if(aiPayerMultiList){
        aiPayerMultiList.querySelectorAll(".ai-multi-payer-input").forEach(inp => {
          sum += Number(inp.value) || 0;
        });
      }
      const diff = roundAmt(finalTotal - sum);
      if(Math.abs(diff) < 0.5){
        aiPayerSumCheck.innerHTML = `<span style="color:var(--positive-text);font-weight:700;">✓ 付款金額完全相符 (${curSym}${deps.formatAmt(sum)})</span>`;
      } else if(diff > 0){
        aiPayerSumCheck.innerHTML = `<span style="color:var(--negative-text);font-weight:600;">⚠️ 付款總和還差 ${curSym}${deps.formatAmt(diff)}（目標 ${curSym}${deps.formatAmt(finalTotal)}）</span>`;
      } else {
        aiPayerSumCheck.innerHTML = `<span style="color:var(--negative-text);font-weight:600;">⚠️ 付款總和超過 ${curSym}${deps.formatAmt(Math.abs(diff))}（目標 ${curSym}${deps.formatAmt(finalTotal)}）</span>`;
      }
    }

    function renderClaimBoard(){
      if(!currentReceiptData) return;

      const activeMembers = (deps.getState().MEMBERS || []).filter(m => deps.showLeftMembers || !m.left_at);
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

      // 4. 單人付款下拉選單（保留使用者已選的付款人，只有從未選過時才預設為自己——
      //    這個下拉選單每次認領頁重繪都會整個重建 <option>，如果不記住上次選的值，
      //    使用者選好付款人後只要再動其他設定（勾認領、切稅別…）就會被重繪打回預設值）
      if(aiPaidBySingle){
        const prevPayerId = aiPaidBySingle.value || (deps.getState().myMember && deps.getState().myMember.id) || "";
        aiPaidBySingle.innerHTML = activeMembers.map(m => `
          <option value="${m.id}" ${m.id === prevPayerId ? 'selected' : ''}>
            ${escapeHtml(m.name || deps.emailToName(m.email))}
          </option>
        `).join("");
      }

      // 5. 多人付款清單（同理：保留使用者已輸入的付款金額，不因重繪而被清空）
      if(aiPayerMultiList){
        const prevAmounts = {};
        aiPayerMultiList.querySelectorAll(".ai-multi-payer-input").forEach(inp => {
          prevAmounts[inp.dataset.id] = inp.value;
        });
        aiPayerMultiList.innerHTML = activeMembers.map(m => `
          <div class="ai-payer-multi-row">
            <span style="display:flex;align-items:center;gap:5px;font-size:12.5px;">
              ${renderAvatarHTML(m, "avatar-xs")}
              ${escapeHtml(m.name || deps.emailToName(m.email))}
            </span>
            <div class="ai-receipt-price-wrap" style="width:125px;">
              <span class="ai-receipt-cur-prefix">${curSym}</span>
              <input type="number" class="ai-receipt-item-price ai-multi-payer-input" data-id="${m.id}" placeholder="0" min="0" step="any" value="${prevAmounts[m.id] || ''}">
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
      if(serviceCol) serviceCol.classList.toggle("hidden", taxType === "inclusive");

      // 6. 渲染品項清單（高度一致、平分按鈕置於金額下方、大頭貼不顯示幾分之幾）
      if(itemsListEl){
        itemsListEl.innerHTML = receiptClaimItems.map((item, idx) => {
          const isClaimed = item.qtyMode
            ? Object.values(item.memberQty || {}).some(v => (Number(v) || 0) > 0)
            : item.claimedMemberIds.length > 0;
          const isAllClaimed = activeMembers.length > 0 && activeMembers.every(m => item.claimedMemberIds.includes(m.id));

          // 成員大頭貼氣泡流 (選中後不顯示幾分之幾)
          const memberBubblesHTML = activeMembers.map(m => {
            const hasClaimed = item.claimedMemberIds.includes(m.id);
            return `
              <div class="ai-avatar-bubble ${hasClaimed ? 'active' : ''}" data-item-id="${item.id}" data-member-id="${m.id}" title="${escapeHtml(m.name || deps.emailToName(m.email))}">
                <div class="ai-bubble-avatar-wrap">
                  ${renderAvatarHTML(m, "avatar-xs ai-bubble-avatar")}
                  ${hasClaimed ? '<span class="ai-bubble-check-badge">✓</span>' : ''}
                </div>
                <span class="ai-bubble-name">${escapeHtml(m.name || deps.emailToName(m.email))}</span>
              </div>
            `;
          }).join("");

          // 依數量分配：每個人一格「買了幾個」的輸入框，取代平分用的大頭貼氣泡
          const allocatedQty = Object.values(item.memberQty || {}).reduce((s, v) => s + (Number(v) || 0), 0);
          const qtyRowsHTML = activeMembers.map(m => `
            <div class="ai-qty-member-row">
              <span class="ai-qty-member-label">
                ${renderAvatarHTML(m, "avatar-xs")}
                <span class="ai-bubble-name">${escapeHtml(m.name || deps.emailToName(m.email))}</span>
              </span>
              <input type="number" class="ai-receipt-member-qty" min="0" step="1" placeholder="0"
                value="${item.memberQty && item.memberQty[m.id] ? item.memberQty[m.id] : ''}"
                data-item-id="${item.id}" data-member-id="${m.id}">
            </div>
          `).join("");
          const allocState = allocatedQty === item.qty ? "complete" : allocatedQty > item.qty ? "over" : "under";
          const allocHintText = allocState === "over"
            ? `已分配 ${allocatedQty} / ${item.qty}（超過總數量了）`
            : `已分配 ${allocatedQty} / ${item.qty}`;

          const count = item.claimedMemberIds.length;
          const lineTotal = (Number(item.price) || 0) * (Number(item.qty) || 1);
          const perPersonPrice = count > 1 ? roundAmt(lineTotal / count) : 0;
          let statusBadgeHTML = "";
          if(!isClaimed){
            statusBadgeHTML = `<span class="ai-card-float-badge unclaimed">⚠️ 待認領</span>`;
          } else if(item.qtyMode){
            statusBadgeHTML = `<span class="ai-card-float-badge per-person">已分配 ${allocatedQty} / ${item.qty}</span>`;
          } else if(count > 1){
            statusBadgeHTML = `<span class="ai-card-float-badge per-person" title="${count} 人分攤，每人約 ${curSym}${deps.formatAmt(perPersonPrice)}">每人 ${curSym}${deps.formatAmt(perPersonPrice)}</span>`;
          }

          return `
            <div class="ai-receipt-item-card ${isClaimed ? 'is-claimed' : 'is-unclaimed'}" data-id="${item.id}">
              <!-- 右上角：狀態徽章（待認領／每人¥X／已分配X/Y）+ 刪除鈕，兩者放在
                   同一個角落、保持適當間距，刪除鈕不再跟金額/數量擠同一列。 -->
              <div class="ai-card-top-right">
                ${statusBadgeHTML}
                <button type="button" class="ai-receipt-item-del" data-id="${item.id}" title="刪除此品項" aria-label="刪除">✕</button>
              </div>
              <!-- 品名獨立一整列，不跟金額/數量搶空間——手機版寬度有限，擠在
                   同一列時品名常常只剩窄窄一條，看不清楚買了什麼。 -->
              <div class="ai-item-name-row">
                <span class="ai-item-tag-num">${idx + 1}</span>
                <input type="text" class="ai-receipt-item-name" value="${escapeHtml(item.name || '')}" placeholder="品名 中文翻譯(原文)" data-id="${item.id}">
              </div>
              <!-- 「單價」「個」文字標籤讓 price 欄位的意思很明確是單價，不是
                   這一行的小計，跟前面「279 x3 會被誤會成一共279」的疑慮
                   徹底切開；整列靠右對齊。 -->
              <!-- 「單價」「個」「總計」計算列：單價 × 數量 ＝ 總價，手機版禁止跳行並居中對齊 -->
              <div class="ai-item-price-col">
                <span class="ai-price-label">${taxType === 'inclusive' ? '單價' : '未稅單價'}</span>
                <div class="ai-receipt-price-wrap">
                  <span class="ai-receipt-cur-prefix">${curSym}</span>
                  <input type="number" class="ai-receipt-item-price" value="${item.price}" min="0" step="any" placeholder="0" data-id="${item.id}">
                </div>
                <span class="ai-qty-x-prefix" title="數量">×</span>
                <input type="number" class="ai-receipt-item-qty" value="${item.qty}" min="1" step="1" placeholder="1" title="數量" data-id="${item.id}">
                <span class="ai-qty-unit-label">個</span>
                <span class="ai-item-equal-sign">=</span>
                <div class="ai-item-total-wrap" title="此品項總價">
                  <span class="ai-receipt-cur-prefix">${curSym}</span>
                  <span class="ai-item-line-total" data-id="${item.id}">${deps.formatAmt(lineTotal)}</span>
                </div>
              </div>

              <!-- 下方認領區：平分模式=左邊大頭貼氣泡流／右邊平分按鈕；依數量模式=每人一格輸入買了幾個 -->
              <div class="ai-receipt-claims-row-wrap">
                ${item.qtyMode ? `
                  <div class="ai-qty-alloc-wrap">
                    <div class="ai-qty-member-rows">${qtyRowsHTML}</div>
                    <div class="ai-qty-allocated-hint ${allocState}">${allocHintText}</div>
                  </div>
                  <div class="ai-all-btn-col">
                    <button type="button" class="ai-qty-mode-toggle" data-id="${item.id}">⚡ 改為平分</button>
                  </div>
                ` : `
                  <div class="ai-avatar-bubbles-row">
                    ${memberBubblesHTML}
                  </div>
                  <div class="ai-all-btn-col">
                    <button type="button" class="ai-bubble-all-btn ${isAllClaimed ? 'active' : ''}" data-id="${item.id}">
                      ${isAllClaimed ? '✕ 取消全員' : '⚡ 所有人平分'}
                    </button>
                    ${item.qty > 1 ? `<button type="button" class="ai-qty-mode-toggle" data-id="${item.id}">🔢 依數量分配</button>` : ""}
                  </div>
                `}
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
            if(!it) return;
            it.price = Number(e.target.value) || 0;
            const lineTotal = (Number(it.price) || 0) * (Number(it.qty) || 1);
            const card = e.target.closest(".ai-receipt-item-card");
            if(card){
              const totalEl = card.querySelector(`.ai-item-line-total[data-id="${it.id}"]`);
              if(totalEl) totalEl.textContent = deps.formatAmt(lineTotal);
              
              const count = (it.claimedMemberIds || []).length;
              const perPersonPrice = count > 1 ? roundAmt(lineTotal / count) : 0;
              const badgeEl = card.querySelector(".ai-card-float-badge.per-person");
              if(badgeEl && !it.qtyMode){
                const curSym = getReceiptSymbol();
                badgeEl.textContent = `每人 ${curSym}${deps.formatAmt(perPersonPrice)}`;
              }
            }
            updateCalculationsAndBadges();
          });
        });

        itemsListEl.querySelectorAll(".ai-receipt-item-qty").forEach(inp => {
          inp.addEventListener("input", (e)=>{
            const it = receiptClaimItems.find(x => x.id === e.target.dataset.id);
            if(!it) return;
            const newQty = Math.max(1, Number(e.target.value) || 1);
            it.qty = newQty;
            const lineTotal = (Number(it.price) || 0) * (Number(it.qty) || 1);
            const card = e.target.closest(".ai-receipt-item-card");
            if(card){
              const totalEl = card.querySelector(`.ai-item-line-total[data-id="${it.id}"]`);
              if(totalEl) totalEl.textContent = deps.formatAmt(lineTotal);

              const count = (it.claimedMemberIds || []).length;
              const perPersonPrice = count > 1 ? roundAmt(lineTotal / count) : 0;
              const badgeEl = card.querySelector(".ai-card-float-badge.per-person");
              if(badgeEl && !it.qtyMode){
                const curSym = getReceiptSymbol();
                badgeEl.textContent = `每人 ${curSym}${deps.formatAmt(perPersonPrice)}`;
              }

              // 即時更新「🔢 依數量分配」按鈕：輸入 > 1 立即動態出現第二個按鈕，不用點擊人才跳出
              const btnCol = card.querySelector(".ai-all-btn-col");
              if(btnCol && !it.qtyMode){
                let toggleBtn = btnCol.querySelector(".ai-qty-mode-toggle");
                if(it.qty > 1){
                  if(!toggleBtn){
                    toggleBtn = document.createElement("button");
                    toggleBtn.type = "button";
                    toggleBtn.className = "ai-qty-mode-toggle";
                    toggleBtn.dataset.id = it.id;
                    toggleBtn.textContent = "🔢 依數量分配";
                    toggleBtn.addEventListener("click", ()=>{
                      it.qtyMode = true;
                      renderClaimBoard();
                    });
                    btnCol.appendChild(toggleBtn);
                  }
                } else {
                  if(toggleBtn){
                    toggleBtn.remove();
                  }
                }
              }
            }
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

        // 依數量分配：切換模式的按鈕（平分 ↔ 依數量分配同一顆按鈕，文字依目前模式變化）
        itemsListEl.querySelectorAll(".ai-qty-mode-toggle").forEach(btn => {
          btn.addEventListener("click", ()=>{
            const it = receiptClaimItems.find(x => x.id === btn.dataset.id);
            if(!it) return;
            it.qtyMode = !it.qtyMode;
            renderClaimBoard();
          });
        });

        // 依數量分配：每人輸入買了幾個。這裡故意不整個 renderClaimBoard()
        // 重繪（那樣正在輸入的那個框會失焦、體驗很差），只直接更新這張卡片
        // 裡「已分配 X / 總數量」那行文字跟顏色，其餘（各成員應付總額等）
        // 才透過 updateCalculationsAndBadges() 更新。
        itemsListEl.querySelectorAll(".ai-receipt-member-qty").forEach(inp => {
          inp.addEventListener("input", (e)=>{
            const it = receiptClaimItems.find(x => x.id === e.target.dataset.itemId);
            if(!it) return;
            if(!it.memberQty) it.memberQty = {};
            const memberId = e.target.dataset.memberId;
            const val = Math.max(0, Number(e.target.value) || 0);
            if(val > 0){
              it.memberQty[memberId] = val;
            } else {
              delete it.memberQty[memberId];
            }

            const card = e.target.closest(".ai-receipt-item-card");
            const hintEl = card && card.querySelector(".ai-qty-allocated-hint");
            if(hintEl){
              const allocatedQty = Object.values(it.memberQty || {}).reduce((s, v) => s + (Number(v) || 0), 0);
              const allocState = allocatedQty === it.qty ? "complete" : allocatedQty > it.qty ? "over" : "under";
              hintEl.className = `ai-qty-allocated-hint ${allocState}`;
              hintEl.textContent = allocState === "over"
                ? `已分配 ${allocatedQty} / ${it.qty}（超過總數量了）`
                : `已分配 ${allocatedQty} / ${it.qty}`;
            }
            const isClaimed = Object.values(it.memberQty || {}).some(v => (Number(v) || 0) > 0);
            if(card) card.classList.toggle("is-claimed", isClaimed);
            if(card) card.classList.toggle("is-unclaimed", !isClaimed);

            updateCalculationsAndBadges();
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
      // price 是單價，要乘上 qty 才是這一行的實際小計金額
      const subtotal = receiptClaimItems.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
      const service = Number(currentReceiptData && currentReceiptData.serviceCharge) || 0;
      const tax = Number(currentReceiptData && currentReceiptData.tax) || 0;
      const discount = Number(currentReceiptData && currentReceiptData.discount) || 0;
      const netExtraFees = taxType === "inclusive" ? 0 : ((service + tax) - discount);

      const activeMembers = (deps.getState().MEMBERS || []).filter(m => deps.showLeftMembers || !m.left_at);
      const claimedMemberIdSet = new Set();
      receiptClaimItems.forEach(it => {
        if(it.qtyMode){
          Object.keys(it.memberQty || {}).forEach(id => { if((Number(it.memberQty[id]) || 0) > 0) claimedMemberIdSet.add(id); });
        } else {
          it.claimedMemberIds.forEach(id => claimedMemberIdSet.add(id));
        }
      });

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
        const unitPrice = Number(it.price) || 0;
        if(it.qtyMode){
          // 依數量分配：price 本身就是單價，每個人按自己買的數量直接算錢，不用再除
          Object.keys(it.memberQty || {}).forEach(mId => {
            const myQty = Number(it.memberQty[mId]) || 0;
            if(myQty > 0 && memberCalcMap[mId]){
              memberCalcMap[mId].itemSum += unitPrice * myQty;
              memberCalcMap[mId].formulas.push(`${roundAmt(unitPrice)}×${myQty}`);
            }
          });
        } else {
          // 平分模式：這一行的小計 = 單價 × 數量，再由認領的人平分
          const lineTotal = unitPrice * (Number(it.qty) || 1);
          const count = it.claimedMemberIds.length;
          if(count > 0){
            const sharePrice = lineTotal / count;
            it.claimedMemberIds.forEach(mId => {
              if(memberCalcMap[mId]){
                memberCalcMap[mId].itemSum += sharePrice;
                memberCalcMap[mId].formulas.push(count > 1 ? `${roundAmt(lineTotal)}/${count}` : `${roundAmt(lineTotal)}`);
              }
            });
          }
        }
      });

      const claimingCount = claimedMemberIdSet.size || activeMembers.length;
      activeMembers.forEach(m => {
        const data = memberCalcMap[m.id];
        if(data.itemSum > 0 || claimedMemberIdSet.has(m.id)){
          if(taxType === "inclusive"){
            data.taxShare = 0;
            data.total = roundAmt(data.itemSum);
          } else {
            if(taxSplitMode === "ratio"){
              data.taxShare = subtotal > 0 ? (data.itemSum / subtotal) * netExtraFees : 0;
            } else {
              data.taxShare = claimingCount > 0 ? netExtraFees / claimingCount : 0;
            }
            data.total = roundAmt(data.itemSum + data.taxShare);
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
        lines.push(`💰 總額：${curSym}${deps.formatAmt(finalTotal)} (已內含稅，品項小計 ${curSym}${deps.formatAmt(subtotal)})`);
      } else {
        lines.push(`💰 總額：${curSym}${deps.formatAmt(finalTotal)} (小計 ${curSym}${deps.formatAmt(subtotal)} + 服務費/稅 ${curSym}${deps.formatAmt(netExtraFees)})`);
      }
      lines.push(`\n📋 品項明細：`);
      receiptClaimItems.forEach((it, idx) => {
        const unitPrice = Number(it.price) || 0;
        const qty = Number(it.qty) || 1;
        const lineTotal = unitPrice * qty;
        let claimMembersText;
        if(it.qtyMode){
          const parts = Object.keys(it.memberQty || {})
            .filter(id => (Number(it.memberQty[id]) || 0) > 0)
            .map(id => `${deps.getState().memberById[id] || id}×${it.memberQty[id]} (${curSym}${deps.formatAmt(roundAmt(unitPrice * it.memberQty[id]))})`);
          claimMembersText = parts.length ? parts.join("、") : "無人認領";
        } else {
          const claimNames = it.claimedMemberIds.map(id => deps.getState().memberById[id] || id).join("、");
          const count = it.claimedMemberIds.length;
          const perPerson = count > 1 ? ` (每人 ${curSym}${deps.formatAmt(roundAmt(lineTotal / count))})` : "";
          claimMembersText = claimNames ? `${claimNames}${perPerson}` : "無人認領";
        }

        // 品項金額顯示這一行的小計（單價 × 數量），同時標註單價與數量方便核對（內含稅顯示「單價」，外加稅顯示「未稅單價」）
        const unitPriceLabel = (taxType === "inclusive") ? "單價" : "未稅單價";
        const amountText = `${curSym}${deps.formatAmt(lineTotal)}（${unitPriceLabel} ${curSym}${deps.formatAmt(unitPrice)} × ${qty}）`;

        const numStr = `  ${idx + 1}. `;
        const indent = " ".repeat(numStr.length);

        const rawName = (it.name || "品項").trim();
        const parenMatch = rawName.match(/^(.*?)\s*\(([\s\S]*?)\)$/);
        if(parenMatch && parenMatch[1].trim() && parenMatch[2].trim()){
          const zhName = parenMatch[1].trim();
          const origName = parenMatch[2].trim();
          lines.push(`${numStr}品項: ${zhName}\n${indent}原文: ${origName}\n${indent}價格: ${amountText}\n${indent}分攤: ${claimMembersText}`);
        } else {
          lines.push(`${numStr}品項: ${rawName}\n${indent}價格: ${amountText}\n${indent}分攤: ${claimMembersText}`);
        }
      });
      lines.push(`\n👥 各成員應付金額：`);
      const activeMembers = (deps.getState().MEMBERS || []).filter(m => deps.showLeftMembers || !m.left_at);
      activeMembers.forEach(m => {
        const d = memberCalcMap[m.id];
        if(d && d.total > 0){
          const taxPart = (taxType !== "inclusive" && d.taxShare) ? ` (含服務費 ${curSym}${deps.formatAmt(roundAmt(d.taxShare))})` : "";
          lines.push(`  ・${m.name}：${curSym}${deps.formatAmt(d.total)}${taxPart}`);
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
        lines.push(`💰 總額：${curSym}${deps.formatAmt(finalTotal)} (已內含稅)`);
      } else {
        lines.push(`💰 總額：${curSym}${deps.formatAmt(finalTotal)} (小計 ${curSym}${deps.formatAmt(subtotal)} + 服務費/稅 ${curSym}${deps.formatAmt(netExtraFees)})`);
      }
      lines.push(`\n👥 各成員應付金額：`);
      const activeMembers = (deps.getState().MEMBERS || []).filter(m => deps.showLeftMembers || !m.left_at);
      let count = 0;
      activeMembers.forEach(m => {
        const d = memberCalcMap[m.id];
        if(d && d.total > 0){
          lines.push(`  ・${m.name}：${curSym}${deps.formatAmt(d.total)}`);
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

    function updateCalculationsAndBadges(){
      const { memberCalcMap, subtotal, netExtraFees } = calculateMemberTotals();
      const discount = Number(currentReceiptData && currentReceiptData.discount) || 0;
      const calculatedTotal = taxType === "inclusive" ? roundAmt(subtotal - discount) : roundAmt(subtotal + netExtraFees);
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
      const unclaimedCount = getUnclaimedItemsCount();
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
      if(serviceCol) serviceCol.classList.toggle("hidden", taxType === "inclusive");

      // 更新品項卡片上的「單價」/「未稅單價」文字標籤
      if(itemsListEl){
        const labelText = (taxType === "inclusive") ? "單價" : "未稅單價";
        itemsListEl.querySelectorAll(".ai-price-label").forEach(el => {
          el.textContent = labelText;
        });
      }

      // 檢查 小計 (+ 服務費/稅) 是否等於 總計
      const isTotalMatching = Math.abs(calculatedTotal - finalTotal) < 0.5;
      const mismatchWarningEl = document.getElementById("aiTotalMismatchWarning");
      if(mismatchWarningEl){
        if(!isTotalMatching){
          if(taxType === "inclusive"){
            mismatchWarningEl.innerHTML = `⚠️ 目前為「內含稅」模式：小計 (<b>${curSym}${deps.formatAmt(subtotal)}</b>) 與總計 (<b>${curSym}${deps.formatAmt(finalTotal)}</b>) 不相符。若此發票有額外服務費/稅，請切換為「外加稅費」模式。`;
          } else {
            const diff = roundAmt(finalTotal - calculatedTotal);
            mismatchWarningEl.innerHTML = `⚠️ 目前為「外加稅費」模式：小計 (${curSym}${deps.formatAmt(subtotal)}) ＋ 服務費/稅 (${curSym}${deps.formatAmt(netExtraFees)}) ＝ <b>${curSym}${deps.formatAmt(calculatedTotal)}</b>，與總計 (<b>${curSym}${deps.formatAmt(finalTotal)}</b>) 不相符${diff > 0 ? `（少 ${curSym}${deps.formatAmt(diff)}）` : `（多 ${curSym}${deps.formatAmt(Math.abs(diff))}）`}。若發票已內含稅，可切換為「內含稅」模式。`;
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
        const activeMembers = (deps.getState().MEMBERS || []).filter(m => deps.showLeftMembers || !m.left_at);
        membersGridEl.innerHTML = activeMembers.map(m => {
          const data = memberCalcMap[m.id] || { total: 0 };
          return `
            <div class="ai-receipt-member-badge" data-member-id="${m.id}">
              <div class="ai-receipt-member-left">
                ${renderAvatarHTML(m, "avatar-xs")}
                <span class="ai-receipt-member-name">${escapeHtml(m.name || deps.emailToName(m.email))}</span>
              </div>
              <b class="ai-receipt-member-amt">${curSym}${deps.formatAmt(data.total)}</b>
            </div>
          `;
        }).join("");
      }

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
        const calculatedTotal = taxType === "inclusive" ? roundAmt(subtotal - discount) : roundAmt(subtotal + netExtraFees);
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
        const calculatedTotal = taxType === "inclusive" ? roundAmt(subtotal - discount) : roundAmt(subtotal + netExtraFees);
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
        const newTotal = roundAmt(subtotal - discount);
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

    const aiClaimWizardNextBtn = document.getElementById("aiClaimWizardNextBtn");
    const aiClaimWizardBackBtn = document.getElementById("aiClaimWizardBackBtn");
    if(aiClaimWizardNextBtn) aiClaimWizardNextBtn.addEventListener("click", goAiClaimNext);
    if(aiClaimWizardBackBtn) aiClaimWizardBackBtn.addEventListener("click", goAiClaimBack);

    // 🌟 一鍵直接記帳（無需跳回支出表單）
    if(aiDirectSaveBtn){
      aiDirectSaveBtn.addEventListener("click", async ()=>{
        const rawStore = (storeInputEl && storeInputEl.value.trim()) || (currentReceiptData && currentReceiptData.storeName) || "聚餐收據";
        const storeName = deps.getFirstLineDesc(rawStore).replace(/\(AI自動拆單\)/g, "").trim() || "聚餐收據";
        const { memberCalcMap, subtotal, netExtraFees } = calculateMemberTotals();
        const calculatedTotal = roundAmt(subtotal + netExtraFees);
        const finalTotal = currentReceiptData && currentReceiptData.totalAmount ? Number(currentReceiptData.totalAmount) : calculatedTotal;
        const curSym = getReceiptSymbol();
        const curLabel = getReceiptCurrencyLabel();

        const unclaimedCountAtSave = getUnclaimedItemsCount();
        if(unclaimedCountAtSave > 0){
          await sbAlert(`還有 ${unclaimedCountAtSave} 個品項尚未認領，請點擊成員頭像完成所有品項的分攤認領後，再進行儲存記帳！`, "⚠️ 請先完成所有品項認領");
          return;
        }

        if(!finalTotal || finalTotal <= 0){
          await sbAlert("總金額不能為 0！請確認品項金額。", "金額錯誤");
          return;
        }

        if(Math.abs(calculatedTotal - finalTotal) >= 0.5){
          if(taxType === "inclusive"){
            await sbAlert(`目前為「內含稅」模式，品項小計 (${curSym}${deps.formatAmt(subtotal)}) 與總計 (${curSym}${deps.formatAmt(finalTotal)}) 不符！\n\n若此發票有額外服務費或稅額需疊加，請切換至「外加稅費」模式。`, "⚠️ 金額不相符");
          } else {
            await sbAlert(`小計 (${curSym}${deps.formatAmt(subtotal)}) ＋ 服務費/稅 (${curSym}${deps.formatAmt(netExtraFees)}) ＝ ${curSym}${deps.formatAmt(calculatedTotal)}，與總計 (${curSym}${deps.formatAmt(finalTotal)}) 不符！\n\n若此發票已內含稅，請切換至「內含稅」模式。`, "⚠️ 金額不相符");
          }
          return;
        }

        // 1. 付款人校驗（跟 Step 2「付款人/日期」下一步用同一套 validateAiPayers()）
        const payerCheck = validateAiPayers(finalTotal);
        if(!payerCheck.ok){
          await sbAlert(payerCheck.message, "付款人資料有誤");
          return;
        }
        const payers = payerCheck.payers;

        // 2. 分攤人與份額校驗
        const activeMembers = (deps.getState().MEMBERS || []).filter(m => deps.showLeftMembers || !m.left_at);
        let shares = activeMembers.filter(m => (memberCalcMap[m.id]?.total || 0) > 0).map(m => {
          const d = memberCalcMap[m.id];
          return {
            member_id: m.id,
            amount: d.total,
            calc: d.formulas.join("+") + (d.taxShare ? `+服務費${roundAmt(d.taxShare)}` : "")
          };
        });

        // 若無人點選認領，則全員平分——依幣別最小法定面額（例如美金以「分」為單位）分配餘數，
        // 不能一律當作整數幣別直接 +1（那樣美金會整組落到整數，1.99 這種尾數會消失）
        if(!shares.length){
          const minUnit = Math.pow(10, -getCurrencyDecimals(selectedReceiptCurrency));
          const totalUnits = Math.round(finalTotal / minUnit);
          const n = activeMembers.length;
          const baseUnits = Math.floor(totalUnits / n);
          const remUnits = totalUnits - baseUnits * n;
          shares = activeMembers.map((m, idx) => ({
            member_id: m.id,
            amount: roundAmt((baseUnits + (idx < remUnits ? 1 : 0)) * minUnit),
            calc: "全員平分"
          }));
        }

        // 微調分攤加總確保與 finalTotal 100% 吻合
        const shareSum = shares.reduce((acc, s) => acc + s.amount, 0);
        const diff = roundAmt(finalTotal - shareSum);
        if(diff !== 0 && shares.length > 0){
          shares[0].amount = roundAmt(shares[0].amount + diff);
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
            claimedMemberIds: [...it.claimedMemberIds],
            memberQty: { ...(it.memberQty || {}) },
            qtyMode: !!it.qtyMode
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
            created_by: editingAiExpenseOriginal ? editingAiExpenseOriginal.created_by : (deps.getState().myMember ? deps.getState().myMember.id : activeMembers[0].id),
            payers,
            shares,
            currency: selectedReceiptCurrency,
            category: selectedAiCategory || "food"
          };

          if(editingAiExpenseId){
            const { error } = await deps.sb.from("expenses").update(payload).eq("id", editingAiExpenseId);
            if(error) throw error;

            closeModal();
            await deps.refreshExpenses();
            await sbAlert(`🎉 已成功更新「${storeName}」支出明細！`, "更新成功");
          } else {
            const keepImageChk = document.getElementById("aiReceiptKeepImageChk");
            const shouldKeepImage = !!(keepImageChk && keepImageChk.checked && currentReceiptImageBase64);

            const { data: insertedRow, error } = await deps.sb.from("expenses").insert(payload).select("id").single();
            if(error) throw error;

            if(shouldKeepImage && insertedRow){
              const groupIdForUpload = (deps.getState().myMember && deps.getState().myMember.group_id) || activeMembers[0].group_id;
              uploadReceiptImage(deps.sb, groupIdForUpload, insertedRow.id, currentReceiptImageBase64);
            }

            closeModal();

            if(selectedReceiptCurrency !== deps.CURRENCY){
              const okSwitch = await sbConfirm(`🎉 已成功直接記錄「${storeName}」總額 ${curSym}${deps.formatAmt(finalTotal)} 至【${curLabel}區】！\n\n是否立即切換至【${curLabel}區】查看此筆支出？`, "記帳成功");
              if(okSwitch){
                location.href = "currency.html?c=" + selectedReceiptCurrency;
              } else {
                await deps.refreshExpenses();
              }
            } else {
              await deps.refreshExpenses();
              await sbAlert(`🎉 已成功直接記錄「${storeName}」總額 ${curSym}${deps.formatAmt(finalTotal)}！`, "記帳成功");
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