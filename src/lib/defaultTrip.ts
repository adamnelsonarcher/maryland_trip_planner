import { nanoid } from "nanoid";

import type { Place, Scenario, Trip } from "@/types/trip";

function place(p: Omit<Place, "id"> & { id?: string }): Place {
  return { id: p.id ?? nanoid(), ...p };
}

function scenario(s: Omit<Scenario, "id"> & { id?: string }): Scenario {
  return { id: s.id ?? nanoid(), ...s };
}

export function makeDefaultTrip(): Trip {
  const houston = place({
    name: "Houston, TX",
    address: "Houston, TX, USA",
    location: { lat: 29.7604, lng: -95.3698 },
  });

  const coloradoBend = place({
    name: "Colorado Bend State Park",
    address: "Colorado Bend State Park, TX, USA",
    location: { lat: 31.0087, lng: -98.4891 },
    tags: ["park"],
  });

  const annapolis = place({
    name: "Annapolis, MD",
    address: "Annapolis, MD, USA",
    location: { lat: 38.9784, lng: -76.4922 },
    tags: ["anchor"],
  });

  const lakeHouse = place({
    name: "Western MD Lake House (placeholder)",
    address: "Western Maryland (lake house address TBD)",
    location: { lat: 39.5937, lng: -79.2673 }, // Roughly Deep Creek Lake area
    tags: ["lodging", "anchor"],
  });

  const nyc = place({
    name: "New York City",
    address: "New York, NY, USA",
    location: { lat: 40.7128, lng: -74.006 },
    tags: ["attraction"],
  });

  const paFriends = place({
    name: "PA Friends (placeholder)",
    address: "Pennsylvania (Sean & Sarah) address TBD",
    location: { lat: 40.2737, lng: -76.8844 }, // Roughly Harrisburg area
    tags: ["friend"],
  });

  const places: Place[] = [houston, coloradoBend, annapolis, lakeHouse, nyc, paFriends];
  const placesById = Object.fromEntries(places.map((p) => [p.id, p]));

  const baseSettings = {
    dailyStartTime: "08:00",
    maxDrivingHoursPerDay: 6,
    bufferMinutesPerStop: 20,
  };

  const scenarioHouston = scenario({
    name: "Base Plan (Start: Houston)",
    selectedOriginPlaceId: houston.id,
    intermediateStopPlaceIds: [],
    anchorPlaceIds: [annapolis.id, lakeHouse.id],
    settings: baseSettings,
    includeNYCDayTrip: false,
    includePADayTrip: false,
  });

  const scenarioColoradoBend = scenario({
    name: "Alt Start (Colorado Bend)",
    selectedOriginPlaceId: coloradoBend.id,
    intermediateStopPlaceIds: [],
    anchorPlaceIds: [annapolis.id, lakeHouse.id],
    settings: baseSettings,
    includeNYCDayTrip: false,
    includePADayTrip: false,
  });

  const scenariosById = Object.fromEntries(
    [scenarioHouston, scenarioColoradoBend].map((s) => [s.id, s]),
  );

  return {
    id: nanoid(),
    title: "Maryland Trip Planner",
    startDateISO: "2026-01-11",
    endDateISO: "2026-01-19",
    placesById,
    scenariosById,
    activeScenarioId: scenarioHouston.id,
  };
}


