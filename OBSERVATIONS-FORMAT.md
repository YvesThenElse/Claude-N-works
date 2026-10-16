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
| absent | il faut regarder plus loin — voir le tableau complet ci-dessous |

Relevé : les cinq prompts de la session interactive `1f21b1d5` portent tous
`{"origin":{"kind":"human"},"promptSource":"queued"}`.

**Complété le 13 octobre 2026, après le solde du §11.** « `origin` absent » recouvre
quatre choses très différentes, et les confondre coûte cher dans les deux sens. Comptage
sur les 125 transcripts de la machine, lignes `user` hors résultats d'outil :

| `origin` | `promptSource` | forme du contenu | n | nature |
|---|---|---|---|---|
| `human` | `queued` / `typed` | texte ou blocs | 311 | **une consigne** — saisie interactive |
| `task-notification` | `system` / `sdk` | texte | 199 | la fin d'une tâche d'arrière-plan |
| absent | `sdk` | **texte simple** | 20 | **une consigne** — session lancée par `claude -p` ou le SDK |
| absent | `sdk` | **tableau de blocs** | 24 | l'invite d'un autre client (Cline) : son invite système et le rejeu de ses résultats d'outils, jusqu'à 41 343 caractères. **Pas** une consigne |
| absent | absent | `isMeta` | 266 | une réinvocation de `/loop` — pas une consigne |
| absent | absent | `isCompactSummary` | 10 | le résumé d'un compactage — pas une consigne |
| absent | absent | autre | 238 | rappels système, interruptions, sorties de commandes locales |

⚠️ **La ligne qui a coûté un critère d'acceptation** : jusqu'au 13 octobre 2026,
`lecture.js` ne retenait que `origin.kind === 'human'`, et les 20 consignes de la
troisième ligne n'apparaissaient nulle part — les six sessions du kit cuisine affichaient
« 0 requête ». Ce document le disait pourtant déjà, en une ligne de tableau ; c'est le
programme qui ne l'honorait pas. La leçon tient en une phrase : **un constat écrit ici
n'est pas un constat appliqué.**

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

### Et il part toujours en arrière-plan

Mesuré le 13 octobre 2026 sur le kit `exemples/cuisine`, où un chef de partie lance deux
commis. Le résultat que le parent reçoit n'est pas celui d'un agent synchrone :

```json
{"type":"text","text":"Async agent launched successfully. (This tool result is internal metadata …"}
```

**Un agent lancé depuis un sous-agent est asynchrone d'office**, sans que personne n'ait
demandé `run_in_background`. Trois conséquences, toutes mesurées sur la même session :

1. **Le parent ne l'attend pas.** Le `tool_result` revient en **92 ms** ; le chef de partie
   a rendu au bout de 28 s pendant que ses commis travaillaient encore 59 s et 119 s.
2. **La forme du marqueur change.** Le cas de §5 bis portait `status: "async_launched"`
   dans un objet ; ici c'est un simple texte, et il ne vit **que** dans le bloc
   `tool_result` — `toolUseResult` est absent des transcripts de sous-agents (§3). Lire la
   première forme seulement faisait conclure « terminé en 92 ms », et la ligne du temps
   montrait des agents de profondeur 2 en éclats invisibles.
3. **Personne ne voit sa fin.** La `<task-notification>` qui clôt un agent d'arrière-plan
   part vers son parent — lequel a déjà fermé son transcript. Sur la session mesurée,
   seule la racine en contient, et pour le chef de partie, pas pour ses commis. La seule
   fin connaissable d'un agent de profondeur 2 est donc **le dernier enregistrement de son
   propre transcript**. On le juge alors comme on juge la racine : dans une session qui ne
   tourne plus, un agent dont plus aucun appel n'est en suspens a rendu — « terminé » à ce
   dernier enregistrement. S'il reste un appel sans résultat, il est mort en travaillant,
   et c'est « fin inconnue ». Tant que la session vit, on s'abstient de trancher : un agent
   entre deux outils n'a lui non plus rien en suspens.

