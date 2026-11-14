import { useRef, useState } from "react";
import type { Viewer } from "cesium";

import { FieldAtlas } from "./fieldatlas/FieldAtlas";
import { GlobeView } from "./globe/GlobeView";
import { flyToPlace, setLabelsVisible } from "./globe/sectors";
import type { GlobePlace, HoverInfo } from "./globe/types";
import { Controls } from "./ui/Controls";
import { HoverTooltip } from "./ui/HoverTooltip";
import { LayersPanel } from "./ui/LayersPanel";
import { SectorCard } from "./ui/SectorCard";
import { TopRibbon } from "./ui/TopRibbon";

export default function App() {
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<GlobePlace | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [labelsOn, setLabelsOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const viewerRef = useRef<Viewer | null>(null);

  return (
    <main className="app">
      <GlobeView
        onReady={() => setReady(true)}
        onHover={setHover}
        onSelect={(place) => setSelection(place)}
        onViewer={(v) => {
          viewerRef.current = v;
          setViewer(v);
        }}
      />
      <TopRibbon
        onSearchSelect={(place) => {
          setSelection(place);
          setHover(null);
          if (viewerRef.current) flyToPlace(viewerRef.current, place);
        }}
        onPlan={() => setAtlasOpen(true)}
        onLayers={() => setLayersOpen((v) => !v)}
        labelsOn={labelsOn}
        onLabels={() => {
          const next = !labelsOn;
          setLabelsOn(next);
          if (viewerRef.current) setLabelsVisible(viewerRef.current, next);
        }}
        onMissions={() => setAtlasOpen(true)}
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
          canPlan={selection.kind === "landing" && selection.mission === "Curiosity"}
          onPlan={() => setAtlasOpen(true)}
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

      <div className="credits">
        <span>NASA/JPL-CALTECH · USGS · CESIUM</span>
        <span className="credit-dim">VIKING · MOLA · MARS TREK</span>
      </div>

      <Controls viewer={viewer} />

      {toast && <div className="toast">{toast}</div>}

      {atlasOpen && <FieldAtlas onClose={() => setAtlasOpen(false)} />}
    </main>
  );
}
