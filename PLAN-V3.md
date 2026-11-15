# TRAVERSE — Gamified Mars EVA Planner (v3)

**Status:** P0 implemented — any-site recon rover + Gale field loop. P1/P2 are design only.
**Supersedes:** the current `Plan` tab, the `FieldAtlas` route-builder surface, preset route cards, and the separate `Walk` flow.
**Keeps:** the Cesium globe, real Gale HiRISE/DEM data, A* routing, safety math, POV content, and the Field Manual.

---

## 1. One-sentence pitch

**Google Maps for a Mars astronaut:** your position is a beacon on the globe, you drop a destination on the real Mars map, choose a route, pack the suit, watch the cost in oxygen / power / radiation / time, then walk the plan stop by stop and bring the samples home.

The old Plan tab was a route dashboard. This is a **field decision game** where the map is the interface and every choice has a cost.

---

## 2. Why the old Plan flow is being scrapped

The current flow fails the fantasy in five ways:

1. **No astronaut.** The user is a cursor editing a route, not a person standing on Mars.
2. **No destination choice.** Presets decide the route before the player does.
3. **No equipment.** Suit load is one segmented control; it does not change what is possible.
4. **No stakes.** The route recalculates, but there is no reason to care which route wins.
5. **No feedback loop.** You plan, then press Start walk. Nothing is earned, lost, unlocked, or graded.

**Delete:** the Plan tab, the FieldAtlas modal, the preset route cards, the fixed four-stop list, the separate Start walk button, and the `Plan traverse` CTA.
**Reuse:** the DEM/A* engine, safety calculations, turn-back logic, POV images, and data provenance. The old UI is not the product.

---

## 3. Fantasy and framing

You are the **EVA lead** at the current site. For the field showcase, the pressurised rover is parked at Murray Buttes, Gale Crater. It is Sol 4995; the suit is charged; the science board has more targets than the clock allows. At any other point on Mars, the same loop runs in reconnaissance grade.

- The **globe** is the orbital view. A pulsing beacon marks **you** at the rover.
- Clicking the beacon opens the **field tablet**: a full-screen local map, not a modal.
- The tablet is diegetic: suit status, radio, map, science board, loadout.
- The goal is not to “win Mars.” It is to **bring back good science without breaking the suit**.
- Tone: grounded NASA simulation with game feel. Real data, labelled models, no arcade death.

---

## 4. Core loop

| Stage | Player question | Interface | Feedback |
|---|---|---|---|
| **Orbit** | Where am I? | Globe beacon + “You are here” card | Sol, weather, site |
| **Brief** | What is worth doing? | Science board / objective cards | Reward, tools required, window |
| **Plan** | How do I get there? | Map + “Where to?” + route alternatives | Time, O2, power, dose, risk |
| **Loadout** | What do I carry? | Backpack cards + mass/power budget | Speed, reserve, tool gates |
| **Review** | Is this wise? | Readiness ring + timeline | Warnings, turn-back, commit |
| **Traverse** | What is next? | Turn-by-turn map + resource bars | Events, samples, reroute |
| **Debrief** | What did I learn? | Grade + field log + unlock | Science, dose, new gear |

A full loop should take **8–12 minutes**. The first playable should complete one loop at an arbitrary recon site and one at Gale.

---

## 5. “Google Maps, but Mars”

| Google Maps | TRAVERSE |
|---|---|
| Blue dot + heading cone | Astronaut beacon at the rover, with suit heading |
| Search “Where to?” | Search science targets, rover, shelter, sample cache |
| Route alternatives | **Fastest / Safest / Most science** |
| ETA | EVA time, O2 used, power used, dose |
| Layers | Terrain, slope, radiation, thermal, comms, science |
| Avoid tolls/highways | Avoid slopes >20°, radiation, comms shadow |
| Add stop | Add sample stop, rover cache, comms relay |
| Start navigation | **Begin EVA** |
| Street View | Real Mastcam/Navcam POV at stops |
| Offline maps | Baked HiRISE + DEM; no network needed |
| Share trip | Radio the plan to mission control (P1) |

