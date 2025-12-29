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

  const overrides = scenario.dayOverridesByISO ?? {};
  const bufferSec = Math.max(0, Math.round(scenario.settings.bufferMinutesPerStop * 60));
  const maxDriveSecPerDay = Math.max(0, Math.round(scenario.settings.maxDrivingHoursPerDay * 3600));
  const originStayDays = Math.max(0, Math.floor(scenario.settings.originStayDays ?? 0));
  const originName = trip.placesById[scenario.selectedOriginPlaceId]?.name ?? "origin";

  let dayIdx = 0;
  let driveSecUsedToday = 0;
  let depart = makeLocalDateTime(days[0]!.dayISO, scenario.settings.dailyStartTime);

  let spillsBeyondEndDate = false;
  let appliedOriginStay = false;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;

    // Insert full-day "stay" at the route origin before the first leg that departs it.
    if (!appliedOriginStay && originStayDays > 0 && leg.fromPlaceId === scenario.selectedOriginPlaceId) {
      for (let s = 0; s < originStayDays; s++) {
        while (dayIdx < days.length && overrides[days[dayIdx]!.dayISO]?.mode === "rest") {
          // User override already marks it rest; just advance.
          if (dayIdx < days.length - 1) {
            dayIdx += 1;
            driveSecUsedToday = 0;
            depart = makeLocalDateTime(days[dayIdx]!.dayISO, scenario.settings.dailyStartTime);
          } else {
            spillsBeyondEndDate = true;
            break;
          }
        }
        if (spillsBeyondEndDate) break;

        days[dayIdx]!.warnings.push(`Stay day in ${originName}.`);
        if (dayIdx < days.length - 1) {
          dayIdx += 1;
          driveSecUsedToday = 0;
          depart = makeLocalDateTime(days[dayIdx]!.dayISO, scenario.settings.dailyStartTime);
        } else {
          spillsBeyondEndDate = true;
          break;
        }
      }

      appliedOriginStay = true;
      if (spillsBeyondEndDate) break;
    }

    // Respect "rest/explore" days by skipping scheduling any travel legs that day.
    // All remaining travel is pushed to the next non-rest day.
    while (dayIdx < days.length && overrides[days[dayIdx]!.dayISO]?.mode === "rest") {
      days[dayIdx]!.warnings.push("Marked as Rest/Explore day — no driving scheduled.");
      if (dayIdx < days.length - 1) {
        dayIdx += 1;
        driveSecUsedToday = 0;
        depart = makeLocalDateTime(days[dayIdx]!.dayISO, scenario.settings.dailyStartTime);
      } else {
        // No more days available.
        spillsBeyondEndDate = true;
        break;
      }
    }
    if (spillsBeyondEndDate) break;

    // Simple splitting rule:
    // If this leg would push us over the max drive time for the day, roll to next day.
    if (
      dayIdx < days.length - 1 &&
      maxDriveSecPerDay > 0 &&
      driveSecUsedToday > 0 &&
      driveSecUsedToday + leg.durationSec > maxDriveSecPerDay
    ) {
      dayIdx += 1;
      driveSecUsedToday = 0;
      depart = makeLocalDateTime(days[dayIdx]!.dayISO, scenario.settings.dailyStartTime);
    }

    const arrive = new Date(depart.getTime() + leg.durationSec * 1000);
    const scheduled: ScheduledLeg = {
      ...leg,
      departAtISO: depart.toISOString(),
      arriveAtISO: arrive.toISOString(),
      dayISO: days[dayIdx]!.dayISO,
      bufferSec,
    };

    days[dayIdx]!.legs.push(scheduled);
    days[dayIdx]!.totalDriveSec += leg.durationSec;
    driveSecUsedToday += leg.durationSec;

    // Next departure includes buffer after arriving at each stop (including anchors).
    depart = new Date(arrive.getTime() + bufferSec * 1000);

    if (dayIdx === days.length - 1 && maxDriveSecPerDay > 0 && driveSecUsedToday > maxDriveSecPerDay) {
      spillsBeyondEndDate = true;
    }
  }

  if (spillsBeyondEndDate) {
    days[days.length - 1]!.warnings.push(
      "Schedule likely spills beyond the trip end date with the current max driving hours/day setting.",
    );
  }

  return { days, spillsBeyondEndDate };
}


