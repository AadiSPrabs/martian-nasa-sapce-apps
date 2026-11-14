import { X } from "lucide-react";

import { MISSION } from "./mission";
import type { RouteResult, SuitLoad } from "./route";

type DataPanelProps = {
  onClose: () => void;
  route: RouteResult | null;
  suitLoad: SuitLoad;
  solarEvent: boolean;
};

const LAYERS = [
  {
    layer: "HiRISE optical",
    type: "Optical",
    source: "MRO / HiRISE via Mars Trek",
    resolution: "~2.6 m/px export",
    status: "Measured",
  },
  {
    layer: "Gale DEM, slope, hillshade",
    type: "Topographic",
    source: "HiRISE stereo DEM via Mars Trek",
    resolution: "1 m source · 5.9 m grid",
    status: "Measured / derived",
  },
  {
    layer: "Geologic units",
    type: "Geologic",
    source: "USGS Astrogeology SIM3292",
    resolution: "regional map",
    status: "Measured",
  },
  {
    layer: "REMS weather",
    type: "Atmospheric",
    source: "MSL Curiosity / CAB",
    resolution: "point, latest sol",
    status: "Measured",
  },
  {
    layer: "Radiation budget",
    type: "Radiation",
    source: "MSL RAD surface baseline",
    resolution: "route model",
    status: "Modelled",
  },
  {
    layer: "EVA time and suit speed",
    type: "Mobility",
    source: "Tobler hiking function + suit factor",
    resolution: "route model",
    status: "Modelled",
  },
];

export function DataPanel({ onClose, route, suitLoad, solarEvent }: DataPanelProps) {
  return (
    <div className="data-modal" role="dialog" aria-label="Data and methods">
      <div className="data-sheet">
        <header className="data-head">
          <div>
            <span>GROUNDTRUTH / METHOD</span>
            <h2>Data &amp; methods</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close data panel">
            <X size={16} strokeWidth={1.7} />
          </button>
        </header>

        <div className="data-body">
          <p className="data-lede">
            A hyperlocal traverse at Gale Crater: four measured data families plus
            explicitly modelled mobility, thermal, and radiation layers.
          </p>

          <table className="data-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Type</th>
                <th>Source</th>
                <th>Resolution</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {LAYERS.map((row) => (
                <tr key={row.layer}>
                  <td>{row.layer}</td>
                  <td>{row.type}</td>
                  <td>{row.source}</td>
                  <td>{row.resolution}</td>
                  <td>
                    <span
                      className={`data-status ${
                        row.status.startsWith("Measured") ? "measured" : "modelled"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="data-columns">
            <div>
              <h3>Safety model</h3>
              <ul>
                <li>EVA clock: {MISSION.evaLimitHours} h; rest 10 min per walking hour.</li>
                <li>Radiation: 0.026 mSv/h from the MSL RAD surface baseline; solar event ×3.</li>
                <li>Terrain: A* cost rises above 10°; 25° is a hard no-go.</li>
                <li>Suit load: {suitLoad}; factor {suitLoad === "light" ? "0.70" : suitLoad === "heavy" ? "0.45" : "0.60"} of the walking model.</li>
                <li>Thermal: REMS −71…−5 °C; preferred window 09:00–16:00 LMST.</li>
                <li>Turn-back: computed from the farthest point with a feasible return.</li>
              </ul>
            </div>
            <div>
              <h3>Brief alignment</h3>
              <ul>
                <li>A map tool for a human surface EVA, not a global atlas alone.</li>
                <li>Four measured data types: optical, topographic, geologic, atmospheric.</li>
                <li>Radiation, space weather, suit mobility, thermal limits, and turn-back.</li>
                <li>Route avoids &gt;25° terrain and reports slope along the way.</li>
                <li>POV imagery and science objectives at each stop.</li>
                <li>Rover relay mode: the rover repositions to carry tools and samples.</li>
              </ul>
            </div>
          </div>

          <h3>Current plan</h3>
          <p className="data-current">
            {route
              ? `${route.distanceKm.toFixed(2)} km one-way · ${route.totalHours.toFixed(1)} h EVA · ${route.doseMsv.toFixed(2)} mSv · max ${route.maxSlopeDeg.toFixed(1)}° · turn-back ${route.turnBackKm.toFixed(2)} km${
                  solarEvent ? " · solar-event scenario" : ""
                }`
              : "Computing route…"}
          </p>

          <h3>Limits</h3>
          <p className="data-limits">
            The globe is a smooth ellipsoid: there is no global 3D terrain mesh. Global
            imagery is 232 m/px; HiRISE detail exists only at Gale. The route uses a ~24 m
            planning grid, so boulders smaller than a cell are not collision geometry.
            Radiation and thermal values are planning heuristics, not measured crew dose.
          </p>

          <h3>Design references</h3>
          <p className="data-limits">
            Apollo lunar traverse planning and the Lunar Roving Vehicle; NASA Mars Trek
            and the USGS planetary mapping programme; LRO/LROC layered map products; and
            Google Earth's Mars mode for the orbiter-to-surface interaction model.
          </p>
        </div>
      </div>
    </div>
  );
}
