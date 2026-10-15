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

**Deux appels peuvent partir ensemble, et se recouvraient.** Un message porte parfois
plusieurs `tool_use`, qui s'exécutent de front : sur une seule ligne, le second était
dessiné par-dessus le premier — invisible et incliquable. Mesuré sur **17 142 appels** :
36 % des agents en ont au moins deux qui se chevauchent, **580 appels étaient cachés sous
un autre**, et l'on monte jusqu'à quatre à la fois. Ils s'empilent maintenant sur des
rangées, comme les shells, et la voie grandit quand il le faut — 60 px pour quatre de front.
La place se décide **dans le temps et non en pixels**, pour que la hauteur soit stable d'un
zoom à l'autre.

Quand il n'y a qu'une rangée — **121 agents sur 190** — la géométrie est inchangée au
dixième de pixel. Vérifié en servant l'ancienne version en parallèle et en comparant les
décalages de chaque voie : sept voies sur neuf identiques, une à 0,1 px près par simple
décalage, et seule celle qui avait besoin de rangées a changé. Le redessin ne régresse pas :
médiane 173 ms contre 170, pire 759 contre 845, sur la session de 2 730 appels.

**Le nom de l'outil s'écrit au-dessus de la barre** dès qu'il y a la place — le §5 du
cahier le demandait depuis le lot 3. La place se mesure jusqu'au **prochain appel**, pas
jusqu'au bout de la barre : une étiquette a le droit de déborder sur le silence qui suit,
et c'est ce qui la fait apparaître sur un appel bref suivi d'une pause. Bornée ainsi, elle
ne peut jamais mordre sur la suivante — vérifié à trois niveaux de zoom, **zéro
chevauchement** par voie. Elle rend 3,76 : 1 contre le fond : discrète, pas illisible.

**La voie des hooks porte le même genre d'étiquette**, et à la même condition. À droite de
chaque marque s'écrit le nom de l'événement — `PostToolUse:Bash`, `SubagentStart:commis-taillage` — en 8 px, à côté des 10 px du nom d'outil : le hook est un à-côté du geste, pas
le geste. Les noms sont longs et les hooks se suivent de quelques dizaines de millisecondes,
si bien que l'étiquette ne sort **qu'à fort zoom**. C'est voulu : en vue d'ensemble, une
voie de 65 marques reste une trame, et c'est en s'approchant qu'elle se nomme.

Cette étiquette a révélé une chose sur la trace elle-même : **elle n'est pas dans l'ordre
du temps**. Trois des 65 hooks de la session d'exemple reculent — l'un de **110 secondes** —
parce qu'un `hook_success` s'écrit au moment où l'appel se referme, pas au moment où le hook
tourne. Tant que la voie ne faisait que poser des marques, le désordre ne se voyait pas.
Dès qu'il a fallu mesurer la place **jusqu'à la marque suivante**, « la suivante » a cessé
d'être « celle de droite » : trois étiquettes mordaient leur voisine, une par désordre. La
liste est désormais triée avant d'être dessinée — ce dont la fusion sous le pixel avait
besoin tout autant. Vérifié ensuite à six niveaux de zoom, de 2 à 1 000 px/s : **zéro
chevauchement**, la marge la plus serrée à 22 px.

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

### La chaîne des appels — le même travail, sans le temps

Un second écran, `chaine.html`, montre **ce qui a mené à quoi**. La ligne du temps répond
à « quand », et elle le fait bien ; elle répond mal à « quoi a déclenché quoi », parce
qu'un appel de trois secondes et un de trois minutes n'y ont pas la même largeur et qu'on
ne compare plus rien. Cette page n'a donc **aucune notion de temps** : les boîtes se
suivent parce qu'elles s'enchaînent, pas parce qu'elles durent.

**Une boîte par appel au modèle**, et trois zones dans chacune :

