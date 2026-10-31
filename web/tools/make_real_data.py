"""Genera web/data.js con los RESULTADOS REALES del lab.

- sweep (P4.1) y scaling (P4.2) se leen de las salidas ya ejecutadas de Lab11_pgvector.ipynb,
  así la página muestra exactamente los mismos números que el notebook
- queries: 20 de las 100 consultas reservadas, buscadas en la tabla con lineal, IVFFlat y HNSW
- famoso: tu doble famoso (solo nombres de LFW y distancias; tu foto NO se escribe en data.js)

Requisitos: notebook ejecutado, tabla face_embeddings completa y embeddings_lfw.pkl
Uso (entorno vision, desde la carpeta del lab):
    python web/tools/make_real_data.py
"""
import ast
import json
import pickle
import re
import shutil
import subprocess
import sys
from pathlib import Path

import face_recognition
import pandas as pd
import psycopg2
from pgvector.psycopg2 import register_vector

WEB = Path(__file__).resolve().parent.parent
LAB = WEB.parent
K = 10
LISTS = 100
IVF_PROBES = [1, 5, 10, 20, 100]
HNSW_EF = [10, 40, 100, 200]
N_QUERIES = 20


def salidas_notebook():
    nb = json.loads((LAB / "Lab11_pgvector.ipynb").read_text(encoding="utf-8"))
    sweep, scaling, lineal_ms = {"ivf": [], "hnsw": []}, [], None
    for c in nb["cells"]:
        if c["cell_type"] != "code":
            continue
        src = "".join(c["source"])
        textos = ["".join(o.get("text") or o.get("data", {}).get("text/plain", "")) for o in c["outputs"]]
        if src.startswith("filas = []"):
            for linea in textos[-1].splitlines():
                m = re.match(r"\s*\d+\s+(IVFFlat|HNSW|Lineal)\s+\S+\s+(\S+)\s+([\d.]+)\s+([\d.]+)", linea)
                if not m:
                    continue
                indice, valor, recall, ms = m.groups()
                if indice == "Lineal":
                    lineal_ms = round(float(ms), 3)
                else:
                    clave = "ivf" if indice == "IVFFlat" else "hnsw"
                    sweep[clave].append({"param": int(float(valor)), "recall": round(float(recall), 3), "ms": round(float(ms), 3)})
        if src.startswith("qs_tiempo"):
            for t in textos:
                if t.startswith("{"):
                    r = ast.literal_eval(t.strip())
                    scaling.append({"N": r["N"], "lineal": round(r["lineal_ms"], 3),
                                    "ivf": round(r["ivf_ms"], 3), "ivf_param": r["ivf_probes"],
                                    "hnsw": round(r["hnsw_ms"], 3), "hnsw_param": r["hnsw_ef_search"]})
    if not (sweep["ivf"] and sweep["hnsw"] and scaling and lineal_ms):
        sys.exit("No encontré las salidas de P4.1/P4.2: ejecuta el notebook completo primero")
    return sweep, scaling, lineal_ms


def consultas_reservadas():
    df = pd.DataFrame(pickle.load(open(LAB / "embeddings_lfw.pkl", "rb")), columns=["person", "path", "embedding"])
    conteo = df.person.value_counts()
    candidatas = df[df.person.isin(conteo[conteo >= 2].index)]
    return candidatas.groupby("person").sample(1, random_state=42).sample(100, random_state=42)


