import base64
import json
import os
import uuid
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "static"), static_url_path="")
CORS(app)

PUZZLES_DIR      = os.path.join(BASE_DIR, "data", "puzzles")
LEADERBOARD_FILE = os.path.join(BASE_DIR, "data", "leaderboard.json")
OBJECTS_FILE     = os.path.join(BASE_DIR, "data", "objects.json")
IMAGES_DIR       = os.path.join(BASE_DIR, "static", "images", "objects")

os.makedirs(PUZZLES_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR,  exist_ok=True)

# ── Default object library ─────────────────────────────────────────────────────
DEFAULT_OBJECTS = [
    {"id": "chair",     "label": "Chair",     "icon": "🪑", "blocks": False},
    {"id": "bed",       "label": "Bed",       "icon": "🛏",  "blocks": True},
    {"id": "table",     "label": "Table",     "icon": "🪞",  "blocks": False},
    {"id": "window",    "label": "Window",    "icon": "🪟",  "blocks": False},
    {"id": "door",      "label": "Door",      "icon": "🚪",  "blocks": False},
    {"id": "lamp",      "label": "Lamp",      "icon": "💡",  "blocks": False},
    {"id": "phone",     "label": "Phone",     "icon": "📞",  "blocks": False},
    {"id": "fireplace", "label": "Fireplace", "icon": "🔥",  "blocks": False},
    {"id": "plant",     "label": "Plant",     "icon": "🌿",  "blocks": False},
    {"id": "safe",      "label": "Safe",      "icon": "🗄️",  "blocks": True},
    {"id": "piano",     "label": "Piano",     "icon": "🎹",  "blocks": True},
    {"id": "stairs",    "label": "Stairs",    "icon": "🪜",  "blocks": False},
]

def load_objects():
    if not os.path.exists(OBJECTS_FILE):
        save_objects(DEFAULT_OBJECTS)
        return DEFAULT_OBJECTS
    with open(OBJECTS_FILE) as f:
        return json.load(f)

def save_objects(data):
    with open(OBJECTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

# ── Helpers ────────────────────────────────────────────────────────────────────

def load_leaderboard():
    if not os.path.exists(LEADERBOARD_FILE):
        return []
    with open(LEADERBOARD_FILE) as f:
        return json.load(f)

def save_leaderboard(data):
    with open(LEADERBOARD_FILE, "w") as f:
        json.dump(data, f, indent=2)

def puzzle_path(puzzle_id):
    return os.path.join(PUZZLES_DIR, f"{puzzle_id}.json")

def safe_name(name):
    """Sanitise player name for use in a filename."""
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:64]

def progress_path(puzzle_id, player_name=""):
    if player_name:
        return os.path.join(PUZZLES_DIR, f"{puzzle_id}.{safe_name(player_name)}.progress.json")
    return os.path.join(PUZZLES_DIR, f"{puzzle_id}.progress.json")

# ── Serve SPA ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(os.path.join(BASE_DIR, "static"), "index.html")

# ── Object library ─────────────────────────────────────────────────────────────

@app.route("/api/objects", methods=["GET"])
def get_objects():
    return jsonify(load_objects())

@app.route("/api/objects", methods=["PUT"])
def update_objects():
    data = request.json
    save_objects(data)
    return jsonify(data)

# ── Puzzles ────────────────────────────────────────────────────────────────────

@app.route("/api/puzzles", methods=["GET"])
def list_puzzles():
    puzzles = []
    for fname in os.listdir(PUZZLES_DIR):
        if fname.endswith(".json") and not fname.endswith(".progress.json"):
            with open(os.path.join(PUZZLES_DIR, fname)) as f:
                p = json.load(f)
            puzzles.append({
                "id": p["id"],
                "name": p["name"],
                "rows": p["rows"],
                "cols": p["cols"],
                "individuals": p["individuals"],
                "difficulty": p.get("difficulty", ""),
                "created_at": p.get("created_at", ""),
            })
    puzzles.sort(key=lambda x: x["created_at"], reverse=True)
    return jsonify(puzzles)