Un orchestrateur qui ignore ce point croit son étage terminé alors qu'il commence : dans
le kit, le chef de partie attend ses fichiers par une boucle `until` avant de conclure.

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
C'est vrai, mais incomplet. Compté sur la session `819d3fef` : **183 appels `ScheduleWakeup`,
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

Et un détail de forme relevé sur l'arbre à trois niveaux : à la profondeur 1,
`parentAgentId` vaut explicitement `null` dans le `.meta.json`, et non pas absent. Les deux
se traitent pareil — le parent est l'agent racine — mais il faut l'avoir prévu.

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

### On ne connaît la fenêtre que si la session a compacté

Le pic d'avant compactage **est** la fenêtre. Mais une session qui n'a jamais compacté ne
dit rien de son plafond : un agent qui monte à 47 000 jetons sur une fenêtre d'un million
n'est pas plein du tout. Peindre sa courbe en rouge parce que 47 000 est son propre maximum
serait un mensonge par mise à l'échelle.

L'application distingue donc les deux cas : dégradé du vert au rouge quand un compactage a
révélé la fenêtre, aplat neutre et échelle relative quand elle est inconnue — et le survol
le dit.

Même piège, même famille : la référence doit être **commune à toute la session**, et non
propre à chaque agent. Un sous-agent à 15 000 jetons mis à sa propre échelle paraîtrait
aussi saturé que l'agent racine à un million.

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

Un `tool_use` `Skill` dit **ce qu'on a demandé** — et rien d'autre : son résultat fait
**24 caractères de médiane**, « `Launching skill: taillage` », sur les 57 appels du corpus.
Le contenu entre ailleurs.

> ⚠️ **Cette section disait que `invoked_skills` portait le contenu. C'est vrai, mais ce
> n'est QU'UNE des deux formes — et la plus rare.** Voir le § 5 duodecies : 46 chargements
> sur 58 passent par un simple message. L'application n'a lu que la pièce jointe jusqu'au
> 15 octobre 2026, et ne voyait donc aucun skill de projet.

## 5 septies. Un agent né dans une boucle, et qui en lance un autre

Le cas n'existait **nulle part** dans les 106 transcripts de la machine : aucune session ne
combinait des réveils de boucle et des sous-agents. Il a fallu le produire — une session de
sondage menant trois itérations, chacune lançant un agent `general-purpose` qui déléguait à
son tour à un `Explore`. Six sous-agents sur deux profondeurs, dans une boucle.

Deux choses en sont sorties, toutes deux fausses jusque-là.

**Un arrêt est aussi un passage.** Le dernier tour d'une boucle se termine par un
`ScheduleWakeup` portant `stop: true`, et non par un réveil ordinaire. Ne compter que les
réveils perdait donc le dernier tour — trois itérations réelles affichées comme deux.
Compter l'arrêt comme l'itération qui le décide donne, sur la session `819d3fef`,
**183 itérations pour 183 appels `ScheduleWakeup`** : plus aucun passage ne se perd.

**Une boucle sans appel de skill n'a pas d'instant de naissance évident.** Son premier
réveil n'arrive qu'après coup, donc la fenêtre de sa première itération serait vide et les
agents qui y sont nés passeraient à la trappe — constaté : le premier agent était né
11 secondes avant le premier réveil. Il faut remonter au dernier point de départ connu qui
précède : une requête d'Yves, ou le début de la session.

**Le rattachement.** Chaque itération a une fenêtre — de la fin de la précédente à son
propre réveil — et tout agent dont la naissance y tombe lui est rattaché, **quelle que soit
sa profondeur**. Un sous-agent de sous-agent né au troisième tour est donc attribué au
troisième tour, et sa filiation reste lisible par ailleurs dans l'arbre. Les deux
informations sont distinctes et toutes deux nécessaires : *qui* l'a lancé, et *quand* dans
la répétition.