def main():
    sweep, scaling, lineal_ms = salidas_notebook()
    consultas = consultas_reservadas().head(N_QUERIES)

    conn = psycopg2.connect(host="localhost", port=5433, user="postgres", password="123456", dbname="postgres")
    conn.autocommit = True
    register_vector(conn)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM face_embeddings")
    filas = cur.fetchone()[0]

    def knn(q):
        cur.execute("SELECT id FROM face_embeddings ORDER BY embedding <-> %s LIMIT %s", (q, K))
        return [r[0] for r in cur.fetchall()]

    queries = []
    cur.execute("SET enable_indexscan = off")
    for i, fila in enumerate(consultas.itertuples(), start=1):
        cur.execute("SELECT id, embedding <-> %s FROM face_embeddings ORDER BY embedding <-> %s LIMIT %s",
                    (fila.embedding, fila.embedding, K))
        res = cur.fetchall()
        queries.append({"id": i, "person": fila.person, "src": fila.path,
                        "exact": [r[0] for r in res], "dist": [round(float(r[1]), 3) for r in res],
                        "ivf": {}, "hnsw": {}})
    cur.execute("RESET enable_indexscan")

    cur.execute("SET enable_seqscan = off")
    cur.execute("DROP INDEX IF EXISTS face_hnsw")
    cur.execute("DROP INDEX IF EXISTS face_ivf")
    cur.execute(f"CREATE INDEX face_ivf ON face_embeddings USING ivfflat (embedding vector_l2_ops) WITH (lists = {LISTS})")
    cur.execute("ANALYZE face_embeddings")
    for p in IVF_PROBES:
        cur.execute(f"SET ivfflat.probes = {p}")
        for q, fila in zip(queries, consultas.itertuples()):
            q["ivf"][str(p)] = knn(fila.embedding)
    cur.execute("DROP INDEX face_ivf")
    cur.execute("CREATE INDEX face_hnsw ON face_embeddings USING hnsw (embedding vector_l2_ops) WITH (m = 16, ef_construction = 64)")
    cur.execute("ANALYZE face_embeddings")
    for ef in HNSW_EF:
        cur.execute(f"SET hnsw.ef_search = {ef}")
        for q, fila in zip(queries, consultas.itertuples()):
            q["hnsw"][str(ef)] = knn(fila.embedding)
    cur.execute("RESET enable_seqscan")

    usados = sorted({i for q in queries for lst in [q["exact"], *q["ivf"].values(), *q["hnsw"].values()] for i in lst})
    cur.execute("SELECT id, name, path FROM face_embeddings WHERE id = ANY(%s)", (usados,))
    items = {str(i): {"person": name, "src": path} for i, name, path in cur.fetchall()}

    mi_foto = face_recognition.face_encodings(face_recognition.load_image_file(str(LAB / "mi_foto.jpg")))[0]
    cur.execute("SET enable_indexscan = off")
    cur.execute('''
        SELECT name, MIN(dist) AS dist, COUNT(*) AS fotos
        FROM (SELECT name, embedding <-> %s AS dist
              FROM face_embeddings ORDER BY embedding <-> %s LIMIT 50) t
        GROUP BY name ORDER BY dist LIMIT 5''', (mi_foto, mi_foto))
    dobles = cur.fetchall()
    famoso = []
    for name, dist, _ in dobles:
        cur.execute("SELECT path FROM face_embeddings WHERE name = %s ORDER BY embedding <-> %s LIMIT 1", (name, mi_foto))
        path = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM face_embeddings WHERE name = %s", (name,))
        famoso.append({"name": name, "dist": round(float(dist), 3), "fotos": cur.fetchone()[0], "src": path})
    cur.execute("RESET enable_indexscan")
    del mi_foto

    data = {
        "meta": {"example": False, "rows": filas, "k": K, "lists": LISTS, "lineal_ms": lineal_ms,
                 "note": "Resultados reales del Lab 11 (latencias medidas desde Python, mediana por consulta)"},
        "items": items,
        "queries": queries,
        "sweep": sweep,
        "scaling": scaling,
        "famoso": famoso,
    }
    (WEB / "data.js").write_text("window.LAB_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"data.js: {filas} filas, {len(queries)} consultas, {len(items)} fotos, doble = {famoso[0]['name']} ({famoso[0]['dist']})")

    py = sys.executable
    subprocess.run([py, str(WEB / "tools" / "occlusion.py"), "--consulta", str(LAB / "mi_foto.jpg")], check=True)
    shutil.rmtree(WEB / "img", ignore_errors=True)
    (WEB / "img").mkdir()
    subprocess.run([py, str(WEB / "tools" / "export_thumbs.py")], check=True)


if __name__ == "__main__":
    main()
