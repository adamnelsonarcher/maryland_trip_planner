"use client";

import { useMemo } from "react";

import type { DayItinerary, Scenario, Trip } from "@/types/trip";
import { DayCard } from "@/components/DayCard";
import type { DayOverrideMode } from "@/types/trip";
import { formatDateShort } from "@/lib/time";

type Props = {
  trip: Trip;
  scenario: Scenario;
  itinerary: DayItinerary[];
  onUpdateScenario: (patch: Partial<Scenario>) => void;
  view: "overview" | "day";
  selectedDayISO: string;
  onChangeView: (view: "overview" | "day") => void;
  onChangeSelectedDayISO: (dayISO: string) => void;
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
}: Props) {
  const selectedDay = useMemo(
    () => itinerary.find((d) => d.dayISO === selectedDayISO) ?? itinerary[0],
    [itinerary, selectedDayISO],
  );

  const totalDriveSec = itinerary.reduce((sum, d) => sum + d.totalDriveSec, 0);
  const totalHours = totalDriveSec / 3600;

  const override = (scenario.dayOverridesByISO ?? {})[selectedDayISO];
  const mode: DayOverrideMode = override?.mode ?? "auto";

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
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {view === "overview" ? (
            itinerary.map((day) => <DayCard key={day.dayISO} trip={trip} day={day} />)
          ) : selectedDay ? (
            <DayCard key={selectedDay.dayISO} trip={trip} day={selectedDay} />
          ) : null}
        </div>
      </div>
    </aside>
  );
}


