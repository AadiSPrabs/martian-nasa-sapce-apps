import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://trek.nasa.gov/mars/trekarcgis/rest/services";
const OUT = path.resolve("public/data/globe");

const clampLon = (lon) => {
  let x = ((lon + 180) % 360 + 360) % 360 - 180;
  return x;
};

function normalizeRing(ring) {
  const out = [];
  for (const [lon, lat] of ring) {
    let x = clampLon(lon);
    if (out.length) {
      const prev = out[out.length - 1][0];
      while (x - prev > 180) x -= 360;
      while (prev - x > 180) x += 360;
    }
    out.push([Number(x.toFixed(5)), Number(lat.toFixed(5))]);
  }
  return out;
}

function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const sqTol = tolerance * tolerance;
  const sqSegDist = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const sqDistToSegment = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const sqDistToSegment2 = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const sqDistToSegment3 = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const sqDistToSegment4 = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  // RDP on a polyline.
  const getSqSegDist = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const simplifyStep = (pts, first, last, out) => {
    let maxSq = sqTol;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const sq = getSqSegDist(pts[i], pts[first], pts[last]);
      if (sq > maxSq) {
        index = i;
        maxSq = sq;
      }
    }
    if (index !== -1) {
      if (index - first > 1) simplifyStep(pts, first, index, out);
      out.push(pts[index]);
      if (last - index > 1) simplifyStep(pts, index, last, out);
    }
  };
  const result = [points[0]];
  simplifyStep(points, 0, points.length - 1, result);
  result.push(points[points.length - 1]);
  return result;
}

async function query(service, params = {}) {
  const url = new URL(`${BASE}/${service}/MapServer/0/query`);
  url.searchParams.set("where", params.where ?? "1=1");
  url.searchParams.set("outFields", params.outFields ?? "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "104905");
  url.searchParams.set("f", "json");
  if (params.orderByFields) url.searchParams.set("orderByFields", params.orderByFields);
  const res = await fetch(url, {
    headers: { "user-agent": "Groundtruth/0.1 (NASA Space Apps hackathon)" },
  });
  if (!res.ok) throw new Error(`${service} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${service}: ${json.error.message}`);
  return json.features ?? [];
}

function esriPointToGeo(f) {
  return {
    type: "Point",
    coordinates: [clampLon(f.geometry.x), f.geometry.y],
  };
}

function esriPolylineToGeo(f) {
  const paths = f.geometry?.paths ?? [];
  if (paths.length === 1) {
    return {
      type: "LineString",
      coordinates: paths[0].map(([x, y]) => [clampLon(x), y]),
    };
  }
  return {
    type: "MultiLineString",
    coordinates: paths.map((p) => p.map(([x, y]) => [clampLon(x), y])),
  };
}

function esriPolygonToGeo(f) {
  const rings = f.geometry?.rings ?? [];
  return {
    type: "Polygon",
    coordinates: rings.map((r) => simplify(normalizeRing(r), 0.008)),
  };
}

function feature(f, properties, geometry) {
  return { type: "Feature", properties, geometry };
}

async function writeJson(name, data) {
  const file = path.join(OUT, name);
  await fs.writeFile(file, JSON.stringify(data));
  const stat = await fs.stat(file);
  console.log(`[globe] ${name} ${(stat.size / 1024).toFixed(1)} KB`);
}

await fs.mkdir(OUT, { recursive: true });

function cleanHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#39;|&#x27;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function downloadTo(url, dest) {
  const res = await fetch(url, {
    headers: { "user-agent": "Groundtruth/0.1 (NASA Space Apps hackathon)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

console.log("[globe] regions");
const regions = await query("mars_regions");
const regionFeatures = regions.map((f) =>
  feature(
    f,
    {
      id: `region-${f.attributes.FID}`,
      name: f.attributes.title,
      kind: "region",
      lon: f.attributes.lon,
      lat: f.attributes.lat,
      image: f.attributes.imageURL || null,
    },
    esriPolygonToGeo(f),
  ),
);

console.log("[globe] quadrangles");
const quads = await query("mc5m_quadsdd_dense");
const quadFeatures = quads.map((f) =>
  feature(
    f,
    {
      id: f.attributes.MC_QUAD,
      name: f.attributes.QUAD_NAME,
      code: f.attributes.QUADRANGLE,
      kind: "quad",
      lon: f.attributes.X_COORD,
      lat: f.attributes.Y_COORD,
    },
    esriPolygonToGeo(f),
  ),
);

console.log("[globe] major features");
const majors = await query("major_features");
const majorFeatures = majors.map((f, i) =>
  feature(
    f,
    {
      id: `feature-${i}`,
      name: f.attributes.name,
      kind: "feature",
      template: f.attributes.template,
      lon: clampLon(f.geometry.x),
      lat: f.geometry.y,
    },
    esriPointToGeo(f),
  ),
);

console.log("[globe] feature content");
const featureDir = path.join(OUT, "features");
await fs.mkdir(featureDir, { recursive: true });
const featureContent = [];
for (const f of majorFeatures) {
  const name = String(f.properties.name);
  const template = String(f.properties.template ?? "");
  if (!template) continue;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const url = `https://trek.nasa.gov/mars/${template}`;
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Groundtruth/0.1 (NASA Space Apps hackathon)" },
    });
    if (res.ok) html = await res.text();
  } catch {
    console.warn(`  template failed: ${name}`);
  }
  const imgMatch = html.match(/<img[^>]+src="([^"]+)"/i);
  const linkMatch = html.match(/<a[^>]+href="([^"]+\.(?:jpg|jpeg|png|JPG))"/i);
  const captionMatch = html.match(/<p>([\s\S]*?)<\/p>/i);
  const withoutThumb = html.replace(/<div class="thumbnail[\s\S]*?<\/div>/i, " ");
  const abs = (u) =>
    !u ? null : u.startsWith("http") ? u : `https://trek.nasa.gov/mars/${u.replace(/^\/+/, "")}`;
  let image = null;
  const remote = abs(linkMatch?.[1]) ?? abs(imgMatch?.[1]);
  if (remote) {
    const ext = remote.toLowerCase().endsWith(".png") ? "png" : "jpg";
    try {
      await downloadTo(remote, path.join(featureDir, `${slug}.${ext}`));
      image = `/data/globe/features/${slug}.${ext}`;
    } catch {
      console.warn(`  image failed: ${name}`);
    }
  }
  featureContent.push({
    name,
    description: cleanHtml(withoutThumb).slice(0, 1400),
    caption: cleanHtml(captionMatch?.[1] ?? ""),
    image,
    source: url,
  });
}

