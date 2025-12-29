export type LatLngLiteral = { lat: number; lng: number };

export type PlaceTag = "lodging" | "anchor" | "attraction" | "friend" | "park";

export type Place = {
  id: string;
  name: string;
  address: string;
  location: LatLngLiteral;
  tags?: PlaceTag[];
};

export type ScenarioSettings = {
  dailyStartTime: string; // "HH:MM"
  maxDrivingHoursPerDay: number;
  bufferMinutesPerStop: number;
};

export type Scenario = {
  id: string;
  name: string;
  selectedOriginPlaceId: string;
  intermediateStopPlaceIds: string[];
  anchorPlaceIds: string[]; // ordered: e.g. Annapolis -> Lake House
  settings: ScenarioSettings;

  // Phase 5+ (not used for v1 scheduling yet)
  includeNYCDayTrip?: boolean;
  nycDayISO?: string; // "YYYY-MM-DD"
  includePADayTrip?: boolean;
  paDayISO?: string; // "YYYY-MM-DD"
};

export type Trip = {
  id: string;
  title: string;
  startDateISO: string; // "YYYY-MM-DD"
  endDateISO: string; // "YYYY-MM-DD"
  placesById: Record<string, Place>;
  scenariosById: Record<string, Scenario>;
  activeScenarioId: string;
};

export type NormalizedDirectionsLeg = {
  fromPlaceId: string;
  toPlaceId: string;
  durationSec: number;
  distanceMeters: number;
  startAddress?: string;
  endAddress?: string;
};

export type ScheduledLeg = NormalizedDirectionsLeg & {
  departAtISO: string;
  arriveAtISO: string;
  dayISO: string;
  bufferSec: number;
};

export type DayItinerary = {
  dayISO: string;
  legs: ScheduledLeg[];
  totalDriveSec: number;
  warnings: string[];
};


