---
name: cuisson
description: Les gestes du poste cuisson — saisir, mener, surveiller, sortir au bon point. À charger par un commis-cuisson au début de son poste.
---

# Cuisson

Peu de gestes, longs. C'est le poste qui apprend qu'un agent qui attend travaille.

L'ordre d'un poste cuisson tient presque toujours en quatre temps :

1. **Monter en température** — 3 à 5 min.
2. **Saisir ou démarrer** — 4 à 8 min.
3. **Mener** — la grande attente, 10 à 25 min, en un seul appel au minuteur.
4. **Sortir et reposer** — 3 à 10 min selon la pièce.

Chaque temps passe par `./minuteur.sh cuisson "<geste>" <minutes>`, avec un `timeout`
sur l'appel Bash d'au moins `(minutes × 2 + 30) × 1000` ms.

**Ne découpe pas « mener » en dix surveillances d'une minute.** Ce serait plus
spectaculaire et ce serait faux : on n'ouvre pas un four toutes les minutes, et la
ligne du temps doit montrer une longue attente comme une longue attente.

Entre deux temps, écris où en est la cuisson dans `<service>/mise-en-place/<nom>.md` :
température, aspect, point visé.

## Points de cuisson

| Pièce | Cœur | Repos |
|---|---|---|
| bœuf saignant | 52 °C | 8 min |
| bœuf à point | 58 °C | 8 min |
| volaille | 74 °C | 5 min |
| poisson | 50 °C | 3 min |
| légume braisé | fondant sous la pointe | — |

Le repos n'est pas du temps perdu : c'est le dernier geste de la cuisson, et il compte
dans ton poste.

**Le minuteur s'appelle `./minuteur.sh`, et pas autrement.** Tu travailles depuis le
répertoire du projet — un commis hérite du répertoire de la session — et c'est cette
forme-là, relative, qu'autorise la règle de permission du kit. Appelé par son chemin
absolu, le même script se fait refuser : *« This command requires approval »*. Mesuré sur
un service entier où quatre commis ont tourné en rond sans jamais poser un geste.

Et ne fais pas de `cd` avant de l'appeler : depuis le répertoire du service, `./minuteur.sh`
n'existe pas — `No such file or directory`. Tous tes chemins de fichiers sont absolus, tu
n'as aucune raison de bouger.