@app.route("/api/puzzles", methods=["POST"])
def create_puzzle():
    data = request.json
    puzzle_id = str(uuid.uuid4())
    puzzle = {
        "id": puzzle_id,
        "name": data["name"],
        "rows": data["rows"],
        "cols": data["cols"],
        "individuals": data["individuals"],
        "puzzle_clues": data.get("puzzle_clues", []),
        "individual_clues": data.get("individual_clues", {}),
        "graphic_elements": data.get("graphic_elements", {}),
        "rooms": data.get("rooms", {}),
        "deleted_cells": data.get("deleted_cells", []),
        "difficulty": data.get("difficulty", ""),
        "solution": data.get("solution", {}),
        "created_at": datetime.utcnow().isoformat(),
    }
    with open(puzzle_path(puzzle_id), "w") as f:
        json.dump(puzzle, f, indent=2)
    return jsonify(puzzle), 201

@app.route("/api/puzzles/<puzzle_id>", methods=["GET"])
def get_puzzle(puzzle_id):
    path = puzzle_path(puzzle_id)
    if not os.path.exists(path):
        return jsonify({"error": "Not found"}), 404
    with open(path) as f:
        return jsonify(json.load(f))

@app.route("/api/puzzles/<puzzle_id>", methods=["PUT"])
def update_puzzle(puzzle_id):
    path = puzzle_path(puzzle_id)
    if not os.path.exists(path):
        return jsonify({"error": "Not found"}), 404
    with open(path) as f:
        puzzle = json.load(f)
    data = request.json
    for key in ["name", "rows", "cols", "individuals", "puzzle_clues",
                "individual_clues", "graphic_elements", "rooms", "deleted_cells", "difficulty", "solution"]:
        if key in data:
            puzzle[key] = data[key]
    with open(path, "w") as f:
        json.dump(puzzle, f, indent=2)
    return jsonify(puzzle)

@app.route("/api/puzzles/<puzzle_id>", methods=["DELETE"])
def delete_puzzle(puzzle_id):
    path = puzzle_path(puzzle_id)
    if os.path.exists(path):
        os.remove(path)
    # Remove all per-player progress files for this puzzle
    for fname in os.listdir(PUZZLES_DIR):
        if fname.startswith(puzzle_id) and fname.endswith(".progress.json"):
            os.remove(os.path.join(PUZZLES_DIR, fname))
    # Remove leaderboard entries for this puzzle
    lb = load_leaderboard()
    lb = [e for e in lb if e["puzzle_id"] != puzzle_id]
    save_leaderboard(lb)
    return jsonify({"ok": True})

# ── Progress ───────────────────────────────────────────────────────────────────

@app.route("/api/puzzles/<puzzle_id>/progress", methods=["GET"])
def get_progress(puzzle_id):
    player_name = request.args.get("player", "")
    if not player_name:
        return jsonify(None)
    path = progress_path(puzzle_id, player_name)
    if not os.path.exists(path):
        return jsonify(None)
    with open(path) as f:
        return jsonify(json.load(f))

@app.route("/api/puzzles/<puzzle_id>/progress", methods=["PUT"])
def save_progress(puzzle_id):
    data = request.json
    player_name = data.get("player_name", "Anonymous")
    with open(progress_path(puzzle_id, player_name), "w") as f:
        json.dump(data, f, indent=2)
    return jsonify({"ok": True})

@app.route("/api/puzzles/<puzzle_id>/progress", methods=["DELETE"])
def reset_progress(puzzle_id):
    player_name = request.args.get("player", "")
    if not player_name:
        return jsonify({"ok": True})
    path = progress_path(puzzle_id, player_name)
    if os.path.exists(path):
        os.remove(path)
    return jsonify({"ok": True})

# ── Submit ─────────────────────────────────────────────────────────────────────

@app.route("/api/puzzles/<puzzle_id>/submit", methods=["POST"])
def submit_solution(puzzle_id):
    puzz_path = puzzle_path(puzzle_id)
    if not os.path.exists(puzz_path):
        return jsonify({"error": "Not found"}), 404
    with open(puzz_path) as f:
        puzzle = json.load(f)

    data   = request.json
    locked = data.get("locked", {})
    solution = puzzle.get("solution", {})

    if not solution:
        return jsonify({"correct": None, "message": "No solution defined for this puzzle."})

    correct = (
        all(str(locked.get(k)) == str(v) for k, v in solution.items())
        and len(locked) == len(solution)
    )

    if correct:
        entry = {
            "id": str(uuid.uuid4()),
            "puzzle_id": puzzle_id,
            "puzzle_name": puzzle["name"],
            "puzzle_difficulty": puzzle.get("difficulty", ""),
            "player_name": data.get("player_name", "Anonymous"),
            "elapsed_seconds": data.get("elapsed_seconds", 0),
            "completed_at": datetime.utcnow().isoformat(),
        }
        lb = load_leaderboard()
        lb.append(entry)
        save_leaderboard(lb)
        return jsonify({"correct": True, "entry": entry})

    return jsonify({"correct": False, "message": "Not quite — keep going!"})

