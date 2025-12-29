import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

import type { Trip } from "@/types/trip";

export type ShareStateV1 = {
  v: 1;
  trip: Trip;
};

export function encodeShareStateV1(trip: Trip) {
  const payload: ShareStateV1 = { v: 1, trip };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeShareStateV1(s: string): Trip | null {
  const json = decompressFromEncodedURIComponent(s);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as ShareStateV1;
    if (!parsed || parsed.v !== 1 || !parsed.trip) return null;
    return parsed.trip;
  } catch {
    return null;
  }
}


