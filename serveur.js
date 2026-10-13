#!/usr/bin/env node
// Claude N Works — serveur du lot 2 : la liste des sessions Claude Code ouvertes.
//
// Lecture seule. Ce programme n'écrit jamais dans ~/.claude.
// Bibliothèque standard de Node seulement, conformément au §8 du cahier des charges.

'use strict';

const http = require('node:http');
const { lireSession, lireContexte, cheminSousAgents } = require('./lecture.js');
const { Suiveur } = require('./suivi.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const RACINE_CLAUDE = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
const DOSSIER_SESSIONS = path.join(RACINE_CLAUDE, 'sessions');
const DOSSIER_PROJETS = path.join(RACINE_CLAUDE, 'projects');
const PORT = Number(process.env.PORT || 7420);

// Sur quelles adresses écouter. Par défaut la boucle locale seule : exposer les
// transcripts d'une session, c'est exposer tout ce que l'agent a lu, écrit et dit, et ça
// ne doit jamais arriver par accident. `HOTES` prend une liste séparée par des virgules,
// et le mot `tailscale` s'y résout en l'adresse du tailnet de cette machine — ainsi on
// n'écrit pas en dur une adresse qui peut changer, et on n'écoute pas sur 0.0.0.0, ce qui
// exposerait aussi le réseau local.
const HOTES = String(process.env.HOTES || '127.0.0.1')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

// Un relevé périodique en plus de la surveillance du dossier : la mort d'un processus ne
// produit aucun événement de fichier, elle ne se voit qu'en le testant. Le délai de
// détection d'une session morte ne peut pas être meilleur que cette période.
const PERIODE_RELEVE_MS = Number(process.env.PERIODE_RELEVE_MS || 500);
const DELAI_ANTI_REBOND_MS = 200;

// ---------------------------------------------------------------- lecture des sessions

/** Le processus de pid donné est-il encore vivant ? */
function processusVivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // le signal 0 ne tue rien, il teste l'existence
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // il existe mais appartient à quelqu'un d'autre
  }
}

/**
 * Nom du dossier de projet pour un cwd donné : Claude Code remplace « / » et « . » par
 * des tirets. Observé : /home/yves/projects -> -home-yves-projects, et
 * /home/yves/.cline/worktrees/x -> -home-yves--cline-worktrees-x.
 */
function encoderCwd(cwd) {
  return cwd.replace(/[/.]/g, '-');
}

/**
 * Chemin du transcript d'une session. On calcule le chemin attendu, et on vérifie qu'il
 * existe plutôt que de s'y fier : si l'encodage change un jour, on retombe sur une
 * recherche par nom de fichier, qui est l'identifiant de session et ne peut pas tromper.
 */
