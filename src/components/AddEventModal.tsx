"use client";

import { nanoid } from "nanoid";

import type { DwellBlock, Place } from "@/types/trip";
import { PlaceSearchBox } from "@/components/PlaceSearchBox";

type Props = {
  open: boolean;
  isMapsLoaded: boolean;
  dayISO: string | null;
  basePlaceName: string | null;
  onClose: () => void;
  onAddDrive: () => void;
  onAddTimeAtBase: (block: DwellBlock) => void;
  onAddTimeAtPlace: (place: Place, minutes: number) => void;
};

export function AddEventModal({
  open,
  isMapsLoaded,
  dayISO,
  basePlaceName,
  onClose,
  onAddDrive,
  onAddTimeAtBase,
  onAddTimeAtPlace,
}: Props) {
  if (!open || !dayISO) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
          <div className="min-w-0">
            <div className="text-sm text-zinc-500">Add to day</div>
            <div className="truncate text-base font-semibold">{dayISO}</div>
          </div>
          <button
            className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-sm hover:bg-zinc-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-3 py-3 text-sm text-white hover:bg-zinc-800"
              onClick={() => {
                onAddDrive();
                onClose();
              }}
            >
              + Add drive (day trip)
            </button>

            <button
              type="button"
              className="rounded-md border border-zinc-200 px-3 py-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
              disabled={!basePlaceName}
              onClick={() => {
                if (!basePlaceName) return;
                // placeId is filled by parent (base location id); this is just the template.
                onAddTimeAtBase({ id: nanoid(), placeId: "__BASE__", minutes: 90, label: `Time in ${basePlaceName}` });
                onClose();
              }}
            >
              + Add time spent (here)
            </button>
          </div>

          <div>
            <div className="text-sm font-semibold">Add time spent at a place</div>
            <div className="mt-2">
              <PlaceSearchBox
                isMapsLoaded={isMapsLoaded}
                placeholder="Search a place…"
                onPlaceSelected={(p) => {
                  onAddTimeAtPlace(p, 90);
                  onClose();
                }}
              />
            </div>
            <div className="mt-2 text-xs text-zinc-500">Defaults to 90 minutes (editable after).</div>
          </div>
        </div>
      </div>
    </div>
  );
}


