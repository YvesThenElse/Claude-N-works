# Claude N Works

Observer ce que fait Claude Code : ses agents, ses sous-agents, ses skills, ses boucles et
ses outils, dans le temps.

- **Ce qu'on construit** → [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md)
- **Comment Claude Code écrit ses traces** → [`OBSERVATIONS-FORMAT.md`](OBSERVATIONS-FORMAT.md),
  la référence de format, mesurée et non devinée.
- **De quoi nourrir l'observateur** → [`exemples/`](exemples/LISEZ-MOI.md), des kits à
  déposer dans un répertoire vide, qui produisent une session dont la ligne du temps montre
  quelque chose. Le premier, [`cuisine/`](exemples/cuisine/LISEZ-MOI.md), met en scène une
  brigade : un chef qui ne cuisine pas, des postes en parallèle, une barrière avant l'envoi.

## Installer

Téléchargez le fichier de votre système sur la **[page des versions][versions]**, et
ouvrez-le. Rien d'autre à installer.

| Système | Fichier | Ce qu'on en fait |
|---|---|---|
| **Linux** x64 | `Claude-N-Works-…-linux-x64.AppImage` | le rendre exécutable (`chmod +x`), puis double-cliquer |
| **macOS** Apple Silicon | `Claude-N-Works-…-macos-arm64.dmg` | ouvrir, glisser dans Applications |
| **macOS** Intel | `Claude-N-Works-…-macos-x64.dmg` | ouvrir, glisser dans Applications |
| **Windows** x64 | `Claude-N-Works-…-windows-x64-installateur.exe` | lancer l'installateur |

[versions]: https://github.com/YvesThenElse/Claude-N-works/releases/latest

### Au premier lancement, votre système va se méfier

**Les binaires ne sont pas signés**, et c'est assumé : une signature coûte un compte
développeur Apple et un certificat Windows, pour une application qui lit un dossier local
et ne parle à personne. Votre système ne sait donc pas qui l'a produite, et il le dit. Le
geste pour passer outre, une seule fois :

| Système | Ce que vous verrez | Le geste |
|---|---|---|
| **macOS** | « impossible d'ouvrir, le développeur ne peut pas être vérifié » | **clic droit** sur l'application → **Ouvrir** → *Ouvrir*. Ou, en terminal : `xattr -d com.apple.quarantine "/Applications/Claude N Works.app"` |
| **Windows** | un écran bleu « Windows a protégé votre ordinateur » | **Informations complémentaires** → **Exécuter quand même** |
| **Linux** | rien, l'AppImage se lance | — |

Si cela vous gêne, la voie sans binaire reste entière : clonez le dépôt et lancez
`node serveur.js`. Il n'y a rien à compiler et aucune dépendance.

### Ce que l'application fait sur votre machine

Elle lit `~/.claude`, le dossier que Claude Code écrit — et **rien d'autre**. Elle n'écrit
jamais dedans, n'envoie rien sur le réseau, et n'écoute que sur `127.0.0.1`. Sans Claude
Code installé, elle démarre mais n'a rien à montrer.

## Lancer sans installer

```sh
node serveur.js
```

Puis <http://127.0.0.1:7420>. Node 22 ou plus, **aucune dépendance à installer** — c'est
toujours vrai, la coquille de bureau n'a rien changé au serveur.

Pour la fenêtre d'application depuis les sources :

```sh
npm install        # electron, uniquement pour la coquille
npm run bureau
```

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `7420` | port d'écoute |
| `HOTES` | `127.0.0.1` | adresses d'écoute, séparées par des virgules ; le mot `tailscale` s'y résout en les adresses du tailnet |
| `PERIODE_RELEVE_MS` | `500` | période du relevé ; borne le délai de détection d'une session morte |
| `CLAUDE_HOME` | `~/.claude` | où lire — sert surtout à éprouver le programme sur un faux dossier |

### Y accéder depuis le tailnet

```sh
HOTES=127.0.0.1,tailscale node serveur.js
```

L'application reste joignable en local **et** devient joignable depuis les autres appareils
du tailnet, à `http://<nom-de-la-machine>:7420`.

Le mot `tailscale` se résout à l'exécution en **toutes** les adresses que `tailscale ip`
rend, IPv4 et IPv6. Les deux sont nécessaires : MagicDNS résout le nom court d'une machine
vers son adresse IPv6, donc n'écouter qu'en IPv4 rendrait `http://<nom-de-la-machine>:7420`
injoignable alors que l'adresse numérique, elle, marcherait. Résoudre à l'exécution évite
aussi d'écrire en dur une adresse qui peut changer.

**Ce qui n'est délibérément pas fait : écouter sur `0.0.0.0`.** Cela exposerait aussi le
réseau local. Le serveur n'ouvre que les adresses nommées, ce qui se vérifie :

```
LISTEN  127.0.0.1:7420
LISTEN  <adresse IPv4 du tailnet>:7420      ← tailnet, IPv4
LISTEN  [<adresse IPv6 du tailnet>]:7420     ← tailnet, IPv6
```

et l'adresse du réseau local refuse la connexion (`Could not connect to server`).

**Ce que ça expose, en clair.** Toute personne ayant accès au tailnet peut lire
l'intégralité des transcripts : les prompts, les réponses, les commandes, le contenu des
fichiers lus et écrits. C'est pour cela que le défaut reste la boucle locale et que
l'ouverture doit être demandée explicitement.

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

