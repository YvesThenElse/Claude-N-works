#!/bin/sh
# minuteur.sh <poste> <geste> <minutes-de-recette>
#
# Attend le temps que prend le geste, puis le consigne.
# Une minute de recette vaut CADENCE secondes de montre (2 par défaut) :
# c'est le seul endroit où la cuisine est accélérée.
#
#   ./minuteur.sh taillage "émincer les oignons" 3
#
# Le journal se dépose dans service/courant/journal.ndjson, qui est la
# vérité de terrain : ce que la brigade a vraiment attendu, à comparer
# avec ce que la ligne du temps en montre.

set -eu

if [ $# -ne 3 ]; then
  echo "usage: minuteur.sh <poste> <geste> <minutes>" >&2
  exit 2
fi

poste=$1
geste=$2
minutes=$3

case "$minutes" in
  ''|*[!0-9.]*) echo "minuteur: '$minutes' n'est pas un nombre de minutes" >&2; exit 2 ;;
esac

cadence=${CADENCE:-2}
racine=$(cd "$(dirname "$0")" && pwd)
service=${CUISINE_SERVICE:-$racine/service/courant}

secondes=$(awk -v m="$minutes" -v c="$cadence" 'BEGIN{ s = m * c; if (s > 240) s = 240; printf "%.2f", s }')

debut=$(date +%s%3N)
sleep "$secondes"
fin=$(date +%s%3N)

if [ -d "$service" ]; then
  printf '{"poste":%s,"geste":%s,"minutes":%s,"cadence":%s,"debut_ms":%s,"fin_ms":%s}\n' \
    "\"$poste\"" "\"$geste\"" "$minutes" "$cadence" "$debut" "$fin" >> "$service/journal.ndjson"
fi

echo "[$poste] $geste — $minutes min de recette, $secondes s de montre"