## 5 octies. Ce qu'un « temps mort » est vraiment

Un temps mort, au sens de la ligne du temps, est un intervalle où le transcript n'enregistre
**rien** : ni appel d'outil qui commence ou finit, ni agent qui naît ou meurt, ni requête.
Reste à savoir ce que l'agent faisait pendant ce temps-là. Classement des 45 trous repliés
des deux plus grosses sessions, selon le dernier appel qui les précède ou qui les couvre :

| Ce qui précédait | Trous | Durée |
|---|---|---|
| un `Bash` | 26 | 253 h |
| un `ScheduleWakeup` | 7 | 98 h |
| un `AskUserQuestion` **encore en cours** | 8 | 37 h |
| une notification, un envoi de fichier | 4 | 22 h |

Les trois formes d'attente : une boucle qui dort entre deux tours, l'agent qui attend une
réponse, et la session simplement inoccupée après un tour achevé.

**Le contrôle qui compte** : un repli pourrait-il avaler du travail en cours — une
compilation de quarante minutes, par exemple ? Sur ces deux sessions, les **seuls** appels
d'outil plus longs que le seuil de repli sont des `AskUserQuestion` : cinq d'un côté, trois
de l'autre. Aucun `Bash`, aucun agent. Et un `AskUserQuestion` qui dure est lui-même de
l'attente. Aucun travail n'est donc replié.

Une réserve honnête : les instants retenus pour détecter les trous sont ceux des appels
d'outils, des agents et des requêtes — pas ceux des messages de texte de l'agent. Un trou
peut donc commencer quelques secondes trop tôt, à la dernière action plutôt qu'à la
dernière parole.

## 5 nonies. Les hooks — mesurés le 13 octobre 2026

**Constaté.** Les hooks n'ont jamais été invisibles : le transcript les écrit depuis
toujours, et il y en a **32 609** sur cette machine. Ils sont des pièces jointes, sous
**trois** types :

| Type | Compte | Ce que c'est |
|---|---|---|
| `hook_success` | 32 609 | un hook qui s'est exécuté |
| `hook_system_message` | 5 | un hook qui **injecte du texte** dans la conversation |
| `hook_non_blocking_error` | 1 | un hook en erreur, sans conséquence |

Un `hook_success` porte toujours les mêmes dix champs — forme unique sur les 32 609 :

```json
{"type":"hook_success","hookName":"PreToolUse:Bash","hookEvent":"PreToolUse",
 "toolUseID":"toolu_01…","content":"","stdout":"{}\n","stderr":"","exitCode":0,
 "durationMs":41,"command":"…"}
```

`toolUseID` **rattache le hook à l'appel d'outil qu'il encadre** : c'est ce qui permet de
le poser au bon endroit sur la ligne du temps.

**Six événements observés**, et non quatre :

| Événement | Compte | Médiane | p95 | Total |
|---|---|---|---|---|
| `PreToolUse` | 15 875 | 41 ms | 244 ms | 19,4 min |
| `PostToolUse` | 15 562 | 28 ms | 38 ms | 7,9 min |
| `Stop` | 761 | 67 ms | 211 ms | 1,1 min |
| `PostToolUseFailure` | 202 | 29 ms | 41 ms | 0,1 min |
| `SubagentStart` | 71 | 29 ms | 37 ms | — |
| `SessionStart` | 138 | 79 ms | 127 ms | 0,2 min |

Soit **0,48 heure de hooks** cumulées sur toute la machine. Et un fait que seule la mise
en regard donne : **l'agent racine paie un `PreToolUse` et un `PostToolUse` par appel
d'outil, un sous-agent n'a qu'un seul hook, `SubagentStart`, à sa naissance.**

