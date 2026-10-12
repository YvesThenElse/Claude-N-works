# Format des sous-agents — observations du lot 1

Mesuré le 12 octobre 2026, Claude Code 2.1.236, sur la machine d'Yves.
Ce document lève les risques R1 et R2 du cahier des charges.

Tout ce qui suit est **constaté**, pas déduit : chaque affirmation vient d'un fichier
nommé, produit par deux sessions de sondage jetables lancées exprès.

Protocole. Cinq sessions `claude -p --model sonnet` dans des répertoires jetables sous
`$SCRATCH/r1-sondage` et `$SCRATCH/r1-sondage2`. **Leurs transcripts sont conservés** : ce
sont les deux seuls exemples de sous-agents présents sur la machine, et ils servent de jeu
d'essai aux lots 3 à 5. On les trouve sous
`~/.claude/projects/-tmp-claude-1000--home-yves-projects-704b4e7c-…-scratchpad-r1-sondage*`.
Le premier donne le cas synchrone et deux agents en parallèle, le second le cas
d'arrière-plan. Trois autres ont suivi : `r1-profondeur2` (un agent qui en lance un autre),
`r1-interrompu` (SIGINT en vol) et `r1-tue` (SIGKILL en vol). Les cinq ensemble couvrent
tous les comportements décrits ici. La première lance **deux sous-agents
`Explore` en parallèle**, chacun lisant un fichier. La seconde lance **un sous-agent lent**
(cinq commandes `bash` séparées par six secondes d'attente) pendant qu'un échantillonneur
relevait la taille du transcript toutes les deux secondes.

---

## 1. Où vit un sous-agent

**Le transcript d'un sous-agent n'est pas dans le fichier de sa session parente.**
C'est le point que le cahier des charges supposait à tort. Il vit dans un sous-répertoire :

```
~/.claude/projects/<cwd-encodé>/
├── <sessionId>.jsonl                               ← la session parente
└── <sessionId>/
    └── subagents/
        ├── agent-<agentId>.jsonl                   ← le transcript du sous-agent
        ├── agent-<agentId>.meta.json               ← sa fiche d'identité
        ├── agent-<autreAgentId>.jsonl
        └── agent-<autreAgentId>.meta.json
```

Relevé tel quel sur la session de sondage `723b272d-7402-4c04-92d2-b98eabfc9f77` : deux
`.jsonl` et deux `.meta.json`, un couple par sous-agent.

C'est **là** que `isSidechain` vaut `true` — et nulle part ailleurs. Les 106 transcripts
de la machine n'en portaient aucun pour cette seule raison : aucune de ces sessions n'avait
de sous-agent, donc aucun répertoire `subagents/` n'existait. Une application qui ne
regarde que les `<sessionId>.jsonl` ne verra jamais un seul sous-agent.

## 2. La fiche d'identité : `agent-<agentId>.meta.json`

Contenu intégral de celle du premier sous-agent du sondage :

```json
{
  "agentType": "Explore",
  "description": "Lire notes.txt",
  "toolUseId": "toolu_01MGXn7CZkY4UBrfpaTEjX7V",
  "spawnDepth": 1
}
```

- `description` est **le nom à afficher sur la carte** : c'est le libellé court que le
  parent a donné en lançant l'agent. La question « nom s'il est disponible » est tranchée.
- `agentType` est le `subagent_type` demandé.
- `toolUseId` pointe l'`id` du `tool_use` du parent : **c'est le lien de filiation.**
- `spawnDepth` donne la profondeur dans l'arbre. Elle vaut 1 pour un sous-agent de l'agent
  racine. Un sous-agent de sous-agent portera donc 2 — non vérifié sur pièce, mais le
  rattachement ne dépend pas de ce champ : il se fait par `toolUseId`.

## 3. Les lignes d'un transcript de sous-agent

Structure complète du sondage, sept lignes, toutes avec `isSidechain: true` :

| n° | type | contenu | horodatage |
|---|---|---|---|
| 1 | `user` | le prompt reçu | 12:38:16.264 |
| 2 | `attachment` | `hook_success` | 12:38:16.313 |
| 3 | `attachment` | `deferred_tools_delta` | 12:38:16.317 |
| 4 | `attachment` | `skill_listing` | 12:38:16.319 |
| 5 | `assistant` | `tool_use:Bash`, modèle `claude-sonnet-5` | 12:38:19.298 |
| 6 | `user` | `tool_result` | 12:38:19.751 |
| 7 | `assistant` | `text` — sa réponse finale | 12:38:23.713 |

Chaque ligne porte en plus :

- `agentId` — l'identifiant du sous-agent, présent sur **chaque** ligne ;
- `sessionId` — celui de la **session parente**, pas un identifiant propre ;
- `attributionAgent` sur les lignes `assistant` ;
- et les mêmes `uuid`/`parentUuid`, `timestamp`, `message.model`, `effort`, `usage`,
  `cwd`, `gitBranch`, `version` que dans un transcript ordinaire.

Donc les appels d'outils d'un sous-agent, un par un, avec leur instant et leur résultat,
sont ici — et seulement ici. Le parent n'en voit que des compteurs (§4).

**Aucune ligne ne marque explicitement la fin** d'un sous-agent. La fin se lit chez le
parent (§4).

## 4. Ce que le parent enregistre

Le parent écrit deux choses par sous-agent.

**L'appel**, un `tool_use` de nom `Agent` dans un message `assistant` :

```json
{"id":"toolu_01MGXn7CZkY4UBrfpaTEjX7V",
 "input":{"description":"Lire notes.txt","subagent_type":"Explore",
          "prompt":"Lis le fichier notes.txt …","run_in_background":false}}
```

Son `timestamp` est **l'instant de naissance** du sous-agent. Deux sous-agents lancés dans
un même message apparaissent sur **deux lignes distinctes**, chaînées parent → enfant,
horodatées à une seconde d'écart (12:38:16.206 et 12:38:17.287). L'application ne doit donc
pas attendre un seul enregistrement par message.

**Le résultat**, un enregistrement `user` dont le `toolUseResult` porte tout le reste :

| Champ | Valeur relevée |
|---|---|
| `agentId` | `a4ff55e7b673ee217` — la jointure avec le fichier du §1 |
| `agentType` | `Explore` |
| `description` | (dans le `.meta.json`, voir §2) |
| `prompt` | l'**entrée** de la carte |
| `content` | la **sortie** de la carte, tableau de blocs `{type,text}` |
| `resolvedModel` | `claude-sonnet-5` — le modèle réellement employé |
| `status` | `completed` |
| `totalDurationMs` | `7526` |
| `totalTokens` | `16552` |
| `totalToolUseCount` | `1` |
| `toolStats` | `{readCount, searchCount, bashCount, editFileCount, linesAdded, linesRemoved, otherToolCount}` |
| `usage` | le détail des jetons, cache compris |

Le `timestamp` de cet enregistrement est **l'instant de mort** du sous-agent : c'est lui
qui déclenche le grisage de la barre sur la ligne du temps.

**R2 est levé** : début = horodatage du `tool_use`, fin = horodatage du `tool_result`, et
`totalDurationMs` donne la durée mesurée par Claude Code lui-même, en recoupement.

## 5. L'écriture est incrémentale — le temps réel est tenable

Mesuré sur le second sondage, un sous-agent lent, échantillonné toutes les deux secondes
pendant qu'il travaillait :

| instant | taille | lignes |
|---|---|---|
| t+2 s | 20 720 o | 6 |
| t+6 s | 21 421 o | 7 |
| t+8 s | 24 828 o | 9 |
| t+14 s | 25 529 o | 10 |
| t+16 s | 27 100 o | 11 |
| t+22 s | 27 801 o | 12 |
| t+24 s | 29 372 o | 13 |
| t+30 s | 30 073 o | 14 |
| t+32 s | 32 314 o | 16 |
| t+34 s | 33 945 o | 17 |

Dix-sept relevés croissants sur trente-quatre secondes. Le fichier existe et grossit
**pendant** l'exécution, ligne par ligne, et non à la fin. Un sous-agent peut donc être
affiché vivant, avec ses outils qui s'ajoutent au fur et à mesure, sans attendre qu'il
rende sa réponse. C'est la mesure qui valide l'exigence de temps réel du §7 du cahier
des charges.

## 5 bis. Les agents d'arrière-plan — un cas qui change la ligne du temps

Le second sondage a produit, sans que je le demande, le cas limite le plus gênant : le
parent a lancé son sous-agent avec `run_in_background: true`. Ce qui s'est passé alors
n'est **pas** ce que décrit le §4.

Le `tool_result` est revenu en **117 millisecondes** (`tool_use` à 12:40:09.978,
`tool_result` à 12:40:10.095) avec un `toolUseResult` presque vide :

```json
{"agentId":"a3dc05204b126a303","status":"async_launched",
 "totalDurationMs":null,"totalToolUseCount":null,"toolStats":null}
```

Ni durée, ni sortie, ni compteurs. **Pour un agent d'arrière-plan, le `tool_result` ne
marque pas la fin : il marque le lancement.** Une application qui grise la barre à
l'arrivée du `tool_result` ferait mourir l'agent cent millisecondes après sa naissance,
alors qu'il a travaillé quarante-deux secondes.

La vraie fin arrive plus tard, comme un enregistrement `user` injecté dans le transcript
du parent, à 12:40:52.150 — soit 113 ms après la dernière ligne du sous-agent :

```
<task-notification>
<task-id>a3dc05204b126a303</task-id>
<tool-use-id>toolu_01D39B7yKAwr6JN5pwi5nVVG</tool-use-id>
<output-file>…/tasks/a3dc05204b126a303.output</output-file>
<status>completed</status>
<summary>Agent "Exécution séquentielle de cinq commandes bash" finished</summary>
```

`task-id` vaut l'`agentId`, `tool-use-id` vaut l'`id` du `tool_use` d'origine : le
rattachement est direct, et `status` donne l'issue. C'est **le marqueur de fin** d'un
agent d'arrière-plan.

### Ne pas confondre cet enregistrement avec une requête d'Yves

Ce `<task-notification>` est un enregistrement `type: "user"`, comme un vrai prompt. Le §5
du cahier des charges veut dessiner les requêtes de l'utilisateur en repères verticaux :
il ne faut pas y dessiner celui-ci. Le champ qui les sépare est `origin.kind` :

| `origin.kind` | nature |
|---|---|
| `"human"` | une vraie requête d'Yves — à dessiner |
| `"task-notification"` | la fin d'un agent d'arrière-plan — à ne pas dessiner comme requête |
| absent | le prompt initial d'une session non interactive (`promptSource: "sdk"`) |

Relevé : les cinq prompts de la session interactive `1f21b1d5` portent tous
`{"origin":{"kind":"human"},"promptSource":"queued"}`.

---

## 5 ter. La profondeur 2 — un sous-agent qui en lance un autre

Sondage : un agent `general-purpose` chargé de lancer lui-même un `Explore` pour lire un
fichier. Les deux `.meta.json` produits, intégralement :

```json
{"agentType":"general-purpose","description":"Délégation lecture secret.txt via sous-agent",
 "toolUseId":"toolu_012NLt8ox4FUoEUfmDhstxTS","spawnDepth":1}

{"agentType":"Explore","description":"Lire secret.txt",
 "toolUseId":"toolu_01G62BEsvo1uTJ7QwMPQUCWe",
 "parentAgentId":"a91d64d18b022f9b5","spawnDepth":2}
```

Deux choses à retenir.

**Les deux fichiers sont côte à côte**, dans le même `subagents/` de la session racine. Le
répertoire est **plat** : il ne reproduit pas l'arbre, quelle que soit la profondeur. C'est
une bonne nouvelle — il suffit de surveiller un seul répertoire par session.

**Un champ apparaît à partir de la profondeur 2 : `parentAgentId`.** Il nomme l'agent
parent. Il est **absent** à la profondeur 1, où le parent est l'agent racine de la session.
La règle de rattachement est donc : `parentAgentId` s'il est là, l'agent racine sinon.

## 5 quater. Un agent interrompu, et un agent tué

Deux morts très différentes, mesurées séparément. C'est la seconde qui est dangereuse.

### Interruption douce (SIGINT, ce que fait Ctrl-C)

Les deux côtés écrivent une trace, en une centaine de millisecondes :

- dans le fichier du sous-agent, une dernière ligne `user` dont le texte est exactement
  `[Request interrupted by user]` ;
- chez le parent, le `tool_result` de l'appel `Agent` arrive, suivi d'une ligne `user`
  portant `[Request interrupted by user for tool use]`.

**Piège à éviter.** Dans ce cas le `toolUseResult` du parent n'est **pas un objet** : c'est
la chaîne de caractères `"User rejected tool use"`. Un programme qui lit
`toolUseResult.status` sans vérifier le type n'obtiendra pas d'erreur, il obtiendra
`undefined`, et classera silencieusement l'agent comme d'un statut inconnu. Il faut tester
le type avant de lire.

### Mort brutale (SIGKILL, ou un plantage)

**Rien.** Aucune trace, nulle part. Mesuré : le fichier du sous-agent s'arrête net sur un
`tool_result` ordinaire, et le transcript du parent **n'a aucun `tool_result`** pour son
appel `Agent` — ni avant, ni après la mort. Les deux fichiers comptaient 7 et 12 lignes
avant le signal, et toujours 7 et 12 quatre secondes après.

Un agent tué est donc indiscernable, dans les fichiers seuls, d'un agent qui travaille
encore. Sa barre resterait ouverte pour toujours.

**La seule issue est celle que l'écran des sessions emploie déjà** : tester si le processus
de la session vit encore. Un agent sans marqueur de fin dans une session dont le processus
est mort doit s'afficher *interrompu, fin inconnue* — et non *en cours*. La dernière ligne
écrite donne au mieux une borne basse de l'instant de sa mort.

## 5 quinquies. Une boucle ne laisse pas toujours d'acte de naissance

Le §3.4 disait qu'une boucle s'ouvre par un `tool_use` `Skill` portant `skill: "loop"`.
C'est vrai, mais incomplet. Compté sur la session Litanie : **183 appels `ScheduleWakeup`,
dont 10 portant `stop: true`, pour seulement 3 appels du skill `loop`**. Les sept autres
boucles n'ont aucun appel de skill — une boucle relancée par `/loop` tapé à la main ne
produit pas de `tool_use`.

Ce qui est constant, en revanche, c'est la **mort** : un `ScheduleWakeup` avec
`stop: true`. La règle de regroupement qui marche, et qui a été vérifiée :

1. grouper les réveils en suites délimitées par les `stop: true` ;
2. rattacher à une suite le `Skill` `loop` qui la précède immédiatement, s'il existe ;
3. à défaut, lire la consigne dans le champ `prompt` du réveil, qui rejoue l'entrée
   `/loop` telle quelle.

Vérification : les dix suites obtenues contiennent 5, 14, 24, 10, 34, 6, 5, 45, 16 et 14
itérations, soit **173 au total — exactement le nombre de réveils qui ne sont pas des
arrêts**. Aucune itération perdue, aucune comptée deux fois.

Enfin, `noop` vaut `true` sur 24 réveils, `false` sur 149, et **`null` sur les 10 arrêts** :
c'est cohérent, un arrêt n'étant pas une itération.

## 5 sexies. Ce que le transcript dit encore, et qu'on a fini par montrer

Relevé sur les 106 transcripts de la machine, par ordre de fréquence :

| Donnée | Où | Compté |
|---|---|---|
| Déclenchements de hooks | `attachment/hook_success` | 29 652 |
| Budget de jetons restant | `attachment/total_tokens_reminder` | 14 191 |
| Commandes mises en file | `attachment/queued_command` | 339 |
| Fichiers édités | `attachment/edited_text_file` | 321 |
| Permissions | `attachment/command_permissions` | 229 |
| Réveils de boucle, côté système | `system/scheduled_task_fire` | 217 |
| Serveurs MCP ajoutés | `attachment/mcp_instructions_delta` | 123 |
| Durée d'un tour | `system/turn_duration` (`durationMs`, `messageCount`) | 651 |
| Skills réellement chargés | `attachment/invoked_skills` | 9 |
| Compactages | `system/compact_boundary` | 9 |
| Pannes d'API | message `assistant` de modèle `<synthetic>` | 3 |

### La taille du contexte : deux sources, une seule bonne

`total_tokens_reminder` dit « 15 000 000 tokens left » : c'est un **budget de jetons**, pas
la fenêtre de contexte, et il se réinitialise. Il ne répond pas à la question.

La vraie mesure est dans `message.usage` de chaque message `assistant` :

```
contexte = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

Vérifié sur la session `454ef787`, autour de son premier compactage :

```
06:54:53   contexte = 996 455
06:56:46   >>> compact_boundary <<<
06:56:50   contexte =  52 151
```

La dent de scie est franche, et le pic d'avant compactage **est** la fenêtre réelle,
puisque c'est lui qui l'a déclenché. C'est la référence qu'emploie le dégradé de la voie
de contexte.

### Le délai demandé n'est pas le délai subi

`ScheduleWakeup` dit quand on **voudrait** être réveillé ; `system/scheduled_task_fire`,
dont le texte est de la forme « Claude resuming /loop wakeup (Sep 20 11:15pm) », dit quand
on l'**a été**. Mesuré sur une itération : 300 s demandés, 272 s subis. Rapprocher les deux
rend visibles les dérives d'une boucle.

### Un agent qui échoue de lui-même — R7 levée

Le §5 quater décrivait l'interruption venue de l'extérieur. Une panne venue de l'intérieur
s'écrit autrement : un message `assistant` dont le `model` vaut `"<synthetic>"` et dont le
texte est `API Error: …`. Trois relevés sur la machine :
`Connection lost mid-response`, `Request timeout`, `Server error mid-response`.

### Les skills : l'appel ne dit pas ce qui a été chargé

Un `tool_use` `Skill` dit **ce qu'on a demandé**. L'attachement `invoked_skills` dit **ce
qui a été injecté** : `name`, `path` (par exemple `bundled:loop`) et `content` entier —
8 778 caractères d'instructions pour le skill `loop`.

## 6. Corrections à apporter au cahier des charges

**C1 — la source de données (§3.2).** Il faut lire deux endroits, pas un :
le `<sessionId>.jsonl` *et* le répertoire `<sessionId>/subagents/`. Ce répertoire
**n'existe pas** tant qu'aucun sous-agent n'a été lancé : il apparaît en cours de session
et doit être découvert à chaud, pas seulement à l'ouverture.

**C2 — la liste d'outils de la carte d'agent (§6.1) est à revoir.** Le cahier des charges
la fait venir de `.attachment.tools` d'un `prompt_snapshot`. C'est **peu fiable** : sur les
106 transcripts de la machine, seule une minorité en contient, à raison de deux occurrences
par fichier, et **aucun des transcripts de sous-agent du sondage n'en a**. La liste des
outils *offerts* n'est donc généralement pas disponible.

Ce qui l'est, en revanche : les outils **réellement appelés**, lisibles un par un dans le
transcript du sous-agent, et leurs compteurs agrégés dans `toolStats`. La carte doit
afficher les outils employés, en le disant, et ne montrer la liste des outils offerts que
quand un `prompt_snapshot` existe.

**C3 — le rattachement.** Trois chemins mènent du sous-agent à son parent, par ordre de
solidité : `toolUseId` du `.meta.json` vers l'`id` du `tool_use`; `agentId`, présent sur
chaque ligne du sous-agent et dans le `toolUseResult` du parent ; `sessionId`, qui est
celui du parent. Aucune heuristique d'horodatage n'est nécessaire.

**C4 — `run_in_background`. Mesuré, et plus gênant que prévu** (§5 bis). Il faut deux
règles de fin, pas une :

- agent synchrone (`run_in_background: false`) : fin = horodatage du `tool_result`, et
  `toolUseResult` porte la sortie, la durée et les compteurs ;
- agent d'arrière-plan (`run_in_background: true`) : le `tool_result` arrive en 117 ms avec
  `status: "async_launched"` et **rien d'autre** ; la fin est le `<task-notification>`
  d'`task-id` correspondant, et la sortie se lit dans le transcript du sous-agent ou dans
  le fichier `output-file` que la notification désigne.

Conséquence pour l'écran 2 : tant que la notification n'est pas arrivée, la barre reste
ouverte. Et les repères de requêtes doivent filtrer sur `origin.kind == "human"`.

**C5 — la profondeur et les morts. Mesurées** (§5 ter et §5 quater). Trois règles en
sortent :

- le répertoire `subagents/` est **plat** : un seul répertoire à surveiller par session,
  quelle que soit la profondeur ;
- le rattachement se fait par `parentAgentId` quand il est là, par l'agent racine sinon ;
- il faut **trois** fins possibles, pas deux : terminé, interrompu, et *fin inconnue* —
  cette dernière quand aucun marqueur n'existe et que le processus de la session est mort.

Et une règle d'écriture : `toolUseResult` est **tantôt un objet, tantôt une chaîne**. Lire
`.status` sans tester le type donne `undefined` au lieu d'une erreur, donc un agent mal
classé en silence.

**C6 — les résultats d'outils ne sont pas au même endroit selon le transcript.** Découvert
en écrivant les cartes, et mesuré : **un transcript de sous-agent ne contient aucun champ
`toolUseResult`**, à aucune ligne. Compté sur le sondage de profondeur 2 : une occurrence
dans le transcript du parent, zéro dans chacun des deux fichiers de sous-agent.

Le résultat d'un outil appelé par un sous-agent vit donc uniquement dans le bloc
`tool_result` du message, dont le champ `content` est tantôt une chaîne, tantôt un tableau
de blocs. Un programme qui ne lit que `toolUseResult` n'affichera **aucun** résultat pour
les outils d'un sous-agent.

Deux conséquences dans la foulée :

- un agent de profondeur 2 n'a **pas de sortie enregistrée** : l'appel `Agent` qui l'a créé
  vient d'un transcript de sous-agent, donc sans `toolUseResult`, donc sans `content`, sans
  `totalTokens` ni `totalDurationMs`. Sa dernière réponse dans son propre transcript est la
  seule sortie disponible ;
- `toolStats` n'est pas toujours là non plus : présent pour les agents `Explore` du premier
  sondage, absent pour l'agent `general-purpose` du sondage de profondeur 2.

**C7 — `is_error` est souvent absent.** Il vaut `true` sur un échec, mais sur un succès il
est le plus souvent simplement absent, et non `false`. Écrire `ok = !bloc.is_error` déclare
donc « succès » une information qu'on n'a pas. Trois états valent mieux que deux : échec,
succès, non renseigné — ce dernier s'omettant à l'affichage.

**C9 — une boucle se reconnaît par sa mort, pas par sa naissance** (§5 quinquies). Le §3.4
du cahier des charges est à amender : seules 3 des 10 boucles de la session Litanie
commencent par un appel du skill.

**C8 — un agent qui échoue de lui-même. Levé** (§5 sexies) : message `assistant` de modèle
`"<synthetic>"` portant `API Error: …`.

**C10 — ce qui reste non vérifié.** Rien de connu à ce jour sur ce que l'application
affiche.
