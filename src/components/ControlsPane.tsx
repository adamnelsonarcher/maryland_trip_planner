"use client";

import type { Place, Scenario, Trip } from "@/types/trip";
import { ScenarioSelector } from "@/components/ScenarioSelector";
import { StopsList } from "@/components/StopsList";
import { PlaceSearchBox } from "@/components/PlaceSearchBox";
import { addDays, diffDaysInclusive } from "@/lib/time";

type Props = {
  trip: Trip;
  scenario: Scenario;
  isMapsLoaded: boolean;
  mapsApiKeyPresent: boolean;
  directionsStatus: string;
  shareUrl: string;
  onSetActiveScenario: (id: string) => void;
  onUpdateScenario: (patch: Partial<Scenario>) => void;
  onUpsertPlace: (place: Place) => void;
  onReset: () => void;
};

export function ControlsPane({
  trip,
  scenario,
  isMapsLoaded,
  mapsApiKeyPresent,
  directionsStatus,
  shareUrl,
  onSetActiveScenario,
  onUpdateScenario,
  onUpsertPlace,
  onReset,
}: Props) {
  const originOptions = Object.values(trip.placesById).filter((p) => p.name.includes("Houston") || p.name.includes("Colorado Bend"));
  const dayCount = diffDaysInclusive(trip.startDateISO, trip.endDateISO);
  const dayOptions = Array.from({ length: dayCount }, (_, i) => addDays(trip.startDateISO, i));

  return (
    <aside className="border-r border-zinc-200 bg-white h-full overflow-y-auto">
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-zinc-500">Trip</div>
            <div className="text-lg font-semibold truncate">{trip.title}</div>
            <div className="text-xs text-zinc-500">
              Window: <span className="font-medium">{trip.startDateISO}</span> →{" "}
              <span className="font-medium">{trip.endDateISO}</span>
            </div>
          </div>
          <button
            className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50"
            onClick={onReset}
            title="Reset to defaults (clears local changes)"
          >
            Reset
          </button>
        </div>

        {!mapsApiKeyPresent && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Google Maps API key missing</div>
            <div className="mt-1 text-xs text-amber-900/80">
              Set <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> in your environment, then restart{" "}
              <span className="font-mono">npm run dev</span>.
              <div className="mt-2 text-[11px] text-amber-900/70">
                Tip: copy <span className="font-mono">env.example</span> to <span className="font-mono">.env.local</span>.
              </div>
            </div>
          </div>
        )}

        <ScenarioSelector trip={trip} activeScenarioId={scenario.id} onChange={onSetActiveScenario} />

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="text-sm font-semibold">Origin</div>
          <div className="mt-2">
            <select
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={scenario.selectedOriginPlaceId}
              onChange={(e) => onUpdateScenario({ selectedOriginPlaceId: e.target.value })}
            >
              {originOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Intermediate stops</div>
            <div className="text-xs text-zinc-500">{scenario.intermediateStopPlaceIds.length}</div>
          </div>

          <div className="mt-2">
            <PlaceSearchBox
              isMapsLoaded={isMapsLoaded}
              placeholder="Add a stop (Google Places)…"
              onPlaceSelected={(place) => {
                onUpsertPlace(place);
                onUpdateScenario({
                  intermediateStopPlaceIds: [...scenario.intermediateStopPlaceIds, place.id],
                });
              }}
            />
          </div>

          <div className="mt-3">
            <StopsList
              placesById={trip.placesById}
              stopPlaceIds={scenario.intermediateStopPlaceIds}
              onChange={(ids) => onUpdateScenario({ intermediateStopPlaceIds: ids })}
            />
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="text-sm font-semibold">Anchors</div>
          <div className="mt-2 space-y-1 text-sm text-zinc-700">
            {scenario.anchorPlaceIds.map((id) => (
              <div key={id} className="truncate">
                • {trip.placesById[id]?.name ?? "Unknown place"}
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            v1 uses a fixed anchor order. Later we’ll support editing anchors and per-day lodging.
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="text-sm font-semibold">Optional day trips (phase 5)</div>
          <div className="mt-2 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(scenario.includeNYCDayTrip)}
                  onChange={(e) => onUpdateScenario({ includeNYCDayTrip: e.target.checked })}
                />
                NYC day trip
              </label>
              <select
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm disabled:bg-zinc-50"
                disabled={!scenario.includeNYCDayTrip}
                value={scenario.nycDayISO ?? trip.startDateISO}
                onChange={(e) => onUpdateScenario({ nycDayISO: e.target.value })}
              >
                {dayOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(scenario.includePADayTrip)}
                  onChange={(e) => onUpdateScenario({ includePADayTrip: e.target.checked })}
                />
                PA day trip
              </label>
              <select
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm disabled:bg-zinc-50"
                disabled={!scenario.includePADayTrip}
                value={scenario.paDayISO ?? trip.startDateISO}
                onChange={(e) => onUpdateScenario({ paDayISO: e.target.value })}
              >
                {dayOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-zinc-500">
              These toggles are saved/shared, but v1 scheduling does not insert day-trip loops yet.
            </div>
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="text-sm font-semibold">Assumptions</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Daily start</span>
              <input
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                type="time"
                value={scenario.settings.dailyStartTime}
                onChange={(e) =>
                  onUpdateScenario({
                    settings: { ...scenario.settings, dailyStartTime: e.target.value },
                  })
                }
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Max drive hrs/day</span>
              <input
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                type="number"
                min={0}
                step={0.5}
                value={scenario.settings.maxDrivingHoursPerDay}
                onChange={(e) =>
                  onUpdateScenario({
                    settings: {
                      ...scenario.settings,
                      maxDrivingHoursPerDay: Number(e.target.value),
                    },
                  })
                }
              />
            </label>

            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs text-zinc-600">Buffer minutes/stop</span>
              <input
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                type="number"
                min={0}
                step={5}
                value={scenario.settings.bufferMinutesPerStop}
                onChange={(e) =>
                  onUpdateScenario({
                    settings: {
                      ...scenario.settings,
                      bufferMinutesPerStop: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="text-sm font-semibold">Share</div>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:bg-zinc-300"
              disabled={!shareUrl}
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
              }}
              title="Copy a link encoding the current trip state"
            >
              Copy share link
            </button>
            <a
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
              href={shareUrl || "#"}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (!shareUrl) e.preventDefault();
              }}
            >
              Open link
            </a>
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            State is saved locally and can also be shared via a compressed URL param.
          </div>
        </div>

        <div className="text-xs text-zinc-500">
          Directions status: <span className="font-medium">{directionsStatus}</span>
        </div>
      </div>
    </aside>
  );
}