> ⚠️ **BLANC — un hook qui BLOQUE.** Les 32 609 enregistrements ont un `exitCode` de **0** :
> aucun hook n'a jamais échoué ni refusé quoi que ce soit sur cette machine. **On ne sait
> donc pas ce qu'écrit un hook bloquant**, et l'application ne doit rien prétendre à son
> sujet.
>
> **Mesuré le 13 octobre 2026, et la réponse est pire que la question** : un hook bloquant
> n'écrit **rien du tout**, parce qu'un hook de projet n'écrit jamais rien. Voir ci-dessous.

### ⚠️ Seuls les hooks de l'UTILISATEUR sont enregistrés — mesuré le 13 octobre 2026

Un hook déclaré dans le `.claude/settings.json` **d'un projet** s'exécute pour de vrai, et
ses effets sont bien réels — mais **il ne laisse aucune trace dans le transcript**.

L'épreuve, sur un même exercice portant un `PreToolUse` qui journalise et un second qui
**refuse** la commande (`permissionDecision: "deny"`) :

| Lancement | Le hook du projet s'exécute | `hook_success` enregistrés |
|---|---|---|
| `--setting-sources project` (hooks personnels exclus) | **oui** — le journal est écrit, le refus atteint l'agent qui le rapporte | **0** |
| sans ce drapeau (les deux sources chargées) | **oui** — le journal est écrit | **4**, et leur champ `command` montre qu'ils viennent **tous** de `~/.claude/settings.json` |

Le premier cas tranche : un hook de projet qui tourne seul produit **zéro** enregistrement.
Ce n'est donc pas une déduplication par `hookName`, c'est bien la **source** qui décide.

**Ce qu'il faut en retenir pour l'application** : la voie *hooks* montre ce que **votre
propre configuration** coûte à chaque geste. Elle ne montre pas, et ne peut pas montrer,
les hooks que le dépôt observé déclare. C'est une limite de la trace, pas du programme —
et elle mérite d'être dite, parce qu'un hook de projet qui refuse une commande est
précisément le genre de chose qu'on croirait voir.

**Et la commande d'un hook n'est pas envoyée au modèle.** Le champ `command` pèse 3 226
caractères en moyenne — douze millions au total sur une seule session — et c'est
précisément le piège que `tailleInjectee` évite : le compter dans le contexte donnait 85 %
de « système ».

## 5 decies. Le répertoire de travail — mesuré le 13 octobre 2026

**Constaté.** `cwd` et `gitBranch` sont présents sur **100 153 lignes**. Le répertoire de
travail n'est donc pas à deviner — mais il n'est pas non plus une propriété fixe :

- il **change en cours de session dans 44 transcripts sur 194** ;
- **7 sous-agents sur 69 travaillent ailleurs que leur parent** — le « plan de travail
  isolé » existe pour de vrai dans les traces.

> ⚠️ **Un changement de `cwd` n'est PAS un déplacement voulu.** Mesuré sur `454ef787` :
> **188 changements pour 6 répertoires distincts**. Le `cwd` oscille entre un dossier et
> son sous-dossier à presque chaque appel. Une première version de l'affichage en faisait
> autant de marques d'événement : elles noyaient les douze vraies marques d'outillage sous
> 187 marques de bruit. Ce qu'il faut retenir est donc l'**ensemble des répertoires
> distincts**, avec le nombre de lignes passées dans chacun :

```
   202 lignes  /…/projects
    22 lignes  /…/projects/Atlas
 14746 lignes  /…/projects/Digital-Twin-Alternative
  1341 lignes  /…/projects/Digital-Twin-Alternative/calibration
  1107 lignes  /…/projects/Digital-Twin-Alternative/web
    10 lignes  /…/projects/Digital-Twin-Alternative/web/src
```

## 5 undecies. Les tâches de fond — mesuré le 15 octobre 2026

**Constaté.** Une commande lancée avec `run_in_background: true` devient une **tâche** :
elle court pendant que l'agent fait autre chose et rend compte plus tard. Son cycle de vie
est entièrement reconstructible, mais il est **éparpillé sur quatre formes**.

**① La naissance n'est écrite nulle part ailleurs que dans la phrase rendue au
lancement.** Il n'y a ni champ, ni pièce jointe : seulement du texte.

