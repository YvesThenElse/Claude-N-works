# Annexe — mesures

[← la documentation](LISEZ-MOI.md)

Relevées le 12 octobre 2026 sur la machine de développement.

## Délais

| Ce qu'on mesure | Mesure | Exigé |
|---|---|---|
| Apparition d'une session → affichée | **224 ms** | < 2 s |
| Ligne écrite dans un transcript → envoyée au navigateur | **56 à 125 ms** sur treize trames | < 2 s |
| Mort d'un processus → retirée de la liste | **165, 246 et 464 ms** sur trois essais | < 2 s |
| Coût d'un relevé complet | 4,5 ms en moyenne, 8,3 ms au pire sur vingt | — |

Les deux premiers empruntent des chemins différents : l'apparition passe par la
surveillance du dossier, la mort par le relevé périodique — un processus qui meurt ne touche
pas à son fichier et ne produit donc aucun événement. Le délai de détection d'une mort est
donc borné par la période de relevé, fixée à 500 ms (`PERIODE_RELEVE_MS`), et les trois
essais se répartissent bien dans cet intervalle. À 4,5 ms par relevé, cela occupe moins de
1 % du temps.

Les délais se mesurent sur le **flux d'événements**, pas sur `/api/sessions` : cette route
relit à chaud à chaque appel et reflète donc toujours la vérité instantanément, ce qui ne
mesure rien du chemin que suit réellement le navigateur.

## Lecture

Lecture d'un transcript de **37 Mo et 17 790 lignes** : **610 ms**, 24 Mo de mémoire,
1 710 appels d'outil et 73 requêtes reconstitués.

La lecture en direct est **incrémentale** : on garde par fichier la position déjà lue et
l'état déjà dépouillé. Le coût ne dépend donc pas de la taille du transcript — relire les
37 Mo à chaque ligne écrite aurait coûté ces 610 ms à chaque fois.

## Redessin

| Échelle | Largeur | Éléments | Redessin |
|---|---|---|---|
| 0,1 px/min | 896 px | 5 960 | 50 ms |
| 1,8 px/s | 637 000 px | 1 144 | 14 ms |
| 45,8 px/s | 16 000 000 px | 823 | **11 ms** |

> ⚠️ **Ces redessins ont été mesurés sur un jeu de voies plus restreint.** Avec les **douze**
> voies affichées en même temps sur la session de 2 730 appels, un redessin en vue d'ensemble
> coûte **879 ms** — c'est le cas extrême, et il était déjà à 806 ms avant que la voie *hooks*
> et les marques du Buffer CTX n'existent. Zoomé, c'est-à-dire dans l'usage courant, le
> redessin reste à **109 ms** quelle que soit la version.

Ce qui tient ce coût est la **fusion sous le pixel** : deux marques qui tombent dans le même
pixel ne se distinguent pas, on les réunit et l'infobulle dit combien d'appels elles
couvrent. Sans elle, la session passait de 28 662 à 50 608 éléments et de 806 à 1 307 ms ;
avec, elle en compte 31 650 pour 879 ms.

Le survol d'une ligne entière coûte, sur une session à 97 voies et quatre niveaux de zoom,
**63 → 70 ms** de médiane pour 194 éléments de plus.

## Robustesse

Éprouvé sur un faux `~/.claude` monté pour l'occasion : processus mort, JSON invalide, objet
sans `sessionId`, fichier `.key` — ignorés, trois comptés comme tels, le `.key`
silencieusement. Et une session pointant sur un transcript qui a deux sous-agents : le
répertoire `subagents/` est bien trouvé et compté.

Sonde arrêtée pendant qu'on la regarde : l'écran répond toujours en **45 ms** avec ses
sessions locales intactes, la machine passe au rouge avec sa raison, et un relais vers une
sonde morte rend **502** et non 500.

Pause sur une session vivante : **4 redessins** en trois secondes et demie quand le suivi
court, **zéro** en pause, 4 de nouveau après reprise — l'écran est resté figé à 1 003 appels
pendant que la session en écrivait quatre de plus.

---

[← la documentation](LISEZ-MOI.md)
