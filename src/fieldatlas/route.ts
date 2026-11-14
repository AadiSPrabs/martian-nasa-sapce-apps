import type { Dem } from "./dem";
import { sampleDem, slopeDem } from "./dem";
import { findPath, getNavGrid } from "./grid";
import { MISSION, OBJECTIVES, type WaypointData } from "./mission";

const MARS_RADIUS_M = 3_389_500;

export function haversineM(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type RoutePoint = {
  lon: number;
  lat: number;
  elev: number;
  distanceKm: number;
  slopeDeg: number;
};

export type RouteStop = {
  waypoint: WaypointData;
  index: number;
  distanceKm: number;
  legKm: number;
  bearingDeg: number;
  elev: number;
  slopeDeg: number;
  dwellMin: number;
};

export type SuitLoad = "light" | "standard" | "heavy";

const SUIT_FACTOR: Record<SuitLoad, number> = {
  light: 0.7,
  standard: 0.6,
  heavy: 0.45,
};

export type RouteOptions = {
  suit?: SuitLoad;
  solarEvent?: boolean;
};

export type RouteResult = {
  points: RoutePoint[];
  stops: RouteStop[];
  distanceKm: number;
  returnKm: number;
  climbM: number;
  maxSlopeDeg: number;
  walkHours: number;
  restHours: number;
  dwellHours: number;
  totalHours: number;
  returnHours: number;
  doseMsv: number;
  turnBackKm: number;
  turnBackPoint: RoutePoint | null;
  feasible: boolean;
  warnings: string[];
};

function speedKmh(slopeDeg: number, suitFactor: number): number {
  const s = Math.tan((slopeDeg * Math.PI) / 180);
  const v = 5.04 * Math.exp(-3.5 * Math.abs(s + 0.05)) * suitFactor;
  return Math.min(3.0, Math.max(0.3, v));
}

function straightPath(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
) {
  const d = haversineM(a, b);
  const steps = Math.max(2, Math.ceil(d / 20));
  const path: Array<{ lon: number; lat: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    path.push({ lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t });
  }
  return path;
}

export function buildRoute(
  waypoints: WaypointData[],
  dem: Dem,
  options: RouteOptions = {},
): RouteResult | null {
  const suitFactor = SUIT_FACTOR[options.suit ?? "standard"];
  const solarFactor = options.solarEvent ? 3 : 1;
  const stops = waypoints
    .map((w) => ({ w, o: OBJECTIVES[w.id] }))
    .filter((x) => x.o);
  if (stops.length < 2) return null;

  const grid = getNavGrid(dem);
  const points: RoutePoint[] = [];
  const routeStops: RouteStop[] = [];
  let cumulativeKm = 0;
  let climbM = 0;
  let maxSlopeDeg = 0;

  for (let s = 0; s < stops.length; s++) {
    const { w } = stops[s];
    const prev = points[points.length - 1];
    const elev = sampleDem(dem, w.lon, w.lat) ?? 0;
    const slope = slopeDem(dem, w.lon, w.lat);
    const bearing = prev
      ? bearingDeg(
          { lon: prev.lon, lat: prev.lat },
          { lon: w.lon, lat: w.lat },
        )
      : 0;

    const stop: RouteStop = {
      waypoint: w,
      index: s,
      distanceKm: 0,
      legKm: 0,
      bearingDeg: bearing,
      elev,
      slopeDeg: slope,
      dwellMin: OBJECTIVES[w.id].dwellMin,
    };
    routeStops.push(stop);

    if (s > 0 && prev) {
      const routed = findPath(
        grid,
        { lon: prev.lon, lat: prev.lat },
        { lon: w.lon, lat: w.lat },
      );
      const leg =
        routed && routed.length > 1
          ? [
              { lon: prev.lon, lat: prev.lat },
              ...routed.slice(1),
              { lon: w.lon, lat: w.lat },
            ]
          : straightPath(prev, w);

      let legM = 0;
      let lastElev = prev.elev;
      for (let i = 1; i < leg.length; i++) {
        const a = leg[i - 1];
        const b = leg[i];
        legM += haversineM(a, b);
        const pointElev = sampleDem(dem, b.lon, b.lat) ?? 0;
        const pointSlope = slopeDem(dem, b.lon, b.lat);
        if (pointElev > lastElev) climbM += pointElev - lastElev;
        lastElev = pointElev;
        maxSlopeDeg = Math.max(maxSlopeDeg, pointSlope);
        points.push({
          lon: b.lon,
          lat: b.lat,
          elev: pointElev,
          distanceKm: 0,
          slopeDeg: pointSlope,
        });
      }

      stop.legKm = legM / 1000;
      cumulativeKm += stop.legKm;
      stop.distanceKm = cumulativeKm;
    } else {
      points.push({
        lon: w.lon,
        lat: w.lat,
        elev,
        distanceKm: 0,
        slopeDeg: slope,
      });
    }
  }

  // Recompute cumulative distances from the sampled points, not the increments.
  const first = points[0];
  for (const p of points) {
    p.distanceKm = haversineM(
      { lon: first.lon, lat: first.lat },
      { lon: p.lon, lat: p.lat },
    ) / 1000;
  }

  let walkHours = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dKm = haversineM(a, b) / 1000;
    walkHours += dKm / speedKmh((a.slopeDeg + b.slopeDeg) / 2, suitFactor);
  }

  const returnHours = walkHours;
  const restHours = (walkHours + returnHours) / 6;
  const dwellHours =
    stops.reduce((sum, s) => sum + (OBJECTIVES[s.w.id]?.dwellMin ?? 0), 0) / 60;
  const totalHours = walkHours + returnHours + restHours + dwellHours;
  const doseMsv = totalHours * 0.026 * solarFactor;

  // Turn-back: the farthest point from which a return still fits the EVA clock.
  let turnBackPoint: RoutePoint | null = points[0] ?? null;
  let turnBackKm = 0;
  let walkTo = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dKm = haversineM(a, b) / 1000;
    walkTo += dKm / speedKmh((a.slopeDeg + b.slopeDeg) / 2, suitFactor);
    const dwellBefore =
      routeStops
        .filter((s) => s.index > 0 && s.distanceKm <= b.distanceKm)
        .reduce((sum, s) => sum + s.dwellMin, 0) / 60;
    const roundTrip = 2 * walkTo + (2 * walkTo) / 6 + dwellBefore;
    if (roundTrip <= MISSION.evaLimitHours) {
      turnBackPoint = b;
      turnBackKm = b.distanceKm;
    }
  }

  const warnings: string[] = [];
  if (totalHours > MISSION.evaLimitHours) {
    warnings.push(
      `Exceeds the ${MISSION.evaLimitHours} h EVA window by ${(
        totalHours - MISSION.evaLimitHours
      ).toFixed(1)} h.`,
    );
  }
  if (doseMsv > MISSION.doseLimitMsv) {
    warnings.push(
      `Dose ${doseMsv.toFixed(2)} mSv exceeds the ${MISSION.doseLimitMsv} mSv mission rule.`,
    );
  }
  if (maxSlopeDeg > 25) {
    warnings.push(`A ${maxSlopeDeg.toFixed(1)}° slope exceeds the suit no-go limit.`);
  }

  return {
    points,
    stops: routeStops,
    distanceKm: cumulativeKm,
    returnKm: cumulativeKm,
    climbM,
    maxSlopeDeg,
    walkHours,
    restHours,
    dwellHours,
    totalHours,
    returnHours,
    doseMsv,
    turnBackKm,
    turnBackPoint,
    feasible: warnings.length === 0,
    warnings,
  };
}
