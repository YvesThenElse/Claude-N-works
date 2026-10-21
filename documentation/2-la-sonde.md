# 2 — Installer la sonde

[← la documentation](LISEZ-MOI.md)

Sur la machine à observer — un serveur de construction, une machine headless, un poste
qu'on n'a pas sous les yeux — on installe une **sonde**. Elle tient en une commande, et il
y a deux façons de l'obtenir selon ce que la machine a déjà.

## Si Node y est déjà : un fichier de 116 ko

```sh
curl -LO https://github.com/YvesThenElse/OBB/releases/latest/download/obb-sonde.js
node obb-sonde.js
```

[Télécharger `obb-sonde.js`][sonde-js] — un seul fichier, aucune dépendance à installer,
Node 20 ou plus. C'est le même code que l'application, lié en un fichier par
`npm run sonde` : il n'y a pas de second lecteur de transcrits à tenir d'accord.

## Si Node n'y est pas : un exécutable autonome

| Système | Fichier | |
|---|---|---|
| **Linux** x64 | `obb-sonde-linux-x64` | [télécharger][sonde-linux] |
| **macOS** Apple Silicon | `obb-sonde-macos-arm64` | [télécharger][sonde-macos] |
| **Windows** x64 | `obb-sonde-windows-x64.exe` | [télécharger][sonde-windows] |

```sh
chmod +x obb-sonde-linux-x64
./obb-sonde-linux-x64
```

119 Mo — c'est Node entier qui est dedans, et c'est le seul argument en sa faveur : sur une
machine qui a déjà Node, le fichier de 116 ko fait exactement la même chose mille fois plus
petit.

> ⚠️ **Le binaire est bâti sur le Node officiel, jamais sur celui de la machine qui le
> fabrique.** Mesuré sur Fedora : `/usr/bin/node-22` pèse 28 ko et se lie dynamiquement à
> `libnode.so`. Un exécutable bâti là-dessus ferait 28 ko et réclamerait la bibliothèque à
> l'exécution — tout le contraire d'autonome, et la panne n'apparaîtrait que chez celui qui
> le télécharge. `npm run sonde-binaire` refuse de le faire et le dit.

## Et si vous avez déjà le dépôt

```sh
node serveur.js --sonde
```

[sonde-js]: https://github.com/YvesThenElse/OBB/releases/latest/download/obb-sonde.js
[sonde-linux]: https://github.com/YvesThenElse/OBB/releases/latest/download/obb-sonde-linux-x64
[sonde-macos]: https://github.com/YvesThenElse/OBB/releases/latest/download/obb-sonde-macos-arm64
[sonde-windows]: https://github.com/YvesThenElse/OBB/releases/latest/download/obb-sonde-windows-x64.exe

## Le jeton

Quelle que soit la forme, la sonde n'expose que l'API, jamais l'écran, et elle **exige un
jeton**. Elle affiche au démarrage tout ce qu'il faut pour la brancher :

```
  sonde  : http://100.x.y.z:7420

  jeton  : 647eb8611f74ddd1c93539c156719283
           (gardé dans ~/.orange-black-box/sonde.json)

  Sur votre poste : « + une machine », puis
    adresse http://100.x.y.z:7420
    jeton   647eb8611f74ddd1c93539c156719283
```

Le jeton est fabriqué au premier lancement, affiché, et gardé dans
`~/.orange-black-box/sonde.json` ; il ne change plus, sans quoi chaque redémarrage casserait
les postes qui l'avaient noté. Sans lui, toute requête reçoit 401 ; sur un chemin qui n'est
pas de l'API, 404.

## La brancher depuis votre poste

Sur votre poste, le bouton **+ une machine** demande l'adresse, un nom et le jeton. Le
serveur **éprouve la sonde avant de l'inscrire** : une machine qu'on ajoute et qui ne
répond pas laisserait croire qu'elle est au repos, ce qui est le pire des cas. Un refus
reste **dans la fiche**, qui ne se ferme pas — « La sonde a refusé ce jeton. », « La sonde
est injoignable à cette adresse. » — pour qu'on corrige sans tout ressaisir.

> ⚠️ **La fiche est un vrai formulaire, et non `prompt()`.** Mesuré : dans la coquille
> Electron, `window.prompt` **lève** — « prompt() is not supported » — et le bouton ne
> faisait donc rien du tout dans l'application empaquetée, celle que presque tout le monde
> emploie. La version servie dans un navigateur, elle, marchait : vérifier dans le
> navigateur seul ne pouvait pas voir la panne.

**La page ne parle jamais qu'à son serveur local.** C'est lui qui interroge les sondes et
relaie — y compris le flux d'une session, repompé tel quel sans être relu. Deux
conséquences voulues : aucun CORS à ouvrir, et le jeton ne descend jamais dans le
navigateur. Une session distante s'affiche donc exactement comme une locale, sans second
chemin de code à tenir d'accord.

**Toutes les machines dans une seule liste**, chaque session portant le nom de la sienne, et
un onglet par machine pour filtrer. Tant qu'aucune machine n'est suivie, **rien ne change à
l'écran** — la barre reste cachée, le sous-titre reste « sur cette machine », et aucune
session ne porte de pastille.

## Quand la sonde tombe

**Une sonde en panne ne casse rien et ne disparaît pas.** Mesuré : la sonde arrêtée,
l'écran répond toujours en 45 ms avec ses sessions locales intactes, et la machine apparaît
en rouge avec sa raison — « injoignable », « jeton refusé », « ne répond pas ». La faire
disparaître laisserait croire qu'elle est au repos. Un relais vers une sonde morte rend 502,
et non 500 : ce n'est pas ce serveur qui a échoué, c'est celui d'en face.

**Le suivi en direct.** Localement, `fs.watch` prévient dès qu'un transcript bouge. Une
sonde ne peut pas nous prévenir — c'est nous qui l'appelons —, donc un relevé régulier la
sollicite toutes les deux secondes. Il ne démarre que s'il y a des machines à suivre et
s'arrête quand plus personne ne regarde. Vérifié : en coupant la sonde pendant qu'on
écoute, le flux émet une seconde trame dans la foulée, 8 sessions deviennent 4 et la panne
est nommée.

> ⚠️ **Un identifiant de session n'est unique que sur une machine.** La fiche cherchait la
> session par cet identifiant seul et retrouvait l'homonyme local au lieu de la distante —
> mesuré, et corrigé : la clé est désormais le couple machine + identifiant.

---

[Suivant : se servir de l'application →](3-se-servir-de-l-application.md)
