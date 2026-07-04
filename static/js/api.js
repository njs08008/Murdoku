const BASE = "/api";

async function apiFetch(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const api = {
  listPuzzles:   ()       => apiFetch("/puzzles"),
  getPuzzle:     (id)     => apiFetch(`/puzzles/${id}`),
  createPuzzle:  (data)   => apiFetch("/puzzles",  { method: "POST",   body: JSON.stringify(data) }),
  updatePuzzle:  (id, d)  => apiFetch(`/puzzles/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deletePuzzle:  (id)     => apiFetch(`/puzzles/${id}`, { method: "DELETE" }),

  getProgress:   (id, player) => apiFetch(`/puzzles/${id}/progress?player=${encodeURIComponent(player)}`),
  saveProgress:  (id, d)  => apiFetch(`/puzzles/${id}/progress`, { method: "PUT",    body: JSON.stringify(d) }),
  resetProgress: (id, player) => apiFetch(`/puzzles/${id}/progress?player=${encodeURIComponent(player)}`, { method: "DELETE" }),

  submit: (id, data)      => apiFetch(`/puzzles/${id}/submit`,   { method: "POST",   body: JSON.stringify(data) }),

  getLeaderboard:      (puzzleId) => apiFetch(`/leaderboard${puzzleId ? "?puzzle_id=" + puzzleId : ""}`),
  deleteLeaderboardEntry: (id)    => apiFetch(`/leaderboard/${id}`, { method: "DELETE" }),

  getObjects:         ()            => apiFetch("/objects"),
  saveObjects:        (data)        => apiFetch("/objects", { method: "PUT", body: JSON.stringify(data) }),
  uploadObjectImage:  (filename, data) => apiFetch("/objects/upload", { method: "POST", body: JSON.stringify({ filename, data }) }),
  deleteObjectImage:  (url)         => apiFetch("/objects/image", { method: "DELETE", body: JSON.stringify({ url }) }),

  getAllProgress: ()       => apiFetch("/progress/all"),
};
