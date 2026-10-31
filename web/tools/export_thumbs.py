"""Crea las miniaturas de las fotos de LFW que usa web/data.js.

En data.js, cada objeto que tenga una foto lleva "src": ruta local del .jpg de LFW.
Este script, para cada "src":
  1. recorta el centro (LFW centra el rostro en imágenes de 250×250),
  2. reduce a 96×96 y guarda en web/img/<nombre>.jpg,
  3. reemplaza "src" por "img": "img/<nombre>.jpg" (ruta relativa que sirve en GitHub Pages).

Uso (con el entorno vision, que trae Pillow):
    python web/tools/export_thumbs.py
"""
import json
import re
from pathlib import Path

from PIL import Image

WEB = Path(__file__).resolve().parent.parent
IMG = WEB / "img"
SIZE = 96
CROP = 150   # lado del recorte central (de 250 px)


def thumb(src: Path) -> str:
    name = re.sub(r"[^\w.-]", "_", src.stem) + ".jpg"
    dst = IMG / name
    if not dst.exists():
        im = Image.open(src).convert("RGB")
        w, h = im.size
        c = min(CROP, w, h)
        box = ((w - c) // 2, (h - c) // 2 - c // 12, (w + c) // 2, (h + c) // 2 - c // 12)
        im.crop(box).resize((SIZE, SIZE), Image.LANCZOS).save(dst, quality=82, optimize=True)
    return f"img/{name}"


def walk(obj):
    if isinstance(obj, dict):
        if "src" in obj:
            obj["img"] = thumb(Path(obj.pop("src")))
        for v in obj.values():
            walk(v)
    elif isinstance(obj, list):
        for v in obj:
            walk(v)


def main():
    path = WEB / "data.js"
    text = path.read_text(encoding="utf-8")
    data = json.loads(text[text.index("{"): text.rindex("}") + 1])
    IMG.mkdir(exist_ok=True)
    walk(data)
    path.write_text("window.LAB_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    n = len(list(IMG.glob("*.jpg")))
    kb = sum(p.stat().st_size for p in IMG.glob("*.jpg")) // 1024
    print(f"{n} miniaturas en web/img ({kb} KB)")


if __name__ == "__main__":
    main()
