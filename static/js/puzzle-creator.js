// ── Puzzle Creator ─────────────────────────────────────────────────────────────

let creatorState = null;

function getIndividualLetters(n) {
  const letters = [];
  for (let i = 0; i < n - 1; i++) letters.push(String.fromCharCode(65 + i));
  letters.push("V");
  return letters;
}

// ── Color generation ───────────────────────────────────────────────────────────
// Generates n visually distinct colors by spreading hues evenly around the
// color wheel with fixed saturation/lightness for the dark theme.
function generateDistinctColors(n) {
  const colors = [];
  for (let i = 0; i < n; i++) {
    const hue = Math.round((i / n) * 360);
    colors.push(`hsl(${hue},70%,58%)`);
  }
  return colors;
}

// Seeded palette for up to 20 individuals — hand-tuned for visual distinctness
const INDIVIDUAL_PALETTE = [
  "#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6",
  "#1abc9c","#e67e22","#e91e63","#00bcd4","#8bc34a",
  "#ff5722","#673ab7","#009688","#ffc107","#3f51b5",
  "#cddc39","#ff9800","#795548","#607d8b","#f06292",
];

// Room palette — distinct from individual palette hues
const ROOM_PALETTE = [
  "#c0392b","#2471a3","#1e8449","#d68910","#76448a",
  "#117a65","#ca6f1e","#943126","#1a5276","#196f3d",
  "#7d6608","#6c3483","#0e6655","#784212","#154360",
];
let roomPaletteIndex = 0;

function openCreator(puzzleId) {
  creatorState = {
    puzzleId,
    puzzle: null,
    graphicElements: {},
    solution: {},
    rooms: {},
    activeRoomId: null,
    activeObject: null,
    deletedCells: new Set(),  // cells removed from the grid
  };
  showView("creator");
  document.getElementById("creator-title").textContent = puzzleId ? "Edit Puzzle" : "New Puzzle";

  if (puzzleId) {
    api.getPuzzle(puzzleId).then(p => {
      creatorState.puzzle          = p;
      creatorState.graphicElements = p.graphic_elements || {};
      creatorState.solution        = p.solution || {};
      creatorState.rooms           = p.rooms || {};
      creatorState.deletedCells    = new Set(p.deleted_cells || []);
      populateCreatorForm(p);
    });
  } else {
    resetCreatorForm();
  }
}

function resetCreatorForm() {
  document.getElementById("puzzle-name-input").value = "";
  document.getElementById("puzzle-rows-input").value = 6;
  document.getElementById("puzzle-cols-input").value = 6;
  document.getElementById("puzzle-clues-input").value = "";
  renderIndividualsEditor(6);
  renderObjectToolbar();
  renderCreatorGrid();
}

function populateCreatorForm(p) {
  document.getElementById("puzzle-name-input").value = p.name;
  document.getElementById("puzzle-rows-input").value = p.rows;
  document.getElementById("puzzle-cols-input").value = p.cols;
  document.getElementById("puzzle-difficulty-input").value = p.difficulty || "";
  document.getElementById("puzzle-clues-input").value = (p.puzzle_clues || []).join("\n");
  renderIndividualsEditor(p.individuals.length, p.individuals, p.individual_clues || {});
  renderObjectToolbar();
  renderCreatorGrid();
}

function getCreatorDimensions() {
  const rows = parseInt(document.getElementById("puzzle-rows-input").value) || 5;
  const cols = parseInt(document.getElementById("puzzle-cols-input").value) || 6;
  return { rows, cols };
}

function getNumIndividuals() {
  const { rows, cols } = getCreatorDimensions();
  return Math.min(rows, cols);
}

document.getElementById("puzzle-rows-input").addEventListener("input", () => {
  renderIndividualsEditor(getNumIndividuals());
  renderCreatorGrid();
});
document.getElementById("puzzle-cols-input").addEventListener("input", () => {
  renderIndividualsEditor(getNumIndividuals());
  renderCreatorGrid();
});