| | |
|---|---|
| **ce qui entre** | ce qui a déclenché l'appel — le résultat d'un outil, une consigne d'Yves, la fin d'une tâche d'arrière-plan |
| **ce qui se passe** | l'attente, les jetons de réflexion, les jetons écrits |
| **ce qui sort** | ce que le modèle a dit, et les outils qu'il a appelés |

**Une colonne par agent**, et une colonne de sous-agent **démarre en face de la boîte qui
l'a lancée** : c'est ce qui fait lire « cette boîte appelle celle-là » plutôt que « deux
colonnes côte à côte ». Le lien est exact et non deviné — chaque agent porte l'identifiant
de l'appel d'outil qui l'a fait naître, et chaque appel d'outil est rattaché à la réponse
qui l'a émis. Sur la session d'exemple, l'appel 9 de l'agent racine émet un `Write` et
**trois `Agent` d'un coup** : les trois postes partent de la même boîte.

Un clic sur une boîte ouvre son détail ; de là, un clic sur un outil ouvre le sien, avec
son entrée et son résultat. Par défaut la page montre l'agent visé et ses enfants directs,
et une case ouvre la vue entière — 87 appels sur 6 agents, ou 122 sur 9.

**On y arrive depuis la ligne du temps** : la carte d'une consigne d'Yves et celle d'un
appel au modèle portent toutes deux un lien, posé au-dessus des onglets parce qu'il
n'appartient ni au contenu ni aux propriétés. Le lien porte l'appel d'où l'on vient, et la
chaîne s'ouvre en l'encadrant.

### Mettre le suivi en pause

Une session vivante se redessine à chaque ligne écrite, et le repère *maintenant* glisse
chaque seconde. C'est ce qu'on veut en la regardant travailler ; c'est insupportable quand
on cherche à lire quelque chose de précis, parce que l'écran bouge sous les doigts.

Un bouton **pause** paraît à côté de la mention « en direct », et seulement là : sur une
session finie, rien ne bouge et il n'y aurait rien à arrêter.

**En pause, rien n'est perdu.** Ce qui arrive est mis de côté, et le bouton dit combien de
fois la session a avancé pendant ce temps — « 3 avancées en attente ». Reprendre applique
le **dernier** état connu d'un coup : seul le dernier décrit la session telle qu'elle est,
rejouer tous ceux qu'on a laissés passer ne montrerait rien de plus. C'est la différence
entre une pause et une déconnexion : on ne rate rien, on le regarde plus tard.

Vérifié sur une session réellement vivante : **4 redessins** en trois secondes et demie
quand le suivi court, **zéro** en pause, et 4 de nouveau après reprise. L'écran est resté
figé à 1 003 appels d'outil pendant que la session en écrivait quatre de plus, qui sont
tous apparus d'un coup à la reprise.

Le bouton prend la couleur de ce qu'il retient quand il est enfoncé, et ses deux
pictogrammes sont **tracés** et non tapés : sur cette machine, `⏸` et `▶` sortiraient en
carré vide, faute de police — comme sept des anciens pictogrammes de voie.

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
la légende complète : ce que chaque couleur signifie **dans cette voie-là**. Pour un agent,
l'état de la barre et la nature des marques d'outils ; pour le contexte, ce que le dégradé
mesure et quand il ne mesure rien ; pour l'attente, les trois formes ; pour les boucles,
les montants et les encoches.

C'est la **seule** légende depuis le 15 octobre 2026. Un bandeau de treize pastilles
occupait une ligne entière en haut de l'écran, et il répondait moins bien : une même
couleur ne dit pas la même chose d'une voie à l'autre — l'ambre est une requête sur la
piste, une question posée sur la voie d'attente. La légende qui vaut est celle de la voie
qu'on regarde.

### Le contenu du contexte

Sous « Taille CTX », la voie **« Contenu CTX »** montre, à chaque appel au modèle, de quoi
le contexte était fait — en parts empilées sur toute la hauteur, puisque la taille est déjà
donnée par la voie du dessus : invite système et rappels, résultats d'outils, appels
d'outils, paroles du modèle, requêtes d'Yves. Cliquer un appel en donne la recette chiffrée.

