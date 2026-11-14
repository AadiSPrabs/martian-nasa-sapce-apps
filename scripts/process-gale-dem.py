from PIL import Image, ImageFilter
import numpy as np
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "gale"
BBOX = [137.32, -4.76, 137.46, -4.60]
MARS_R = 3396190.0

im = Image.open(DATA / "dem.tif")
arr = np.array(im, dtype=np.float32)
h, w = arr.shape
print(f"DEM {w}x{h} range {float(np.nanmin(arr)):.1f}..{float(np.nanmax(arr)):.1f}")

# Pixel dimensions on Mars at this latitude.
lon_m = np.radians(BBOX[2] - BBOX[0]) * MARS_R * np.cos(np.radians((BBOX[1] + BBOX[3]) / 2))
lat_m = np.radians(BBOX[3] - BBOX[1]) * MARS_R
dx = lon_m / w
dy = lat_m / h
print(f"pixel {dx:.2f} x {dy:.2f} m")

# Int16 elevation grid, row-major, north at row 0.
dem_i16 = np.clip(np.rint(arr), -32768, 32767).astype("<i2")
dem_i16.tofile(DATA / "dem.bin")

meta = {
    "bbox": BBOX,
    "width": w,
    "height": h,
    "pixelSizeM": [round(dx, 4), round(dy, 4)],
    "min": round(float(arr.min()), 2),
    "max": round(float(arr.max()), 2),
    "verticalDatum": "MOLA areoid",
    "heightOffsetM": 0,
    "source": "NASA/JPL-Caltech/USGS Gale DEM 1 m via Mars Trek",
}
(DATA / "dem.json").write_text(json.dumps(meta, indent=2))
print("wrote dem.bin / dem.json")

# Gradients and slope.
gy, gx = np.gradient(arr, dy, dx)
slope = np.degrees(np.arctan(np.hypot(gx, gy)))
print(
    "slope p50/p90/max",
    round(float(np.percentile(slope, 50)), 2),
    round(float(np.percentile(slope, 90)), 2),
    round(float(slope.max()), 2),
)

# Hillshade, sun from NW at 35 degrees.
az = np.radians(315.0)
alt = np.radians(35.0)
hs = np.sin(alt) + np.cos(alt) * np.cos(az) * gx + np.cos(alt) * np.sin(az) * gy
hs = np.clip(hs, 0, 1)
hs = (hs - hs.min()) / (hs.max() - hs.min() + 1e-9)
hs_img = Image.fromarray((hs * 255).astype(np.uint8), "L")
hs_img = hs_img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=2))
hs_img.save(DATA / "hillshade.webp", "WEBP", quality=82)
print("wrote hillshade.webp")

# Slope overlay: transparent, color-coded.
rgba = np.zeros((h, w, 4), dtype=np.uint8)
rgba[slope < 10] = [62, 104, 118, 0]
safe = slope < 10
mod = (slope >= 10) & (slope < 20)
high = slope >= 20
rgba[safe] = [62, 104, 118, 0]
rgba[mod] = [201, 154, 63, 150]
rgba[high] = [179, 64, 46, 185]
Image.fromarray(rgba, "RGBA").save(DATA / "slope.png")
print("wrote slope.png")
