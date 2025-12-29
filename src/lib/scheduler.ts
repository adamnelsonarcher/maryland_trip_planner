import type {
  DayItinerary,
  LegKind,
  NormalizedDirectionsLeg,
  Scenario,
  ScheduledLeg,
  Trip,
} from "@/types/trip";
import { addDays, diffDaysInclusive, makeLocalDateTime } from "@/lib/time";

export type ComputeItineraryInput = {
  trip: Trip;
  scenario: Scenario;
  legs: (NormalizedDirectionsLeg & { kind?: LegKind })[];
  dayTripsByISO?: Record<
    string,
    {
      legs: NormalizedDirectionsLeg[];
      dwellMinutes: number;
      destinationPlaceId: string;
    }
  >;
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

// (legacy) return start inference used to exist here; now we rely on explicit leg kinds.

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
  if (chunk.eventType !== "dwell") {
    days[idx]!.totalDriveSec += Math.max(0, chunk.durationSec);
  }
  return true;
}

function scheduleOneLegMidnightSplit(params: {
  days: DayItinerary[];
  scenario: Scenario;
  depart: Date;
  leg: NormalizedDirectionsLeg & { kind?: LegKind };
  bufferSec: number;
  kind: "up" | "home" | "other";
}): { departAfter: Date; arriveAt: Date; spills: boolean } {
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
      kind: (leg.kind ?? kind),
      arrivesAtDestination: isFinal,
      eventType: "drive",
    };

    // Respect "rest" days: if a chunk would appear on a rest day, we still record it but warn.
    if (isRestDay(scenario, dayISO)) {
      const idx = days.findIndex((d) => d.dayISO === dayISO);
      if (idx >= 0) {
        days[idx]!.warnings.push("This day is marked Rest/Explore but a nonstop drive spans into it.");
      }
    }

    if (!pushChunk(days, dayISO, chunk)) return { departAfter: currentStart, arriveAt: tArrive, spills: true };

    remainingSec -= chunkSec;
    currentStart = chunkEnd;

    // If we ended exactly at midnight (not final), continue immediately from midnight.
  }

  const departAfter = new Date(tArrive.getTime() + bufferSec * 1000);
  return { departAfter, arriveAt: tArrive, spills: false };
}

