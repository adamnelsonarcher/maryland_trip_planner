You are describing a “trip scenario planner” with two hard requirements:

1. A map that can render a route and show drive times.
2. A schedule model that can be reconfigured (different origins, different stops, different day trips) and immediately recompute arrival times.

Below is the exact minimum you need to stand up a solid v1 framework in Cursor, plus the “right next steps” so you do not paint yourself into a corner.

---

## 1) Pick the stack and APIs (so the whole thing is computable)

### Frontend framework

* **Next.js (App Router) + TypeScript**

  * Reasoning: easiest way to ship a shareable web app, and TypeScript will keep your trip object model sane.

### Mapping

You have two viable choices:

**Option A (simplest): Google Maps JavaScript API**

* Map display, markers, polylines
* **Directions API** for route and per-leg durations
* **Places Autocomplete** for address entry
* (Optional) **Distance Matrix API** for fast comparisons across many candidate stops

**Option B (cheaper, more DIY): Mapbox + OSRM**

* More setup, but can avoid Google billing surprises.
* Harder to get “it just works” address search and turn-by-turn route quality.

Given your description (“Google Maps interface”), pick **Option A**.

### Backend

You can start with:

* **No backend** for v1, store everything in **localStorage** and share via a **compressed URL state**.

Then add:

* **Supabase** (Postgres + auth + row-level security) if you want multiple people editing, saving scenarios, commenting, etc.

Reasoning: you can ship fast without auth, then upgrade when the group actually uses it.

---

## 2) Define the data model first (this is the core of the whole tool)

You want a model that supports:

* Two possible starting origins (Houston vs Colorado Bend State Park)
* Multiple route stop candidates (national parks, etc.)
* A base itinerary (Annapolis, western MD lake house)
* Optional day trips (NYC, Pennsylvania to see Sean and Sarah)
* Fixed trip window: **11th to 19th**
* “Scenarios” that swap choices and recompute schedules

### Minimal object model (v1)

Think in these entities:

1. **Place**

* id
* name
* address string
* lat/lng
* optional tags (lodging, attraction, friend, park)

2. **Leg**

* fromPlaceId
* toPlaceId
* departAt (datetime)
* arriveAt (datetime computed)
* driveDurationSec (computed)
* bufferSec (user editable, for gas, food, check-in)
* notes

3. **DayPlan**

* date (local date)
* ordered list of “events”

  * event = stop visit, lodging check-in, depart, arrive, free-time block

4. **Scenario**

* name
* selectedOriginPlaceId (Houston OR Colorado Bend)
* list of intermediate route stops (ordered)
* base anchors (Annapolis stay, lake house stay)
* toggles:

  * includeNYCDayTrip (and which day)
  * includePADayTrip (and which day)
* assumptions:

  * daily drive start time (ex: 8:00 AM)
  * max driving hours per day
  * default buffer per stop

5. **Trip**

* title
* startDate = 11th
* endDate = 19th
* places[]
* scenarios[]
* activeScenarioId

Reasoning: if you do not explicitly model “scenario inputs” vs “computed schedule outputs,” you will end up with a messy UI where you cannot reliably recompute.

---

## 3) Core computations you need (so edits instantly update times)

You need a deterministic “recompute” pipeline:

### Step A: Build a route from scenario inputs

* Origin = chosen origin
* Waypoints = selected stops along the drive
* Destination anchors = Annapolis, then later lake house, etc.

### Step B: For each day, allocate legs until you hit constraints

Constraints you likely want:

* Drive start time each day (user setting)
* Max driving hours per day (user setting)
* Buffer per stop (user setting)
* Hard “must be here by this datetime” anchors (check-in times, meetups)

### Step C: Call Google Directions to get durations per leg

* Compute arrival = depart + driveDuration + buffers
* Carry forward to next leg
* Persist results as computed fields (arriveAt, departAt, totalDriveTime)

### Step D: If a day trip is toggled on

Insert a sub-route:

* Lodging -> day trip destination -> lodging
  Then recompute that day’s schedule.

Reasoning: day trips are not “just another stop on the main route.” They are loops anchored to where you are sleeping.

---

## 4) UI layout that matches how people actually plan trips

You want three panes:

### Left sidebar: Scenario + inputs

* Scenario dropdown (Base Plan, Start from Houston, Start from Colorado Bend, etc.)
* Date window shown clearly: 11th to 19th
* Toggles for optional day trips:

  * NYC day trip: checkbox + day selector
  * PA day trip: checkbox + day selector
* Route stops list (sortable):

  * Add stop (autocomplete address)
  * Drag to reorder
  * Remove stop
* Assumptions:

  * daily start time
  * max driving hours/day
  * default buffer minutes/stop

### Center: Google Map

* Markers for all places in the active scenario
* Render the current computed route polyline(s)
* Click marker opens place details, notes, plus “assign to day” (later)

### Right pane: Timeline / Itinerary

Two useful views:

1. **Per-day cards** (11th, 12th, … 19th) with events in order
2. **Continuous timeline** (less important for v1)

Each day card shows:

* Depart time
* Arrive times
* Total drive time
* Key stops
* Slack time

Reasoning: if you only show a map, nobody trusts the plan. If you only show text, nobody understands the geography. You need both.

---

## 5) “Basic framework” build plan (in the order you should implement)

### Phase 1: Skeleton app (no real route yet)

1. Next.js + TS project
2. Pages:

   * `/` Trip dashboard