### The map is the main screen

- Top-down Leaflet map over HiRISE, not a 3D globe, for local planning clarity.
- Astronaut marker: pulsing ring, heading cone, “YOU.”
- Destination pin: tap the map or search.
- Route lines: three alternatives, colour-coded; selected route thickens.
- Science pins: sample, image, instrument target; locked pins show “scan required.”
- Bottom sheet: peek → alternatives → full steps, like Google Maps.
- Layer chips: Terrain · Slope · Radiation · Thermal · Comms · Science.
- “Add stop” inserts a via; route recalculates immediately.

### The three route choices

Every destination returns **three plans**, not one:

1. **Fastest** — shortest EVA time; may cross steeper terrain.
2. **Safest** — lower slope, lower radiation, better comms; usually longer.
3. **Most science** — detours to objectives and sample stops; costs time and consumables.

Each card shows:

`distance · EVA time · O2 · power · dose · max slope · sample slots · risk`

If the loadout makes a route impossible, the card is disabled with a reason: “O2 reserve negative — add a spare tank or drop the drill.”

---

### 5.5 Anywhere on Mars

The planner is not Gale-only. The globe is the site picker: click any point, a named feature, or a landing site; the astronaut beacon moves there; the field tablet opens at that site.

That requires two honest data tiers:

| Tier | Coverage | Terrain | Imagery | Play mode |
|---|---|---|---|---|
| **Field** | Gale; additional 1–5 m DEM sites where available | 1 m DEM, HiRISE stereo | HiRISE | Full foot EVA, samples, boulder-scale caveat |
| **Recon** | Entire surface | MOLA/HRSC blended 200 m DEM | Viking 232 m + MOLA shaded relief | Rover traverse / regional EVA; slope and route are reconnaissance-grade |
| **Context** | Entire surface | — | 232 m Viking | Globe and site selection |

**Anywhere is a site, not a promise of 1 m detail everywhere.** Public global Mars terrain is ~200 m/px; only a small fraction has 1 m DEM. The game should show the data grade on the site card and in the HUD: `HIRISE 1 m · FIELD` vs `MOLA 200 m · RECON`.

#### Site selection

- Click anywhere on the globe → site card: lat/lon, elevation, data grade, `Set as current site`.
- Search a named feature or landing site → same card.
- The astronaut marker (`YOU`) moves to the site.
- The current site persists in local storage.
- Clicking the marker opens Traverse; there is still no Plan tab.

#### Local terrain fetch

On entering a site, fetch a local window from Mars Trek:

- DEM: 512×512 Float32 GeoTIFF from `Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw`.
- Imagery: 1024×1024 JPEG from `Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp` (recon) or HiRISE (field).
- Window: 0.6°–1.0° around the site (~35–60 km), enough for a rover traverse.
- Parse GeoTIFF in the browser with `geotiff.js`; cache by rounded bbox in IndexedDB.
- Loading state: `FETCHING MOLA 200 m TERRAIN…`, then `RECON GRADE · 200 m`.
- If the network is unavailable, only baked high-res sites (Gale) work; show a clear fallback.

Validated: a 512², 10°×10° DEM export returned `image/tiff`, Float32, 1.05 MB in ~2.7 s with permissive CORS. A 256² Gale crop returned plausible elevations (−4435 to −4112 m).

#### Mission generation anywhere

- **Curated sites** (Gale, landing sites, 1 m DEM sites): real objectives and POV content.
- **Arbitrary sites**: generate three terrain-grounded field objectives from the DEM:
  - local high point / panorama station,
  - steep slope break / ridge transect,
  - crater rim or local low point where detected.
- Names are honest: `Generated field objective · local high point`, not a fake named discovery.
- Rewards are generic science data / route intel.
- The mission brief always shows `CURATED` or `GENERATED`.

#### Mode selection

