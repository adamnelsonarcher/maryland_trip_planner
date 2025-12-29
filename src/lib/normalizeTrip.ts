import type { Scenario, Trip } from "@/types/trip";

function findHoustonId(trip: Trip): string | undefined {
  return Object.values(trip.placesById).find((p) => p.name.toLowerCase().includes("houston"))?.id;
}

function findColoradoBendId(trip: Trip): string | undefined {
  return Object.values(trip.placesById)
    .find((p) => p.name.toLowerCase().includes("colorado bend"))?.id;
}

function normalizeScenario(trip: Trip, scenario: Scenario): Scenario {
  const houstonId = findHoustonId(trip);
  const coloradoBendId = findColoradoBendId(trip);
  const selectedOriginPlaceId = scenario.selectedOriginPlaceId;

  const settings = {
    dailyStartTime: scenario.settings?.dailyStartTime ?? "08:00",
    maxDrivingHoursPerDay: scenario.settings?.maxDrivingHoursPerDay ?? 6,
    bufferMinutesPerStop: scenario.settings?.bufferMinutesPerStop ?? 20,
    originStayDays: scenario.settings?.originStayDays ?? 0,
  };

  const normalized: Scenario = {
    ...scenario,
    actualStartPlaceId: scenario.actualStartPlaceId ?? selectedOriginPlaceId,
    returnToPlaceId: scenario.returnToPlaceId ?? houstonId ?? selectedOriginPlaceId,
    dayOverridesByISO: scenario.dayOverridesByISO ?? {},
    settings,
  };

  // Migration: rename scenarios to match current UI expectation.
  // This prevents stale names from old localStorage/share links.
  if (houstonId && coloradoBendId) {
    const a = normalized.actualStartPlaceId;
    const o = normalized.selectedOriginPlaceId;
    if (a === coloradoBendId && o === coloradoBendId) {
      normalized.name = "Base Plan (Start: Colorado Bend)";
    } else if (a === coloradoBendId && o === houstonId) {
      normalized.name = "Alt Plan (Stop in Houston first)";
    }
  }

  return normalized;
}

export function normalizeTrip(trip: Trip): Trip {
  const scenariosById = Object.fromEntries(
    Object.entries(trip.scenariosById).map(([id, s]) => [id, normalizeScenario(trip, s)]),
  );

  const houstonId = findHoustonId(trip);
  const coloradoBendId = findColoradoBendId(trip);

  // Prefer the Base Plan (Start: Colorado Bend) as active if present.
  let activeScenarioId =
    trip.activeScenarioId && scenariosById[trip.activeScenarioId]
      ? trip.activeScenarioId
      : Object.keys(scenariosById)[0]!;

  if (houstonId && coloradoBendId) {
    const base = Object.entries(scenariosById).find(([, s]) => {
      const a = s.actualStartPlaceId ?? s.selectedOriginPlaceId;
      return a === coloradoBendId && s.selectedOriginPlaceId === coloradoBendId;
    });
    if (base) activeScenarioId = base[0];
  }

  return {
    ...trip,
    scenariosById,
    activeScenarioId,
  };
}


