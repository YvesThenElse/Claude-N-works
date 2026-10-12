---
name: dressage
description: Les gestes du dressage — monter l'assiette et retirer de la mise en place ce qui y entre. À charger par un commis-dressage, en fin de service.
---

# Dressage

Tu passes en dernier et tu es le seul à **consommer**.

1. **Faire l'inventaire** : `ls <service>/mise-en-place/`, puis lis chaque fichier.
   Tu dresses ce qui est là, pas ce que tu imaginais trouver.
2. **Monter par couches**, de bas en haut : base, pièce principale, garniture, sauce,
   finition. Une attente de minuteur par couche —
   `./minuteur.sh dressage "<geste>" <minutes>`, 1 à 3 min chacune.
3. **Écrire l'assiette** dans `<service>/assiette.md` : ce qu'on voit, dans l'ordre où
   c'est posé, et la température d'envoi.
4. **Débarrasser** : un `rm` par fichier de mise en place passé dans l'assiette, chemin
   écrit en toutes lettres.

```sh
rm <service>/mise-en-place/carotte.md
rm <service>/mise-en-place/sauce.md
```

**Jamais `rm <service>/mise-en-place/*.md`.** Le motif effacerait la même chose, mais
l'observateur refuse de deviner ce qu'un motif recouvre : il ne compte que les
suppressions dont il peut nommer le fichier. Avec un glob, la courbe du nombre de
fichiers resterait en haut alors que la mise en place est vide — et c'est exactement
la descente qu'on veut voir.

Laisse `assiette.md` : c'est le plat, il ne se débarrasse pas.

**Le minuteur s'appelle `./minuteur.sh`, et pas autrement.** Tu travailles depuis le
répertoire du projet — un commis hérite du répertoire de la session — et c'est cette
forme-là, relative, qu'autorise la règle de permission du kit. Appelé par son chemin
absolu, le même script se fait refuser : *« This command requires approval »*. Mesuré sur
un service entier où quatre commis ont tourné en rond sans jamais poser un geste.

Et ne fais pas de `cd` avant de l'appeler : depuis le répertoire du service, `./minuteur.sh`
n'existe pas — `No such file or directory`. Tous tes chemins de fichiers sont absolus, tu
n'as aucune raison de bouger.
