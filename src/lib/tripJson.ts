import type { Trip } from "@/types/trip";

export type TripExportV1 = {
  v: 1;
  exportedAtISO: string;
  trip: Trip;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function encodeTripExportV1(trip: Trip): string {
  const payload: TripExportV1 = { v: 1, exportedAtISO: new Date().toISOString(), trip };
  return JSON.stringify(payload, null, 2);
}

export function decodeTripJson(jsonText: string): Trip {
  const parsed = JSON.parse(jsonText) as unknown;

  // Accept either:
  // - a raw Trip object (older exports / manual edits)
  // - a wrapped export payload { v, trip, ... }
  if (isObject(parsed) && "trip" in parsed) {
    const maybeTrip = (parsed as { trip?: unknown }).trip;
    if (isObject(maybeTrip)) return maybeTrip as Trip;
  }

  if (!isObject(parsed)) throw new Error("Invalid JSON: expected an object.");
  return parsed as Trip;
}

export function makeTripExportFilename(trip: Trip) {
  const safeTitle = (trip.title || "trip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${safeTitle || "trip"}-${yyyy}-${mm}-${dd}.json`;
}

export function downloadTextFile(params: { filename: string; text: string; mime?: string }) {
  const { filename, text, mime } = params;
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: mime ?? "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


