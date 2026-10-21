// Orange Black Box — la coquille de bureau.
//
// Elle ne contient aucune logique propre : elle démarre le serveur **dans son propre
// processus** et ouvre une fenêtre dessus. Tout ce qu'on voit est l'application web, à
// l'identique de ce que sert `node serveur.js`. C'est voulu : il n'y a qu'une seule
// version du programme à corriger, et la coquille ne peut pas diverger de la page.
//
// ⚠️ Décidé par Yves le 13 octobre 2026 : cette coquille renverse le §8 du cahier des
// charges, qui disait « Node, sans aucune dépendance ». Electron en est une, et une
// lourde. Le serveur, lui, n'en a toujours aucune : lancé par `node serveur.js`, il
// fonctionne sans rien installer.

'use strict';

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');
const { demarrer } = require('../serveur.js');

// Le port habituel d'abord — on retrouve ainsi ses favoris et sa mémoire d'écran, qui
// sont attachés à l'origine `127.0.0.1:7420`. S'il est déjà pris, par un `node
// serveur.js` lancé à la main par exemple, on demande au système un port libre plutôt
// que de refuser de démarrer.
const PORT_HABITUEL = 7420;

// La coquille n'écoute **que** sur la boucle locale, quoi qu'en dise l'environnement :
// une application de bureau qu'on double-clique ne doit pas exposer ses transcripts au
// réseau sans qu'on l'ait demandé. L'ouverture au tailnet reste au lancement en ligne de
// commande, où elle se demande explicitement.
const HOTES = ['127.0.0.1'];

let fenetre = null;

async function ouvrirLeServeur() {
  try {
    return await demarrer({ port: PORT_HABITUEL, hotes: HOTES, silencieux: true });
  } catch {
    // EADDRINUSE, le plus souvent : un serveur tourne déjà sur 7420.
    return demarrer({ port: 0, hotes: HOTES, silencieux: true });
  }
}

function pageDErreur(message) {
  // Pas de fichier séparé : une coquille qui ne peut pas démarrer doit pouvoir le dire
  // même si rien d'autre ne fonctionne.
  const corps = `<!doctype html><meta charset="utf-8">
<style>
  body { background:#11131a; color:#e4e6ee; font:15px/1.6 ui-sans-serif, system-ui, sans-serif;
         margin:0; display:grid; place-items:center; height:100vh; text-align:center; }
  div { max-width:34rem; padding:2rem; }
  h1 { font-size:1.1rem; font-weight:600; color:#f7768e; }
  code { font-family:ui-monospace, Menlo, monospace; background:#1a1d27; padding:.1rem .3rem;
         border-radius:3px; }
</style>
<div><h1>Orange Black Box n'a pas pu démarrer</h1>
<p>${message}</p>
<p>L'application lit <code>~/.claude</code>, le dossier que Claude Code écrit.
Si Claude Code n'a jamais tourné sur cette machine, il n'y a rien à observer.</p></div>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(corps);
}

function creerLaFenetre(url) {
  fenetre = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#11131a',   // la couleur du thème sombre, pour ne pas éclater en blanc
    title: 'Orange Black Box',
    show: false,
    webPreferences: {
      // La page est une page web ordinaire servie en HTTP : elle n'a aucun besoin de
      // Node, et le lui donner serait une porte ouverte pour rien.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Ne montrer la fenêtre qu'une fois la page prête : sinon on voit un rectangle vide
  // pendant la seconde que coûte la lecture d'un gros transcript.
  fenetre.once('ready-to-show', () => fenetre.show());

  // Un lien vers l'extérieur s'ouvre dans le navigateur du système, jamais dans la
  // coquille : une fenêtre d'application n'a ni barre d'adresse ni bouton retour.
  fenetre.webContents.setWindowOpenHandler(({ url: cible }) => {
    shell.openExternal(cible);
    return { action: 'deny' };
  });

  fenetre.loadURL(url);
  fenetre.on('closed', () => { fenetre = null; });
}

app.whenReady().then(async () => {
  // Un menu minimal, mais pas aucun : sans lui, ni copier-coller ni ⌘Q sur macOS.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Taille normale' },
        { role: 'zoomIn', label: 'Agrandir' },
        { role: 'zoomOut', label: 'Réduire' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
    { role: 'windowMenu' },
  ]));

  try {
    const { url } = await ouvrirLeServeur();
    creerLaFenetre(url);
  } catch (err) {
    creerLaFenetre(pageDErreur(String(err && err.message ? err.message : err)));
  }

  // Sur macOS, cliquer l'icône du dock d'une application sans fenêtre la rouvre.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && fenetre === null) app.relaunch();
  });
});

// Ailleurs que sur macOS, fermer la fenêtre ferme l'application — c'est l'usage.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
