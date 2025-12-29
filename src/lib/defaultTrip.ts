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
    name: "Lake House",
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

  // Recommended stops (route up)
  const hotSprings = place({
    name: "Hot Springs National Park",
    address: "Hot Springs National Park, AR, USA",
    location: { lat: 34.5219, lng: -93.0423 },
    tags: ["park"],
  });

  const nashville = place({
    name: "Nashville, TN",
    address: "Nashville, TN, USA",
    location: { lat: 36.1627, lng: -86.7816 },
    tags: ["attraction"],
  });

  const mammothCave = place({
    name: "Mammoth Cave National Park",
    address: "Mammoth Cave National Park, KY, USA",
    location: { lat: 37.186, lng: -86.1005 },
    tags: ["park"],
  });

  const newRiverGorge = place({
    name: "New River Gorge National Park",
    address: "New River Gorge National Park & Preserve, WV, USA",
    location: { lat: 38.0669, lng: -81.0796 },
    tags: ["park"],
  });

  const shenandoah = place({
    name: "Shenandoah National Park",
    address: "Shenandoah National Park, VA, USA",
    location: { lat: 38.5333, lng: -78.4356 },
    tags: ["park"],
  });

  const places: Place[] = [
    houston,
    coloradoBend,
    annapolis,
    lakeHouse,
    nyc,
    paFriends,
    hotSprings,
    nashville,
    mammothCave,
    newRiverGorge,
    shenandoah,
  ];
  const placesById = Object.fromEntries(places.map((p) => [p.id, p]));

  const baseSettings = {
    bufferMinutesPerStop: 20,
  };

  const scenarioBaseColoradoBend = scenario({
    name: "Base Plan (Start: Colorado Bend)",
    actualStartPlaceId: coloradoBend.id,
    selectedOriginPlaceId: coloradoBend.id,
    returnToPlaceId: houston.id,
    intermediateStopPlaceIds: [hotSprings.id, nashville.id, mammothCave.id],
    returnStopPlaceIds: [],
    postAnnapolisStopPlaceIds: [],
    anchorPlaceIds: [annapolis.id, lakeHouse.id],
    settings: baseSettings,
    dayOverridesByISO: {},
    includeNYCDayTrip: false,
    includePADayTrip: false,
  });

  const scenarioAltStopHoustonFirst = scenario({
    name: "Alt Plan (Stop in Houston first)",
    // Physically start in Colorado Bend, but route begins in Houston,
    // so we prepend Colorado Bend -> Houston before the main route.
    actualStartPlaceId: coloradoBend.id,
    selectedOriginPlaceId: houston.id,
    returnToPlaceId: houston.id,
    intermediateStopPlaceIds: [hotSprings.id, nashville.id, mammothCave.id],
    returnStopPlaceIds: [],
    postAnnapolisStopPlaceIds: [],
    anchorPlaceIds: [annapolis.id, lakeHouse.id],
    settings: baseSettings,
    dayOverridesByISO: {},
    includeNYCDayTrip: false,
    includePADayTrip: false,
  });

  const scenariosById = Object.fromEntries(
    [scenarioBaseColoradoBend, scenarioAltStopHoustonFirst].map((s) => [s.id, s]),
  );

  return {
    id: nanoid(),
    title: "Maryland Trip Planner",
    startDateISO: "2026-01-10",
    endDateISO: "2026-01-19",
    startTimeHHMM: "21:00",
    endTimeHHMM: "23:59",
    returnDepartDateISO: "2026-01-19",
    // Start with the trip cutoff time; once Directions compute, we'll clamp down to the latest allowed depart.
    returnDepartTimeHHMM: "23:59",
    placesById,
    scenariosById,
    activeScenarioId: scenarioBaseColoradoBend.id,
  };
}


