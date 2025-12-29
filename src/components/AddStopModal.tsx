"use client";

import type { Place, ScheduledLeg } from "@/types/trip";
import { PlaceSearchBox } from "@/components/PlaceSearchBox";

type Props = {
  open: boolean;
  isMapsLoaded: boolean;
  leg: ScheduledLeg | null;
  fromName: string;
  toName: string;
  onClose: () => void;
  onPlaceSelected: (place: Place) => void;
};

export function AddStopModal({
  open,
  isMapsLoaded,
  leg,
  fromName,
  toName,
  onClose,
  onPlaceSelected,
}: Props) {
  if (!open || !leg) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
          <div className="min-w-0">
            <div className="text-sm text-zinc-500">Add a stop</div>
            <div className="truncate text-base font-semibold">
              {fromName} → {toName}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              This will insert a stop into the route and recompute drive times.
            </div>
          </div>
          <button
            className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-sm hover:bg-zinc-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-4">
          <PlaceSearchBox
            isMapsLoaded={isMapsLoaded}
            placeholder="Search for a stop (Google Places)…"
            onPlaceSelected={(p) => {
              onPlaceSelected(p);
              onClose();
            }}
          />
          <div className="mt-3 text-xs text-zinc-500">
            For v1, stops are inserted into either the outbound list or the drive-home list depending on which drive you clicked.
          </div>
        </div>
      </div>
    </div>
  );
}


