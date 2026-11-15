import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, Crosshair, Mountain, X } from "lucide-react";

import { sampleDem } from "../fieldatlas/dem";
import {
  hasTool,
  getLoadoutTotals,
  LOADOUT_ITEMS,
  DEFAULT_LOADOUT,
  type Loadout,
} from "./loadout";
import {
  planRoverRoutes,
  type RoverRoute,
  type RouteProfile,
} from "./rover";
import { buildTargets, type Target } from "./targets";
import { fetchSiteTerrain, type Site, type SiteTerrain } from "./terrain";
import "./traverse.css";

type TraverseModeProps = {
  site: Site;
  onClose: () => void;
  onChangeSite: () => void;
};

type Phase = "plan" | "run" | "debrief";

export function TraverseMode({ site, onClose, onChangeSite }: TraverseModeProps) {
  const [terrain, setTerrain] = useState<SiteTerrain | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [loadout, setLoadout] = useState<Loadout>(DEFAULT_LOADOUT);
  const [solarEvent, setSolarEvent] = useState(false);
  const [routes, setRoutes] = useState<RoverRoute[]>([]);
  const [routeId, setRouteId] = useState<RouteProfile>("fastest");
  const [phase, setPhase] = useState<Phase>("plan");
  const [stepIndex, setStepIndex] = useState(0);
  const [sampled, setSampled] = useState(false);
  const [pickTarget, setPickTarget] = useState(false);
  const pickTargetRef = useRef(pickTarget);
  pickTargetRef.current = pickTarget;

  useEffect(() => {
    if (!pickTarget) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickTarget(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickTarget]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPhase("plan");
    setTargets([]);
    setTargetId(null);
    setSampled(false);
    setStepIndex(0);
    fetchSiteTerrain(site)
      .then(async (siteTerrain) => {
        if (cancelled) return;
        setTerrain(siteTerrain);
        const nextTargets = await buildTargets(siteTerrain, site);
        if (cancelled) return;
        setTargets(nextTargets);
        setTargetId(nextTargets[0]?.id ?? null);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[traverse] terrain load failed", err);
        if (!cancelled) {
          setError("Could not load terrain for this site. Try a different point.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [site]);

  const totals = useMemo(() => getLoadoutTotals(loadout), [loadout]);
  const target = targets.find((item) => item.id === targetId) ?? targets[0] ?? null;
  const via = target ? (targets.find((item) => item.id !== target.id) ?? null) : null;
  const missingTool = target && !hasTool(loadout, target.tool);

  useEffect(() => {
    if (!terrain || !target) {
      setRoutes([]);
      return;
    }
    const next = planRoverRoutes(terrain.dem, site, target, via, totals, solarEvent);
    setRoutes(next);
    setRouteId((current) =>
      next.some((route) => route.id === current) ? current : (next[0]?.id ?? "fastest"),
    );
  }, [terrain, target, via, totals, site, solarEvent]);

  const route = routes.find((item) => item.id === routeId) ?? routes[0] ?? null;

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapEl.current || !terrain) return;
    const map = L.map(mapEl.current, {
      crs: L.CRS.EPSG4326,
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
    });
    L.imageOverlay(terrain.imageUrl, terrain.bounds, {
      className: "traverse-map-image",
      interactive: false,
    }).addTo(map);
    map.fitBounds(terrain.bounds, { padding: [20, 20] });
    mapRef.current = map;
    routeLayer.current = L.layerGroup().addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (!pickTargetRef.current) return;
      const elev = sampleDem(terrain.dem, event.latlng.lng, event.latlng.lat) ?? 0;
      const next: Target = {
        id: `destination-${Date.now()}`,
        name: `Destination ${Math.abs(event.latlng.lat).toFixed(2)}°${
          event.latlng.lat >= 0 ? "N" : "S"
        }`,
        lon: event.latlng.lng,
        lat: event.latlng.lat,
        elev,
        kind: "panorama",
        description:
          "Field-picked rover destination inside the local terrain window.",
        tool: "sample-bags",
        priority: "Must",
      };
      setTargets((current) => [...current, next]);
      setTargetId(next.id);
      setPickTarget(false);
    });
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(terrain.bounds, { padding: [20, 20] });
      map.setZoom(Math.min(13, map.getZoom() + 0.8), { animate: false });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      routeLayer.current = null;
    };
  }, [terrain]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayer.current;
    if (!map || !layer || !terrain) return;
    layer.clearLayers();
    L.marker([site.lat, site.lon], {
      interactive: false,
      icon: L.divIcon({
        className: "",
        html: `<span class="traverse-you"><i></i>YOU</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    }).addTo(layer);
    for (const item of targets) {
      L.marker([item.lat, item.lon], {
        icon: L.divIcon({
          className: "",
          html: `<span class="traverse-target ${
            item.id === target?.id ? "active" : ""
          }"><i></i>${item.name}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      })
        .on("click", () => setTargetId(item.id))
        .addTo(layer);
    }
    for (const option of routes) {
      L.polyline(
        option.points.map((point) => [point.lat, point.lon] as [number, number]),
        {
          color: option.id === route?.id ? "#E08A6A" : "#F4F1EA",
          weight: option.id === route?.id ? 3 : 1.2,
          opacity: option.id === route?.id ? 0.98 : 0.45,
          lineCap: "round",
        },
      ).addTo(layer);
    }
    if (route && route.points.length > 1) {
      const routeBounds = L.latLngBounds(
        route.points.map((point) => [point.lat, point.lon] as [number, number]),
      );
      map.fitBounds(routeBounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [terrain, targets, routes, route, site, target]);

  const activeStep = route?.stops[Math.min(stepIndex, route.stops.length - 1)] ?? null;
  const isFinal = route ? stepIndex >= route.stops.length - 1 : false;

  const finish = () => setPhase("debrief");

  return (
    <div className="traverse">
      <header className="traverse-bar">
        <button type="button" className="traverse-back" onClick={onClose}>
          <ArrowLeft size={14} strokeWidth={1.7} /> Orbit
        </button>
        <div className="traverse-title">
          <span>EVA / RECON ROVER</span>
          <h1>{site.name}</h1>
        </div>
        <div className={`traverse-grade ${terrain?.grade ?? "recon"}`}>
          {terrain?.gradeLabel ?? "LOADING TERRAIN"}
        </div>
        <div className="traverse-bar-right">
          <button type="button" onClick={onChangeSite}>
            Change site
          </button>
          <button type="button" onClick={onClose} aria-label="Close EVA">
            <X size={15} strokeWidth={1.7} />
          </button>
        </div>
      </header>

      <div className="traverse-body">
        <aside className="traverse-rail">
          {loading && <div className="traverse-loading">FETCHING MOLA 200 m TERRAIN…</div>}
          {error && <div className="traverse-error">{error}</div>}
          {!loading && !error && terrain && target && (
            <>
              <div className="traverse-site">
                <span>SITE</span>
                <b>
                  {Math.abs(site.lat).toFixed(2)}°{site.lat >= 0 ? "N" : "S"} ·{" "}
                  {Math.abs(site.lon).toFixed(2)}°{site.lon >= 0 ? "E" : "W"}
                </b>
                <small>{terrain.note}</small>
              </div>

              <div className="traverse-head">
                <span>OBJECTIVES</span>
                <div className="traverse-head-actions">
                  <b>{targets.length} generated</b>
                  <button
                    type="button"
                    className={pickTarget ? "active" : ""}
                    onClick={() => setPickTarget((value) => !value)}
                  >
                    {pickTarget ? "Cancel pick" : "Set destination"}
                  </button>
                </div>
              </div>
              <div className="traverse-targets">
                {targets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === target.id ? "active" : ""}
                    onClick={() => {
                      setTargetId(item.id);
                      setPhase("plan");
                      setStepIndex(0);
                    }}
                  >
                    <Mountain size={13} strokeWidth={1.6} />
                    <span>
                      <b>{item.name}</b>
                      <small>
                        {item.priority} · {Math.round(item.elev)} m
                        {item.tool ? ` · needs ${item.tool}` : ""}
                      </small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="traverse-head">
                <span>LOADOUT · {totals.massKg.toFixed(1)} KG</span>
                <button
                  type="button"
                  className={`traverse-solar ${solarEvent ? "active" : ""}`}
                  onClick={() => setSolarEvent((value) => !value)}
                >
                  {solarEvent ? "SOLAR EVENT ×3" : "NOMINAL RAD"}
                </button>
              </div>
              <div className="traverse-loadout">
                {LOADOUT_ITEMS.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={Boolean(loadout[item.id])}
                      onChange={(event) =>
                        setLoadout((current) => ({
                          ...current,
                          [item.id]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <b>{item.name}</b>
                      <small>
                        {item.massKg.toFixed(1)} kg · {item.detail}
                      </small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="traverse-head">
                <span>ROVER PLANS</span>
                <b>{routes.length}</b>
              </div>
              <div className="traverse-routes">
                {routes.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={option.id === route?.id ? "active" : ""}
                    onClick={() => setRouteId(option.id)}
                  >
                    <div>
                      <b>{option.label}</b>
                      <em className={`risk ${option.risk.toLowerCase()}`}>{option.risk}</em>
                    </div>
                    <small>{option.detail}</small>
                    <div className="traverse-route-stats">
                      <span>{option.distanceKm.toFixed(1)} km</span>
                      <span>{option.totalHours.toFixed(1)} h</span>
                      <span>{option.powerPct}% pwr</span>
                      <span>{option.maxSlope.toFixed(0)}°</span>
                    </div>
                  </button>
                ))}
              </div>

              {missingTool && (
                <div className="traverse-warning">
                  Pack the {target.tool} to complete “{target.name}”. The route still
                  works, but the sample will not.
                </div>
              )}
              {route && route.warnings.length > 0 && (
                <div className="traverse-warning">{route.warnings.join(" ")}</div>
              )}

              <button
                className="traverse-start"
                type="button"
                disabled={!route || !route.feasible || phase !== "plan"}
                onClick={() => {
                  setStepIndex(0);
                  setPhase("run");
                }}
              >
                <Crosshair size={15} strokeWidth={1.7} />
                Begin rover traverse
              </button>
            </>
          )}
        </aside>

        <section className="traverse-map-wrap">
          <div ref={mapEl} className="traverse-map" />
          {pickTarget && (
            <div className="traverse-pick-hint">
              CLICK THE LOCAL MAP TO SET A DESTINATION · ESC CANCELS
            </div>
          )}
          {phase === "run" && route && activeStep && (
            <div className="traverse-run">
              <div className="traverse-run-head">
                <span>
                  LEG {Math.min(stepIndex + 1, route.stops.length)} / {route.stops.length}
                </span>
                <b>{activeStep.name}</b>
              </div>
              <p>
                {isFinal
                  ? `Arrived at ${activeStep.name}. ${sampled ? "Sample logged." : "Take the sample."}`
                  : "Drive the planned line. Keep the power reserve above 20%."}
              </p>
              <div className="traverse-resources">
                <span>
                  POWER <b>{Math.max(8, route.powerPct - stepIndex * 9)}%</b>
                </span>
                <span>
                  DOSE <b>{route.doseMsv.toFixed(2)} mSv</b>
                </span>
                <span>
                  MASS <b>{totals.massKg.toFixed(1)} kg</b>
                </span>
              </div>
              <div className="traverse-run-actions">
                {!isFinal && (
                  <button type="button" onClick={() => setStepIndex((v) => v + 1)}>
                    Next leg
                  </button>
                )}
                {isFinal && !sampled && (
                  <button
                    type="button"
                    disabled={missingTool}
                    onClick={() => setSampled(true)}
                  >
                    {missingTool ? "Sample tool missing" : "Take sample"}
                  </button>
                )}
                {isFinal && sampled && (
                  <button type="button" onClick={finish}>
                    Finish EVA
                  </button>
                )}
                <button type="button" className="ghost" onClick={finish}>
                  Abort / return
                </button>
              </div>
            </div>
          )}

          {phase === "debrief" && route && terrain && (
            <div className="traverse-debrief">
              <span>FIELD LOG</span>
              <h2>{route.feasible && (!target.tool || sampled) ? "Mission complete" : "EVA closed"}</h2>
              <div className="traverse-debrief-grade">
                {route.feasible && (!target.tool || sampled) ? "A" : route.feasible ? "B" : "C"}
              </div>
              <p>
                {route.distanceKm.toFixed(1)} km · {route.totalHours.toFixed(1)} h ·{" "}
                {route.powerPct}% power · {sampled ? "1 sample" : "no sample"}
              </p>
              <small>
                {terrain.grade === "field"
                  ? "HiRISE field terrain. Real coordinates, modelled rover energy."
                  : "MOLA 200 m reconnaissance terrain. Regional route, not boulder-scale."}
              </small>
              <button type="button" onClick={onClose}>
                Return to orbit
              </button>
            </div>
          )}
        </section>
      </div>

      {route && terrain && (
        <footer className="traverse-foot">
          <span>
            {route.distanceKm.toFixed(1)} km · {route.totalHours.toFixed(1)} h
          </span>
          <span>{route.powerPct}% power</span>
          <span>{route.doseMsv.toFixed(2)} mSv</span>
          <span>turn-back {route.turnBackKm.toFixed(1)} km</span>
          <span>{terrain.dem.meta.source}</span>
        </footer>
      )}
    </div>
  );
}