function renderIndividualsEditor(n, existing = [], existingClues = {}) {
  const letters = getIndividualLetters(n);
  const container = document.getElementById("individuals-editor");
  container.innerHTML = letters.map((letter, i) => {
    const ind   = existing[i] || {};
    const clue  = existingClues[i] || "";
    const color = ind.color || INDIVIDUAL_PALETTE[i % INDIVIDUAL_PALETTE.length];
    const name  = ind.name  || "";
    return `
      <div class="individual-row" data-index="${i}">
        <span class="ind-letter" style="color:${color};border-color:${color}">${letter}</span>
        <input class="ind-name-input"  type="text"  placeholder="Name (starts with ${letter})" value="${escHtml(name)}" />
        <input class="ind-color-input" type="color"  value="${color}" title="Color for ${letter}" />
        <input class="ind-clue-input"  type="text"  placeholder="Clue for this individual…" value="${escHtml(clue)}" />
      </div>
    `;
  }).join("");
}

function getIndividualsFromForm() {
  const n       = getNumIndividuals();
  const letters = getIndividualLetters(n);
  const rows    = document.querySelectorAll("#individuals-editor .individual-row");
  const individuals = [], individual_clues = {};
  rows.forEach((row, i) => {
    const nameVal = row.querySelector(".ind-name-input").value.trim();
    const color   = row.querySelector(".ind-color-input").value;
    const clue    = row.querySelector(".ind-clue-input").value.trim();
    individuals.push({ name: nameVal || letters[i], color });
    if (clue) individual_clues[i] = clue;
  });
  return { individuals, individual_clues };
}

// ── Creator Grid ───────────────────────────────────────────────────────────────
// Modes: "graphic" | "solution" | "rooms"
let creatorGridMode = "graphic";

function renderCreatorGrid() {
  const { rows, cols } = getCreatorDimensions();
  const { individuals } = getIndividualsFromForm();
  const letters         = getIndividualLetters(individuals.length);
  const cellRoomMap     = buildCellRoomMap(creatorState.rooms);
  const blockedCells    = getBlockedCells();

  const grid = document.getElementById("creator-grid");
  grid.style.gridTemplateColumns = `repeat(${cols}, 48px)`;
  grid.style.setProperty("--cell-sz", "48px");
  grid.innerHTML = "";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      const el  = document.createElement("div");
      el.className  = "creator-cell";
      el.dataset.key = key;

      // Deleted cell — render as void, skip all content
      if (creatorState.deletedCells.has(key)) {
        el.classList.add("creator-cell-deleted");
        el.title = "Right-click to restore";
        el.addEventListener("contextmenu", e => { e.preventDefault(); toggleDeleteCell(key); });
        grid.appendChild(el);
        continue;
      }

      // Room tint
      const roomId = cellRoomMap[key];
      if (roomId) {
        const room  = creatorState.rooms[roomId];
        const alpha = creatorState.activeRoomId === roomId ? 0.38 : 0.18;
        el.style.backgroundColor = hexToRgba(room._color || "#fff", alpha);
      }

      // Blocked overlay
      if (blockedCells.has(key)) el.classList.add("creator-cell-blocked");

      const graphic = creatorState.graphicElements[key];
      const solIdx  = creatorState.solution[key];
      let inner = "";
      if (graphic) {
        const obj = getObjectDef(graphic);
        inner += `<span class="cell-graphic">${renderObjectIcon(obj, 26)}</span>`;
      }
      if (solIdx !== undefined && !blockedCells.has(key)) {
        const ind    = individuals[solIdx] || {};
        const letter = letters[solIdx] || "?";
        inner += `<span class="cell-solution-marker" style="color:${ind.color||"#333"}">${letter}</span>`;
      }
      el.innerHTML = inner || "";
      el.addEventListener("click", () => onCreatorCellClick(key, r, c));
      el.addEventListener("contextmenu", e => { e.preventDefault(); toggleDeleteCell(key); });
      grid.appendChild(el);
    }
  }

  renderRoomDecorations(creatorState.rooms, rows, cols, key =>
    grid.querySelector(`[data-key="${key}"]`),
    [...creatorState.deletedCells]
  );
}

// Returns set of cell keys whose graphic blocks placement
function getBlockedCells() {
  const blocked = new Set();
  for (const [key, objId] of Object.entries(creatorState.graphicElements)) {
    const obj = getObjectDef(objId);
    if (obj.blocks) blocked.add(key);
  }
  return blocked;
}

