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
  onSelectDay?: (dayISO: string) => void;
  onLegClick?: (leg: DayItinerary["legs"][number]) => void;
  onDwellClick?: (leg: DayItinerary["legs"][number]) => void;
  onInsertBetween?: (dayISO: string, index: number) => void; // index in day.legs to insert before
  dayTripLabel?: string | null;
  locationLabel?: string | null;
};

export function DayCard({
  trip,
  day,
  onSelectDay,
  onLegClick,
  onDwellClick,
  onInsertBetween,
  dayTripLabel,
  locationLabel,
}: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelectDay?.(day.dayISO)}
      className="w-full text-left rounded-md border border-zinc-200 p-3 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{formatDateShort(day.dayISO)}</div>
          <div className="text-xs text-zinc-500">{day.dayISO}</div>
          {locationLabel ? <div className="mt-1 text-xs text-zinc-700">{locationLabel}</div> : null}
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

      {dayTripLabel ? (
        <div className="mt-3 rounded-md bg-zinc-50 p-2 border-l-4 border-zinc-900">
          <div className="text-sm font-medium">{dayTripLabel}</div>
          <div className="text-xs text-zinc-500">Preset day trip (you can change this in Day view).</div>
        </div>
      ) : null}

      {day.legs.length === 0 ? (
        <div className="mt-3">
          <div className="text-sm text-zinc-500">No driving scheduled.</div>
          <div
            className="mt-3 group rounded-md border border-dashed border-zinc-300 px-2 py-3 text-center text-sm text-zinc-500 hover:bg-zinc-100"
            onClick={(e) => {
              e.stopPropagation();
              onInsertBetween?.(day.dayISO, 0);
            }}
            role="button"
            tabIndex={0}
          >
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">＋ Add</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {day.legs.map((leg, idx) => {
            const from = trip.placesById[leg.fromPlaceId]?.name ?? "Unknown";
            const to = trip.placesById[leg.toPlaceId]?.name ?? "Unknown";
            const depart = new Date(leg.departAtISO);
            const arrive = new Date(leg.arriveAtISO);
            const color =
              leg.kind === "up"
                ? "border-l-4 border-emerald-500"
                : leg.kind === "home"
                  ? "border-l-4 border-orange-500"
                  : "border-l-4 border-zinc-900";
            const isDwell = leg.eventType === "dwell";
            return (
              <div key={`${leg.fromPlaceId}-${leg.toPlaceId}-${idx}`} className="flex flex-col gap-2">
                {idx > 0 ? (
                  <div
                    className="group rounded-md border border-dashed border-zinc-300 px-2 py-2 text-center text-sm text-zinc-500 hover:bg-zinc-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInsertBetween?.(day.dayISO, idx);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">＋</span>
                  </div>
                ) : null}

                <div
                  className={`rounded-md bg-zinc-50 p-2 ${color} cursor-pointer hover:bg-zinc-100`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isDwell) onDwellClick?.(leg);
                    else onLegClick?.(leg);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {isDwell ? leg.label ?? `Time at ${to}` : `${from} → ${to}`}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {isDwell ? (
                          leg.durationSec > 0 ? (
                            <>
                              {formatTimeShort(depart)} → {formatTimeShort(arrive)}
                            </>
                          ) : (
                            "Click to set time"
                          )
                        ) : (
                          <>
                            {formatTimeShort(depart)} → {formatTimeShort(arrive)} • {fmtDuration(leg.durationSec)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div
            className="group rounded-md border border-dashed border-zinc-300 px-2 py-2 text-center text-sm text-zinc-500 hover:bg-zinc-100"
            onClick={(e) => {
              e.stopPropagation();
              onInsertBetween?.(day.dayISO, day.legs.length);
            }}
            role="button"
            tabIndex={0}
          >
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">＋</span>
          </div>
        </div>
      )}
    </button>
  );
}


