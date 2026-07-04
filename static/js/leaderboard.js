// ── Leaderboard ────────────────────────────────────────────────────────────────

let lbFilter     = { difficulty: "", puzzleName: "", _selectedPuzzle: "" };
let lbPuzzleId   = null;
let lbAllEntries = [];

async function loadLeaderboard(puzzleId = null) {
  lbPuzzleId = puzzleId;
  lbFilter   = { difficulty: "", puzzleName: "", _selectedPuzzle: "" };
  showView("leaderboard");

  lbAllEntries = await api.getLeaderboard(puzzleId);

  let title = "🏆 Leaderboard";
  if (puzzleId && lbAllEntries.length > 0) title += ` — ${escHtml(lbAllEntries[0].puzzle_name)}`;
  document.getElementById("leaderboard-title").textContent = title;

  renderLeaderboardFilters();
  renderLeaderboardTable();
}

function renderLeaderboardFilters() {
  const diffBtns = ["", ...DIFFICULTIES].map(d => `
    <button class="btn btn-sm ${lbFilter.difficulty === d ? "btn-primary" : "btn-ghost"}"
            onclick="applyLbDifficulty('${d}')">
      ${d || "All"}
    </button>
  `).join("");

  const names    = [...new Set(lbAllEntries.map(e => e.puzzle_name))].sort();
  const search   = lbFilter.puzzleName;
  const filtered = search
    ? names.filter(n => n.toLowerCase().includes(search.toLowerCase()))
    : names;
  const nameOpts = [`<option value="">All puzzles</option>`].concat(
    filtered.map(n =>
      `<option value="${escHtml(n)}" ${lbFilter._selectedPuzzle === n ? "selected" : ""}>${escHtml(n)}</option>`
    )
  ).join("");

  document.getElementById("leaderboard-filters").innerHTML = `
    <div class="home-filter-bar">
      <div class="filter-group">
        <label>Difficulty</label>
        <div class="filter-status-btns">${diffBtns}</div>
      </div>
      <div class="filter-group">
        <label>Puzzle</label>
        <div class="lb-puzzle-filter">
          <input type="text" class="lb-puzzle-search" id="lb-puzzle-search-input"
                 placeholder="Search puzzles…"
                 value="${escHtml(search)}"
                 oninput="applyLbPuzzleSearch(this.value)" />
          <select id="lb-puzzle-select" onchange="applyLbPuzzleName(this.value)">
            ${nameOpts}
          </select>
        </div>
      </div>
    </div>
  `;
}

function _updateLbDropdownOnly() {
  const select = document.getElementById("lb-puzzle-select");
  if (!select) return;
  const names    = [...new Set(lbAllEntries.map(e => e.puzzle_name))].sort();
  const search   = lbFilter.puzzleName;
  const filtered = search
    ? names.filter(n => n.toLowerCase().includes(search.toLowerCase()))
    : names;
  select.innerHTML = [`<option value="">All puzzles</option>`].concat(
    filtered.map(n =>
      `<option value="${escHtml(n)}" ${lbFilter._selectedPuzzle === n ? "selected" : ""}>${escHtml(n)}</option>`
    )
  ).join("");
}

function applyLbDifficulty(d) {
  lbFilter.difficulty = d;
  renderLeaderboardFilters();
  renderLeaderboardTable();
}

function applyLbPuzzleSearch(val) {
  lbFilter.puzzleName = val;
  lbFilter._selectedPuzzle = ""; // clear dropdown selection when typing
  _updateLbDropdownOnly();       // only update dropdown, preserving cursor in search input
  renderLeaderboardTable();
}

function applyLbPuzzleName(val) {
  lbFilter._selectedPuzzle = val;
  lbFilter.puzzleName = val;    // also update search text to match selected name
  renderLeaderboardFilters();   // full re-render is fine since user clicked, not typed
  renderLeaderboardTable();
}

function renderLeaderboardTable() {
  let entries = [...lbAllEntries];

  // Filter
  if (lbFilter.difficulty) {
    entries = entries.filter(e => e.puzzle_difficulty === lbFilter.difficulty);
  }
  if (lbFilter._selectedPuzzle) {
    entries = entries.filter(e => e.puzzle_name === lbFilter._selectedPuzzle);
  } else if (lbFilter.puzzleName) {
    const q = lbFilter.puzzleName.toLowerCase();
    entries = entries.filter(e => e.puzzle_name.toLowerCase().includes(q));
  }

  // Sort: difficulty (Expert→Very Easy), then puzzle name (A→Z), then time (fastest→slowest)
  const diffOrder = { "Expert": 0, "Hard": 1, "Medium": 2, "Easy": 3, "Very Easy": 4, "": 5 };
  entries.sort((a, b) => {
    const dA = diffOrder[a.puzzle_difficulty] ?? 5;
    const dB = diffOrder[b.puzzle_difficulty] ?? 5;
    if (dA !== dB) return dA - dB;
    const nCmp = a.puzzle_name.localeCompare(b.puzzle_name);
    if (nCmp !== 0) return nCmp;
    return a.elapsed_seconds - b.elapsed_seconds;
  });

  const tbody = document.getElementById("leaderboard-body");
  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No entries yet.</td></tr>`;
    return;
  }

  // Assign per-puzzle rank (rank resets to 1 for each new puzzle)
  let currentPuzzle = null;
  let rankWithinPuzzle = 0;

  tbody.innerHTML = entries.map(e => {
    if (e.puzzle_name !== currentPuzzle) {
      currentPuzzle = e.puzzle_name;
      rankWithinPuzzle = 0;
    }
    rankWithinPuzzle++;
    const showDivider = rankWithinPuzzle === 1 && currentPuzzle !== entries[0].puzzle_name;
    return `
      ${showDivider ? `<tr class="lb-puzzle-divider"><td colspan="7"></td></tr>` : ""}
      <tr>
        <td class="lb-rank">${rankWithinPuzzle}</td>
        <td>${escHtml(e.player_name)}</td>
        <td>${escHtml(e.puzzle_name)}</td>
        <td>${escHtml(e.puzzle_difficulty || "—")}</td>
        <td class="lb-time">${formatTime(e.elapsed_seconds)}</td>
        <td>${new Date(e.completed_at).toLocaleDateString()}</td>
        <td><button class="btn btn-danger btn-xs" onclick="deleteEntry('${e.id}')">✕</button></td>
      </tr>
    `;
  }).join("");
}

async function deleteEntry(id) {
  if (!await mdConfirm("Remove this leaderboard entry?")) return;
  await api.deleteLeaderboardEntry(id);
  loadLeaderboard(lbPuzzleId);
}

document.getElementById("leaderboard-back-btn").addEventListener("click", loadHome);

async function showPuzzleLeaderboard(puzzleId) {
  await loadLeaderboard(puzzleId);
}