**On peut lire le contexte lui-même.** Les trois cartes qui parlent d'**un** appel au
modèle — *Contenu CTX*, *Buffer CTX* et celle d'un appel au modèle — portent un bloc
« lire le contexte envoyé à cet appel » : il va chercher au serveur, à la demande, la suite exacte des éléments
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

### Le contexte raconte une histoire, et elle se lit

Le contenu d'un contexte arrivait **à plat** : soixante-quinze lignes qui se ressemblaient
toutes, où il fallait lire chaque titre pour savoir où on en était. Or la trace a un rythme,
et il se mesure — **réflexion → appel → résultat → rappel de jetons**, répété, ponctué par
ce que le modèle dit. La liste le rend maintenant visible.

**Un geste** — ce que la machine fait d'un bloc : elle réfléchit, elle appelle, elle reçoit —
est lié par un filet, et son en-tête donne l'outil, l'heure et ce qu'il pèse. Un nouveau
geste commence à une réflexion, ou à un appel qui suit un résultat.

**Plusieurs appels dans un même geste ne sont pas une suite** : ils sont partis *ensemble*,
dans un seul message. Le filet passe alors au bleu des appels et l'en-tête le dit — « 4
appels lancés ensemble — Agent ». La liste à plat donnait quatre lignes identiques sans
rien dire de leur simultanéité, qui est pourtant tout ce qui fait gagner du temps.

**Les moments** se détachent par un filet de leur couleur : *la consigne* d'Yves, *ce que le
modèle a dit* — avec la réflexion qui y mène, car ce n'est pas un geste orphelin mais la
pensée qui aboutit —, *la reprise après compactage*, et *la mise en place* : ce qui était là
avant qu'on demande quoi que ce soit. Celle-ci se replie, parce qu'on ne vient presque jamais
la lire et que c'est elle qui pèse le plus — le listing des skills fait à lui seul des
dizaines de milliers de caractères.

**Le découpage ne jette rien et n'invente rien, il regroupe** : vérifié sur 41 contextes et
6 185 éléments, aucun élément perdu. La recherche et les filtres s'appliquent avant lui, si
bien qu'un contexte filtré se regroupe comme un contexte entier.

### Le contexte, les compactages et les pannes

La taille du contexte a sa propre voie, dessinée **en courbe simple** — une grandeur qui
monte et descend n'est pas une quantité accumulée, et la remplir donnait à l'œil une masse
qui ne voulait rien dire. Trois repères très pâles marquent le **0, la moitié et le
plafond** : sans graduation, une courbe ne dit que « ça monte et ça descend » ; avec, on
lit sa hauteur d'un coup d'œil. Le trait porte un dégradé vertical du vert au rouge — la
hauteur décide de la couleur, donc une fenêtre qui sature rougit.

⚠️ **Et le dégradé dit enfin ce qu'il prétend.** Tant qu'il peignait une aire, il
s'étirait sur la boîte de ce polygone, pas sur la hauteur de la voie : une courbe qui ne
montait qu'à mi-hauteur rougissait quand même à son sommet. Il est désormais tracé en
coordonnées de la voie (`gradientUnits="userSpaceOnUse"`, du bas au haut de la voie),
avec un dégradé par voie.
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

### Les shells de fond

Ce que l'agent a lancé puis **laissé courir** pendant qu'il faisait autre chose. Une barre
par tâche, de son lancement à son compte rendu, nichée sous l'agent qui l'a lancée — comme
l'est un sous-agent, parce que c'est la même idée : un travail délégué qui a sa propre
durée et son propre sort. La couleur dit l'état comme pour un agent : verte si elle a
rendu, rose si elle a échoué, ambre si on l'a arrêtée, bleue et pointillée si elle n'a
jamais rendu compte. Les traits verticaux sont les gestes portés **sur** la tâche pendant
qu'elle court — une consultation de sa sortie, son arrêt.

