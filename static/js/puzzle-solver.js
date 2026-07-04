// ── Puzzle Solver ──────────────────────────────────────────────────────────────
//
// solverState:
//   puzzle, playerName, elapsed, running, highlightedIndividual
//   locked:  { "r,c": individualIndex }
//   pencils: { "r,c": Set<individualIndex> }
//   xed:     Set<"r,c">
//   undoStack: [ snapshot, … ]   (each snapshot = deep-clone of {locked,pencils,xed})
//   activeTool: "pencil" | "pen" | "eraser" | "x"
//   activeIndividual: index | null

let solverState  = null;
let timerInterval = null;

function getIndividualLetters(n) {
  const letters = [];
  for (let i = 0; i < n - 1; i++) letters.push(String.fromCharCode(65 + i));
  letters.push("V");
  return letters;
}

// ── Dynamic cell sizing ────────────────────────────────────────────────────────
const CELL_MAX = 56;   // preferred size (matches original design)
const CELL_MIN = 24;   // minimum usable size before scroll fallback

function computeAndApplyCellSize() {
  if (!solverState) return;
  const { rows, cols } = solverState.puzzle;
  const grid = document.getElementById("solver-grid");
  if (!grid) return;

  // ── Available height ───────────────────────────────────────────────────────
  const navH     = 56;
  const mainPadV = 48; // top+bottom padding on <main>
  const topBarH  = document.querySelector(".solver-top-bar")?.offsetHeight || 70;
  const hintH    = document.querySelector(".solver-hint")?.offsetHeight    || 20;
  const gapV     = 18; // gaps between top-bar, hint, grid
  const availH   = window.innerHeight - navH - mainPadV - topBarH - hintH - gapV;

  // ── Available width ────────────────────────────────────────────────────────
  const rightPanel = document.querySelector(".solver-right");
  // Use actual measured width; fall back to viewport minus left panel + gaps
  const availW = rightPanel
    ? rightPanel.getBoundingClientRect().width
    : window.innerWidth - 400 - 32;

  // ── Grid overhead (padding + border, applied once) ─────────────────────────
  const overheadPx = 4 * 2 + 2 * 2; // 4px padding + 2px border, each side

  // ── Cell size that fills each axis ────────────────────────────────────────
  // Total space for cells = available - overhead - gaps between cells
  // gap of 3px between each of N cells = (N-1)*3, plus the extra at ends ≈ N*3
  const cellFromH = Math.floor((availH - overheadPx - rows * 3)    / rows);
  const cellFromW = Math.floor((availW - overheadPx - cols * 3)    / cols);

  // Use whichever axis is more constrained, clamped to [CELL_MIN, CELL_MAX]
  const cellSize = Math.max(CELL_MIN, Math.min(CELL_MAX, cellFromH, cellFromW));

  grid.style.setProperty("--cell-sz", cellSize + "px");
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  const gridW = cellSize * cols + overheadPx + (cols - 1) * 3;
  grid.style.width = gridW + "px";

  // ── Scroll fallback if grid still doesn't fit vertically ──────────────────
  const gridH = cellSize * rows + overheadPx + (rows - 1) * 3;
  if (gridH > availH) {
    grid.style.maxHeight = availH + "px";
    grid.style.overflowY = "auto";
  } else {
    grid.style.maxHeight = "none";
    grid.style.overflowY = "visible";
  }

  // ── Re-render room labels now that cell size is finalised ─────────────────
  // Labels are positioned by math using --cell-sz, so they must be placed
  // after this function sets it — not before in renderSolverGrid.
  const puzzle = solverState.puzzle;
  renderRoomDecorations(puzzle.rooms || {}, rows, cols,
    key => document.getElementById(`cell-${key}`),
    puzzle.deleted_cells || []);
}

