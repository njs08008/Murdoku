# Murdoku

A locally-hosted web application for creating and solving **Murdoku** puzzles — a murder mystery logic puzzle that combines deductive reasoning with a Cluedo-style narrative.

## What is a Murdoku?

A Murdoku is played on an *n* × *m* grid where *n* individuals (suspects) must each be placed in exactly one cell, such that no two individuals share a row or column. The grid is divided into named rooms with bold borders. Each individual has an associated clue, and puzzle-wide clues narrow down who belongs where. Solving the puzzle reveals the layout of suspects — and, by extension, the murderer.

Murdoku puzzles are published in printed books. This app lets you enter those puzzles digitally and solve them with a full interactive interface, including pencil marks, locking, undo, a timer, and a leaderboard.

---

## Features

### Puzzle Management
- Create puzzles from scratch or enter them from a printed book
- Define an *n* × *m* grid of any size (the number of individuals equals `min(n, m)`)
- Delete individual cells to create non-rectangular grid shapes
- Set difficulty (Very Easy → Expert), puzzle-wide clues, and per-individual clues
- Define named rooms with bold borders and color-coded tinting
- Place objects in cells (chair, bed, fireplace, etc.) — some objects block individual placement
- Upload custom images for objects not covered by the built-in emoji library
- Enter a solution key for automated answer checking
- Solution QA catches duplicates, row/column conflicts, and placements on blocked or deleted cells

### Solving
- Tool-based interaction: **Pencil** (candidates), **Lock** (place an individual), **Erase**, **X** (eliminate), **Undo**
- Select an individual from the left panel to apply the active tool; selecting a new individual while Eraser/X is active automatically switches to Pencil
- Locking an individual automatically X-outs the rest of their row and column and removes their pencil marks elsewhere
- Pencil marks display as small colored initials; clicking an individual in the left panel highlights (bolds) their marks across the grid
- Locked individuals fade in the left panel to indicate they've been placed
- Dynamic cell sizing: the grid scales to fill the available screen space, down to a minimum size, with scroll fallback for very large grids
- Timer starts when a puzzle is opened and pauses when you navigate away
- Enter your name when starting; each player's progress is saved independently, so multiple people can solve the same puzzle simultaneously

### Puzzle States
| State | Description |
|---|---|
| **Available** | Base puzzle, ready to solve |
| **In Progress** | A player has an active save |
| **Unsubmitted** | A player finished but the puzzle has no solution key yet |
| **Solved** | Recorded on the leaderboard |

### Leaderboard
- Tracks player name, puzzle, difficulty, time, and date for each correct submission
- Ranked per puzzle (fastest = #1 within each puzzle)
- Sorted by difficulty (hardest first), then puzzle name (A–Z, ignoring "The"/"A"/"An"), then time
- Filter by difficulty and search/filter by puzzle name

### Puzzles Page
- Filter by player, status (All / Not Started / In Progress / Unsubmitted), and difficulty
- In Progress and Unsubmitted solves appear in their own sections above the Available puzzle list
- Shows who has solved each puzzle
- Submit button on Unsubmitted puzzles checks the answer directly from the home page

### Object Library
- Manage the set of objects available for placement in puzzle cells
- Add custom objects with any emoji or uploaded image (PNG, JPG, GIF, WebP, SVG — max 1 MB)
- Toggle whether an object blocks individual placement
- Changes are immediately available in the puzzle creator

---

## Project Structure

```
murdoku/
├── app.py                      # Flask backend — REST API
├── requirements.txt
├── data/
│   ├── objects.json            # Object library (editable via UI)
│   ├── leaderboard.json        # Leaderboard entries
│   └── puzzles/
│       ├── <uuid>.json                          # Puzzle definitions
│       └── <uuid>.<player>.progress.json        # Per-player progress saves
└── static/
    ├── index.html
    ├── css/
    │   └── style.css
    ├── images/
    │   └── objects/            # Uploaded object images
    └── js/
        ├── api.js              # Fetch wrappers for all API calls
        ├── main.js             # View router, home screen, shared modal helpers
        ├── puzzle-creator.js   # Puzzle creation UI
        ├── puzzle-solver.js    # Solving UI, timer, dynamic grid sizing
        ├── rooms.js            # Shared room border/label rendering
        ├── leaderboard.js      # Leaderboard view and filtering
        └── object-library.js  # Object library manager
```

---

## Setup

**Requirements:** Python 3.9+

```bash
# Clone the repository
git clone https://github.com/your-username/murdoku.git
cd murdoku

# Create and activate a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate        # macOS/Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Run the app
python app.py
```

Then open **http://localhost:5000** in your browser.

---

## Usage

### Creating a Puzzle

1. Click **＋ New Puzzle** in the nav bar
2. Set the grid dimensions, difficulty, and puzzle name
3. Enter puzzle-wide clues (one per line) and per-individual clues and names
4. Switch between **Objects**, **Solution**, and **Rooms** modes on the right panel to build the grid:
   - **Objects mode:** Select an object from the toolbar, then click cells to place it. Click the same cell again to remove it. Right-click any cell to delete it from the grid entirely (right-click again to restore).
   - **Solution mode:** Click cells to assign which individual belongs there. This is optional but enables automatic answer checking.
   - **Rooms mode:** Create named rooms and paint cells into them. Room names appear at the bottom of their area.
5. Click **💾 Save Puzzle**

### Solving a Puzzle

1. Click **Solve** on any puzzle from the home page
2. Enter your name (each player's progress is saved separately)
3. Select a tool from the toolbar, then select an individual from the left panel, then click grid cells
4. When finished: if the puzzle has a solution key, **Submit** checks your answer and saves to the leaderboard. If not, **Finish** saves your state as Unsubmitted.

### Sharing Puzzles

Puzzle files are stored as plain JSON in `data/puzzles/`. You can copy a `<uuid>.json` file to share a puzzle with someone else. If the puzzle uses custom objects with uploaded images, share the relevant files from `static/images/objects/` as well.

If you receive a puzzle that uses objects not in your library, the app will alert you and list the missing object IDs when you try to open it. Add them in **🗂 Objects** before solving.

---

## Data Notes

- All data is stored locally as JSON files — no database required
- Deleting a puzzle also removes all associated progress saves and leaderboard entries
- Progress is saved automatically every second while solving
- Navigating away from an in-progress puzzle pauses the timer and saves your state

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python / Flask |
| Frontend | Vanilla JavaScript (no framework) |
| Styling | CSS custom properties, CSS Grid |
| Storage | JSON files on disk |