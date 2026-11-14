import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as L from "leaflet";
import { Database } from "lucide-react";

import { getMarsSun } from "../globe/mars24";
import { GALE_BBOX, MISSION, OBJECTIVES, ROUTE_MODES, type WaypointData } from "./mission";
import { loadDem, sampleDem, type Dem } from "./dem";
import { buildRoute, type RouteResult, type SuitLoad } from "./route";
import { DataPanel } from "./DataPanel";
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
  const [planStops, setPlanStops] = useState<WaypointData[] | null>(null);
  const [planName, setPlanName] = useState("Full science");
  const [pickMode, setPickMode] = useState<"start" | "stop" | "target" | null>(null);
  const pinCounter = useRef(0);
  const [suitLoad, setSuitLoad] = useState<SuitLoad>("standard");
  const [solarEvent, setSolarEvent] = useState(false);
  const [selectedId, setSelectedId] = useState("vera_rubin_ridge");
  const [walkOpen, setWalkOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
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
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
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
    map.setZoom(Math.min(13, map.getZoom() + 0.5), { animate: false });
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
    if (import.meta.env.DEV) {
      (window as unknown as { __atlasMap?: L.Map }).__atlasMap = map;
    }
    window.setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [18, 18] });
      map.setZoom(Math.min(13, map.getZoom() + 0.5), { animate: false });
    }, 220);

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
    if (!waypoints.length || planStops !== null) return;
    const mode = ROUTE_MODES[0];
    const initial = mode.ids
      .map((id) => waypoints.find((w) => w.id === id))
      .filter((w): w is WaypointData => Boolean(w));
    setPlanStops(initial);
    setPlanName(mode.label);
  }, [waypoints, planStops]);

  useEffect(() => {
    if (!dem || !planStops || planStops.length < 2) {
      setRoute(null);
      return;
    }
    setRoute(buildRoute(planStops, dem, { suit: suitLoad, solarEvent }));
  }, [dem, planStops, suitLoad, solarEvent]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (event: L.LeafletMouseEvent) => {
      if (!pickMode) return;
      const lat = Math.min(
        GALE_BBOX[3] - 0.002,
        Math.max(GALE_BBOX[1] + 0.002, event.latlng.lat),
      );
      const lon = Math.min(
        GALE_BBOX[2] - 0.002,
        Math.max(GALE_BBOX[0] + 0.002, event.latlng.lng),
      );
      const n = ++pinCounter.current;
      const pin: WaypointData = {
        id: `pin-${Date.now()}-${n}`,
        name: `Pin ${n}`,
        role: pickMode === "start" ? "start" : pickMode === "target" ? "target" : "science",
        lon,
        lat,
        description:
          "Field-dropped stop. No catalog POV; plan from the DEM and HiRISE context.",
        caption: "",
        image: null,
        source: "Field pin",
      };
      setPlanStops((prev) => {
        const base = prev ?? [];
        if (pickMode === "start") {
          return base.length ? [pin, ...base.slice(1)] : [pin];
        }
        if (pickMode === "target") {
          return base.length ? [...base.slice(0, -1), pin] : [pin];
        }
        if (base.length >= 2) {
          return [...base.slice(0, -1), pin, base[base.length - 1]];
        }
        return [...base, pin];
      });
      setPlanName("Custom traverse");
      setSelectedId(pin.id);
      setPickMode(null);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [pickMode]);

  useEffect(() => {
    const container = mapRef.current?.getContainer();
    if (!container) return;
    container.classList.toggle("picking", Boolean(pickMode));
  }, [pickMode]);

  useEffect(() => {
    if (!pickMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickMode]);

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

    if (route.turnBackPoint) {
      const tb = route.turnBackPoint;
      L.marker([tb.lat, tb.lon], {
        interactive: false,
        icon: L.divIcon({
          className: "atlas-turnback-wrap",
          html: `<span class="atlas-turnback"><b>TURN-BACK</b><small>${route.turnBackKm.toFixed(
            2,
          )} km</small></span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      }).addTo(group);
    }

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
  const customSelected = selected
    ? null
    : (planStops?.find((w) => w.id === selectedId) ?? null);
  const objective = selected ? OBJECTIVES[selected.id] : null;
  const activeStop = route?.stops.find((s) => s.waypoint.id === selectedId) ?? null;

  const candidates = waypoints.filter(
    (w) => !planStops?.some((stop) => stop.id === w.id),
  );

  const applyPreset = (mode: (typeof ROUTE_MODES)[number]) => {
    const stops = mode.ids
      .map((id) => waypoints.find((w) => w.id === id))
      .filter((w): w is WaypointData => Boolean(w));
    setPlanStops(stops);
    setPlanName(mode.label);
    if (!stops.some((stop) => stop.id === selectedId)) {
      const last = stops[stops.length - 1];
      if (last) setSelectedId(last.id);
    }
  };

  const addStop = (waypoint: WaypointData) => {
    setPlanStops((prev) => {
      const base = prev ?? [];
      if (base.some((stop) => stop.id === waypoint.id)) return base;
      if (base.length >= 2) {
        return [...base.slice(0, -1), waypoint, base[base.length - 1]];
      }
      return [...base, waypoint];
    });
    setPlanName("Custom traverse");
    setSelectedId(waypoint.id);
  };

  const removeStop = (index: number) => {
    if (!planStops) return;
    const next = planStops.filter((_, i) => i !== index);
    setPlanStops(next);
    if (!next.some((stop) => stop.id === selectedId)) {
      const last = next[next.length - 1];
      if (last) setSelectedId(last.id);
    }
    setPlanName("Custom traverse");
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    setPlanStops((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setPlanName("Custom traverse");
  };

  const fitRoute = () => {
    if (!mapRef.current || !route) return;
    const bounds = L.latLngBounds(
      route.points.map((p) => [p.lat, p.lon] as [number, number]),
    );
    mapRef.current.fitBounds(bounds, { padding: [70, 70], maxZoom: 15 });
    mapRef.current.invalidateSize();
  };

  const exportBrief = () => {
    if (!route) return;
    const sun = getMarsSun();
    const lines = [
      "GROUNDTRUTH — GALE CRATER EVA BRIEF",
      `Site: ${MISSION.site}`,
      `Generated: ${new Date().toISOString()}`,
      `Sun: subsolar ${sun.lonEast.toFixed(1)}°E, ${sun.lat.toFixed(1)}°N; Ls ${sun.ls.toFixed(1)}°`,
      `Suit load: ${suitLoad}; space weather: ${solarEvent ? "solar event ×3" : "nominal"}`,
      "",
      "TRAVERSE",
      ...route.stops.map(
        (stop) =>
          `${stop.index + 1}. ${stop.waypoint.name} — ${stop.distanceKm.toFixed(
            2,
          )} km cumulative · ${stop.dwellMin} min dwell · ${stop.elev.toFixed(0)} m`,
      ),
      "",
      `One-way ${route.distanceKm.toFixed(2)} km; round trip ${(
        route.distanceKm * 2
      ).toFixed(2)} km`,
      `EVA clock ${route.totalHours.toFixed(1)} h / ${MISSION.evaLimitHours} h; dose ${route.doseMsv.toFixed(
        2,
      )} mSv / ${MISSION.doseLimitMsv} mSv`,
      `Max slope ${route.maxSlopeDeg.toFixed(1)}°; turn-back ${route.turnBackKm.toFixed(2)} km`,
      `Status: ${route.feasible ? "WITHIN LIMITS" : "ACTION REQUIRED"}`,
      ...route.warnings.map((warning) => `! ${warning}`),
      "",
      "Sources: NASA/JPL Mars Trek HiRISE + DEM; USGS SIM3292; MSL REMS; MSL RAD baseline.",
      "Planning model: A* on a ~24 m grid; 25° slope no-go; Tobler-style suit speed.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "groundtruth-gale-eva-brief.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

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
        <div className="atlas-chip">EVA {MISSION.evaLimitHours.toFixed(0)} H · {MISSION.crew} CREW · {MISSION.suitPairs} SUIT PAIRS</div>
        <div className={`atlas-chip ${solarEvent ? "alert" : ""}`}>
          {solarEvent ? "SOLAR PARTICLE EVENT" : "SPACE WEATHER NOMINAL"}
        </div>
        <button className="atlas-data" type="button" onClick={() => setDataOpen(true)}>
          <Database size={13} strokeWidth={1.7} />
          Data
        </button>
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
            <b>{planName}</b>
          </div>
          <div className="atlas-modes">
            {ROUTE_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={planName === mode.label ? "active" : ""}
                onClick={() => applyPreset(mode)}
              >
                <b>{mode.label}</b>
                <small>{mode.detail}</small>
              </button>
            ))}
          </div>

          <div className="atlas-plan-actions">
            <button
              type="button"
              className={pickMode === "start" ? "active" : ""}
              onClick={() => setPickMode(pickMode === "start" ? null : "start")}
            >
              Start on map
            </button>
            <button
              type="button"
              className={pickMode === "stop" ? "active" : ""}
              onClick={() => setPickMode(pickMode === "stop" ? null : "stop")}
            >
              Drop a pin
            </button>
            <button
              type="button"
              className={pickMode === "target" ? "active" : ""}
              onClick={() => setPickMode(pickMode === "target" ? null : "target")}
            >
              Target on map
            </button>
            <button type="button" onClick={() => applyPreset(ROUTE_MODES[0])}>
              Reset
            </button>
            <button type="button" onClick={fitRoute} disabled={!route}>
              Fit route
            </button>
            <button type="button" onClick={exportBrief} disabled={!route}>
              Export brief
            </button>
          </div>

          <p className="atlas-plan-hint">
            Set a start and target, add catalog stops or drop pins, then reorder as needed.
            Every edit re-runs A* against the DEM and the safety envelope.
          </p>

          <details className="atlas-add">
            <summary>Add a catalog stop</summary>
            <div className="atlas-candidates">
              {candidates.length === 0 && <span>All catalog stops are already in the plan.</span>}
              {candidates.map((waypoint) => (
                <button key={waypoint.id} type="button" onClick={() => addStop(waypoint)}>
                  <b>{waypoint.name}</b>
                  <small>
                    {OBJECTIVES[waypoint.id]?.priority ?? "Context"} ·{" "}
                    {OBJECTIVES[waypoint.id]?.dwellMin ?? 0} min
                  </small>
                </button>
              ))}
            </div>
          </details>

          {planName === "Rover relay" && (
            <div className="atlas-note-small">
              Rover repositions to Bagnold South before the EVA. The drive is outside the
              suit clock; the rover carries tools and sample caching.
            </div>
          )}

          <div className="atlas-panel-head" style={{ marginTop: 16 }}>
            <span>Suit load</span>
          </div>
          <div className="atlas-segmented">
            {(["light", "standard", "heavy"] as SuitLoad[]).map((suit) => (
              <button
                key={suit}
                type="button"
                className={suitLoad === suit ? "active" : ""}
                onClick={() => setSuitLoad(suit)}
              >
                {suit}
              </button>
            ))}
          </div>

          <div className="atlas-panel-head" style={{ marginTop: 16 }}>
            <span>Space weather</span>
          </div>
          <div className="atlas-segmented two">
            <button
              type="button"
              className={!solarEvent ? "active" : ""}
              onClick={() => setSolarEvent(false)}
            >
              Nominal
            </button>
            <button
              type="button"
              className={solarEvent ? "active danger" : ""}
              onClick={() => setSolarEvent(true)}
            >
              Solar event
            </button>
          </div>

          <div className="atlas-panel-head" style={{ marginTop: 18 }}>
            <span>Traverse</span>
            <b>{planStops?.length ?? 0} stops</b>
          </div>
          <ol className="atlas-stops">
            {(planStops ?? []).map((waypoint, index) => {
              const stop = route?.stops.find((s) => s.waypoint.id === waypoint.id);
              const last = (planStops?.length ?? 1) - 1;
              const role =
                index === 0 ? "START" : index === last ? "TARGET" : `STOP ${index}`;
              return (
                <li key={waypoint.id}>
                  <button
                    className={`atlas-stop-main ${
                      selectedId === waypoint.id ? "active" : ""
                    }`}
                    onClick={() => {
                      setSelectedId(waypoint.id);
                      mapRef.current?.flyTo(
                        [waypoint.lat, waypoint.lon],
                        Math.max(mapRef.current.getZoom(), 15),
                        { duration: 0.7 },
                      );
                    }}
                    type="button"
                  >
                    <i>{index + 1}</i>
                    <span>
                      <b>{waypoint.name}</b>
                      <small>
                        {role} ·{" "}
                        {stop && stop.legKm > 0 ? `${stop.legKm.toFixed(2)} km · ` : ""}
                        {stop?.dwellMin ?? 0} min
                      </small>
                    </span>
                  </button>
                  <div className="atlas-stop-tools">
                    <button
                      type="button"
                      aria-label={`Move ${waypoint.name} up`}
                      disabled={index === 0}
                      onClick={() => moveStop(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${waypoint.name} down`}
                      disabled={index === last}
                      onClick={() => moveStop(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${waypoint.name}`}
                      onClick={() => removeStop(index)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          {planStops && planStops.length < 2 && (
            <div className="atlas-note-small">
              Add a second point to compute a route. Use Drop a pin or Add a catalog stop.
            </div>
          )}

          {route && (
            <div className="atlas-science">
              <span>SCIENCE RETURN</span>
              <b>
                {route.stops.filter((s) => OBJECTIVES[s.waypoint.id]?.priority === "Must").length}{" "}
                Must ·{" "}
                {route.stops.filter((s) => OBJECTIVES[s.waypoint.id]?.priority === "Should").length}{" "}
                Should
              </b>
            </div>
          )}
        </aside>

        <section className="atlas-center">
          <div ref={mapEl} className="atlas-map" />
          <div className="atlas-map-top">
            <span className="atlas-scope">GALE CRATER · {GALE_BBOX[0]}°E–{GALE_BBOX[2]}°E</span>
            <span className="atlas-scope dim">HiRISE · 1 m DEM · REAL DATA</span>
          </div>
          {pickMode && (
            <div className="atlas-pick-hint">
              CLICK THE MAP TO SET {pickMode === "stop" ? "A PIN" : pickMode.toUpperCase()} · ESC
              TO CANCEL
            </div>
          )}
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
          {customSelected && (
            <div className="atlas-note">
              <div className="atlas-note-placeholder">FIELD PIN</div>
              <div className="atlas-note-body">
                <div className="atlas-note-eyebrow">CUSTOM STOP · NO CATALOG OBJECTIVE</div>
                <h2>{customSelected.name}</h2>
                <p>{customSelected.description}</p>
                <small className="atlas-credit">
                  {Math.abs(customSelected.lat).toFixed(4)}°S ·{" "}
                  {customSelected.lon.toFixed(4)}°E · sampled from the 1 m DEM
                </small>
                <button
                  className="atlas-center-btn"
                  type="button"
                  onClick={() => {
                    mapRef.current?.flyTo(
                      [customSelected.lat, customSelected.lon],
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

          <Safety route={route} weather={latest ? `−71…−5 °C · SOL ${latest.sol}` : undefined} solarEvent={solarEvent} />
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

      {dataOpen &&
        createPortal(
          <DataPanel
            route={route}
            suitLoad={suitLoad}
            solarEvent={solarEvent}
            onClose={() => setDataOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}
