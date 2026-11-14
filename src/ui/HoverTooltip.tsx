import type { HoverInfo } from "../globe/types";

const KIND_LABEL: Record<HoverInfo["kind"], string> = {
  region: "Region",
  quad: "Quadrangle",
  feature: "Feature",
  landing: "Landing site",
  traverse: "Traverse",
};

export function HoverTooltip({ hover }: { hover: HoverInfo }) {
  const left = Math.min(hover.x + 16, window.innerWidth - 230);
  const top = Math.min(hover.y + 16, window.innerHeight - 110);

  return (
    <div className="hover-tip" style={{ left, top }}>
      <b>{hover.name}</b>
      <small>
        {KIND_LABEL[hover.kind]}
        {hover.mission ? ` · ${hover.mission}` : ""}
      </small>
      <em>Click to explore →</em>
    </div>
  );
}