let _resizeObserver    = null;
let _resizeHandler     = null;  // named reference so we can removeEventListener
async function startSolve(puzzleId) {
  const raw = await mdPrompt("Enter your name:");
  if (raw === null) return; // user hit Cancel — stay on home page
  const playerName = raw.trim() || "Anonymous";
  await _loadSolve(puzzleId, playerName);
}

async function continueSolve(puzzleId, playerName) {
  await _loadSolve(puzzleId, playerName);
}

async function _loadSolve(puzzleId, playerName) {
  let puzzle, progress;
  try {
    puzzle   = await api.getPuzzle(puzzleId);
    progress = await api.getProgress(puzzleId, playerName);
  } catch (e) {
    mdAlert("Failed to load puzzle. Please check the server is running and try again.");
    return;
  }

  // ── Object library QA ──────────────────────────────────────────────────────
  const usedObjectIds = new Set(Object.values(puzzle.graphic_elements || {}));
  const missingObjects = [...usedObjectIds].filter(
    id => !OBJECT_LIBRARY.find(o => o.id === id)
  );
  if (missingObjects.length > 0) {
    mdAlert(
      `⚠️ This puzzle uses objects not in your library:\n\n` +
      missingObjects.map(id => `  • ${id}`).join("\n") +
      `\n\nPlease add these to your Object Library before solving.`
    );
    return;
  }

  let elapsed = 0, locked = {}, pencils = {}, xed = [];
  if (progress) {
    elapsed  = progress.elapsed_seconds || 0;
    locked   = progress.locked   || {};
    pencils  = progress.pencils  || {};
    xed      = progress.xed      || [];
  }

  solverState = {
    puzzle, playerName, elapsed,
    locked,
    pencils: {},
    xed: new Set(xed),
    undoStack: [],
    running: false,
    activeTool: "pencil",
    activeIndividual: null,
    highlightedIndividual: null,
  };

  for (const [key, arr] of Object.entries(pencils)) {
    solverState.pencils[key] = new Set(arr);
  }

  showView("solver");
  renderSolverUI();
  startTimer();
}

// ── Timer ──────────────────────────────────────────────────────────────────────
function startTimer() {
  solverState.running = true;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!solverState.running) return;
    solverState.elapsed++;
    updateTimerDisplay();
    autoSaveProgress();
  }, 1000);
}

function stopTimer() {
  solverState.running = false;
  clearInterval(timerInterval);
}

function updateTimerDisplay() {
  document.getElementById("solver-timer").textContent = formatTime(solverState.elapsed);
}

function autoSaveProgress() {
  if (!solverState || solverState._completed) return;
  const { puzzle, playerName, locked, pencils, xed, elapsed } = solverState;
  const pencilsPlain = {};
  for (const [k, s] of Object.entries(pencils)) pencilsPlain[k] = [...s];
  api.saveProgress(puzzle.id, {
    player_name: playerName, locked,
    pencils: pencilsPlain, xed: [...xed],
    elapsed_seconds: elapsed,
    status: "inprogress",
  });
}

// ── Undo ───────────────────────────────────────────────────────────────────────
function pushUndo() {
  const { locked, pencils, xed } = solverState;
  const pencilsSnap = {};
  for (const [k, s] of Object.entries(pencils)) pencilsSnap[k] = new Set(s);
  solverState.undoStack.push({
    locked: { ...locked },
    pencils: pencilsSnap,
    xed: new Set(xed),
  });
}

function performUndo() {
  if (solverState.undoStack.length === 0) return;
  const snap = solverState.undoStack.pop();
  solverState.locked  = snap.locked;
  solverState.pencils = snap.pencils;
  solverState.xed     = snap.xed;
  rerenderAllCells();
  updateUndoBtn();
}

function updateUndoBtn() {
  const btn = document.getElementById("undo-btn");
  if (btn) btn.disabled = solverState.undoStack.length === 0;
}

