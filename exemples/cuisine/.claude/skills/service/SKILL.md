---
name: service
description: Prépare un plat avec une brigade de cuisine — un chef qui ne cuisine pas, des commis spécialisés lancés en parallèle, et des temps de préparation réellement attendus. À déclencher quand l'utilisateur demande « prépare-moi un plat », nomme un plat à réaliser, ou lance /service.
---

# Service

L'utilisateur a nommé un plat. Tu es le chef de cuisine : **tu ne cuisines pas.** Tu
écris la fiche, tu passes les commandes, tu rassembles, tu envoies. Chaque geste de
cuisine appartient à un commis, et chaque commis est un sous-agent.

Cette règle n'est pas un décor. Un chef qui taille lui-même ses oignons produit une
ligne du temps plate : un seul agent, une seule barre. Ce qu'on veut donner à voir,
c'est une brigade — plusieurs postes qui avancent en même temps, chacun à son rythme.

**Ne lis pas les skills des postes.** `taillage`, `cuisson`, `sauce` et `dressage` sont
les manières de faire de tes commis, pas les tiennes : chacun charge la sienne. Les lire
te coûte du temps et ne change rien à ta commande.

## 1. Ouvrir le service

```sh
./ouvrir-service.sh "<nom du plat>"
```

Le script rend le chemin du service. **Il doit figurer en absolu dans chaque commande
que tu passes** : un commis ne voit rien de cette conversation.

Le minuteur, lui, s'appelle toujours `./minuteur.sh` — tes commis héritent de ton
répertoire, et c'est cette forme-là qu'autorise la règle de permission du kit.

## 2. Écrire la fiche

Dans `<service>/fiche.md`, décompose le plat en **trois ou quatre postes** parmi :

| Poste | Sous-agent | Ce qui s'y passe |
|---|---|---|
| taillage | `commis-taillage` | le même geste répété, un légume à la fois |
| cuisson | `commis-cuisson` | peu de gestes, de longues attentes |
| sauce | `commis-saucier` | une réduction, un goûtage, une reprise |
| garde-manger | `chef-de-partie` | un poste qui se subdivise encore, et lance ses propres commis |

Pour chaque poste : la liste de ses gestes, et pour chacun **une durée en minutes de
recette**. Vise entre 10 et 30 minutes par poste. Un poste à 2 minutes ne se voit pas ;
un poste à 90 minutes écrase tous les autres.

**Un poste sur les trois ou quatre va obligatoirement à `chef-de-partie`.** Prends le
plus fourni — celui qui a le plus d'éléments à traiter, le taillage la plupart du temps —
et confie-le à un chef de partie au lieu d'un commis : il le coupera en deux lots et
lancera ses propres commis. C'est lui qui donne à l'arbre son troisième étage,
chef → chef de partie → commis. Sans lui la brigade est plate, et le kit ne montre plus
ce pour quoi il existe. Un service sans chef de partie est un service raté, même si le
plat est bon.

Écris aussi `<service>/minutage.json` : `[{"poste":…,"geste":…,"minutes":…}, …]`.
C'est ce que tu as prévu, et il servira à la fin à mesurer l'écart avec ce qui s'est
vraiment passé.

## 3. Passer les commandes — toutes dans le même message

Lance tous les postes de la fiche **en un seul message contenant plusieurs appels à
l'outil Agent**. C'est le cœur de la démonstration : lancés un par un, les postes
s'alignent en escalier et le service dure la somme des postes ; lancés ensemble, ils
dessinent un peigne et le service dure celui du plus lent.

Chaque commande doit se suffire à elle-même et contenir :

- le chemin absolu du service, tel que `ouvrir-service.sh` l'a rendu ;
- le poste, et ses gestes avec leurs minutes ;
- ce qu'il doit laisser dans `<service>/mise-en-place/` ;
- l'ordre de charger sa skill (`taillage`, `cuisson`, `sauce`).

N'y mets rien que le commis puisse déduire : il a sa skill pour la manière, tu lui
donnes la matière.

**Ne mets pas `run_in_background`.** Plusieurs appels dans un même message partent déjà
ensemble — mesuré : quatre postes lancés d'un coup se chevauchent et le service dure le
temps du plus lent. En les passant en arrière-plan tu gagnes zéro parallélisme de plus et
tu perds ta barrière : la main te revient aussitôt, et plus rien ne t'empêche de dresser
sur une sauce qui n'existe pas. Attendre le retour de tes commis, c'est la barrière de
l'étape 4, et elle ne coûte rien.

## 4. Attendre, puis envoyer

Quand tous les postes ont rendu — c'est-à-dire quand les appels d'agent de l'étape 3 te
sont tous revenus — et pas avant, lance **un seul** `commis-dressage`.
Il lit la mise en place, monte l'assiette, et en retire ce qu'il y a mis.

Cette barrière est volontaire : le dressage d'un plat dont la sauce n'est pas prête
n'a pas de sens, et la ligne du temps doit montrer un palier net entre le peigne des
postes et le trait du dressage.

## 5. Fermer le service

Écris `<service>/service.md` :

- le plat, les postes, qui a fait quoi ;
- **prévu contre réel** : compare `minutage.json` au `journal.ndjson` que les minuteurs
  ont rempli, poste par poste ;
- la durée du service, et celle qu'il aurait eue si tout s'était fait à la file.

Puis dis à l'utilisateur où regarder : `node serveur.js`, et la session y est.

## Ce qu'il ne faut pas faire

- **Cuisiner toi-même.** Pas un seul appel au minuteur depuis le chef.
- **Lancer les postes un par un.** Un message, plusieurs Agent.
- **Dresser avant que tout soit rendu.**
- **Raccourcir les attentes** parce que c'est long. La cadence se règle avec `CADENCE`
  (secondes de montre par minute de recette, 2 par défaut) — pas en trichant sur les
  durées de la fiche.
