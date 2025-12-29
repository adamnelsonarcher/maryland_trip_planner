## Trip Scenario Planner

I made this tool to help a group of people plan and visualize differnt itinearies for a trip I was planning from Houston to Maryland. It features a lot of hard-coded, trip-specific logic, but could be modified to fit any trip. I may build a generalized one in the future.

A Next.js (App Router) + TypeScript app for building **trip scenarios** with:

- A 3‑pane UI: **Controls** (left) → **Map** (center) → **Itinerary** (right)
- Google Maps integration (**Directions** + **Places Autocomplete**)
- A deterministic scheduler that produces a **day-by-day timeline** (drives + “time at …” blocks)
- Persistence via **localStorage** (URL sharing exists in code, currently hidden in UI)

## Quickstart

### 1) Configure a Google Maps API key

Create `.env.local` (not committed) with:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_KEY
```

You can start from `env.example`.

In Google Cloud Console, enable:
- **Maps JavaScript API**
- **Directions API**
- **Places API**

### 2) Install + run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## How the app works

### High-level data flow

1. `src/lib/defaultTrip.ts` seeds the default `Trip` (places + scenarios).
2. `src/components/TripDashboard.tsx` loads the trip state:
   - starts with defaults (SSR/CSR match)
   - then hydrates from URL (if present) and/or localStorage
   - normalizes/migrates using `src/lib/normalizeTrip.ts`
3. When trip/scenario inputs change, `TripDashboard` requests Google Directions for each route segment and normalizes them via `src/lib/directions.ts`.
4. The scheduler (`src/lib/scheduler.ts`) converts normalized legs into a per-day timeline (`DayItinerary[]`).
5. UI renders:
   - Controls: `src/components/ControlsPane.tsx`
   - Map: `src/components/MapView.tsx`
   - Itinerary: `src/components/ItineraryView.tsx` / `src/components/DayCard.tsx`

### Core concepts (data model)

The shared types live in `src/types/trip.ts`:

- **Trip**: trip window (start/end date + time) + places + scenarios + active scenario.
- **Scenario**: “route plan” inputs (actual start vs route origin, outbound stops, post‑Annapolis stops, return stops, per-day overrides).
- **DayOverride**: optional per-day mode + notes + optional day trip + optional dwell blocks.
- **DwellBlock**: a user-editable “time spent” block at a place (minutes).
- **DayItinerary / ScheduledLeg**: computed output events (drives and dwell blocks) with timestamps.

### Scheduling rules (important)

The scheduler is designed around “real drive times” while still showing multi‑day drives clearly:

- **Nonstop drives**: a drive is treated as one continuous leg (we do not chunk by “max hours/day”).
- **Midnight split for display**: if a drive crosses midnight, it is split into day chunks at 00:00 for the itinerary, but the underlying route stays continuous for map rendering.
- **Return-to-Houston timing**: the app computes the **latest allowed departure** for the return segment so you still arrive by the trip end cutoff; the UI clamps user input to that value.
- **Blank middle days**: days not assigned drives/activities remain blank (no placeholder “you must drive” warnings).
- **“Time at …” after arrivals**:
  - after any arrival, the itinerary shows a “Time at <place>” card
  - clicking it turns it into a saved, editable/deletable `dwellBlock`

### Map rendering

`src/components/MapView.tsx` supports two modes:

- **Overview**: renders all route segments with color coding:
  - green = drive up (`up`)
  - orange = drive home (`home`)
  - black = other segments/day trips (`other`)
- **Day view**:
  - if there is driving, it requests a real Directions route for just that day’s sequence and renders it
  - if no driving, it shows a single marker at the “base location” for that day

Day routes are cached in-memory (global cache) to avoid excessive Directions requests.

### Persistence + reset

- **Local persistence**: `src/lib/storage.ts` stores state under `maryland_trip_planner:v1`.
- **URL share encoding**: `src/lib/share.ts` implements compressed URL state (`lz-string`) but the UI is currently hidden.
- **Schema migration**: `src/lib/normalizeTrip.ts` backfills new fields and upgrades older saved trips.

If you’re seeing “old” data after code changes, click the app’s **Reset** (it clears localStorage and removes any URL state).

## Project structure

```
src/
  app/                  # Next.js App Router entrypoints
  components/           # UI: dashboard, controls, map, itinerary, modals
  lib/                  # core logic: scheduler, time utils, storage/share, defaults, migration
  types/                # shared TS types (Trip/Scenario/Schedule)
docs/
  plan_overview.md      # original v1 planning notes
```

## Common tweaks

- Change default places/scenarios/stops: `src/lib/defaultTrip.ts`
- Adjust scheduling behavior: `src/lib/scheduler.ts`
- Adjust map colors / day routing: `src/components/MapView.tsx`
- Adjust per-day UI cards: `src/components/DayCard.tsx`
