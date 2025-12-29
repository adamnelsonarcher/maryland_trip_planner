"use client";

import type { DayItinerary, Trip } from "@/types/trip";
import { formatDateShort, formatTimeShort } from "@/lib/time";

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

type Props = {
  trip: Trip;
  day: DayItinerary;
};

export function DayCard({ trip, day }: Props) {
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{formatDateShort(day.dayISO)}</div>
          <div className="text-xs text-zinc-500">{day.dayISO}</div>
        </div>
        <div className="text-xs text-zinc-600">
          Drive: <span className="font-medium">{fmtDuration(day.totalDriveSec)}</span>
        </div>
      </div>

      {day.warnings.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
          {day.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {day.legs.length === 0 ? (
        <div className="mt-3 text-sm text-zinc-500">No driving scheduled.</div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {day.legs.map((leg, idx) => {
            const from = trip.placesById[leg.fromPlaceId]?.name ?? "Unknown";
            const to = trip.placesById[leg.toPlaceId]?.name ?? "Unknown";
            const depart = new Date(leg.departAtISO);
            const arrive = new Date(leg.arriveAtISO);
            return (
              <div key={`${leg.fromPlaceId}-${leg.toPlaceId}-${idx}`} className="rounded-md bg-zinc-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {from} → {to}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatTimeShort(depart)} → {formatTimeShort(arrive)} • {fmtDuration(leg.durationSec)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


