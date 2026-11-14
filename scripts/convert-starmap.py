from PIL import Image
import numpy as np
import OpenEXR
import Imath
import pathlib
import sys

src = pathlib.Path(sys.argv[1])
dst = pathlib.Path(sys.argv[2])

f = OpenEXR.InputFile(str(src))
hdr = f.header()
dw = hdr["dataWindow"]
w = dw.max.x - dw.min.x + 1
h = dw.max.y - dw.min.y + 1
pt = Imath.PixelType(Imath.PixelType.FLOAT)

channels = []
for name in ("R", "G", "B"):
    data = f.channel(name, pt)
    channels.append(np.frombuffer(data, dtype=np.float32).reshape(h, w))
rgb = np.stack(channels, axis=-1)
print("linear", w, h, float(rgb.min()), float(rgb.max()), float(rgb.mean()))

# Simple exposure + gamma tone map for an 8-bit star map.
scale = np.percentile(rgb, 99.95)
rgb = np.clip(rgb / max(scale, 1e-6), 0, 1)
rgb = np.power(rgb, 1 / 2.2) * 255
Image.fromarray(rgb.astype(np.uint8), "RGB").save(dst, "JPEG", quality=92, optimize=True)
print("wrote", dst, dst.stat().st_size)
