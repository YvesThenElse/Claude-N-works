# 1 — Installer

[← la documentation](LISEZ-MOI.md)

Téléchargez le fichier de votre système sur la **[page des versions][versions]**, et
ouvrez-le. Rien d'autre à installer.

| Système | Fichier | Ce qu'on en fait |
|---|---|---|
| **Linux** x64 | `Orange-Black-Box-…-linux-x64.AppImage` | le rendre exécutable (`chmod +x`), puis double-cliquer |
| **macOS** Apple Silicon | `Orange-Black-Box-…-macos-arm64.dmg` | ouvrir, glisser dans Applications |
| **macOS** Intel | `Orange-Black-Box-…-macos-x64.dmg` | ouvrir, glisser dans Applications |
| **Windows** x64 | `Orange-Black-Box-…-windows-x64-installateur.exe` | lancer l'installateur |

[versions]: https://github.com/YvesThenElse/OBB/releases/latest

## Au premier lancement, votre système va se méfier

**Les binaires ne sont pas signés**, et c'est assumé : une signature coûte un compte
développeur Apple et un certificat Windows, pour une application qui lit un dossier local
et ne parle à personne. Votre système ne sait donc pas qui l'a produite, et il le dit. Le
geste pour passer outre, une seule fois :

| Système | Ce que vous verrez | Le geste |
|---|---|---|
| **macOS** | « impossible d'ouvrir, le développeur ne peut pas être vérifié » | **clic droit** sur l'application → **Ouvrir** → *Ouvrir*. Ou, en terminal : `xattr -d com.apple.quarantine "/Applications/Orange Black Box.app"` |
| **Windows** | un écran bleu « Windows a protégé votre ordinateur » | **Informations complémentaires** → **Exécuter quand même** |
| **Linux** | rien, l'AppImage se lance | — |

Si cela vous gêne, la voie sans binaire reste entière.

## Ce que l'application fait sur votre machine

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

## Y accéder depuis le tailnet

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

---

[Suivant : installer la sonde →](2-la-sonde.md)
