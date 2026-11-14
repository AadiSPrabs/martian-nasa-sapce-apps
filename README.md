# Martian Map — Interplanetary Survival Guide

Submission for the **NASA Space Apps Challenge 2026**, under the **Martian Map**
challenge ("Interplanetary Survival Guide: Martian Map"), virtual Universal Event.

## What it is

An interactive Mars map with route planning, plus a survival-mission layer on
top of the routes. Plan a route, then run the mission along it — the sim works
out oxygen, power, water and radiation budgets per leg and gives a
SAFE / RISKY / LETHAL verdict for the crew.

## How to run it

Open `martian-map.html` in any browser. It is a single self-contained file —
no build step, no install.

## What's in it

- Interactive Mars map with Olympus Mons, Valles Marineris, Hellas, Jezero,
  Gale and Elysium, and 5 switchable data layers.
- Click-to-plan routes with waypoints and an elevation profile.
- Three vehicle types (rover, drone, hauler) and three preset missions,
  including the near-impossible Hellas Gambit.
- Run Mission animates the traverse across the surface with a comms log and
  events such as dust storms, and reports completion or abort cleanly.

## Data and how distances are calculated

- Distances are real great-circle (haversine) distances using the Mars radius
  **3,389.5 km** — e.g. Ares-1 to Jezero is 89 km and Jezero to Gale is
  3,748 km. Presets, the elevation profile, drive time, survival budgets and
  the Run Mission failure distance all use the same calculation.
- Site coordinates use the real values: InSight / Elysium at 135.62°E and
  Gale at 4.59°S, 137.44°E.
- Survival budgets are keyed to a fixed simulated weather state plus route
  hazard — the map layer being viewed (topo, DUST, RAD, etc.) does not change
  the budget.
- Map tiles: CTX imagery from the ArcGIS host (512px PNG) and MOLA ClrShade
  from trek.nasa.gov (JPEG) — the two do not share one URL template.
- Limitation, stated honestly: no DEM tile layer exists, so elevation
  sampling is illustrative unless MOLA elevation is wired in properly.

## NASA data sources

- Mars CTX imagery (ArcGIS host) and MOLA shaded relief (trek.nasa.gov),
  as used for the map layers above.
- Landing-site coordinates for InSight, Gale (Curiosity) and Jezero
  (Perseverance) as published by NASA.

## AI disclosure

Built with Muse (AI assistant) and verified hands-on by a second AI agent
(Instinct), which tested Run Mission end-to-end and caught the coordinate,
distance-scale and layer-budget errors fixed in this version.

## Submission

- Challenge: Martian Map, NASA Space Apps 2026
- Event: virtual Universal Event
- Deadline: Sunday 15 November 2026, 23:59 IST