Sélectionner une session ouvre sa fiche d'identité **en modale**, comme les cartes de
l'écran de session — les deux écrans parlent la même langue, et le fond ou la touche
d'échappement la referment. Posée sous la liste, elle obligeait à défiler pour lire ce
qu'on venait de demander, et son bouton tombait hors de l'écran. **Un bouton plein** y mène
à la ligne du temps. C'est la seule action de cet écran et l'unique raison d'avoir choisi une
session : elle doit se voir comme un bouton, et non comme un lien de plus au milieu d'une
liste de champs. Mesuré : le texte rend **7,4 : 1** sur le bouton en thème sombre et
5,7 : 1 en clair, et le bouton lui-même 6,7 : 1 contre la fiche.

Deux précautions, imposées par le fait que la liste se rafraîchit toutes les 500 ms.
L'ouverture est un **état à part de la sélection** : déduite de la session choisie, une
modale fermée se serait rouverte d'elle-même au relevé suivant — vérifié, elle reste
fermée sur deux relevés. Et **une session peut mourir pendant qu'on lit sa fiche** : la
modale garde alors ses champs, ceux du dernier relevé, et le dit en toutes lettres plutôt
que de se vider sous les yeux.

### Ce que fait la ligne du temps

Une voie par agent, l'agent racine en haut, chaque sous-agent sous son parent. La barre
d'un agent commence quand son parent l'a lancé ; terminée, elle se grise ; encore en cours,
elle reste en pointillés, ouverte à droite. Les quatre états mesurés sont distingués :
en cours, terminé, interrompu, fin inconnue.

Les appels d'outils ont **leur propre voie**, juste sous celle de l'agent. Ils étaient
auparavant posés sur la barre de l'agent, qu'ils recouvraient : un appel long — un appel
d'agent, une question à l'utilisateur — masquait l'agent lui-même et rendait le bord de sa
barre illisible. Chacun y figure à son instant : un trait net au départ, une bande de
couleur pour la durée. Un appel d'agent et un appel en échec ont leur couleur.

**Le nom de l'outil s'écrit au-dessus de la barre** dès qu'il y a la place — le §5 du
cahier le demandait depuis le lot 3. La place se mesure jusqu'au **prochain appel**, pas
jusqu'au bout de la barre : une étiquette a le droit de déborder sur le silence qui suit,
et c'est ce qui la fait apparaître sur un appel bref suivi d'une pause. Bornée ainsi, elle
ne peut jamais mordre sur la suivante — vérifié à trois niveaux de zoom, **zéro
chevauchement** par voie. Elle rend 3,76 : 1 contre le fond : discrète, pas illisible.

### Les échecs et leurs reprises

Un appel en échec est rose, et **un arc le relie à l'appel qui le rattrape**, la pointe sur
la reprise. Le survol dit de quelle sorte de reprise il s'agit.

La forme de la signalétique vient d'une mesure, pas d'une intuition. Sur les **297 échecs**
de l'ensemble des transcrits, 78 % sont suivis d'un appel **du même outil** — mais presque
jamais à l'identique : seulement 5 cas de relance telle quelle, contre une large majorité
d'entrées corrigées. Le geste à rendre visible n'est donc pas « il réessaie », c'est « il
corrige et relance ». Sur la session `819d3fef` : 28 échecs, dont **23 repris avec une entrée
corrigée** et 5 abandonnés au profit d'autre chose.

### Chercher dans un texte

Tout bloc de texte de plus de quatre cents caractères porte une barre de recherche :
surlignage de toutes les occurrences, compte, et saut de l'une à l'autre par les flèches ou
par Entrée. La lecture du contexte en a une qui porte sur **tout le contexte à la fois** :
elle réduit la liste aux éléments contenant le terme et les ouvre déjà surlignés — par
exemple 55 éléments sur 428 pour un mot donné. Les
requêtes d'Yves — et elles seules — traversent les voies en repères verticaux : la saisie
interactive, reconnue à son `origin.kind` valant `human`, **et** la consigne d'une session
lancée non interactivement, qui n'a pas d'`origin` du tout mais un `promptSource`.

Cliquer un agent, un appel d'outil, une boucle, une requête ou une voie de contexte ouvre
sa carte — dans l'arbre comme dans la piste. La carte s'ouvre en **modale au milieu de
l'écran**, large de 62 rem au lieu des 31 d'un tiroir latéral : lire un contexte ou un long
résultat d'outil demande de la largeur. Le fond ou Échap la referment. Celle d'un agent donne
son état, son type, sa profondeur, qui l'a lancé, ses instants, son modèle, son effort, ses
jetons, les outils qu'il a **employés** comptés par nom, et son entrée et sa sortie
repliées. Un agent à la fin inconnue le dit en toutes lettres. Celle d'un appel d'outil
donne son entrée et son résultat **en entier**.
Rien n'est tronqué. La mesure a tranché : sur le plus gros transcript de la machine,
37 Mo et 1717 appels d'outils, tout garder porte le modèle de 4,7 à 8,0 Mo — tandis qu'une
limite à 700 caractères amputait **44 % des entrées d'outils et 32 % de leurs résultats**,
c'est-à-dire précisément ce qu'on vient lire. Le coût mesuré côté navigateur : 22 ms pour
analyser les 7,9 Mo de JSON, 2 s pour charger la page. Le plus gros contenu observé fait
29 143 caractères, aucun ne dépasse cent mille.

**La carte d'un appel d'outil se lit comme une console.** L'entrée et le résultat sont
rendus en terminal — fond sombre dans les deux thèmes, bandeau d'invite, et la sortie dans
un gris plus doux que la commande. Un `Bash` porte l'invite `$` et le mot « commande » ;
les autres outils portent `›`, parce que leur entrée est du JSON et non une ligne de
commande, et lui donner une invite de shell serait un mensonge de forme. Un résultat en
échec passe en rose. Chaque bandeau donne aussi le nombre de lignes.

⚠️ **Le contenu du bloc reste exact** : l'invite vit dans le bandeau, jamais dans le texte.
Sans cela un copier-coller rapporterait une commande fausse, et le compte de caractères
mentirait.

