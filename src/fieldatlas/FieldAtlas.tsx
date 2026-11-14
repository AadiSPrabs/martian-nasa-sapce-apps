import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as L from "leaflet";

import { GALE_BBOX, MISSION, OBJECTIVES, ROUTE_MODES, type RouteModeId, type WaypointData } from "./mission";
import { loadDem, sampleDem, type Dem } from "./dem";
import { buildRoute, type RouteResult } from "./route";
import { Profile } from "./Profile";
import { Safety } from "./Safety";
import { WalkMode } from "./WalkMode";

type Weather = {
  latest: {
    sol: number;
    date: string;
    minC: string;
    maxC: string;
    pressurePa: string;
    opacity: string;
    season: string;
  } | null;
};

type FieldAtlasProps = {
  onClose: () => void;
};

const DWELL = (id: string) => OBJECTIVES[id]?.dwellMin ?? 0;

export function FieldAtlas({ onClose }: FieldAtlasProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const demRef = useRef<Dem | null>(null);
  const hillshadeRef = useRef<L.ImageOverlay | null>(null);
  const slopeRef = useRef<L.ImageOverlay | null>(null);
  const geologyRef = useRef<L.ImageOverlay | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const lastCursor = useRef(0);

  const [dem, setDem] = useState<Dem | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointData[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeMode, setRouteMode] = useState<RouteModeId>("science");
  const [selectedId, setSelectedId] = useState("vera_rubin_ridge");
  const [walkOpen, setWalkOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ lon: number; lat: number; elev: number | null } | null>(
    null,
  );
  const [layers, setLayers] = useState({
    hillshade: true,
    slope: false,
    geology: false,
  });

  useEffect(() => {
    if (!mapEl.current) return;
    const bounds = L.latLngBounds(
      [GALE_BBOX[1], GALE_BBOX[0]],
      [GALE_BBOX[3], GALE_BBOX[2]],
    );
    const map = L.map(mapEl.current, {
      crs: L.CRS.EPSG4326,
      zoomControl: false,
      attributionControl: false,
      minZoom: 10,
      maxZoom: 17,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      preferCanvas: true,
    });

    L.imageOverlay("/data/gale/hirise.jpg", bounds, {
      className: "atlas-hirise",
      interactive: false,
    }).addTo(map);
    hillshadeRef.current = L.imageOverlay("/data/gale/hillshade.webp", bounds, {
      opacity: 0.5,
      interactive: false,
    }).addTo(map);
    slopeRef.current = L.imageOverlay("/data/gale/slope.png", bounds, {
      opacity: 0,
      interactive: false,
    }).addTo(map);
    geologyRef.current = L.imageOverlay("/data/gale/geology.png", bounds, {
      opacity: 0,
      interactive: false,
    }).addTo(map);

    map.fitBounds(bounds, { padding: [18, 18] });
    map.setMaxBounds(bounds.pad(0.3));

    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      const now = performance.now();
      if (now - lastCursor.current < 55) return;
      lastCursor.current = now;
      const d = demRef.current;
      setCursor({
        lon: e.latlng.lng,
        lat: e.latlng.lat,
        elev: d ? sampleDem(d, e.latlng.lng, e.latlng.lat) : null,
      });
    });
    map.on("mouseout", () => setCursor(null));

    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 140);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadDem(),
      fetch("/data/gale/waypoints.json").then((r) => r.json() as Promise<WaypointData[]>),
      fetch("/data/gale/weather.json").then((r) => r.json() as Promise<Weather>),
    ])
      .then(([demData, wps, wx]) => {
        if (cancelled) return;
        demRef.current = demData;
        setDem(demData);
        setWaypoints(wps);
        setWeather(wx);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[atlas] data load failed", err);
        if (!cancelled) {
          setError("Could not load the Gale field data.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dem || waypoints.length === 0) return;
    const mode = ROUTE_MODES.find((m) => m.id === routeMode) ?? ROUTE_MODES[0];
    const ordered = mode.ids
      .map((id) => waypoints.find((w) => w.id === id))
      .filter((w): w is WaypointData => Boolean(w));
    setRoute(buildRoute(ordered, dem));
  }, [dem, waypoints, routeMode]);

  useEffect(() => {
    if (!mapRef.current || !route) return;
    const map = mapRef.current;
    const group = L.layerGroup().addTo(map);

    const latlngs = route.points.map((p) => [p.lat, p.lon] as [number, number]);
    L.polyline(latlngs, {
      color: "#060708",
      weight: 7,
      opacity: 0.55,
      lineCap: "round",
    }).addTo(group);
    L.polyline(latlngs, {
      color: "#E08A6A",
      weight: 2.5,
      opacity: 0.96,
      lineCap: "round",
    }).addTo(group);

    markersRef.current.clear();
    for (const stop of route.stops) {
      const icon = L.divIcon({
        className: "atlas-marker-wrap",
        html: `<span class="atlas-marker"><i>${stop.index + 1}</i><b>${stop.waypoint.name}</b></span>`,
        iconSize: [0, 0],
        iconAnchor: [10, 10],
      });
      const marker = L.marker([stop.waypoint.lat, stop.waypoint.lon], {
        icon,
        keyboard: true,
        title: stop.waypoint.name,
      }).addTo(group);
      marker.on("click", () => {
        setSelectedId(stop.waypoint.id);
        map.flyTo([stop.waypoint.lat, stop.waypoint.lon], Math.max(map.getZoom(), 15), {
          duration: 0.7,
        });
      });
      markersRef.current.set(stop.waypoint.id, marker);
    }

    const routeBounds = L.latLngBounds(
      route.points.map((p) => [p.lat, p.lon] as [number, number]),
    );
    map.fitBounds(routeBounds, { padding: [90, 90], maxZoom: 15 });
    map.invalidateSize();

    return () => {
      group.remove();
      markersRef.current.clear();
    };
  }, [route]);

  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      marker.getElement()?.querySelector(".atlas-marker")?.classList.toggle("active", id === selectedId);
    }
  }, [selectedId, route]);

  useEffect(() => {
    hillshadeRef.current?.setOpacity(layers.hillshade ? 0.5 : 0);
    slopeRef.current?.setOpacity(layers.slope ? 0.62 : 0);
    geologyRef.current?.setOpacity(layers.geology ? 0.32 : 0);
  }, [layers]);

  const selected = waypoints.find((w) => w.id === selectedId) ?? null;
  const objective = selected ? OBJECTIVES[selected.id] : null;
  const activeStop = route?.stops.find((s) => s.waypoint.id === selectedId) ?? null;

  const latest = weather?.latest;
  const weatherChip = latest
    ? `SOL ${latest.sol.toLocaleString()} · ${latest.minC}…${latest.maxC} °C · ${latest.opacity.toUpperCase()}`
    : "REMS · LOADING";

  return (
    <div className="atlas" role="dialog" aria-label="Hematite Ridge field atlas">
      <header className="atlas-bar">
        <button className="atlas-back" onClick={onClose} type="button">
          <span>←</span> Orbit
        </button>
        <div className="atlas-title">
          <span>GROUNDTRUTH / FIELD ATLAS</span>
          <b>Hematite Ridge</b>
        </div>
        <div className="atlas-site">GALE CRATER · AEOLIS MONS</div>
        <div className="atlas-chip">{weatherChip}</div>
        <div className="atlas-chip">EVA {MISSION.evaLimitHours.toFixed(0)} H · {MISSION.crew} CREW</div>
        <button
          className="atlas-walk"
          type="button"
          disabled={!route}
          onClick={() => setWalkOpen(true)}
        >
          Start walk
        </button>
      </header>

      <div className="atlas-grid">
        <aside className="atlas-left">
          <div className="atlas-panel-head">
            <span>Mission</span>
            <b>01</b>
          </div>
          <p className="atlas-brief">{MISSION.description}</p>

          <div className="atlas-kv">
            <div>
              <label>Base</label>
              <b>Murray Buttes</b>
            </div>
            <div>
              <label>Target</label>
              <b>Hematite Hotspot</b>
            </div>
            <div>
              <label>Round trip</label>
              <b>{route ? `${(route.distanceKm * 2).toFixed(1)} km` : "—"}</b>
            </div>
            <div>
              <label>Climb</label>
              <b>{route ? `+${Math.round(route.climbM)} m` : "—"}</b>
            </div>
          </div>

          <div className="atlas-panel-head" style={{ marginTop: 18 }}>
            <span>Layers</span>
          </div>
          <div className="atlas-layers">
            <label className="atlas-layer on">
              <input type="checkbox" checked readOnly />
              <i />
              <span>HiRISE optical<small>NASA/JPL · ~2.6 m/px</small></span>
            </label>
            <label className="atlas-layer">
              <input
                type="checkbox"
                checked={layers.hillshade}
                onChange={(e) => setLayers((l) => ({ ...l, hillshade: e.target.checked }))}
              />
              <i />
              <span>Hillshade<small>1 m DEM · 315°/35°</small></span>
            </label>
            <label className="atlas-layer">
              <input
                type="checkbox"
                checked={layers.slope}
                onChange={(e) => setLayers((l) => ({ ...l, slope: e.target.checked }))}
              />
              <i />
              <span>Slope<small>no-go &gt; 25°</small></span>
            </label>
            <label className="atlas-layer">
              <input
                type="checkbox"
                checked={layers.geology}
                onChange={(e) => setLayers((l) => ({ ...l, geology: e.target.checked }))}
              />
              <i />
              <span>USGS geology<small>SIM3292</small></span>
            </label>
          </div>

          <div className="atlas-panel-head" style={{ marginTop: 18 }}>
            <span>Route plan</span>
            <b>{routeMode}</b>
          </div>
          <div className="atlas-modes">
            {ROUTE_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={routeMode === mode.id ? "active" : ""}
                onClick={() => {
                  setRouteMode(mode.id);
                  if (!(mode.ids as readonly string[]).includes(selectedId)) {
                    setSelectedId(mode.ids[mode.ids.length - 1]);
                  }
                }}
              >
                <b>{mode.label}</b>
                <small>{mode.detail}</small>
              </button>
            ))}
          </div>

          <div className="atlas-panel-head" style={{ marginTop: 18 }}>
            <span>Traverse</span>
            <b>{route?.stops.length ?? 0} stops</b>
          </div>
          <ol className="atlas-stops">
            {(route?.stops ?? []).map((stop) => (
              <li key={stop.waypoint.id}>
                <button
                  className={selectedId === stop.waypoint.id ? "active" : ""}
                  onClick={() => {
                    setSelectedId(stop.waypoint.id);
                    mapRef.current?.flyTo(
                      [stop.waypoint.lat, stop.waypoint.lon],
                      Math.max(mapRef.current.getZoom(), 15),
                      { duration: 0.7 },
                    );
                  }}
                  type="button"
                >
                  <i>{stop.index + 1}</i>
                  <span>
                    <b>{stop.waypoint.name}</b>
                    <small>
                      {stop.legKm > 0 ? `${stop.legKm.toFixed(2)} km` : "START"} ·{" "}
                      {DWELL(stop.waypoint.id)} min
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="atlas-center">
          <div ref={mapEl} className="atlas-map" />
          <div className="atlas-map-top">
            <span className="atlas-scope">GALE CRATER · {GALE_BBOX[0]}°E–{GALE_BBOX[2]}°E</span>
            <span className="atlas-scope dim">HiRISE · 1 m DEM · REAL DATA</span>
          </div>
          {cursor && (
            <div className="atlas-cursor">
              {Math.abs(cursor.lat).toFixed(4)}°{cursor.lat >= 0 ? "N" : "S"} ·{" "}
              {Math.abs(cursor.lon).toFixed(4)}°{cursor.lon >= 0 ? "E" : "W"} ·{" "}
              {cursor.elev != null ? `${Math.round(cursor.elev).toLocaleString()} m` : "—"}
            </div>
          )}
          {loading && <div className="atlas-loading">LOADING FIELD DATA…</div>}
          {error && <div className="atlas-loading error">{error}</div>}
        </section>

        <aside className="atlas-right">
          {selected && (
            <div className="atlas-note">
              {selected.image ? (
                <img src={selected.image} alt={selected.caption || selected.name} />
              ) : (
                <div className="atlas-note-placeholder">NO SURFACE IMAGE</div>
              )}
              <div className="atlas-note-body">
                <div className="atlas-note-eyebrow">
                  {activeStop ? `STOP ${activeStop.index + 1}` : "WAYPOINT"} ·{" "}
                  {objective?.priority.toUpperCase()}
                </div>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
                {selected.caption && <small className="atlas-credit">{selected.caption}</small>}

                {objective && (
                  <div className="atlas-objective">
                    <span>SCIENCE OBJECTIVE</span>
                    <b>{objective.title}</b>
                    <p>{objective.detail}</p>
                    <div>
                      <em>{objective.dwellMin} min dwell</em>
                      <em>{objective.priority}</em>
                    </div>
                  </div>
                )}

                <button
                  className="atlas-center-btn"
                  type="button"
                  onClick={() => {
                    if (!mapRef.current || !selected) return;
                    mapRef.current.flyTo(
                      [selected.lat, selected.lon],
                      Math.max(mapRef.current.getZoom(), 15),
                      { duration: 0.7 },
                    );
                  }}
                >
                  Center on map
                </button>
              </div>
            </div>
          )}

          <Safety route={route} weather={latest ? `−71…−5 °C · SOL ${latest.sol}` : undefined} />
        </aside>
      </div>

      <footer className="atlas-bottom">
        <div className="atlas-profile">
          <div className="atlas-profile-head">
            <span>ELEVATION PROFILE · OUTBOUND</span>
            <b>{route ? `${route.distanceKm.toFixed(2)} km` : "—"}</b>
          </div>
          <Profile route={route} />
        </div>
        <div className="atlas-stats">
          <div>
            <label>Round trip</label>
            <b>{route ? `${(route.distanceKm * 2).toFixed(1)} km` : "—"}</b>
          </div>
          <div>
            <label>Walk time</label>
            <b>{route ? `${(route.walkHours * 2).toFixed(1)} h` : "—"}</b>
          </div>
          <div>
            <label>EVA total</label>
            <b>{route ? `${route.totalHours.toFixed(1)} h` : "—"}</b>
          </div>
          <div>
            <label>Max slope</label>
            <b>{route ? `${route.maxSlopeDeg.toFixed(1)}°` : "—"}</b>
          </div>
          <div>
            <label>Dose</label>
            <b>{route ? `${route.doseMsv.toFixed(2)} mSv` : "—"}</b>
          </div>
          <div>
            <label>Dwell</label>
            <b>{route ? `${Math.round(route.dwellHours * 60)} min` : "—"}</b>
          </div>
        </div>
      </footer>

      {walkOpen && route &&
        createPortal(
          <WalkMode route={route} onClose={() => setWalkOpen(false)} />,
          document.body,
        )}
    </div>
  );
}