console.log("[globe] nomenclature");
const nomenParts = [];
for (const where of [
  "level<=5",
  "level=6",
  "level=7 AND center_lon<180",
  "level=7 AND center_lon>=180",
]) {
  const part = await query("outreach_nomenclature", { where });
  console.log(`  ${where}: ${part.length}`);
  nomenParts.push(...part);
}
const nomen = nomenParts.map((f) => {
  const a = f.attributes;
  return {
    id: `nomen-${a.FID}`,
    name: a.clean_name,
    type: a.type,
    category: a.category,
    level: Number(a.level),
    lon: clampLon(a.center_lon),
    lat: a.center_lat,
    quad: a.quad_name,
    diameterKm: a.diameter,
    kind: "nomen",
  };
});

console.log("[globe] landing sites");
const landingConfig = [
  { mission: "Viking 1", service: "viking_waypoints", pick: "Lander", year: 1976, color: "#C9A227" },
  { mission: "Pathfinder", service: "sojourner_waypoints", pick: "Pathfinder Lander", year: 1997, color: "#B08D57" },
  { mission: "Spirit", service: "spirit_waypoints", pick: "Columbia Memorial Station", year: 2004, color: "#8FA9B3" },
  { mission: "Opportunity", service: "opportunity_waypoints", pick: "Landing Site", year: 2004, color: "#7FA08A" },
  { mission: "Phoenix", service: "phoenix_waypoints", pick: "Phoenix Lander", year: 2008, color: "#A6B8C4" },
  { mission: "Curiosity", service: "curiosity_waypoints", pick: "Bradbury Landing", year: 2012, color: "#D9A441" },
  { mission: "InSight", service: "InSight_waypoints", pick: "InSight Lander", year: 2018, color: "#C25A3C" },
  { mission: "Perseverance", service: "mars2020_waypoints", pick: "Perseverance Landing Ellipse", year: 2021, color: "#E08A6A" },
];
const landingFeatures = [];
for (const cfg of landingConfig) {
  const feats = await query(cfg.service);
  const pick =
    feats.find((f) => f.attributes.name === cfg.pick) ??
    feats.find((f) => f.attributes.name?.toLowerCase().includes(cfg.pick.toLowerCase())) ??
    feats[0];
  if (!pick) {
    console.warn(`[globe] no landing feature for ${cfg.mission}`);
    continue;
  }
  landingFeatures.push(
    feature(
      pick,
      {
        id: `landing-${cfg.mission.toLowerCase().replace(/\W+/g, "-")}`,
        name: cfg.mission === "Perseverance" ? "Jezero Crater" : pick.attributes.name,
        mission: cfg.mission,
        year: cfg.year,
        color: cfg.color,
        kind: "landing",
        lon: clampLon(pick.geometry.x),
        lat: pick.geometry.y,
      },
      esriPointToGeo(pick),
    ),
  );
}

