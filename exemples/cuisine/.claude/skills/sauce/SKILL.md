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

## Repères

| Sauce | Base | Liaison |
|---|---|---|
| jus corsé | fond brun réduit | réduction seule |
| velouté | fond clair + roux blanc | roux |
| émulsion chaude | réduction + beurre | monter au beurre froid |
| coulis | légume cuit | mixé, passé au chinois |

Une réduction de moitié prend 10 min, aux trois quarts 18 min. On ne presse pas une
réduction en montant le feu : elle attache, et il faut tout recommencer.

**Le minuteur s'appelle `./minuteur.sh`, et pas autrement.** Tu travailles depuis le
répertoire du projet — un commis hérite du répertoire de la session — et c'est cette
forme-là, relative, qu'autorise la règle de permission du kit. Appelé par son chemin
absolu, le même script se fait refuser : *« This command requires approval »*. Mesuré sur
un service entier où quatre commis ont tourné en rond sans jamais poser un geste.

Et ne fais pas de `cd` avant de l'appeler : depuis le répertoire du service, `./minuteur.sh`
n'existe pas — `No such file or directory`. Tous tes chemins de fichiers sont absolus, tu
n'as aucune raison de bouger.