// ── Render UI ──────────────────────────────────────────────────────────────────
function renderSolverUI() {
  const { puzzle } = solverState;
  document.getElementById("solver-puzzle-name").textContent = puzzle.name;
  updateTimerDisplay();
  renderCluesPanel();
  renderSolverGrid();
  renderToolbar();
  updateUndoBtn();

  // Show Finish or Submit depending on whether the puzzle has a solution key
  const hasSolution = puzzle.solution && Object.keys(puzzle.solution).length > 0;
  const submitBtn   = document.getElementById("submit-btn");
  submitBtn.textContent = hasSolution ? "✔ Submit" : "🏁 Finish";
  submitBtn.className   = hasSolution ? "btn btn-primary" : "btn btn-secondary";
}

function renderCluesPanel() {
  const { puzzle } = solverState;
  const n       = puzzle.individuals.length;
  const letters = getIndividualLetters(n);

  // Puzzle-wide clues
  const clues = puzzle.puzzle_clues || [];
  document.getElementById("puzzle-wide-clues").innerHTML = clues.length
    ? clues.map(c => `<li>${escHtml(c)}</li>`).join("")
    : `<li class="empty-clue">No puzzle-wide clues.</li>`;

  // Individual lineup — 2-column grid
  const lineup = document.getElementById("individual-lineup");
  lineup.innerHTML = puzzle.individuals.map((ind, i) => {
    const letter = letters[i];
    const clue   = (puzzle.individual_clues || {})[i] || "";
    return `
      <div class="individual-card" data-idx="${i}" id="ind-card-${i}"
           style="--ind-color:${ind.color}"
           onclick="selectIndividual(${i})">
        <div class="ind-card-header">
          <span class="ind-badge" style="background:${ind.color}">${letter}</span>
          <span class="ind-name">${escHtml(ind.name)}</span>
        </div>
        ${clue ? `<div class="ind-clue">${escHtml(clue)}</div>` : ""}
      </div>
    `;
  }).join("");
}

// ── Individual selection from left panel ───────────────────────────────────────
function selectIndividual(idx) {
  const prev = solverState.activeIndividual;

  if (prev === idx) {
    // Second click on same individual = toggle highlight only
    solverState.highlightedIndividual =
      solverState.highlightedIndividual === idx ? null : idx;
  } else {
    solverState.activeIndividual      = idx;
    solverState.highlightedIndividual = idx;
    // Selecting a new individual while eraser/X is active doesn't make sense —
    // switch back to pencil so clicks immediately do something useful
    if (solverState.activeTool === "eraser" || solverState.activeTool === "x") {
      solverState.activeTool = "pencil";
    }
  }

  document.querySelectorAll(".individual-card").forEach(card => {
    const i = parseInt(card.dataset.idx);
    card.classList.toggle("active",       i === solverState.activeIndividual);
    card.classList.toggle("highlighted",  i === solverState.highlightedIndividual);
  });

  rerenderPencils();
  renderToolbar();
}

// ── Toolbar ────────────────────────────────────────────────────────────────────
function renderToolbar() {
  const { activeTool, activeIndividual, puzzle } = solverState;
  const letters = getIndividualLetters(puzzle.individuals.length);
  const ind     = activeIndividual !== null ? puzzle.individuals[activeIndividual] : null;

  document.querySelectorAll(".tool-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === activeTool);
  });

  const indDisplay = document.getElementById("active-individual-display");
  if (indDisplay) {
    if (ind) {
      indDisplay.textContent  = `${letters[activeIndividual]} — ${ind.name}`;
      indDisplay.style.color  = ind.color;
      indDisplay.style.border = `1px solid ${ind.color}`;
    } else {
      indDisplay.textContent  = "No individual selected";
      indDisplay.style.color  = "var(--text2)";
      indDisplay.style.border = "1px solid var(--border)";
    }
  }
}

function setTool(tool) {
  if (!solverState) return;
  solverState.activeTool = tool;
  renderToolbar();
}

