# Claude N Works — cahier des charges

État : v2, 12 octobre 2026 — amendé après le lot 1 (voir `OBSERVATIONS-FORMAT.md`).

Convention de lecture : ce document distingue trois statuts. **Demandé** = exigence posée
par Yves. **Constaté** = fait vérifié sur la machine le 12 octobre 2026, avec le chemin
qui permet de le revérifier. **Proposé** = choix de conception que j'avance et qui reste
discutable. Rien dans ce document ne doit être lu comme une exigence si ce n'est pas
marqué « demandé ».

---

## 1. Objet

**Demandé.** Une application qui se connecte à Claude Code et qui donne à voir, pour une
session choisie, comment Claude Code se sert de ses agents dans le temps et quelles
opérations il mène.

L'intention est **éducative** : comprendre et représenter visuellement ce que fait un
agent, ce que font ses sous-agents, comment il mobilise les skills, comment une boucle
progresse, et à quels outils il recourt. Ce n'est pas un outil de pilotage, pas un
tableau de bord de coûts, pas un profileur.

**Demandé.** La réalisation doit rester simple et ne pas déborder des spécifications de ce
document.

---

## 2. Périmètre

### Dans le périmètre

1. Lister les sessions Claude Code ouvertes.
2. En sélectionner une.
3. Afficher sa ligne du temps : les requêtes de l'utilisateur, l'agent principal qu'elles
   démarrent, les sous-agents qui s'ouvrent sous lui, et leurs appels d'outils.
4. Afficher l'arbre des agents : qui a démarré qui. Un agent terminé se grise, et la ligne
   du temps continue d'avancer.
5. Une carte par agent : nom si disponible, entrée, sortie, modèle, liste d'outils.
6. Une carte particulière pour les skills.
7. Une carte particulière pour les boucles, montrant la répétition et l'avancement dans
   cette répétition.
8. Une représentation simple des appels d'outils.
9. Mise à jour en temps réel pendant que la session travaille.

### Hors périmètre, explicitement

- Agir sur une session : pas d'envoi de message, pas d'arrêt d'agent, pas de réponse à une
  question. L'application **observe seulement**.
- Les coûts, la facturation, les quotas.
- L'agrégation entre sessions, les statistiques historiques, les comparaisons.
- Les sessions nuageuses, les sessions d'autres machines, les autres clients que Claude
  Code (les worktrees Cline présents sur la machine n'écrivent pas le même format — voir
  §9, risque R3).
- La persistance : l'application ne constitue pas sa propre base. Elle lit, elle affiche.

---

## 3. Source de données

**Décidé par Yves** après comparaison : lecture passive des fichiers que Claude Code écrit
déjà. Les hooks ne sont pas retenus pour la v1. Raisons retenues : ils n'existent que pour
les sessions démarrées après leur configuration, ne montrent aucun passé, s'exécutent dans
le chemin critique des sessions, et le `settings.json` global de la machine a déjà ses
douze événements occupés par Orca.

### 3.1 La liste des sessions ouvertes

**Constaté.** `~/.claude/sessions/<pid>.json`, un fichier par session vivante. Contenu
observé :

```json
{"pid":2219216,"sessionId":"704b4e7c-…","cwd":"/home/yves/projects",
 "startedAt":1790192588641,"version":"2.1.236","kind":"interactive","entrypoint":"cli",
 "tmux":"atlas:@4.%4","messagingSocketPath":"/tmp/cc-socks/2219216.sock",
 "name":"Claude N Works","status":"busy","updatedAt":1791807115952,
 "bridgeSessionId":"session_016g4…"}
```

Les valeurs de `status` observées sont `busy` et `waiting` ; quand la session attend, un
champ `waitingFor` précise quoi (`"input needed"`). Le champ `name` porte le nom lisible de
la session. Ce répertoire suffit à l'écran 1, sans rien instrumenter.

### 3.2 L'historique et le temps réel d'une session

**Constaté.** `~/.claude/projects/<cwd-encodé>/<sessionId>.jsonl` : une ligne JSON par
événement, en append. Le `cwd` est encodé en remplaçant les `/` par des `-`
(`/home/yves/projects` → `-home-yves-projects`). Le suivi temps réel se fait en lisant la
fin du fichier au fur et à mesure.