Le contraste a été mesuré : la commande rend **13,8 : 1** sur le fond de la console, la
sortie 8,6, un échec 7,3. Et la bordure — elle seule — dépend du thème : sur une fiche
sombre, la console ne rend que **1,15 : 1** contre son fond, et descendre jusqu'au noir pur
ne la porte qu'à 1,25. On ne sépare pas deux surfaces sombres par le ton ; c'est la
bordure qui le fait, à **2,05 : 1**.

Les blocs d'entrée et de résultat sont **ouverts d'emblée** : c'est le contenu qu'on vient
lire, le replier imposait un clic pour voir l'essentiel. Chacun garde sa hauteur bornée et
son propre ascenseur. Seules les instructions chargées d'un skill restent repliées : des
milliers de caractères, et ce n'est pas ce qu'on regarde en premier.
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

### Se déplacer dans la ligne du temps

| Geste | Effet |
|---|---|
| molette | zoome **autour du curseur** : l'instant sous le pointeur y reste |
| bouton gauche enfoncé + souris | déplace la vue, horizontalement et verticalement |
| curseur « échelle » | même zoom, centré sur la vue |

Le zoom à la molette relève l'instant sous le curseur avant de changer d'échelle, puis
recale le défilement pour qu'il retombe au même endroit. Mesuré sur vingt crans consécutifs,
soit un facteur mille d'échelle : la dérive reste **sous le demi-pixel** et ne s'accumule
pas.

La plage de zoom va de « toute la session dans la fenêtre » jusqu'à **46 pixels par
seconde** sur un transcript de onze jours — assez pour séparer deux appels distants de
quelques dizaines de millisecondes. Deux bornes l'arrêtent : un pixel par milliseconde,
au-delà duquel il n'y a plus rien à gagner, et une largeur de dessin de 16 millions de
pixels. Cette seconde borne vient d'une mesure : le navigateur place correctement un
élément jusqu'à 20 millions de pixels, et **écrête à 33 554 428** — au-delà, la fin du
dessin se replie sur elle-même.

**On ne dessine que ce qui est visible**, élargi d'une marge, et on redessine en défilant.
Sans ce découpage, la règle seule produisait 140 000 traits et 70 000 étiquettes à fond de
zoom, soit deux secondes par redessin — inutilisable à la molette. Mesuré après :

| Échelle | Largeur | Éléments | Redessin |
|---|---|---|---|
| 0,1 px/min | 896 px | 5 960 | 50 ms |
| 1,8 px/s | 637 000 px | 1 144 | 14 ms |
| 45,8 px/s | 16 000 000 px | 823 | **11 ms** |

Et le contrôle qui compte : dix appels pris sur toute la durée des onze jours sont bien
dessinés quand on défile jusqu'à eux. Le découpage ne cache rien.

**Le repère d'une requête s'attrape.** Sa pastille fait 5,5 px de rayon, mais ce qu'on
clique est plus large que ce qu'on voit : une prise transparente double la cible, sur la
pastille comme le long du trait. Elle est **bornée à la demi-distance au repère voisin**,
parce qu'une prise fixe se volerait le clic d'à côté — mesuré sur une session de 76
requêtes vue en entier, l'écart médian entre deux repères est de **3 pixels**. Zoomé, le
rayon de prise atteint 13 px et plus aucune prise n'en chevauche une autre ; en vue
d'ensemble, les seuls chevauchements restants sont ceux dont les repères sont distants de
moins de 4 px, où les pastilles se confondent déjà à l'œil.

Un glissé de plus de quatre pixels n'ouvre pas de carte — sans quoi tout déplacement qui
part d'une barre en ouvrirait une. En deçà, c'est un clic et il agit normalement.

Le glissé suit le pointeur par des écouteurs posés sur la fenêtre, et **non** par
`setPointerCapture`. La capture paraissait l'outil fait pour ça — elle garde le glissé
vivant quand le curseur sort du cadre — mais elle redirige aussi le clic qui suit vers
l'élément capturant : la cible devenait `<div class="piste">` au lieu de la barre, et plus
aucune carte ne s'ouvrait.

### La règle du temps

Une graduation en haut de la piste, avec un filet pâle qui descend sur les voies. Les
instants sont ronds en **heure locale**, pas en temps epoch, et le pas suit l'échelle en
privilégiant les repères qui se lisent vite — l'heure ronde, puis les dizaines de minutes
(:00, :10, :20…), puis les multiples de cinq, puis la minute. Le quart d'heure, la
demi-heure et les deux minutes sont écartés exprès. Mesuré du plus large au plus serré :

```
12 h  →  3 h  →  1 h  →  10 min  →  5 min  →  1 min  →  30 s  →  10 s  →  5 s
```

Elle se calcule **par segment actif**, et non sur toute la largeur : les temps morts étant
repliés, le temps n'avance pas au même rythme d'un bout à l'autre, et une graduation
régulière en pixels mentirait. Chaque segment porte en plus un repère daté à son départ,
car à grande échelle le pas retenu peut dépasser la durée d'un segment — la règle serait
alors muette. Une étiquette qui n'a pas la place n'est pas écrite ; son trait reste.

### Lire les couleurs

Rester sur une ligne de l'arbre — l'agent, le contexte, l'attente, les boucles — en donne
la légende complète : ce que chaque couleur signifie **dans cette voie-là**, ce qui n'est
pas toujours la même question que dans la barre du haut. Pour un agent, l'état de la barre
et la nature des marques d'outils ; pour le contexte, ce que le dégradé mesure et quand il
ne mesure rien ; pour l'attente, les trois formes ; pour les boucles, les montants et les
encoches.

### Le contenu du contexte