- **Field EVA**: only where high-res terrain exists. Full equipment, samples, boulder-scale caveat.
- **Rover Recon**: anywhere. The pressurised rover plans a regional route at 200 m; the astronaut can do foot EVA only at high-res stops.
- **Recon EVA**: optional fallback for non-featured sites, clearly labelled `RECON GRADE`; no sample-level promises.
- Default for arbitrary sites: **Rover Recon** (recommended), because 200 m terrain is appropriate for regional routes, not boulder dodging.

#### Route window

- Destination must lie within the fetched local window (roughly 30 km radius).
- If the player picks farther, show: `Outside this terrain window — choose a closer target or fetch a wider recon tile.`
- P1 can stitch multiple windows for a long rover campaign.

---

## 6. Equipment and resources

### 6.1 Loadout model

The suit is fixed. The player packs a **backpack** (mass/volume budget) and, later, a **rover** (cargo/range).

Derived stats:

```
loadFactor   = clamp(1 - (packMassKg - 12) / 90, 0.62, 1.0)
walkSpeed    = baseToblerSpeed * suitFactor * loadFactor
o2Hours      = suitO2 + spareO2 - walkHours * 1.15 - dwellHours * 0.7
powerPercent = 100 + spareBattery - walkHours * 7 - instrumentUse
doseMsv      = totalHours * 0.026 * shieldingFactor * solarFactor
sampleKg     = samplesTaken * 0.8
```

All values are **planning models**, labelled as such in the Field Manual. No fake NASA numbers.

### 6.2 Item catalogue (first playable)

| Item | Mass | Effect | Trade-off |
|---|---:|---|---|
| Standard PLSS | — | 4.5 h O2, 8 h battery, water | Fixed suit baseline |
| Spare O2 tank | 2.2 kg | +1.2 h O2 | Weight |
| Spare battery | 2.8 kg | +18% power | Weight |
| Water | 0.6 kg | +0.5 L | Weight |
| Radiation vest | 4.2 kg | −35% dose | Heavy, slower |
| Thermal shell | 1.8 kg | +2 h thermal window | Weight |
| Geology kit (drill) | 4.5 kg | Unlocks hematite sample | Heavy; required for that objective |
| Spectrometer | 2.6 kg | Unlocks spectral objective | Power draw |
| Sample bags | 0.4 kg | +4 sample slots | — |
| Comms relay | 3.5 kg | Removes one comms shadow | Weight, setup time |
| Repair kit | 1.5 kg | Rover repair (P1) | Weight |

### 6.3 Tool gating

Objectives can require equipment:

- Hematite sample → **drill**.
- Ridge spectral scan → **spectrometer**.
- Dune image → camera (suit standard).
- Rover cache → **rover** (P1).

A missing tool is a **planning failure**, not a mid-EVA surprise. The Review screen blocks commit and tells the player what to pack.

### 6.4 Recommended kits

- **Light:** O2, water, sample bags. Fast, low science.
- **Science:** drill, spectrometer, bags, spare battery. Slow, high yield.
- **Survival:** radiation vest, thermal shell, spare O2, relay. Safe, low samples.

The player can save one custom preset.

### 6.5 Rover (P1, but designed now)

- Carries 60 kg of gear, provides shelter and 18 km range.
- Rover routes use traversable slopes only; drive time separate from suit EVA.
- Can reposition to a **forward cache**, turning a long walk into a shorter EVA.
- Adds a new strategic choice: walk the whole way, or spend rover power to shorten the suit leg.

---

## 7. The game layer

Gamification is not points for clicking. It is **goals, constraints, choices, feedback, and progression**.

### 7.1 Mission readiness

A single ring with four subscores:

- **Life support** — O2 and power reserve.
- **Mobility** — load, slope, EVA time.
- **Science** — objectives covered and tools packed.
- **Risk** — radiation, thermal, comms, turn-back.

`READY` requires all minimums; the player can still override with a warning, and the debrief records it.

### 7.2 Science board

Three to five contracts per sol, each with:

