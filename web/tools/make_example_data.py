"""Genera web/data.js con DATOS DE EJEMPLO para previsualizar la página.

Usa fotos y nombres reales de LFW, pero los vecinos, recalls y tiempos son
INVENTADOS. Cuando tengas tus resultados, genera un data.js con el mismo formato
(ver web/README.md) y vuelve a correr export_thumbs.py.

Uso (entorno vision):
    python web/tools/make_example_data.py
"""
import json
import random
import subprocess
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
LFW = WEB.parent / "data" / "lfw"

random.seed(11)
K = 10
IVF_PROBES = [1, 5, 10, 20, 100]
HNSW_EF = [10, 40, 100, 200]
IVF_RECALL = {1: 0.72, 5: 0.91, 10: 0.96, 20: 0.99, 100: 1.0}
HNSW_RECALL = {10: 0.86, 40: 0.97, 100: 0.995, 200: 1.0}
IVF_MS = {1: 0.26, 5: 0.47, 10: 0.71, 20: 1.18, 100: 4.9}
HNSW_MS = {10: 0.29, 40: 0.44, 100: 0.79, 200: 1.36}

fotos = sorted(LFW.glob("*/*.jpg"))
por_persona = {}
for f in fotos:
    por_persona.setdefault(f.parent.name, []).append(f)

# "tabla" de ejemplo: 300 fotos al azar con id ficticio
muestra = random.sample(fotos, 300)
items = {i: f for i, f in enumerate(muestra, start=1)}
ids = list(items)


def aproximar(exacto, recall):
    fallos = sum(random.random() > recall for _ in range(K))
    resultado = list(exacto)
    libres = [i for i in ids if i not in exacto]
    for pos in random.sample(range(K), fallos):
        resultado[pos] = random.choice(libres)
    return resultado


con_2 = [p for p, fs in por_persona.items() if len(fs) >= 2]
queries = []
for qi in range(1, 21):
    persona = random.choice(con_2)
    exacto = random.sample(ids, K)
    queries.append({
        "id": qi,
        "person": persona,
        "src": str(por_persona[persona][0]),
        "exact": exacto,
        "dist": sorted(round(random.uniform(0.28, 0.62), 3) for _ in range(K)),
        "ivf": {str(p): aproximar(exacto, IVF_RECALL[p]) for p in IVF_PROBES},
        "hnsw": {str(e): aproximar(exacto, HNSW_RECALL[e]) for e in HNSW_EF},
    })

usados = {i for q in queries for lst in [q["exact"], *q["ivf"].values(), *q["hnsw"].values()] for i in lst}


def recall_medio(metodo, param):
    r = [len(set(q["exact"]) & set(q[metodo][str(param)])) / K for q in queries]
    return round(sum(r) / len(r), 3)


# "Doble famoso" de ejemplo: una foto de LFW hace de consulta (NO se publica) y se
# buscan de verdad sus 5 personas más parecidas entre las fotos de muestra.
sys.path.insert(0, str(WEB / "tools"))
import numpy as np                      # noqa: E402
import occlusion                        # noqa: E402

consulta_persona = "Nicole_Kidman" if "Nicole_Kidman" in por_persona else random.choice(con_2)
consulta_src = por_persona[consulta_persona][1]
consulta = occlusion.cargar(consulta_src)
print("calculando embeddings de muestra para el doble famoso…")
mejor = {}
for f in muestra:
    if f.parent.name == consulta_persona:
        continue
    cara = occlusion.cargar(f)
    if cara is None:
        continue
    d = float(np.linalg.norm(consulta["emb"] - cara["emb"]))
    if d < mejor.get(f.parent.name, (9, None))[0]:
        mejor[f.parent.name] = (d, f)
top5 = sorted(mejor.items(), key=lambda kv: kv[1][0])[:5]
famoso = []
for nombre, (d, f) in top5:
    famoso.append({"name": nombre, "dist": round(d, 3), "fotos": len(por_persona[nombre]), "src": str(f),
                   "occlusion": occlusion.analizar(consulta, f)})
    print(f"  {nombre}: d={d:.3f}")

data = {
    "meta": {
        "example": True,
        "rows": 13018,
        "k": K,
        "lists": 100,
        "lineal_ms": 5.62,
        "note": "DATOS DE EJEMPLO: fotos reales de LFW, pero vecinos, recall y tiempos inventados.",
    },
    "items": {str(i): {"person": items[i].parent.name, "src": str(items[i])} for i in sorted(usados)},
    "queries": queries,
    "sweep": {
        "ivf": [{"param": p, "recall": recall_medio("ivf", p), "ms": IVF_MS[p]} for p in IVF_PROBES],
        "hnsw": [{"param": e, "recall": recall_medio("hnsw", e), "ms": HNSW_MS[e]} for e in HNSW_EF],
    },
    "scaling": [
        {"N": 1000, "lineal": 0.61, "ivf": 0.24, "ivf_param": 4, "hnsw": 0.19, "hnsw_param": 20},
        {"N": 2000, "lineal": 1.12, "ivf": 0.31, "ivf_param": 5, "hnsw": 0.22, "hnsw_param": 20},
        {"N": 4000, "lineal": 2.15, "ivf": 0.43, "ivf_param": 7, "hnsw": 0.26, "hnsw_param": 40},
        {"N": 8000, "lineal": 4.02, "ivf": 0.58, "ivf_param": 9, "hnsw": 0.30, "hnsw_param": 40},
        {"N": 12000, "lineal": 6.08, "ivf": 0.74, "ivf_param": 11, "hnsw": 0.33, "hnsw_param": 40},
    ],
    "famoso": famoso,
}

(WEB / "data.js").write_text("window.LAB_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
print("data.js escrito; generando miniaturas…")
subprocess.run([sys.executable, str(WEB / "tools" / "export_thumbs.py")], check=True)
