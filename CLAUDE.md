# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`) then Vite production build
- `npm run lint` — ESLint across the repo
- `npm run preview` — preview the production build

No test framework is configured.

## Architecture

Pocer is a single-page React 19 + TypeScript + Vite app for tracking a poker cash-game session among a fixed friend group. State is managed by a single `useReducer` in `src/App.tsx` — there is no Redux, Context, or router.

### State model

One `Session` object (`src/types.ts`) drives the entire UI. It has a `phase` field (`"setup" | "playing" | "cashout" | "summary"`) and a `players` array. `App.tsx` renders exactly one screen per phase:

- `SetupScreen` → edit roster, toggle `active`, then `START_GAME`
- `PlayingScreen` → `BUY_STACK` / `UNDO_BUY`, then `END_GAME`
- `CashoutScreen` → enter `chipsReturned` per player, then `CALCULATE`
- `SummaryScreen` → show net results, submit to Google Sheets, then `RESET`

All mutations go through the reducer's `Action` union — don't mutate session state from components. The reducer enforces invariants (e.g. a game can't start with fewer than 2 active players; `UNDO_BUY` can't go below 1 stack).

### Persistence

Every reducer update is mirrored to `localStorage` under key `pocer_session_v2` via a `useEffect` in `App.tsx` calling `utils/storage.ts`. On mount, the reducer's lazy initializer rehydrates from storage and backfills `active: true` for sessions saved before that field existed — preserve this migration-on-load pattern when adding new fields to `Player` or `Session`.

### Money math

Chip/VND conversion lives in `src/constants.ts`:
- `CHIPS_PER_STACK = 2000`
- `VND_PER_STACK = 50_000` → `VND_PER_CHIP = 25`

Any monetary calculation (net P&L, totals) should derive from these constants, not hardcode values. `App.tsx` exposes `getTotalChipsBoughtIn` / `getTotalChipsReturned` helpers.

### Google Sheets submission

`utils/api.ts` posts the final results to a Google Apps Script web app (`APPS_SCRIPT_URL`). Two non-obvious rules:

1. **Sheet name is month/year of the session**, but if `endTime.getDate() >= 26`, it rolls forward to the next month's sheet (the friend group's accounting month starts on the 26th).
2. The row format is `[formattedEndTime, ...netPerPlayerInThousandsVND, totalBuyInThousandsVND]`. Player order in the row matches the order of `players` in the session — inactive players contribute `0`, but still occupy a column. Don't filter inactive players out of the row.

The request uses `Content-Type: text/plain` to avoid CORS preflight against Apps Script.

### Styling

CSS custom properties in `src/index.css` define the dark theme (`--bg`, `--bg-card`, `--primary`, etc.). Component styles live in `src/App.css`. The root container is capped at `max-width: 480px` — this is a mobile-first layout, not a responsive desktop app.

### Default roster

`App.tsx` seeds 8 hardcoded Vietnamese names (the regular group). Changing `DEFAULT_NAMES` or making the count dynamic should be treated as a product decision, not a refactor.
