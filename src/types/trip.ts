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
  originStayDays: number; // full days to stay at the route origin before continuing
};

export type DayOverrideMode = "auto" | "rest";

export type DayOverride = {
  mode: DayOverrideMode;
  basePlaceId?: string; // where you're staying / exploring that day
  notes?: string;
};

export type Scenario = {
  id: string;
  name: string;
  actualStartPlaceId?: string; // physical start location (can differ from route origin)
  selectedOriginPlaceId: string;
  returnToPlaceId?: string; // default: Houston for this trip
  intermediateStopPlaceIds: string[];
  anchorPlaceIds: string[]; // ordered: e.g. Annapolis -> Lake House
  settings: ScenarioSettings;
  dayOverridesByISO?: Record<string, DayOverride>; // "YYYY-MM-DD" -> override

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
  // If a Directions leg is split across multiple days, each scheduled chunk will include part info.
  partIndex?: number; // 1-based
  partCount?: number; // total parts for this original leg
  isSplitChunk?: boolean;
};

export type DayItinerary = {
  dayISO: string;
  legs: ScheduledLeg[];
  totalDriveSec: number;
  warnings: string[];
};


