import { AlertTriangle } from "lucide-react";

import { MISSION } from "./mission";
import type { RouteResult } from "./route";

function pct(value: number, limit: number) {
  return Math.min(100, (value / limit) * 100);
}

export function Safety({
  route,
  weather,
  solarEvent,
}: {
  route: RouteResult | null;
  weather?: string;
  solarEvent?: boolean;
}) {
  if (!route) return null;

  const timePct = pct(route.totalHours, MISSION.evaLimitHours);
  const dosePct = pct(route.doseMsv, MISSION.doseLimitMsv);
  const slopePct = pct(route.maxSlopeDeg, 25);

  return (
    <div className="safety">
      <div className="safety-head">
        <span>Safety envelope</span>
        <b className={route.feasible ? "ok" : "bad"}>
          {route.feasible ? "WITHIN LIMITS" : "ACTION REQUIRED"}
        </b>
      </div>

      <div className="safety-row">
        <label>EVA clock</label>
        <b>
          {route.totalHours.toFixed(1)} / {MISSION.evaLimitHours.toFixed(0)} h
        </b>
        <i style={{ width: `${timePct}%` }} className={timePct > 90 ? "hot" : ""} />
      </div>
      <div className="safety-row">
        <label>Radiation</label>
        <b>
          {route.doseMsv.toFixed(2)} / {MISSION.doseLimitMsv.toFixed(2)} mSv
        </b>
        <i style={{ width: `${dosePct}%` }} className={dosePct > 90 ? "hot" : ""} />
      </div>
      <div className="safety-row">
        <label>Max slope</label>
        <b>{route.maxSlopeDeg.toFixed(1)}° / 25°</b>
        <i style={{ width: `${slopePct}%` }} className={slopePct > 90 ? "hot" : ""} />
      </div>

      <div className="safety-turn">
        <span>TURN-BACK</span>
        <b>{route.turnBackKm.toFixed(2)} km</b>
      </div>

      <div className="thermal">
        <span>{solarEvent ? "SOLAR EVENT ×3" : "THERMAL"}</span>
        <b>{weather ?? "−71…−5 °C · 09:00–16:00 LMST"}</b>
      </div>

      {route.warnings.length > 0 && (
        <ul className="warnings">
          {route.warnings.map((w) => (
            <li key={w}>
              <AlertTriangle size={12} strokeWidth={1.8} />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
