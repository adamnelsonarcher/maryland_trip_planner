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

function scaleDistanceMeters(distanceMeters: number, fraction: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  return Math.round(distanceMeters * fraction);
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

function availableDriveSec(maxDriveSecPerDay: number) {
  // 0 means "no limit" in our UI.
  return maxDriveSecPerDay > 0 ? maxDriveSecPerDay : Number.POSITIVE_INFINITY;
}

function computeEarliestReturnStartDayIdx(params: {
  days: DayItinerary[];
  scenario: Scenario;
  returnLegs: NormalizedDirectionsLeg[];
  maxDriveSecPerDay: number;
}): number {
  const { days, scenario, returnLegs, maxDriveSecPerDay } = params;
  const cap = availableDriveSec(maxDriveSecPerDay);
  let remaining = returnLegs.reduce((sum, l) => sum + l.durationSec, 0);
  if (remaining <= 0) return days.length - 1;

  // Walk backward from the end date, consuming up to cap per non-rest day.
  for (let dayIdx = days.length - 1; dayIdx >= 0; dayIdx--) {
    const dayISO = days[dayIdx]!.dayISO;
    if (isRestDay(scenario, dayISO)) continue;
    remaining -= Math.min(remaining, cap);
    if (remaining <= 0) return dayIdx;
  }

  // Not enough days.
  return 0;
}

function scheduleLegsForward(params: {
  trip: Trip;
  scenario: Scenario;
  days: DayItinerary[];
  startDayIdx: number;
  legs: NormalizedDirectionsLeg[];
  maxDriveSecPerDay: number;
  bufferSec: number;
  onDayEnter?: (dayIdx: number) => void;
}): { endDayIdx: number; spills: boolean } {
  const { trip, scenario, days, startDayIdx, legs, maxDriveSecPerDay, bufferSec, onDayEnter } = params;

  let dayIdx = startDayIdx;
  let driveSecUsedToday = 0;
  let depart = makeLocalDateTime(days[dayIdx]!.dayISO, scenario.settings.dailyStartTime);

  const cap = availableDriveSec(maxDriveSecPerDay);

  const advanceDay = () => {
    if (dayIdx >= days.length - 1) return false;
    dayIdx += 1;
    driveSecUsedToday = 0;
    depart = makeLocalDateTime(days[dayIdx]!.dayISO, scenario.settings.dailyStartTime);
    onDayEnter?.(dayIdx);
    return true;
  };

  const ensureDriveDay = () => {
    while (dayIdx < days.length && isRestDay(scenario, days[dayIdx]!.dayISO)) {
      days[dayIdx]!.warnings.push("Marked as Rest/Explore day — no driving scheduled.");
      if (!advanceDay()) return false;
    }
    return true;
  };

  onDayEnter?.(dayIdx);

  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx]!;

    let remaining = Math.max(0, leg.durationSec);
    const parts = cap === Number.POSITIVE_INFINITY ? 1 : Math.max(1, Math.ceil(remaining / cap));
    let partIndex = 1;

    while (remaining > 0) {
      if (!ensureDriveDay()) return { endDayIdx: dayIdx, spills: true };

      const remainingToday = Math.max(0, cap - driveSecUsedToday);
      if (remainingToday <= 0) {
        if (!advanceDay()) return { endDayIdx: dayIdx, spills: true };
        continue;
      }

      const chunkSec = Math.min(remaining, remainingToday);
      const fraction = leg.durationSec > 0 ? chunkSec / leg.durationSec : 0;
      const chunkDistance = scaleDistanceMeters(leg.distanceMeters, fraction);

      const arrive = new Date(depart.getTime() + chunkSec * 1000);
      const isSplit = parts > 1;
      const isFinalChunk = remaining - chunkSec <= 0;

      const scheduled: ScheduledLeg = {
        ...leg,
        durationSec: chunkSec,
        distanceMeters: chunkDistance,
        departAtISO: depart.toISOString(),
        arriveAtISO: arrive.toISOString(),
        dayISO: days[dayIdx]!.dayISO,
        bufferSec: isFinalChunk ? bufferSec : 0,
        isSplitChunk: isSplit,
        partIndex: isSplit ? partIndex : undefined,
        partCount: isSplit ? parts : undefined,
      };

      days[dayIdx]!.legs.push(scheduled);
      days[dayIdx]!.totalDriveSec += chunkSec;
      driveSecUsedToday += chunkSec;

      remaining -= chunkSec;
      partIndex += 1;

      // Only add buffer after the final chunk that actually arrives at the stop.
      if (isFinalChunk) {
        depart = new Date(arrive.getTime() + bufferSec * 1000);
      } else {
        // Next chunk continues next day at daily start time.
        if (!advanceDay()) return { endDayIdx: dayIdx, spills: true };
      }
    }
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
  const maxDriveSecPerDay = Math.max(0, Math.round(scenario.settings.maxDrivingHoursPerDay * 3600));
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
    trip,
    scenario,
    days,
    startDayIdx: Math.min(dayIdx, days.length - 1),
    legs: outboundLegs,
    maxDriveSecPerDay,
    bufferSec,
  });
  spillsBeyondEndDate ||= outbound.spills;

  // 4) Choose a start day for the return segment so that it finishes on endDate,
  // leaving middle days as "stay/unspecified" at the last anchor.
  const earliestReturnStart = computeEarliestReturnStartDayIdx({
    days,
    scenario,
    returnLegs,
    maxDriveSecPerDay,
  });
  const returnStartDayIdx = Math.max(outbound.endDayIdx, earliestReturnStart);

  // We intentionally leave the "gap" days blank. Users will assign optional activities later.

  // 5) Schedule return segment starting at returnStartDayIdx.
  const ret = scheduleLegsForward({
    trip,
    scenario,
    days,
    startDayIdx: Math.min(returnStartDayIdx, days.length - 1),
    legs: returnLegs,
    maxDriveSecPerDay,
    bufferSec,
  });
  spillsBeyondEndDate ||= ret.spills;

  if (spillsBeyondEndDate) {
    days[days.length - 1]!.warnings.push(
      "Schedule likely spills beyond the trip end date with the current max driving hours/day setting.",
    );
  }

  return { days, spillsBeyondEndDate };
}


