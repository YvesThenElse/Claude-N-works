# La brigade de cuisine

Un kit à déposer dans un projet vide. On y demande un plat, et une brigade le prépare :
un chef qui ne cuisine pas, des commis spécialisés qui travaillent en même temps, et des
attentes qui durent vraiment le temps de la préparation.

Il n'y a rien à comprendre sur la cuisine. Ce qu'on vient voir, c'est **la forme d'une
orchestration dans le temps** — et c'est pour ça que les gestes attendent pour de bon :
sans durée, tous les agents se superposent en une seule colonne et il n'y a plus rien à
regarder.

## Poser le kit

```sh
mkdir mon-service && cd mon-service
cp -r /chemin/vers/OBB/exemples/cuisine/. .
```

Le point final de `cuisine/.` compte : sans lui, `.claude/` reste derrière et rien ne se
déclenche.

Puis, dans ce répertoire :

```sh
claude
```

**Accepte le dialogue de confiance** que Claude Code pose à la première ouverture d'un
répertoire. Sans lui, les permissions du kit sont ignorées — mesuré : *« Ignoring 10
permissions.allow entries from .claude/settings.json: this workspace has not been
trusted »* — et le service s'arrête au premier script.

Puis une seule phrase :

> prépare-moi une ratatouille

N'importe quel plat fait l'affaire — le chef écrit la fiche technique du plat demandé.
`/service blanquette de veau` fait la même chose plus directement.

## Regarder

Depuis le dépôt Orange Black Box, dans un autre terminal :

```sh
node serveur.js
```

puis <http://127.0.0.1:7420>, et la session de cuisine y est — pendant qu'elle tourne,
et après.

## Ce qu'il y a à voir

**Un arbre à trois étages.** Le chef de cuisine est la session elle-même. Il appelle des
commis, et il appelle au moins un *chef de partie* qui appelle à son tour ses propres
commis : c'est le troisième étage, celui qu'on ne voit pas dans une brigade plate.
Dans la ligne du temps, l'indentation le donne directement.

Le troisième étage cache une surprise, et le kit est fait pour qu'on la rencontre : **un
agent lancé depuis un agent part en arrière-plan.** L'outil répond « Async agent launched
successfully » en un dixième de seconde, et le parent peut rendre la main pendant que ses
commis travaillent encore. Mesuré au premier essai : un chef de partie rendu en 28 s pour
des commis qui ont taillé pendant deux minutes. C'est pour cela que le chef de partie
attend ses fichiers avant de conclure — sans cette barrière, son poste mentirait sur sa
propre durée.

**Un peigne, pas un escalier.** Les postes partent ensemble, dans un seul message
contenant plusieurs appels d'agent. Leurs barres se chevauchent, et le service dure le
temps du poste le plus lent — pas la somme des postes. La fiche de fin (`service.md`)
chiffre l'écart entre les deux.

**Quatre tempéraments de poste.** C'est le vrai sujet du kit :

| Poste | Modèle | Sa forme dans le temps |
|---|---|---|
| taillage | haiku | une marche par légume — le même geste qui revient, court |
| cuisson | sonnet | deux ou trois gestes seulement, dont un très long : un agent qui attend travaille |
| sauce | sonnet | un geste qui **revient parce que le précédent n'allait pas** — on goûte, on rectifie, on réduit encore |
| dressage | haiku | le seul qui consomme : il vide la mise en place qu'il met dans l'assiette |

**Et trois modèles, choisis par tempérament.** Le chef pense en opus — c'est lui qui
décide du menu et de qui fait quoi. Les postes qui **jugent** — un point de cuisson, un
assaisonnement — sont en sonnet. Les postes qui **répètent** — tailler cinq légumes,
monter des couches dans l'ordre — sont en haiku. La voie *modèle* montre alors trois
bandes au lieu de deux, et comme les barres d'agent sont juste au-dessus, on lit dans la
même image ce que le choix du modèle coûte en temps.

