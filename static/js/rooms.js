// ── Shared room utilities ──────────────────────────────────────────────────────

function buildCellRoomMap(rooms) {
  const map = {};
  for (const [roomId, room] of Object.entries(rooms || {})) {
    for (const key of (room.cells || [])) map[key] = roomId;
  }
  return map;
}

function getRoomBorders(key, cellRoomMap, rows, cols) {
  const [r, c] = key.split(",").map(Number);
  const myRoom = cellRoomMap[key] || null;
  function neighborRoom(nr, nc) {
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return "__OUTSIDE__";
    return cellRoomMap[`${nr},${nc}`] || null;
  }
  return {
    top:    neighborRoom(r - 1, c) !== myRoom,
    right:  neighborRoom(r, c + 1) !== myRoom,
    bottom: neighborRoom(r + 1, c) !== myRoom,
    left:   neighborRoom(r, c - 1) !== myRoom,
  };
}

function applyRoomBorders(cellEl, borders) {
  // Use inset box-shadows so room borders don't affect cell size or gap spacing
  const W     = "3px";
  const COLOR = "var(--room-border, #c9a84c)";
  const shadows = [];
  if (borders.top)    shadows.push(`inset 0 ${W} 0 0 ${COLOR}`);
  if (borders.bottom) shadows.push(`inset 0 -${W} 0 0 ${COLOR}`);
  if (borders.left)   shadows.push(`inset ${W} 0 0 0 ${COLOR}`);
  if (borders.right)  shadows.push(`inset -${W} 0 0 0 ${COLOR}`);
  cellEl.style.boxShadow = shadows.length ? shadows.join(", ") : "none";
  // Clear any previously set border overrides
  cellEl.style.borderTop    = "";
  cellEl.style.borderRight  = "";
  cellEl.style.borderBottom = "";
  cellEl.style.borderLeft   = "";
}

/**
 * Find the bottom-row cells of a room sorted by column, for label placement.
 * Returns { anchorKey, bottomRowCells: ["r,c",...] sorted left→right }
 */
function getRoomBottomRow(cells) {
  if (!cells || cells.length === 0) return null;
  let maxRow = -1;
  for (const key of cells) {
    const r = parseInt(key.split(",")[0]);
    if (r > maxRow) maxRow = r;
  }
  const bottomCells = cells
    .filter(k => parseInt(k.split(",")[0]) === maxRow)
    .sort((a, b) => parseInt(a.split(",")[1]) - parseInt(b.split(",")[1]));
  return { anchorKey: bottomCells[0], bottomRowCells: bottomCells };
}

/**
 * Render room borders and name labels.
 * Labels are rendered as absolutely-positioned overlays on the grid container,
 * spanning the full width of the room's bottom row so they never truncate.
 *
 * @param {Object}   rooms      puzzle.rooms
 * @param {number}   rows
 * @param {number}   cols
 * @param {Function} getCellEl  (key) => HTMLElement | null
 */
function renderRoomDecorations(rooms, rows, cols, getCellEl, deletedCells) {
  const cellRoomMap = buildCellRoomMap(rooms);
  const deleted = new Set(deletedCells || []);

  // Remove old labels
  document.querySelectorAll(".room-label").forEach(el => el.remove());

  // Apply borders to every cell — skip deleted ones
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key    = `${r},${c}`;
      const cellEl = getCellEl(key);
      if (!cellEl) continue;
      if (deleted.has(key)) {
        // Deleted cells get no borders/shadows at all
        cellEl.style.boxShadow = "none";
        continue;
      }
      const borders = getRoomBorders(key, cellRoomMap, rows, cols);
      applyRoomBorders(cellEl, borders);
    }
  }

  // Place labels spanning across the room's bottom row
  // Use math rather than getBoundingClientRect so it works after JS resizes the grid
  for (const [roomId, room] of Object.entries(rooms || {})) {
    if (!room.name) continue;
    const info = getRoomBottomRow(room.cells || []);
    if (!info) continue;

    const { anchorKey, bottomRowCells } = info;
    const anchorEl = getCellEl(anchorKey);
    if (!anchorEl) continue;
    const gridEl = anchorEl.parentElement;
    if (!gridEl) continue;

    // Read the actual computed cell size (set by JS via --cell-sz, or fall back to CSS default)
    const cellSzStr = gridEl.style.getPropertyValue("--cell-sz") ||
                      getComputedStyle(gridEl).getPropertyValue("--cell-sz") || "56px";
    const cellSz  = parseInt(cellSzStr) || 56;

    // Read actual gap and padding from the computed style so this works for
    // both the solver grid (gap:3px, padding:4px) and creator grid (gap:2px, padding:3px)
    const cs      = getComputedStyle(gridEl);
    const gap     = parseInt(cs.gap || cs.columnGap || cs.rowGap) || 3;
    const padding = parseInt(cs.padding || cs.paddingLeft) || 4;

    const [anchorR, anchorC] = anchorKey.split(",").map(Number);
    const lastKey  = bottomRowCells[bottomRowCells.length - 1];
    const lastC    = parseInt(lastKey.split(",")[1]);
    const spanCols = lastC - anchorC + 1;

    // Left = padding + anchorC * (cellSz + gap)
    const left   = padding + anchorC * (cellSz + gap);
    // Width = spanCols * cellSz + (spanCols - 1) * gap
    const width  = spanCols * cellSz + (spanCols - 1) * gap;
    // Bottom = padding + (rows - 1 - anchorR) * (cellSz + gap)  [distance from grid bottom]
    const bottom = padding + (rows - 1 - anchorR) * (cellSz + gap);

    const label = document.createElement("div");
    label.className = "room-label";
    label.textContent = room.name;
    label.style.position   = "absolute";
    label.style.left       = left + "px";
    label.style.minWidth   = width + "px";
    label.style.bottom     = bottom + "px";
    label.style.height     = "14px";
    label.style.lineHeight = "14px";
    label.style.whiteSpace = "nowrap";
    label.style.overflow   = "visible";
    label.style.width      = "max-content";

    gridEl.style.position = "relative";
    gridEl.appendChild(label);
  }
}