Sous « Taille CTX », la voie **« Contenu CTX »** montre, à chaque appel au modèle, de quoi
le contexte était fait — en parts empilées sur toute la hauteur, puisque la taille est déjà
donnée par la voie du dessus : invite système et rappels, résultats d'outils, appels
d'outils, paroles du modèle, requêtes d'Yves. Cliquer un appel en donne la recette chiffrée.

**On peut lire le contexte lui-même.** La carte d'un appel porte un bloc « lire le contexte
envoyé à cet appel » : il va chercher au serveur, à la demande, la suite exacte des éléments
qui composaient le contexte à cet instant — le résumé du dernier compactage, les skills
chargés, chaque appel d'outil avec sa commande, chaque résultat avec son contenu, les
rappels, les paroles du modèle. Chaque élément se déplie, et des filtres par genre
permettent de ne garder que ce qu'on cherche.

C'est servi à la demande parce que c'est gros : 623 ko en 0,4 s pour un contexte de 428
éléments et 568 439 caractères, sur le plus gros transcript de la machine. Le mettre dans
la page coûterait ce poids à chaque rafraîchissement, pour quelque chose qu'on ne regarde
qu'un appel à la fois.

**Deux choses manquent, et l'application le dit plutôt que de les passer sous silence.**
L'invite système complète, les définitions d'outils et la mémoire du projet ne sont pas
dans le transcript. Et **le contenu des blocs de réflexion n'est pas conservé** : le
transcript n'en garde que la signature. Ces blocs apparaissent quand même dans la liste,
marqués « contenu non conservé », pour qu'on sache qu'ils occupaient de la place.

**Ce que cette voie ne peut pas montrer, et le dit.** Le transcript ne contient pas
l'invite système complète, les définitions d'outils ni la mémoire du projet. Mesuré sur la
session `819d3fef` : **1,37 caractère attribué par jeton de contexte**, là où du texte
ordinaire en compte environ quatre — le transcript ne nomme donc qu'**un tiers environ** du
contexte. La carte porte une jauge qui donne cette part, appel par appel.

Un piège évité en chemin : compter les pièces jointes en entier donnait 85 % de « système »,
parce qu'un enregistrement `hook_success` recopie la commande du hook — douze millions de
caractères sur cette seule session, qui ne sont jamais envoyés au modèle. Seuls les champs
réellement injectés sont comptés.

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

### La voie d'attente

Sous le contexte, une voie montre les moments où le système **ne travaille pas mais
patiente**. Trois formes, chacune avec sa couleur :

| | Ce que c'est |
|---|---|
| ambre | une `AskUserQuestion` posée et pas encore répondue |
| cyan | une boucle qui dort entre deux tours, après un `ScheduleWakeup` |
| gris | le tour s'est achevé et personne n'a repris la main |

Une attente est un intervalle de plus de trente secondes **sans aucun événement**, ou bien
une question restée sans réponse. Une attente en cours — la session tourne, personne ne
répond — reste ouverte à droite, en pointillés.

La **durée est écrite sous chaque barre** dès qu'elle y tient ; en deçà, l'étiquette se
chevaucherait avec ses voisines et seul le survol la donne.

**Les pauses de réflexion de l'agent n'en sont pas.** Ses propres messages comptent comme
des événements, sinon le temps qu'il passe à réfléchir entre deux appels ressemblerait à de
l'attente. Mesuré : les compter élimine 59 fausses attentes sur une session et 106 sur une
autre, pour seulement une heure et demie de différence — c'étaient bien des pauses courtes.

Sur la session `819d3fef` : **10,9 jours d'attente sur 11,1 jours** — dont 6,9 j de sommeil de
boucle, 3,1 j d'inoccupation et 21,6 h de questions posées.

### Les boucles

Une boucle est une suite de réveils délimitée par un arrêt. Sa carte montre la répétition
telle quelle : une case par itération, pleine si quelque chose a été produit, grise si rien
n'a changé. Cliquer une case donne son instant, le délai demandé pour le réveil suivant, et
la raison écrite à ce moment-là. L'en-tête compte les itérations sans effet, et combien de
suite à la fin — le signe d'une boucle qui tourne à vide.

Sur la session `819d3fef` : dix boucles, **183 cases**, retrouvées sans en perdre ni en
compter deux fois — 173 relances et les **10 arrêts**, qui ont chacun leur case et leur
marque. Sur la session `454ef787` : six boucles, 78 cases, dont 6 arrêts. *Ce passage
annonçait 173 jusqu'au 13 octobre 2026 : il oubliait les cases d'arrêt que l'écran montre
pourtant.*

**Et un réveil programmé n'est pas un réveil survenu.** Sur les 173 relances de la session
`819d3fef`, le transcript n'enregistre que **146 réveils** (`system/scheduled_task_fire`) :
27 n'ont jamais eu lieu. Un relevé de ce qui vient après chaque relance en donne le sens —
128 fois le réveil lui-même, **35 fois la fin d'une tâche d'arrière-plan** qui reprend la
main avant lui, 7 fois Yves, 3 sans rien d'identifiable. Ce relevé est approximatif : il ne
retrouve que 128 des 146 réveils réellement enregistrés, parce qu'il ne regarde que les
quarante lignes suivantes. L'ordre de grandeur, lui, tient — et sur `454ef787` une seule
relance sur 72 est restée en l'air.

⚠️ **La bande d'itérations ne distingue pas encore les deux.** Une case dit ce que le tour
a produit, pas si le réveil qu'il a demandé a eu lieu. C'est une réserve connue, pas une
mesure manquante.

La carte relie aussi les boucles aux agents : chaque itération liste les agents nés pendant
ce tour, de toutes profondeurs, et la carte d'un agent dit réciproquement de quelle
itération il vient. Un sous-agent de sous-agent né au troisième tour se lit donc des deux
côtés — *qui* l'a lancé par l'arbre, *quand* dans la répétition par la boucle.

