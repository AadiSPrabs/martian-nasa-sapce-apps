import { useEffect, useRef, useState } from "react";
import type { Viewer } from "cesium";

import { GlobeView } from "./globe/GlobeView";
import { getMarsSun } from "./globe/mars24";
import { flyToPlace, setLabelsVisible } from "./globe/sectors";
import type { GlobePlace, HoverInfo } from "./globe/types";
import { SitePicker } from "./traverse/SitePicker";
import { TraverseMode } from "./traverse/TraverseMode";
import { CURATED_SITES, siteFromPoint, type Site } from "./traverse/terrain";
import { Controls } from "./ui/Controls";
import { HoverTooltip } from "./ui/HoverTooltip";
import { LayersPanel } from "./ui/LayersPanel";
import { SectorCard } from "./ui/SectorCard";
import { TopRibbon } from "./ui/TopRibbon";

export default function App() {
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<GlobePlace | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [site, setSite] = useState<Site>(CURATED_SITES[0]);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [pickSiteMode, setPickSiteMode] = useState(false);
  const [evaOpen, setEvaOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [labelsOn, setLabelsOn] = useState(true);
  const [sunOn, setSunOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [sun, setSun] = useState(() => getMarsSun());
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const viewerRef = useRef<Viewer | null>(null);

  const openSite = (next: Site) => {
    setSite(next);
    setSelection(null);
    setSitePickerOpen(false);
    setPickSiteMode(false);
    setEvaOpen(true);
  };

  useEffect(() => {
    const id = window.setInterval(() => setSun(getMarsSun()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pickSiteMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickSiteMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickSiteMode]);

  return (
    <main className="app">
      <GlobeView
        onReady={() => setReady(true)}
        onHover={setHover}
        onSelect={(place) => {
          if (pickSiteMode) {
            openSite(siteFromPoint(place.lon, place.lat));
            return;
          }
          setSelection(place);
        }}
        onSurfaceClick={(lon, lat) => {
          if (pickSiteMode) {
            openSite(siteFromPoint(lon, lat));
            return;
          }
          if (Math.abs(lon - site.lon) < 0.45 && Math.abs(lat - site.lat) < 0.45) {
            setEvaOpen(true);
          }
        }}
        site={site}
        onViewer={(v) => {
          viewerRef.current = v;
          setViewer(v);
        }}
        sunOn={sunOn}
      />
      <TopRibbon
        onSearchSelect={(place) => {
          setSelection(place);
          setHover(null);
          if (viewerRef.current) flyToPlace(viewerRef.current, place);
        }}
        onPlan={() => setSitePickerOpen(true)}
        onLayers={() => setLayersOpen((v) => !v)}
        labelsOn={labelsOn}
        onLabels={() => {
          const next = !labelsOn;
          setLabelsOn(next);
          if (viewerRef.current) setLabelsVisible(viewerRef.current, next);
        }}
        sunOn={sunOn}
        onSun={() => setSunOn((value) => !value)}
        onMissions={() => setSitePickerOpen(true)}
        onShare={() => {
          navigator.clipboard
            .writeText(window.location.href)
            .then(() => setToast("Link copied"))
            .catch(() => setToast("Copy failed"));
          window.setTimeout(() => setToast(null), 2200);
        }}
      />

      <div className={`boot ${ready ? "done" : ""}`} aria-hidden={ready}>
        <div className="boot-inner">
          <div className="boot-mark" />
          <div className="boot-word">GROUNDTRUTH</div>
          <div className="boot-sub">ESTABLISHING MARS ORBIT</div>
          <div className="boot-line">
            <i />
          </div>
        </div>
      </div>

      {selection && (
        <SectorCard
          place={selection}
          onClose={() => setSelection(null)}
          onFly={() => {
            if (viewerRef.current) flyToPlace(viewerRef.current, selection);
          }}
          canPlan={selection.kind === "landing" || selection.kind === "feature"}
          onPlan={() => openSite(siteFromPoint(selection.lon, selection.lat))}
        />
      )}

      {hover && !selection && <HoverTooltip hover={hover} />}

      {layersOpen && <LayersPanel viewer={viewer} onClose={() => setLayersOpen(false)} />}

      <div className="breadcrumb">
        MARS
        {selection && (
          <>
            <i>›</i>
            <b>{selection.name.toUpperCase()}</b>
          </>
        )}
      </div>

      <div className="sun-readout">
        {sunOn
          ? `SUN ${sun.lonEast.toFixed(0)}°E · Ls ${sun.ls.toFixed(0)}° · MTC ${String(
              Math.floor(sun.mstHours),
            ).padStart(2, "0")}:${String(
              Math.floor((sun.mstHours % 1) * 60),
            ).padStart(2, "0")}`
          : "EVEN LIGHTING · SUN OFF"}
      </div>

      <div className="credits">
        <span>NASA/JPL-CALTECH · USGS · CESIUM</span>
        <span className="credit-dim">VIKING · MOLA · MARS TREK</span>
      </div>

      <Controls viewer={viewer} />

      {toast && <div className="toast">{toast}</div>}

      {pickSiteMode && (
        <div className="pick-site-banner">CLICK ANYWHERE ON MARS · ESC TO CANCEL</div>
      )}

      {sitePickerOpen && (
        <SitePicker
          onClose={() => setSitePickerOpen(false)}
          onSelect={openSite}
          onPickGlobe={() => {
            setSitePickerOpen(false);
            setPickSiteMode(true);
            setSelection(null);
          }}
        />
      )}

      {evaOpen && (
        <TraverseMode
          site={site}
          onClose={() => setEvaOpen(false)}
          onChangeSite={() => {
            setEvaOpen(false);
            setSitePickerOpen(true);
          }}
        />
      )}
    </main>
  );
}
