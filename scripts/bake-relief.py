from PIL import Image, ImageEnhance
import numpy as np
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
base = Image.open(root / "public" / "data" / "globe" / "mars-viking-4k.jpg").convert("RGB")
shade = Image.open(root / "public" / "data" / "globe" / "mars-mola-shade-4k.jpg").convert("L")
shade = shade.resize(base.size, Image.LANCZOS)

b = np.asarray(base, dtype=np.float32)
s = np.asarray(shade, dtype=np.float32) / 255.0
mean = float(s.mean())
factor = np.clip(1.0 + (s - mean) * 1.45, 0.7, 1.3)
out = np.clip(b * factor[..., None], 0, 255).astype(np.uint8)
im = Image.fromarray(out, "RGB")
im = ImageEnhance.Contrast(im).enhance(1.06)
im = ImageEnhance.Color(im).enhance(1.16)
im = ImageEnhance.Brightness(im).enhance(0.98)
path = root / "public" / "data" / "globe" / "mars-viking-relief-4k.jpg"
im.save(path, "JPEG", quality=90, optimize=True)
print("relief baked", path)
