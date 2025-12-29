"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

import { makeDefaultTrip } from "@/lib/defaultTrip";
import { decodeShareStateV1, encodeShareStateV1 } from "@/lib/share";
import { clearTripLocalStorage, loadTripFromLocalStorage, saveTripToLocalStorage } from "@/lib/storage";
import { computeItinerary } from "@/lib/scheduler";
import { normalizeDirectionsResponse } from "@/lib/directions";
import type { NormalizedDirectionsLeg, Place, Scenario, Trip } from "@/types/trip";
import { ControlsPane } from "@/components/ControlsPane";
import { MapView } from "@/components/MapView";
import { ItineraryView } from "@/components/ItineraryView";

const LIBRARIES: ("places")[] = ["places"];

type DirectionsState =
  | { status: "idle" }
  | { status: "missing_api_key" }
  | { status: "loading" }
  | { status: "ready"; response: google.maps.DirectionsResult; legs: NormalizedDirectionsLeg[] }
  | { status: "error"; message: string };

function getActiveScenario(trip: Trip): Scenario {
  const s = trip.scenariosById[trip.activeScenarioId];
  if (s) return s;
  const first = Object.values(trip.scenariosById)[0];
  if (!first) throw new Error("Trip has no scenarios");
  return first;
}

function buildPlaceOrder(trip: Trip, scenario: Scenario) {
  const placeIds: string[] = [];
  placeIds.push(scenario.selectedOriginPlaceId);
  placeIds.push(...scenario.intermediateStopPlaceIds);
  placeIds.push(...scenario.anchorPlaceIds);
  return placeIds.filter((id) => Boolean(trip.placesById[id]));
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
  const [trip, setTrip] = useState<Trip>(() => {
    // Initial load: share URL state wins, then localStorage, then defaults.
    if (typeof window === "undefined") return makeDefaultTrip();
    const s = new URLSearchParams(window.location.search).get("s");
    if (s) {
      const fromUrl = decodeShareStateV1(s);
      if (fromUrl) return fromUrl;
    }
    const fromStorage = loadTripFromLocalStorage();
    return fromStorage ?? makeDefaultTrip();
  });

  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [resolvedResponse, setResolvedResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [resolvedLegs, setResolvedLegs] = useState<NormalizedDirectionsLeg[]>([]);
  const [resolvedError, setResolvedError] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  const requestSeq = useRef(0);

  // Persist to localStorage (debounced-ish).
  useEffect(() => {
    const t = window.setTimeout(() => saveTripToLocalStorage(trip), 400);
    return () => window.clearTimeout(t);
  }, [trip]);

  const scenario = useMemo(() => getActiveScenario(trip), [trip]);
  const placeIdsInOrder = useMemo(() => buildPlaceOrder(trip, scenario), [trip, scenario]);

  const currentKey = useMemo(() => {
    if (placeIdsInOrder.length < 2) return null;
    const keyParts = placeIdsInOrder
      .map((id) => {
        const p = trip.placesById[id]!;
        return `${p.location.lat.toFixed(5)},${p.location.lng.toFixed(5)}`;
      })
      .join("|");

    return `v1:${keyParts}`;
  }, [placeIdsInOrder, trip.placesById]);

  const directions: DirectionsState = useMemo(() => {
    if (!apiKey) return { status: "missing_api_key" };
    if (loadError) return { status: "error", message: loadError.message };
    if (!isLoaded) return { status: "loading" };
    if (!currentKey) return { status: "idle" };
    if (resolvedKey === currentKey && resolvedResponse) {
      return { status: "ready", response: resolvedResponse, legs: resolvedLegs };
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

    const cached = (window as unknown as { __mtp_directions_cache?: Map<string, DirectionsState> })
      .__mtp_directions_cache;
    const hit = cached?.get(currentKey);
    if (hit?.status === "ready") {
      setResolvedKey(currentKey);
      setResolvedResponse(hit.response);
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
      const origin = trip.placesById[placeIdsInOrder[0]!]!;
      const destination = trip.placesById[placeIdsInOrder[placeIdsInOrder.length - 1]!]!;
      const waypointIds = placeIdsInOrder.slice(1, -1);

      const service = new google.maps.DirectionsService();
      service.route(
        {
          origin: origin.location,
          destination: destination.location,
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

          const normalizedLegs = normalizeDirectionsResponse(placeIdsInOrder, result);
          setResolvedKey(currentKey);
          setResolvedResponse(result);
          setResolvedLegs(normalizedLegs);
          setResolvedError(null);

          const map =
            cached ??
            ((window as unknown as { __mtp_directions_cache?: Map<string, DirectionsState> })
              .__mtp_directions_cache = new Map());
          map.set(currentKey, { status: "ready", response: result, legs: normalizedLegs });
        },
      );
    }, 750);

    return () => window.clearTimeout(timer);
  }, [apiKey, currentKey, isLoaded, loadError, placeIdsInOrder, trip.placesById]);

  const itinerary = useMemo(() => {
    if (directions.status !== "ready") {
      return computeItinerary({ trip, scenario, legs: [] });
    }
    return computeItinerary({ trip, scenario, legs: directions.legs });
  }, [trip, scenario, directions]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const s = encodeShareStateV1(trip);
    const u = new URL(window.location.href);
    u.searchParams.set("s", s);
    return u.toString();
  }, [trip]);

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
            setTrip(makeDefaultTrip());
          }}
          shareUrl={shareUrl}
        />

        <MapView
          trip={trip}
          scenario={scenario}
          isMapsLoaded={isLoaded}
          directions={directions.status === "ready" ? directions.response : null}
          placeIdsInOrder={placeIdsInOrder}
        />

        <ItineraryView trip={trip} scenario={scenario} itinerary={itinerary.days} />
      </div>
    </div>
  );
}


