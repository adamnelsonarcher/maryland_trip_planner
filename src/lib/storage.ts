import type { Trip } from "@/types/trip";

const STORAGE_KEY = "maryland_trip_planner:v1";

export function loadTripFromLocalStorage(): Trip | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Trip;
  } catch {
    return null;
  }
}

export function saveTripToLocalStorage(trip: Trip) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
  } catch {
    // ignore
  }
}

export function clearTripLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}


