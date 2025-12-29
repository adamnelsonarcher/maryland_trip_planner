"use client";

import { useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  minutes: number;
  onClose: () => void;
  onSave: (minutes: number) => void;
};

export function EditMinutesModal({ open, title, minutes, onClose, onSave }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
          <div className="min-w-0">
            <div className="text-sm text-zinc-500">Edit time</div>
            <div className="truncate text-base font-semibold">{title}</div>
          </div>
          <button
            className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-sm hover:bg-zinc-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600">Minutes</span>
            <input
              className="rounded-md border border-zinc-200 px-2 py-2 text-sm"
              type="number"
              min={0}
              step={15}
              defaultValue={minutes}
              ref={inputRef}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = Number((e.target as HTMLInputElement).value || 0);
                  onSave(v);
                  onClose();
                }
              }}
            />
          </label>

          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50" onClick={onClose}>
              Cancel
            </button>
            <button
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
              onClick={() => {
                const v = inputRef.current ? Number(inputRef.current.value || 0) : minutes;
                onSave(v);
                onClose();
              }}
            >
              Save
            </button>
          </div>
          <div className="mt-2 text-xs text-zinc-500">Tip: press Enter to save.</div>
        </div>
      </div>
    </div>
  );
}