**Rien de tout cela n'était montré**, et le cycle de vie est pourtant entièrement dans la
trace — simplement éparpillé sur quatre formes, dont trois pour la seule fin. Mesuré :
508 lancements sur la machine, 501 qui annoncent leur identifiant, et sur une session de
131 tâches **129 fins retrouvées** — contre 66 quand on ne lisait qu'une des trois formes.
Sur l'ensemble du corpus, des 1 451 notifications de fin, **1 373 désignent une tâche** et
78 un agent : les premières étaient lues puis jetées.

**Elles s'empilent sur des rangées.** Toutes sur une seule ligne, les 131 shells d'une
session de onze jours ne faisaient qu'une bande bleue continue d'un bord à l'autre : on ne
pouvait ni les compter, ni voir lesquels couraient encore. Chacun reprend maintenant la
première rangée libre — deux qui ne se chevauchent pas dans le temps partagent leur ligne,
et la voie ne grandit pas pour rien. Mesuré : au plus **cinq shells à la fois**, ce qui
tient dans la hauteur d'une voie.

**C'est la seule voie qui grandit.** Sa hauteur suit le nombre de shells qu'elle porte de
front : ordinaire quand il n'y en a qu'un ou deux — ce qui est le cas de **41 agents sur
52** —, et jusqu'à 120 px pour l'agent qui en fait tourner **douze en même temps**, où la
hauteur ordinaire ne laissait qu'un pixel par barre. Le compte se fait **dans le temps et
non en pixels**, délibérément : une hauteur qui dépendrait du zoom ferait sauter toute la
mise en page sous les doigts à chaque cran de l'échelle. Vérifié — les hauteurs sont
identiques à trois niveaux de zoom, et l'arbre de gauche reste aligné sur la piste à
**0,17 px près** ; en forçant la voie à la hauteur ordinaire, l'écart saute à 21,98 px,
ce qui prouve que la mesure mordrait si l'alignement cassait.

**Un shell qui n'a jamais rendu compte est posé en dernier, sur sa propre rangée.** Sa
barre court jusqu'au bout de la session, parce qu'on ne sait pas quand il s'est arrêté —
et sans cette précaution il tenait la rangée du haut sur onze jours et repoussait d'un cran
les cent trente autres, qui n'ont rien à voir avec lui.

**La commande s'écrit sur la barre** dès qu'elle y tient, comme le nom d'un outil : c'est
ce que le panneau *Background* de Claude Code montre, et la seule chose qui distingue deux
shells l'un de l'autre. L'en-tête de la voie annonce **combien tournent encore** avant
d'annoncer le total — « 2 en cours / 98 » — parce que c'est ce qu'on regarde en premier.

⚠️ **Le temps qu'un shell occupe se lit aussi en « attente »** sur la voie du dessus. Ce
n'est pas une contradiction : l'agent, lui, attend vraiment — mais la machine n'est pas
oisive, un shell y travaille. C'est précisément ce que cette voie ajoute.

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

**Le pourcentage est écrit à côté de la marque** dès qu'il y a la place, selon la même
règle que le nom d'un outil : la place se mesure jusqu'à la marque suivante, donc une
étiquette ne peut jamais mordre sur sa voisine — vérifié à trois niveaux de zoom, zéro
chevauchement par voie.

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

Chaque voie porte un **pictogramme dessiné** dans sa couleur, et chacun est une miniature
de ce que la voie trace : une barre pour l'agent, la même barre avec son coude de
rattachement pour un sous-agent, des barres inégales pour les outils, des traits de part et
d'autre d'une ligne pour les hooks, une bande à bord gauche épais pour les skills, un
escalier pour les fichiers, une flèche qui revient pour les boucles, une courbe qui monte
pour la taille du contexte, des bandes empilées pour son contenu.

