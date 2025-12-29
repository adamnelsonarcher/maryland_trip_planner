import type { NormalizedDirectionsLeg } from "@/types/trip";

export function normalizeDirectionsResponse(
  placeIdsInOrder: string[],
  response: google.maps.DirectionsResult,
): NormalizedDirectionsLeg[] {
  const route = response.routes?.[0];
  const legs = route?.legs ?? [];

  const out: NormalizedDirectionsLeg[] = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (!leg) continue;
    const fromPlaceId = placeIdsInOrder[i];
    const toPlaceId = placeIdsInOrder[i + 1];
    if (!fromPlaceId || !toPlaceId) continue;

    out.push({
      fromPlaceId,
      toPlaceId,
      durationSec: leg.duration?.value ?? 0,
      distanceMeters: leg.distance?.value ?? 0,
      startAddress: leg.start_address,
      endAddress: leg.end_address,
    });
  }

  return out;
}


