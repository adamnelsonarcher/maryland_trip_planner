import type {
  DayItinerary,
  NormalizedDirectionsLeg,
  Scenario,
  ScheduledLeg,
  Trip,
} from "@/types/trip";
import { addDays, diffDaysInclusive, makeLocalDateTime } from "@/lib/time";

export type ComputeItineraryInput = {
  trip: Trip;
  scenario: Scenario;
  legs: NormalizedDirectionsLeg[];
};

export type ComputeItineraryOutput = {
  days: DayItinerary[];
  spillsBeyondEndDate: boolean;
};

function dateISOFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextMidnight(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function findLastAnchorId(scenario: Scenario): string | undefined {
  return scenario.anchorPlaceIds.length > 0 ? scenario.anchorPlaceIds[scenario.anchorPlaceIds.length - 1] : undefined;
}

function findReturnStartIndex(legs: NormalizedDirectionsLeg[], scenario: Scenario): number {
  const lastAnchorId = findLastAnchorId(scenario);
  if (!lastAnchorId) return Math.max(0, legs.length - 1);
  const idx = legs.findIndex((l) => l.fromPlaceId === lastAnchorId);
  return idx >= 0 ? idx : Math.max(0, legs.length - 1);
}

function isRestDay(scenario: Scenario, dayISO: string) {
  return scenario.dayOverridesByISO?.[dayISO]?.mode === "rest";
}

function scaleDistanceMeters(distanceMeters: number, fraction: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  return Math.round(distanceMeters * fraction);
}

function pushChunk(days: DayItinerary[], dayISO: string, chunk: ScheduledLeg) {
  const idx = days.findIndex((d) => d.dayISO === dayISO);
  if (idx < 0) return false;
  days[idx]!.legs.push(chunk);
  days[idx]!.totalDriveSec += Math.max(0, chunk.durationSec);
  return true;
}

function scheduleOneLegMidnightSplit(params: {
  days: DayItinerary[];
  scenario: Scenario;
  depart: Date;
  leg: NormalizedDirectionsLeg;
  bufferSec: number;
  kind: "up" | "home" | "other";
}): { departAfter: Date; spills: boolean } {
  const { days, scenario, depart, leg, bufferSec, kind } = params;
  const t0 = depart;
  const totalSec = Math.max(0, leg.durationSec);
  const tArrive = new Date(t0.getTime() + totalSec * 1000);

  // We split at each midnight boundary between depart and arrival.
  let remainingSec = totalSec;
  let currentStart = t0;

  while (remainingSec > 0) {
    const mid = nextMidnight(currentStart);
    const chunkEnd = mid.getTime() < tArrive.getTime() ? mid : tArrive;
    const chunkSec = Math.max(0, Math.round((chunkEnd.getTime() - currentStart.getTime()) / 1000));

    const isFinal = chunkEnd.getTime() === tArrive.getTime();
    const fraction = totalSec > 0 ? chunkSec / totalSec : 0;

    // Show each chunk on the day it starts (so the first chunk appears on the real departure day).
    const dayISO = dateISOFromDate(currentStart);
    const chunk: ScheduledLeg = {
      ...leg,
      durationSec: chunkSec,
      distanceMeters: scaleDistanceMeters(leg.distanceMeters, fraction),
      departAtISO: currentStart.toISOString(),
      arriveAtISO: chunkEnd.toISOString(),
      dayISO,
      bufferSec: isFinal ? bufferSec : 0,
      kind,
      arrivesAtDestination: isFinal,
    };

    // Respect "rest" days: if a chunk would appear on a rest day, we still record it but warn.
    if (isRestDay(scenario, dayISO)) {
      const idx = days.findIndex((d) => d.dayISO === dayISO);
      if (idx >= 0) {
        days[idx]!.warnings.push("This day is marked Rest/Explore but a nonstop drive spans into it.");
      }
    }

    if (!pushChunk(days, dayISO, chunk)) return { departAfter: currentStart, spills: true };

    remainingSec -= chunkSec;
    currentStart = chunkEnd;

    // If we ended exactly at midnight (not final), continue immediately from midnight.
  }

  const departAfter = new Date(tArrive.getTime() + bufferSec * 1000);
  return { departAfter, spills: false };
}

function computeLatestReturnStart(params: {
  tripEndISO: string;
  returnLegs: NormalizedDirectionsLeg[];
  bufferSec: number;
}): Date {
  const { tripEndISO, returnLegs, bufferSec } = params;
  // Target: arrive by end-of-day on trip end date.
  const cutoff = endOfDay(makeLocalDateTime(tripEndISO, "00:00"));

  const totalDrive = returnLegs.reduce((sum, l) => sum + Math.max(0, l.durationSec), 0);
  const interLegBuffers = Math.max(0, returnLegs.length - 1) * bufferSec;
  const total = totalDrive + interLegBuffers;

  // Start such that arrival is at cutoff (latest possible).
  return new Date(cutoff.getTime() - total * 1000);
}

function computeEarliestReturnStartDayIdx(params: {
  days: DayItinerary[];
  scenario: Scenario;
  returnLegs: NormalizedDirectionsLeg[];
}): number {
  const { days, scenario, returnLegs } = params;
  const totalSec = returnLegs.reduce((sum, l) => sum + Math.max(0, l.durationSec), 0);
  if (totalSec <= 0) return days.length - 1;

  // Nonstop driving: estimate how many calendar days it can span.
  const spanDays = Math.max(1, Math.ceil(totalSec / (24 * 3600)));
  let startIdx = Math.max(0, days.length - spanDays);

  // Avoid starting on a rest day by moving earlier if needed.
  while (startIdx > 0 && isRestDay(scenario, days[startIdx]!.dayISO)) startIdx -= 1;
  return startIdx;
}

function scheduleLegsForward(params: {
  scenario: Scenario;
  days: DayItinerary[];
  startDayIdx: number;
  startDepart?: Date;
  legs: NormalizedDirectionsLeg[];
  bufferSec: number;
  kind: "up" | "home" | "other";
}): { endDayIdx: number; spills: boolean } {
  const { scenario, days, startDayIdx, startDepart, legs, bufferSec, kind } = params;

  let dayIdx = startDayIdx;
  let depart = startDepart ?? makeLocalDateTime(days[dayIdx]!.dayISO, scenario.settings.dailyStartTime);

  const advanceDay = () => {
    if (dayIdx >= days.length - 1) return false;
    dayIdx += 1;
    depart = makeLocalDateTime(days[dayIdx]!.dayISO, scenario.settings.dailyStartTime);
    return true;
  };

  const ensureDriveDay = () => {
    while (dayIdx < days.length && isRestDay(scenario, days[dayIdx]!.dayISO)) {
      days[dayIdx]!.warnings.push("Marked as Rest/Explore day — no driving scheduled.");
      if (!advanceDay()) return false;
    }
    return true;
  };

  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx]!;
    if (!ensureDriveDay()) return { endDayIdx: dayIdx, spills: true };

    const res = scheduleOneLegMidnightSplit({ days, scenario, depart, leg, bufferSec, kind });
    if (res.spills) return { endDayIdx: dayIdx, spills: true };
    depart = res.departAfter;
    dayIdx = Math.max(dayIdx, days.findIndex((d) => d.dayISO === dateISOFromDate(depart)));
  }

  return { endDayIdx: dayIdx, spills: false };
}

