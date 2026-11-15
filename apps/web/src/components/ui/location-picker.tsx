"use client";

import { useEffect, useId, useRef, useState } from "react";
import { graphqlRequest } from "@/lib/graphql-client";

const SEARCH_LOCATIONS = `query Locations($query: String!, $first: Int) { locations(query: $query, first: $first) { id city country label } }`;

// Single-value combobox: type a city or country, pick "City, Country". 
export function LocationPicker({ id, value, onChange, placeholder }: { id?: string; value: string; onChange: (next: string) => void; placeholder?: string }) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<number | undefined>(undefined);
  const query = value.trim();
  const visible = options.filter((label) => label !== value);

  useEffect(() => {
    if (!open || !query) { setOptions([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      graphqlRequest<{ locations: Array<{ label: string }> }>(SEARCH_LOCATIONS, { query, first: 8 })
        .then((result) => { if (live) { setOptions(result.locations.map((row) => row.label)); setActive(0); } })
        .catch(() => { if (live) setOptions([]); });
    }, 120);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query, open]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const pick = (label: string) => { onChange(label); setOpen(false); };

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && visible.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={80}
        value={value}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background-secondary))] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => { window.clearTimeout(blurTimer.current); setOpen(true); }}
        onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, visible.length - 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
          else if ((event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) && open && query && visible[active]) { event.preventDefault(); pick(visible[active]); }
          else if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && visible.length > 0 && (
        <ul id={listId} role="listbox" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", marginTop: 4, maxHeight: 260, overflowY: "auto", listStyle: "none", padding: 4, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
          {visible.map((label, index) => (
            <li key={label} role="option" aria-selected={index === active}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(label)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, fontSize: 13, color: "var(--ink)", background: index === active ? "var(--sunk)" : "transparent", cursor: "pointer" }}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