La carte montre aussi le **délai subi** face au délai demandé : `ScheduleWakeup` dit quand
on voudrait être réveillé, `scheduled_task_fire` dit quand on l'a été. Mesuré sur une
itération : 300 s demandés, 272 s subis.

Les boucles ont aussi leur voie sur la ligne du temps, sous l'agent qui les mène. Une
boucle n'étant pas un agent, elle s'y dessine comme un rail et non comme une barre : un
trait borné par deux **montants pleins à empattement**, qui se lisent comme un début et une
fin et ne se confondent pas avec les encoches d'itération. Chaque encoche est pleine ou
creuse selon que le tour a produit quelque chose.

Deux boucles ne se recouvrent jamais à l'écran : celle qui arrive se pose sur le rang
suivant. Se *toucher* n'est pas se recouvrir — une boucle commence souvent à l'instant
exact où la précédente s'arrête, et cela ne fait pas descendre d'un rang.

La liste déroulante en haut choisit une boucle : sa carte s'ouvre et **sa plage est mise en
évidence sur toute la hauteur** de la ligne du temps, avec son nombre d'itérations et sa
durée. Elle remplace la rangée de boutons, qui prenait une ligne entière et ne disait rien
du contenu des boucles.

Choisir ensuite une case dans la bande d'itérations **encadre ce tour précis** sur la ligne
du temps, en pointillés — sa fenêtre allant de la fin du tour précédent à son propre
réveil. Si le tour n'est pas dans la vue, la ligne du temps s'y transporte ; s'il y est
déjà, elle ne bouge pas, pour ne pas faire sauter l'écran sous les doigts. D'un coup d'œil sur `819d3fef`, on voit que la session est faite de
boucles presque de bout en bout.

### Les tours — et où passe vraiment le temps

Un **tour** va de ce qui réveille l'agent — une requête d'Yves, un réveil de boucle, la fin
d'une tâche d'arrière-plan — jusqu'à ce qu'il rende la main. Claude Code en écrit lui-même
la durée à sa fin, dans un enregistrement `system/turn_duration`. C'est donc la **seule
mesure exacte** du temps de travail, et non une estimation tirée des événements.

La voie des tours se place juste sous l'agent : tout le reste — outils, appels au modèle —
se loge dedans, et ce qui sépare deux barres n'est pas du travail plus discret, c'est de
l'attente. L'intensité d'une barre suit le nombre d'appels qu'elle contient.

**Le chiffre que tout le reste laissait deviner** : sur la session `819d3fef`, 299 tours,
**11,3 heures de travail cumulé sur 11,4 jours** — soit **4,1 %**. Les tours ne se
chevauchent jamais. La médiane d'un tour est de 66 secondes, le plus long dure 84 minutes.

Cliquer un tour en donne le détail : combien d'appels d'outils et de requêtes au modèle il
contient, et la part de sa durée passée dans les outils et chez le modèle. Exemple relevé :
un tour de 10 minutes, 27 appels `Bash`, 28 requêtes au modèle — 20 % du temps dans les
outils, 51 % chez le modèle.

### Les fichiers

Une voie où chaque opération sur un fichier se lit de part et d'autre d'une ligne de base :
**vers le haut en vert les lignes ajoutées, vers le bas en rose celles retirées**, et un
simple trait sur la ligne pour un fichier seulement lu. Les hauteurs suivent la racine du
nombre de lignes, sans quoi un fichier de mille lignes réduirait une correction de trois
lignes à rien.

Sur la session `454ef787` : **162 fichiers distincts**, 179 opérations — 98 lectures,
80 écritures, 1 modification — pour **+12 065 / −2 lignes**. La carte liste les fichiers
les plus repris, ce qui montre où le travail a buté.

**La courbe du nombre de fichiers.** En bas de la même voie court un escalier : le nombre
de fichiers que l'agent a fait exister. Il monte à chaque fichier écrit pour la première
fois, et descend quand l'agent en supprime un qu'il avait écrit. Un escalier et non une
courbe lissée — le compte change par bonds, et lisser laisserait croire à une progression
continue.

Le diff et la courbe occupent deux bandes distinctes de la voie : mélangés sur la même
amplitude, ils se rendaient illisibles l'un l'autre.

**Elle ne devine jamais.** Une suppression par motif, par variable ou par substitution est
ignorée, parce qu'on ne saurait pas ce qu'elle efface réellement — la carte compte ces
suppressions non attribuées à part. Mieux vaut une courbe qui en rate que d'en inventer.
Mesuré sur l'ensemble des transcrits : 23 agents ont une courbe, **3 la voient descendre**,
et 131 suppressions restent non attribuées. Sur la session `454ef787`, la courbe va de 1 à
**78 fichiers**.

**Sur le « diff git ».** Le transcript n'en contient aucun. Mais il contient mieux : ce que
l'agent a *demandé*. Un `Edit` porte l'ancien et le nouveau texte, donc le compte est
exact. Un `Write` ne porte que le nouveau contenu : ses lignes comptent en positif, et ce
qu'il a remplacé reste inconnu — la carte le dit.

### La réflexion

Une barre par appel où le modèle a réfléchi avant de répondre, de hauteur proportionnelle
au nombre de jetons de réflexion — **à l'échelle de la racine**, parce que la médiane est à
248 jetons et le pic à 3 475 : une échelle linéaire écraserait les quatre cinquièmes des
barres contre la ligne de base. L'absence de barre est un signal aussi : ce tour-là, il a
répondu sans réfléchir.

