from PIL import Image
import numpy as np
import py360convert
import pathlib
import sys

src = pathlib.Path(sys.argv[1])
dst = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "skybox"
dst.mkdir(parents=True, exist_ok=True)

im = np.asarray(Image.open(src).convert("RGB"))
faces = py360convert.e2c(im, face_w=1024, mode="bilinear", cube_format="dict")
mapping = {
    "R": "px",
    "L": "nx",
    "U": "py",
    "D": "ny",
    "F": "pz",
    "B": "nz",
}
for key, name in mapping.items():
    Image.fromarray(faces[key]).save(
        dst / f"{name}.jpg", "JPEG", quality=90, optimize=True
    )
    print(name)
print("skybox written", dst)