function onCreatorCellClick(key, r, c) {
  if      (creatorGridMode === "graphic")  applyObjectToCell(key);
  else if (creatorGridMode === "solution") showSolutionPicker(key, r, c);
  else if (creatorGridMode === "rooms")    onRoomCellClick(key);
}

function toggleDeleteCell(key) {
  if (creatorState.deletedCells.has(key)) {
    creatorState.deletedCells.delete(key);
  } else {
    // Clean up any data for this cell when deleting it
    creatorState.deletedCells.add(key);
    delete creatorState.graphicElements[key];
    delete creatorState.solution[key];
    // Remove from any room
    for (const room of Object.values(creatorState.rooms)) {
      room.cells = room.cells.filter(k => k !== key);
    }
  }
  renderCreatorGrid();
}

// ── Object toolbar (graphic mode) ──────────────────────────────────────────────
function renderObjectToolbar() {
  const toolbar = document.getElementById("object-toolbar");
  if (!toolbar) return;

  toolbar.innerHTML = OBJECT_LIBRARY.map(obj => `
    <button class="obj-tool-btn ${creatorState.activeObject === obj.id ? "active" : ""}"
            data-id="${obj.id}" onclick="selectObjectTool('${obj.id}')"
            title="${escHtml(obj.label)}${obj.blocks ? " (blocks placement)" : ""}">
      ${renderObjectIcon(obj, 22)}
      <span class="obj-tool-label">${escHtml(obj.label)}</span>
      ${obj.blocks ? '<span class="blocks-dot" title="Blocks placement">●</span>' : ""}
    </button>
  `).join("") + `
    <button class="obj-tool-btn obj-tool-eraser ${creatorState.activeObject === "__eraser__" ? "active" : ""}"
            onclick="selectObjectTool('__eraser__')" title="Erase object">
      🧹 <span class="obj-tool-label">Erase</span>
    </button>
  `;
}

function selectObjectTool(id) {
  creatorState.activeObject = creatorState.activeObject === id ? null : id;
  renderObjectToolbar();
}

function applyObjectToCell(key) {
  const { activeObject } = creatorState;
  if (!activeObject) return;

  if (activeObject === "__eraser__") {
    delete creatorState.graphicElements[key];
  } else if (creatorState.graphicElements[key] === activeObject) {
    // Clicking the same object on a cell that already has it — remove it
    delete creatorState.graphicElements[key];
  } else {
    creatorState.graphicElements[key] = activeObject;
    if (getObjectDef(activeObject).blocks) delete creatorState.solution[key];
  }
  renderCreatorGrid();
}

function showSolutionPicker(key, r, c) {
  const blocked = getBlockedCells();
  if (blocked.has(key)) {
    mdAlert("This cell contains an object that blocks placement.");
    return;
  }
  const { individuals } = getIndividualsFromForm();
  const letters  = getIndividualLetters(individuals.length);
  const existing = creatorState.solution[key];

  const options = individuals.map((ind, i) =>
    `<button class="solution-btn ${existing === i ? "active" : ""}" data-idx="${i}"
             style="border-color:${ind.color};color:${ind.color}">
       ${letters[i]} — ${escHtml(ind.name)}
     </button>`
  ).join("");

  const modal = showModal(`
    <h3>Solution for (${r},${c})</h3>
    <div class="solution-options">${options}</div>
    <button class="btn btn-ghost" id="clear-sol-btn">Clear</button>
  `);
  modal.querySelectorAll(".solution-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      creatorState.solution[key] = parseInt(btn.dataset.idx);
      closeModal();
      renderCreatorGrid();
    });
  });
  modal.querySelector("#clear-sol-btn").addEventListener("click", () => {
    delete creatorState.solution[key];
    closeModal();
    renderCreatorGrid();
  });
}