console.log("[globe] traverses");
const traverseConfig = [
  { mission: "Curiosity", service: "curiosity_path", color: "#D9A441" },
  { mission: "Perseverance", service: "Perseverance_Traverse_Path", color: "#E08A6A" },
  { mission: "Opportunity", service: "opportunity_path2", color: "#7FA08A" },
  { mission: "Spirit", service: "spirit_path2", color: "#8FA9B3" },
];
const traverseFeatures = [];
for (const cfg of traverseConfig) {
  const feats = await query(cfg.service);
  for (const [i, f] of feats.entries()) {
    const paths = f.geometry?.paths ?? [];
    for (const [j, p] of paths.entries()) {
      if (p.length < 2) continue;
      const line = simplify(p.map(([x, y]) => [clampLon(x), y]), 0.00035);
      traverseFeatures.push(
        feature(
          f,
          {
            id: `traverse-${cfg.mission}-${i}-${j}`,
            mission: cfg.mission,
            color: cfg.color,
            kind: "traverse",
          },
          { type: "LineString", coordinates: line },
        ),
      );
    }
  }
}

const searchItems = [
  ...regionFeatures.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    kind: "region",
    lon: f.properties.lon,
    lat: f.properties.lat,
    parent: "Mars",
  })),
  ...quadFeatures.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    kind: "quad",
    lon: f.properties.lon,
    lat: f.properties.lat,
    parent: "Mars",
  })),
  ...majorFeatures.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    kind: "feature",
    lon: f.properties.lon,
    lat: f.properties.lat,
    parent: "Mars",
  })),
  ...landingFeatures.map((f) => ({
    id: f.properties.id,
    name: f.properties.mission,
    kind: "landing",
    lon: f.properties.lon,
    lat: f.properties.lat,
    parent:
      f.properties.mission === "Curiosity"
        ? "Gale Crater"
        : f.properties.mission === "Perseverance"
          ? "Jezero Crater"
          : f.properties.name,
    mission: f.properties.mission,
    year: f.properties.year,
  })),
  ...nomen.map((n) => ({
    id: n.id,
    name: n.name,
    kind: "nomen",
    level: n.level,
    lon: n.lon,
    lat: n.lat,
    parent: n.type,
  })),
];

const collection = (features) => ({ type: "FeatureCollection", features });

await writeJson("regions.geojson", collection(regionFeatures));
await writeJson("quads.geojson", collection(quadFeatures));
await writeJson("features.geojson", collection(majorFeatures));
await writeJson("feature-content.json", featureContent);
await writeJson("landing-sites.geojson", collection(landingFeatures));
await writeJson("traverses.geojson", collection(traverseFeatures));
await writeJson("nomenclature.json", nomen);
await writeJson("search-index.json", searchItems);
await writeJson("meta.json", {
  generatedAt: new Date().toISOString(),
  source: "NASA/JPL Mars Trek ArcGIS services",
  counts: {
    regions: regionFeatures.length,
    quads: quadFeatures.length,
    majorFeatures: majorFeatures.length,
    nomenclature: nomen.length,
    landingSites: landingFeatures.length,
    traverseSegments: traverseFeatures.length,
  },
  credits: {
    regions: "NASA/JPL-Caltech Mars Trek",
    quads: "USGS/MSSS MC 5M quadrangles",
    features: "NASA/JPL-Caltech Mars Trek",
    nomenclature: "IAU/USGS Gazetteer via NASA Mars Trek",
    landingSites: "NASA/JPL",
    traverses: "NASA/JPL",
  },
});
console.log("[globe] done");
