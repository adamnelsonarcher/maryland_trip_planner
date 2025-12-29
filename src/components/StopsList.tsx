"use client";

import type { Place } from "@/types/trip";

type Props = {
  placesById: Record<string, Place>;
  stopPlaceIds: string[];
  onChange: (nextIds: string[]) => void;
};

export function StopsList({ placesById, stopPlaceIds, onChange }: Props) {
  if (stopPlaceIds.length === 0) {
    return <div className="text-sm text-zinc-500">No intermediate stops yet.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {stopPlaceIds.map((id, idx) => {
        const p = placesById[id];
        return (
          <div
            key={`${id}-${idx}`}
            className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p?.name ?? "Unknown place"}</div>
              <div className="truncate text-xs text-zinc-500">{p?.address ?? ""}</div>
            </div>

            <div className="flex items-center gap-1">
              <button
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-40"
                disabled={idx === 0}
                onClick={() => {
                  if (idx === 0) return;
                  const next = [...stopPlaceIds];
                  const tmp = next[idx - 1]!;
                  next[idx - 1] = next[idx]!;
                  next[idx] = tmp;
                  onChange(next);
                }}
                title="Move up"
              >
                ↑
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-40"
                disabled={idx === stopPlaceIds.length - 1}
                onClick={() => {
                  if (idx === stopPlaceIds.length - 1) return;
                  const next = [...stopPlaceIds];
                  const tmp = next[idx + 1]!;
                  next[idx + 1] = next[idx]!;
                  next[idx] = tmp;
                  onChange(next);
                }}
                title="Move down"
              >
                ↓
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50"
                onClick={() => onChange(stopPlaceIds.filter((x, i) => !(x === id && i === idx)))}
                title="Remove stop"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}


