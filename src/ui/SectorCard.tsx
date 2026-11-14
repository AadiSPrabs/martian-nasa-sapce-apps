import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { ArrowRight, Compass, Route, X } from "lucide-react";

import type { GlobePlace } from "../globe/types";

type FeatureContent = {
  name: string;
  description: string;
  caption: string;
  image: string | null;
  source: string;
};

let featureContentPromise: Promise<Record<string, FeatureContent>> | null = null;

function loadFeatureContent(): Promise<Record<string, FeatureContent>> {
  if (!featureContentPromise) {
    featureContentPromise = fetch("/data/globe/feature-content.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((items: FeatureContent[]) =>
        Object.fromEntries(items.map((item) => [item.name, item])),
      )
      .catch(() => ({}));
  }
  return featureContentPromise;
}

type SectorCardProps = {
  place: GlobePlace;
  onClose: () => void;
  onFly: () => void;
  onPlan?: () => void;
  canPlan?: boolean;
};

const KIND_LABEL: Record<GlobePlace["kind"], string> = {
  region: "Region",
  quad: "Quadrangle",
  feature: "Major feature",
  landing: "Landing site",
  traverse: "Traverse",
};

function description(place: GlobePlace): string {
  if (place.kind === "region") {
    return "A named region in the NASA Mars Trek catalogue. Hover the globe to inspect sectors; click any outline to fly in.";
  }
  if (place.kind === "quad") {
    return "One of the thirty MC 5M quadrangles used to divide the Martian surface for mapping.";
  }
  if (place.kind === "landing") {
    return `Landing site for ${place.mission ?? "a Mars mission"}${
      place.year ? ` (${place.year})` : ""
    }. Real surface imagery and traverse data are available from the mission archive.`;
  }
  return "A major named feature in the Mars Trek gazetteer, with a real surface image and description.";
}

function formatCoord(value: number, axis: "lon" | "lat"): string {
  const dir =
    axis === "lon" ? (value >= 0 ? "E" : "W") : value >= 0 ? "N" : "S";
  return `${Math.abs(value).toFixed(2)}°${dir}`;
}

export function SectorCard({ place, onClose, onFly, onPlan, canPlan }: SectorCardProps) {
  const [content, setContent] = useState<FeatureContent | null>(null);

  useEffect(() => {
    let active = true;
    if (place.kind !== "feature") {
      setContent(null);
      return;
    }
    loadFeatureContent().then((map) => {
      if (active) setContent(map[place.name] ?? null);
    });
    return () => {
      active = false;
    };
  }, [place.kind, place.name]);

  const x = ((place.lon + 180) / 360) * 100;
  const y = ((90 - place.lat) / 180) * 100;
  const accent = place.color ?? "#C25A3C";
  const heroStyle: CSSProperties = content?.image
    ? {
        backgroundImage: `url(${content.image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        backgroundImage: "url(/data/globe/mars-viking-4k.jpg)",
        backgroundSize: "360% 180%",
        backgroundPosition: `${x}% ${y}%`,
      };

  return (
    <aside className="sector-card" style={{ "--card-accent": accent } as CSSProperties}>
      <div className="sector-hero" style={heroStyle}>
        <span className="sector-tag">
          {KIND_LABEL[place.kind]} · MARS
        </span>
        <button className="sector-close" onClick={onClose} aria-label="Close">
          <X size={15} strokeWidth={1.7} />
        </button>
      </div>

      <div className="sector-body">
        <div className="sector-eyebrow">
          {place.mission ? `${place.mission} · ${place.year ?? "MARS"}` : "MARS TREK · GAZETTEER"}
        </div>
        <h2>{place.name}</h2>
        <p>{content?.description ?? description(place)}</p>
        {content?.caption && <small className="sector-credit">{content.caption}</small>}

        <div className="sector-facts">
          <div>
            <label>Center</label>
            <b>
              {formatCoord(place.lon, "lon")} · {formatCoord(place.lat, "lat")}
            </b>
          </div>
          <div>
            <label>Type</label>
            <b>{KIND_LABEL[place.kind]}</b>
          </div>
        </div>

        <div className="sector-badges">
          <span className="sector-badge on">Viking 232 m/px</span>
          <span className="sector-badge on">MOLA 200 m/px</span>
          <span className="sector-badge">Recon</span>
        </div>

        <div className="sector-actions">
          <button className="btn-secondary" onClick={onFly}>
            <Compass size={13} strokeWidth={1.7} />
            Fly here
          </button>
          <button
            className="btn-primary"
            disabled={!canPlan}
            title={canPlan ? "Open the Gale field atlas" : "Full EVA planning is available at Gale Crater"}
            onClick={onPlan}
          >
            <Route size={13} strokeWidth={1.7} />
            Plan traverse
            <ArrowRight size={13} strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </aside>
  );
}
