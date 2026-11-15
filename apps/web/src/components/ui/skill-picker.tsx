"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";

const SEARCH_SKILLS = `query Skills($query: String, $first: Int) { skills(query: $query, first: $first) { name } }`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<b>{text.slice(at, at + query.length)}</b>{text.slice(at + query.length)}</>;
}

// Chip input with ranked suggestions: popular skills on focus, arrow keys + Enter to pick, free text still allowed.
export function SkillPicker({ id, value, onChange, max, placeholder }: { id?: string; value: string[]; onChange: (next: string[]) => void; max: number; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef<number | undefined>(undefined);
  const query = draft.trim();
  const visible = options.filter((name) => !value.some((skill) => same(skill, name)));

  useEffect(() => {
    if (!open) return;
    let live = true;
    const timer = window.setTimeout(() => {
      graphqlRequest<{ skills: Array<{ name: string }> }>(SEARCH_SKILLS, { query, first: 10 })
        .then((result) => { if (live) { setOptions(result.skills.map((skill) => skill.name)); setActive(0); } })
        .catch(() => { if (live) setOptions([]); });
    }, query ? 120 : 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query, open]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const add = (names: string[]) => {
    const merged = [...value];
    for (const name of names.map((item) => item.trim()).filter(Boolean)) if (!merged.some((skill) => same(skill, name))) merged.push(name);
    onChange(merged.slice(0, max));
    setDraft("");
  };

  // Enter takes the highlighted suggestion; with no suggestions the typed text is kept as a custom skill.
  const commit = () => {
    if (visible[active]) add([visible[active]]); else if (query) add([query]);
  };

  return (
    <div style={{ position: "relative" }}>
      <label className="taginput">
        {value.map((skill) => (
          <span key={skill} className="tag inline-flex items-center gap-1">
            {skill}
            <button type="button" className="x" aria-label={`Remove ${skill}`} onClick={() => onChange(value.filter((item) => item !== skill))}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          id={id}
          aria-label="Add a skill"
          role="combobox"
          aria-expanded={open && visible.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={draft}
          maxLength={40}
          disabled={value.length >= max}
          placeholder={value.length ? "Add more…" : placeholder}
          onChange={(event) => {
            const text = event.target.value;
            if (text.includes(",")) { const parts = text.split(","); add(parts.slice(0, -1)); setDraft(parts[parts.length - 1] ?? ""); } else setDraft(text);
            setOpen(true);
          }}
          onFocus={() => { window.clearTimeout(blurTimer.current); setOpen(true); }}
          onBlur={() => { blurTimer.current = window.setTimeout(() => { setOpen(false); if (query) commit(); }, 120); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, visible.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
            else if (event.key === "Enter") { event.preventDefault(); commit(); }
            // Tab with text typed picks the highlighted skill and keeps focus here; an empty field lets Tab move on.
            else if (event.key === "Tab" && !event.shiftKey && query) { event.preventDefault(); commit(); }
            else if (event.key === "Escape") setOpen(false);
            else if (event.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
        />
      </label>
      {open && visible.length > 0 && (
        <ul id={listId} role="listbox" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", marginTop: 4, maxHeight: 260, overflowY: "auto", listStyle: "none", padding: 4, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
          {!query && <li style={{ padding: "4px 10px", fontSize: 11, color: "var(--ink-3)" }}>Popular</li>}
          {visible.map((name, index) => (
            <li key={name} role="option" aria-selected={index === active}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => add([name])}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, fontSize: 13, color: "var(--ink)", background: index === active ? "var(--sunk)" : "transparent", cursor: "pointer" }}>
                <Highlight text={name} query={query} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
