// ── Global object library cache ────────────────────────────────────────────────
let OBJECT_LIBRARY = [];

async function loadObjectLibrary() {
  const objs = await api.getObjects();
  OBJECT_LIBRARY = objs.sort((a, b) => a.label.localeCompare(b.label));
}

function getObjectDef(id) {
  return OBJECT_LIBRARY.find(o => o.id === id) || { id, label: id, icon: "❓", blocks: false };
}

/**
 * Returns an HTML string that renders an object's icon.
 * If icon starts with "/" it's an image URL; otherwise it's emoji/text.
 */
function renderObjectIcon(obj, sizePx = 32) {
  if (!obj || !obj.icon) return "❓";
  if (obj.icon.startsWith("/")) {
    return `<img src="${escHtml(obj.icon)}" alt="${escHtml(obj.label)}"
                 style="width:${sizePx}px;height:${sizePx}px;object-fit:contain;display:block;" />`;
  }
  return escHtml(obj.icon);
}

// ── Difficulty ordering ────────────────────────────────────────────────────────
const DIFFICULTIES = ["Very Easy", "Easy", "Medium", "Hard", "Expert"];

function difficultyRank(d) {
  const i = DIFFICULTIES.indexOf(d);
  return i === -1 ? DIFFICULTIES.length : i; // unset goes last
}

// ── View router ────────────────────────────────────────────────────────────────
const views = {
  home:        document.getElementById("view-home"),
  creator:     document.getElementById("view-creator"),
  solver:      document.getElementById("view-solver"),
  leaderboard: document.getElementById("view-leaderboard"),
  objects:     document.getElementById("view-objects"),
};

let currentView = null;

function showView(name) {
  // Stop the solver timer whenever we navigate away from the solver
  if (currentView === "solver" && name !== "solver" && solverState) {
    stopTimer();
    autoSaveProgress();
  }
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
  currentView = name;
}

// ── Home ───────────────────────────────────────────────────────────────────────
// Filter state
let homeFilter = { player: "", status: "all", difficulty: "" };

async function loadHome() {
  showView("home");
  renderHomeLoading();

  let puzzles, allProgress, leaderboard;
  try {
    [puzzles, allProgress, leaderboard] = await Promise.all([
      api.listPuzzles(),
      api.getAllProgress(),
      api.getLeaderboard(),
    ]);
  } catch (e) {
    document.getElementById("puzzle-list").innerHTML =
      `<div class="empty">Failed to load data: ${escHtml(String(e))}</div>`;
    return;
  }

  // progress: puzzleId -> [{ player_name, elapsed_seconds, status }]
  const progressByPuzzle = {};
  allProgress.forEach(p => {
    if (!progressByPuzzle[p.puzzle_id]) progressByPuzzle[p.puzzle_id] = [];
    progressByPuzzle[p.puzzle_id].push(p);
  });

  // solved: puzzleId -> Set of player names
  const solvedByPuzzle = {};
  leaderboard.forEach(e => {
    if (!solvedByPuzzle[e.puzzle_id]) solvedByPuzzle[e.puzzle_id] = new Set();
    solvedByPuzzle[e.puzzle_id].add(e.player_name);
  });

  // All known players from both progress saves AND leaderboard
  const allPlayers = new Set([
    ...allProgress.map(p => p.player_name),
    ...leaderboard.map(e => e.player_name),
  ]);

  renderHomeFilters([...allPlayers].sort(), puzzles, progressByPuzzle);
  renderPuzzleList(puzzles, progressByPuzzle, solvedByPuzzle);
}

function renderHomeLoading() {
  document.getElementById("home-filters").innerHTML = "";
  document.getElementById("in-progress-section").innerHTML = "";
  document.getElementById("puzzle-list").innerHTML = `<div class="loading">Loading puzzles…</div>`;
}

function renderHomeFilters(players, puzzles, progressByPuzzle) {
  const playerOpts = players.map(p =>
    `<option value="${escHtml(p)}" ${homeFilter.player === p ? "selected" : ""}>${escHtml(p)}</option>`
  ).join("");

  const diffBtns = ["", ...DIFFICULTIES].map(d => `
    <button class="btn btn-sm ${homeFilter.difficulty === d ? "btn-primary" : "btn-ghost"}"
            onclick="applyHomeFilter('difficulty','${d}')">
      ${d || "All"}
    </button>
  `).join("");

  document.getElementById("home-filters").innerHTML = `
    <div class="home-filter-bar">
      <div class="filter-group">
        <label>Player</label>
        <select id="filter-player" onchange="applyHomeFilter('player', this.value)">
          <option value="">All players</option>
          ${playerOpts}
        </select>
      </div>
      <div class="filter-group">
        <label>Status</label>
        <div class="filter-status-btns">
          ${["all","fresh","inprogress","unsubmitted"].map(s => `
            <button class="btn btn-sm ${homeFilter.status === s ? "btn-primary" : "btn-ghost"}"
                    onclick="applyHomeFilter('status','${s}')">
              ${{all:"All", fresh:"Not Started", inprogress:"In Progress", unsubmitted:"Unsubmitted"}[s]}
            </button>
          `).join("")}
        </div>
      </div>
      <div class="filter-group">
        <label>Difficulty</label>
        <div class="filter-status-btns">${diffBtns}</div>
      </div>
    </div>
  `;
}