Sur la session `819d3fef` : **886 appels sur 2011 comportent une réflexion** (44 %), pour
319 699 jetons — soit 18 % de tout ce que le modèle a produit. Et un contraste que la carte
donne : il réfléchit **359 jetons en moyenne avant d'appeler un outil**, mais **517 avant de
seulement parler**.

Le contenu de la réflexion n'est pas conservé par le transcript, seule sa signature l'est.
On sait donc qu'elle a eu lieu et ce qu'elle a coûté, jamais ce qu'elle disait.

### Les appels au modèle

Une voie par modèle réellement appelé, sous l'agent qui l'appelle. Chaque appel s'y lit en
trois temps : un trait vertical à l'instant de l'**appel**, une ligne fine pour l'**attente
avant la réponse**, puis un rectangle plein pour la **réponse**, du premier bloc au
dernier. Le décalage entre le trait et le rectangle est la latence.

Mesuré sur la session `819d3fef`, 2001 appels à `claude-opus-5` : attente avant réponse de
**7,9 s en moyenne**, réponse de **6,4 s**. La répartition des attentes : 1086 sous 5 s,
870 entre 5 et 30 s, 44 entre 30 s et 2 min, et **une seule** au-delà.

Cliquer un appel ouvre sa carte : **ce qui l'a déclenché** — une requête d'Yves, le
résultat d'un outil avec sa commande, la fin d'une tâche d'arrière-plan, le réveil d'une
boucle — les outils qu'il a appelés, et **ce que le modèle a dit**. La carte donne aussi
les totaux du modèle sur toute la session.

### Le cache

C'est le chiffre qui compte le plus dans une longue session, et il a droit à son propre
détail. Tout le contexte est renvoyé au modèle **à chaque appel** : sans cache, il serait
retraité chaque fois. L'entrée se décompose donc en trois :

| | |
|---|---|
| **lus du cache** | déjà vus, non retraités — c'est eux qui rendent une longue session tenable |
| **écrits au cache** | ce qui vient d'être ajouté, payé une fois pour être relu ensuite |
| **payés au prix fort** | ce qui n'a pas été mis en cache du tout |

Une **jauge rouge → vert** porte la part réellement servie par le cache, pour l'appel
regardé et pour l'ensemble des appels du modèle. Sur la session `819d3fef` : **98,4 %** sur
973 831 462 jetons d'entrée au total. L'appel le moins bien servi est à 0 % — c'est le tout
premier de la session, quand rien n'est encore en cache — et la médiane est à 99,7 %.

**Ce qu'on mesure et ce qu'on ne mesure pas**, dit aussi sur la carte. L'« appel » est le
dernier événement écrit avant la réponse : une requête d'Yves, un résultat d'outil, ou le
réveil d'une boucle — ce dernier compte, sans quoi la latence d'un tour de boucle
engloberait tout le sommeil. Le « début de réponse » est l'instant où le premier bloc a été
écrit, pas celui du premier jeton : un long bloc de réflexion repousse donc ce début. Et
**45 % des appels n'ont pas de durée de réponse mesurable** — leur réponse tenait en un
seul bloc, donc début et fin se confondent.

### La voie Buffer CTX

Une bande par appel au modèle, du rouge au vert selon ce que le cache **épargne** sur cet
appel. La bande tient jusqu'à l'appel suivant : l'état du buffer ne change que quand on y
touche.

**Pourquoi l'économie plutôt que la part relue.** La part relue ne distingue rien : mesurée
sur **16 178 requêtes** de cette machine, elle vaut 97,9 % en moyenne et 96 % des appels
sont au-dessus de 90 %. Une échelle fondée dessus peindrait tout en vert. On montre donc ce
que l'appel ne paie pas, aux tarifs relatifs d'Anthropic — écrire au cache coûte 1,25 fois
le prix plein, y lire 0,1 fois :

```
économie = 1 − (prix fort + 1,25 × écrits au cache + 0,1 × lus du cache) / entrée totale
```

**Le dégradé est tendu de 50 % à 90 %, pas de 0 à 100 %.** 90 % est le plafond : même
entièrement relu, un contexte coûte encore un dixième. 50 % est le premier centile mesuré
(52,4 %), ce qui fait saturer en rouge le pour-cent d'appels les plus coûteux au lieu
d'écraser l'échelle. Entre les deux, les percentiles mesurés se répartissent — p5 à 80,6 %,
p25 à 88,4 %, médiane à 89,4 %, minimum absolu **−25 %** quand tout est réécrit au cache.

**La voie est verte presque partout, et c'est la vérité** : seuls 2,1 % des appels tombent
sous 70 %. Son travail est de montrer ces exceptions-là, pas de noircir un tableau qui va
bien.

**Ce que disent les stries rouges.** Elles ne sont pas des fautes de conduite : ce sont des
reprises après une pause, où le cache a expiré. Mesuré sur la session la plus longue,
2 880 appels : des **22 appels sous 70 %, 18 suivent un silence de plus de cinq minutes**,
l'écart médian étant de 2 h 36 — contre 2,3 s pour les 2 857 autres. Le premier appel d'un
agent est rouge pour la même raison, en pire : il n'y a rien à relire.

**Une marque par appel, et sa largeur est plafonnée** — corrigé le 15 octobre 2026.
Jusque-là, chaque appel peignait une bande qui tenait jusqu'au suivant. L'intention était
juste — l'état du buffer ne change que quand on y touche — mais la largeur se mettait alors
à mesurer **le temps d'attente**, qui ne dit rien du cache. Mesuré sur la session de 2 880
appels :

| | bande continue | marque plafonnée |
|---|---|---|
| éléments dessinés | 434 (fusionnés) | **2 880**, un par appel |
| la plus large, à elle seule | 3,1 % de la voie | **0,10 %** |
| les dix plus larges | 20,1 % | **1 %** |
| la moitié la plus fine | 22,2 % | **48 %** |
| les mêmes, repli des temps morts décoché | **56 % pour un seul appel** | identique au cas replié |