3. Components:

   * `ScenarioSelector`
   * `PlaceSearchBox` (Google Places Autocomplete)
   * `StopsList` (reorderable)
   * `MapView`
   * `ItineraryView`
4. State:

   * One hard-coded Trip object in memory
   * Save/load to localStorage

Why first: you need the editing surface before the routing is perfect.

---

### Phase 2: Integrate Google Maps (map renders + markers)

1. Load Google Maps JS API in a client component
2. Display markers for places
3. Pan/zoom to fit selected places

Why: visible progress quickly, and it validates your API key and billing early.

---

### Phase 3: Directions route for a single “main route”

1. Build a request:

   * origin
   * destination
   * waypoints (stops)
2. Render route line
3. Read `legs[]` response and extract:

   * duration
   * distance
   * end_address
   * start_address

Why: this gives you real durations to feed the itinerary.

---

### Phase 4: Turn route legs into a day-by-day schedule

1. Start with a simple rule:

   * Everything is in one continuous sequence with depart time = day start time on the 11th
   * When cumulative drive time exceeds max per day, roll over to next day at day start time
2. Display day cards with depart/arrive.

Why: this is the minimum “schedule engine” that makes the tool feel real.

---

### Phase 5: Add “loops” for day trips (NYC, PA)

1. Let user pick a “base lodging place” for a given day
2. If NYC day trip toggled:

   * Compute lodging -> NYC -> lodging
   * Insert into that day’s card
3. Same for PA day trip

Why: this is the key feature you described (how optional trips impact the plan).

---

### Phase 6: Sharing

Do this in increasing sophistication:

**v1 Sharing**

* “Copy link” that encodes scenario state into the URL (compressed JSON).
* Anyone opening the link loads that state.

**v2 Sharing**

* Supabase table `trips` and `scenarios`
* Shareable trip id
* Optional auth later

Why: your friends need to see it without cloning a repo.

---

## 6) File and folder structure to start with (practical, Cursor-friendly)

Suggested structure:

* `app/`

  * `page.tsx` (dashboard layout)
* `components/`

  * `MapView.tsx`
  * `ScenarioSelector.tsx`
  * `StopsList.tsx`
  * `PlaceSearchBox.tsx`
  * `ItineraryView.tsx`
  * `DayCard.tsx`
* `lib/`

  * `googleMaps.ts` (load script, types, helpers)
  * `directions.ts` (call Directions and normalize response)
  * `scheduler.ts` (turn legs into day-by-day plan)
  * `storage.ts` (localStorage save/load, URL share encoding)
* `types/`

  * `trip.ts` (Trip, Scenario, Place, Leg, DayPlan types)

Reasoning: separation of “API normalization” vs “schedule logic” prevents you from mixing UI with computations.

---

## 7) Key implementation details that prevent common failures

### Time zones

You will cross time zones on a long drive.

* For v1, treat everything as “local time at the current location” and keep it simple.
* Store timestamps as ISO strings, but display with a chosen timezone.
* If you want correctness later, use:

  * Google Time Zone API per stop location
  * Compute arrivals in absolute time (UTC), then render locally

If you skip this entirely, your arrival times will be off by an hour at some point. It might be acceptable for early planning, but you should know it is a deliberate simplification.

### Google API costs and rate limiting

* Directions calls can add up if you recompute on every keystroke.
* Debounce recompute (ex: 500 to 1000 ms).
* Cache results keyed by:

  * origin, destination, ordered waypoints

### Waypoint limits

Directions API has waypoint limits depending on account and API. If you plan to add many parks/stops, you may need to chunk routes. For v1, assume a modest number of stops and warn if exceeded.

---

## 8) What you should prompt Cursor to build first (copyable spec)

You can give Cursor a single spec like this:

* Build a Next.js (App Router) TypeScript app with a 3-column dashboard layout: left controls, center Google Map, right itinerary.
* Support a Trip object with Places and Scenarios.
* Left column: scenario dropdown, origin selector (Houston or Colorado Bend), list of intermediate stops with Google Places autocomplete, reorder, remove, plus settings (daily start time, max driving hours/day, buffer minutes/stop).
* Center: Google Map showing markers for origin, stops, destination anchors and a route polyline from Directions API.
* Right: computed day-by-day itinerary cards from the Directions legs, applying buffer and splitting across days by max driving hours/day.
* Persistence: save Trip state to localStorage; add “Copy Share Link” that encodes active scenario state into the URL.
* No auth, no backend.

That is enough to get a functioning framework that you can iterate on.

---

## 9) Immediate “your trip” defaults to hardcode (so it is usable on day one)

Hardcode these places initially:

* Houston, TX (origin option A)
* Colorado Bend State Park, TX (origin option B)
* Annapolis, MD (anchor)
* Western Maryland lake house address (placeholder until you have it)
* NYC (day trip destination)
* Your PA friends’ location (placeholder until you have it)

Hardcode a base scenario:

* StartDate = 11th, EndDate = 19th
* Origin = Houston (default)
* Destination anchor = Annapolis, then lake house
* Day trips toggled off by default

Reasoning: the UI feels real immediately and your friends can start reacting without you finishing every detail.

---

If you implement phases 1 through 4, you will already have the “basic framework” you asked for: editable stops, map route, computed arrivals, and day-by-day itinerary that changes when you swap Houston vs Colorado Bend or insert stops.