function computeLatestReturnStart(params: {
  tripEndISO: string;
  tripEndTimeHHMM: string;
  returnLegs: NormalizedDirectionsLeg[];
  bufferSec: number;
}): Date {
  const { tripEndISO, tripEndTimeHHMM, returnLegs, bufferSec } = params;
  // Target: arrive by the trip end time on the end date.
  const cutoff = makeLocalDateTime(tripEndISO, tripEndTimeHHMM);

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
  dayStartTimeHHMM: string;
  scenario: Scenario;
  days: DayItinerary[];
  startDayIdx: number;
  startDepart?: Date;
  legs: (NormalizedDirectionsLeg & { kind?: LegKind })[];
  bufferSec: number;
  kind: "up" | "home" | "other";
}): { endDayIdx: number; endDepartAfter: Date; spills: boolean } {
  const { dayStartTimeHHMM, scenario, days, startDayIdx, startDepart, legs, bufferSec, kind } = params;

  const DEFAULT_DWELL_AFTER_ARRIVAL_SEC = 90 * 60;

  let dayIdx = startDayIdx;
  let depart = startDepart ?? makeLocalDateTime(days[dayIdx]!.dayISO, dayStartTimeHHMM);

  const advanceDay = () => {
    if (dayIdx >= days.length - 1) return false;
    dayIdx += 1;
    depart = makeLocalDateTime(days[dayIdx]!.dayISO, dayStartTimeHHMM);
    return true;
  };

  const ensureDriveDay = () => {
    while (dayIdx < days.length && isRestDay(scenario, days[dayIdx]!.dayISO)) {
      days[dayIdx]!.warnings.push("Marked as Rest/Explore day — no driving scheduled.");
      if (!advanceDay()) return false;
    }
    return true;
  };

  const usedBlockIds = new Set<string>();
  const overrides = scenario.dayOverridesByISO ?? {};

  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx]!;
    if (!ensureDriveDay()) return { endDayIdx: dayIdx, endDepartAfter: depart, spills: true };

    const res = scheduleOneLegMidnightSplit({ days, scenario, depart, leg, bufferSec, kind });
    if (res.spills) return { endDayIdx: dayIdx, endDepartAfter: depart, spills: true };

    // Special-case: the final leg of the drive home ends the trip.
    // Don't create any "Time at Houston" (or other terminal destination) dwell card.
    const isTerminalReturnArrival = kind === "home" && legIdx === legs.length - 1;

    // After arriving at the destination for this leg, insert:
    // - Any explicit dwellBlocks for that stop (editable/saved)
    // - Otherwise, an implicit "Time at ..." placeholder card (click to set minutes)
    const arriveDayISO = dateISOFromDate(res.arriveAt);
    const blocks = overrides[arriveDayISO]?.dwellBlocks ?? [];
    let insertedAnyForPlace = false;

    let dwellSecTotal = 0;
    if (!isTerminalReturnArrival) {
      for (const b of blocks) {
        if (usedBlockIds.has(b.id)) continue;
        if (b.placeId !== leg.toPlaceId) continue;
        const sec = Math.max(0, Math.round(b.minutes * 60));
        // Allow 0-minute blocks to exist in data, but don't schedule them as events.
        if (sec <= 0) {
          usedBlockIds.add(b.id);
          insertedAnyForPlace = true;
          continue;
        }

        const dwellStart = new Date(res.arriveAt.getTime() + dwellSecTotal * 1000);
        const dwellEnd = new Date(dwellStart.getTime() + sec * 1000);
        const dwell: ScheduledLeg = {
          fromPlaceId: b.placeId,
          toPlaceId: b.placeId,
          durationSec: sec,
          distanceMeters: 0,
          departAtISO: dwellStart.toISOString(),
          arriveAtISO: dwellEnd.toISOString(),
          dayISO: arriveDayISO,
          bufferSec: 0,
          kind: "other",
          arrivesAtDestination: true,
          eventType: "dwell",
          label: b.label,
          dwellSource: { type: "dwellBlock", blockId: b.id },
        };
        pushChunk(days, arriveDayISO, dwell);
        usedBlockIds.add(b.id);
        insertedAnyForPlace = true;
        dwellSecTotal += sec;
      }

      if (!insertedAnyForPlace) {
        const sec = DEFAULT_DWELL_AFTER_ARRIVAL_SEC;
        const dwellStart = new Date(res.arriveAt.getTime());
        const dwellEnd = new Date(dwellStart.getTime() + sec * 1000);
        const at: ScheduledLeg = {
          fromPlaceId: leg.toPlaceId,
          toPlaceId: leg.toPlaceId,
          durationSec: sec,
          distanceMeters: 0,
          departAtISO: dwellStart.toISOString(),
          arriveAtISO: dwellEnd.toISOString(),
          dayISO: arriveDayISO,
          bufferSec: 0,
          kind: "other",
          arrivesAtDestination: true,
          eventType: "dwell",
          dwellSource: { type: "implicitArrival" },
        };
        pushChunk(days, arriveDayISO, at);
        dwellSecTotal += sec;
      }
    }

    // Next drive can depart after: arrival + dwell + buffer
    depart = isTerminalReturnArrival
      ? res.departAfter
      : new Date(res.arriveAt.getTime() + dwellSecTotal * 1000 + bufferSec * 1000);
    const nextIdx = days.findIndex((d) => d.dayISO === dateISOFromDate(depart));
    if (nextIdx >= 0) dayIdx = Math.max(dayIdx, nextIdx);
  }

  return { endDayIdx: dayIdx, endDepartAfter: depart, spills: false };
}

