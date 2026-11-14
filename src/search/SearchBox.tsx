import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { Globe2, MapPin, Mountain, Orbit, Rocket, Search } from "lucide-react";

import type { GlobeKind, GlobePlace } from "../globe/types";

type SearchItem = {
  id: string;
  name: string;
  kind: GlobeKind;
  lon: number;
  lat: number;
  parent?: string;
  level?: number;
  mission?: string;
  year?: number;
};

const KIND_LABEL: Record<string, string> = {
  region: "Region",
  quad: "Quadrangle",
  feature: "Feature",
  landing: "Landing site",
  traverse: "Traverse",
};

function KindIcon({ kind }: { kind: string }) {
  if (kind === "landing") return <Rocket size={13} strokeWidth={1.6} />;
  if (kind === "feature") return <Mountain size={13} strokeWidth={1.6} />;
  if (kind === "quad") return <Orbit size={13} strokeWidth={1.6} />;
  if (kind === "region") return <Globe2 size={13} strokeWidth={1.6} />;
  return <MapPin size={13} strokeWidth={1.6} />;
}

type SearchBoxProps = {
  onSelect?: (place: GlobePlace) => void;
};

export function SearchBox({ onSelect }: SearchBoxProps) {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/globe/search-index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SearchItem[]) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: [
          { name: "name", weight: 0.75 },
          { name: "parent", weight: 0.2 },
        ],
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [items],
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const raw = fuse.search(q).slice(0, 18).map((r) => r.item);
    const priority: Record<string, number> = {
      feature: 5,
      landing: 4,
      region: 3,
      quad: 2,
      nomen: 1,
    };
    const byName = new Map<string, { item: SearchItem; rank: number }>();
    for (const item of raw) {
      const key = item.name.toLowerCase();
      const rank = priority[item.kind] ?? 0;
      const existing = byName.get(key);
      if (!existing || rank > existing.rank) byName.set(key, { item, rank });
    }
    return Array.from(byName.values())
      .map((v) => v.item)
      .slice(0, 8);
  }, [fuse, query]);

  const choose = (item: SearchItem) => {
    setQuery(item.name);
    setOpen(false);
    onSelect?.({
      id: item.id,
      name: item.name,
      kind: item.kind,
      lon: item.lon,
      lat: item.lat,
      mission: item.mission,
      year: item.year,
    });
  };

  return (
    <div className="search" ref={wrapRef}>
      <Search size={14} strokeWidth={1.7} />
      <input
        ref={inputRef}
        aria-label="Search Mars"
        aria-expanded={open}
        aria-controls="search-results"
        role="combobox"
        placeholder="Search Mars, regions, missions…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      <kbd>/</kbd>

      {open && results.length > 0 && (
        <div className="search-results" id="search-results" role="listbox">
          {results.map((item, i) => (
            <button
              key={item.id}
              className={`search-result ${i === active ? "active" : ""}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(item)}
              type="button"
            >
              <span className="search-icon">
                <KindIcon kind={item.kind} />
              </span>
              <span className="search-copy">
                <b>{item.name}</b>
                <small>
                  {KIND_LABEL[item.kind] ?? item.kind}
                  {item.parent ? ` · ${item.parent}` : ""}
                </small>
              </span>
              <span className="search-coord">
                {Math.abs(item.lat).toFixed(1)}°{item.lat >= 0 ? "N" : "S"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
