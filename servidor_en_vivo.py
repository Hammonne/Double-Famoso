"""Servidor local para la ventana "Cámara en vivo" de la página web

Sirve la carpeta web/ y una API que recibe un cuadro de la cámara, detecta todas las caras,
saca sus embeddings y busca el doble más parecido de cada una en pgvector (HNSW)

Uso:
    conda activate vision
    python servidor_en_vivo.py          # abre http://localhost:8000 (Ctrl+C para cerrar)

Solo escucha en localhost. Los cuadros de la cámara se procesan en memoria y no se guardan
"""
import json
import socket
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import cv2
import face_recognition
import numpy as np
import psycopg2
from pgvector.psycopg2 import register_vector

LAB = Path(__file__).resolve().parent
WEB = LAB / "web"
LFW = LAB / "data" / "lfw"
PUERTO = 8000
ESCALA = 0.5        # la detección se hace con el cuadro a la mitad
CANDIDATOS = 200    # personas con muchas fotos (Colin Powell, Bush) no llenan el top
CANDIDATOS_SUBIDA = 1000   # "Subir foto" muestra 5 dobles; 1000 es el máximo de hnsw.ef_search
EF_SEARCH = 200     # HNSW devuelve como máximo ef_search filas
TOP = 3             # dobles por cara

conn = psycopg2.connect(host="localhost", port=5433, user="postgres", password="123456", dbname="postgres")
conn.autocommit = True
register_vector(conn)
cur = conn.cursor()
cur.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'face_embeddings'")
if "face_hnsw" not in [r[0] for r in cur.fetchall()]:
    cur.execute("CREATE INDEX face_hnsw ON face_embeddings USING hnsw (embedding vector_l2_ops) WITH (m = 16, ef_construction = 64)")
    cur.execute("ANALYZE face_embeddings")
cur.execute(f"SET hnsw.ef_search = {EF_SEARCH}")
cur.execute("SELECT COUNT(*) FROM face_embeddings")
FILAS = cur.fetchone()[0]
lock = threading.Lock()


def dobles(q, top=TOP, candidatos=CANDIDATOS):
    cur.execute(f"SET hnsw.ef_search = {candidatos}")   # HNSW devuelve como máximo ef_search filas
    cur.execute('''
        SELECT name, MIN(dist) AS dist, (ARRAY_AGG(path ORDER BY dist))[1] AS path
        FROM (SELECT name, path, embedding <-> %s AS dist
              FROM face_embeddings ORDER BY embedding <-> %s LIMIT %s) t
        GROUP BY name ORDER BY dist LIMIT %s''', (q, q, candidatos, top))
    return [{"name": n, "dist": round(float(d), 4), "img": "/lfw/" + str(Path(p).relative_to(LFW))}
            for n, d, p in cur.fetchall()]


def buscar(jpeg, top=TOP, escala=ESCALA):
    t0 = time.perf_counter()
    bgr = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    rgb = np.ascontiguousarray(bgr[:, :, ::-1])
    chico = cv2.resize(rgb, (0, 0), fx=escala, fy=escala)
    t1 = time.perf_counter()
    cajas = [tuple(int(v / escala) for v in c) for c in face_recognition.face_locations(chico)]
    t2 = time.perf_counter()
    encodings = face_recognition.face_encodings(rgb, cajas)
    t3 = time.perf_counter()
    # con más dobles pedidos se buscan más fotos, para que personas con cientos de fotos no llenen todo
    candidatos = CANDIDATOS if top <= TOP else CANDIDATOS_SUBIDA
    caras = [{"box": list(c), "dobles": dobles(e, top, candidatos)} for c, e in zip(cajas, encodings)]
    caras.sort(key=lambda c: -c["box"][1])  # de izquierda a derecha en el video en espejo
    t4 = time.perf_counter()
    ms = lambda a, b: round((b - a) * 1000, 2)
    return {"w": rgb.shape[1], "h": rgb.shape[0], "caras": caras,
            "ms": {"decodificar": ms(t0, t1), "deteccion": ms(t1, t2), "embedding": ms(t2, t3),
                   "busqueda": ms(t3, t4), "servidor": ms(t0, t4)}}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        # la página abierta con doble clic (file://) tiene origen "null"
        if self.headers.get("Origin") == "null":
            self.send_header("Access-Control-Allow-Origin", "null")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def responder_json(self, obj, codigo=200):
        cuerpo = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path == "/api/info":
            return self.responder_json({"filas": FILAS, "indice": "HNSW", "m": 16, "ef_construction": 64,
                                        "ef_search": EF_SEARCH, "candidatos": CANDIDATOS, "candidatos_subida": CANDIDATOS_SUBIDA, "top": TOP,
                                        "operador": "<-> (euclidiana)", "umbral": 0.6})
        if self.path.startswith("/lfw/"):
            archivo = (LFW / unquote(self.path[5:].split("?")[0])).resolve()
            if LFW.resolve() not in archivo.parents or archivo.suffix != ".jpg" or not archivo.is_file():
                return self.send_error(404)
            datos = archivo.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            return self.wfile.write(datos)
        return super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/api/buscar":
            return self.send_error(404)
        qs = parse_qs(url.query)
        # la ventana "Subir foto" pide top=5 y detección con la imagen completa (escala=1)
        top = min(max(int(qs.get("top", [TOP])[0]), 1), 10)
        escala = 1.0 if qs.get("escala") == ["1"] else ESCALA
        largo = int(self.headers.get("Content-Length", 0))
        if not 0 < largo < 5_000_000:
            return self.send_error(400)
        jpeg = self.rfile.read(largo)
        try:
            with lock:
                resultado = buscar(jpeg, top, escala)
        except Exception as e:
            return self.responder_json({"error": str(e)}, 500)
        self.responder_json(resultado)


if __name__ == "__main__":
    handler = partial(Handler, directory=str(WEB))
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), handler)
    # Safari busca localhost primero por IPv6 (::1)
    class ServidorIPv6(ThreadingHTTPServer):
        address_family = socket.AF_INET6
    try:
        servidor6 = ServidorIPv6(("::1", PUERTO), handler)
        threading.Thread(target=servidor6.serve_forever, daemon=True).start()
    except OSError:
        servidor6 = None
    url = f"http://localhost:{PUERTO}/#start=cam&cam=on"
    print(f"Servidor en {url}  ({FILAS} caras en la tabla, Ctrl+C para cerrar)")
    threading.Timer(1, webbrowser.open, (url,)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
        conn.close()
