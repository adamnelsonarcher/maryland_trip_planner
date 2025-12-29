"use client";

import { useMemo, useState } from "react";
import { Autocomplete } from "@react-google-maps/api";
import { nanoid } from "nanoid";

import type { Place } from "@/types/trip";

type Props = {
  isMapsLoaded: boolean;
  placeholder?: string;
  onPlaceSelected: (place: Place) => void;
};

export function PlaceSearchBox({ isMapsLoaded, placeholder, onPlaceSelected }: Props) {
  const [ac, setAc] = useState<google.maps.places.Autocomplete | null>(null);
  const [value, setValue] = useState("");

  const input = useMemo(() => {
    return (
      <input
        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 disabled:bg-zinc-50"
        placeholder={placeholder ?? "Search…"}
        value={value}
        disabled={!isMapsLoaded}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  }, [isMapsLoaded, placeholder, value]);

  if (!isMapsLoaded) return input;

  return (
    <Autocomplete
      onLoad={(instance) => setAc(instance)}
      onUnmount={() => setAc(null)}
      onPlaceChanged={() => {
        if (!ac) return;
        const p = ac.getPlace();
        const loc = p.geometry?.location;
        if (!loc) return;

        const place: Place = {
          id: nanoid(),
          name: p.name ?? p.formatted_address ?? "Unnamed place",
          address: p.formatted_address ?? p.vicinity ?? p.name ?? "",
          location: { lat: loc.lat(), lng: loc.lng() },
        };

        onPlaceSelected(place);
        setValue("");
      }}
      options={{
        fields: ["name", "formatted_address", "geometry", "vicinity"],
      }}
    >
      {input}
    </Autocomplete>
  );
}