Mesuré sur une ratatouille à trois modèles, **attentes du minuteur retirées** — sans quoi
on comparerait des longueurs de gestes et non des modèles :

| Modèle | Agents | Temps de modèle | Appels d'outil | Par appel |
|---|---|---|---|---|
| sonnet | 5 | 75 s en moyenne | 9,8 | **7,6 s** |
| haiku | 4 | 54 s en moyenne | 14,8 | **3,6 s** |

Haiku répond deux fois plus vite à l'appel **et** en passe une moitié de plus : il travaille
par petits pas là où sonnet réfléchit plus longtemps entre deux gestes. Et il a tenu son
poste sans faute — skill chargée, repères demandés au livre, un geste par légume avec son
`timeout`, parures écrites puis supprimées une par une. C'est le genre de constat qu'on ne
peut pas tirer d'une barre : il faut la voie modèle **et** la voie outils en regard.

**Une courbe de fichiers qui monte puis redescend.** Chaque commis dépose un fichier par
élément préparé, et la courbe de la voie *fichiers* monte d'une marche à chaque fois.

La descente demande une attention particulière, parce que **cette courbe est par agent** :
elle compte les fichiers qu'un agent a fait exister, lui, et elle ne décroît que s'il
supprime quelque chose qu'il avait écrit. Le dressage retire les treize fichiers de la
mise en place, mais il les a reçus des autres : chez lui ils comptent comme *suppressions
non attribuées*, et sa courbe ne bouge pas. La vraie descente est chez le commis au
taillage, qui met ses propres parures au fond de légumes à la fin de son poste : sa courbe
monte à deux fichiers par légume, puis retombe de moitié.

Dans les deux cas, la suppression se fait **un chemin écrit en toutes lettres** à la fois.
Un `rm mise-en-place/*.md` effacerait autant de fichiers, mais l'observateur refuse de
deviner ce qu'un motif recouvre, et la courbe resterait en l'air.

**Une barrière.** Le dressage n'est lancé qu'une fois tous les postes rendus. Dans la
ligne du temps, le peigne s'arrête net et un seul trait reprend après.

## Le livre de recettes, en MCP

Le kit embarque son propre serveur MCP : `livre/serveur.js`, en Node, sans aucune
dépendance, déclaré dans `.mcp.json` à la racine. Il part donc avec le dossier, comme le
reste — rien à installer, rien à configurer.

Il expose trois outils en lecture seule :

| Outil | Qui l'appelle | Ce qu'il rend |
|---|---|---|
| `chercher` | le chef | les plats du livre qui ressemblent à ce qu'on a demandé |
| `recette` | le chef | la fiche technique entière : postes, gestes, minutes, dépôts |
| `repere` | chaque commis | les repères de son métier — tailles, points de cuisson, temps de réduction, ordre des couches |

**Le partage est volontaire : la skill dit comment travailler, le livre dit quoi.** Les
tables de référence ont quitté les skills pour entrer dans le livre, si bien qu'un commis
doit l'interroger pour savoir qu'une brunoise fait 2 mm ou qu'une volaille se sort à 74 °C.
Dans la ligne du temps, on voit donc des appels MCP à deux étages de l'arbre : le chef qui
sort la recette, puis chaque commis qui demande ses repères — et c'est exactement ce qu'on
veut donner à voir d'un serveur MCP, un service que plusieurs agents consultent chacun pour
sa part.

Chaque recette porte une **assiette** : les couches du dressage dans l'ordre, et pour
chacune le ou les éléments de mise en place dont elle vient. `node livre/verifier.js`
vérifie que tout ce qui se dresse a bien un poste qui le produit, qu'aucun élément n'est
déposé deux fois et qu'aucun poste ne dépasse 40 minutes — un poste trop long écrase tous
les autres sur la ligne du temps. C'est la seule cohérence qu'on peut vérifier
mécaniquement, et c'est celle qui comptait : le premier risotto réclamait au dressage des
copeaux de parmesan que personne n'avait taillés, et le commis a dressé sans, en le disant.

