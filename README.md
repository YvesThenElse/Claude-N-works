# Claude N Works

Observer ce que fait Claude Code : ses agents, ses sous-agents, ses skills, ses boucles et
ses outils, dans le temps.

- **Ce qu'on construit** → [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md)
- **Comment Claude Code écrit ses traces** → [`OBSERVATIONS-FORMAT.md`](OBSERVATIONS-FORMAT.md),
  la référence de format, mesurée et non devinée.

## Lancer

```sh
node serveur.js
```

Puis <http://127.0.0.1:7420>. Node 22 ou plus, aucune dépendance à installer.

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `7420` | port d'écoute, sur la boucle locale seulement |
| `PERIODE_RELEVE_MS` | `500` | période du relevé ; borne le délai de détection d'une session morte |
| `CLAUDE_HOME` | `~/.claude` | où lire — sert surtout à éprouver le programme sur un faux dossier |

Le programme **ne fait que lire**. Il n'écrit jamais dans `~/.claude`.

## Où en est le projet

| Lot | État |
|---|---|
| 1 — connaître le terrain | fait : R1 et R2 levés, format consigné, langage arrêté |
| 2 — l'écran des sessions | fait |
| 3 — la ligne du temps | fait |
| 4 — les cartes | fait |
| 5 — le temps réel | fait |
| 6 — la carte de boucle | fait |

### Ce que fait l'écran des sessions

Il liste les sessions Claude Code **réellement vivantes** : il lit
`~/.claude/sessions/*.json` et vérifie que le processus existe encore, car un fichier
survit à la session qu'il décrit. Un fichier mal formé, sans `sessionId`, ou dont le
processus est mort est ignoré sans bruit et compté à part.

Pour chaque session : son nom, son dossier de travail, son état, depuis quand elle est
ouverte, et le nombre de sous-agents déjà sur disque. La sélection affiche son identité
complète, le chemin de son transcript, et sa version de Claude Code.

La liste se tient à jour toute seule, par flux d'événements, sans rechargement.

### Ce que fait la ligne du temps

Une voie par agent, l'agent racine en haut, chaque sous-agent sous son parent. La barre
d'un agent commence quand son parent l'a lancé ; terminée, elle se grise ; encore en cours,
elle reste en pointillés, ouverte à droite. Les quatre états mesurés sont distingués :
en cours, terminé, interrompu, fin inconnue.

Tous les appels d'outils sont là, un par un, à leur instant : un trait net au départ, une
bande discrète pour la durée. Un appel d'agent et un appel en échec ont leur couleur. Les
requêtes d'Yves — et elles seules, `origin.kind` valant `human` — traversent les voies en
repères verticaux.

Cliquer un agent, un appel d'outil ou une requête ouvre sa carte. Celle d'un agent donne
son état, son type, sa profondeur, qui l'a lancé, ses instants, son modèle, son effort, ses
jetons, les outils qu'il a **employés** comptés par nom, et son entrée et sa sortie
repliées. Un agent à la fin inconnue le dit en toutes lettres. Celle d'un appel d'outil
donne son entrée et son résultat, tronqués à 700 caractères — et le dit quand il tronque.
Un appel de skill a sa propre carte, avec la consigne qui lui a été donnée **et les
instructions réellement chargées** — l'appel dit ce qu'on a demandé, l'attachement
`invoked_skills` dit ce qui a été injecté : 8 778 caractères pour le skill `loop`.

### Le temps réel

Une session vivante se suit en direct : les agents apparaissent dès leur première ligne,
sans attendre leur fin, les appels d'outils s'ajoutent, les rails de boucle s'allongent, et
un repère « maintenant » glisse vers la droite même quand rien ne se produit. L'en-tête
affiche « en direct » tant que le processus répond.

La lecture est **incrémentale** : on garde par fichier la position déjà lue et l'état déjà
dépouillé, et chaque passage ne lit que ce qui s'est ajouté. Le coût ne dépend donc pas de
la taille du transcript — relire les 37 Mo à chaque ligne écrite aurait coûté 610 ms à
chaque fois.

Deux précautions, imposées par le fait qu'on lit un fichier pendant qu'il s'écrit : une
ligne peut être incomplète, donc on ne traite que jusqu'au dernier saut de ligne et on
garde le reste ; et le répertoire `subagents/` n'existe pas tant qu'aucun sous-agent n'a
été lancé, donc on le cherche à chaque passage et pas une seule fois à l'ouverture.

### Le contexte, les compactages et les pannes