// Tool button wiring
document.querySelectorAll(".tool-btn").forEach(btn => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

document.getElementById("undo-btn").addEventListener("click", () => {
  if (!solverState) return;
  performUndo();
});

// ── Solver Grid ────────────────────────────────────────────────────────────────
function renderSolverGrid() {
  const { puzzle } = solverState;
  const { rows, cols } = puzzle;
  const grid = document.getElementById("solver-grid");
  grid.style.gridTemplateColumns = `repeat(${cols}, 56px)`;
  grid.innerHTML = "";

  // Build blocked cells from object library
  const blockedCells  = getSolverBlockedCells();
  const deletedCells  = new Set(puzzle.deleted_cells || []);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key  = `${r},${c}`;
      const cell = document.createElement("div");
      cell.className   = "solver-cell";
      cell.dataset.key = key;
      cell.id          = `cell-${key}`;

      if (deletedCells.has(key)) {
        cell.classList.add("solver-cell-deleted");
        grid.appendChild(cell);
        continue;
      }

      if (blockedCells.has(key)) cell.classList.add("solver-cell-blocked");

      const graphic = (puzzle.graphic_elements || {})[key];
      if (graphic) {
        const gEl = document.createElement("div");
        gEl.className  = "cell-graphic-bg";
        gEl.innerHTML  = renderObjectIcon(getObjectDef(graphic), 34);
        cell.appendChild(gEl);
      }

      cell.addEventListener("click",       () => onSolverCellClick(key));
      cell.addEventListener("contextmenu", e => { e.preventDefault(); onSolverCellRightClick(key); });

      grid.appendChild(cell);
    }
  }

  rerenderAllCells();

  // Apply dynamic cell sizing — also re-places room labels at the correct size
  computeAndApplyCellSize();
  if (_resizeObserver) _resizeObserver.disconnect();
  _resizeObserver = new ResizeObserver(() => computeAndApplyCellSize());
  const rightPanel = document.querySelector(".solver-right");
  if (rightPanel) _resizeObserver.observe(rightPanel);
  // Remove any previous resize listener before adding a new one
  if (_resizeHandler) window.removeEventListener("resize", _resizeHandler);
  _resizeHandler = () => computeAndApplyCellSize();
  window.addEventListener("resize", _resizeHandler, { passive: true });
}

function getSolverBlockedCells() {
  const blocked = new Set();
  const graphic_elements = solverState.puzzle.graphic_elements || {};
  for (const [key, objId] of Object.entries(graphic_elements)) {
    if (getObjectDef(objId).blocks) blocked.add(key);
  }
  return blocked;
}

function updateIndividualCardStates() {
  const lockedIndividuals = new Set(Object.values(solverState.locked));
  document.querySelectorAll(".individual-card").forEach(card => {
    const idx = parseInt(card.dataset.idx);
    card.classList.toggle("individual-locked", lockedIndividuals.has(idx));
  });
}

function rerenderAllCells() {
  const { puzzle } = solverState;
  const { rows, cols } = puzzle;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      renderCell(`${r},${c}`);
  updateUndoBtn();
  updateIndividualCardStates();
}

function renderCell(key) {
  const cell = document.getElementById(`cell-${key}`);
  if (!cell) return;
  const { puzzle, locked, pencils, xed, highlightedIndividual } = solverState;
  const n       = puzzle.individuals.length;
  const letters = getIndividualLetters(n);
  const blocked = getSolverBlockedCells();
  const deleted = new Set(solverState.puzzle.deleted_cells || []);

  cell.querySelectorAll(".cell-x,.cell-locked,.cell-pencils").forEach(el => el.remove());
  cell.classList.remove("xed","locked-cell");

  if (deleted.has(key)) return;

  // Blocked cells: show graphic only, no interaction markers
  if (blocked.has(key)) return;

  if (xed.has(key)) {
    cell.classList.add("xed");
    const x = document.createElement("div");
    x.className   = "cell-x";
    x.textContent = "✕";
    cell.appendChild(x);
    return;
  }

  const lockedIdx = locked[key];
  if (lockedIdx !== undefined) {
    cell.classList.add("locked-cell");
    const ind = puzzle.individuals[lockedIdx];
    const el  = document.createElement("div");
    el.className   = "cell-locked";
    el.textContent = letters[lockedIdx];
    el.style.color = ind.color;
    cell.appendChild(el);
    return;
  }

  const cellPencils = pencils[key];
  if (cellPencils && cellPencils.size > 0) {
    const el = document.createElement("div");
    el.className = "cell-pencils";
    [...cellPencils].sort().forEach(idx => {
      const ind  = puzzle.individuals[idx];
      const span = document.createElement("span");
      span.className   = "pencil-mark";
      span.textContent = letters[idx];
      span.style.color = ind.color;
      if (highlightedIndividual === idx) span.classList.add("pencil-highlighted");
      el.appendChild(span);
    });
    cell.appendChild(el);
  }
}