Cinq recettes au livre : ratatouille, blanquette de veau, velouté de potiron, risotto aux
champignons, tarte aux pommes. **Demander autre chose est le cas normal** — `chercher` rend
une liste vide, le dit franchement, et le chef compose la fiche lui-même. Ajouter une
recette, c'est déposer un fichier JSON dans `livre/recettes/` sur le modèle des autres : le
serveur relit le dossier à chaque appel, rien à redémarrer.

Pour l'éprouver sans Claude Code, le serveur parle sur l'entrée standard :

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node livre/serveur.js
```

Si le livre manque, la brigade cuisine quand même : les skills disent aux commis de
travailler de mémoire, simplement avec moins de précision.

## Combien ça dure

Une minute de recette vaut 2 secondes de montre. Mais ce n'est pas le minuteur qui fait la
durée d'un service : c'est le temps que les agents passent à réfléchir et à écrire entre
deux gestes. Mesuré sur une ratatouille complète — 9 agents, 22 gestes, 13 fichiers —
**9 minutes de montre** pour 2 minutes et demie d'attentes de minuteur.

Le parallélisme, lui, se mesure : les cinq postes totalisent 418 s de travail pour 204 s
de temps réellement occupé, soit **2,05×**. C'est le chiffre que `service.md` recalcule à
chaque service.

Pour allonger ou raccourcir les attentes :

```sh
CADENCE=5 claude     # une minute de recette = 5 secondes
```

La cadence ne change que l'échelle, jamais les proportions : c'est le seul endroit où
l'on triche, et on triche partout pareil.

## Ce qu'il y a dans le kit

```
.claude/agents/     cinq spécialités — chef de partie, taillage, cuisson, sauce, dressage
.claude/skills/     service (le chef d'orchestre) + les gestes de chaque poste
.claude/settings.json   les permissions et l'autorisation du serveur MCP
.mcp.json           déclare le livre de recettes
livre/serveur.js    le livre — un serveur MCP en stdio, sans dépendance
livre/recettes/     une recette par fichier JSON
livre/reperes/      les repères de métier, un fichier par poste
minuteur.sh         attend le temps d'un geste et le consigne dans le journal
ouvrir-service.sh   ouvre un service daté et le lien 'courant'
service/            tout ce que la brigade produit — un répertoire par service
```

Le `journal.ndjson` de chaque service est la **vérité de terrain** : ce que la brigade a
réellement attendu, geste par geste, avec ses horodatages. C'est contre lui qu'on vérifie
que la ligne du temps ne raconte pas d'histoires.

## Si le service se passe mal

| Ce qu'on voit | Ce que c'est |
|---|---|
| un seul agent, une seule barre | le chef a cuisiné lui-même ; relancer en lui rappelant qu'il ne touche pas au minuteur |
| des barres en escalier, aucune ne se chevauche | les postes ont été lancés un par un au lieu d'un seul message |
| un geste coupé à 2 minutes pile | l'appel Bash n'avait pas de `timeout` : il faut `(minutes × 2 + 30) × 1000` ms |
| la courbe des fichiers ne redescend pas | le dressage a supprimé avec un motif au lieu de chemins littéraux |
| rien ne démarre, un avertissement sur `permissions.allow` | le répertoire n'a pas été déclaré de confiance |
| les commis tournent en rond, « This command requires approval » | le minuteur a été appelé par un chemin absolu : une règle de permission matche la commande **telle qu'écrite**, et celle du kit autorise `./minuteur.sh` |
| aucun appel `mcp__livre__…` nulle part | le serveur du `.mcp.json` n'a pas été autorisé : `enabledMcpjsonServers` doit nommer `livre`, et le répertoire être de confiance |
| deux services mélangés dans le même journal | deux `claude` lancés en même temps dans le même projet : le lien `courant` ne désigne qu'un service à la fois |