La dernière ligne est la preuve : la voie ne dépend plus du temps d'attente. Et comme plus
rien n'est fusionné, **chaque appel est maintenant cliquable** là où 2 880 appels se
réduisaient à 434 bandes.

⚠️ **Et le chiffre de la voie n'est pas celui de la carte d'un appel.** La voie montre
l'**économie** — ce que l'appel ne paie pas, aux tarifs relatifs. La carte d'un appel au
modèle montre la **part relue**, qui est un autre nombre : sur un appel mesuré, 77 234
jetons présentés dont 74 130 relus, cela fait **96 % de part relue** et **85 % d'économie**.
Les deux sont justes. La ligne de la voie dit donc « 85 % épargnés », et non « 85 % ».

**Ce qu'on ne sait pas dire.** Les tarifs sont des rapports, pas une monnaie : l'économie
est exacte en proportion et muette en euros, parce que le transcript ne porte aucun prix.

### Replier l'arbre

Chaque ligne d'agent porte un chevron. Le replier ferme **tout ce qui est sous lui** : ses
propres voies annexes comme ses sous-agents et leur descendance. Un agent replié tient donc
en une seule ligne, qui dit combien d'agents elle dissimule. Sur l'arbre à neuf agents du
sondage : 45 lignes tout déplié, 9 en repliant la profondeur 1, **une seule** en repliant
la racine.

L'indentation se fait au pixel, avec un filet vertical par niveau, et les voies annexes
d'un agent s'indentent d'un cran sous lui.

Chaque voie porte un pictogramme dans sa couleur : ◆ l'agent racine, ◈ un sous-agent,
⊞ les outils, ▥ la taille du contexte, ▤ son contenu, ⊝ l'attente, ⟳ les boucles,
◇ un modèle.

### Ranger les voies

Deux flèches en tête de chaque ligne échangent la voie avec sa voisine, vers le haut ou
vers le bas. Cela sert à **rapprocher deux voies qu'on veut comparer** — mettre les appels
au modèle juste sous les appels d'outils, par exemple, pour voir ce qui déclenche quoi.

Tant qu'on n'y touche pas, l'ordre naturel s'applique, et une voie qui apparaît en cours de
route — un sous-agent qui vient de naître — se place d'elle-même au bon endroit. Dès qu'on
a rangé, les nouvelles voies se posent à la fin plutôt que de bousculer ce qui est en place.

Les flèches sont posées en gris clair à mi-opacité, et non en gris sombre : mesuré au pixel,
elles passent d'une luminance de 60 à 127 sur un fond à 21, soit 2,7 fois plus de contraste.
Une commande qu'on ne voit pas est une commande qui n'existe pas. Elles s'éclaircissent
encore au survol de la ligne, et prennent la couleur d'accent sous le pointeur.

### Les deux thèmes

Un bouton en haut à droite, sur les deux écrans, bascule entre le **thème sombre** — celui
d'origine, qui reste le défaut — et un **thème clair**. Il annonce où l'on va, pas où l'on
est : en sombre il propose le clair. Le choix est retenu avec le reste des réglages, vaut
pour toute l'application, et il est appliqué **avant le premier affichage** — une page
choisie en clair ne paraît jamais sombre le temps d'une image.

**Le thème clair n'est pas une inversion.** Ce sont les mêmes familles de teintes — le vert
reste l'outil, le cyan la boucle, l'ambre la requête — re-marchées pour un fond clair, puis
validées :

| Contrôle, sur fond `#eceef3` | Mesure |
|---|---|
| bande de clarté | les six teintes dedans |
| plancher de chroma | les six au-dessus |
| séparation en déficience de vision | pire paire adjacente **ΔE 6,8** (vert↔ambre) |
| vision normale | pire paire adjacente **ΔE 16,7**, plancher à 15 |
| contraste sur le fond | les six **au-dessus de 3:1** |

La séparation à 6,8 est dans la bande tolérée, et elle n'est tolérable que parce que la
couleur **ne porte jamais seule** l'identité ici : chaque voie est nommée dans l'arbre,
chaque marque a son infobulle, chaque pastille de légende porte son mot.

⚠️ **Et la palette sombre, elle, ne passerait pas ce contrôle** : vert et ambre y sont à
**ΔE 0,8** en deutéranopie et à **11,7** en vision normale, sous le plancher. Elle n'a pas
été touchée — changer l'identité de l'application n'avait pas été demandé — mais le fait
est mesuré et consigné ici.

Deux valeurs ont été choisies par la mesure plutôt qu'à l'œil. Le bleu « en cours » est
`#2563c9` et non `#3b82f6` : une barre d'agent est peinte à 85 % d'opacité, et le bleu plus
clair n'y rendait que **2,64:1** contre le fond, contre 3,75:1 pour celui-ci. Le gris de
l'attente est passé de 2,65:1 à **3,32:1**. En revanche la barre d'un agent **terminé** n'a
pas été retouchée : elle paraissait délavée, mais la mesure dit **1,80:1 en clair contre
1,53 en sombre** — elle est en fait meilleure, et l'œil s'était trompé.

Côté code, les **94 couleurs écrites en dur** dans `session.html` sont remontées en
variables : le thème bascule donc **sans redessiner**, puisque les attributs SVG lisent
`var(…)` et que le navigateur les recalcule seul. Une seule exception, l'échelle du Buffer
CTX, qui s'interpole en JS entre deux paliers : elle relit la palette à chaque dessin.

### Ce dont l'écran se souvient

Ce qu'on dispose soi-même survit au rechargement. Sans cela, chaque retour sur une session
redemande le même travail : remasquer les voies qu'on ne regarde pas, remettre côte à côte
celles qu'on compare, replier les sous-agents qu'on a déjà lus.