**Ils étaient des caractères, et sept des quinze sortaient en carré vide.** Mesuré le
15 octobre 2026 par deux instruments concordants : `fc-list` ne trouve aucune police
installée couvrant ⊡ (travail), ⊞ (outils), ∿ (réflexion), ⊠ (outillage), ⊝ (attente),
⊟ (fichiers) et ⟳ (boucles) ; et l'empreinte au pixel de ces sept glyphes est identique à
celle d'un tofu connu. La découverte est venue d'un contrôle de routine — vérifier que le
nouveau pictogramme des skills n'en était pas un — ce qui a révélé que presque la moitié de
la signalétique n'existait pas à l'écran depuis le début.

Chercher d'autres caractères n'aurait fait que **déplacer le pari** sur les polices du
poste ; un tracé ne dépend de rien. Les quinze sont désormais du SVG en `currentColor` : la
couleur se pose toujours par la voie, et le pictogramme le plus faible rend 4,32 : 1 contre
le fond, au-dessus du seuil de 3 : 1 exigé d'un objet graphique.

**L'ordre naturel suit une lecture.** D'abord le **rythme** — quand la machine a travaillé,
quand elle a attendu, quand elle a réfléchi, à quel modèle elle a parlé. Puis **ce qu'elle
a fait** — ses outils, l'outillage qui change, les hooks qui les encadrent, les fichiers
qu'ils touchent, les boucles qui les répètent. Puis le **contexte**, ses trois voies
ensemble à la fin.

*travail* et *attente* sont volontairement voisines : elles partagent le même temps et se
lisent en vis-à-vis — ce qui n'est pas dans l'une est dans l'autre. La voie s'appelait
*tours* jusqu'au 15 octobre 2026 ; la carte, elle, disait déjà « travail cumulé » et « du
temps, la machine travaillait ». C'était l'étiquette qui était le mot isolé. **Le tour
reste l'unité** — la voie se mesure en tours, elle s'appelle travail.

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

### Les deux onglets d'une carte

Une carte porte deux choses de nature différente : **ce qui a été écrit** — la réponse du
modèle, l'entrée et le résultat d'un outil, la définition d'un skill, le contexte envoyé —
et **ce qui décrit l'appel** : ses champs, ses durées, ses jauges. Elles se disputaient la
même colonne, si bien qu'il fallait faire défiler une liste de vingt lignes pour atteindre
la phrase qu'on venait lire. Deux onglets les séparent, *contenu* et *propriétés*, chacun
annonçant combien de blocs il tient.

**La carte d'un appel ne montre que CET appel.** Elle donnait tout le contexte accumulé —
425 éléments sur une session un peu longue — et les quatre qui concernaient l'appel qu'on
regardait s'y noyaient. Elle montre maintenant ce que l'appel a **apporté** : ce qui est
entré depuis l'appel précédent, la réflexion, ce qui est sorti. Le compte entier reste dit
en une ligne — « 4 éléments pour cet appel, 1 170 caractères — le contexte entier en
portait 75 et 50 267 » — pour qu'on ne croie pas que le modèle n'a reçu que cela.

> La borne haute est la **fin** de l'appel et non son départ. Mesuré : bornée au départ,
> comme le faisait la première version, la liste ne contenait jamais ce que le modèle avait
> dit ni ce qu'il avait demandé — elle ressortait **vide**.

**Le lecteur de contexte s'ouvre d'emblée.** Replié, il était souvent la seule chose de
l'onglet *contenu* — sur un appel qui se termine par un outil, le modèle n'a rien dit — et
l'onglet paraissait vide. La lecture reste asynchrone : la carte s'ouvre en 3 ms, le bloc
affiche « lecture du contexte… », puis se remplit. Mesuré sur la plus grosse session de la
machine, 2 730 appels sur onze jours : 780 ms et 712 ko, qui ne font donc jamais attendre
l'ouverture.

