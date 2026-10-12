#!/bin/sh
# ouvrir-service.sh <nom du plat>
#
# Ouvre un service : un répertoire daté où la brigade dépose tout, et
# le lien 'courant' que le minuteur suit pour savoir où écrire son journal.

set -eu

if [ $# -lt 1 ]; then
  echo "usage: ouvrir-service.sh <nom du plat>" >&2
  exit 2
fi

plat=$*
racine=$(cd "$(dirname "$0")" && pwd)
abrege=$(printf '%s' "$plat" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/-\{2,\}/-/g; s/^-//; s/-$//')
service="$racine/service/$(date +%Y%m%d-%H%M%S)-${abrege:-plat}"

mkdir -p "$service/mise-en-place" "$service/parures"
: > "$service/journal.ndjson"
printf '%s\n' "$plat" > "$service/plat.txt"

ln -sfn "$service" "$racine/service/courant"

echo "service   : $service"
echo "minuteur  : ./minuteur.sh   (cadence : ${CADENCE:-2} s par minute de recette)"
echo "mise en place : $service/mise-en-place"
