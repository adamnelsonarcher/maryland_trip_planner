"use client";

import { useMemo, useState } from "react";

import type { DayItinerary, DayTripPreset, DwellBlock, PresetDayTrip, Scenario, Trip } from "@/types/trip";
import { DayCard } from "@/components/DayCard";
import type { DayOverrideMode } from "@/types/trip";
import { formatDateShort } from "@/lib/time";
import { computeBasePlaceByDay } from "@/lib/baseByDay";
import { nanoid } from "nanoid";
import { PlaceSearchBox } from "@/components/PlaceSearchBox";
import type { Place, ScheduledLeg } from "@/types/trip";
import { EditMinutesModal } from "@/components/EditMinutesModal";
import { AddEventModal } from "@/components/AddEventModal";

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
  isMapsLoaded: boolean;
  onUpsertPlace: (place: Place) => void;
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
  isMapsLoaded,
  onUpsertPlace,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editMinutes, setEditMinutes] = useState(0);
  const [editTarget, setEditTarget] = useState<
    | { type: "dayTrip"; dayISO: string }
    | { type: "dwellBlock"; dayISO: string; blockId: string }
    | null
  >(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addDayISO, setAddDayISO] = useState<string | null>(null);
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

  const dayTripPreset: "" | DayTripPreset = override?.dayTrip?.preset ?? "";
  const dayTripStart = override?.dayTrip?.startPlaceId ?? "";
  const dayTripEnd = override?.dayTrip?.endPlaceId ?? "";
  const dayTripDest = override?.dayTrip?.destinationPlaceId ?? "";
  const dwellMinutes = override?.dayTrip?.dwellMinutes ?? 120;
  const dwellBlocks: DwellBlock[] = override?.dwellBlocks ?? [];

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

  const openEditForDwell = (dayISO: string, leg: ScheduledLeg) => {
    if (leg.dwellSource?.type === "dayTrip") {
      setEditTarget({ type: "dayTrip", dayISO });
      setEditTitle(leg.label ?? "Time spent");
      setEditMinutes(Math.round((leg.durationSec ?? 0) / 60));
      setEditOpen(true);
      return;
    }
    if (leg.dwellSource?.type === "dwellBlock") {
      setEditTarget({ type: "dwellBlock", dayISO, blockId: leg.dwellSource.blockId });
      setEditTitle(leg.label ?? "Time spent");
      setEditMinutes(Math.round((leg.durationSec ?? 0) / 60));
      setEditOpen(true);
      return;
    }
    if (leg.dwellSource?.type === "implicitArrival") {
      const placeId = leg.toPlaceId;
      const name = trip.placesById[placeId]?.name ?? "stop";
      const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
      const existing = nextOverrides[dayISO] ?? { mode: "auto" as const, dwellBlocks: [] as DwellBlock[] };
      const block: DwellBlock = { id: nanoid(), placeId, minutes: 120, label: `Time at ${name}` };
      nextOverrides[dayISO] = { ...existing, dwellBlocks: [...(existing.dwellBlocks ?? []), block] };
      onUpdateScenario({ dayOverridesByISO: nextOverrides });

      setEditTarget({ type: "dwellBlock", dayISO, blockId: block.id });
      setEditTitle(block.label ?? "Time spent");
      setEditMinutes(block.minutes);
      setEditOpen(true);
      return;
    }
  };

  const openAddAtDay = (dayISO: string) => {
    setAddDayISO(dayISO);
    setAddOpen(true);
  };

  const addBaseName = addDayISO ? trip.placesById[baseByDay[addDayISO] ?? ""]?.name ?? null : null;

  return (
    <>
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
                    const v = e.target.value as "" | DayTripPreset;
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
                          destinationPlaceId: existing.dayTrip?.destinationPlaceId,
                        },
                      };
                    }
                    onUpdateScenario({ dayOverridesByISO: nextOverrides });
                  }}
                >
                  <option value="">None</option>
                  <option value="NYC">NYC day trip</option>
                  <option value="PA">PA day trip</option>
                  <option value="CUSTOM">Custom drive</option>
                </select>
              </label>

              {dayTripPreset ? (
                <>
                  {dayTripPreset === "CUSTOM" ? (
                    <div className="col-span-2">
                      <div className="text-xs text-zinc-600 mb-1">Destination</div>
                      <PlaceSearchBox
                        isMapsLoaded={isMapsLoaded}
                        placeholder="Pick a destination…"
                        onPlaceSelected={(place) => {
                          onUpsertPlace(place);
                          const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                          const existing = nextOverrides[selectedDayISO] ?? { mode: "auto" as const };
                          const dt = existing.dayTrip ?? { preset: "CUSTOM" as const, dwellMinutes };
                          nextOverrides[selectedDayISO] = {
                            ...existing,
                            dayTrip: { ...dt, preset: "CUSTOM", destinationPlaceId: place.id },
                          };
                          onUpdateScenario({ dayOverridesByISO: nextOverrides });
                        }}
                      />
                      <div className="mt-1 text-[11px] text-zinc-500">
                        Selected: {dayTripDest ? trip.placesById[dayTripDest]?.name : "None"}
                      </div>
                    </div>
                  ) : null}

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

                  <div className="col-span-2 border-t border-zinc-200 pt-3">
                    <div className="text-sm font-semibold">Time blocks (no driving)</div>
                    <div className="mt-2 flex flex-col gap-2">
                      {dwellBlocks.length === 0 ? (
                        <div className="text-sm text-zinc-500">None yet. Add one below.</div>
                      ) : (
                        dwellBlocks.map((b) => (
                          <div key={b.id} className="flex items-center gap-2 rounded-md border border-zinc-200 p-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">
                                {b.label ?? trip.placesById[b.placeId]?.name ?? "Time block"}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {trip.placesById[b.placeId]?.name ?? b.placeId}
                              </div>
                            </div>
                            <input
                              className="w-24 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                              type="number"
                              min={0}
                              step={15}
                              value={b.minutes}
                              onChange={(e) => {
                                const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                                const existing = nextOverrides[selectedDayISO] ?? { mode: "auto" as const };
                                const nextBlocks = (existing.dwellBlocks ?? []).map((x) =>
                                  x.id === b.id ? { ...x, minutes: Number(e.target.value || 0) } : x,
                                );
                                nextOverrides[selectedDayISO] = { ...existing, dwellBlocks: nextBlocks };
                                onUpdateScenario({ dayOverridesByISO: nextOverrides });
                              }}
                            />
                            <button
                              className="rounded-md border border-zinc-200 px-2 py-1 text-sm hover:bg-zinc-50"
                              onClick={() => {
                                const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                                const existing = nextOverrides[selectedDayISO] ?? { mode: "auto" as const };
                                const nextBlocks = (existing.dwellBlocks ?? []).filter((x) => x.id !== b.id);
                                nextOverrides[selectedDayISO] = { ...existing, dwellBlocks: nextBlocks };
                                onUpdateScenario({ dayOverridesByISO: nextOverrides });
                              }}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}

                      <button
                        type="button"
                        className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
                        onClick={() => {
                          const baseId = inferredStartPlaceId;
                          if (!baseId) return;
                          const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                          const existing = nextOverrides[selectedDayISO] ?? { mode: "auto" as const };
                          const nextBlocks: DwellBlock[] = [
                            ...(existing.dwellBlocks ?? []),
                            { id: nanoid(), placeId: baseId, minutes: 120, label: "Time spent" },
                          ];
                          nextOverrides[selectedDayISO] = { ...existing, dwellBlocks: nextBlocks };
                          onUpdateScenario({ dayOverridesByISO: nextOverrides });
                        }}
                      >
                        Add time spent (at current location)
                      </button>
                    </div>
                  </div>
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
                  locationLabel={
                    day.totalDriveSec > 0
                      ? "Driving day"
                      : `At ${trip.placesById[baseByDay[day.dayISO] ?? ""]?.name ?? "Unknown"}`
                  }
                  onSelectDay={(d) => {
                    onChangeSelectedDayISO(d);
                    onChangeView("day");
                  }}
                  onLegClick={onLegClick}
                  onDwellClick={(leg) => openEditForDwell(day.dayISO, leg as ScheduledLeg)}
                  onInsertBetween={(dayISO, idx) => {
                    const prev = day.legs[idx - 1];
                    const next = day.legs[idx];
                    const drive = [prev, next].find((l) => l && l.eventType !== "dwell");
                    if (drive) {
                      onLegClick?.(drive);
                      return;
                    }
                    openAddAtDay(dayISO);
                  }}
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
              locationLabel={
                selectedDay.totalDriveSec > 0
                  ? "Driving day"
                  : `At ${trip.placesById[baseByDay[selectedDay.dayISO] ?? ""]?.name ?? "Unknown"}`
              }
              onSelectDay={(d) => {
                onChangeSelectedDayISO(d);
                onChangeView("day");
              }}
              onLegClick={onLegClick}
              onDwellClick={(leg) => openEditForDwell(selectedDayISO, leg as ScheduledLeg)}
              onInsertBetween={(dayISO, idx) => {
                const prev = selectedDay.legs[idx - 1];
                const next = selectedDay.legs[idx];
                const drive = [prev, next].find((l) => l && l.eventType !== "dwell");
                if (drive) {
                  onLegClick?.(drive);
                  return;
                }
                openAddAtDay(dayISO);
              }}
            />
          ) : null}
        </div>
        </div>
      </aside>

      <EditMinutesModal
        open={editOpen}
        title={editTitle}
        minutes={editMinutes}
        onClose={() => setEditOpen(false)}
        onSave={(m) => {
          if (!editTarget) return;
          const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
          const existing = nextOverrides[editTarget.dayISO] ?? { mode: "auto" as const, dwellBlocks: [] as DwellBlock[] };

          if (editTarget.type === "dayTrip") {
            if (!existing.dayTrip) return;
            nextOverrides[editTarget.dayISO] = {
              ...existing,
              dayTrip: { ...existing.dayTrip, dwellMinutes: Math.max(0, m) },
            };
          } else {
            const blocks = (existing.dwellBlocks ?? []).map((b) =>
              b.id === editTarget.blockId ? { ...b, minutes: Math.max(0, m) } : b,
            );
            nextOverrides[editTarget.dayISO] = { ...existing, dwellBlocks: blocks };
          }

          onUpdateScenario({ dayOverridesByISO: nextOverrides });
        }}
        onDelete={
          editTarget
            ? () => {
                const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
                const existing =
                  nextOverrides[editTarget.dayISO] ??
                  ({ mode: "auto" as const, dwellBlocks: [] as DwellBlock[] });

                if (editTarget.type === "dayTrip") {
                  const { dayTrip: _dt, ...rest } = existing;
                  void _dt;
                  nextOverrides[editTarget.dayISO] = rest;
                } else {
                  const blocks = (existing.dwellBlocks ?? []).filter((b) => b.id !== editTarget.blockId);
                  nextOverrides[editTarget.dayISO] = { ...existing, dwellBlocks: blocks };
                }
                onUpdateScenario({ dayOverridesByISO: nextOverrides });
              }
            : undefined
        }
      />

      <AddEventModal
        open={addOpen}
        isMapsLoaded={isMapsLoaded}
        dayISO={addDayISO}
        basePlaceName={addBaseName}
        onClose={() => setAddOpen(false)}
        onAddDrive={() => {
          if (!addDayISO) return;
          onChangeSelectedDayISO(addDayISO);
          onChangeView("day");
          const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
          const existing = nextOverrides[addDayISO] ?? { mode: "auto" as const, dwellBlocks: [] as DwellBlock[] };
          nextOverrides[addDayISO] = {
            ...existing,
            dayTrip: existing.dayTrip ?? { preset: "CUSTOM" as const, dwellMinutes: 120 },
          };
          onUpdateScenario({ dayOverridesByISO: nextOverrides });
        }}
        onAddTimeAtBase={(template) => {
          if (!addDayISO) return;
          const baseId = baseByDay[addDayISO];
          if (!baseId) return;
          const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
          const existing = nextOverrides[addDayISO] ?? { mode: "auto" as const, dwellBlocks: [] as DwellBlock[] };
          const block: DwellBlock = { ...template, placeId: baseId };
          nextOverrides[addDayISO] = { ...existing, dwellBlocks: [...(existing.dwellBlocks ?? []), block] };
          onUpdateScenario({ dayOverridesByISO: nextOverrides });
        }}
        onAddTimeAtPlace={(place, minutes) => {
          if (!addDayISO) return;
          onUpsertPlace(place);
          const nextOverrides = { ...(scenario.dayOverridesByISO ?? {}) };
          const existing = nextOverrides[addDayISO] ?? { mode: "auto" as const, dwellBlocks: [] as DwellBlock[] };
          const block: DwellBlock = { id: nanoid(), placeId: place.id, minutes, label: `Time at ${place.name}` };
          nextOverrides[addDayISO] = { ...existing, dwellBlocks: [...(existing.dwellBlocks ?? []), block] };
          onUpdateScenario({ dayOverridesByISO: nextOverrides });
        }}
      />
    </>
  );
}