Deux portées, parce que ce ne sont pas les mêmes choses :

| | |
|---|---|
| **le thème** | pour toute l'application, les deux écrans compris — c'est un goût |
| **les voies affichées** | pour **toutes** les sessions — c'est un goût, pas un détail de telle trace |
| **l'ordre des lignes et les agents repliés** | pour **cette** session seulement : les identifiants d'agents ne veulent rien dire ailleurs |

Tout tient dans une seule entrée de `localStorage`, et les quarante sessions vues le plus
récemment seulement : au-delà, les plus anciennes s'effacent, sans quoi le stockage
grossirait sans fin. Mesuré avec soixante sessions en mémoire : quarante retenues, la
courante toujours gardée, 3,6 ko au total.

Si le navigateur refuse d'écrire — navigation privée, stockage plein — l'écran ne s'arrête
pas : il se passe de mémoire et continue.

Au bas du menu des voies, **tout réafficher et remettre l'ordre** défait le tout : les voies
reviennent toutes (pour toutes les sessions, puisque c'est leur portée), l'ordre naturel
reprend et les agents se déplient.

### L'outillage, et la question des permissions

Ce que l'agent a le droit d'appeler, et les instants où cela change : des outils offerts au
démarrage, un serveur MCP qui se branche, des outils remontés en cours de route par une
recherche d'outils, une restriction imposée par un skill, un changement de mode. Des
**marques** et non des barres : ces événements sont rares, et une voie remplie laisserait
croire à une activité continue qui n'existe pas.

**Les permissions proprement dites ne sont presque jamais enregistrées**, et il vaut mieux
le dire que de bâtir une voie vide. Sur l'ensemble des transcrits : **2 enregistrements de
permissions non vides sur 230**, **2 refus d'outil** en tout, et **un seul** changement de
mode dans une seule session sur 106. Ce qui bouge réellement est le catalogue d'outils —
89 outils offerts sur la session `819d3fef`, en 10 changements. La carte en donne la
chronologie et la liste complète.

### Choisir les voies affichées

Un menu « voies » liste les voies annexes — contexte, attente, boucles — avec une case par
genre et le nombre de voies que la session en produit. Décocher retire la voie partout, sur
tous les agents à la fois : sur un arbre de neuf agents, les voies de contexte doublent le
nombre de lignes. Une voie que la session ne produit pas reste listée mais grisée, avec
« aucune » : mieux vaut dire qu'elle n'existe pas ici que de la faire disparaître du menu.

Les voies d'agents, elles, ne se masquent pas : ce sont elles qu'on vient voir.

**Le repli des temps morts.** La session `819d3fef` s'étale sur 264 heures pour 1710 appels,
dont sept jours d'inactivité : à l'échelle linéaire, tout le travail devient invisible.
L'axe replie donc les périodes vides, avec un seuil proportionnel à la durée de la session
(un quatre-centième, jamais moins d'une minute). Chaque repli est **annoncé et compté** —
« 23 temps morts repliés, 7,0 j élidée » — et la case à cocher le désactive. À l'écran,
c'est une bande verticale gris très clair qui traverse toute la hauteur, règle comprise :
l'axe du temps lui-même saute là, et une bande sombre s'y serait noyée. Rien n'est
masqué en silence.

Un « temps mort » est un intervalle où **aucun événement n'est enregistré** : pas un appel
d'outil qui commence ou finit, pas un agent qui naît ou meurt, pas une requête. Classés sur
les deux grosses sessions, les 45 trous repliés se répartissent ainsi :

| Ce que c'était | Trous | Durée |
|---|---|---|
| Après un `Bash` — le tour s'achève et plus personne au clavier | 26 | 253 h |
| Après un `ScheduleWakeup` — une boucle qui dort entre deux tours | 7 | 98 h |
| Pendant un `AskUserQuestion` — l'agent attend une réponse d'Yves | 8 | 37 h |
| Après une notification ou un envoi de fichier | 4 | 22 h |

C'est donc **de l'attente**, sous trois formes. Et le contrôle qui compte : les seuls appels
d'outil plus longs que le seuil de repli sont des `AskUserQuestion` — c'est-à-dire de
l'attente eux-mêmes. **Aucun travail en cours n'est jamais replié.**

### Mesures

Relevées le 12 octobre 2026 sur cette machine :

| Ce qu'on mesure | Mesure | Exigé |
|---|---|---|
| Apparition d'une session → affichée | **224 ms** | < 2 s |
| Ligne écrite dans un transcript → envoyée au navigateur | **56 à 125 ms** sur treize trames | < 2 s |
| Mort d'un processus → retirée de la liste | **165, 246 et 464 ms** sur trois essais | < 2 s |
| Coût d'un relevé complet | 4,5 ms en moyenne, 8,3 ms au pire sur vingt | — |

⚠️ **Les redessins ci-dessus ont été mesurés sur un jeu de voies plus restreint.** Avec les
**douze** voies affichées en même temps sur la session de 2 730 appels, un redessin en vue
d'ensemble coûte **879 ms** — c'est le cas extrême, et il était déjà à 806 ms avant que la
voie *hooks* et les marques du Buffer CTX n'existent. Zoomé, c'est-à-dire dans l'usage
courant, le redessin reste à **109 ms** quelle que soit la version.

Ce qui tient ce coût est la **fusion sous le pixel** : deux marques qui tombent dans le
même pixel ne se distinguent pas, on les réunit et l'infobulle dit combien d'appels elles
couvrent. Sans elle, la session passait de 28 662 à 50 608 éléments et de 806 à 1 307 ms ;
avec, elle en compte 31 650 pour 879 ms.

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
