import { useEffect, useMemo, useState } from "react";
import { Crosshair, MapPin, Search, X } from "lucide-react";

import { CURATED_SITES, siteFromPoint, type Site } from "./terrain";

type SearchItem = {
  id: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
  parent?: string;
};

type SitePickerProps = {
  onClose: () => void;
  onSelect: (site: Site) => void;
  onPickGlobe: () => void;
};

export function SitePicker({ onClose, onSelect, onPickGlobe }: SitePickerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [lon, setLon] = useState("137.39");
  const [lat, setLat] = useState("-4.68");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/globe/search-index.json")
      .then((r) => r.json() as Promise<SearchItem[]>)
      .then(setItems)
      .catch(() => setError("Search index unavailable. Use coordinates or the globe."));
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.parent?.toLowerCase().includes(q),
      )
      .slice(0, 7);
  }, [items, query]);

  const submitCoords = () => {
    const east = Number(lon);
    const north = Number(lat);
    if (!Number.isFinite(east) || !Number.isFinite(north)) {
      setError("Enter numeric longitude and latitude.");
      return;
    }
    if (Math.abs(north) > 89 || Math.abs(east) > 180) {
      setError("Longitude must be −180…180 and latitude −89…89.");
      return;
    }
    onSelect(siteFromPoint(east, north));
  };

  return (
    <div className="site-picker" role="dialog" aria-label="Choose a Mars site">
      <div className="site-sheet">
        <header>
          <div>
            <span>GROUNDTRUTH / EVA</span>
            <h2>Where are you?</h2>
            <p>Pick any point on Mars. Gale is the 1 m field site; everywhere else is 200 m recon.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close site picker">
            <X size={16} strokeWidth={1.7} />
          </button>
        </header>

        <button className="site-globe" type="button" onClick={onPickGlobe}>
          <Crosshair size={16} strokeWidth={1.6} />
          <span>
            <b>Click anywhere on the globe</b>
            <small>Set the astronaut position directly on Mars</small>
          </span>
        </button>

        <div className="site-search">
          <Search size={14} strokeWidth={1.7} />
          <input
            autoFocus
            placeholder="Search a feature, landing site, or region…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {results.length > 0 && (
          <div className="site-results">
            {results.map((item) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() =>
                  onSelect({
                    id: String(item.id),
                    name: item.name,
                    lon: item.lon,
                    lat: item.lat,
                    kind: item.kind === "landing" ? "landing" : "feature",
                    parent: item.parent,
                  })
                }
              >
                <MapPin size={12} strokeWidth={1.6} />
                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.kind}
                    {item.parent ? ` · ${item.parent}` : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="site-section-label">QUICK SITES</div>
        <div className="site-quick">
          {CURATED_SITES.map((site) => (
            <button key={site.id} type="button" onClick={() => onSelect(site)}>
              {site.name}
              <small>{site.id === "gale" ? "1 m field" : "200 m recon"}</small>
            </button>
          ))}
        </div>

        <div className="site-section-label">OR ENTER COORDINATES</div>
        <div className="site-coords">
          <label>
            Longitude E
            <input value={lon} onChange={(e) => setLon(e.target.value)} />
          </label>
          <label>
            Latitude N
            <input value={lat} onChange={(e) => setLat(e.target.value)} />
          </label>
          <button type="button" onClick={submitCoords}>
            Use point
          </button>
        </div>
        {error && <div className="site-error">{error}</div>}
      </div>
    </div>
  );
}
