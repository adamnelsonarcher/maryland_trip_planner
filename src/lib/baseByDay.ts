import type { DayItinerary, Scenario } from "@/types/trip";

export function computeBasePlaceByDay(itinerary: DayItinerary[], scenario: Scenario): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  let current: string | undefined = scenario.actualStartPlaceId ?? scenario.selectedOriginPlaceId;

  for (const day of itinerary) {
    map[day.dayISO] = current;
    if (day.legs.length > 0) {
      for (const leg of day.legs) {
        if (leg.arrivesAtDestination !== false) current = leg.toPlaceId;
      }
    }
  }

  return map;
}