function applyHomeFilter(key, value) {
  homeFilter[key] = value;
  loadHome();
}

// Strip leading articles for alphabetical sort
function sortTitle(name) {
  return name.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

function renderPuzzleList(puzzles, progressByPuzzle, solvedByPuzzle) {
  const filterPlayer     = homeFilter.player;
  const filterStatus     = homeFilter.status;
  const filterDifficulty = homeFilter.difficulty;

  // Sort: difficulty first, then alphabetically ignoring leading articles
  const sorted = [...puzzles].sort((a, b) => {
    const dDiff = difficultyRank(a.difficulty) - difficultyRank(b.difficulty);
    if (dDiff !== 0) return dDiff;
    return sortTitle(a.name).localeCompare(sortTitle(b.name));
  });

  const inProgressEntries = [];
  const finishedEntries   = [];
  const availableEntries  = [];

  sorted.forEach(p => {
    const progList = progressByPuzzle[p.id] || [];
    const solvers  = solvedByPuzzle[p.id] || new Set();

    if (filterDifficulty && p.difficulty !== filterDifficulty) return;

    // Separate in-progress from unsubmitted — one card per player save
    progList.forEach(prog => {
      if (!filterPlayer || prog.player_name === filterPlayer) {
        const s = prog.status || "inprogress";
        if (s === "unsubmitted") {
          finishedEntries.push({ puzzle: p, prog, status: "unsubmitted" });
        } else {
          inProgressEntries.push({ puzzle: p, prog, status: "inprogress" });
        }
      }
    });

    // Available section — determine per-player status for filtering
    if (filterStatus === "inprogress" || filterStatus === "unsubmitted") return;

    if (filterPlayer) {
      const myProg   = progList.find(pr => pr.player_name === filterPlayer);
      const mySolved = solvers.has(filterPlayer);
      const myStatus = myProg
        ? (myProg.status || "inprogress")
        : mySolved ? "solved" : "fresh";

      // "Not Started" means no progress AND never solved by this player
      if (filterStatus === "fresh" && myStatus !== "fresh") return;
      // (other statuses handled in their own sections above)
    }
    // No player filter — show all puzzles in Available

    availableEntries.push({ puzzle: p, solvers });
  });

  // ── In Progress section ──
  const inProgSection = document.getElementById("in-progress-section");
  const showInProg   = filterStatus === "all" || filterStatus === "inprogress";
  const showFinished = filterStatus === "all" || filterStatus === "unsubmitted";

  let inProgHtml = "";
  if (showInProg && inProgressEntries.length > 0) {
    inProgHtml += `
      <h2 class="home-section-title">⏳ In Progress</h2>
      <div class="puzzle-list-inner">
        ${inProgressEntries.map(({ puzzle: p, prog, status }) =>
            puzzleCardHtml(p, prog, status)).join("")}
      </div>`;
  }
  if (showFinished && finishedEntries.length > 0) {
    inProgHtml += `
      <h2 class="home-section-title" style="margin-top:${inProgHtml ? "1rem" : "0"}">🏁 Finished (Unsubmitted)</h2>
      <div class="puzzle-list-inner">
        ${finishedEntries.map(({ puzzle: p, prog, status }) =>
            puzzleCardHtml(p, prog, status)).join("")}
      </div>`;
  }
  inProgSection.innerHTML = inProgHtml;

  // ── Available section ──
  const list = document.getElementById("puzzle-list");
  if (puzzles.length === 0) {
    list.innerHTML = `<div class="empty">No puzzles yet. Create one!</div>`;
    return;
  }

  if (filterStatus === "inprogress" || filterStatus === "unsubmitted") {
    list.innerHTML = "";
    if (!inProgHtml) {
      inProgSection.innerHTML = `<div class="empty">No puzzles match the current filter.</div>`;
    }
    return;
  }

  if (availableEntries.length === 0) {
    list.innerHTML = inProgHtml ? "" : `<div class="empty">No puzzles match the current filter.</div>`;
    return;
  }

  const showAvailableHeader = (inProgressEntries.length > 0 || finishedEntries.length > 0) && filterStatus === "all";
  list.innerHTML =
    (showAvailableHeader ? `<h2 class="home-section-title">📋 Available</h2>` : "") +
    `<div class="puzzle-list-inner">${availableEntries.map(({ puzzle: p, solvers }) =>
        puzzleCardHtml(p, null, "fresh", solvers)).join("")}</div>`;
}

function puzzleCardHtml(p, prog, status, solvers) {
  const isInProgress  = status === "inprogress";
  const isUnsubmitted = status === "unsubmitted";
  const difficulty    = p.difficulty ? `· ${escHtml(p.difficulty)}` : "";
  const createdDate   = (!isInProgress && !isUnsubmitted && p.created_at)
    ? `· ${new Date(p.created_at).toLocaleDateString()}` : "";

  const solverSet = solvers || new Set();
  const solvedTag = (!isInProgress && !isUnsubmitted && solverSet.size > 0)
    ? `<span class="puzzle-solved-tag">✔ Solved by ${[...solverSet].map(escHtml).join(", ")}</span>`
    : "";

  const solverTag = isInProgress
    ? `<span class="puzzle-solver-tag">🖊 ${escHtml(prog.player_name)} · ${formatTime(prog.elapsed_seconds)}</span>`
    : isUnsubmitted
      ? `<span class="puzzle-unsubmitted-tag">🏁 ${escHtml(prog.player_name)} · Unsubmitted</span>`
      : solvedTag;

  // Use data attributes to safely handle player names with apostrophes/quotes
  const solveBtn = isInProgress
    ? `<button class="btn btn-success"
              data-action="continue" data-pid="${p.id}" data-player="${escHtml(prog.player_name)}">▶ Continue</button>`
    : isUnsubmitted
      ? `<button class="btn btn-primary"
                data-action="submit-unsubmitted" data-pid="${p.id}" data-player="${escHtml(prog.player_name)}">📋 Submit</button>`
      : `<button class="btn btn-primary"
                data-action="solve" data-pid="${p.id}">Solve</button>`;

  const editBtn = (isInProgress || isUnsubmitted) ? ""
    : `<button class="btn btn-secondary"
              data-action="edit" data-pid="${p.id}">Edit</button>`;

  const deleteBtn = (isInProgress || isUnsubmitted)
    ? `<button class="btn btn-danger"
              data-action="delete-progress" data-pid="${p.id}" data-player="${escHtml(prog.player_name)}">✕</button>`
    : `<button class="btn btn-danger"
              data-action="delete-puzzle" data-pid="${p.id}" data-name="${escHtml(p.name)}">✕</button>`;

  // No yellow left border on available puzzles — only green for in-progress
  const cardClass = isInProgress ? "puzzle-card-inprogress"
    : isUnsubmitted ? "puzzle-card-unsubmitted" : "";

  return `
    <div class="puzzle-card ${cardClass}">
      <div class="puzzle-card-info">
        <span class="puzzle-name">${escHtml(p.name)}</span>
        <span class="puzzle-meta">${p.rows}×${p.cols} · ${p.individuals.length} individuals ${difficulty} ${createdDate}</span>
        ${solverTag}
      </div>
      <div class="puzzle-card-actions">
        ${solveBtn}
        ${editBtn}
        <button class="btn btn-ghost" data-action="leaderboard" data-pid="${p.id}">🏆</button>
        ${deleteBtn}
      </div>
    </div>
  `;
}

async function confirmDeleteProgress(puzzleId, playerName) {
  if (!await mdConfirm(`Discard ${playerName}'s in-progress solve? This cannot be undone.`)) return;
  await api.resetProgress(puzzleId, playerName);
  loadHome();
}

async function confirmDeletePuzzle(id, name) {
  if (!await mdConfirm(`Delete puzzle "${name}"? This cannot be undone.`)) return;
  await api.deletePuzzle(id);
  loadHome();
}

// Submit an unsubmitted puzzle directly from the home page
async function submitUnsubmitted(puzzleId, playerName) {
  const progress = await api.getProgress(puzzleId, playerName);
  if (!progress) { mdAlert("No saved progress found."); return; }

  const result = await api.submit(puzzleId, {
    locked:          progress.locked || {},
    elapsed_seconds: progress.elapsed_seconds || 0,
    player_name:     playerName,
  });

  if (result.correct === null) {
    mdAlert("⚠️ No solution is defined for this puzzle yet. It will remain Unsubmitted.");
  } else if (result.correct) {
    mdAlert(`🎉 Correct! Solved in ${formatTime(progress.elapsed_seconds || 0)} — added to the leaderboard!`);
    await api.resetProgress(puzzleId, playerName);
    loadHome();
  } else {
    mdAlert("❌ Not quite — your answers aren't all correct. Moving back to In Progress.");
    // Re-save as inprogress so it moves back
    await api.saveProgress(puzzleId, { ...progress, status: "inprogress" });
    loadHome();
  }
}

// ── Delegated click handler for puzzle cards ───────────────────────────────────
function handlePuzzleCardClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const pid    = btn.dataset.pid;
  const player = btn.dataset.player;
  const name   = btn.dataset.name;

  switch (action) {
    case "solve":              startSolve(pid); break;
    case "continue":           continueSolve(pid, player); break;
    case "submit-unsubmitted": submitUnsubmitted(pid, player); break;
    case "edit":               editPuzzle(pid); break;
    case "leaderboard":        showPuzzleLeaderboard(pid); break;
    case "delete-progress":    confirmDeleteProgress(pid, player); break;
    case "delete-puzzle":      confirmDeletePuzzle(pid, name); break;
  }
}