// ── Solution QA ────────────────────────────────────────────────────────────────
function validateSolution(solution, individuals, rows, cols) {
  const errors = [];
  if (Object.keys(solution).length === 0) return errors;

  // Check for placements on blocked cells
  const blocked = getBlockedCells();
  for (const key of Object.keys(solution)) {
    if (blocked.has(key)) {
      const [r, c] = key.split(",").map(Number);
      errors.push(`Cell (row ${r}, col ${c}) has a blocking object — no one can be placed there.`);
    }
  }

  // Check for placements on deleted cells
  for (const key of Object.keys(solution)) {
    if (creatorState.deletedCells.has(key)) {
      const [r, c] = key.split(",").map(Number);
      errors.push(`Cell (row ${r}, col ${c}) is deleted — no one can be placed there.`);
    }
  }

  // Count placements per individual
  const counts = {};
  for (const idx of Object.values(solution)) {
    counts[idx] = (counts[idx] || 0) + 1;
  }
  for (const [idx, count] of Object.entries(counts)) {
    if (count > 1) {
      errors.push(`${individuals[idx]?.name || "Individual " + idx} is placed ${count} times (must be at most once).`);
    }
  }

  // Check at most one per row and one per column
  const rowOccupancy = {}, colOccupancy = {};
  for (const [key, idx] of Object.entries(solution)) {
    const [r, c] = key.split(",").map(Number);
    if (rowOccupancy[r] !== undefined) {
      errors.push(`Row ${r} has more than one person placed.`);
    } else rowOccupancy[r] = idx;
    if (colOccupancy[c] !== undefined) {
      errors.push(`Column ${c} has more than one person placed.`);
    } else colOccupancy[c] = idx;
  }

  return [...new Set(errors)];
}

// ── Room painting ──────────────────────────────────────────────────────────────
function onRoomCellClick(key) {
  const cellRoomMap  = buildCellRoomMap(creatorState.rooms);
  const existingRoom = cellRoomMap[key];

  if (creatorState.activeRoomId) {
    const room = creatorState.rooms[creatorState.activeRoomId];
    const idx  = room.cells.indexOf(key);
    if (idx >= 0) {
      room.cells.splice(idx, 1);
      if (room.cells.length === 0) {
        delete creatorState.rooms[creatorState.activeRoomId];
        creatorState.activeRoomId = null;
        renderRoomPanel();
      }
    } else {
      // Remove from other room first
      if (existingRoom && existingRoom !== creatorState.activeRoomId) {
        const other = creatorState.rooms[existingRoom];
        other.cells = other.cells.filter(k => k !== key);
        if (other.cells.length === 0) delete creatorState.rooms[existingRoom];
      }
      room.cells.push(key);
    }
  } else {
    if (existingRoom) {
      creatorState.activeRoomId = existingRoom;
      renderRoomPanel();
    }
  }
  renderCreatorGrid();
}

function createNewRoom() {
  const color  = ROOM_PALETTE[roomPaletteIndex++ % ROOM_PALETTE.length];
  const roomId = "room_" + Date.now();
  creatorState.rooms[roomId] = { name: "", cells: [], _color: color };
  creatorState.activeRoomId  = roomId;
  renderRoomPanel();
  renderCreatorGrid();
}

function selectRoom(roomId) {
  creatorState.activeRoomId = creatorState.activeRoomId === roomId ? null : roomId;
  renderRoomPanel();
  renderCreatorGrid();
}

function deleteRoom(roomId) {
  delete creatorState.rooms[roomId];
  if (creatorState.activeRoomId === roomId) creatorState.activeRoomId = null;
  renderRoomPanel();
  renderCreatorGrid();
}

function renameRoom(roomId, name) {
  if (creatorState.rooms[roomId]) creatorState.rooms[roomId].name = name;
  renderCreatorGrid();
}

function renderRoomPanel() {
  const panel = document.getElementById("room-panel");
  if (!panel) return;
  const entries = Object.entries(creatorState.rooms);
  panel.innerHTML = `
    <div class="room-panel-header">
      Click a room to select it, then click cells on the grid to add/remove them.
    </div>
    ${entries.map(([id, room]) => `
      <div class="room-entry ${creatorState.activeRoomId === id ? "active-room" : ""}"
           style="--room-clr:${room._color||"#aaa"}">
        <div class="room-entry-top">
          <span class="room-swatch" style="background:${room._color||"#aaa"}"></span>
          <input class="room-name-input" type="text" placeholder="Room name…"
                 value="${escHtml(room.name)}"
                 oninput="renameRoom('${id}', this.value)" />
          <button class="btn btn-sm ${creatorState.activeRoomId===id ? "btn-primary":"btn-ghost"}"
                  onclick="selectRoom('${id}')">
            ${creatorState.activeRoomId===id ? "✏️ Painting":"Select"}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteRoom('${id}')">✕</button>
        </div>
        <div class="room-cell-count">${room.cells.length} cell${room.cells.length!==1?"s":""}</div>
      </div>
    `).join("")}
    <button class="btn btn-secondary" onclick="createNewRoom()" style="margin-top:0.5rem;width:100%">＋ New Room</button>
  `;
}

