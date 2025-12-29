"use client";

import { useRef, useState } from "react";

import type { Place, Scenario, Trip } from "@/types/trip";
import { ScenarioSelector } from "@/components/ScenarioSelector";
import { StopsList } from "@/components/StopsList";
import { PlaceSearchBox } from "@/components/PlaceSearchBox";
import { formatDateShort } from "@/lib/time";
import { decodeTripJson, downloadTextFile, encodeTripExportV1, makeTripExportFilename } from "@/lib/tripJson";
import { normalizeTrip } from "@/lib/normalizeTrip";

type Props = {
  trip: Trip;
  scenario: Scenario;
  isMapsLoaded: boolean;
  mapsApiKeyPresent: boolean;
  directionsStatus: string;
  latestAllowedReturnDepartISO?: string | null;
  onSetActiveScenario: (id: string) => void;
  onUpdateScenario: (patch: Partial<Scenario>) => void;
  onUpdateTrip: (patch: Partial<Trip>) => void;
  onUpsertPlace: (place: Place) => void;
  onReplaceTrip: (trip: Trip) => void;
  onReset: () => void;
};

export function ControlsPane({
  trip,
  scenario,
  isMapsLoaded,
  mapsApiKeyPresent,
  directionsStatus,
  latestAllowedReturnDepartISO,
  onSetActiveScenario,
  onUpdateScenario,
  onUpdateTrip,
  onUpsertPlace,
  onReplaceTrip,
  onReset,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const dayTrips = Object.entries(scenario.dayOverridesByISO ?? {})
    .filter(([, o]) => Boolean(o.dayTrip))
    .map(([dayISO, o]) => ({ dayISO, preset: o.dayTrip!.preset }))
    .sort((a, b) => a.dayISO.localeCompare(b.dayISO));

  const nycDays = dayTrips.filter((d) => d.preset === "NYC").map((d) => formatDateShort(d.dayISO));
  const paDays = dayTrips.filter((d) => d.preset === "PA").map((d) => formatDateShort(d.dayISO));
  const customDays = dayTrips.filter((d) => d.preset === "CUSTOM").map((d) => formatDateShort(d.dayISO));

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
          <div className="text-sm font-semibold">Save / Load</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
              onClick={() => {
                setImportError(null);
                const text = encodeTripExportV1(trip);
                downloadTextFile({ filename: makeTripExportFilename(trip), text });
              }}
            >
              Download JSON
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
              onClick={() => {
                setImportError(null);
                fileRef.current?.click();
              }}
            >
              Load JSON
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              // Allow re-selecting the same file after a load.
              e.currentTarget.value = "";
              if (!f) return;
              try {
                const text = await f.text();
                const parsed = decodeTripJson(text);
                const normalized = normalizeTrip(parsed);
                onReplaceTrip(normalized);
                setImportError(null);
              } catch (err) {
                setImportError(err instanceof Error ? err.message : "Failed to load JSON.");
              }
            }}
          />
          {importError ? (
            <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-xs text-rose-900">
              {importError}
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-zinc-500">
              JSON includes all places, routes/stops, day overrides, day trips, and time blocks.
            </div>
          )}
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="text-sm font-semibold">Trip window</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Depart Colorado Bend (date)</span>
              <input
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                type="date"
                value={trip.startDateISO}
                onChange={(e) => onUpdateTrip({ startDateISO: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Depart Colorado Bend (time)</span>
              <input
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                type="time"
                value={trip.startTimeHHMM}
                onChange={(e) => onUpdateTrip({ startTimeHHMM: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">End date</span>
              <input
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                type="date"
                value={trip.endDateISO}
                onChange={(e) => onUpdateTrip({ endDateISO: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">End time</span>
              <input
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                type="time"
                value={trip.endTimeHHMM}
                onChange={(e) => onUpdateTrip({ endTimeHHMM: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs text-zinc-600">Depart for return to Houston</span>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                  type="date"
                  value={trip.returnDepartDateISO}
                  onChange={(e) => onUpdateTrip({ returnDepartDateISO: e.target.value })}
                />
                <input
                  className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                  type="time"
                  value={trip.returnDepartTimeHHMM}
                  onChange={(e) => onUpdateTrip({ returnDepartTimeHHMM: e.target.value })}
                />
              </div>
              {latestAllowedReturnDepartISO ? (
                <div className="mt-1 text-[11px] text-zinc-500">
                  Latest allowed (to still arrive by trip end):{" "}
                  <span className="font-medium">{latestAllowedReturnDepartISO.replace("T", " ").slice(0, 16)}</span>
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-zinc-500">Latest allowed will appear once drive-home times are computed.</div>
              )}
            </label>
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            Origin is fixed to Colorado Bend (base) with an alternate scenario that stops in Houston first.
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Route up stops (to Annapolis)</div>
            <div className="text-xs text-zinc-500">{scenario.intermediateStopPlaceIds.length}</div>
          </div>

          <div className="mt-2">
            <PlaceSearchBox
              isMapsLoaded={isMapsLoaded}
              placeholder="Add a stop on the route up…"
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

          <div className="mt-4 border-t border-zinc-200 pt-3">
            <div className="text-sm font-semibold">Recommended (route up)</div>
            <div className="mt-2 space-y-2">
              {[
                "Hot Springs National Park",
                "Nashville, TN",
                "Mammoth Cave National Park",
                "New River Gorge National Park",
                "Shenandoah National Park",
              ].map((name) => {
                const p = Object.values(trip.placesById).find((x) => x.name === name);
                const already = p ? scenario.intermediateStopPlaceIds.includes(p.id) : false;
                return (
                  <div key={name} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-2">
                    <div className="text-sm font-medium truncate">{name}</div>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
                      disabled={!p || already}
                      onClick={() => {
                        if (!p) return;
                        onUpdateScenario({
                          intermediateStopPlaceIds: [...scenario.intermediateStopPlaceIds, p.id],
                        });
                      }}
                    >
                      {already ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Annapolis → Lake House stops</div>
            <div className="text-xs text-zinc-500">{(scenario.postAnnapolisStopPlaceIds ?? []).length}</div>
          </div>
          <div className="mt-2">
            <PlaceSearchBox
              isMapsLoaded={isMapsLoaded}
              placeholder="Add a stop between Annapolis and the lake house…"
              onPlaceSelected={(place) => {
                onUpsertPlace(place);
                onUpdateScenario({
                  postAnnapolisStopPlaceIds: [...(scenario.postAnnapolisStopPlaceIds ?? []), place.id],
                });
              }}
            />
          </div>
          <div className="mt-3">
            <StopsList
              placesById={trip.placesById}
              stopPlaceIds={scenario.postAnnapolisStopPlaceIds ?? []}
              onChange={(ids) => onUpdateScenario({ postAnnapolisStopPlaceIds: ids })}
            />
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Drive home stops</div>
            <div className="text-xs text-zinc-500">{(scenario.returnStopPlaceIds ?? []).length}</div>
          </div>
          <div className="mt-2">
            <PlaceSearchBox
              isMapsLoaded={isMapsLoaded}
              placeholder="Add a stop on the drive home…"
              onPlaceSelected={(place) => {
                onUpsertPlace(place);
                onUpdateScenario({
                  returnStopPlaceIds: [...(scenario.returnStopPlaceIds ?? []), place.id],
                });
              }}
            />
          </div>
          <div className="mt-3">
            <StopsList
              placesById={trip.placesById}
              stopPlaceIds={scenario.returnStopPlaceIds ?? []}
              onChange={(ids) => onUpdateScenario({ returnStopPlaceIds: ids })}
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
          <div className="text-sm font-semibold">Day trips</div>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-2 py-2">
              <div className="text-sm font-medium">NYC</div>
              <div className="text-xs text-zinc-600 text-right">
                {nycDays.length > 0 ? nycDays.join(", ") : "not in trip"}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-2 py-2">
              <div className="text-sm font-medium">PA</div>
              <div className="text-xs text-zinc-600 text-right">
                {paDays.length > 0 ? paDays.join(", ") : "not in trip"}
              </div>
            </div>
            {customDays.length > 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-2 py-2">
                <div className="text-sm font-medium">Custom</div>
                <div className="text-xs text-zinc-600 text-right">{customDays.join(", ")}</div>
              </div>
            ) : null}
          </div>
          <div className="mt-2 text-xs text-zinc-500">Add/edit day trips from the Day view.</div>
        </div>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="text-sm font-semibold">Assumptions</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
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

        <div className="text-xs text-zinc-500">
          Directions status: <span className="font-medium">{directionsStatus}</span>
        </div>
      </div>
    </aside>
  );
}