**Constaté au lot 1.** Ce fichier ne contient **pas** l'activité des sous-agents. Chaque
sous-agent a son propre transcript, dans un sous-répertoire voisin :

```
~/.claude/projects/<cwd-encodé>/
├── <sessionId>.jsonl                     ← la session parente
└── <sessionId>/subagents/
    ├── agent-<agentId>.jsonl             ← le transcript du sous-agent, isSidechain:true
    └── agent-<agentId>.meta.json         ← agentType, description, toolUseId, spawnDepth
```

L'application lit donc **deux endroits**. Le répertoire `subagents/` n'existe pas tant
qu'aucun sous-agent n'a été lancé : il apparaît en cours de session et doit être découvert
à chaud. Le détail de ce qu'on y trouve est dans `OBSERVATIONS-FORMAT.md`, qui est la
référence de format de ce projet.

Champs utiles, tous observés :

| Champ | Usage dans l'application |
|---|---|
| `type` | `user`, `assistant`, `system`, `attachment`, et quelques types de service |
| `uuid`, `parentUuid` | chaînage des événements — la base de l'arbre |
| `timestamp` | ISO 8601, position sur la ligne du temps |
| `isSidechain` | `true` = l'événement appartient à un sous-agent |
| `sessionId`, `cwd`, `gitBranch`, `version` | identification |
| `message.model` | le modèle, p. ex. `claude-opus-5` |
| `effort` | p. ex. `high` |
| `message.stop_reason` | `tool_use`, `end_turn` |
| `message.usage` | jetons entrée/sortie, lecture et création de cache, jetons de réflexion |
| `message.content[].type` | `text`, `thinking`, `tool_use` |
| `message.content[]` où `type=="tool_use"` | `id`, `name`, `input` — l'appel d'outil |
| `toolUseResult` sur un `user` | le résultat, rattaché par `sourceToolAssistantUUID` |
| `attachment.type=="prompt_snapshot"` | `.attachment.tools` = la liste des outils réellement offerts à cet agent |
| `attachment.type=="skill_listing"` | le catalogue des skills disponibles |
| `attachment.type=="agent_listing_delta"` | le catalogue des types d'agents disponibles |
| `system.subtype` | `turn_duration` (avec `durationMs`), `stop_hook_summary`, `local_command` |

**Constaté** sur `.../-home-yves-projects-litanie/54d3641a-….jsonl` : `.attachment.tools`
vaut par exemple `["Agent","Bash","Edit","ListAgents","Read","ReportFindings",
"ScheduleWakeup","Skill","ToolSearch","Workflow","Write"]`. C'est de là que vient la liste
d'outils de la carte d'agent, et non d'une déduction à partir des appels observés.

### 3.3 Les skills

**Constaté.** Un skill est un `tool_use` de nom `Skill`, dont l'`input` porte `skill` et
`args`. Exemple relevé dans la session Litanie : `{"skill":"loop","args":"Mène le harnais
de mesure du banc de Litanie jusqu'à …"}`.

### 3.4 Les boucles

**Constaté.** Une boucle `/loop` en allure libre se lit entièrement dans le transcript :