- Title, target, required tool, dwell time.
- Reward: science points, route intel, equipment unlock.
- Optional constraint: “return with 20% O2” or “no rover.”

The player chooses **one primary** and can add secondary stops. This creates the “what is worth doing?” decision.

### 7.3 Risk / reward

- A hematite sample is worth more science but sits beyond the ridge.
- The direct route is faster but crosses a 22° slope.
- A solar-event forecast makes the safe route more valuable.
- A comms shadow means a relay or a shorter route.
- The player can trade **time, mass, power, dose, and science**.

### 7.4 Discovery

- Unknown POIs are grey until scanned or visited.
- Scanning reveals geology, sample potential, and a POV card.
- First visit unlocks a route shortcut or a field note.

### 7.5 Radio and narrative

Short, non-blocking lines from mission control and the crew:

- “You are 400 m from the ridge; O2 reserve is 28%.”
- “Solar activity is rising. Recommend the low-radiation route.”
- “Sample logged. That is the hematite signature.”
- “Turn-back in 600 m if you want the reserve.”

No long cutscenes. Radio is the game’s voice.

### 7.6 Debrief and rating

After return, abort, or rover home:

- **Safety** grade: reserve, dose, slope, warnings.
- **Science** grade: objectives, samples, scans.
- **Efficiency** grade: time and power versus plan.
- Overall **S/A/B/C** and a mission patch.
- Unlock: new item, route intel, or a new science target.
- Field log entry with the route and equipment used.

### 7.7 Failure

No death, no gore, no game over screen.

- O2/power below reserve → **mandatory turn-back**.
- Suit fault → abort to rover.
- Solar event → shelter/return choice.
- Debrief records the abort and the lesson; the next plan starts from the rover.

### 7.8 Game feel

- Pulsing astronaut beacon; route draws in.
- Resource bars tick down per leg.
- Sample is a short hold-to-drill/scan interaction with a tool check.
- Radio chirps and a soft success chord (muteable).
- Readiness ring fills as the loadout changes.
- Debrief stamp and patch animation.

---

## 8. Screen flow and layout

### 8.1 Entry: the globe

- The astronaut beacon sits at the rover at Murray Buttes.
- Label: **YOU · MURRAY BUTTES**; pulsing ring.
- Clicking opens **TRAVERSE**.
- No Plan tab. The beacon is the entry point; a small “EVA” chip can exist for discoverability, but it opens the same tablet.
- After a debrief, the beacon stays at the rover (P1: move to last position).

### 8.2 Full-screen tablet

Desktop:

