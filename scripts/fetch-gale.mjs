import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://trek.nasa.gov/mars/trekarcgis/rest/services";
const OUT = path.resolve("public/data/gale");
const POV = path.join(OUT, "pov");
const BBOX = [137.32, -4.76, 137.46, -4.6];
const BBOX_STR = BBOX.join(",");

const WAYPOINTS = [
  { slug: "murray_buttes", name: "Murray Buttes", role: "start" },
  { slug: "bagnold_dunes_south", name: "Bagnold Dunes South", role: "science" },
  { slug: "vera_rubin_ridge", name: "Vera Rubin Ridge", role: "science" },
  { slug: "hematite_hotspot", name: "Hematite Hotspot", role: "target" },
  { slug: "pahrump_hills", name: "Pahrump Hills", role: "context" },
  { slug: "marias_pass", name: "Marias Pass", role: "context" },
];

function clean(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#39;|&#x27;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { "user-agent": "Groundtruth/0.1 (NASA Space Apps hackathon)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(POV, { recursive: true });

console.log("[gale] HiRISE");
await download(
  `${BASE}/curiosity_hirise_mosaic/ImageServer/exportImage?bbox=${BBOX_STR}&bboxSR=104905&imageSR=104905&size=3000,3400&format=jpg&f=image`,
  path.join(OUT, "hirise.jpg"),
);

console.log("[gale] DEM GeoTIFF");
await download(
  `${BASE}/Gale_DEM_SMG_1m/ImageServer/exportImage?bbox=${BBOX_STR}&bboxSR=104905&imageSR=104905&size=1400,1600&format=tiff&pixelType=F32&f=image`,
  path.join(OUT, "dem.tif"),
);

console.log("[gale] geology");
await download(
  `${BASE}/SIM3292_Global_Geology/MapServer/export?bbox=${BBOX_STR}&bboxSR=104905&imageSR=104905&size=1600,1800&format=png32&f=image`,
  path.join(OUT, "geology.png"),
);

console.log("[gale] waypoints");
const wpRes = await fetch(
  `${BASE}/curiosity_waypoints/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=104905&f=json`,
);
const wpJson = await wpRes.json();
const wps = (wpJson.features ?? []).map((f) => ({
  name: f.attributes.name,
  template: f.attributes.template,
  lon: f.geometry.x,
  lat: f.geometry.y,
}));

const bySlug = new Map();
for (const wp of WAYPOINTS) {
  const templateUrl = `https://trek.nasa.gov/mars/jpl/assets/features/curiosity/${wp.slug}.html`;
  let html = "";
  try {
    const res = await fetch(templateUrl, {
      headers: { "user-agent": "Groundtruth/0.1 (NASA Space Apps hackathon)" },
    });
    if (res.ok) html = await res.text();
  } catch {
    console.warn(`[gale] template failed: ${wp.slug}`);
  }

  const imgMatch = html.match(/<img[^>]+src="([^"]+)"/i);
  const linkMatch = html.match(/<a[^>]+href="([^"]+\.(?:jpg|jpeg|png|JPG))"/i);
  const captionMatch = html.match(/<p>([\s\S]*?)<\/p>/i);
  const withoutThumb = html.replace(/<div class="thumbnail[\s\S]*?<\/div>/i, " ");

  const img = imgMatch?.[1] ?? "";
  const link = linkMatch?.[1] ?? "";
  const abs = (u) =>
    !u
      ? null
      : u.startsWith("http")
        ? u
        : `https://trek.nasa.gov/mars/${u.replace(/^\/+/, "")}`;

  let localImage = null;
  const remote = abs(link) ?? abs(img);
  if (remote) {
    const ext = remote.toLowerCase().endsWith(".png") ? "png" : "jpg";
    const file = path.join(POV, `${wp.slug}.${ext}`);
    try {
      const size = await download(remote, file);
      localImage = `/data/gale/pov/${wp.slug}.${ext}`;
      console.log(`  POV ${wp.slug} ${(size / 1024).toFixed(0)} KB`);
    } catch {
      console.warn(`  POV failed: ${wp.slug} ${remote}`);
    }
  }

  const match = wps.find((w) => w.name === wp.name);
  bySlug.set(wp.slug, {
    id: wp.slug,
    name: wp.name,
    role: wp.role,
    lon: match?.lon ?? null,
    lat: match?.lat ?? null,
    description: clean(withoutThumb).replace(/^“|”$/g, "").slice(0, 1400),
    caption: clean(captionMatch?.[1] ?? ""),
    image: localImage,
    source: templateUrl,
  });
}

const waypoints = Array.from(bySlug.values());
await fs.writeFile(
  path.join(OUT, "waypoints.json"),
  JSON.stringify(waypoints, null, 2),
);

console.log("[gale] traverse");
const pathRes = await fetch(
  `${BASE}/curiosity_path/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=104905&f=json`,
);
const pathJson = await pathRes.json();
const paths = (pathJson.features ?? []).flatMap((f) => f.geometry?.paths ?? []);
const line = paths[0] ?? [];
const simplified = line.filter(
  (_, i) => i % 24 === 0 || i === line.length - 1,
);
await fs.writeFile(
  path.join(OUT, "traverse.geojson"),
  JSON.stringify({
    type: "Feature",
    properties: { mission: "Curiosity" },
    geometry: {
      type: "LineString",
      coordinates: simplified.map(([lon, lat]) => [lon, lat]),
    },
  }),
);

console.log("[gale] weather");
const wxRes =await fetch(
  "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json",
);
const wxJson = await wxRes.json();
const soles = wxJson.soles ?? [];
let latest = null;
for (const s of soles) {
  if (!latest || Number(s.sol) > Number(latest.sol)) latest = s;
}
const numbered = soles.filter((s) => s.sol !== "--" && s.min_temp !== "--");
const recent = numbered
  .sort((a, b) => Number(b.sol) - Number(a.sol))
  .slice(0, 120)
  .map((s) => ({
    sol: Number(s.sol),
    minC: Number(s.min_temp),
    maxC: Number(s.max_temp),
    pressurePa: Number(s.pressure),
    opacity: s.atmo_opacity,
    season: s.season,
  }))
  .reverse();
await fs.writeFile(
  path.join(OUT, "weather.json"),
  JSON.stringify(
    {
      latest: latest
        ? {
            sol: Number(latest.sol),
            date: latest.terrestrial_date,
            minC: latest.min_temp,
            maxC: latest.max_temp,
            pressurePa: latest.pressure,
            opacity: latest.atmo_opacity,
            season: latest.season,
          }
        : null,
      recent,
      source: "NASA/JPL-Caltech/CAB MSL REMS",
    },
    null,
    2,
  ),
);

await fs.writeFile(
  path.join(OUT, "meta.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      bbox: BBOX,
      sources: {
        hirise: "NASA/JPL-Caltech/University of Arizona via NASA Mars Trek",
        dem: "NASA/JPL-Caltech/USGS Gale DEM 1 m",
        geology: "USGS Astrogeology SIM3292",
        waypoints: "NASA/JPL-Caltech Curiosity waypoints",
        weather: "NASA/JPL-Caltech/CAB REMS",
      },
      credits: "NASA/JPL-Caltech · USGS · MSSS",
    },
    null,
    2,
  ),
);

console.log("[gale] done");