async function trouverTranscript(sessionId, cwd) {
  if (cwd) {
    const attendu = path.join(DOSSIER_PROJETS, encoderCwd(cwd), `${sessionId}.jsonl`);
    try {
      await fsp.access(attendu, fs.constants.R_OK);
      return attendu;
    } catch { /* on passe à la recherche */ }
  }
  let dossiers;
  try {
    dossiers = await fsp.readdir(DOSSIER_PROJETS, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const d of dossiers) {
    if (!d.isDirectory()) continue;
    const candidat = path.join(DOSSIER_PROJETS, d.name, `${sessionId}.jsonl`);
    try {
      await fsp.access(candidat, fs.constants.R_OK);
      return candidat;
    } catch { /* suivant */ }
  }
  return null;
}

/** Le répertoire des sous-agents d'une session existe-t-il, et combien en contient-il ? */
async function compterSousAgents(cheminTranscript) {
  if (!cheminTranscript) return null;
  const dossier = path.join(
    path.dirname(cheminTranscript),
    path.basename(cheminTranscript, '.jsonl'),
    'subagents',
  );
  try {
    const entrees = await fsp.readdir(dossier);
    return entrees.filter((n) => n.endsWith('.jsonl')).length;
  } catch {
    return 0; // le dossier n'existe pas tant qu'aucun sous-agent n'a été lancé
  }
}

/**
 * Lit toutes les sessions ouvertes. Un fichier illisible, mal formé ou dont le processus
 * est mort est ignoré sans bruit : ~/.claude/sessions n'est pas une interface publique et
 * peut contenir des restes.
 */
async function lireSessions() {
  let fichiers;
  try {
    fichiers = await fsp.readdir(DOSSIER_SESSIONS);
  } catch (err) {
    return { sessions: [], erreur: `dossier des sessions illisible : ${err.code}` };
  }

  const sessions = [];
  let ignorees = 0;

  for (const nom of fichiers) {
    if (!nom.endsWith('.json')) continue; // les .key ne nous concernent pas
    let brut;
    try {
      brut = JSON.parse(await fsp.readFile(path.join(DOSSIER_SESSIONS, nom), 'utf8'));
    } catch {
      ignorees += 1;
      continue;
    }
    if (!brut || typeof brut.sessionId !== 'string') {
      ignorees += 1;
      continue;
    }
    if (!processusVivant(brut.pid)) {
      ignorees += 1; // un reste : le processus n'est plus là
      continue;
    }

    const transcript = await trouverTranscript(brut.sessionId, brut.cwd);
    sessions.push({
      sessionId: brut.sessionId,
      pid: brut.pid,
      nom: brut.name || (brut.cwd ? path.basename(brut.cwd) : brut.sessionId.slice(0, 8)),
      nomDonne: Boolean(brut.name),
      cwd: brut.cwd || null,
      statut: brut.status || null,
      attendQuoi: brut.waitingFor || null,
      demarreeA: brut.startedAt || null,
      vueA: brut.updatedAt || brut.statusUpdatedAt || null,
      version: brut.version || null,
      genre: brut.kind || null,
      pointEntree: brut.entrypoint || null,
      tmux: brut.tmux || null,
      transcript,
      sousAgents: await compterSousAgents(transcript),
    });
  }

  // La plus récemment active en premier : c'est celle qu'on veut ouvrir.
  sessions.sort((a, b) => (b.vueA || b.demarreeA || 0) - (a.vueA || a.demarreeA || 0));
  return { sessions, ignorees, releveA: Date.now() };
}

// ------------------------------------------------------------------- flux d'événements

const abonnes = new Set();
let dernierEnvoi = '';

async function diffuser() {
  const etat = await lireSessions();
  const charge = JSON.stringify(etat);
  // On ne réveille les navigateurs que si quelque chose a bougé. `releveA` change à chaque
  // relevé, donc on compare sans lui.
  const sansHorodatage = JSON.stringify({ ...etat, releveA: 0 });
  if (sansHorodatage === dernierEnvoi) return;
  dernierEnvoi = sansHorodatage;
  for (const reponse of abonnes) {
    reponse.write(`data: ${charge}\n\n`);
  }
}

let rebond = null;
function diffuserBientot() {
  clearTimeout(rebond);
  rebond = setTimeout(() => { diffuser().catch(signaler); }, DELAI_ANTI_REBOND_MS);
}

function signaler(err) {
  process.stderr.write(`[claude-n-works] ${err && err.stack ? err.stack : err}\n`);
}

// -------------------------------------------------------------------------- le serveur

const PAGE = path.join(__dirname, 'public', 'index.html');

function traiter(requete, reponse) {
  const url = new URL(requete.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(PAGE, (err, contenu) => {
      if (err) {
        reponse.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        reponse.end(`page introuvable : ${PAGE}\n`);
        return;
      }
      reponse.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      reponse.end(contenu);
    });
    return;
  }

  if (url.pathname === '/api/sessions') {
    lireSessions().then((etat) => {
      reponse.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      reponse.end(JSON.stringify(etat, null, 2));
    }).catch((err) => {
      signaler(err);
      reponse.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      reponse.end(JSON.stringify({ erreur: String(err) }));
    });
    return;
  }

  if (url.pathname === '/api/session') {
    const id = url.searchParams.get('id');
    if (!id || !/^[A-Za-z0-9-]{1,64}$/.test(id)) {
      reponse.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      reponse.end(JSON.stringify({ erreur: 'identifiant de session absent ou mal formé' }));
      return;
    }
    lireSessions()
      .then(async (etat) => {
        const vivante = etat.sessions.find((s) => s.sessionId === id);
        // Une session absente de la liste n'est pas une erreur : elle est simplement
        // terminée, et son transcript reste lisible en entier.
        const transcript = vivante
          ? vivante.transcript
          : await trouverTranscript(id, null);
        if (!transcript) {
          reponse.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
          reponse.end(JSON.stringify({ erreur: 'transcript introuvable pour ' + id }));
          return;
        }
        const deroule = await lireSession(transcript, {
          sessionVivante: Boolean(vivante),
          nomSession: vivante ? vivante.nom : null,
        });
        reponse.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        reponse.end(JSON.stringify({ ...deroule, session: vivante || { sessionId: id } }));
      })
      .catch((err) => {
        signaler(err);
        reponse.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        reponse.end(JSON.stringify({ erreur: String(err) }));
      });
    return;
  }

  // Le suivi d'une session vivante : on n'envoie que lorsque le transcript a bougé.
  if (url.pathname === '/flux-session') {
    const id = url.searchParams.get('id');
    if (!id || !/^[A-Za-z0-9-]{1,64}$/.test(id)) {
      reponse.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      reponse.end('identifiant de session absent ou mal formé\n');
      return;
    }
    suivreSession(id, requete, reponse).catch((err) => {
      signaler(err);
      try { reponse.end(); } catch { /* le navigateur est déjà parti */ }
    });
    return;
  }

  // Le contenu du contexte à un instant donné. Servi à la demande : il pèse plusieurs
  // centaines de milliers de caractères et on ne le regarde qu'un appel à la fois.
  if (url.pathname === '/api/contexte') {
    const id = url.searchParams.get('id');
    const agent = url.searchParams.get('agent') || 'racine';
    // `Number('')` vaut 0, qui est fini : valider par `Number.isFinite` seul laissait
    // passer un `instant` vide, et la borne devenait zéro sans que personne le dise.
    const instantBrut = url.searchParams.get('instant');
    const borne = Number(instantBrut);
    if (!id || !/^[A-Za-z0-9-]{1,64}$/.test(id) || !/^[A-Za-z0-9-]{1,64}$/.test(agent)
        || !/^\d{1,16}$/.test(instantBrut || '') || !Number.isFinite(borne)) {
      reponse.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      reponse.end(JSON.stringify({ erreur: 'paramètres absents ou mal formés' }));
      return;
    }
    lireSessions()
      .then(async (etat) => {
        const vivante = etat.sessions.find((s) => s.sessionId === id);
        const transcript = vivante ? vivante.transcript : await trouverTranscript(id, null);
        if (!transcript) {
          reponse.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
          reponse.end(JSON.stringify({ erreur: 'transcript introuvable' }));
          return;
        }
        const chemin = agent === 'racine'
          ? transcript
          : path.join(cheminSousAgents(transcript), 'agent-' + agent + '.jsonl');
        const contenu = await lireContexte(chemin, borne);
        reponse.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        reponse.end(JSON.stringify(contenu));
      })
      .catch((err) => {
        signaler(err);
        reponse.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        reponse.end(JSON.stringify({ erreur: String(err) }));
      });
    return;
  }

  if (url.pathname === '/session.html') {
    fs.readFile(path.join(__dirname, 'public', 'session.html'), (err, contenu) => {
      if (err) {
        reponse.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        reponse.end('page de session introuvable\n');
        return;
      }
      reponse.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      reponse.end(contenu);
    });
    return;
  }

  if (url.pathname === '/flux') {
    reponse.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    reponse.write('retry: 2000\n\n');
    abonnes.add(reponse);
    // L'état courant tout de suite, sans attendre le prochain relevé.
    lireSessions()
      .then((etat) => reponse.write(`data: ${JSON.stringify(etat)}\n\n`))
      .catch(signaler);
    requete.on('close', () => { abonnes.delete(reponse); });
    return;
  }

  reponse.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  reponse.end('rien ici\n');
}

// Le suivi est incrémental : chaque passage ne lit que ce qui s'est ajouté, donc on peut
// le faire souvent sans que la taille du transcript entre en ligne de compte.
const PERIODE_SUIVI_MS = 400;

async function suivreSession(id, requete, reponse) {
  const etat = await lireSessions();
  const vivante = etat.sessions.find((s) => s.sessionId === id);
  const transcript = vivante ? vivante.transcript : await trouverTranscript(id, null);
  if (!transcript) {
    reponse.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    reponse.end('transcript introuvable\n');
    return;
  }

  reponse.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  reponse.write('retry: 2000\n\n');

  const suiveur = new Suiveur(transcript);
  let vivant = Boolean(vivante);
  let fini = false;
  let enCours = false;

  const envoyer = async (forcer) => {
    if (fini || enCours) return;
    enCours = true;
    try {
      // La session peut mourir pendant qu'on la regarde : c'est le seul moyen de
      // distinguer un agent qui travaille d'un agent coupé net (§5 quater).
      const liste = await lireSessions();
      const toujours = liste.sessions.find((s) => s.sessionId === id);
      const changeDeVie = Boolean(toujours) !== vivant;
      vivant = Boolean(toujours);
      const deroule = await suiveur.rafraichir({
        sessionVivante: vivant,
        nomSession: toujours ? toujours.nom : (vivante ? vivante.nom : null),
        forcer: forcer || changeDeVie,
      });
      if (deroule && !fini) {
        reponse.write(`data: ${JSON.stringify({
          ...deroule,
          session: toujours || vivante || { sessionId: id },
          maintenant: Date.now(),
        })}\n\n`);
      }
    } finally {
      enCours = false;
    }
  };

  await envoyer(true);
  const garde = suiveur.surveiller(() => { envoyer(false).catch(signaler); });
  // Le répertoire des sous-agents n'existe pas tant qu'aucun sous-agent n'a été lancé :
  // on retente de le surveiller à chaque passage tant qu'il manque.
  const horloge = setInterval(() => {
    garde.poserSousAgents();
    envoyer(false).catch(signaler);
  }, PERIODE_SUIVI_MS);

  requete.on('close', () => { fini = true; clearInterval(horloge); });
}

/**
 * Les adresses de cette machine sur le tailnet, IPv4 et IPv6.
 *
 * Les deux sont nécessaires : MagicDNS résout le nom court de la machine vers son adresse
 * IPv6, donc n'écouter qu'en IPv4 rendrait `http://claude-server:7420` injoignable depuis
 * les autres appareils, alors que l'adresse numérique, elle, marcherait.
 */
function adressesTailscale() {
  try {
    const sortie = execFileSync('tailscale', ['ip'], { encoding: 'utf8', timeout: 4000 });
    return sortie.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const serveurs = [];
const adresses = [];
const demandees = [];
for (const demande of HOTES) {
  if (demande !== 'tailscale') { demandees.push(demande); continue; }
  const trouvees = adressesTailscale();
  if (!trouvees.length) {
    signaler(new Error('Tailscale ne donne aucune adresse : cette écoute est abandonnée'));
    continue;
  }
  demandees.push(...trouvees);
}

for (const hote of demandees) {
  if (adresses.includes(hote)) continue;
  adresses.push(hote);
  const s = http.createServer(traiter);
  s.on('error', (err) => signaler(new Error(`écoute impossible sur ${hote} : ${err.code}`)));
  s.listen(PORT, hote, () => {
    // Une adresse IPv6 se note entre crochets dans une URL.
    const lisible = hote.includes(':') ? `[${hote}]` : hote;
    process.stdout.write(`Claude N Works — http://${lisible}:${PORT}\n`);
  });
  serveurs.push(s);
}

if (!serveurs.length) {
  process.stderr.write('Aucune adresse d’écoute utilisable. Rien à faire.\n');
  process.exit(1);
}

process.stdout.write(`  sessions  : ${DOSSIER_SESSIONS}\n`);
process.stdout.write(`  transcrits: ${DOSSIER_PROJETS}\n`);

// Surveillance du dossier pour réagir tout de suite, et relevé périodique pour voir les
// processus qui meurent sans toucher à leur fichier.
try {
  fs.watch(DOSSIER_SESSIONS, () => diffuserBientot());
} catch (err) {
  signaler(new Error(`surveillance impossible, on se contente du relevé : ${err.code}`));
}
setInterval(() => { diffuser().catch(signaler); }, PERIODE_RELEVE_MS).unref();

process.on('SIGINT', () => {
  for (const s of serveurs) s.close();
  process.exit(0);
});
