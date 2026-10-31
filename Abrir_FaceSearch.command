#!/bin/zsh
# Doble clic: prende Docker + pgvector, el servidor local y abre la página con la cámara
cd "$(dirname "$0")"
source ~/miniforge3/etc/profile.d/conda.sh
conda activate vision

if ! docker info >/dev/null 2>&1; then
  echo "Abriendo Docker..."
  open -a Docker
  for i in {1..60}; do docker info >/dev/null 2>&1 && break; sleep 2; done
fi
docker start pgvector >/dev/null
for i in {1..30}; do docker exec pgvector pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

python servidor_en_vivo.py