```
┌ EVA · SOL 4995 · −71…−5 °C · RAD NOMINAL ─────────────────────┐
│ [BRIEF] [MAP] [LOADOUT]                         [FIELD MANUAL] │
│ ┌──────────────┐ ┌──────────────────────────────────────────┐ │
│ │ OBJECTIVE    │ │  MAP                                     │ │
│ │ Hematite     │ │   ◉ YOU                                  │ │
│ │ sample       │ │   ─── fastest                            │ │
│ │              │ │   ─── safest                            │ │
│ │ Reward       │ │   ◇ sample target                       │ │
│ │ Tools        │ │                                          │ │
│ └──────────────┘ └──────────────────────────────────────────┘ │
│ ┌ ROUTE ────────────────────────────────────────────────────┐ │
│ │ Fastest  1h10 · O2 42% · PWR 61% · 12° · LOW             │ │
│ │ Safest   1h35 · O2 51% · PWR 68% · 8°  · LOW             │ │
│ │ Science  2h05 · O2 63% · PWR 74% · 14° · MED             │ │
│ │ [Review loadout]                    [Begin EVA]          │ │
│ └───────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Mobile: map fills the screen; bottom sheet has **Plan / Loadout / Review** tabs; top status bar.

### 8.3 Screens

1. **Brief** — objective card, sol/weather, EVA window, required tools, reward.
2. **Map** — astronaut marker, search, destination, three routes, layers, add stop.
3. **Loadout** — backpack grid, mass meter, O2/power projection, recommended kit, warnings.
4. **Review** — timeline, readiness ring, turn-back, commit.
5. **Navigation** — next instruction, resource bars, sample prompts, events, return/abort.
6. **Debrief** — grades, samples, dose, equipment used, unlock, field log.

### 8.4 Map visual language

- Astronaut: white ring, amber core, heading cone.
- Destination: flag pin.
- Sample: diamond.
- Rover: square.
- Comms shadow: hatched overlay.
- Radiation: warm translucent contours.
- Slope: red >20°, amber 12–20°.
- Route: white line, selected amber; alternatives thin.
- Turn-back: amber dashed line, label.

---

## 9. Route alternatives: implementation shape

Reuse the current A* engine, but run it three times with different cost profiles:

| Profile | Cost emphasis | Avoids | Output |
|---|---|---|---|
| Fastest | distance + slope | >25° hard | lowest time |
| Safest | slope, radiation, comms | >18° strongly | lowest risk |
| Science | objective detour bonus | >20° | most objectives |

### Equipment feedback

- Heavy pack → speed penalty → fastest route loses its advantage.
- Radiation vest → lower dose → safe route may become unnecessary.
- Missing drill → hematite objective disabled; route still allowed but science score is zero.
- Rover → new edge types and a forward-cache option.

### No-route state

Instead of a dead end:

> “No route fits the current suit envelope. Try: drop the spectrometer (−2.6 kg), add a spare O2 (+1.2 h), or move the rover cache 2 km forward.”

This is a puzzle, not an error.

---

## 10. Mission run

The run is a **navigation checklist**, not a 3D walking simulator.

- Each leg: heading, distance, slope, expected time, comms/radiation flags.
- Next instruction banner: “Head 166° for 420 m; ridge ahead, 18°.”
- Resource bars update per leg.
- Events: solar gust, comms shadow, loose slope, sample encounter.
- At a sample stop: hold to drill/scan; tool check; sample mass added.
- Return leg: same map, reversed; turn-back line visible.
- Abort: always available; debrief immediately.

This keeps the scope achievable and makes the planning choices legible.

---

## 11. References and what to borrow

| Reference | What it does well | What to borrow |
|---|---|---|
| **Google Maps** | Blue dot, route alternatives, bottom sheet | The entire planning interaction model |
| **Death Stranding** | Cargo weight/placement changes movement and risk; route planning is the game ([cargo guide](https://www.gametruth.com/guides/death-stranding-cargo-management-guide-route-planning-and-weight-balance/), [UI analysis](https://www.nevaehli.com/uiux-analysis/death-stranding)) | Weight/loadout trade-offs, prep as gameplay |
| **Subnautica** | Oxygen/depth limits, beacons, vehicle range ([map guide](https://www.abyssguides.com/games/subnautica/map)) | Resource-gated exploration, beacons, “how far can I go?” |
| **No Man’s Sky** | Galaxy map, fuel range, scanning ([galactic map](https://nomanssky.fandom.com/wiki/Galactic_Map)) | Range-limited route preview, scan-to-reveal |
| **Kerbal Space Program** | Maneuver nodes and Δv budgeting ([node docs](https://ksp-kos.github.io/KOS/structures/vessels/node.html)) | Visual resource budget; plan before commit |
| **Pacific Drive** | Journey map + car loadout + anomalies ([route info](https://www.reddit.com/r/pacificDrive/comments/1e5hset/what_does_the_info_in_the_map_journey_routing/)) | Route card with risk/condition; vehicle as build choice |
| **Surviving Mars** | Sector map and resource routes ([map wiki](https://survivingmars.paradoxwikis.com/Map)) | Sector/route overview; resource logistics |
| **The Long Dark** | Weather, supplies, map reading | Conditions that change the value of a route |
| **Outer Wilds** | Ship log / rumor map | Discovery log; knowledge as progression |
| **Firewatch** | Diegetic paper map and compass | In-world map feel, not a dashboard |
| **Mass Effect** | Galaxy map, fuel/probes | Route range and resupply |
| **Astroneer** | Tethers and oxygen routes | Visible life-support topology |

**Do not borrow:** inventory Tetris, hunger/thirst meters, combat, crafting trees, open-world bloat, or punitive death. The game is **judgment under constraints**, not survival inventory management.

---

## 12. Technical plan

### 12.1 New feature module

```
src/traverse/
  TraverseMode.tsx        full-screen tablet shell + state machine
  GlobeBeacon.tsx         astronaut marker on Cesium globe
  MapStage.tsx            Leaflet map, astronaut, routes, POIs, layers
  MissionBrief.tsx        objective + sol/weather + requirements
  RouteSheet.tsx          three alternatives + ETA/resources
  LoadoutPanel.tsx        equipment cards, mass, recommended kit
  ReviewSheet.tsx         readiness, timeline, warnings, commit
  Navigation.tsx          turn-by-turn + resource bars + events
  Debrief.tsx             grades, samples, unlock, field log
  equipment.ts            item catalogue + derived stats
  objectives.ts           science board + tool gates
  sites.ts                curated + arbitrary site model, data grade
  terrain.ts              local DEM/imagery fetch, GeoTIFF parse, IndexedDB cache
  missionGen.ts           terrain-generated objectives anywhere
  planner.ts              route profiles, resource math, turn-back
  state.ts                brief → plan → loadout → review → run → debrief
