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
  bufferMinutesPerStop: number;
};

export type DayOverrideMode = "auto" | "rest";

export type PresetDayTrip = "NYC" | "PA";

export type DayTripPreset = PresetDayTrip | "CUSTOM";

export type DwellBlock = {
  id: string;
  placeId: string;
  minutes: number;
  label?: string;
};

export type DayOverride = {
  mode: DayOverrideMode;
  basePlaceId?: string; // where you're staying / exploring that day
  notes?: string;
  presetDayTrip?: PresetDayTrip; // legacy (kept for migration)
  dayTrip?: {
    preset: DayTripPreset;
    destinationPlaceId?: string; // required when preset === "CUSTOM"
    startPlaceId?: string; // default: inferred base location for that day
    endPlaceId?: string; // default: same as startPlaceId
    dwellMinutes: number; // time spent at the destination
  };
  dwellBlocks?: DwellBlock[];
};

export type Scenario = {
  id: string;
  name: string;
  actualStartPlaceId?: string; // physical start location (can differ from route origin)
  selectedOriginPlaceId: string;
  returnToPlaceId?: string; // default: Houston for this trip
  intermediateStopPlaceIds: string[];
  returnStopPlaceIds?: string[]; // stops on the drive home to returnToPlaceId
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
  startTimeHHMM: string; // "HH:MM" (trip start time on start date)
  endTimeHHMM: string; // "HH:MM" (trip cutoff time on end date)
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

export type LegKind = "up" | "home" | "other";

export type ScheduledLeg = NormalizedDirectionsLeg & {
  departAtISO: string;
  arriveAtISO: string;
  dayISO: string;
  bufferSec: number;
  kind?: LegKind;
  // When a nonstop drive crosses midnight, the schedule is split at 00:00.
  // Only the final chunk actually arrives at the destination place.
  arrivesAtDestination?: boolean;
  eventType?: "drive" | "dwell";
  label?: string;
  dwellSource?: { type: "dayTrip" } | { type: "dwellBlock"; blockId: string };
};

export type DayItinerary = {
  dayISO: string;
  legs: ScheduledLeg[];
  totalDriveSec: number;
  warnings: string[];
};


