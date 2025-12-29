"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { DirectionsRenderer, GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";

import type { DayItinerary, Scenario, Trip } from "@/types/trip";

type Props = {
  trip: Trip;
  scenario: Scenario;
  isMapsLoaded: boolean;
  directions: google.maps.DirectionsResult[];
  placeIdsInOrder: string[];
  itinerary: DayItinerary[];
  view: "overview" | "day";
  selectedDayISO: string;
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

function computeBasePlaceByDay(itinerary: DayItinerary[], scenario: Scenario): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  let current: string | undefined = scenario.actualStartPlaceId ?? scenario.selectedOriginPlaceId;

  for (const day of itinerary) {
    map[day.dayISO] = current;
    if (day.legs.length > 0) {
      current = day.legs[0]!.fromPlaceId;
      for (const leg of day.legs) {
        const arrives = !leg.isSplitChunk || (leg.partIndex && leg.partCount && leg.partIndex === leg.partCount);
        if (arrives) current = leg.toPlaceId;
      }
    }
  }
  return map;
}

export function MapView({
  trip,
  scenario,
  isMapsLoaded,
  directions,
  placeIdsInOrder,
  itinerary,
  view,
  selectedDayISO,
}: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);

  const baseByDay = useMemo(() => computeBasePlaceByDay(itinerary, scenario), [itinerary, scenario]);

  const selectedDay = useMemo(() => itinerary.find((d) => d.dayISO === selectedDayISO), [itinerary, selectedDayISO]);

  const overviewPoints = useMemo(() => {
    return placeIdsInOrder
      .map((id) => trip.placesById[id])
      .filter(Boolean)
      .map((p) => ({ id: p!.id, name: p!.name, location: p!.location }));
  }, [placeIdsInOrder, trip.placesById]);

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
  }, [baseByDay, selectedDay, trip.placesById]);

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

  const dayPath = useMemo(() => {
    if (view !== "day") return [];
    if (!selectedDay || selectedDay.legs.length === 0) return [];
    const path: google.maps.LatLngLiteral[] = [];
    for (const leg of selectedDay.legs) {
      const a = trip.placesById[leg.fromPlaceId]?.location;
      const b = trip.placesById[leg.toPlaceId]?.location;
      if (a) path.push(a);
      if (b) path.push(b);
    }
    // Dedupe consecutive duplicates
    const out: google.maps.LatLngLiteral[] = [];
    for (const p of path) {
      const last = out[out.length - 1];
      if (last && last.lat === p.lat && last.lng === p.lng) continue;
      out.push(p);
    }
    return out;
  }, [selectedDay, trip.placesById, view]);

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

          {view === "overview" ? (
            directions.map((d, idx) => (
              <DirectionsRenderer
                key={idx}
                directions={d}
                options={{
                  suppressMarkers: true,
                  polylineOptions: { strokeColor: "#111827", strokeOpacity: 0.9, strokeWeight: 5 },
                }}
              />
            ))
          ) : dayPath.length > 1 ? (
            <Polyline
              path={dayPath}
              options={{
                strokeColor: "#111827",
                strokeOpacity: 0.8,
                strokeWeight: 4,
              }}
            />
          ) : null}
        </GoogleMap>
      )}
    </main>
  );
}


