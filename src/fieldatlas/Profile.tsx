import type { RouteResult } from "./route";

export function Profile({ route }: { route: RouteResult | null }) {
  if (!route || route.points.length < 2) {
    return (
      <div className="profile-empty">
        Load a traverse to generate the elevation profile.
      </div>
    );
  }

  const points = route.points;
  const min = Math.min(...points.map((p) => p.elev));
  const max = Math.max(...points.map((p) => p.elev));
  const range = Math.max(1, max - min);
  const total = Math.max(0.001, route.distanceKm);

  const xy = points.map((p) => {
    const x = (p.distanceKm / total) * 1000;
    const y = 84 - ((p.elev - min) / range) * 62;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const area = `M 0,92 L ${xy.join(" L ")} L 1000,92 Z`;
  const line = `M ${xy.join(" L ")}`;

  return (
    <svg
      className="profile-svg"
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Route elevation profile"
    >
      <defs>
        <linearGradient id="profile-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C25A3C" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#C25A3C" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#profile-fill)" />
      <path
        d={line}
        fill="none"
        stroke="#D9A441"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
      {route.stops.map((stop) => {
        const x = (stop.distanceKm / total) * 1000;
        return (
          <g key={stop.waypoint.id}>
            <line
              x1={x}
              y1={8}
              x2={x}
              y2={92}
              stroke="#F4F1EA"
              strokeOpacity="0.18"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x} cy={84 - ((stop.elev - min) / range) * 62} r="2.6" fill="#E08A6A" />
            <text
              x={x}
              y={99}
              fill="#9A958C"
              fontSize="7"
              fontFamily="IBM Plex Mono, monospace"
              textAnchor="middle"
            >
              {stop.index + 1}
            </text>
          </g>
        );
      })}
      {route.turnBackPoint && route.turnBackKm > 0 && (
        <g>
          <line
            x1={(route.turnBackKm / total) * 1000}
            y1={8}
            x2={(route.turnBackKm / total) * 1000}
            y2={92}
            stroke="#D9A441"
            strokeOpacity="0.75"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={(route.turnBackKm / total) * 1000}
            y={6}
            fill="#D9A441"
            fontSize="6"
            fontFamily="IBM Plex Mono, monospace"
            textAnchor="middle"
          >
            TURN-BACK
          </text>
        </g>
      )}
      <text x="4" y="10" fill="#6E6A63" fontSize="7" fontFamily="IBM Plex Mono, monospace">
        {Math.round(max).toLocaleString()} m
      </text>
      <text x="4" y="90" fill="#6E6A63" fontSize="7" fontFamily="IBM Plex Mono, monospace">
        {Math.round(min).toLocaleString()} m
      </text>
    </svg>
  );
}
