"use client";

import type { Trip } from "@/types/trip";

type Props = {
  trip: Trip;
  activeScenarioId: string;
  onChange: (scenarioId: string) => void;
};

export function ScenarioSelector({ trip, activeScenarioId, onChange }: Props) {
  const scenarios = Object.values(trip.scenariosById);
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