La taille du contexte a sa propre voie, en aire remplie d'un dégradé vertical du vert au
rouge — la hauteur de la courbe décide de la couleur, donc une fenêtre qui sature rougit.
Elle se lit dans `message.usage` : entrée + lecture de cache + création de cache. Le
`total_tokens_reminder` du transcript, lui, est un budget de jetons et non la fenêtre : il
ne répond pas à la question.

Les compactages sont des repères verticaux en pointillés. Sur la session `454ef787`, le
contexte monte à **996 455 jetons**, un compactage survient, il retombe à **52 151** : la
dent de scie est franche, et c'est le fait le moins intuitif du fonctionnement d'un agent.

Les pannes d'API — messages de modèle `<synthetic>` portant `API Error: …` — ont leur
repère et sont comptées sur la carte de l'agent.

### Les boucles

Une boucle est une suite de réveils délimitée par un arrêt. Sa carte montre la répétition
telle quelle : une case par itération, pleine si quelque chose a été produit, grise si rien
n'a changé. Cliquer une case donne son instant, le délai demandé pour le réveil suivant, et
la raison écrite à ce moment-là. L'en-tête compte les itérations sans effet, et combien de
suite à la fin — le signe d'une boucle qui tourne à vide.

Sur la session Litanie : dix boucles, 173 itérations, retrouvées sans en perdre ni en
compter deux fois.

La carte relie aussi les boucles aux agents : chaque itération liste les agents nés pendant
ce tour, de toutes profondeurs, et la carte d'un agent dit réciproquement de quelle
itération il vient. Un sous-agent de sous-agent né au troisième tour se lit donc des deux
côtés — *qui* l'a lancé par l'arbre, *quand* dans la répétition par la boucle.

La carte montre aussi le **délai subi** face au délai demandé : `ScheduleWakeup` dit quand
on voudrait être réveillé, `scheduled_task_fire` dit quand on l'a été. Mesuré sur une
itération : 300 s demandés, 272 s subis.

Les boucles ont aussi leur voie sur la ligne du temps, sous l'agent qui les mène. Une
boucle n'étant pas un agent, elle s'y dessine comme un rail et non comme une barre : un
trait borné par deux montants, une encoche par itération, pleine ou creuse selon qu'elle a
produit quelque chose. D'un coup d'œil sur Litanie, on voit que la session est faite de
boucles presque de bout en bout.

**Le repli des temps morts.** La session Litanie s'étale sur 264 heures pour 1710 appels,
dont sept jours d'inactivité : à l'échelle linéaire, tout le travail devient invisible.
L'axe replie donc les périodes vides, avec un seuil proportionnel à la durée de la session
(un quatre-centième, jamais moins d'une minute). Chaque repli est **annoncé et compté** —
« 23 temps morts repliés, 7,0 j élidée » — et la case à cocher le désactive. Rien n'est
masqué en silence.

### Mesures

Relevées le 12 octobre 2026 sur cette machine :

| Ce qu'on mesure | Mesure | Exigé |
|---|---|---|
| Apparition d'une session → affichée | **224 ms** | < 2 s |
| Ligne écrite dans un transcript → envoyée au navigateur | **56 à 125 ms** sur treize trames | < 2 s |
| Mort d'un processus → retirée de la liste | **165, 246 et 464 ms** sur trois essais | < 2 s |
| Coût d'un relevé complet | 4,5 ms en moyenne, 8,3 ms au pire sur vingt | — |

Les deux empruntent des chemins différents : l'apparition passe par la surveillance du
dossier, la mort par le relevé périodique — un processus qui meurt ne touche pas à son
fichier et ne produit donc aucun événement. Le délai de détection d'une mort est donc
borné par la période de relevé, fixée à 500 ms (`PERIODE_RELEVE_MS`), et les trois essais
se répartissent bien dans cet intervalle. À 4,5 ms par relevé, cela occupe moins de 1 %
du temps.

Les délais se mesurent sur le **flux d'événements**, pas sur `/api/sessions` : cette
route relit à chaud à chaque appel et reflète donc toujours la vérité instantanément, ce
qui ne mesure rien du chemin que suit réellement le navigateur.

Lecture d'un transcript de **37 Mo et 17 790 lignes** : **610 ms**, 24 Mo de mémoire,
1710 appels d'outil et 73 requêtes reconstitués.

Éprouvé aussi, sur un faux `~/.claude` monté pour l'occasion : processus mort, JSON
invalide, objet sans `sessionId`, fichier `.key` — ignorés, trois comptés comme tels, le
`.key` silencieusement. Et une session pointant sur un transcript qui a deux sous-agents :
le répertoire `subagents/` est bien trouvé et compté.