export function computeItinerary({
  trip,
  scenario,
  legs,
  dayTripsByISO,
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
  // Note: we intentionally do NOT add placeholder warnings for "undeclared" days.

  let spillsBeyondEndDate = false;

  // 1) Use explicit kinds (up/home/other) to separate return-home legs from everything else.
  const preHomeLegs = legs.filter((l) => l.kind !== "home");
  const returnLegs = legs.filter((l) => l.kind === "home");

  // 2) Apply origin stay days at the beginning as "unspecified/stay" days.
  const dayIdx = 0;

  // 3) Schedule outbound as early as possible starting at current dayIdx.
  const outbound = scheduleLegsForward({
    dayStartTimeHHMM: trip.startTimeHHMM,
    scenario,
    days,
    startDayIdx: Math.min(dayIdx, days.length - 1),
    legs: preHomeLegs,
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
    tripEndTimeHHMM: trip.endTimeHHMM,
    returnLegs,
    bufferSec,
  });

  // User-chosen return depart, clamped to latest allowed.
  const userReturnDepart = makeLocalDateTime(trip.returnDepartDateISO, trip.returnDepartTimeHHMM);
  const clampedUserReturnDepart = new Date(Math.min(userReturnDepart.getTime(), latestReturnStart.getTime()));
  // Can't leave before finishing the outbound (arriving at the lake house / last non-home segment).
  const earliestReturnDepart = outbound.endDepartAfter;
  const actualReturnDepart = new Date(Math.max(clampedUserReturnDepart.getTime(), earliestReturnDepart.getTime()));

  if (actualReturnDepart.getTime() > latestReturnStart.getTime()) spillsBeyondEndDate = true;

  const ret = scheduleLegsForward({
    dayStartTimeHHMM: trip.startTimeHHMM,
    scenario,
    days,
    startDayIdx: Math.min(returnStartDayIdx, days.length - 1),
    startDepart: actualReturnDepart,
    legs: returnLegs,
    bufferSec,
    kind: "home",
  });
  spillsBeyondEndDate ||= ret.spills;

  // 6) Insert day trips (drive -> dwell -> drive) with real durations.
  if (dayTripsByISO) {
    for (const [dayISO, dt] of Object.entries(dayTripsByISO)) {
      const idx = days.findIndex((d) => d.dayISO === dayISO);
      if (idx < 0) continue;
      if (dt.legs.length === 0) continue;

      // Start day trip at trip start time on that day.
      let depart = makeLocalDateTime(dayISO, trip.startTimeHHMM);
      for (let i = 0; i < dt.legs.length; i++) {
        const leg = dt.legs[i]!;
        const res = scheduleOneLegMidnightSplit({
          days,
          scenario,
          depart,
          leg,
          bufferSec,
          kind: "other",
        });
        if (res.spills) spillsBeyondEndDate = true;
        depart = res.departAfter;

        // After arriving at the day trip destination (first leg), add dwell.
        if (i === 0) {
          const dwellSec = Math.max(0, Math.round(dt.dwellMinutes * 60));
          if (dwellSec > 0) {
            const dwellStart = new Date(depart.getTime() - bufferSec * 1000);
            const dwellEnd = new Date(dwellStart.getTime() + dwellSec * 1000);
            const dwellDayISO = dateISOFromDate(dwellStart);
            const dwell: ScheduledLeg = {
              fromPlaceId: dt.destinationPlaceId,
              toPlaceId: dt.destinationPlaceId,
              durationSec: dwellSec,
              distanceMeters: 0,
              departAtISO: dwellStart.toISOString(),
              arriveAtISO: dwellEnd.toISOString(),
              dayISO: dwellDayISO,
              bufferSec: 0,
              kind: "other",
              arrivesAtDestination: true,
              eventType: "dwell",
              label: `Time at ${trip.placesById[dt.destinationPlaceId]?.name ?? "stop"}`,
              dwellSource: { type: "dayTrip" },
            };
            pushChunk(days, dwellDayISO, dwell);
            depart = dwellEnd;
          }
        }
      }
    }
  }

  // 7) Insert remaining "time spent" blocks for days with no matching arrival.
  // These act like standalone day notes/time, placed sequentially from trip start time that day.
  const overrides = scenario.dayOverridesByISO ?? {};
  for (const [dayISO, o] of Object.entries(overrides)) {
    const blocks = o.dwellBlocks ?? [];
    if (blocks.length === 0) continue;
    let t = makeLocalDateTime(dayISO, trip.startTimeHHMM);
    for (const b of blocks) {
      // Skip blocks that were already inserted after a stop arrival (identified by dwellSource).
      const alreadyInserted = days.some((d) =>
        d.dayISO === dayISO &&
        d.legs.some((ev) => ev.eventType === "dwell" && ev.dwellSource?.type === "dwellBlock" && ev.dwellSource.blockId === b.id),
      );
      if (alreadyInserted) continue;

      const sec = Math.max(0, Math.round(b.minutes * 60));
      if (sec <= 0) continue;
      const end = new Date(t.getTime() + sec * 1000);
      const dwell: ScheduledLeg = {
        fromPlaceId: b.placeId,
        toPlaceId: b.placeId,
        durationSec: sec,
        distanceMeters: 0,
        departAtISO: t.toISOString(),
        arriveAtISO: end.toISOString(),
        dayISO,
        bufferSec: 0,
        kind: "other",
        arrivesAtDestination: true,
        eventType: "dwell",
        label: b.label ?? `Time at ${trip.placesById[b.placeId]?.name ?? "stop"}`,
        dwellSource: { type: "dwellBlock", blockId: b.id },
      };
      pushChunk(days, dayISO, dwell);
      t = end;
    }
  }

  if (spillsBeyondEndDate) {
    days[days.length - 1]!.warnings.push(
      "Schedule likely spills beyond the trip end date with the current max driving hours/day setting.",
    );
  }

  return { days, spillsBeyondEndDate };
}


