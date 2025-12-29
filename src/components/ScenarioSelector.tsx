"use client";

import type { Trip } from "@/types/trip";

type Props = {
  trip: Trip;
  activeScenarioId: string;
  onChange: (scenarioId: string) => void;
};

export function ScenarioSelector({ trip, activeScenarioId, onChange }: Props) {
  const scenarios = Object.values(trip.scenariosById).sort((a, b) => {
    const pa = a.name.startsWith("Base Plan") ? 0 : 1;
    const pb = b.name.startsWith("Base Plan") ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="text-sm font-semibold">Scenario</div>
      <div className="mt-2">
        <select
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          value={activeScenarioId}
          onChange={(e) => onChange(e.target.value)}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}


