"use client";

import { useMemo } from "react";

import type { DayItinerary, PresetDayTrip, Scenario, Trip } from "@/types/trip";
import { DayCard } from "@/components/DayCard";
import type { DayOverrideMode } from "@/types/trip";
import { formatDateShort } from "@/lib/time";
import { computeBasePlaceByDay } from "@/lib/baseByDay";

type Props = {
  trip: Trip;
  scenario: Scenario;
  itinerary: DayItinerary[];
  onUpdateScenario: (patch: Partial<Scenario>) => void;
  view: "overview" | "day";
  selectedDayISO: string;
  onChangeView: (view: "overview" | "day") => void;
  onChangeSelectedDayISO: (dayISO: string) => void;
  onLegClick?: (leg: DayItinerary["legs"][number]) => void;
};

export function ItineraryView({
  trip,
  scenario,
  itinerary,
  onUpdateScenario,
  view,
  selectedDayISO,
  onChangeView,
  onChangeSelectedDayISO,
  onLegClick,
}: Props) {
  const selectedDay = useMemo(
    () => itinerary.find((d) => d.dayISO === selectedDayISO) ?? itinerary[0],
    [itinerary, selectedDayISO],
  );

  const totalDriveSec = itinerary.reduce((sum, d) => sum + d.totalDriveSec, 0);
  const totalHours = totalDriveSec / 3600;

  const override = (scenario.dayOverridesByISO ?? {})[selectedDayISO];
  const mode: DayOverrideMode = override?.mode ?? "auto";
  const baseByDay = useMemo(() => computeBasePlaceByDay(itinerary, scenario), [itinerary, scenario]);
  const inferredStartPlaceId = baseByDay[selectedDayISO];

  const dayTripPreset: "" | PresetDayTrip = override?.dayTrip?.preset ?? "";
  const dayTripStart = override?.dayTrip?.startPlaceId ?? "";
  const dayTripEnd = override?.dayTrip?.endPlaceId ?? "";
  const dwellMinutes = override?.dayTrip?.dwellMinutes ?? 120;

  const tripPlaceOptions = useMemo(() => {
    const places = Object.values(trip.placesById);
    const picks = places.filter((p) => {
      const name = p.name.toLowerCase();
      return (
        p.tags?.includes("anchor") ||
        p.tags?.includes("lodging") ||
        name.includes("houston") ||
        name.includes("colorado bend") ||
        name.includes("annapolis") ||
        name.includes("lake house")
      );
    });
    // Dedup by id and sort by name
    const uniq = new Map(picks.map((p) => [p.id, p]));
    return Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [trip.placesById]);

  return (
    <aside className="border-l border-zinc-200 bg-white h-full overflow-y-auto">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-zinc-500">Itinerary</div>
            <div className="text-base font-semibold">{scenario.name}</div>
            <div className="mt-1 text-xs text-zinc-500">
              Total drive time: <span className="font-medium">{totalHours.toFixed(1)} hrs</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-zinc-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-md border border-zinc-200 bg-white">
              <button
                className={`px-3 py-1.5 text-sm ${view === "overview" ? "bg-zinc-900 text-white" : "hover:bg-zinc-50"}`}
                onClick={() => onChangeView("overview")}
              >
                Overview
              </button>
              <button
                className={`px-3 py-1.5 text-sm ${view === "day" ? "bg-zinc-900 text-white" : "hover:bg-zinc-50"}`}
                onClick={() => onChangeView("day")}
              >
                Day
              </button>
            </div>

            <select
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
              value={selectedDayISO}
              onChange={(e) => onChangeSelectedDayISO(e.target.value)}
            >
              {itinerary.map((d) => (
                <option key={d.dayISO} value={d.dayISO}>
                  {formatDateShort(d.dayISO)}
                </option>
              ))}
            </select>
          </div>

          {view === "day" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Day mode</span>
                <select
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                  value={mode}
                  onChange={(e) => {
                    const nextMode = e.target.value as DayOverrideMode;
                    const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                    nextOverrides[selectedDayISO] = { ...(nextOverrides[selectedDayISO] ?? {}), mode: nextMode };
                    onUpdateScenario({ dayOverridesByISO: nextOverrides });
                  }}
                >
                  <option value="auto">Auto (travel allowed)</option>
                  <option value="rest">Rest / Explore (no driving)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Notes</span>
                <input
                  className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                  value={override?.notes ?? ""}
                  placeholder="e.g. Explore Annapolis"
                  onChange={(e) => {
                    const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                    nextOverrides[selectedDayISO] = { ...(nextOverrides[selectedDayISO] ?? {}), notes: e.target.value };
                    onUpdateScenario({ dayOverridesByISO: nextOverrides });
                  }}
                />
              </label>

              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-xs text-zinc-600">Day trip preset</span>
                <select
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                  value={dayTripPreset}
                  onChange={(e) => {
                    const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                    const v = e.target.value as "" | PresetDayTrip;
                    const existing = nextOverrides[selectedDayISO] ?? { mode: "auto" as const };
                    if (!v) {
                      const { dayTrip: _discard, ...rest } = existing;
                      void _discard;
                      nextOverrides[selectedDayISO] = rest;
                    } else {
                      nextOverrides[selectedDayISO] = {
                        ...existing,
                        dayTrip: {
                          preset: v,
                          dwellMinutes: existing.dayTrip?.dwellMinutes ?? 120,
                          startPlaceId: existing.dayTrip?.startPlaceId,
                          endPlaceId: existing.dayTrip?.endPlaceId,
                        },
                      };
                    }
                    onUpdateScenario({ dayOverridesByISO: nextOverrides });
                  }}
                >
                  <option value="">None</option>
                  <option value="NYC">NYC day trip</option>
                  <option value="PA">PA day trip</option>
                </select>
              </label>

              {dayTripPreset ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-600">Start</span>
                    <select
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                      value={dayTripStart}
                      onChange={(e) => {
                        const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                        const existing = nextOverrides[selectedDayISO] ?? { mode: "auto" as const };
                        const dt = existing.dayTrip ?? { preset: dayTripPreset as PresetDayTrip, dwellMinutes };
                        const v = e.target.value;
                        nextOverrides[selectedDayISO] = {
                          ...existing,
                          dayTrip: { ...dt, startPlaceId: v || undefined },
                        };
                        onUpdateScenario({ dayOverridesByISO: nextOverrides });
                      }}
                    >
                      <option value="">Auto (where we are)</option>
                      {tripPlaceOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-zinc-500">
                      Auto uses: {inferredStartPlaceId ? trip.placesById[inferredStartPlaceId]?.name : "Unknown"}
                    </div>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-600">End</span>
                    <select
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                      value={dayTripEnd}
                      onChange={(e) => {
                        const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                        const existing = nextOverrides[selectedDayISO] ?? { mode: "auto" as const };
                        const dt = existing.dayTrip ?? { preset: dayTripPreset as PresetDayTrip, dwellMinutes };
                        const v = e.target.value;
                        nextOverrides[selectedDayISO] = {
                          ...existing,
                          dayTrip: { ...dt, endPlaceId: v || undefined },
                        };
                        onUpdateScenario({ dayOverridesByISO: nextOverrides });
                      }}
                    >
                      <option value="">Back to start</option>
                      {tripPlaceOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 col-span-2">
                    <span className="text-xs text-zinc-600">Time spent there (minutes)</span>
                    <input
                      className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      type="number"
                      min={0}
                      step={15}
                      value={dwellMinutes}
                      onChange={(e) => {
                        const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                        const existing = nextOverrides[selectedDayISO] ?? { mode: "auto" as const };
                        const dt = existing.dayTrip ?? { preset: dayTripPreset as PresetDayTrip, dwellMinutes: 120 };
                        nextOverrides[selectedDayISO] = {
                          ...existing,
                          dayTrip: { ...dt, dwellMinutes: Number(e.target.value || 0) },
                        };
                        onUpdateScenario({ dayOverridesByISO: nextOverrides });
                      }}
                    />
                  </label>
                </>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {view === "overview" ? (
            itinerary.map((day) => {
              const o = (scenario.dayOverridesByISO ?? {})[day.dayISO];
              const label =
                o?.dayTrip?.preset === "NYC"
                  ? "NYC day trip"
                  : o?.dayTrip?.preset === "PA"
                    ? "PA day trip"
                    : null;
              return (
                <DayCard
                  key={day.dayISO}
                  trip={trip}
                  day={day}
                  dayTripLabel={label}
                  onSelectDay={(d) => {
                    onChangeSelectedDayISO(d);
                    onChangeView("day");
                  }}
                  onLegClick={onLegClick}
                />
              );
            })
          ) : selectedDay ? (
            <DayCard
              key={selectedDay.dayISO}
              trip={trip}
              day={selectedDay}
              dayTripLabel={
                override?.dayTrip?.preset === "NYC"
                  ? "NYC day trip"
                  : override?.dayTrip?.preset === "PA"
                    ? "PA day trip"
                    : null
              }
              onSelectDay={(d) => {
                onChangeSelectedDayISO(d);
                onChangeView("day");
              }}
              onLegClick={onLegClick}
            />
          ) : null}
        </div>
      </div>
    </aside>
  );
}


