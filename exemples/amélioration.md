# Améliorations possibles

Des éléments de l'agentique qu'un kit pourrait mettre en scène, et que l'application
devrait alors savoir montrer. Ce n'est ni un plan ni un engagement : c'est la réserve
dans laquelle piocher pour écrire le prochain exemple.

Le marqueur dit où en est Claude N Works aujourd'hui :

| | |
|---|---|
| **✔** | déjà visible à l'écran |
| **◐** | lu par `lecture.js`, mais pas montré comme tel |
| **✗** | rien aujourd'hui, ni dans la lecture ni à l'écran |

La mise en scène proposée reste celle de la cuisine, parce que c'est le kit qui existe.
Rien n'oblige les suivants à y rester.

## Orchestration

- **Boucle écrite exprès** — ✔ voie boucles. Un saucier qui regoûte toutes les dix
  minutes jusqu'à ce que la réduction tienne. La voie existe mais n'a jamais été nourrie
  par une boucle faite pour ça : les dix boucles mesurées venaient du hasard des sessions
  trouvées sur la machine.
- **Barrière contre pipeline** — ✗. Deux services du même plat : l'un où le dressage
  attend que tout soit rendu, l'autre où chaque élément part à l'assiette dès qu'il est
  prêt. Aujourd'hui rien ne distingue visuellement une barrière d'un simple enchaînement,
  alors que c'est la différence qui fait tout le temps gagné.
- **Tâches de fond** — ✔ **depuis le 15 octobre 2026**. Une voie *tâches de fond* montre
  ce que l'agent a lancé puis laissé courir : une barre par tâche, colorée par son sort,
  avec les gestes portés sur elle en vol. Reste à le **mettre en scène** : le chef qui
  allume le four la veille.
- **Agent d'arrière-plan assumé** — ◐. Le chef lance le pain la veille et va faire autre
  chose. La trace le note (`async_launched`, `<task-notification>`), mais la barre ne dit
  pas « lancé ici, fini là-bas ».
- **Quatrième étage** — ✔ l'arbre le supporte. Un apprenti sous le commis. Jamais mesuré
  au-delà de la profondeur 2.
