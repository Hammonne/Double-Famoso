# FACE_SEARCH.EXE — frontend del Lab 11

Página estática (HTML + CSS + JS, sin dependencias ni build) para mostrar los resultados del Lab 11 con estética Y2K / pixel / Windows 98. Funciona abriendo `index.html` directamente o publicada en GitHub Pages.

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html` | Estructura: pantalla de carga, escritorio, ventanas |
| `styles.css` | Estilos: paisaje pixel, ventanas, íconos pixel propios |
| `app.js` | Lógica: ventanas arrastrables, Face Finder, gráficos, demos IVF/HNSW |
| `data.js` | **Los datos.** Resultados reales del lab, generados con `tools/make_real_data.py` |
| `img/` | Miniaturas 96×96 de las fotos de LFW que usa `data.js` (~0.5 MB) |
| `tools/make_example_data.py` | Genera los datos de ejemplo |
| `tools/make_real_data.py` | Genera `data.js` con los resultados reales del notebook (corre también oclusión y miniaturas) |
| `tools/export_thumbs.py` | Crea las miniaturas a partir de los `"src"` de `data.js` |
| `tools/occlusion.py` | Análisis por oclusión para el doble famoso (bonus) |

## Ver la página en local
Doble clic en `index.html`, o desde la terminal:
```bash
open web/index.html
```
Atajos útiles en la URL:
- `index.html#start` salta la pantalla de carga.
- `index.html#start=recall,scale` abre además esas ventanas (`finder`, `recall`, `scale`, `howto`, `twin`, `readme`).
- `index.html#start&m=ivf&i=0` abre Face Finder en IVFFlat con el primer valor de `probes`.

## Formato de `data.js` (para tus resultados reales)
`data.js` define `window.LAB_DATA = { ... }`, un objeto con estas claves:

```js
window.LAB_DATA = {
  meta: {
    example: false,          // true muestra la etiqueta "DATOS DE EJEMPLO"
    rows: 13018,             // filas en face_embeddings
    k: 10,
    lists: 100,              // lists del índice IVFFlat
    lineal_ms: 5.62,         // latencia mediana de la búsqueda lineal
    note: ""
  },
  items: {                   // id de la tabla → persona y ruta local de la foto (solo los ids usados en queries)
    "1234": { person: "George_W_Bush", src: "/Users/.../data/lfw/George_W_Bush/George_W_Bush_0001.jpg" }
  },
  queries: [                 // algunas de tus consultas reservadas
    {
      id: 1, person: "Nombre_Persona", src: "/ruta/local/de/la/foto/consulta.jpg",
      exact: [/* 10 ids de knn_lineal */],
      dist:  [/* 10 distancias <-> de esos ids, en el mismo orden */],
      ivf:  { "1": [/* 10 ids */], "5": [...], "10": [...], "20": [...], "100": [...] },
      hnsw: { "10": [...], "40": [...], "100": [...], "200": [...] }
    }
  ],
  sweep: {                   // tabla de P4.1
    ivf:  [{ param: 1, recall: 0.73, ms: 0.26 }, ...],
    hnsw: [{ param: 10, recall: 0.83, ms: 0.29 }, ...]
  },
  scaling: [                 // tabla de P4.2
    { N: 1000, lineal: 0.61, ivf: 0.24, ivf_param: 4, hnsw: 0.19, hnsw_param: 20 }, ...
  ],
  famoso: [                  // resultado de famoso_parecido (sin tu foto)
    { name: "Nombre_Famoso", dist: 0.51, fotos: 3, src: "/ruta/a/una/foto/de/esa/persona.jpg" }, ...
  ]
};
```

**Cómo generarlo:** al final de tu notebook, arma un `dict` de Python con esa forma y escríbelo con
```python
import json
open("web/data.js", "w", encoding="utf-8").write("window.LAB_DATA = " + json.dumps(datos, ensure_ascii=False) + ";\n")
```
⚠️ Convierte los valores de `numpy` (`np.float32`, `np.int64`) a `float`/`int` antes de `json.dumps`.

Después crea las miniaturas (recorta y reduce cada `src`, lo reemplaza por `img` y guarda en `web/img/`):
```bash
conda activate vision
python web/tools/export_thumbs.py
```
Si cambias de datos, borra antes la carpeta `web/img/` para no dejar fotos sobrantes.

### Análisis por oclusión (opcional, bonus)
La ventana *Doble famoso* puede mostrar **qué zonas del rostro pesan en el parecido**. Para cada famoso se tapa una zona (ojos, cejas, nariz, boca, contorno, frente/cabello), se recalcula el embedding y se mide cuánto cambia la distancia. Se tapa una foto a la vez y se promedian los dos cambios. La técnica es *occlusion sensitivity* (Zeiler & Fergus, 2014).

Córrelo **antes** de `export_thumbs.py`, porque necesita los `"src"`:
```bash
conda activate vision
python web/tools/occlusion.py --consulta mi_foto.jpg   # tu foto: solo se lee, NO se escribe en data.js
python web/tools/export_thumbs.py
```
Agrega a cada elemento de `famoso` un campo `occlusion: { d0, zones: [{ key, label, delta, box }] }`, donde `box` está en coordenadas 0–1 de la miniatura.

**Cómo interpretarlo:** muestra qué zonas *usa el modelo* para decidir. Las 128 dimensiones del embedding no se corresponden una a una con "ojos" o "cabello": la información está repartida en todo el vector.

## Privacidad
- La página muestra miniaturas de **LFW**, un dataset público de investigación con fotos de figuras públicas. Si un dato no trae foto, se dibuja un avatar pixel.
- **No pongas tu foto ni tu embedding** en `data.js`: un repositorio de GitHub Pages es público. En `famoso` van solo los nombres de LFW y las distancias.
- El `.gitignore` de la carpeta del lab ya excluye `mi_foto*`, los `.pkl` y el dataset.

## Publicar en GitHub Pages
1. Crea un repositorio y sube el contenido de la carpeta del lab (el `.gitignore` deja fuera los datos sensibles y el dataset).
2. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**. Elige la rama `main` y la carpeta `/ (root)`.
3. La página queda en `https://<usuario>.github.io/<repo>/web/`.

## Cámara en vivo (local)
La ventana **Cámara en vivo** usa tu cámara desde el navegador y busca el doble de **cada cara** en pgvector (HNSW). Necesita el servidor local, porque la búsqueda se hace en tu PostgreSQL:
```bash
conda activate vision
python servidor_en_vivo.py     # abre http://localhost:8000/#start=cam&cam=on
```
- Detecta varias caras a la vez y muestra los 3 dobles de cada una
- **Tomar foto** guarda una imagen con los recuadros, que se descarga desde la tira de fotos. No se manda a ningún lado
- Métricas: análisis por segundo, tiempos de detección, embedding, HNSW, servidor e ida y vuelta
- Publicada en GitHub Pages la ventana solo muestra cómo correr el servidor

## Subir foto (local)
La ventana **Subir foto** busca el doble famoso de cualquier imagen: se arrastra o se elige un archivo, se detectan todas las caras y para cada una se muestran los 5 dobles más parecidos con el mismo estilo de *Doble famoso*. Usa el mismo servidor local (`python servidor_en_vivo.py` o doble clic en `Abrir_FaceSearch.command`). La foto se procesa en memoria y no se guarda
- Detección con la imagen completa (no a la mitad como en vivo), para no perder caras chicas en fotos grupales
- 1000 fotos candidatas en HNSW (`hnsw.ef_search = 1000`), así personas con cientos de fotos no llenan el top 5