# ── Leaderboard ────────────────────────────────────────────────────────────────

@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    puzzle_id = request.args.get("puzzle_id")
    lb = load_leaderboard()
    if puzzle_id:
        lb = [e for e in lb if e["puzzle_id"] == puzzle_id]
    lb.sort(key=lambda x: x["elapsed_seconds"])
    return jsonify(lb)

@app.route("/api/leaderboard/<entry_id>", methods=["DELETE"])
def delete_leaderboard_entry(entry_id):
    lb = load_leaderboard()
    lb = [e for e in lb if e["id"] != entry_id]
    save_leaderboard(lb)
    return jsonify({"ok": True})

# ── Progress list (for home screen) ───────────────────────────────────────────

@app.route("/api/progress/all", methods=["GET"])
def list_all_progress():
    """Return all in-progress saves: [{puzzle_id, player_name, elapsed_seconds}]
    New format: {puzzle_id}.{safe_player}.progress.json  (two dots before 'progress')
    """
    results = []
    for fname in os.listdir(PUZZLES_DIR):
        if not fname.endswith(".progress.json"):
            continue
        # New per-player format has exactly the structure: uuid.playername.progress.json
        # Strip the .progress.json suffix, then split on first dot to get puzzle_id
        stem = fname[:-len(".progress.json")]   # e.g. "uuid.playername"
        dot  = stem.find(".")
        if dot == -1:
            # Old single-player format — skip (stale file)
            continue
        puzzle_id = stem[:dot]
        # Verify this puzzle still exists
        if not os.path.exists(puzzle_path(puzzle_id)):
            continue
        with open(os.path.join(PUZZLES_DIR, fname)) as f:
            prog = json.load(f)
        results.append({
            "puzzle_id":       puzzle_id,
            "player_name":     prog.get("player_name", "Anonymous"),
            "elapsed_seconds": prog.get("elapsed_seconds", 0),
            "status":          prog.get("status", "inprogress"),
        })
    return jsonify(results)

# ── Object image upload ────────────────────────────────────────────────────────

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}

@app.route("/api/objects/upload", methods=["POST"])
def upload_object_image():
    """
    Accepts JSON: { filename: "clock.png", data: "<base64 or data-URI>" }
    Saves to static/images/objects/ and returns { url: "/images/objects/clock.png" }
    """
    payload  = request.json
    filename = payload.get("filename", "")
    data_b64 = payload.get("data", "")

    # Sanitise: keep only alphanumeric, dots, hyphens, underscores
    safe = "".join(c for c in filename if c.isalnum() or c in "._-")
    if not safe:
        return jsonify({"error": "Invalid filename"}), 400

    # Server-side extension validation
    ext = os.path.splitext(safe)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({"error": f"File type '{ext}' not allowed. Use: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"}), 400

    # Strip data-URI prefix if present (e.g. "data:image/png;base64,...")
    if "," in data_b64:
        data_b64 = data_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(data_b64)
    except Exception:
        return jsonify({"error": "Invalid base64 data"}), 400

    dest = os.path.join(IMAGES_DIR, safe)
    with open(dest, "wb") as f:
        f.write(image_bytes)

    return jsonify({"url": f"/images/objects/{safe}"})


@app.route("/api/objects/image", methods=["DELETE"])
def delete_object_image():
    """Delete an uploaded object image by its URL path."""
    url = request.json.get("url", "")
    # Only allow deleting files under /images/objects/
    if not url.startswith("/images/objects/"):
        return jsonify({"error": "Invalid path"}), 400
    fname = os.path.basename(url)
    safe  = "".join(c for c in fname if c.isalnum() or c in "._-")
    dest  = os.path.join(IMAGES_DIR, safe)
    if os.path.exists(dest):
        os.remove(dest)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