```

### 12.2 Reuse

- `src/fieldatlas/dem.ts` — extend from a fixed Gale DEM to a dynamic `Dem` window (bbox, width, height, pixel size).
- `src/fieldatlas/route.ts` — extract the A* call and metrics; add `profile` and `loadout`.
- `src/fieldatlas/grid.ts` — unchanged; the nav grid is built from whatever DEM window is loaded.
- `src/fieldatlas/Profile.tsx`, `Safety.tsx` — reuse in Review/Debrief.
- HiRISE/DEM overlays — reuse for field sites; MOLA/HRSC local relief for recon.
- `DataPanel` — becomes the Field Manual.
- POV images — sample and stop cards for curated sites.

### 12.3 New data and runtime services

- `equipment.json` — items, mass, effects, tool tags.
- `objectives.json` — curated science board, requirements, rewards.
- `sites.json` — curated high-res sites, landing sites, data grade.
- `route-intel.json` — unlock state (P1).
- Mars Trek global DEM export (`Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw`) — local Float32 GeoTIFF.
- Mars Trek MOLA/HRSC colour shade — local recon basemap.
- `geotiff.js` — browser GeoTIFF parsing.
- IndexedDB — cache DEM/imagery by site bbox and resolution.

### 12.4 Globe changes

- Add a site picker: click anywhere on the globe, or search/choose a named feature.
- Move the astronaut beacon to the current site.
- Clicking the beacon opens TraverseMode.
- Remove the top `Plan` tab and the `Plan traverse` CTA.
- Keep the globe as the orbital home; no local 3D walking.

### 12.5 Persistence

- `localStorage`: current site, loadout preset, completed objectives, unlocked items, best grades.
- IndexedDB: cached local DEM/imagery windows.
- No backend; no accounts.

### 12.6 Testing

- Pure functions for mass, O2, power, dose, route profiles.
- Acceptance tests for tool gating and no-route suggestions.
- Manual demo path on desktop and 390 px mobile.

---

## 13. Scope and sequence

### P0 — first playable (one focused build pass)

- Globe site picker + astronaut beacon; remove Plan tab/FieldAtlas.
- Any point on Mars → site card → local 200 m DEM + local map (recon).
- Gale → field mode with 1 m DEM/HiRISE.
- Full-screen map with astronaut, destination search, three routes.
- Loadout with 6 items (O2, battery, vest, drill, spectrometer, bags).
- Resource/ETA model; readiness; review; commit.
- Navigation with legs, sample interaction, return/abort.
- Debrief with grade and one unlock.
- One generated objective chain at an arbitrary site; one curated chain at Gale.

**Cut from P0:** detailed rover upgrades/cargo, additional 1 m sites, save/share, audio, dynamic weather events beyond solar toggle. P0 includes only a **recon rover mode** as the default for arbitrary sites; full rover systems are P1.

### P1 — the game layer

- Full rover mode: cargo, power, forward cache, repairs.
- Science board with 3–5 contracts.
- Discovery/scan POIs.
- Unlocks and field log.
- Save/share plan.
- Comms/radiation layers and events.
- Additional high-res sites (Endeavour, Victoria, Columbia Hills, InSight where data supports).

### P2 — depth

- Additional field sites and long rover campaigns; daily challenge; mission patches.
- Audio/radio voice.
- Route intel and shortcuts.
- Crew pair assignment.

### Rough effort

- P0: 10–12 h (site fetch + field/recon modes add work over the Gale-only plan).
- P1: +1 build day.
- P2: post-deadline.

---

## 14. Acceptance criteria for the first playable

1. From the globe, clicking any point opens a site card with coordinates and data grade.
2. Setting a site moves the astronaut beacon there; clicking it opens Traverse; there is no Plan tab.
3. The astronaut is visibly “you” on the map, with heading and position.
4. A non-featured site loads a 200 m recon DEM and shows `MOLA 200 m · RECON`.
5. Gale loads the baked 1 m field DEM and shows `HIRISE 1 m · FIELD`.
6. Tapping a destination returns three routes with time/O2/power/dose/risk.
7. Changing the loadout changes speed, reserve, and route viability.
8. A missing drill blocks the sample objective before commit.
9. The Review screen shows readiness, turn-back, and warnings.
10. Begin EVA enters turn-by-turn navigation.
11. Sampling consumes dwell time and adds sample mass / science.
12. Abort or return produces a debrief with a grade.
13. The first completion unlocks one item or one new objective.
14. Works at 1600 px and 390 px.
15. No console errors; no fake data labels.

### Ten-minute demo path

1. Globe → click Olympus Mons (or any point); site card shows `MOLA 200 m · RECON`; set site.
2. Beacon moves; open Traverse; generated objective “Local high point.”
3. Compare Fastest/Safest/Science on the 200 m DEM.
4. Loadout: add O2 and sample bags; see the mass penalty.
5. Review: recon-grade warning; commit.
6. Navigate two legs; sample; return.
7. Debrief; then return to globe, select Gale, open field mode.
8. Gale: real hematite objective, 1 m DEM, HiRISE; complete a field EVA.

---

## 15. Open decisions

1. **Map surface:** 2D Leaflet field tablet (implemented) vs 3D Cesium local planning.
2. **Anywhere default:** Recon Rover for non-featured sites (chosen and implemented) vs Recon Foot with a clear grade warning.
3. **High-res sites:** additional 1–5 m sites in P1 (recommended) vs only Gale.
4. **Rover systems:** detailed rover cargo/cache/repairs in P1 (recommended) vs P0.
5. **Tone:** grounded NASA sim with game feel (implemented) vs arcade.
6. **Progression:** light unlocks (recommended) vs no meta-progression.
7. **Failure:** abort/debrief only (implemented) vs stricter resource failure.

---

## 16. What stays from the current app

- Cesium Mars globe, sectors, search, labels, LOD, stars, sun toggle.
- Real Gale HiRISE, DEM, slope, geology, POV images.
- A*, turn-back, suit/solar/thermal safety math.
- Data provenance and Field Manual.
- The overall Orbital visual language.

## 17. What this is not

- Not a real-time 3D walking simulator.
- Not a survival game with hunger/thirst/inventory Tetris.
- Not a combat or crafting game.
- Not a mission-design tool for a whole Mars program.
- Not 1 m terrain everywhere: outside high-res sites, the game is explicitly reconnaissance-grade.
- Not fake equipment specs; all values are labelled planning models.