**La distinction se lit sur la balise, pas sur une liste à tenir à jour** : est un contenu
ce qui est un bloc dépliable, et rien d'autre. Une carte nouvelle se range donc d'elle-même
du bon côté, sans qu'on ait à y penser.

**Une carte qui n'a qu'une sorte n'a pas d'onglets** — celle d'une requête, celle d'un tour.
Deux onglets dont un vide coûteraient un clic pour ne rien montrer.

**L'onglet choisi est retenu**, et vaut pour toutes les cartes et toutes les sessions : on
vient lire une carte pour une raison, et cette raison ne change pas d'un appel au suivant.
Choisir *propriétés* sur un appel d'outil ouvre la carte suivante — modèle, skill, hook —
sur ses propriétés. C'est un goût, au même titre que le thème.

Les flèches gauche et droite passent d'un onglet à l'autre, et la tabulation sort des
onglets plutôt que de les traverser. Les blocs gardent leur état d'un onglet à l'autre : un
contexte déjà chargé — 13 565 caractères dans la mesure — reste chargé et déplié après un
aller-retour.

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

### Les skills — quand, avec quoi, et leur définition

Une **voie par agent** montre les skills qu'il a chargés : une bande par skill, qui
commence à l'instant du chargement et court jusqu'à la fin de l'agent. La bande n'affirme
rien qu'on n'ait mesuré — elle ne prétend pas qu'un skill « règne » : elle dit que son
texte est dans le contexte du modèle, ce qui reste vrai tant que rien ne le réécrit. Le
seul événement qui le réécrive est un **compactage**, et la bande s'y arrête alors sur une
coupe franche, dans la couleur des compactages.

Sur la session du kit cuisine, la voie se lit d'un coup d'œil : le chef porte `service` du
début à la fin, et chaque poste porte le sien — `taillage`, `cuisson`, `sauce`, `dressage`
— sur toute sa vie. C'est « qui fonctionne avec quoi », sans avoir à le chercher.

**Cliquer une bande ouvre sa carte**, qui répond à ce que l'appel seul ne dit pas :

- **ce qu'il a fait faire** — les appels d'outils passés pendant sa plage, comptés par
  outil ;
- **sa part du contexte** — ses caractères rapportés au texte entier de l'agent au dernier
  appel ;
- **ce qui cohabitait** — les autres skills en contexte en même temps, et les serveurs MCP
  en place ;
- **qui d'autre s'en sert** — le recensement de toute la machine, chargements et sessions,
  lu à la demande ;
- **sa définition entière**, dépliable.

**La définition montrée est celle qui a été chargée, jamais le fichier d'aujourd'hui**, et
ce n'est pas un détail de principe : mesuré sur `taillage`, le texte injecté le 12 octobre
fait 1 237 caractères quand le fichier sur disque en fait 2 961, réécrit le lendemain à
11h26 — au point qu'il **ne contient même plus** ce qui avait été chargé. Lire le disque
montrerait un skill qui n'a jamais tourné.

**Ce que cette voie a fait découvrir.** Un skill entre de deux façons : comme pièce jointe
`invoked_skills` — les skills livrés avec Claude Code — ou comme un simple message de
session, qui est le cas des skills d'un projet. L'application ne lisait que la première, et
voyait donc **12 chargements sur 58**. Tout le kit cuisine lui était invisible, et les
358 288 caractères que ces skills injectent ne pesaient dans aucune bande du Contenu CTX.

**La bande n'a pas de couleur à elle, et c'est mesuré.** La ligne du temps porte déjà seize
teintes ; le balayage de 1 703 teintes conformes n'en trouve aucune dix-septième qui
atteigne la cible de 8 ΔE en vision déficiente — sauf dans la famille ambre, déjà occupée
deux fois. L'identité vient donc du **nom écrit dans la bande**, et la forme de son
contour, à 4,2 : 1 contre le fond, la rend lisible sans éteindre les voies qu'elle
recouvre.

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
