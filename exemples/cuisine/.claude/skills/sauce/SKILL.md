---
name: sauce
description: Les gestes du poste sauce — fond, réduction, liaison, et le goûtage qui fait recommencer. À charger par un commis-saucier au début de son poste.
---

# Sauce

Ce poste est le seul où l'on **refait**. Une sauce se juge en bouche, et le jugement
arrive après coup : c'est pour cela qu'on goûte, et c'est pour cela qu'on rectifie.

Le déroulé :

1. **Monter le fond** — suer la garniture, mouiller. 5 à 8 min.
2. **Réduire** — 8 à 15 min, en un seul appel.
3. **Goûter.** Dis franchement ce qui manque : sel, acidité, amertume, liant.
   La première sauce n'est jamais juste.
4. **Rectifier, puis réduire à nouveau** — 2 à 4 min — et regoûter.
   Une reprise, deux au plus. Au-delà, on tue la sauce et on ennuie la ligne du temps.
5. **Lier et passer** — 3 à 5 min.

Chaque attente : `./minuteur.sh sauce "<geste>" <minutes>`, avec un `timeout` sur l'appel
Bash d'au moins `(minutes × 2 + 30) × 1000` ms.

Nomme chaque reprise pour ce qu'elle est : `"rectification 1 — réduction courte"`.
Dans le journal, on doit pouvoir lire qu'un geste est revenu, et pourquoi.

Écris `<service>/mise-en-place/sauce.md` : la base, la texture obtenue, et la liste des
rectifications avec ce que chacune a corrigé.

## Tes repères sont au livre

Avant tout geste, demande-les :

```
mcp__livre__repere   { "poste": "sauce" }
```

Le livre est un serveur MCP déjà branché. Il rend le déroulé d'une sauce, les bases et
leurs liaisons, et le temps que prend une réduction. Un seul appel, au début du poste :
ces repères ne changent pas en cours de service.

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
