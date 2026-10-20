#!/usr/bin/env node
// Claude N Works — serveur du lot 2 : la liste des sessions Claude Code ouvertes.
//
// Lecture seule. Ce programme n'écrit jamais dans ~/.claude.
// Bibliothèque standard de Node seulement, conformément au §8 du cahier des charges.

'use strict';

const http = require('node:http');
const { lireSession, lireContexte, cheminSousAgents, recenserSkills } = require('./lecture.js');
const { Suiveur } = require('./suivi.js');
const sondes = require('./machines.js');
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
 * des tirets. Observé : /home/moi/projets -> -home-moi-projets, et
 * /home/moi/.cline/worktrees/x -> -home-moi--cline-worktrees-x.
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

// --------------------------------------------------- les sessions, ici et là-bas

/**
 * Le relevé de TOUTES les machines suivies — §7.
 *
 * Les sessions locales portent `machine: null`, qui se lit « ce poste ». Celles d'une
 * sonde portent son nom. Une sonde en panne n'efface pas les autres et ne fait pas échouer
 * l'écran : elle apparaît dans `machinesEnPanne`, avec sa raison, et l'écran le dit à côté
 * de son nom. Le silence serait pire que l'erreur — on croirait la machine au repos.
 *
 * Les sondes sont interrogées EN PARALLÈLE : trois machines lentes ne doivent pas coûter
 * trois fois le délai.
 */
async function lireSessionsToutes() {
  const machines = sondes.lireLesMachines();
  const local = await lireSessions();
  for (const s of local.sessions) s.machine = null;
  if (!machines.length) return { ...local, machines: [], machinesEnPanne: [] };

  const pannes = [];
  const ailleurs = await Promise.all(machines.map(async (m) => {
    try {
      const d = await sondes.interroger(m, '/api/sessions');
      for (const s of d.sessions || []) s.machine = m.nom;
      return d.sessions || [];
    } catch (err) {
      pannes.push({ machine: m.nom, url: m.url, raison: err.message });
      return [];
    }
  }));

  const sessions = local.sessions.concat(...ailleurs);
  // Le même tri que localement : la plus récemment active en premier, d'où qu'elle vienne.
  sessions.sort((a, b) => (b.vueA || b.demarreeA || 0) - (a.vueA || a.demarreeA || 0));
  return {
    ...local,
    sessions,
    machines: machines.map((m) => ({ nom: m.nom, url: m.url })),
    machinesEnPanne: pannes,
  };
}

/**
 * Relaie une requête d'API vers une sonde et rend sa réponse telle quelle.
 *
 * C'est le serveur LOCAL qui parle à la sonde, jamais la page : une seule origine pour le
 * navigateur, et le jeton ne descend jamais dans le document. Rend `true` quand la requête
 * a été prise en charge.
 */
async function relayer(url, reponse, chemin) {
  let machine;
  try { machine = machineDemandee(url); } catch (err) {
    repondreJson(reponse, 400, { erreur: err.message });
    return true;
  }
  if (!machine) return false;   // c'est pour ce poste : le traitement ordinaire s'applique

  const params = {};
  for (const [k, v] of url.searchParams) if (k !== 'machine') params[k] = v;
  try {
    repondreJson(reponse, 200, await sondes.interroger(machine, chemin, params));
  } catch (err) {
    // 502 et non 500 : ce n'est pas ce serveur qui a échoué, c'est celui d'en face.
    repondreJson(reponse, 502, { erreur: 'la machine « ' + machine.nom + ' » ' + err.message });
  }
  return true;
}

/** Le corps JSON d'une requête, borné : un corps sans fin ne doit pas manger la mémoire. */
function lireLeCorps(requete, maxi = 64 * 1024) {
  return new Promise((resoudre, rejeter) => {
    let brut = '';
    requete.on('data', (bout) => {
      brut += bout;
      if (brut.length > maxi) { rejeter(new Error('corps trop long')); requete.destroy(); }
    });
    requete.on('end', () => {
      try { resoudre(brut ? JSON.parse(brut) : {}); } catch { rejeter(new Error('corps JSON illisible')); }
    });
    requete.on('error', rejeter);
  });
}

function repondreJson(reponse, code, corps) {
  reponse.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  reponse.end(JSON.stringify(corps));
}

