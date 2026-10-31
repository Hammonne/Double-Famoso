"""Doble famoso en vivo: cámara -> embedding -> kNN en pgvector (HNSW)

Uso:
    conda activate vision
    python doble_en_vivo.py            # q para salir

Tu cara solo se usa como consulta, no se inserta ni se guarda en ningún lado
"""
import threading
import time

import cv2
import face_recognition
import numpy as np
import psycopg2
from pgvector.psycopg2 import register_vector

ESCALA = 0.25       # la detección se hace sobre el cuadro achicado a 1/4
UMBRAL = 0.6        # por debajo, dlib diría "misma persona"
EF_SEARCH = 100     # >= 50 candidatos que pide la consulta


def conectar():
    conn = psycopg2.connect(host="localhost", port=5433, user="postgres", password="123456", dbname="postgres")
    conn.autocommit = True
    register_vector(conn)
    cur = conn.cursor()
    cur.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'face_embeddings'")
    indices = [r[0] for r in cur.fetchall()]
    if "face_hnsw" not in indices:
        cur.execute("CREATE INDEX face_hnsw ON face_embeddings USING hnsw (embedding vector_l2_ops) WITH (m = 16, ef_construction = 64)")
        cur.execute("ANALYZE face_embeddings")
    cur.execute(f"SET hnsw.ef_search = {EF_SEARCH}")
    return cur


def doble(cur, q):
    cur.execute('''
        SELECT name, MIN(dist) AS dist, (ARRAY_AGG(path ORDER BY dist))[1] AS path
        FROM (SELECT name, path, embedding <-> %s AS dist
              FROM face_embeddings ORDER BY embedding <-> %s LIMIT 50) t
        GROUP BY name ORDER BY dist LIMIT 1''', (q, q))
    return cur.fetchone()


class Buscador(threading.Thread):
    """Procesa siempre el último cuadro disponible, así el video no se traba"""

    def __init__(self):
        super().__init__(daemon=True)
        self.cur = conectar()
        self.cuadro = None
        self.resultados = []
        self.tiempos = {"embedding": 0.0, "busqueda": 0.0}
        self.lock = threading.Lock()
        self.activo = True

    def run(self):
        while self.activo:
            with self.lock:
                cuadro, self.cuadro = self.cuadro, None
            if cuadro is None:
                time.sleep(0.01)
                continue

            rgb = cv2.cvtColor(cuadro, cv2.COLOR_BGR2RGB)
            chico = cv2.resize(rgb, (0, 0), fx=ESCALA, fy=ESCALA)

            t0 = time.perf_counter()
            cajas = [tuple(int(v / ESCALA) for v in c) for c in face_recognition.face_locations(chico)]
            encodings = face_recognition.face_encodings(rgb, cajas)
            t1 = time.perf_counter()
            resultados = [(caja, doble(self.cur, e)) for caja, e in zip(cajas, encodings)]
            t2 = time.perf_counter()

            with self.lock:
                self.resultados = resultados
                self.tiempos = {"embedding": (t1 - t0) * 1000, "busqueda": (t2 - t1) * 1000}


def dibujar(cuadro, resultados, miniaturas):
    for (top, right, bottom, left), fila in resultados:
        if fila is None:
            continue
        name, dist, path = fila
        color = (0, 200, 0) if dist < UMBRAL else (0, 165, 255)
        cv2.rectangle(cuadro, (left, top), (right, bottom), color, 2)
        texto = f"{name.replace('_', ' ')}  {dist:.3f}"
        cv2.rectangle(cuadro, (left, bottom), (right, bottom + 28), color, cv2.FILLED)
        cv2.putText(cuadro, texto, (left + 4, bottom + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

        if path not in miniaturas:
            img = cv2.imread(path)
            miniaturas[path] = cv2.resize(img, (160, 160)) if img is not None else None
        mini = miniaturas[path]
        if mini is not None:
            y, x = 10, cuadro.shape[1] - 170
            cuadro[y:y + 160, x:x + 160] = mini
            cv2.rectangle(cuadro, (x, y), (x + 160, y + 160), color, 2)


def main():
    cam = cv2.VideoCapture(0)
    if not cam.isOpened():
        raise SystemExit("No se pudo abrir la cámara (revisa el permiso en Ajustes > Privacidad > Cámara)")

    buscador = Buscador()
    buscador.start()
    miniaturas = {}
    t_prev = time.perf_counter()

    while True:
        ok, cuadro = cam.read()
        if not ok:
            break
        cuadro = cv2.flip(cuadro, 1)

        with buscador.lock:
            buscador.cuadro = cuadro.copy()
            resultados, tiempos = buscador.resultados, buscador.tiempos

        dibujar(cuadro, resultados, miniaturas)

        ahora = time.perf_counter()
        fps = 1 / max(ahora - t_prev, 1e-6)
        t_prev = ahora
        info = f"{fps:4.1f} fps | embedding {tiempos['embedding']:.0f} ms | HNSW {tiempos['busqueda']:.1f} ms"
        cv2.putText(cuadro, info, (10, cuadro.shape[0] - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        cv2.imshow("Doble famoso en vivo (q para salir)", cuadro)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    buscador.activo = False
    cam.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
