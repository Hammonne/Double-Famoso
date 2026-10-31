"""Análisis por oclusión para la ventana "Doble famoso".

Idea (occlusion sensitivity, Zeiler & Fergus 2014): se tapa una zona del rostro,
se recalcula el embedding y se mide cuánto cambia la distancia euclidiana.
Para no introducir un parche compartido (que acercaría artificialmente a las dos
caras), se tapa UNA foto a la vez y se promedia:
    delta = ½·[d(consulta tapada, famoso) − d0] + ½·[d(consulta, famoso tapado) − d0]
  delta > 0  → al quitar esa zona se alejan: la zona los hacía PARECIDOS
  delta < 0  → al quitar esa zona se acercan: la zona los DIFERENCIABA

Mide qué zonas usa el modelo para su decisión; no "qué tan parecidos son los
ojos" en sentido humano. Las 128 dimensiones no son interpretables una a una.

Uso con tus datos reales (entorno vision), ANTES de export_thumbs.py:
    python web/tools/occlusion.py --consulta mi_foto.jpg
La ruta de tu foto solo se lee: NO se escribe en data.js.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import face_recognition
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_thumbs import CROP, SIZE  # noqa: E402  (mismo recorte que las miniaturas)

WEB = Path(__file__).resolve().parent.parent
PAD = 4
ZONAS = [  # (clave, etiqueta, partes de face_landmarks)
    ("ojos", "Ojos", ["left_eye", "right_eye"]),
    ("cejas", "Cejas", ["left_eyebrow", "right_eyebrow"]),
    ("nariz", "Nariz", ["nose_bridge", "nose_tip"]),
    ("boca", "Boca", ["top_lip", "bottom_lip"]),
    ("contorno", "Contorno / mandíbula", ["chin"]),
    ("frente", "Frente / cabello", None),   # sobre las cejas
]


def cargar(path):
    img = face_recognition.load_image_file(str(path))
    locs = face_recognition.face_locations(img)
    if not locs:
        return None
    # el primer rostro detectado, igual que encodings[0] en el notebook
    loc = locs[0]
    marks = face_recognition.face_landmarks(img, [loc])
    if not marks:
        return None
    emb = face_recognition.face_encodings(img, known_face_locations=[loc])[0]
    return {"img": img, "loc": loc, "marks": marks[0], "emb": emb}


def caja(cara, partes):
    """Rectángulo (x0, y0, x1, y1) de la zona, en píxeles de la imagen original."""
    h, w = cara["img"].shape[:2]
    if partes is None:  # frente / cabello: desde arriba del rostro hasta las cejas
        top, right, bottom, left = cara["loc"]
        cejas = cara["marks"]["left_eyebrow"] + cara["marks"]["right_eyebrow"]
        y1 = min(y for _, y in cejas) - 2
        y0 = max(0, top - int(0.35 * (bottom - top)))
        return max(0, left), y0, min(w, right), max(y0 + 1, y1)
    pts = [p for parte in partes for p in cara["marks"][parte]]
    xs, ys = [x for x, _ in pts], [y for _, y in pts]
    return (max(0, min(xs) - PAD), max(0, min(ys) - PAD), min(w, max(xs) + PAD), min(h, max(ys) + PAD))


def tapar(cara, clave, box):
    """Pinta la zona de gris neutro y devuelve el nuevo embedding."""
    im = Image.fromarray(cara["img"])
    dr = ImageDraw.Draw(im)
    if clave == "contorno":  # banda a lo largo de la mandíbula, no un rectángulo
        top, right, bottom, left = cara["loc"]
        dr.line(cara["marks"]["chin"], fill=(128, 128, 128), width=max(6, (right - left) // 7), joint="curve")
    else:
        dr.rectangle(box, fill=(128, 128, 128))
    enc = face_recognition.face_encodings(np.asarray(im), known_face_locations=[cara["loc"]])
    return enc[0]


def a_miniatura(box, shape):
    """Convierte la caja al sistema de coordenadas de la miniatura (0..1)."""
    h, w = shape[:2]
    c = min(CROP, w, h)
    cx0, cy0 = (w - c) // 2, (h - c) // 2 - c // 12
    x0, y0, x1, y1 = box
    f = lambda v, o: round(min(1, max(0, (v - o) / c)), 4)
    return [f(x0, cx0), f(y0, cy0), f(x1, cx0), f(y1, cy0)]


def analizar(consulta, famoso_src):
    fam = cargar(famoso_src)
    if fam is None:
        return None
    d0 = float(np.linalg.norm(consulta["emb"] - fam["emb"]))
    zonas = []
    for clave, etiqueta, partes in ZONAS:
        bq, bf = caja(consulta, partes), caja(fam, partes)
        dq = float(np.linalg.norm(tapar(consulta, clave, bq) - fam["emb"]))
        df = float(np.linalg.norm(consulta["emb"] - tapar(fam, clave, bf)))
        zonas.append({"key": clave, "label": etiqueta, "delta": round((dq + df) / 2 - d0, 4),
                      "box": a_miniatura(bf, fam["img"].shape)})
    return {"d0": round(d0, 4), "zones": zonas}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--consulta", required=True, help="foto de consulta (no se publica)")
    args = ap.parse_args()

    consulta = cargar(args.consulta)
    if consulta is None:
        sys.exit("No se detectó un rostro en la foto de consulta.")
    path = WEB / "data.js"
    text = path.read_text(encoding="utf-8")
    data = json.loads(text[text.index("{"): text.rindex("}") + 1])
    for f in data["famoso"]:
        if "src" not in f:
            sys.exit("Corre occlusion.py ANTES de export_thumbs.py (necesita los 'src').")
        f["occlusion"] = analizar(consulta, f["src"])
        print(f'{f["name"]}: d0={f["occlusion"]["d0"] if f["occlusion"] else "—"}')
    path.write_text("window.LAB_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    main()
