# Double-Famoso

Doble famosa, se usa lib, pgvector e indexación

Lab 11 de **Base de Datos II (UTEC)**: búsqueda de rostros parecidos con **PostgreSQL + pgvector**. Cada cara se convierte en un vector de 128 números y se buscan sus vecinos más cercanos con búsqueda lineal, **IVFFlat** y **HNSW**

## Qué hace
- **Doble famoso**: encuentra a qué famoso de LFW te pareces (13 076 rostros de 5 722 personas)
- **Cámara en vivo**: detecta varias caras a la vez y muestra el doble de cada una, con métricas en tiempo real, pausa y fotos
- **Subir foto**: top 5 de dobles de cualquier imagen
- **Face Finder, Recall vs Latencia y Escalabilidad**: los resultados del lab (kNN lineal vs IVFFlat vs HNSW)
- **Análisis por oclusión**: qué zonas de la cara pesan en el parecido

## Cómo funciona
| Paso | Qué se usa |
|---|---|
| Detectar la cara | `face_recognition` (detector HOG de dlib) |
| Embedding | ResNet de dlib, vector de 128 dimensiones |
| Distancia | Euclidiana `<->` (el modelo se entrenó así, umbral 0.6) |
| Base de datos | PostgreSQL + pgvector, tabla `face_embeddings` |
| Índices | IVFFlat (`lists = 100`) y HNSW (`m = 16`, `ef_construction = 64`) |

## Resultados principales
| Método | recall@10 | Latencia |
|---|---|---|
| Lineal | 1.000 | 2.66 ms |
| IVFFlat (probes = 20) | 0.979 | 1.13 ms |
| HNSW (ef_search = 40) | 0.990 | 0.94 ms |

Con 12 veces más filas la búsqueda lineal tarda ~12 veces más, IVFFlat ~6 veces y HNSW casi lo mismo

## Correrlo en local
Necesitas el entorno conda `vision`, Docker con el contenedor `pgvector` (puerto 5433) y el dataset LFW en `data/lfw`
```bash
conda activate vision
python servidor_en_vivo.py      # abre http://localhost:8000
```
O doble clic en `Abrir_FaceSearch.command`

## Estructura
```
Lab11_pgvector.ipynb      notebook del lab (P1 a P4)
servidor_en_vivo.py       servidor local: página + API de búsqueda
doble_en_vivo.py          versión con ventana de OpenCV
web/                      la página (FACE_SEARCH.EXE)
capturas/                 EXPLAIN ANALYZE de lineal, IVFFlat y HNSW
hf_space/                 versión en Docker (Postgres + pgvector + servidor en un contenedor)
```

## Privacidad
Las fotos de la cámara o las que se suben se procesan en memoria y no se guardan. Mis fotos y los embeddings (`mi_foto*`, `*.pkl`) no están en el repo. Las fotos que se muestran son de LFW, un dataset público de investigación
