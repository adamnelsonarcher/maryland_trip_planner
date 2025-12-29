"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

import { makeDefaultTrip } from "@/lib/defaultTrip";
import { decodeShareStateV1 } from "@/lib/share";
import { clearTripLocalStorage, loadTripFromLocalStorage, saveTripToLocalStorage } from "@/lib/storage";
import { computeItinerary } from "@/lib/scheduler";
import { normalizeDirectionsResponse } from "@/lib/directions";
import { normalizeTrip } from "@/lib/normalizeTrip";
import { computeBasePlaceByDay } from "@/lib/baseByDay";
import { makeLocalDateTime } from "@/lib/time";
import type { NormalizedDirectionsLeg, Place, Scenario, ScheduledLeg, Trip } from "@/types/trip";
import { ControlsPane } from "@/components/ControlsPane";
import { MapView } from "@/components/MapView";
import { ItineraryView } from "@/components/ItineraryView";
import { AddStopModal } from "@/components/AddStopModal";

const LIBRARIES: ("places")[] = ["places"];

type SegmentKind = "up" | "home" | "other";

type SegmentSpec = { ids: string[]; kind: SegmentKind };

type DirectionsState =
  | { status: "idle" }
  | { status: "missing_api_key" }
  | { status: "loading" }
  | {
      status: "ready";
      responses: google.maps.DirectionsResult[];
      kinds: SegmentKind[];
      legs: (NormalizedDirectionsLeg & { kind?: SegmentKind })[];
    }
  | { status: "error"; message: string };

function toLocalInputDateTime(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function findPresetPlaceId(trip: Trip, preset: "NYC" | "PA"): string | undefined {
  if (preset === "NYC") {
    return Object.values(trip.placesById).find((p) => p.name.toLowerCase().includes("new york"))?.id;
  }
  if (preset === "PA") {
    return Object.values(trip.placesById).find((p) => p.name.toLowerCase().includes("pa friends"))?.id;
  }
  return undefined;
}

function getActiveScenario(trip: Trip): Scenario {
  const s = trip.scenariosById[trip.activeScenarioId];
  if (s) return s;
  const first = Object.values(trip.scenariosById)[0];
  if (!first) throw new Error("Trip has no scenarios");
  return first;
}

function buildPlaceOrder(trip: Trip, scenario: Scenario) {
  // Marker order (deduped) for map view.
  const actualStart = scenario.actualStartPlaceId ?? scenario.selectedOriginPlaceId;
  const routeOrigin = scenario.selectedOriginPlaceId;
  const returnTo =
    scenario.returnToPlaceId ??
    Object.values(trip.placesById).find((p) => p.name.includes("Houston"))?.id ??
    routeOrigin;

  const all = [
    actualStart,
    routeOrigin,
    ...scenario.intermediateStopPlaceIds,
    ...scenario.anchorPlaceIds,
    returnTo,
  ].filter((id) => Boolean(id) && Boolean(trip.placesById[id]));

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of all) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return deduped;
}

function buildSegmentSpecs(trip: Trip, scenario: Scenario): SegmentSpec[] {
  const actualStart = scenario.actualStartPlaceId ?? scenario.selectedOriginPlaceId;
  const routeOrigin = scenario.selectedOriginPlaceId;
  const returnTo =
    scenario.returnToPlaceId ??
    Object.values(trip.placesById).find((p) => p.name.includes("Houston"))?.id ??
    routeOrigin;

  const specs: SegmentSpec[] = [];

  if (actualStart && routeOrigin && actualStart !== routeOrigin) {
    specs.push({ ids: [actualStart, routeOrigin], kind: "up" });
  }

  const anchors = scenario.anchorPlaceIds.filter((id) => id !== routeOrigin && id !== returnTo);
  const annapolisId = anchors[0];
  const lakeHouseId = anchors.length > 1 ? anchors[anchors.length - 1] : undefined;

  // Main drive up (green): routeOrigin -> ...intermediates... -> Annapolis
  if (annapolisId && routeOrigin && annapolisId !== routeOrigin) {
    const outboundWaypoints = [...scenario.intermediateStopPlaceIds].filter(
      (id) => id !== routeOrigin && id !== annapolisId && Boolean(trip.placesById[id]),
    );
    specs.push({ ids: [routeOrigin, ...outboundWaypoints, annapolisId], kind: "up" });
  }

  // Separate event (black): Annapolis -> Lake House
  if (annapolisId && lakeHouseId && annapolisId !== lakeHouseId) {
    const betweenStops = (scenario.postAnnapolisStopPlaceIds ?? []).filter(
      (id) => id !== annapolisId && id !== lakeHouseId && Boolean(trip.placesById[id]),
    );
    specs.push({ ids: [annapolisId, ...betweenStops, lakeHouseId], kind: "other" });
  }

  // Return home (orange): Lake House -> returnTo (Houston)
  if (lakeHouseId && returnTo && lakeHouseId !== returnTo) {
    const returnStops = (scenario.returnStopPlaceIds ?? []).filter(
      (id) => id !== lakeHouseId && id !== returnTo && Boolean(trip.placesById[id]),
    );
    specs.push({ ids: [lakeHouseId, ...returnStops, returnTo], kind: "home" });
  }

  // Filter out any invalid ids.
  return specs
    .map((s) => ({ ...s, ids: s.ids.filter((id) => Boolean(trip.placesById[id])) }))
    .filter((s) => s.ids.length >= 2);
}

