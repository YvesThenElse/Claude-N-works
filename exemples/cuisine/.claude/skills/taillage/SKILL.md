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

## Tes repères sont au livre

Avant tout geste, demande-les :

```
mcp__livre__repere   { "poste": "taillage" }
```

Le livre est un serveur MCP déjà branché. Il rend les tailles et leurs dimensions, les
durées honnêtes de chaque geste, et ce qu'on fait des parures. Un seul appel, au début
du poste : ces repères ne changent pas en cours de service.

Si cet outil ne figure pas dans ta liste, c'est qu'il est différé : un `ToolSearch` sur
`select:mcp__livre__repere` le charge. Et s'il ne répond pas, travaille quand même —
tu connais ton métier, ce sera simplement moins précis.

**Le minuteur s'appelle `./minuteur.sh`, et pas autrement.** Tu travailles depuis le
répertoire du projet — un commis hérite du répertoire de la session — et c'est cette
forme-là, relative, qu'autorise la règle de permission du kit. Appelé par son chemin
absolu, le même script se fait refuser : *« This command requires approval »*. Mesuré sur
un service entier où quatre commis ont tourné en rond sans jamais poser un geste.

Et ne fais pas de `cd` avant de l'appeler : depuis le répertoire du service, `./minuteur.sh`
n'existe pas — `No such file or directory`. Tous tes chemins de fichiers sont absolus, tu
n'as aucune raison de bouger.
