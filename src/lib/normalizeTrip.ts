import type { Scenario, Trip } from "@/types/trip";

function findHoustonId(trip: Trip): string | undefined {
  return Object.values(trip.placesById).find((p) => p.name.toLowerCase().includes("houston"))?.id;
}

function normalizeScenario(trip: Trip, scenario: Scenario): Scenario {
  const houstonId = findHoustonId(trip);
  const selectedOriginPlaceId = scenario.selectedOriginPlaceId;

  const settings = {
    dailyStartTime: scenario.settings?.dailyStartTime ?? "08:00",
    maxDrivingHoursPerDay: scenario.settings?.maxDrivingHoursPerDay ?? 6,
    bufferMinutesPerStop: scenario.settings?.bufferMinutesPerStop ?? 20,
    originStayDays: scenario.settings?.originStayDays ?? 0,
  };

  return {
    ...scenario,
    actualStartPlaceId: scenario.actualStartPlaceId ?? selectedOriginPlaceId,
    returnToPlaceId: scenario.returnToPlaceId ?? houstonId ?? selectedOriginPlaceId,
    dayOverridesByISO: scenario.dayOverridesByISO ?? {},
    settings,
  };
}

export function normalizeTrip(trip: Trip): Trip {
  const scenariosById = Object.fromEntries(
    Object.entries(trip.scenariosById).map(([id, s]) => [id, normalizeScenario(trip, s)]),
  );

  const activeScenarioId =
    trip.activeScenarioId && scenariosById[trip.activeScenarioId] ? trip.activeScenarioId : Object.keys(scenariosById)[0]!;

  return {
    ...trip,
    scenariosById,
    activeScenarioId,
  };
}


