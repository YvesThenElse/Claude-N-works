# Claude N Works — cahier des charges

État : v1, 12 octobre 2026.

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

- son ouverture est le `tool_use` `Skill` avec `skill:"loop"` ; `args` contient la consigne
  et la condition d'arrêt ;
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

**Agent** — identité, rôle (`racine` ou `sous-agent`), nom (le `subagent_type` ou le
`description` de l'appel `Agent` qui l'a créé, sinon rien), agent parent, instant de début,
instant de fin, état (`en cours` / `terminé`), modèle, `effort`, liste d'outils offerts,
entrée (le prompt reçu), sortie (son texte final), jetons consommés.

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
requêtes de l'utilisateur sont des repères verticaux traversant toutes les voies.

**Demandé** : quand un agent se termine, sa barre se grise, et la ligne du temps continue
d'avancer. Un agent en cours garde sa couleur pleine et son bord droit reste ouvert.

**Les appels d'outils** — *décidé par Yves* : tous les appels, chacun comme une marque fine
sur la voie de son agent, nom visible quand la place le permet, détail au survol. On doit
voir la densité réelle du travail, y compris les 1436 appels `Bash` d'une session comme
Litanie. Un appel en échec se distingue d'un appel réussi.

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
- liste des outils offerts, depuis `.attachment.tools`, et non devinée ;
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
- écoute sur la boucle locale seulement.

Le langage et la bibliothèque restent à arrêter au lot 1. Le critère est le nombre de
dépendances, pas la richesse.

---

## 9. Ce qui n'est pas vérifié, et les risques

**R1 — le format exact d'un sous-agent. Non vérifié.** Aucun des 105 transcripts présents
sur la machine, répartis dans 79 répertoires de projet, ne contient de sous-agent : sur
l'ensemble, zéro ligne avec `"isSidechain":true` et zéro `tool_use` de nom `Agent` ou
`Task` dans un message assistant.
Le champ `isSidechain` existe et vaut `false` partout. Je n'ai donc **pas pu vérifier sur
pièce** comment se présentent les lignes d'un sous-agent, ni comment rattacher un
sous-agent à l'appel `Agent` qui l'a créé. **C'est le premier travail du lot 1** : lancer
une session avec deux sous-agents, et lire ce qui s'écrit. Tout le §4 et tout l'écran 2
reposent là-dessus.

**R2 — la fin d'un agent.** Rien ne garantit qu'une ligne annonce explicitement la fin d'un
sous-agent. Il faudra peut-être la déduire de l'arrivée du `toolUseResult` de l'appel
`Agent` correspondant. À trancher avec R1, sur pièce.

**R3 — les autres formats.** 72 des 79 répertoires viennent de worktrees Cline et
n'écrivent pas la même chose : seuls les trois transcripts de `-home-yves-projects`
portent un champ `isSidechain`. L'application doit
ignorer proprement un fichier qu'elle ne sait pas lire, sans planter et sans prétendre
l'avoir compris.

**R4 — le volume.** Un transcript observé fait 37 Mo pour 17 790 lignes. La lecture
initiale et l'affichage doivent tenir à cette taille. C'est une exigence de performance,
mesurée sur ce fichier précis.

**R5 — l'instabilité du format.** Rien de ce qui est décrit au §3 n'est une interface
publique ; Claude Code peut en changer d'une version à l'autre (ici : 2.1.236). Un champ
absent doit se traduire par un champ omis à l'écran, jamais par une erreur.

---

## 10. Lots de livraison

**Lot 1 — connaître le terrain.** Lever R1 et R2 sur pièce : provoquer une session avec
sous-agents, skills et boucle, et consigner le format observé dans ce dépôt. Arrêter le
langage. Rien d'autre.

**Lot 2 — les sessions.** Écran 1 complet, rafraîchi.

**Lot 3 — la ligne du temps.** Écran 2 sur une session terminée, lue en entier : voies,
grisage des agents terminés, repères des requêtes, marques d'outils, arbre.

**Lot 4 — les cartes.** Agent, outil, skill.

**Lot 5 — le temps réel.** Suivi de la fin du fichier, agents qui apparaissent et se
grisent en direct, marque de l'instant présent.

**Lot 6 — la boucle.** La carte de boucle et sa bande d'itérations.

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
10. un transcript de format inconnu est ignoré sans incident.

Le point 3 et le point 7 se vérifient en comparant l'écran au `.jsonl` à la main, sur une
session choisie d'avance. Une exécution unique ne vaut pas démonstration : ces deux points
se contrôlent sur trois sessions différentes.
