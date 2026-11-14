from PIL import Image, ImageEnhance, ImageFilter
import pathlib

path = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "globe" / "mars-viking-4k.jpg"
im = Image.open(path).convert("RGB")
im = ImageEnhance.Contrast(im).enhance(1.06)
im = im.filter(ImageFilter.UnsharpMask(radius=1.35, percent=95, threshold=2))
im.save(path, "JPEG", quality=90, optimize=True)
print("sharpened", path, path.stat().st_size)