```
Command running in background with ID: b04ajkth7. Output is being written to:
…/tasks/b04ajkth7.output. You will be notified when it completes.
```

Sur la machine : **508 lancements, dont 501 annoncent leur identifiant** ainsi.

⚠️ **L'identifiant d'une tâche et celui d'un agent ne sont pas du même espace.** Une tâche
porte un identifiant court (`b04ajkth7`, 9 caractères) ; un agent porte 17 chiffres
hexadécimaux. C'est ce qui permet de les distinguer dans une notification.

**② Les gestes en vol** sont des `tool_use` ordinaires : `TaskOutput` consulte la sortie
d'une tâche qui court (12 sur la machine), `TaskStop` l'arrête (48). Tous deux portent le
`task_id` dans leur entrée.

**③ La fin arrive sous TROIS formes, et n'en lire qu'une perd la moitié des fins.**
Mesuré sur une session de 131 tâches, 327 lignes portent un `<task-id>` :

| Forme | n | Ce que c'est |
|---|---|---|
| `queue-operation`, champ `content` | 195 | la **mise en file** — l'instant où la tâche finit |
| `attachment` de type `queued_command`, champ `prompt` | 63 | elle attend d'être remise |
| `user` avec `origin.kind: "task-notification"` | 69 | elle est **remise** à l'agent |

Les trois portent le même `<task-id>` et le même `<status>`. La distinction a un sens :
la mise en file dit **quand la tâche a fini**, la remise dit **quand l'agent l'a appris** —
quelques dizaines de millisecondes quand il est libre, un tour entier quand il ne l'est
pas. On retient donc la plus **précoce**.

**Statuts observés** : `completed`, `failed`. Une tâche close par `TaskStop` n'a pas
forcément de notification — son arrêt fait alors office de fin.

**Ce que ça donne.** En ne lisant que la troisième forme, l'application trouvait **66 fins
sur 131** ; en lisant les trois, elle en trouve **129**. Et sur l'ensemble du corpus, des
1 451 notifications, **1 373 désignent une tâche** et 78 un agent — les premières étaient
lues puis jetées.

## 5 duodecies. Les skills — mesurés le 15 octobre 2026

Un skill entre dans le contexte de **deux façons**, et une seule était lue.

| | forme | compte | ce qu'elle couvre |
|---|---|---|---|
| **A** | pièce jointe `invoked_skills` | **12** | les skills livrés avec Claude Code |
| **B** | message `user` marqué `isMeta` | **46** | les skills d'un projet — `.claude/skills/` |

**La forme A** est un `attachment` dont `skills[]` porte `name`, `path` (`bundled:loop`) et
`content`. Trois champs, toujours les mêmes.

**La forme B** n'a pas de type à elle. C'est un message ordinaire, dont le texte **commence
par** :

```
Base directory for this skill: /chemin/vers/.claude/skills/taillage

# Taillage
…
```

Le nom du skill n'est écrit nulle part : il se déduit du **dernier segment du chemin**.