// ── Mode toggles ───────────────────────────────────────────────────────────────
function setCreatorMode(mode) {
  creatorGridMode = mode;
  ["graphic","solution","rooms"].forEach(m => {
    document.getElementById(`creator-mode-${m}`)
      .classList.toggle("active", m === mode);
    const hint = document.getElementById(`mode-hint-${m}`);
    if (hint) hint.classList.toggle("hidden", m !== mode);
  });
  const roomPanel   = document.getElementById("room-panel");
  const objToolbar  = document.getElementById("object-toolbar");
  if (mode === "rooms") {
    roomPanel.classList.remove("hidden");
    if (objToolbar) objToolbar.classList.add("hidden");
    renderRoomPanel();
  } else if (mode === "graphic") {
    roomPanel.classList.add("hidden");
    if (objToolbar) { objToolbar.classList.remove("hidden"); renderObjectToolbar(); }
  } else {
    roomPanel.classList.add("hidden");
    if (objToolbar) objToolbar.classList.add("hidden");
  }
}

document.getElementById("creator-mode-graphic").addEventListener("click",  () => setCreatorMode("graphic"));
document.getElementById("creator-mode-solution").addEventListener("click",  () => setCreatorMode("solution"));
document.getElementById("creator-mode-rooms").addEventListener("click",    () => setCreatorMode("rooms"));

// ── Save puzzle ────────────────────────────────────────────────────────────────
document.getElementById("save-puzzle-btn").addEventListener("click", async () => {
  const name = document.getElementById("puzzle-name-input").value.trim();
  if (!name) { await mdAlert("Please enter a puzzle name."); return; }

  const { rows, cols }                    = getCreatorDimensions();
  const { individuals, individual_clues } = getIndividualsFromForm();
  const difficulty = document.getElementById("puzzle-difficulty-input").value;
  const puzzle_clues = document.getElementById("puzzle-clues-input").value
    .split("\n").map(s => s.trim()).filter(Boolean);

  // QA solution
  const errs = validateSolution(creatorState.solution, individuals, rows, cols);
  if (errs.length > 0) {
    const proceed = await mdConfirm(
      "⚠️ Solution has issues:\n\n" + errs.join("\n") + "\n\nSave anyway?"
    );
    if (!proceed) return;
  }

  const payload = {
    name, rows, cols, individuals, puzzle_clues, individual_clues,
    difficulty,
    graphic_elements: creatorState.graphicElements,
    rooms:            creatorState.rooms,
    solution:         creatorState.solution,
    deleted_cells:    [...creatorState.deletedCells],
  };

  if (creatorState.puzzleId) {
    await api.updatePuzzle(creatorState.puzzleId, payload);
  } else {
    await api.createPuzzle(payload);
  }
  loadHome();
});

document.getElementById("cancel-creator-btn").addEventListener("click", loadHome);

// ── Modal ──────────────────────────────────────────────────────────────────────
function showModal(html) {
  const overlay = document.getElementById("modal-overlay");
  const box     = document.getElementById("modal-box");
  box.innerHTML = html + `<button class="modal-close btn btn-ghost" id="modal-close-btn">✕</button>`;
  overlay.classList.remove("hidden");
  box.querySelector("#modal-close-btn").addEventListener("click", closeModal);
  return box;
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

document.getElementById("modal-overlay").addEventListener("click", e => {
  // Only close creator modals (which have a .modal-close button) on backdrop click.
  // mdAlert/mdConfirm manage their own backdrop behaviour.
  const box = document.getElementById("modal-box");
  if (e.target === document.getElementById("modal-overlay") && box.querySelector(".modal-close")) {
    closeModal();
  }
});

// ── Utilities ──────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Exposed for main.js
function editPuzzle(id) { openCreator(id); }