export function computeItinerary({
  trip,
  scenario,
  legs,
}: ComputeItineraryInput): ComputeItineraryOutput {
  const dayCount = diffDaysInclusive(trip.startDateISO, trip.endDateISO);
  const days: DayItinerary[] = Array.from({ length: dayCount }, (_, idx) => ({
    dayISO: addDays(trip.startDateISO, idx),
    legs: [],
    totalDriveSec: 0,
    warnings: [],
  }));

  if (legs.length === 0) {
    days[0]?.warnings.push("No route yet. Add an origin + destination (anchors) to compute drive times.");
    return { days, spillsBeyondEndDate: false };
  }

  const bufferSec = Math.max(0, Math.round(scenario.settings.bufferMinutesPerStop * 60));
  const originStayDays = Math.max(0, Math.floor(scenario.settings.originStayDays ?? 0));
  // Note: we intentionally do NOT add placeholder warnings for "undeclared" days.

  let spillsBeyondEndDate = false;

  // 1) Split legs into outbound vs return segment (starting from last anchor).
  const returnStartIdx = findReturnStartIndex(legs, scenario);
  const outboundLegs = legs.slice(0, returnStartIdx);
  const returnLegs = legs.slice(returnStartIdx);

  // 2) Apply origin stay days at the beginning as "unspecified/stay" days.
  let dayIdx = 0;
  for (let s = 0; s < originStayDays; s++) {
    // Respect explicit rest days: if user already set rest, we treat it as consumed.
    while (dayIdx < days.length && isRestDay(scenario, days[dayIdx]!.dayISO)) {
      days[dayIdx]!.warnings.push("Marked as Rest/Explore day — no driving scheduled.");
      dayIdx += 1;
    }
    if (dayIdx >= days.length) {
      spillsBeyondEndDate = true;
      break;
    }
    dayIdx += 1;
  }

  // 3) Schedule outbound as early as possible starting at current dayIdx.
  const outbound = scheduleLegsForward({
    scenario,
    days,
    startDayIdx: Math.min(dayIdx, days.length - 1),
    legs: outboundLegs,
    bufferSec,
    kind: "up",
  });
  spillsBeyondEndDate ||= outbound.spills;

  // 4) Choose a start day for the return segment so that it finishes on endDate,
  // leaving middle days as "stay/unspecified" at the last anchor.
  const earliestReturnStart = computeEarliestReturnStartDayIdx({
    days,
    scenario,
    returnLegs,
  });
  const returnStartDayIdx = Math.max(outbound.endDayIdx, earliestReturnStart);

  // We intentionally leave the "gap" days blank. Users will assign optional activities later.

  // 5) Schedule return segment starting at returnStartDayIdx.
  const latestReturnStart = computeLatestReturnStart({
    tripEndISO: trip.endDateISO,
    returnLegs,
    bufferSec,
  });

  // If outbound ends after the latest possible return start, we can't finish by end of trip.
  const outboundEndDay = days[outbound.endDayIdx]?.dayISO ?? trip.startDateISO;
  const outboundEndAt = makeLocalDateTime(outboundEndDay, scenario.settings.dailyStartTime);
  if (outboundEndAt.getTime() > latestReturnStart.getTime()) {
    spillsBeyondEndDate = true;
  }

  const ret = scheduleLegsForward({
    scenario,
    days,
    startDayIdx: Math.min(returnStartDayIdx, days.length - 1),
    startDepart: latestReturnStart,
    legs: returnLegs,
    bufferSec,
    kind: "home",
  });
  spillsBeyondEndDate ||= ret.spills;

  if (spillsBeyondEndDate) {
    days[days.length - 1]!.warnings.push(
      "Schedule likely spills beyond the trip end date with the current max driving hours/day setting.",
    );
  }

  return { days, spillsBeyondEndDate };
}