- son ouverture est **parfois** le `tool_use` `Skill` avec `skill:"loop"`, dont les `args`
  contiennent la consigne et la condition d'arrêt — mais seulement 3 des 10 boucles de la
  session Litanie en ont un. Ce qui identifie une boucle à coup sûr est son **arrêt**, et
  la consigne se relit alors dans le champ `prompt` des réveils (§5 quinquies
  d'`OBSERVATIONS-FORMAT.md`) ;
- chaque itération se referme par un `tool_use` `ScheduleWakeup` dont l'`input` donne
  `delaySeconds`, `noop` (vrai = rien n'a changé, faux = quelque chose a été produit),
  `reason` (une phrase sur ce qui est attendu) et `prompt` (la consigne rejouée) ;
- l'arrêt est un `ScheduleWakeup` avec `stop: true`.

La session `819d3fef` en comptait 183 appels : la matière d'une carte de boucle existe bien
et elle est riche.

---

## 4. Modèle de données interne

**Proposé.** Cinq objets, reconstruits par lecture du `.jsonl`. Aucun n'est inventé : tous
se dérivent des champs du §3.

**Session** — `sessionId`, `name`, `cwd`, `status`, `startedAt`, version de Claude Code.

**Agent** — identité (`agentId`), rôle (`racine` ou `sous-agent`), profondeur
(`spawnDepth`), nom (le `description` de son `.meta.json`, à défaut son `agentType`), agent
parent (`parentAgentId` s'il existe, l'agent racine sinon), instant de début (horodatage du
`tool_use` `Agent` chez le parent), instant de fin, état (`en cours`, `terminé`,
`interrompu`, `fin inconnue`), modèle (`resolvedModel`), `effort`, outils employés, entrée
(`prompt`), sortie (`content`), durée (`totalDurationMs`), jetons (`totalTokens`).

**AppelOutil** — agent appelant, nom de l'outil, instant, `input`, résultat, succès ou
échec, durée quand elle est déductible de l'écart entre l'appel et son résultat.

**Skill** — nom, `args`, agent qui l'a invoqué, instant.

**Boucle** — skill d'origine, consigne, suite des itérations (instant, `noop`,
`reason`, délai demandé), état (en cours / arrêtée), rang de l'itération courante.

---

## 5. Écrans

### Écran 1 — les sessions ouvertes

Une liste. Par session : son nom, son `cwd`, son état (`busy` / `waiting` avec le
`waitingFor`), depuis quand elle tourne, sa version. La liste se rafraîchit d'elle-même.
Cliquer ouvre l'écran 2.

### Écran 2 — la session

Trois zones sur un même écran, partageant un axe de temps commun.

**La ligne du temps**, horizontale, le temps allant vers la droite. Une **voie** par
agent. La voie de l'agent racine est en haut ; chaque sous-agent prend une voie sous celle
de son parent, décalée, et sa barre commence à l'instant où le parent l'a démarré. Les
requêtes de l'utilisateur sont des repères verticaux traversant toutes les voies — les
vraies seulement, celles dont `origin.kind` vaut `"human"`, et non les enregistrements que
Claude Code s'injecte à lui-même.

**Demandé** : quand un agent se termine, sa barre se grise, et la ligne du temps continue
d'avancer. Un agent en cours garde sa couleur pleine et son bord droit reste ouvert.

**Constaté au lot 1** : la fin d'un agent se lit de deux façons selon son mode, et les
confondre fait mourir un agent d'arrière-plan cent millisecondes après sa naissance alors
qu'il travaille encore. Un agent synchrone finit à l'arrivée de son `tool_result` ; un
agent d'arrière-plan finit à l'arrivée du `<task-notification>` portant son identifiant.
Le détail est en §5 bis d'`OBSERVATIONS-FORMAT.md`.

**Les appels d'outils** — *décidé par Yves* : tous les appels, chacun comme une marque fine
sur la voie de son agent, nom visible quand la place le permet, détail au survol. On doit
voir la densité réelle du travail, y compris les 1436 appels `Bash` d'une session comme
Litanie. Un appel en échec se distingue d'un appel réussi.

**Le repli des temps morts** — *ajouté au lot 3, et non demandé*. Mesuré : la session
Litanie s'étale sur **264 heures** pour 1710 appels, dont sept jours sans la moindre
activité. À l'échelle linéaire, tout le travail se tasse en traits invisibles. L'axe replie
donc les périodes sans aucun événement, à deux conditions : le seuil est proportionnel à la
session — un quatre-centième de sa durée, et jamais moins d'une minute — et **chaque repli
est visible et compté**, la barre d'outils annonçant leur nombre et la durée totale élidée.
Rien n'est masqué en silence. Le repli se désactive d'une case à cocher.

**Les boucles sur la ligne du temps** — *demandé après le lot 6*. Une boucle n'est pas un
agent : elle n'a ni modèle, ni outils, ni sous-agents. Mais elle occupe du temps, et à ce
titre elle prend sa propre voie, sous celle de l'agent qui la mène. Elle s'y dessine comme
un **rail** et non comme une barre : un trait fin borné par deux montants, avec une encoche
par itération — pleine si quelque chose a été produit, creuse si rien n'a changé. Les
boucles d'un même agent ne se chevauchent jamais, un arrêt fermant toujours la précédente,
donc une seule voie suffit.

**Le contexte, les compactages et les pannes** — *demandés après le lot 5*. Trois ajouts
au-delà du périmètre initial, tous lus dans des données déjà présentes :

- **la taille du contexte** prend sa propre voie sous l'agent, en aire remplie d'un dégradé
  vertical du vert au rouge : la hauteur de la courbe décide de la couleur, donc une
  fenêtre qui sature se voit rougir. La référence est commune à toute la session, et le
  dégradé ne sort **que si un compactage a révélé la fenêtre** — sinon l'échelle reste
  relative et la couleur neutre, parce qu'on ignore le plafond ;
- **les compactages** sont des repères verticaux en pointillés. Mesuré sur la session
  `454ef787` : le contexte monte à 996 455 jetons, un compactage survient, il retombe à
  52 151. C'est le fait le moins intuitif du fonctionnement d'un agent, et il devient
  visible d'un coup d'œil ;
- **les pannes d'API** sont des repères à part, et comptées sur la carte de l'agent.

**La règle du temps et la souris** — *demandées après le lot 6*. Une graduation datée en
haut de la piste, dont le pas suit l'échelle, calculée par segment actif puisque le temps
n'avance pas au même rythme de part et d'autre d'un repli. La molette zoome autour du
curseur ; le bouton gauche enfoncé déplace la vue. Un glissé franc n'ouvre pas de carte.

**L'arbre**, à côté de la ligne du temps : qui a démarré qui, forme statique de la même
information. Sélectionner un nœud met en évidence sa voie, et réciproquement.

**Les cartes**, en panneau. Sélectionner un agent, un skill ou une boucle ouvre sa carte.

---

## 6. Les cartes

### 6.1 Carte d'agent

**Demandé** : nom s'il est disponible, entrée, sortie, modèle, liste d'outils, « etc. si
ces informations sont disponibles ».

Contenu retenu — chaque champ est affiché s'il existe, et **omis sans faux-semblant s'il
n'existe pas** :

- nom ou type d'agent, et à défaut son rang (« sous-agent n° 3 ») ;
- état : en cours, terminé, interrompu ;
- début, fin, durée ;
- modèle et `effort` ;
- outils employés, relevés un par un dans le transcript du sous-agent, et leurs
  compteurs agrégés (`toolStats`) ; la liste des outils *offerts* n'est affichée que
  lorsqu'un `prompt_snapshot` la donne, ce qui est rare (voir C2 dans
  `OBSERVATIONS-FORMAT.md`) ;