- **Orchestration scriptée** (l'outil Workflow) — ✗. Une carte de dix couverts exécutée
  par un script déterministe plutôt que par le jugement du chef. Apparaîtrait comme une
  nuée d'agents sans aucun tour humain.
- **Messages entre agents** — ✗. Le saucier qui demande au cuisinier où en est sa cuisson.
  Rien ne montre une conversation latérale entre deux agents.
- **Agent tué et relancé** — ◐. Un commis qui tombe, et le chef qui repasse la commande à
  un autre : on verrait le travail perdu et le travail refait.
- **Plan de travail isolé** (worktree) — ✔ **depuis le 13 octobre 2026**. La carte d'un
  agent donne son répertoire de travail, sa branche git, et la liste des répertoires
  distincts où il a travaillé avec le temps passé dans chacun. Mesuré : 7 sous-agents sur
  69 travaillent déjà ailleurs que leur parent. Reste à le **mettre en scène** : chaque
  commis son billot.

## Décision et contrôle

- **Question au client** — ✔ voie attente. La salle demande « avec ou sans ail ? » et la
  cuisine s'arrête pour de vrai.
- **Permission demandée en route, refusée, puis accordée** — ◐. Le commis qui veut sortir
  le couteau à huîtres. J'avais écarté une voie permissions faute de matière à montrer ;
  un kit la fournirait.
- **Mode plan** — ✗. Le chef propose son menu, attend l'accord, et n'exécute qu'après.
- **Hook qui refuse** — ◐ **depuis le 13 octobre 2026**. La voie *hooks* existe : elle
  montre les `PreToolUse` et `PostToolUse` autour de chaque geste, les bornes de cycle de
  vie, et les hooks qui injectent du texte. Ce marqueur disait « entièrement invisibles » —
  c'était faux, le transcript en écrit 32 609. Ce qui manque vraiment est le hook **qui
  refuse** : les 32 609 ont tous un code de sortie nul, donc on ne sait pas ce qu'un refus
  écrit. Un chef de rang qui renvoie un plat le dirait.

## Mémoire et contexte

- **Compactage provoqué** — ✔. Un service assez long pour que le contexte se replie, et
  qu'on voie le pli à l'endroit où il tombe.
- **Mémoire entre services** — ✗. Le carnet du chef : « la dernière fois, la sauce était
  trop salée ». Les fichiers de mémoire ne sont pas lus.
- **Ce qu'un sous-agent ne voit pas** — ◐ voie Contenu CTX. Faire demander à un commis une
  chose que seul le chef sait, et montrer noir sur blanc qu'il ne l'a pas.
- **Skills chargées à la demande** — ✔. Déjà dans le kit cuisine.

## Outils et MCP

- **Ressources et prompts MCP** — ✗. Le livre ne rend aujourd'hui que des outils ; il
  pourrait exposer ses recettes comme ressources, et un prompt « dicte-moi la fiche ».
- **Un MCP qui écrit** — ◐. Le chef qui range le service du jour dans le livre, consultable
  au service suivant. Le livre aurait un état qui grandit.
- **Un MCP lent, ou en panne** — ◐. Le livre qui met huit secondes à répondre, ou qui
  ferme : montre ce que coûte une dépendance externe, et ce qu'un agent fait sans elle.
- **Plusieurs serveurs** — ◐ voie outillage. Le livre, la cave, la commande fournisseur.
- **Outil long en arrière-plan** — ◐. Le four qu'on allume et qu'on surveille autrement
  qu'en restant planté devant.

## Qualité

- **Renvoi en cuisine** — ✗. Le chef goûte, refuse, et le poste recommence. C'est la boucle
  de rétroaction la plus parlante de l'agentique, et rien n'en rend compte aujourd'hui.
- **Trois sauciers, une sauce** — ✗. La même tâche confiée à N agents, et un choix à la
  fin : montrerait ce que coûte un vote et ce qu'il rapporte.
- **Auto-vérification** — ◐. Un poste qui relit sa propre mise en place avant de rendre.

## Économie

- **Un modèle par poste** — ✔ voie modèle. Épluchage au plus petit modèle, menu au plus
  grand, et le contraste de durée et de qualité dans la même image.
- **Effort de réflexion contrasté** — ✔ voie réflexion.
- **Cache** — ✔ jauge de cache. Le même plat deux fois de suite, pour voir la seconde fois
  coûter moins.

## Pannes

- **Agent tué net** — ✔ « fin inconnue ». Déjà mesuré, jamais mis en scène volontairement.
- **Outil qui dépasse son temps** — ◐. Un minuteur plus long que le `timeout` de l'appel :
  le geste est tranché en deux, et ça se voit.
- **Reprise de session** — ✗. Reprendre un service interrompu la veille.

## Par où commencer

Trois qui apporteraient le plus à l'application, parce qu'elles comblent un vide plutôt
qu'elles n'ornent l'existant :

1. **La boucle écrite exprès.** La voie existe et n'a jamais reçu une boucle propre.
2. **Le renvoi en cuisine.** Rien ne montre un travail refait sur jugement, alors que
   c'est le cœur de ce qui distingue un agent d'un script.
3. ~~**Les hooks.**~~ **Fait le 13 octobre 2026** — et la priorité était mal posée : les
   hooks n'étaient pas aveugles, ils étaient seulement non dessinés. Le transcript en
   écrivait 32 609. Ce qui reste à combler est plus étroit et plus intéressant : **un hook
   qui refuse**, dont aucune trace n'existe sur cette machine.
4. **Un modèle qui n'est pas d'Anthropic.** Bedrock, Vertex et Foundry sont reconnus en
   natif par le client ; OpenRouter et les modèles locaux parlent l'API d'OpenAI et non
   `/v1/messages`, donc ils demandent un traducteur. Ce que la voie *appels au modèle*
   écrirait alors n'a jamais été mesuré.
