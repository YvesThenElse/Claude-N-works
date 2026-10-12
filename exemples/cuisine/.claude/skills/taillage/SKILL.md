---
name: taillage
description: Les gestes du poste taillage — éplucher, émincer, tailler, un légume à la fois. À charger par un commis-taillage au début de son poste.
---

# Taillage

Un légume, un tour de main. Tu ne tailles jamais deux légumes dans le même geste.

Pour chaque légume de ta commande, dans cet ordre :

1. **Attendre le geste** : `./minuteur.sh taillage "<geste> — <légume>" <minutes>`, avec un
   `timeout` sur l'appel Bash d'au moins `(minutes × 2 + 30) × 1000` ms. Sans ce
   `timeout`, l'outil coupe à deux minutes et ton geste est tranché en deux.
2. **Déposer la mise en place** : écris `<service>/mise-en-place/<légume>.md` —
   la taille obtenue (brunoise, julienne, mirepoix…), la quantité, l'état.
3. **Mettre les parures de côté** : écris `<service>/parures/<légume>.md` — fanes, pelures,
   trognons, et ce qu'on en fera.

Un fichier par légume, jamais un fichier pour tout le poste. C'est ce qui fait monter
le compte des fichiers d'une marche à chaque légume, au lieu d'une seule à la fin.

## Les parures partent au fond

Quand tous tes légumes sont taillés, les parures ne restent pas sur le plan de travail :
elles passent au fond de légumes. Une dernière attente —
`./minuteur.sh taillage "mettre les parures au fond" 4` — puis tu les retires, **un `rm` par
fichier, chemin écrit en toutes lettres** :

```sh
rm <service>/parures/carotte.md
rm <service>/parures/oignon.md
```

Jamais `rm <service>/parures/*.md` : l'observateur ne compte que les suppressions dont il
peut nommer le fichier, et avec un motif ta courbe resterait en l'air. C'est le seul
moment du service où un agent défait ce qu'il a fait lui-même — et donc le seul endroit
où l'on voit une courbe de fichiers redescendre pour de bon.

## Les tailles, pour écrire juste

| Taille | Dimension | Pour |
|---|---|---|
| brunoise | 2 mm | garnitures, sauces |
| julienne | 2 × 2 × 50 mm | crudités, garnitures fines |
| mirepoix | 10 mm | fonds, braisages |
| paysanne | 10 mm, 2 mm d'épaisseur | potages, ragoûts |
| sifflets | biais, 5 mm | poireaux, carottes sautées |

## Durées honnêtes

Éplucher 2 min, émincer 3 min, tailler en brunoise 5 min, laver et essorer 2 min.
Un légume dur (carotte, céleri) coûte une minute de plus qu'un légume tendre.

**Le minuteur s'appelle `./minuteur.sh`, et pas autrement.** Tu travailles depuis le
répertoire du projet — un commis hérite du répertoire de la session — et c'est cette
forme-là, relative, qu'autorise la règle de permission du kit. Appelé par son chemin
absolu, le même script se fait refuser : *« This command requires approval »*. Mesuré sur
un service entier où quatre commis ont tourné en rond sans jamais poser un geste.

Et ne fais pas de `cd` avant de l'appeler : depuis le répertoire du service, `./minuteur.sh`
n'existe pas — `No such file or directory`. Tous tes chemins de fichiers sont absolus, tu
n'as aucune raison de bouger.
