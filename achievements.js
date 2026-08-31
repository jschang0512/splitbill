// ============================================================
// 成就榜 / 遊戲化子系統（ES module）
// 從 app.js 抽出來獨立成一支檔案。對外只匯出 initAchievementsModal(deps)。
//
// deps.sb 是 Supabase client，建立後不會再換一個新的，傳一次靜態值就好；
// 但 deps.getState() 一定要是一個「呼叫當下才去讀」的函式，不能直接傳
// myMember/cachedExpenses 這些值的當下快照——這幾個變數在 app.js 那邊會
// 隨著使用者操作、即時同步不斷被重新賦值，如果只在 initAchievementsModal()
// 剛啟動時傳一次「當時的值」，之後使用者實際點開成就榜時看到的就會是
// 剛登入那一刻的舊資料，不會跟著更新。
// deps = { sb, getState: () => ({ myMember, MEMBERS, memberRows, cachedExpenses, cachedRepayments, chartExpensesCache }) }
// escapeHtml/renderAvatarHTML 是全域函式（shared-ui.js/currencies.js），這裡直接呼叫。
// 呼叫端在 app.js 裡用 import("./achievements.js") 動態載入。
// ============================================================

  export function initAchievementsModal(deps){
    const openBtn = document.getElementById("openAchievementsModalBtn");
    const modal = document.getElementById("achievementsModal");
    const closeBtn = document.getElementById("achievementsCloseBtn");
    const listScroll = document.getElementById("achievementsListScroll");

    if(!modal) return;

    function renderAchievementsWall(){
      if(!listScroll) return;
      const state = deps.getState();
      const badges = window.BADGES_CATALOG || [];
      const expList = state.cachedExpenses || state.chartExpensesCache || [];
      const repList = state.cachedRepayments || [];
      const members = (state.memberRows && state.memberRows.length) ? state.memberRows : (state.MEMBERS || []);

      const html = badges.map(b => {
        const unlockedHolders = members.filter(m => {
          try { return b.check(m, expList, repList, members); } catch(e){ return false; }
        });

        const isUnlocked = unlockedHolders.length > 0;
        const holdersHtml = isUnlocked
          ? unlockedHolders.map(m => `
              <span class="achievement-holder-chip">
                ${renderAvatarHTML(m, "avatar-xs")}
                <span>${escapeHtml(m.name || "成員")}</span>
              </span>
            `).join("")
          : `<span class="achievement-desc" style="color:var(--ink-soft);font-style:italic;">🔒 尚未有人解鎖，加油！</span>`;

        return `
          <div class="achievement-card ${isUnlocked ? 'unlocked' : ''}">
            <div class="achievement-icon-wrap">${b.icon}</div>
            <div class="achievement-info-col">
              <div class="achievement-name">${escapeHtml(b.name)}</div>
              <div class="achievement-desc">${escapeHtml(b.desc)}</div>
              <div class="achievement-holders">${holdersHtml}</div>
            </div>
          </div>
        `;
      }).join("");

      listScroll.innerHTML = html;
    }

    async function openModal(){
      const myMember = deps.getState().myMember;
      if(myMember && myMember.group_id && (!window.allGroupExpenses || !window.allGroupExpenses.length)){
        try {
          const [allExpRes, allRepRes] = await Promise.all([
            deps.sb.from("expenses").select("*").eq("group_id", myMember.group_id).order("created_at", { ascending:false }),
            deps.sb.from("repayments").select("*").eq("group_id", myMember.group_id).order("created_at", { ascending:false })
          ]);
          if(allExpRes.data) window.allGroupExpenses = allExpRes.data;
          if(allRepRes.data) window.allGroupRepayments = allRepRes.data;
        } catch(e){}
      }
      renderAchievementsWall();
      modal.classList.remove("hidden");
      modal.classList.add("show");
    }

    function closeModal(){
      modal.classList.remove("show");
      setTimeout(()=> modal.classList.add("hidden"), 200);
    }

    if(openBtn) openBtn.addEventListener("click", openModal);
    if(closeBtn) closeBtn.addEventListener("click", closeModal);
  }