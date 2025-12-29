"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

import { makeDefaultTrip } from "@/lib/defaultTrip";
import { decodeShareStateV1, encodeShareStateV1 } from "@/lib/share";
import { clearTripLocalStorage, loadTripFromLocalStorage, saveTripToLocalStorage } from "@/lib/storage";
import { computeItinerary } from "@/lib/scheduler";
import { normalizeDirectionsResponse } from "@/lib/directions";
import { normalizeTrip } from "@/lib/normalizeTrip";
import type { NormalizedDirectionsLeg, Place, Scenario, Trip } from "@/types/trip";
import { ControlsPane } from "@/components/ControlsPane";
import { MapView } from "@/components/MapView";
import { ItineraryView } from "@/components/ItineraryView";

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
      legs: NormalizedDirectionsLeg[];
    }
  | { status: "error"; message: string };

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
  const lastAnchor = anchors.length > 0 ? anchors[anchors.length - 1] : undefined;

  // Outbound: routeOrigin -> ...intermediates... -> ...anchors... -> lastAnchor
  if (lastAnchor && routeOrigin && lastAnchor !== routeOrigin) {
    const outboundWaypoints = [...scenario.intermediateStopPlaceIds, ...anchors.slice(0, -1)].filter(
      (id) => id !== routeOrigin && id !== lastAnchor && Boolean(trip.placesById[id]),
    );
    specs.push({ ids: [routeOrigin, ...outboundWaypoints, lastAnchor], kind: "up" });
  }

  // Return: lastAnchor -> returnTo (Houston)
  if (lastAnchor && returnTo && lastAnchor !== returnTo) {
    specs.push({ ids: [lastAnchor, returnTo], kind: "home" });
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
  const [resolvedLegs, setResolvedLegs] = useState<NormalizedDirectionsLeg[]>([]);
  const [resolvedError, setResolvedError] = useState<string | null>(null);
  const [itineraryView, setItineraryView] = useState<"overview" | "day">("overview");
  const [selectedDayISO, setSelectedDayISO] = useState<string>(() => makeDefaultTrip().startDateISO);

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
            allLegs.push(...normalizeDirectionsResponse(seg, result));
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
    return computeItinerary({ trip, scenario, legs: directions.legs });
  }, [trip, scenario, directions]);

  useEffect(() => {
    // Keep selection valid if the trip window changes.
    if (!itinerary.days.some((d) => d.dayISO === selectedDayISO)) {
      setSelectedDayISO(itinerary.days[0]?.dayISO ?? trip.startDateISO);
    }
  }, [itinerary.days, selectedDayISO, trip.startDateISO]);

  const shareUrl = useMemo(() => {
    if (!mounted) return "";
    const s = encodeShareStateV1(trip);
    const u = new URL(window.location.href);
    u.searchParams.set("s", s);
    return u.toString();
  }, [mounted, trip]);

  return (
    <div className="h-screen w-full bg-zinc-50 text-zinc-900">
      <div className="h-full w-full grid grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)_380px]">
        <ControlsPane
          trip={trip}
          scenario={scenario}
          isMapsLoaded={isLoaded}
          mapsApiKeyPresent={Boolean(apiKey)}
          directionsStatus={directions.status}
          onSetActiveScenario={(id) => setTrip((t) => ({ ...t, activeScenarioId: id }))}
          onUpdateScenario={(patch) => setTrip((t) => updateScenario(t, scenario.id, patch))}
          onUpsertPlace={(p) => setTrip((t) => upsertPlace(t, p))}
          onReset={() => {
            clearTripLocalStorage();
            if (typeof window !== "undefined") {
              const u = new URL(window.location.href);
              u.searchParams.delete("s");
              window.history.replaceState({}, "", u.toString());
            }
            setTrip(makeDefaultTrip());
          }}
          shareUrl={shareUrl}
        />

        <MapView
          trip={trip}
          scenario={scenario}
          isMapsLoaded={isLoaded}
          directions={directions.status === "ready" ? directions.responses : []}
          directionKinds={directions.status === "ready" ? directions.kinds : []}
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
        />
      </div>
    </div>
  );
}


