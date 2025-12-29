"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { DirectionsRenderer, GoogleMap, MarkerF } from "@react-google-maps/api";

import type { Scenario, Trip } from "@/types/trip";

type Props = {
  trip: Trip;
  scenario: Scenario;
  isMapsLoaded: boolean;
  directions: google.maps.DirectionsResult[];
  placeIdsInOrder: string[];
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

export function MapView({ trip, isMapsLoaded, directions, placeIdsInOrder }: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);

  const points = useMemo(() => {
    return placeIdsInOrder
      .map((id) => trip.placesById[id])
      .filter(Boolean)
      .map((p) => ({ id: p!.id, name: p!.name, location: p!.location }));
  }, [placeIdsInOrder, trip.placesById]);

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

          {directions.map((d, idx) => (
            <DirectionsRenderer
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              directions={d}
              options={{
                suppressMarkers: true,
                polylineOptions: { strokeColor: "#111827", strokeOpacity: 0.9, strokeWeight: 5 },
              }}
            />
          ))}
        </GoogleMap>
      )}
    </main>
  );
}


