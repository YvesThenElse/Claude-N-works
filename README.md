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
| `PORT` | `7420` | port d'écoute, sur la boucle locale seulement |
| `PERIODE_RELEVE_MS` | `500` | période du relevé ; borne le délai de détection d'une session morte |
| `CLAUDE_HOME` | `~/.claude` | où lire — sert surtout à éprouver le programme sur un faux dossier |

Le programme **ne fait que lire**. Il n'écrit jamais dans `~/.claude`.

## Où en est le projet

| Lot | État |
|---|---|
| 1 — connaître le terrain | fait : R1 et R2 levés, format consigné, langage arrêté |
| 2 — l'écran des sessions | fait |
| 3 — la ligne du temps | à faire |
| 4 — les cartes | à faire |
| 5 — le temps réel | à faire |
| 6 — la carte de boucle | à faire |

### Ce que fait l'écran des sessions

Il liste les sessions Claude Code **réellement vivantes** : il lit
`~/.claude/sessions/*.json` et vérifie que le processus existe encore, car un fichier
survit à la session qu'il décrit. Un fichier mal formé, sans `sessionId`, ou dont le
processus est mort est ignoré sans bruit et compté à part.

Pour chaque session : son nom, son dossier de travail, son état, depuis quand elle est
ouverte, et le nombre de sous-agents déjà sur disque. La sélection affiche son identité
complète, le chemin de son transcript, et sa version de Claude Code.

La liste se tient à jour toute seule, par flux d'événements, sans rechargement.

### Mesures

Relevées le 12 octobre 2026 sur cette machine :

| Ce qu'on mesure | Mesure | Exigé |
|---|---|---|
| Apparition d'une session → affichée | **224 ms** | < 2 s |
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

Éprouvé aussi, sur un faux `~/.claude` monté pour l'occasion : processus mort, JSON
invalide, objet sans `sessionId`, fichier `.key` — ignorés, trois comptés comme tels, le
`.key` silencieusement. Et une session pointant sur un transcript qui a deux sous-agents :
le répertoire `subagents/` est bien trouvé et compté.