- entrée : le prompt reçu, replié par défaut, dépliable en entier ;
- sortie : son texte final, même traitement ;
- compte d'appels d'outils, de skills, de sous-agents démarrés ;
- jetons consommés, depuis `message.usage`.

### 6.2 Carte de skill

Nom du skill, ses `args`, l'agent qui l'a invoqué, l'instant, et ce qui a suivi
immédiatement dans le transcript. Un skill qui ouvre une boucle porte un lien vers la carte
de boucle correspondante.

### 6.3 Carte de boucle

**Demandé** : rendre visibles la répétition et l'avancement dans cette répétition.

- la consigne d'origine et sa condition d'arrêt, telles qu'écrites dans les `args` ;
- une bande d'itérations, une case par itération dans l'ordre, chacune marquée selon son
  `noop` : quelque chose a été produit, ou rien n'a changé ;
- pour l'itération survolée : son instant, son `reason`, le délai demandé ;
- le rang courant, et le nombre d'itérations sans effet consécutives ;
- les **agents nés pendant chaque tour**, toutes profondeurs confondues, dans l'ordre de
  naissance et avec un lien vers leur carte ; réciproquement, la carte d'un agent né dans
  une boucle dit de quelle itération il vient. *Qui* l'a lancé et *quand* dans la
  répétition sont deux questions distinctes, et la carte répond aux deux ;
- l'état : en cours (avec le prochain réveil attendu) ou arrêtée.

### 6.4 Carte d'appel d'outil