document.getElementById("in-progress-section").addEventListener("click", handlePuzzleCardClick);
document.getElementById("puzzle-list").addEventListener("click", handlePuzzleCardClick);

// ── Nav bindings ───────────────────────────────────────────────────────────────
document.getElementById("nav-home").addEventListener("click", loadHome);
document.getElementById("nav-new").addEventListener("click", () => openCreator(null));
document.getElementById("nav-leaderboard").addEventListener("click", () => loadLeaderboard(null));
document.getElementById("nav-objects").addEventListener("click", () => openObjectLibrary());

// ── Utility ────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Custom modal dialogs (replaces browser alert/confirm) ─────────────────────
function mdAlert(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById("modal-overlay");
    const box     = document.getElementById("modal-box");
    box.innerHTML = `
      <p style="margin-bottom:1.2rem;line-height:1.5">${escHtml(message).replace(/\n/g,"<br>")}</p>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-primary" id="md-ok-btn">OK</button>
      </div>
    `;
    overlay.classList.remove("hidden");
    const done = () => { overlay.classList.add("hidden"); resolve(); };
    box.querySelector("#md-ok-btn").addEventListener("click", done);
    // Backdrop click also resolves
    const backdropHandler = e => {
      if (e.target === overlay) { overlay.removeEventListener("click", backdropHandler); done(); }
    };
    overlay.addEventListener("click", backdropHandler);
  });
}

function mdConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById("modal-overlay");
    const box     = document.getElementById("modal-box");
    box.innerHTML = `
      <p style="margin-bottom:1.2rem;line-height:1.5">${escHtml(message).replace(/\n/g,"<br>")}</p>
      <div style="display:flex;justify-content:flex-end;gap:.5rem">
        <button class="btn btn-ghost" id="md-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="md-ok-btn">OK</button>
      </div>
    `;
    overlay.classList.remove("hidden");
    const done = val => () => { overlay.classList.add("hidden"); resolve(val); };
    box.querySelector("#md-ok-btn").addEventListener("click", done(true));
    box.querySelector("#md-cancel-btn").addEventListener("click", done(false));
    // Backdrop click = cancel
    const backdropHandler = e => {
      if (e.target === overlay) { overlay.removeEventListener("click", backdropHandler); resolve(false); overlay.classList.add("hidden"); }
    };
    overlay.addEventListener("click", backdropHandler);
  });
}

function mdPrompt(message, defaultValue = "") {
  return new Promise(resolve => {
    const overlay = document.getElementById("modal-overlay");
    const box     = document.getElementById("modal-box");
    box.innerHTML = `
      <p style="margin-bottom:.75rem;line-height:1.5">${escHtml(message)}</p>
      <input type="text" id="md-prompt-input" class="md-prompt-input"
             value="${escHtml(defaultValue)}" autocomplete="off" />
      <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem">
        <button class="btn btn-ghost"   id="md-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="md-ok-btn">OK</button>
      </div>
    `;
    overlay.classList.remove("hidden");
    const input = box.querySelector("#md-prompt-input");
    // Focus the input and select all text
    setTimeout(() => { input.focus(); input.select(); }, 50);

    const ok     = () => { overlay.classList.add("hidden"); resolve(input.value); };
    const cancel = () => { overlay.classList.add("hidden"); resolve(null); };

    box.querySelector("#md-ok-btn").addEventListener("click", ok);
    box.querySelector("#md-cancel-btn").addEventListener("click", cancel);
    // Enter key submits, Escape cancels
    input.addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.preventDefault(); ok(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    // Backdrop click = cancel
    const backdropHandler = e => {
      if (e.target === overlay) {
        overlay.removeEventListener("click", backdropHandler);
        cancel();
      }
    };
    overlay.addEventListener("click", backdropHandler);
  });
}
async function boot() {
  try {
    await loadObjectLibrary();
  } catch (e) {
    console.error("Failed to load object library:", e);
    OBJECT_LIBRARY = [];
  }
  try {
    await loadHome();
  } catch (e) {
    console.error("Failed to load home:", e);
    document.getElementById("puzzle-list").innerHTML =
      `<div class="empty">Error loading puzzles: ${escHtml(String(e))}. Is the Flask server running?</div>`;
  }
}

boot();
