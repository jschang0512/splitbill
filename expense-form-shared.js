// ============================================================
// 新增支出的分攤演算法（ES module）
//
// 「新增支出」完整表單（app.js/currency.html）跟「快速記帳」（summary.html）
// 原本各自寫了一份幾乎一模一樣的均分／自訂分攤計算邏輯，只有變數命名跟
// DOM 讀取方式不同。這支檔案只抽出「不碰 DOM 的純數學計算」這一段——
// 表單驗證（金額格式、錯誤訊息）、個人加點/共同品項的 DOM 讀取、編輯模式
// 沿用原分攤的捷徑，這些跟兩邊各自的 DOM 結構、控制流程綁得很緊，硬要
// 抽成共用元件風險大於好處，所以刻意保留在各自檔案裡。
//
// 這裡兩個函式都是純函式：給同一組輸入，保證兩邊算出來的分攤結果一致，
// 不會再發生像「類別自動學習」那種只改到一邊、另一邊沒跟著改的問題。
// ============================================================

// 均分模式：扣除個人加點/共同品項後，剩餘款項由分攤名單平分，未被整除的
// 餘數優先分給「沒有代墊付款」的人；服務費/稅可選「依消費比例」或「全員平分」。
//
// 參數：
//   subtotal      不含稅金額
//   taxAmount     服務費/稅額（0 表示沒有）
//   taxSplitMode  "ratio"（依消費比例）或 "equal"（全員平分）
//   participantIds  分攤名單（member id 陣列）
//   payerIds      代墊付款人 id 陣列（用來決定餘數優先分給誰）
//   addonAmounts  { memberId: 金額 } 個人加點/共同品項，已經是算好的最終金額
export function computeEqualSplitShares({ subtotal, taxAmount, taxSplitMode, participantIds, payerIds, addonAmounts }){
  const addons = addonAmounts || {};
  const n = participantIds.length;
  let totalAddon = 0;
  participantIds.forEach(id => { totalAddon += Number(addons[id]) || 0; });
  Object.keys(addons).forEach(id => { if(!participantIds.includes(id)) totalAddon += Number(addons[id]) || 0; });

  const baseAmount = Math.max(0, subtotal - totalAddon);
  const base = Math.floor(baseAmount / n);
  const remainder = Math.round(baseAmount - base * n);

  const payerIdSet = new Set(payerIds || []);
  const shuffle = arr => {
    const a = arr.slice();
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const priority = [
    ...shuffle(participantIds.filter(id => !payerIdSet.has(id))),
    ...shuffle(participantIds.filter(id => payerIdSet.has(id)))
  ];

  const shareAmt = {};
  const memberPreTax = {};
  participantIds.forEach(id => { shareAmt[id] = base; memberPreTax[id] = base; });
  priority.slice(0, remainder).forEach(id => { shareAmt[id] += 1; memberPreTax[id] += 1; });
  participantIds.forEach(id => {
    const add = Number(addons[id]) || 0;
    if(add > 0){ shareAmt[id] += add; memberPreTax[id] += add; }
  });

  const memberTax = {};
  if(taxAmount > 0){
    if(taxSplitMode === "ratio" && subtotal > 0){
      let taxSum = 0;
      participantIds.forEach(id => {
        const rawTax = Math.round((memberPreTax[id] / subtotal) * taxAmount);
        memberTax[id] = rawTax;
        taxSum += rawTax;
      });
      const taxDiff = taxAmount - taxSum;
      if(taxDiff !== 0 && participantIds.length > 0) memberTax[participantIds[0]] += taxDiff;
    } else {
      const baseTax = Math.floor(taxAmount / n);
      const taxRem = taxAmount - (baseTax * n);
      participantIds.forEach((id, idx) => { memberTax[id] = baseTax + (idx < taxRem ? 1 : 0); });
    }
  }

  const shares = participantIds.map(id => {
    const baseVal = shareAmt[id];
    const taxVal = memberTax[id] || 0;
    const finalVal = baseVal + taxVal;
    const add = Number(addons[id]) || 0;
    let calc = "";
    if(add > 0 && taxVal > 0) calc = `平分${baseVal - add}+自付${add}+稅額${taxVal}`;
    else if(add > 0) calc = `平分${baseVal - add}+自付${add}`;
    else if(taxVal > 0) calc = `平分${baseVal}+稅額${taxVal}`;
    const obj = { member_id: id, amount: finalVal };
    if(calc) obj.calc = calc;
    return obj;
  });

  // 個人自付名單跟「怎麼分攤」勾選名單是分開的：有人只掛了個人加點卻沒被
  // 勾進共同分攤，他不會平分到公費，但自己的加點金額還是要記進帳，不然
  // 這筆錢就無聲無息地憑空消失了。
  Object.keys(addons).forEach(id => {
    if(participantIds.includes(id)) return;
    const add = Number(addons[id]) || 0;
    if(add > 0) shares.push({ member_id: id, amount: add, calc: `自付${add}` });
  });

  return shares;
}

// 自訂分攤模式：每人金額由使用者自己填，這裡只負責把服務費/稅按比例或
// 平分加進每個人的金額裡（沒有稅的話原樣退回）。
//
// 參數：
//   subtotal      不含稅金額（給比例分配當分母用）
//   taxAmount     服務費/稅額（0 表示沒有）
//   taxSplitMode  "ratio" 或 "equal"
//   rows          [{ member_id, amount, calc? }]，amount 是使用者填的自訂金額（已排除 0/空白列）
export function computeCustomSplitShares({ subtotal, taxAmount, taxSplitMode, rows }){
  if(!(taxAmount > 0)){
    return rows.map(r => {
      const obj = { member_id: r.member_id, amount: r.amount };
      if(r.calc) obj.calc = r.calc;
      return obj;
    });
  }

  const customBaseSum = rows.reduce((s,r)=>s+r.amount, 0);
  const memberTax = {};
  if(taxSplitMode === "ratio" && customBaseSum > 0){
    let taxSum = 0;
    rows.forEach(r => {
      const rawTax = Math.round((r.amount / customBaseSum) * taxAmount);
      memberTax[r.member_id] = rawTax;
      taxSum += rawTax;
    });
    const taxDiff = taxAmount - taxSum;
    if(taxDiff !== 0) memberTax[rows[0].member_id] += taxDiff;
  } else {
    const baseTax = Math.floor(taxAmount / rows.length);
    const taxRem = taxAmount - (baseTax * rows.length);
    rows.forEach((r, idx) => { memberTax[r.member_id] = baseTax + (idx < taxRem ? 1 : 0); });
  }

  return rows.map(r => {
    const taxVal = memberTax[r.member_id] || 0;
    const calc = taxVal > 0 ? `自訂${r.amount}+稅額${taxVal}` : (r.calc || "");
    const obj = { member_id: r.member_id, amount: r.amount + taxVal };
    if(calc) obj.calc = calc;
    return obj;
  });
}