**Demandé** : simple. Nom de l'outil, instant, durée, `input`, résultat, succès ou échec.
Les deux derniers sont repliés par défaut, et tronqués au-delà d'une taille raisonnable
avec la possibilité de tout voir.

---

## 7. Temps réel

**Demandé** : voir en temps réel les agents et sous-agents en action.

**Proposé.** L'application suit la fin du `.jsonl` de la session choisie et le répertoire
`~/.claude/sessions/`. Chaque ligne nouvelle met à jour le modèle, et l'écran suit. Un
agent apparaît dès sa première ligne, sans attendre sa fin. La ligne du temps avance même
quand rien ne se produit : l'instant présent est une marque qui glisse vers la droite.

Délai visé : ce qui s'écrit dans le transcript apparaît à l'écran en moins de deux
secondes.

Reprise : à l'ouverture d'une session, le fichier est lu depuis le début pour reconstituer
tout le passé, puis suivi. Une session terminée s'ouvre de la même manière et s'affiche en
entier, figée — ce n'est pas un objectif, c'est une conséquence gratuite du choix de
source.

---

## 8. Forme et réalisation

**Décidé par Yves** : application web locale.

**Proposé** pour tenir l'exigence de simplicité :

- un seul processus à lancer, qui sert la page et le flux d'événements ;
- aucune base de données, aucun état sur disque ;
- aucune dépendance au réseau ; l'application ne parle à aucun service distant ;
- **lecture seule** sur `~/.claude` — l'application ne doit jamais y écrire ;
- écoute sur la boucle locale par défaut ; l'ouverture au tailnet se demande
  explicitement, par la variable `HOTES`, et n'écoute jamais sur `0.0.0.0` — ce qui
  exposerait aussi le réseau local. Exposer un transcript, c'est exposer tout ce que
  l'agent a lu, écrit et dit : cela ne doit pas pouvoir arriver par accident.

**Décidé par Yves au lot 1 : Node, sans aucune dépendance.** Node est déjà sur la machine
puisque Claude Code tourne dessus (v22.22.2 vérifiée), le même langage des deux côtés évite
de réécrire les structures de données, et `http`, `fs.watch` et `readline` de la
bibliothèque standard suffisent à tout ce que décrit ce document — servir la page, suivre
la fin d'un fichier, surveiller l'apparition du répertoire `subagents/`, lire du JSON ligne
à ligne.

Il n'y aura donc ni `package.json` de dépendances, ni `node_modules`, ni cadriciel côté
navigateur. Le dessin se fait en HTML et SVG écrits à la main. Toute dépendance ajoutée
plus tard devra se justifier contre ce paragraphe.

---

## 9. Ce qui n'est pas vérifié, et les risques

**R1 — le format exact d'un sous-agent. Levé le 12 octobre 2026.** Deux sessions de
sondage ont établi le format ; tout est consigné dans `OBSERVATIONS-FORMAT.md`. Le constat
qui change ce document : les sous-agents écrivent dans `<sessionId>/subagents/`, pas dans
le transcript du parent. C'est pour cela que les 106 transcripts de la machine ne portaient
aucun `isSidechain:true` — aucun n'avait de sous-agent, donc aucun n'avait ce répertoire.

**R2 — la fin d'un agent. Levé.** Aucune ligne du sous-agent ne marque sa fin. Elle se lit
chez le parent, à l'horodatage du `tool_result` de l'appel `Agent`, dont le
`toolUseResult` donne aussi `status` et `totalDurationMs` en recoupement.

**R6 — les cas limites d'un sous-agent. Levé.** `run_in_background`, la profondeur 2,
l'interruption douce et la mort brutale ont toutes été mesurées (C4 et C5
d'`OBSERVATIONS-FORMAT.md`). Ce qu'il en reste pour l'écran 2 : le répertoire `subagents/`
est plat, le rattachement passe par `parentAgentId` ou l'agent racine, et un agent a
**trois** fins possibles et non deux — terminé, interrompu, ou *fin inconnue* quand aucun
marqueur n'existe et que le processus de la session est mort. Ce dernier cas est le seul
qui ne se lit pas dans les fichiers : il faut tester le processus, comme le fait déjà
l'écran 1.

