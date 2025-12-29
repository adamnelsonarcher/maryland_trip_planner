## Maryland Trip Scenario Planner (v1)

This is a Next.js (App Router) + TypeScript app for planning **trip scenarios**:

- Edit **origin** and **intermediate stops**
- Render a **Google Directions** route on a map
- Recompute a **day-by-day itinerary** (arrival times) using drive durations, buffers, and max driving hours/day
- Persist locally via **localStorage** and share via a **compressed URL**

## Getting Started

### 1) Configure Google Maps API key

Create `.env.local` (not committed) with:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_KEY
```

You can start from `env.example`.

Enable these APIs in Google Cloud:
- **Maps JavaScript API**
- **Directions API**
- **Places API**

### 2) Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Notes

- The schedule engine is intentionally simple for v1: it splits legs across days when drive time exceeds the configured max.
- Day-trip “loops” (NYC/PA) are scaffolded in the data model but not yet inserted into the schedule.
