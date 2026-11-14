import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Flag, RotateCcw } from "lucide-react";

import { OBJECTIVES } from "./mission";
import type { RouteResult } from "./route";

type WalkModeProps = {
  route: RouteResult;
  onClose: () => void;
};

function clock(hours: number) {
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function WalkMode({ route, onClose }: WalkModeProps) {
  const [leg, setLeg] = useState(0);
  const [samples, setSamples] = useState(0);

  const stops = route.stops;
  const current = stops[leg];
  const next = stops[Math.min(leg + 1, stops.length - 1)];
  const isLast = leg >= stops.length - 1;

  const { legHours, elapsedHours, dose, finish } = useMemo(() => {
    const totalKm = Math.max(0.001, route.distanceKm);
    const avgHoursPerKm = route.walkHours / totalKm;
    const hours = Math.max(0.02, next.legKm * avgHoursPerKm);
    let elapsed = 0;
    for (let i = 1; i <= leg; i++) {
      elapsed += stops[i].legKm * avgHoursPerKm;
      elapsed += (stops[i].dwellMin ?? 0) / 60;
    }
    return {
      legHours: hours,
      elapsedHours: elapsed,
      dose: elapsed * 0.026,
      finish: route.totalHours,
    };
  }, [leg, next, route, stops]);

  const image = next.waypoint.image;
  const nextObjective = OBJECTIVES[next.waypoint.id];

  return (
    <div className="walk" role="dialog" aria-label="Field walk mode">
      <header className="walk-bar">
        <button className="walk-exit" onClick={onClose} type="button">
          <ArrowLeft size={15} strokeWidth={1.8} />
          Field atlas
        </button>
        <div className="walk-title">
          <span>FIELD MODE · EVA 01</span>
          <b>Hematite Ridge</b>
        </div>
        <div className="walk-chip">LEG {Math.min(leg + 1, stops.length - 1)} / {stops.length - 1}</div>
        <div className="walk-chip">EVA {clock(elapsedHours)} / {clock(finish)}</div>
        <div className="walk-chip">DOSE {dose.toFixed(2)} mSv</div>
      </header>

      <div className="walk-main">
        <div
          className="walk-pov"
          style={
            image
              ? { backgroundImage: `url(${image})` }
              : { background: "radial-gradient(circle at 50% 40%, #2a1a14, #050607 70%)" }
          }
        >
          <div className="walk-pov-shade" />
          <div className="walk-pov-caption">
            {next.waypoint.caption || "Surface view · NASA/JPL-Caltech"}
          </div>
        </div>

        <div className="walk-panel">
          <div className="walk-kicker">
            {isLast ? "TARGET" : "NEXT STOP"} · {next.waypoint.role.toUpperCase()}
          </div>
          <h1>{next.waypoint.name}</h1>

          <div className="walk-metrics">
            <div>
              <label>Distance</label>
              <b>{next.legKm.toFixed(2)} km</b>
            </div>
            <div>
              <label>Bearing</label>
              <b>{Math.round(next.bearingDeg)}°</b>
            </div>
            <div>
              <label>Leg time</label>
              <b>{clock(legHours)} h</b>
            </div>
            <div>
              <label>Max slope</label>
              <b>{next.slopeDeg.toFixed(1)}°</b>
            </div>
          </div>

          <div className="walk-bearing">
            <span className="walk-arrow" style={{ transform: `rotate(${next.bearingDeg}deg)` }}>
              ▲
            </span>
            <div>
              <b>HEAD {Math.round(next.bearingDeg)}°</b>
              <small>Hold bearing to {next.waypoint.name}</small>
            </div>
          </div>

          <p className="walk-desc">{next.waypoint.description}</p>

          {next.dwellMin > 0 && (
            <div className="walk-task">
              <Flag size={13} strokeWidth={1.8} />
              <span>
                Science stop · {next.dwellMin} min dwell · {nextObjective?.priority ?? "Should"}
              </span>
            </div>
          )}

          <div className="walk-actions">
            <button
              type="button"
              className="walk-secondary"
              disabled={leg === 0}
              onClick={() => setLeg((v) => Math.max(0, v - 1))}
            >
              <ArrowLeft size={14} /> Previous
            </button>
            <button
              type="button"
              className="walk-primary"
              disabled={isLast}
              onClick={() => setLeg((v) => Math.min(stops.length - 1, v + 1))}
            >
              {isLast ? "Arrived" : "Next leg"} <ArrowRight size={14} />
            </button>
          </div>

          <div className="walk-footer">
            <button type="button" className="walk-log" onClick={() => setSamples((s) => s + 1)}>
              + Log sample
            </button>
            <span>{samples} sample{samples === 1 ? "" : "s"} logged</span>
            <button type="button" className="walk-return" onClick={onClose}>
              <RotateCcw size={13} /> Return to rover
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