**R7 — un agent qui échoue de lui-même. Levé.** C'est un message `assistant` de modèle
`"<synthetic>"` portant `API Error: …`. Ces pannes sont désormais marquées sur la ligne du
temps et comptées sur la carte de l'agent.

**R3 — les autres formats.** 72 des 79 répertoires viennent de worktrees Cline et
n'écrivent pas la même chose : seuls les trois transcripts de `-home-yves-projects`
portent un champ `isSidechain`. L'application doit
ignorer proprement un fichier qu'elle ne sait pas lire, sans planter et sans prétendre
l'avoir compris.

**R4 — le volume.** Un transcript observé fait 37 Mo pour 17 790 lignes, soit environ
2 ko par ligne — un ordre de grandeur confirmé sur les transcripts de sous-agent du
sondage. La lecture
initiale et l'affichage doivent tenir à cette taille. C'est une exigence de performance,
mesurée sur ce fichier précis.

**R5 — l'instabilité du format.** Rien de ce qui est décrit au §3 n'est une interface
publique ; Claude Code peut en changer d'une version à l'autre (ici : 2.1.236). Un champ
absent doit se traduire par un champ omis à l'écran, jamais par une erreur.

---

## 10. Lots de livraison

**Lot 1 — connaître le terrain. Fait le 12 octobre 2026**, sauf le choix du langage.
R1 et R2 levés sur pièce, format consigné dans `OBSERVATIONS-FORMAT.md`. Reste à arrêter le
langage et la bibliothèque (§8).

**Lot 2 — les sessions. Fait le 12 octobre 2026.** Écran 1 complet, rafraîchi.

**Lot 3 — la ligne du temps. Fait le 12 octobre 2026.** Écran 2 sur une session figée, lue
en entier : voies, grisage des agents terminés, repères des requêtes, marques d'outils,
arbre, plus le repli des temps morts rendu nécessaire par la mesure.

**Lot 4 — les cartes. Fait le 12 octobre 2026.** Agent, outil, skill, plus la requête.

**Lot 5 — le temps réel. Fait le 12 octobre 2026.** Suivi incrémental des fichiers,
agents qui apparaissent et se grisent en direct, marque de l'instant présent.

**Lot 6 — la boucle. Fait le 12 octobre 2026.** La carte de boucle et sa bande
d'itérations.

L'ordre n'est pas négociable sur un point : le lot 1 passe avant tout le reste.

---

## 11. Critères d'acceptation

L'application est finie quand, sur une session réelle contenant au moins deux sous-agents,
un skill et une boucle :

1. la session apparaît dans la liste avec son nom et son état juste ;
2. son ouverture affiche l'intégralité de son passé, sans trou ni doublon ;
3. l'arbre des agents correspond à ce que dit le transcript, vérifié ligne par ligne ;
4. chaque agent terminé est grisé, chaque agent en cours ne l'est pas ;
5. tous les appels d'outils sont présents sur les voies, au bon instant ;
6. la carte d'un agent donne son modèle et sa liste d'outils tels qu'écrits dans le
   transcript, jamais devinés ;
7. la carte de boucle montre le bon nombre d'itérations, dans l'ordre, avec le bon `noop` ;
8. pendant que la session travaille, un nouvel agent apparaît à l'écran en moins de deux
   secondes ;
9. l'application n'a rien écrit dans `~/.claude` — vérifié sur les horodatages ;
10. un transcript de format inconnu est ignoré sans incident ;
11. un sous-agent lancé **après** l'ouverture de l'écran apparaît quand même — le
    répertoire `subagents/` est découvert à chaud, pas seulement à l'ouverture.

Le point 3 et le point 7 se vérifient en comparant l'écran au `.jsonl` à la main, sur une
session choisie d'avance. Une exécution unique ne vaut pas démonstration : ces deux points
se contrôlent sur trois sessions différentes.

Les deux sessions de sondage du lot 1 sont conservées et servent de jeu d'essai : l'une
donne deux sous-agents synchrones en parallèle, l'autre un agent d'arrière-plan. Les
chemins sont dans `OBSERVATIONS-FORMAT.md`.
