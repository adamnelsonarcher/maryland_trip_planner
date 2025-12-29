"use client";

/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/preserve-manual-memoization */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DirectionsRenderer, GoogleMap, MarkerF } from "@react-google-maps/api";

import type { DayItinerary, Scenario, Trip } from "@/types/trip";
import { computeBasePlaceByDay } from "@/lib/baseByDay";

type Props = {
  trip: Trip;
  scenario: Scenario;
  isMapsLoaded: boolean;
  directions: google.maps.DirectionsResult[];
  directionKinds?: ("up" | "home" | "other")[];
  extraDirections?: google.maps.DirectionsResult[];
  placeIdsInOrder: string[];
  itinerary: DayItinerary[];
  view: "overview" | "day";
  selectedDayISO: string;
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

function findPresetPlaceId(trip: Trip, preset: "NYC" | "PA"): string | undefined {
  if (preset === "NYC") {
    return Object.values(trip.placesById).find((p) => p.name.toLowerCase().includes("new york"))?.id;
  }
  if (preset === "PA") {
    return Object.values(trip.placesById).find((p) => p.name.toLowerCase().includes("pa friends"))?.id;
  }
  return undefined;
}

export function MapView({
  trip,
  scenario,
  isMapsLoaded,
  directions,
  directionKinds,
  extraDirections,
  placeIdsInOrder,
  itinerary,
  view,
  selectedDayISO,
}: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [dayDirections, setDayDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [dayDirectionsError, setDayDirectionsError] = useState<string | null>(null);

  const baseByDay = useMemo(() => computeBasePlaceByDay(itinerary, scenario), [itinerary, scenario]);

  const selectedDay = useMemo(() => itinerary.find((d) => d.dayISO === selectedDayISO), [itinerary, selectedDayISO]);
  const selectedOverride = scenario.dayOverridesByISO?.[selectedDayISO];

  const overviewPoints = useMemo(() => {
    return placeIdsInOrder
      .map((id) => trip.placesById[id])
      .filter(Boolean)
      .map((p) => ({ id: p!.id, name: p!.name, location: p!.location }));
  }, [placeIdsInOrder, trip]);

  const dayPoints = useMemo(() => {
    if (!selectedDay) return [];
    if (selectedDay.legs.length === 0) {
      const baseId = baseByDay[selectedDay.dayISO];
      const p = baseId ? trip.placesById[baseId] : undefined;
      return p ? [{ id: p.id, name: p.name, location: p.location }] : [];
    }

    const ids: string[] = [];
    for (const leg of selectedDay.legs) {
      ids.push(leg.fromPlaceId);
      ids.push(leg.toPlaceId);
    }
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      if (!trip.placesById[id]) continue;
      seen.add(id);
      uniq.push(id);
    }
    return uniq.map((id) => {
      const p = trip.placesById[id]!;
      return { id: p.id, name: p.name, location: p.location };
    });
  }, [baseByDay, selectedDay, trip]);

  const points = view === "day" ? dayPoints : overviewPoints;

  const center = useMemo(() => {
    if (points.length > 0) return points[0]!.location;
    return { lat: 39.0, lng: -77.0 }; // MD-ish default
  }, [points]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (points.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p.location);
    map.fitBounds(bounds, 60);
  }, [points]);

  const dayRouteIds = useMemo(() => {
    if (view !== "day") return [];
    if (!selectedDay) return [];
    // If no driving that day but a preset day trip is selected, render a loop from base -> preset -> base.
    if (selectedDay.legs.length === 0 && selectedOverride?.dayTrip) {
      const baseId = selectedOverride.dayTrip.startPlaceId ?? baseByDay[selectedDayISO];
      const presetPlaceId =
        selectedOverride.dayTrip.preset === "CUSTOM"
          ? selectedOverride.dayTrip.destinationPlaceId
          : findPresetPlaceId(trip, selectedOverride.dayTrip.preset);
      const endId = selectedOverride.dayTrip.endPlaceId ?? baseId;
      if (baseId && presetPlaceId && endId) return [baseId, presetPlaceId, endId];
      return [];
    }
    if (selectedDay.legs.length === 0) return [];
    const ids: string[] = [selectedDay.legs[0]!.fromPlaceId];
    for (const leg of selectedDay.legs) ids.push(leg.toPlaceId);
    // Remove consecutive duplicates
    const out: string[] = [];
    for (const id of ids) {
      const last = out[out.length - 1];
      if (last === id) continue;
      out.push(id);
    }
    return out.filter((id) => Boolean(trip.placesById[id]));
  }, [baseByDay, selectedDay, selectedDayISO, selectedOverride?.dayTrip, trip, view]);

  const dayStrokeColor = useMemo(() => {
    if (!selectedDay) return "#111827";
    const kinds = selectedDay.legs.map((l) => l.kind ?? "other");
    if (kinds.includes("home")) return "#F97316";
    if (kinds.includes("up")) return "#10B981";
    return "#111827";
  }, [selectedDay]);

  useEffect(() => {
    if (!isMapsLoaded) return;
    if (view !== "day") return;
    if (dayRouteIds.length < 2) {
      setDayDirections(null);
      setDayDirectionsError(null);
      return;
    }

    const key = `v1:${dayRouteIds.join("->")}`;
    const cache = (globalThis as unknown as { __mtp_day_directions_cache?: Map<string, google.maps.DirectionsResult> })
      .__mtp_day_directions_cache;
    const cached = cache?.get(key);
    if (cached) {
      setDayDirections(cached);
      setDayDirectionsError(null);
      return;
    }

    setDayDirections(null);
    setDayDirectionsError(null);

    const timer = window.setTimeout(() => {
      const originId = dayRouteIds[0]!;
      const destId = dayRouteIds[dayRouteIds.length - 1]!;
      const waypointIds = dayRouteIds.slice(1, -1);

      const service = new google.maps.DirectionsService();
      service.route(
        {
          origin: trip.placesById[originId]!.location,
          destination: trip.placesById[destId]!.location,
          waypoints: waypointIds.map((id) => ({ location: trip.placesById[id]!.location, stopover: true })),
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false,
        },
        (result, status) => {
          if (status !== "OK" || !result) {
            setDayDirectionsError(`Day directions error: ${status}`);
            setDayDirections(null);
            return;
          }

          setDayDirections(result);
          const map =
            cache ??
            (((globalThis as unknown as { __mtp_day_directions_cache?: Map<string, google.maps.DirectionsResult> })
              .__mtp_day_directions_cache = new Map()) as Map<string, google.maps.DirectionsResult>);
          map.set(key, result);
        },
      );
    }, 400);

    return () => window.clearTimeout(timer);
  }, [dayRouteIds, isMapsLoaded, trip, view]);

  return (
    <main className="h-full min-h-[420px] bg-zinc-100">
      {!isMapsLoaded ? (
        <div className="h-full flex items-center justify-center text-sm text-zinc-600">
          Loading Google Maps…
        </div>
      ) : (
        <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={6} onLoad={onLoad} onUnmount={onUnmount}>
          {points.map((p, idx) => (
            <MarkerF key={p.id} position={p.location} label={idx === 0 ? "O" : idx === points.length - 1 ? "D" : `${idx}`} />
          ))}

          {view === "overview"
            ? directions.map((d, idx) => {
                const kind = directionKinds?.[idx] ?? "other";
                const strokeColor =
                  kind === "up" ? "#10B981" : kind === "home" ? "#F97316" : "#111827";
                return (
                  <DirectionsRenderer
                    key={idx}
                    directions={d}
                    options={{
                      suppressMarkers: true,
                      polylineOptions: { strokeColor, strokeOpacity: 0.9, strokeWeight: 5 },
                    }}
                  />
                );
              })
            : null}

          {view === "overview"
            ? (extraDirections ?? []).map((d, idx) => (
                <DirectionsRenderer
                  key={`dt-${idx}`}
                  directions={d}
                  options={{
                    suppressMarkers: true,
                    polylineOptions: { strokeColor: "#111827", strokeOpacity: 0.85, strokeWeight: 4 },
                  }}
                />
              ))
            : dayDirections ? (
                <DirectionsRenderer
                  directions={dayDirections}
                  options={{
                    suppressMarkers: true,
                    polylineOptions: { strokeColor: dayStrokeColor, strokeOpacity: 0.9, strokeWeight: 5 },
                  }}
                />
              ) : null}

          {view === "day" && dayDirectionsError ? (
            <div className="absolute left-3 top-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {dayDirectionsError}
            </div>
          ) : null}
        </GoogleMap>
      )}
    </main>
  );
}