> ⚠️ **Le marqueur n'est fiable qu'en tête.** Sur 48 lignes `user` qui contiennent la
> phrase, 2 ne sont pas des chargements : un résumé de compactage cite le texte d'un skill
> au milieu du sien. La règle est donc `type === 'user'` **et** `isMeta === true` **et**
> le texte **commence** par la marque — elle rend exactement 46, et les 8 lignes écartées
> sont toutes légitimes (Claude qui parle d'un skill, un résumé qui en recopie un).

### Ce que ça change

- **Le kit cuisine entier passait sous le radar.** `taillage` (15 chargements), `service`
  (8), `sauce` (8), `cuisson` (6), `dressage` (5) : 42 chargements invisibles.
- **358 288 caractères n'étaient comptés dans aucune catégorie du contexte.** Ni consigne,
  ni résultat d'outil, ni système : le texte d'un skill de forme B tombait entre les
  bandes de la composition. Il compte désormais comme texte système.

### Un skill se prend au début du poste

Sur les 59 chargements situés dans la vie de leur agent, **44 arrivent dans les 10 %
premiers**, et 26 dès les six premières lignes du transcript. C'est ce qui rend honnête de
dessiner une **plage** et non une marque : un skill n'est pas un geste, c'est du texte qui
entre et qui reste. La plage court jusqu'à la fin de l'agent — ou jusqu'au compactage, le
seul événement qui réécrive le contexte.

### Le disque n'est pas la trace

Le fichier `SKILL.md` d'aujourd'hui n'est pas celui qui a tourné. Mesuré sur `taillage` :
le texte injecté le 12 octobre fait **1 237 caractères**, le fichier sur disque en fait
**2 961**, modifié le 13 octobre à 11h26 — et le disque **ne contient même plus** le texte
injecté, qui a été réécrit et non complété. Lire le fichier pour montrer « la définition »
montrerait un skill qui n'a jamais été chargé. C'est le transcript qui fait foi.

## 5 terdecies. Un appel REFUSÉ — mesuré le 16 octobre 2026

Un refus n'est pas un échec : l'outil n'a pas tourné du tout. La ligne de résultat le dit
en clair, par un champ qu'on ne lisait pas :

```json
{"type":"user","toolDenialKind":"permission-rule",
 "toolUseResult":"Error: Le chef de rang a goûté : ce plat ne part pas en salle.",
 "message":{"content":[{"type":"tool_result","is_error":true,
   "content":"Le chef de rang a goûté : ce plat ne part pas en salle."}]}}
```

**Quatre genres, 146 refus sur le corpus :**

| `toolDenialKind` | compte | ce que c'est |
|---|---|---|
| `user-rejected` | 106 | Yves a répondu non |
| `permission-rule` | 20 | une règle de permission, **ou un hook** |
| `automode-unavailable` | 14 | le classifieur du mode automatique n'a pas pu décider |
| `automode-blocked` | 6 | le classifieur a bloqué |

Les outils refusés : `Bash` 121, `Write` 16, `EnterWorktree` 4, `Read` 2, et une fois
chacun `AskUserQuestion`, `Skill`, `Agent`.

### ⚠️ Un refus de hook ne se distingue pas d'un refus de règle

Les deux portent `permission-rule`, et **aucun champ ne les sépare** — vérifié en comparant
la liste des clés des quatre genres. Ce qui les sépare est la **raison** : une règle de
Claude Code rend toujours « `Permission to use <outil> has been denied. IMPORTANT: …` »
(18 cas sur 20), un hook rend la sienne (2 cas). On peut donc dire « la raison n'est pas
celle d'une règle », on ne peut pas dire « c'est un hook ».

### Et le hook lui-même, toujours pas enregistré

Mesuré de nouveau le 16 octobre 2026, en relançant l'exercice `02-les-hooks` : son
`.claude/settings.json` déclare deux `PreToolUse` et un `PostToolUse`, les trois tournent —
le journal de l'exercice les horodate, et le refus atteint l'agent — et le transcrit de la
session ne contient **aucune** pièce jointe de hook. Les types présents sont
`deferred_tools_delta`, `agent_listing_delta`, `skill_listing`, `total_tokens_reminder`,
`edited_text_file`. Le § 5 nonies le disait déjà des hooks du dépôt observé ; la mesure
tient sur Claude Code 2.1.236 comme sur 2.1.301.

**Ce qu'on peut donc montrer d'un hook qui refuse :** son effet, pas son existence.

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
du cahier des charges est à amender : seules 3 des 10 boucles de la session `819d3fef`
commencent par un appel du skill.

**C8 — un agent qui échoue de lui-même. Levé** (§5 sexies) : message `assistant` de modèle
`"<synthetic>"` portant `API Error: …`.

**C10 — ce qui reste non vérifié.** Rien de connu à ce jour sur ce que l'application
affiche.