/** La machine nommée, ou `null` quand c'est ce poste. Lève si le nom est inconnu. */
function machineDemandee(url) {
  const nom = url.searchParams.get('machine');
  if (!nom || nom === 'local') return null;
  const m = sondes.lireLesMachines().find((x) => x.nom === nom);
  if (!m) throw Object.assign(new Error('machine inconnue : ' + nom), { inconnue: true });
  return m;
}

/** Le déroulé d'une session de CE poste. Une sonde ne sert que celui-ci. */
function servirUneSession(url, reponse) {
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

/** Le recensement des skills de CE poste. */
function servirLesSkills(url, reponse) {
  recenserSkills(DOSSIER_PROJETS).then((etat) => {
    reponse.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    reponse.end(JSON.stringify(etat));
  }).catch((err) => {
    signaler(err);
    reponse.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    reponse.end(JSON.stringify({ erreur: String(err) }));
  });
  return;
}

/** Le contenu du contexte à un appel, sur CE poste. */
function servirLeContexte(url, reponse) {
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
      // `depuis` restreint à ce que CET appel a ajouté ; absent, on rend tout.
      const depuisBrut = url.searchParams.get('depuis');
      const depuis = /^\d{1,16}$/.test(depuisBrut || '') ? Number(depuisBrut) : undefined;
      const contenu = await lireContexte(chemin, borne, depuis);
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

// ------------------------------------------------------------------- flux d'événements

const abonnes = new Set();
let dernierEnvoi = '';

async function diffuser() {
  // `lireSessionsToutes` plutôt que `lireSessions` : le flux doit porter ce que l'écran
  // montre, machines distantes comprises. Une sonde, elle, ne diffuse qu'elle-même.
  const etat = MODE_SONDE ? await lireSessions() : await lireSessionsToutes();
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

/**
 * Le battement des machines distantes.
 *
 * Localement, `fs.watch` prévient dès qu'un transcript bouge et rien ne tourne à vide.
 * Une sonde ne peut pas nous prévenir — c'est nous qui l'appelons — donc il faut un
 * relevé régulier. Il ne démarre que s'il y a des machines à suivre, et il s'arrête quand
 * plus personne ne regarde : interroger trois serveurs toutes les deux secondes pour un
 * écran que nul n'a ouvert serait du gâchis pur.
 */
const PERIODE_SONDES_MS = Number(process.env.PERIODE_SONDES_MS || 2000);
let battement = null;

function reglerLeBattement() {
  const utile = !MODE_SONDE && abonnes.size > 0 && sondes.lireLesMachines().length > 0;
  if (utile && !battement) {
    battement = setInterval(() => { diffuser().catch(signaler); }, PERIODE_SONDES_MS);
    if (battement.unref) battement.unref();
  } else if (!utile && battement) {
    clearInterval(battement);
    battement = null;
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

// ------------------------------------------------------------------ le mode sonde
//
// Lancé avec `--sonde`, ce même programme devient une **sonde** : il n'expose que l'API,
// jamais l'écran, et il exige un jeton. C'est ce qu'on installe sur une machine qu'on veut
// observer de loin — un serveur de construction, une machine headless. Le poste de travail
// l'interroge pour son propre compte ; la page, elle, ne parle jamais qu'à son serveur
// local, ce qui évite d'ouvrir CORS et garde le jeton hors du navigateur.
const MODE_SONDE = process.argv.includes('--sonde') || process.env.SONDE === '1';
const JETON_SONDE = MODE_SONDE ? sondes.jetonDeLaSonde() : null;

// Ce qu'une sonde accepte de servir. Tout le reste — les pages, les réglages — n'a pas de
// sens à distance et n'est pas exposé : une sonde est une source de données, pas un écran.
const CHEMINS_DE_SONDE = new Set([
  '/api/sessions', '/api/session', '/api/contexte', '/api/skills',
  '/flux', '/flux-session',
]);

/**
 * Le filtre d'une sonde : le chemin est-il permis, et le jeton est-il le bon ?
 * Rend `true` quand la requête a déjà été close et que l'appelant doit s'arrêter là.
 */
function sondeRefuse(requete, reponse, url) {
  if (!MODE_SONDE) return false;
  if (!CHEMINS_DE_SONDE.has(url.pathname)) {
    reponse.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    reponse.end('sonde : seule l’API est servie ici\n');
    return true;
  }
  if (!sondes.jetonValide(JETON_SONDE, sondes.jetonDeLaRequete(requete, url))) {
    reponse.writeHead(401, {
      'content-type': 'text/plain; charset=utf-8',
      'www-authenticate': 'Bearer realm="claude-n-works"',
    });
    reponse.end('sonde : jeton absent ou refusé\n');
    return true;
  }
  return false;
}

function traiter(requete, reponse) {
  const url = new URL(requete.url, `http://127.0.0.1:${PORT}`);
  if (sondeRefuse(requete, reponse, url)) return;

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
    // Une sonde ne relaie pas : elle ne connaît qu'elle-même. Sans cela, deux sondes qui
    // se pointeraient l'une l'autre boucleraient.
    (MODE_SONDE ? lireSessions() : lireSessionsToutes()).then((etat) => {
      reponse.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      reponse.end(JSON.stringify(etat, null, 2));
    }).catch((err) => {
      signaler(err);
      reponse.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      reponse.end(JSON.stringify({ erreur: String(err) }));
    });
    return;
  }

  // Les machines suivies : les lister, en ajouter une, en retirer une. Une sonde n'en a
  // pas — elle est une source, pas un poste de travail.
  if (url.pathname === '/api/machines' && !MODE_SONDE) {
    if (requete.method === 'GET') {
      repondreJson(reponse, 200, { machines: sondes.lireLesMachines()
        .map((m) => ({ nom: m.nom, url: m.url })) });
      return;
    }
    if (requete.method === 'POST' || requete.method === 'DELETE') {
      lireLeCorps(requete).then(async (corps) => {
        const liste = sondes.lireLesMachines();
        if (requete.method === 'DELETE') {
          const reste = liste.filter((m) => m.nom !== corps.nom);
          if (reste.length === liste.length) {
            repondreJson(reponse, 404, { erreur: 'machine inconnue : ' + corps.nom });
            return;
          }
          await sondes.ecrireLesMachines(reste);
          reglerLeBattement();
          diffuserBientot();
          repondreJson(reponse, 200, { machines: reste.map((m) => ({ nom: m.nom, url: m.url })) });
          return;
        }
        if (!sondes.nomValide(corps.nom)) {
          repondreJson(reponse, 400, { erreur: 'nom de machine invalide : lettres, chiffres, . _ -' });
          return;
        }
        if (!sondes.urlValide(corps.url)) {
          repondreJson(reponse, 400, { erreur: 'adresse invalide : il faut une URL http(s)' });
          return;
        }
        const machine = { nom: corps.nom, url: corps.url, jeton: String(corps.jeton || '') };
        // On ÉPROUVE la sonde avant de l'inscrire : une machine qu'on ajoute et qui ne
        // répond pas laisserait croire qu'elle est au repos, ce qui est le pire des cas.
        try {
          await sondes.interroger(machine, '/api/sessions');
        } catch (err) {
          repondreJson(reponse, 502, { erreur: 'la sonde ' + err.message });
          return;
        }
        const reste = liste.filter((m) => m.nom !== machine.nom);
        reste.push(machine);
        await sondes.ecrireLesMachines(reste);
        reglerLeBattement();
        diffuserBientot();
        repondreJson(reponse, 200, { machines: reste.map((m) => ({ nom: m.nom, url: m.url })) });
      }).catch((err) => repondreJson(reponse, 400, { erreur: String(err.message || err) }));
      return;
    }
    repondreJson(reponse, 405, { erreur: 'méthode non permise' });
    return;
  }

  // Les trois points d'API qui désignent une session précise. Chacun suit la même règle :
  // si la requête nomme une MACHINE, on relaie vers sa sonde ; sinon c'est pour ce poste.
  // Une sonde, elle, ne relaie jamais — elle ne connaît qu'elle-même, et deux sondes qui
  // se pointeraient l'une l'autre boucleraient.
  for (const [chemin, servir] of [
    ['/api/session', servirUneSession],
    ['/api/skills', servirLesSkills],
    ['/api/contexte', servirLeContexte],
  ]) {
    if (url.pathname !== chemin) continue;
    if (MODE_SONDE) { servir(url, reponse); return; }
    relayer(url, reponse, chemin)
      .then((pris) => { if (!pris) servir(url, reponse); })
      .catch((err) => { signaler(err); repondreJson(reponse, 500, { erreur: String(err) }); });
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
    let machine = null;
    if (!MODE_SONDE) {
      try { machine = machineDemandee(url); } catch (err) {
        reponse.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        reponse.end(err.message + '\n');
        return;
      }
    }
    const suivi = machine
      ? relayerLeFlux(machine, id, requete, reponse)
      : suivreSession(id, requete, reponse);
    suivi.catch((err) => {
      signaler(err);
      try { reponse.end(); } catch { /* le navigateur est déjà parti */ }
    });
    return;
  }

  // Le recensement des skills sur toute la machine : « qui d'autre se sert de celui-ci ».
  // Servi à la demande, comme le contexte, parce qu'il lit TOUS les transcrits — 4,9 s au
  // premier appel, 10 ms ensuite grâce au cache par date de fichier.
  // Le contenu du contexte à un instant donné. Servi à la demande : il pèse plusieurs
  // centaines de milliers de caractères et on ne le regarde qu'un appel à la fois.
  // La chaîne des appels : la même session, vue comme un enchaînement et non comme une
  // durée. Servie exactement comme la ligne du temps.
  if (url.pathname === '/chaine.html') {
    fs.readFile(path.join(__dirname, 'public', 'chaine.html'), (err, contenu) => {
      if (err) {
        reponse.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        reponse.end('page de la chaîne introuvable\n');
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
    reglerLeBattement();
    // L'état courant tout de suite, sans attendre le prochain relevé.
    (MODE_SONDE ? lireSessions() : lireSessionsToutes())
      .then((etat) => reponse.write(`data: ${JSON.stringify(etat)}\n\n`))
      .catch(signaler);
    requete.on('close', () => { abonnes.delete(reponse); reglerLeBattement(); });
    return;
  }

  reponse.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  reponse.end('rien ici\n');
}

// Le suivi est incrémental : chaque passage ne lit que ce qui s'est ajouté, donc on peut
// le faire souvent sans que la taille du transcript entre en ligne de compte.
/**
 * Relayer le flux d'une session distante — §7.
 *
 * Le SSE d'une sonde est repompé tel quel vers le navigateur : les trames ne sont ni
 * relues ni réécrites, le serveur local n'est qu'un tuyau. C'est ce qui garantit qu'une
 * session distante s'affiche exactement comme une session locale, sans second chemin de
 * code à tenir d'accord.
 *
 * Deux fins possibles, et les deux comptent : le navigateur part — on coupe la sonde — ou
 * la sonde tombe — on ferme proprement au lieu de laisser une page attendre pour rien.
 */
async function relayerLeFlux(machine, id, requete, reponse) {
  const amont = new AbortController();
  requete.on('close', () => amont.abort());

  const cible = new URL('/flux-session', machine.url);
  cible.searchParams.set('id', id);
  let distant;
  try {
    distant = await fetch(cible, {
      signal: amont.signal,
      headers: machine.jeton ? { authorization: 'Bearer ' + machine.jeton } : {},
    });
  } catch (err) {
    if (amont.signal.aborted) return;   // le navigateur est simplement parti
    reponse.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    reponse.end('la machine « ' + machine.nom + ' » est injoignable\\n');
    return;
  }
  if (!distant.ok || !distant.body) {
    reponse.writeHead(distant.status === 401 ? 401 : 502,
      { 'content-type': 'text/plain; charset=utf-8' });
    reponse.end('la sonde « ' + machine.nom + ' » a répondu ' + distant.status + '\\n');
    return;
  }

  reponse.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const lecteur = distant.body.getReader();
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      if (!reponse.write(Buffer.from(value))) {
        // Le navigateur ne suit pas : on attend qu'il se vide plutôt que d'empiler.
        await new Promise((r) => reponse.once('drain', r));
      }
    }
  } catch {
    /* coupure d'un côté ou de l'autre : il n'y a rien de plus à dire */
  } finally {
    try { reponse.end(); } catch { /* déjà close */ }
  }
}

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
 * IPv6, donc n'écouter qu'en IPv4 rendrait `http://<nom-de-la-machine>:7420` injoignable depuis
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

/**
 * Démarre l'écoute.
 *
 * Isolé dans une fonction depuis que l'application de bureau existe : la coquille
 * Electron démarre le serveur **dans son propre processus** plutôt que d'en lancer un
 * second, et elle a besoin de savoir sur quel port il a réellement pris. Lancé
 * directement — `node serveur.js` — le comportement est exactement celui d'avant.
 *
 * `port` vaut 0 pour demander un port libre au système : c'est ce que fait la coquille
 * quand le port habituel est déjà pris par un serveur lancé à la main.
 */
function demarrer({ port = PORT, hotes = HOTES, silencieux = false } = {}) {
  const serveurs = [];
  const adresses = [];
  const demandees = [];
  for (const demande of hotes) {
    if (demande !== 'tailscale') { demandees.push(demande); continue; }
    const trouvees = adressesTailscale();
    if (!trouvees.length) {
      signaler(new Error('Tailscale ne donne aucune adresse : cette écoute est abandonnée'));
      continue;
    }
    demandees.push(...trouvees);
  }

  const prets = [];
  for (const hote of demandees) {
    if (adresses.includes(hote)) continue;
    adresses.push(hote);
    const s = http.createServer(traiter);
    prets.push(new Promise((resoudre, rejeter) => {
      s.on('error', (err) => {
        // En mode silencieux, c'est l'appelant qui décide quoi faire d'un échec : la
        // coquille de bureau essaie le port habituel puis se rabat, et afficher une
        // erreur rattrapée ferait croire à une panne là où il n'y en a pas.
        if (!silencieux) signaler(new Error(`écoute impossible sur ${hote} : ${err.code}`));
        rejeter(err);
      });
      s.listen(port, hote, () => {
        // Une adresse IPv6 se note entre crochets dans une URL.
        const lisible = hote.includes(':') ? `[${hote}]` : hote;
        const effectif = s.address().port;
        if (!silencieux) {
          process.stdout.write(MODE_SONDE
            ? `  sonde  : http://${lisible}:${effectif}\n`
            : `Claude N Works — http://${lisible}:${effectif}\n`);
        }
        resoudre({ hote, port: effectif, url: `http://${lisible}:${effectif}` });
      });
    }));
    serveurs.push(s);
  }

  if (!serveurs.length) {
    return Promise.reject(new Error('Aucune adresse d’écoute utilisable.'));
  }

  if (!silencieux) {
    process.stdout.write(`  sessions  : ${DOSSIER_SESSIONS}\n`);
    process.stdout.write(`  transcrits: ${DOSSIER_PROJETS}\n`);
  }

  // Surveillance du dossier pour réagir tout de suite, et relevé périodique pour voir les
  // processus qui meurent sans toucher à leur fichier.
  try {
    fs.watch(DOSSIER_SESSIONS, () => diffuserBientot());
  } catch (err) {
    signaler(new Error(`surveillance impossible, on se contente du relevé : ${err.code}`));
  }
  const horloge = setInterval(() => { diffuser().catch(signaler); }, PERIODE_RELEVE_MS);
  horloge.unref();

  // Une sonde n'a qu'une chose à dire, et il faut la dire bien : son jeton, et la ligne
  // exacte à reporter sur le poste de travail. Sans cela, on a installé la sonde et on ne
  // sait pas quoi en faire — ce qui est le pire moment pour aller chercher la
  // documentation.
  if (MODE_SONDE && !silencieux) {
    Promise.any(prets).then((premiere) => {
      process.stdout.write('\n  jeton  : ' + JETON_SONDE + '\n');
      process.stdout.write('           (gardé dans ' + sondes.FICHIER_SONDE + ')\n\n');
      process.stdout.write('  Sur votre poste : « + une machine », puis\n');
      process.stdout.write('    adresse ' + premiere.url + '\n');
      process.stdout.write('    jeton   ' + JETON_SONDE + '\n\n');
      process.stdout.write('  Cette sonde ne sert que l’API, et seulement avec ce jeton.\n');
    }).catch(() => { /* aucune adresse : l'erreur est déjà signalée */ });
  }

  // Au moins une adresse suffit : qu'une des trois échoue ne doit pas tout emporter.
  return Promise.any(prets).then((premiere) => ({
    ...premiere, serveurs, fermer: () => { for (const s of serveurs) s.close(); },
  }));
}

module.exports = { demarrer };

// Lancé directement, le programme se comporte comme avant : il écoute et il reste.
if (require.main === module) {
  demarrer().then(({ fermer }) => {
    process.on('SIGINT', () => { fermer(); process.exit(0); });
  }).catch((err) => {
    process.stderr.write(String(err.message || err) + '\n');
    process.exit(1);
  });
}