function updateScenario(trip: Trip, scenarioId: string, patch: Partial<Scenario>): Trip {
  return {
    ...trip,
    scenariosById: {
      ...trip.scenariosById,
      [scenarioId]: { ...trip.scenariosById[scenarioId]!, ...patch },
    },
  };
}

function upsertPlace(trip: Trip, place: Place): Trip {
  return { ...trip, placesById: { ...trip.placesById, [place.id]: place } };
}

export function TripDashboard() {
  // IMPORTANT: initialize with the same value on server + first client render
  // to avoid hydration mismatches. Then load URL/localStorage after mount.
  const [trip, setTrip] = useState<Trip>(() => makeDefaultTrip());
  const [mounted, setMounted] = useState(false);

  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [resolvedResponse, setResolvedResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [resolvedLegs, setResolvedLegs] = useState<(NormalizedDirectionsLeg & { kind?: SegmentKind })[]>([]);
  const [resolvedError, setResolvedError] = useState<string | null>(null);
  const [itineraryView, setItineraryView] = useState<"overview" | "day">("overview");
  const [selectedDayISO, setSelectedDayISO] = useState<string>(() => makeDefaultTrip().startDateISO);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [addStopLeg, setAddStopLeg] = useState<ScheduledLeg | null>(null);
  const [dayTripDirections, setDayTripDirections] = useState<google.maps.DirectionsResult[]>([]);
  const [dayTripsByISO, setDayTripsByISO] = useState<
    Record<string, { legs: NormalizedDirectionsLeg[]; dwellMinutes: number; destinationPlaceId: string }>
  >({});

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  const requestSeq = useRef(0);

  // After mount: hydrate state from URL/localStorage.
  useEffect(() => {
    setMounted(true);

    const s = new URLSearchParams(window.location.search).get("s");
    if (s) {
      const fromUrl = decodeShareStateV1(s);
      if (fromUrl) {
        setTrip(normalizeTrip(fromUrl));
        return;
      }
    }

    const fromStorage = loadTripFromLocalStorage();
    if (fromStorage) setTrip(normalizeTrip(fromStorage));
  }, []);

  // Persist to localStorage (debounced-ish).
  useEffect(() => {
    if (!mounted) return;
    const t = window.setTimeout(() => saveTripToLocalStorage(trip), 400);
    return () => window.clearTimeout(t);
  }, [mounted, trip]);

  const scenario = useMemo(() => getActiveScenario(trip), [trip]);
  const placeIdsInOrder = useMemo(() => buildPlaceOrder(trip, scenario), [trip, scenario]);
  const segmentSpecs = useMemo(() => buildSegmentSpecs(trip, scenario), [trip, scenario]);

  const currentKey = useMemo(() => {
    if (segmentSpecs.length === 0) return null;
    const segKeys = segmentSpecs.map((spec) =>
      spec.ids
        .map((id) => {
          const p = trip.placesById[id]!;
          return `${p.location.lat.toFixed(5)},${p.location.lng.toFixed(5)}`;
        })
        .join("|"),
    );
    return `v2:${segKeys.join("||")}`;
  }, [segmentSpecs, trip.placesById]);

  const directions: DirectionsState = useMemo(() => {
    if (!apiKey) return { status: "missing_api_key" };
    if (loadError) return { status: "error", message: loadError.message };
    if (!isLoaded) return { status: "loading" };
    if (!currentKey) return { status: "idle" };
    if (resolvedKey === currentKey && resolvedResponse) {
      const cachedMulti = (
        (window as unknown as { __mtp_directions_cache?: Map<string, DirectionsState> }).__mtp_directions_cache
      )?.get(currentKey);
      const responses = cachedMulti?.status === "ready" ? cachedMulti.responses : [resolvedResponse];
      const kinds: SegmentKind[] =
        cachedMulti?.status === "ready" ? cachedMulti.kinds : ["other"];
      return { status: "ready", responses, kinds, legs: resolvedLegs };
    }
    if (resolvedKey === currentKey && resolvedError) {
      return { status: "error", message: resolvedError };
    }
    return { status: "loading" };
  }, [apiKey, currentKey, isLoaded, loadError, resolvedError, resolvedKey, resolvedLegs, resolvedResponse]);

  // Compute directions when the ordered places change (async; status is derived above).
  useEffect(() => {
    if (!apiKey || loadError || !isLoaded) return;
    if (!currentKey) return;
    if (segmentSpecs.length === 0) return;

    const cached = (window as unknown as { __mtp_directions_cache?: Map<string, DirectionsState> })
      .__mtp_directions_cache;
    const hit = cached?.get(currentKey);
    if (hit?.status === "ready") {
      setResolvedKey(currentKey);
      // v2 stores multi-response, but keep backward-compat with old cache entries.
      setResolvedResponse((hit as unknown as { response?: google.maps.DirectionsResult; responses?: google.maps.DirectionsResult[] }).responses?.[0] ?? (hit as unknown as { response?: google.maps.DirectionsResult }).response ?? null);
      setResolvedLegs(hit.legs);
      setResolvedError(null);
      return;
    }
    if (hit?.status === "error") {
      setResolvedKey(currentKey);
      setResolvedResponse(null);
      setResolvedLegs([]);
      setResolvedError(hit.message);
      return;
    }

    const seq = ++requestSeq.current;
    const timer = window.setTimeout(() => {
      const service = new google.maps.DirectionsService();

      const responses: google.maps.DirectionsResult[] = [];
      const kinds: SegmentKind[] = [];
      const allLegs: NormalizedDirectionsLeg[] = [];

      const runSegment = (segIdx: number) => {
        if (segIdx >= segmentSpecs.length) {
          setResolvedKey(currentKey);
          // Store first response for backward compat; MapView will render from the normalized state we compute below.
          setResolvedResponse(responses[0] ?? null);
          setResolvedLegs(allLegs);
          setResolvedError(null);

          const map =
            cached ??
            ((window as unknown as { __mtp_directions_cache?: Map<string, DirectionsState> })
              .__mtp_directions_cache = new Map());
          map.set(currentKey, { status: "ready", responses, kinds, legs: allLegs });
          return;
        }

        const spec = segmentSpecs[segIdx]!;
        const seg = spec.ids;
        const originId = seg[0]!;
        const destId = seg[seg.length - 1]!;
        const waypointIds = seg.slice(1, -1);

        service.route(
          {
            origin: trip.placesById[originId]!.location,
            destination: trip.placesById[destId]!.location,
            waypoints: waypointIds.map((id) => ({ location: trip.placesById[id]!.location, stopover: true })),
            travelMode: google.maps.TravelMode.DRIVING,
            optimizeWaypoints: false,
          },
          (result, status) => {
            if (seq !== requestSeq.current) return;
            if (status !== "OK" || !result) {
              const message = `Directions error: ${status}`;
              setResolvedKey(currentKey);
              setResolvedResponse(null);
              setResolvedLegs([]);
              setResolvedError(message);

              const map =
                cached ??
                ((window as unknown as { __mtp_directions_cache?: Map<string, DirectionsState> })
                  .__mtp_directions_cache = new Map());
              map.set(currentKey, { status: "error", message });
              return;
            }

            responses.push(result);
            kinds.push(spec.kind);
            allLegs.push(
              ...normalizeDirectionsResponse(seg, result).map((l) => ({
                ...l,
                kind: spec.kind,
              })),
            );
            runSegment(segIdx + 1);
          },
        );
      };

      runSegment(0);
    }, 750);

    return () => window.clearTimeout(timer);
  }, [apiKey, currentKey, isLoaded, loadError, segmentSpecs, trip.placesById]);

  const itinerary = useMemo(() => {
    if (directions.status !== "ready") {
      return computeItinerary({ trip, scenario, legs: [] });
    }
    return computeItinerary({ trip, scenario, legs: directions.legs, dayTripsByISO });
  }, [trip, scenario, directions, dayTripsByISO]);

  const latestAllowedReturnDepartISO = useMemo(() => {
    if (directions.status !== "ready") return null;
    const homeLegs = directions.legs.filter((l) => l.kind === "home");
    if (homeLegs.length === 0) return null;

    const bufferSec = Math.max(0, Math.round(scenario.settings.bufferMinutesPerStop * 60));
    const totalDrive = homeLegs.reduce((sum, l) => sum + Math.max(0, l.durationSec), 0);
    const interLegBuffers = Math.max(0, homeLegs.length - 1) * bufferSec;
    const total = totalDrive + interLegBuffers;
    const cutoff = makeLocalDateTime(trip.endDateISO, trip.endTimeHHMM);
    const latest = new Date(cutoff.getTime() - total * 1000);
    return toLocalInputDateTime(latest);
  }, [directions, scenario.settings.bufferMinutesPerStop, trip.endDateISO, trip.endTimeHHMM]);

  // Clamp user-selected return departure if it exceeds the latest allowed.
  useEffect(() => {
    if (!latestAllowedReturnDepartISO) return;
    const latest = new Date(latestAllowedReturnDepartISO);
    const chosen = makeLocalDateTime(trip.returnDepartDateISO, trip.returnDepartTimeHHMM);
    if (chosen.getTime() <= latest.getTime()) return;
    // Clamp to latest allowed.
    const iso = toLocalInputDateTime(latest);
    const [d, t] = iso.split("T");
    setTrip((prev) => ({ ...prev, returnDepartDateISO: d!, returnDepartTimeHHMM: t! }));
  }, [latestAllowedReturnDepartISO, trip.returnDepartDateISO, trip.returnDepartTimeHHMM]);

  // Build day-trip Directions + normalized legs (cached) so:
  // - schedule uses real drive times
  // - overview map shows black polylines
  useEffect(() => {
    if (!apiKey || loadError || !isLoaded) return;
    if (directions.status !== "ready") {
      setDayTripDirections([]);
      setDayTripsByISO({});
      return;
    }

    const overrides = scenario.dayOverridesByISO ?? {};
    const wanted = Object.entries(overrides).filter(([, o]) => Boolean(o.dayTrip));
    if (wanted.length === 0) {
      setDayTripDirections([]);
      setDayTripsByISO({});
      return;
    }

    const seq = ++requestSeq.current;

    const mainOnly = computeItinerary({ trip, scenario, legs: directions.legs });
    const baseByDay = computeBasePlaceByDay(mainOnly.days, scenario);

    const service = new google.maps.DirectionsService();
    const cache = (globalThis as unknown as {
      __mtp_daytrip_cache?: Map<
        string,
        { response: google.maps.DirectionsResult; legs: NormalizedDirectionsLeg[] }
      >;
    }).__mtp_daytrip_cache;

    (async () => {
      const responses: google.maps.DirectionsResult[] = [];
      const byISO: Record<string, { legs: NormalizedDirectionsLeg[]; dwellMinutes: number; destinationPlaceId: string }> =
        {};

      for (const [dayISO, o] of wanted) {
        const plan = o.dayTrip!;
        const destId =
          plan.preset === "CUSTOM" ? plan.destinationPlaceId : findPresetPlaceId(trip, plan.preset);
        if (!destId) continue;

        const startId = plan.startPlaceId ?? baseByDay[dayISO] ?? scenario.selectedOriginPlaceId;
        const endId = plan.endPlaceId ?? startId;
        if (!startId || !endId) continue;
        if (!trip.placesById[startId] || !trip.placesById[destId] || !trip.placesById[endId]) continue;

        const key = `dt:${startId}->${destId}->${endId}`;
        const hit = cache?.get(key);
        if (hit) {
          responses.push(hit.response);
          byISO[dayISO] = { legs: hit.legs, dwellMinutes: plan.dwellMinutes, destinationPlaceId: destId };
          continue;
        }

        const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
          service.route(
            {
              origin: trip.placesById[startId]!.location,
              destination: trip.placesById[endId]!.location,
              waypoints: [{ location: trip.placesById[destId]!.location, stopover: true }],
              travelMode: google.maps.TravelMode.DRIVING,
              optimizeWaypoints: false,
            },
            (res, status) => {
              if (status !== "OK" || !res) reject(new Error(String(status)));
              else resolve(res);
            },
          );
        }).catch(() => null);

        if (seq !== requestSeq.current) return;
        if (!result) continue;

        const legs = normalizeDirectionsResponse([startId, destId, endId], result);
        responses.push(result);
        byISO[dayISO] = { legs, dwellMinutes: plan.dwellMinutes, destinationPlaceId: destId };

        const map =
          cache ??
          (((globalThis as unknown as {
            __mtp_daytrip_cache?: Map<string, { response: google.maps.DirectionsResult; legs: NormalizedDirectionsLeg[] }>;
          }).__mtp_daytrip_cache = new Map()) as Map<
            string,
            { response: google.maps.DirectionsResult; legs: NormalizedDirectionsLeg[] }
          >);
        map.set(key, { response: result, legs });
      }

      if (seq !== requestSeq.current) return;
      setDayTripDirections(responses);
      setDayTripsByISO(byISO);
    })();
  }, [apiKey, directions, isLoaded, loadError, scenario, trip]);

  useEffect(() => {
    // Keep selection valid if the trip window changes.
    if (!itinerary.days.some((d) => d.dayISO === selectedDayISO)) {
      setSelectedDayISO(itinerary.days[0]?.dayISO ?? trip.startDateISO);
    }
  }, [itinerary.days, selectedDayISO, trip.startDateISO]);

  // Share is intentionally hidden for now while the trip model is evolving.

  return (
    <>
      <div className="h-screen w-full bg-zinc-50 text-zinc-900">
        <div className="h-full w-full grid grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)_380px]">
        <ControlsPane
          trip={trip}
          scenario={scenario}
          isMapsLoaded={isLoaded}
          mapsApiKeyPresent={Boolean(apiKey)}
          directionsStatus={directions.status}
          latestAllowedReturnDepartISO={latestAllowedReturnDepartISO}
          onSetActiveScenario={(id) => setTrip((t) => ({ ...t, activeScenarioId: id }))}
          onUpdateScenario={(patch) => setTrip((t) => updateScenario(t, scenario.id, patch))}
          onUpdateTrip={(patch) => setTrip((t) => ({ ...t, ...patch }))}
          onUpsertPlace={(p) => setTrip((t) => upsertPlace(t, p))}
          onReplaceTrip={(next) => {
            if (typeof window !== "undefined") {
              const u = new URL(window.location.href);
              u.searchParams.delete("s");
              window.history.replaceState({}, "", u.toString());
            }
            setTrip(normalizeTrip(next));
          }}
          onReset={() => {
            clearTripLocalStorage();
            if (typeof window !== "undefined") {
              const u = new URL(window.location.href);
              u.searchParams.delete("s");
              window.history.replaceState({}, "", u.toString());
            }
            setTrip(makeDefaultTrip());
          }}
        />

        <MapView
          trip={trip}
          scenario={scenario}
          isMapsLoaded={isLoaded}
          directions={directions.status === "ready" ? directions.responses : []}
          directionKinds={directions.status === "ready" ? directions.kinds : []}
          extraDirections={dayTripDirections}
          placeIdsInOrder={placeIdsInOrder}
          itinerary={itinerary.days}
          view={itineraryView}
          selectedDayISO={selectedDayISO}
        />

        <ItineraryView
          trip={trip}
          scenario={scenario}
          itinerary={itinerary.days}
          onUpdateScenario={(patch) => setTrip((t) => updateScenario(t, scenario.id, patch))}
          view={itineraryView}
          selectedDayISO={selectedDayISO}
          onChangeView={setItineraryView}
          onChangeSelectedDayISO={setSelectedDayISO}
          onLegClick={(leg) => {
            setAddStopLeg(leg);
            setAddStopOpen(true);
          }}
          isMapsLoaded={isLoaded}
          onUpsertPlace={(p) => setTrip((t) => upsertPlace(t, p))}
        />
        </div>
      </div>

    <AddStopModal
      open={addStopOpen}
      isMapsLoaded={isLoaded}
      leg={addStopLeg}
      fromName={addStopLeg ? trip.placesById[addStopLeg.fromPlaceId]?.name ?? "Unknown" : ""}
      toName={addStopLeg ? trip.placesById[addStopLeg.toPlaceId]?.name ?? "Unknown" : ""}
      onClose={() => setAddStopOpen(false)}
      onPlaceSelected={(place) => {
        setTrip((t) => {
          const s = getActiveScenario(t);
          const next = upsertPlace(t, place);
          const kind = addStopLeg?.kind ?? "up";
          const updatedScenario: Partial<Scenario> =
            kind === "home"
              ? { returnStopPlaceIds: [...(s.returnStopPlaceIds ?? []), place.id] }
              : kind === "other"
                ? { postAnnapolisStopPlaceIds: [...(s.postAnnapolisStopPlaceIds ?? []), place.id] }
                : { intermediateStopPlaceIds: [...s.intermediateStopPlaceIds, place.id] };
          return updateScenario(next, s.id, updatedScenario);
        });
      }}
    />
    </>
  );
}


