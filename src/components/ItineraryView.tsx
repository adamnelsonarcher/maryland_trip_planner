"use client";

import type { DayItinerary, Scenario, Trip } from "@/types/trip";
import { DayCard } from "@/components/DayCard";

type Props = {
  trip: Trip;
  scenario: Scenario;
  itinerary: DayItinerary[];
};

export function ItineraryView({ trip, scenario, itinerary }: Props) {
  const totalDriveSec = itinerary.reduce((sum, d) => sum + d.totalDriveSec, 0);
  const totalHours = totalDriveSec / 3600;

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

        <div className="mt-4 flex flex-col gap-3">
          {itinerary.map((day) => (
            <DayCard key={day.dayISO} trip={trip} day={day} />
          ))}
        </div>
      </div>
    </aside>
  );
}


