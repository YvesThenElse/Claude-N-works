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
vers son adresse IPv6, donc n'écouter qu'en IPv4 rendrait `http://claude-server:7420`
injoignable alors que l'adresse numérique, elle, marcherait. Résoudre à l'exécution évite
aussi d'écrire en dur une adresse qui peut changer.

**Ce qui n'est délibérément pas fait : écouter sur `0.0.0.0`.** Cela exposerait aussi le
réseau local. Le serveur n'ouvre que les adresses nommées, ce qui se vérifie :

```
LISTEN  127.0.0.1:7420
LISTEN  100.121.56.59:7420                 ← tailnet, IPv4
LISTEN  [fd7a:115c:a1e0::272f:383c]:7420   ← tailnet, IPv6
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

### Les échecs et leurs reprises

Un appel en échec est rose, et **un arc le relie à l'appel qui le rattrape**, la pointe sur
la reprise. Le survol dit de quelle sorte de reprise il s'agit.

La forme de la signalétique vient d'une mesure, pas d'une intuition. Sur les **297 échecs**
de l'ensemble des transcrits, 78 % sont suivis d'un appel **du même outil** — mais presque
jamais à l'identique : seulement 5 cas de relance telle quelle, contre une large majorité
d'entrées corrigées. Le geste à rendre visible n'est donc pas « il réessaie », c'est « il
corrige et relance ». Sur la session Litanie : 28 échecs, dont **23 repris avec une entrée
corrigée** et 5 abandonnés au profit d'autre chose.

### Chercher dans un texte

Tout bloc de texte de plus de quatre cents caractères porte une barre de recherche :
surlignage de toutes les occurrences, compte, et saut de l'une à l'autre par les flèches ou
par Entrée. La lecture du contexte en a une qui porte sur **tout le contexte à la fois** :
elle réduit la liste aux éléments contenant le terme et les ouvre déjà surlignés — par
exemple 55 éléments sur 428 pour un mot donné. Les
requêtes d'Yves — et elles seules, `origin.kind` valant `human` — traversent les voies en
repères verticaux.

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
session Litanie : **1,37 caractère attribué par jeton de contexte**, là où du texte
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

Sur la session Litanie : **10,9 jours d'attente sur 11,1 jours** — dont 6,9 j de sommeil de
boucle, 3,1 j d'inoccupation et 21,6 h de questions posées.

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
déjà, elle ne bouge pas, pour ne pas faire sauter l'écran sous les doigts. D'un coup d'œil sur Litanie, on voit que la session est faite de
boucles presque de bout en bout.

### Les tours — et où passe vraiment le temps

Un **tour** va de ce qui réveille l'agent — une requête d'Yves, un réveil de boucle, la fin
d'une tâche d'arrière-plan — jusqu'à ce qu'il rende la main. Claude Code en écrit lui-même
la durée à sa fin, dans un enregistrement `system/turn_duration`. C'est donc la **seule
mesure exacte** du temps de travail, et non une estimation tirée des événements.

La voie des tours se place juste sous l'agent : tout le reste — outils, appels au modèle —
se loge dedans, et ce qui sépare deux barres n'est pas du travail plus discret, c'est de
l'attente. L'intensité d'une barre suit le nombre d'appels qu'elle contient.

**Le chiffre que tout le reste laissait deviner** : sur la session Litanie, 299 tours,
**11,3 heures de travail cumulé sur 11,4 jours** — soit **4,1 %**. Les tours ne se
chevauchent jamais. La médiane d'un tour est de 66 secondes, le plus long dure 84 minutes.

Cliquer un tour en donne le détail : combien d'appels d'outils et de requêtes au modèle il
contient, et la part de sa durée passée dans les outils et chez le modèle. Exemple relevé :
un tour de 10 minutes, 27 appels `Bash`, 28 requêtes au modèle — 20 % du temps dans les
outils, 51 % chez le modèle.

### Les appels au modèle

Une voie par modèle réellement appelé, sous l'agent qui l'appelle. Chaque appel s'y lit en
trois temps : un trait vertical à l'instant de l'**appel**, une ligne fine pour l'**attente
avant la réponse**, puis un rectangle plein pour la **réponse**, du premier bloc au
dernier. Le décalage entre le trait et le rectangle est la latence.

Mesuré sur la session Litanie, 2001 appels à `claude-opus-5` : attente avant réponse de
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
regardé et pour l'ensemble des appels du modèle. Sur la session Litanie : **98,4 %** sur
973 831 462 jetons d'entrée au total. L'appel le moins bien servi est à 0 % — c'est le tout
premier de la session, quand rien n'est encore en cache — et la médiane est à 99,7 %.

**Ce qu'on mesure et ce qu'on ne mesure pas**, dit aussi sur la carte. L'« appel » est le
dernier événement écrit avant la réponse : une requête d'Yves, un résultat d'outil, ou le
réveil d'une boucle — ce dernier compte, sans quoi la latence d'un tour de boucle
engloberait tout le sommeil. Le « début de réponse » est l'instant où le premier bloc a été
écrit, pas celui du premier jeton : un long bloc de réflexion repousse donc ce début. Et
**45 % des appels n'ont pas de durée de réponse mesurable** — leur réponse tenait en un
seul bloc, donc début et fin se confondent.

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

### Choisir les voies affichées

Un menu « voies » liste les voies annexes — contexte, attente, boucles — avec une case par
genre et le nombre de voies que la session en produit. Décocher retire la voie partout, sur
tous les agents à la fois : sur un arbre de neuf agents, les voies de contexte doublent le
nombre de lignes. Une voie que la session ne produit pas reste listée mais grisée, avec
« aucune » : mieux vaut dire qu'elle n'existe pas ici que de la faire disparaître du menu.

Les voies d'agents, elles, ne se masquent pas : ce sont elles qu'on vient voir.

**Le repli des temps morts.** La session Litanie s'étale sur 264 heures pour 1710 appels,
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