function rerenderPencils() {
  const { puzzle } = solverState;
  const { rows, cols } = puzzle;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      renderCell(`${r},${c}`);
}

// ── Cell interaction ───────────────────────────────────────────────────────────
function onSolverCellClick(key) {
  const { activeTool, activeIndividual, xed, locked, puzzle } = solverState;
  const blocked = getSolverBlockedCells();
  const deleted = new Set(puzzle.deleted_cells || []);
  if (blocked.has(key) || deleted.has(key)) return; // never interact with blocked cells

  pushUndo();

  if (activeTool === "x") {
    if (locked[key] !== undefined) { solverState.undoStack.pop(); return; }
    if (xed.has(key)) xed.delete(key);
    else               xed.add(key);
    renderCell(key);
    return;
  }

  if (activeTool === "eraser") {
    if (xed.has(key))              { xed.delete(key); }
    else if (locked[key] !== undefined) { unlockCellDirect(key); }
    else { erasePencils(key); }
    rerenderAllCells();
    return;
  }

  // pencil or pen requires an individual selected
  if (activeIndividual === null) {
    solverState.undoStack.pop();
    mdAlert("Select an individual from the left panel first.");
    return;
  }

  if (xed.has(key)) { solverState.undoStack.pop(); return; }

  if (activeTool === "pencil") {
    applyPencil(key, activeIndividual);
  } else if (activeTool === "pen") {
    applyLock(key, activeIndividual);
  }
}

function onSolverCellRightClick(key) {
  const deleted = new Set(solverState.puzzle.deleted_cells || []);
  const blocked = getSolverBlockedCells();
  if (blocked.has(key) || deleted.has(key)) return;
  if (blocked.has(key)) return;
  const { xed, locked } = solverState;
  if (locked[key] !== undefined) return;
  pushUndo();
  if (xed.has(key)) xed.delete(key);
  else               xed.add(key);
  renderCell(key);
}

// ── Tool actions ───────────────────────────────────────────────────────────────
function applyPencil(key, idx) {
  const { pencils, locked, xed, puzzle } = solverState;

  // Check: is this individual already locked somewhere?
  const alreadyLocked = Object.entries(locked).find(([k, v]) => v === idx);
  if (alreadyLocked) {
    solverState.undoStack.pop();
    mdAlert(`${puzzle.individuals[idx].name} is already placed at (${alreadyLocked[0]}).`);
    return;
  }

  if (!pencils[key]) pencils[key] = new Set();
  if (pencils[key].has(idx)) pencils[key].delete(idx);
  else                        pencils[key].add(idx);
  renderCell(key);
  updateUndoBtn();
}

function applyLock(key, idx) {
  const { puzzle, locked, pencils, xed } = solverState;
  const { rows, cols } = puzzle;

  // Already locked here — toggle off
  if (locked[key] === idx) {
    unlockCellDirect(key);
    rerenderAllCells();
    return;
  }

  // Check: individual already locked elsewhere
  const alreadyLocked = Object.entries(locked).find(([k, v]) => v === idx);
  if (alreadyLocked) {
    solverState.undoStack.pop();
    mdAlert(`${puzzle.individuals[idx].name} is already placed at (${alreadyLocked[0]}). Unlock them first.`);
    return;
  }

  // Check: cell already has someone else locked
  if (locked[key] !== undefined) {
    solverState.undoStack.pop();
    mdAlert("This cell already has someone locked in. Erase it first.");
    return;
  }

  locked[key] = idx;

  // Remove pencil marks for this individual everywhere else
  for (const [k, s] of Object.entries(pencils)) {
    if (k !== key) s.delete(idx);
  }
  delete pencils[key];

  // X out rest of row and column
  const [r, c] = key.split(",").map(Number);
  for (let cc = 0; cc < cols; cc++) {
    const k = `${r},${cc}`;
    if (k !== key && locked[k] === undefined) xed.add(k);
  }
  for (let rr = 0; rr < rows; rr++) {
    const k = `${rr},${c}`;
    if (k !== key && locked[k] === undefined) xed.add(k);
  }

  rerenderAllCells();
}

function unlockCellDirect(key) {
  delete solverState.locked[key];
}

function erasePencils(key) {
  delete solverState.pencils[key];
}

// ── Submit / Finish ────────────────────────────────────────────────────────────
document.getElementById("submit-btn").addEventListener("click", async () => {
  const { puzzle, locked, elapsed, playerName } = solverState;
  const hasSolution = puzzle.solution && Object.keys(puzzle.solution).length > 0;

  if (!hasSolution) {
    // Finish mode — no answer key yet, save as unsubmitted and go home
    stopTimer();
    solverState._completed = true;
    await api.saveProgress(puzzle.id, {
      player_name: playerName, locked,
      pencils: (() => {
        const p = {};
        for (const [k, s] of Object.entries(solverState.pencils)) p[k] = [...s];
        return p;
      })(),
      xed: [...solverState.xed],
      elapsed_seconds: elapsed,
      status: "unsubmitted",
    });
    mdAlert(`✅ Progress saved as finished (unsubmitted). When an answer key is added to this puzzle, come back and hit Submit to check your work.`);
    loadHome();
    return;
  }

  // Submit mode — check against answer key
  stopTimer();
  const result = await api.submit(puzzle.id, {
    locked, elapsed_seconds: elapsed, player_name: playerName,
  });

  if (result.correct === null) {
    mdAlert("⚠️ No solution is defined for this puzzle — can't verify.");
    startTimer();
    return;
  }

  if (result.correct) {
    await api.resetProgress(puzzle.id, playerName);
    // Mark as done so autoSaveProgress (triggered by showView) doesn't re-save
    solverState._completed = true;
    mdAlert(`🎉 Correct! You solved "${puzzle.name}" in ${formatTime(elapsed)}.\nSaved to the leaderboard as ${playerName}.`);
    loadHome();
  } else {
    mdAlert("❌ Not quite — there are errors in your solution. Keep going!");
    startTimer();
  }
});

// ── Reset ──────────────────────────────────────────────────────────────────────
document.getElementById("reset-btn").addEventListener("click", async () => {
  if (!await mdConfirm("Reset all progress on this puzzle?")) return;
  stopTimer();
  await api.resetProgress(solverState.puzzle.id, solverState.playerName);
  solverState.locked     = {};
  solverState.pencils    = {};
  solverState.xed        = new Set();
  solverState.elapsed    = 0;
  solverState.undoStack  = [];
  rerenderAllCells();
  updateTimerDisplay();
  startTimer();
});

// ── Back ───────────────────────────────────────────────────────────────────────
document.getElementById("solver-back-btn").addEventListener("click", () => {
  stopTimer();
  autoSaveProgress();
  // Clean up resize listeners so they don't accumulate across sessions
  if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
  if (_resizeHandler)  { window.removeEventListener("resize", _resizeHandler); _resizeHandler = null; }
  loadHome();
});


