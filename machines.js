// Orange Black Box — les machines distantes qu'on suit, et comment on leur parle.
//
// Une **sonde** est ce même programme lancé avec `--sonde` sur la machine à observer :
// elle n'expose que l'API, jamais l'écran, et elle exige un jeton. Le poste local garde la
// liste des sondes et les interroge pour son propre compte — la page, elle, ne parle qu'à
// son serveur local. C'est ce qui évite d'ouvrir CORS et garde les jetons hors du
// navigateur.
//
// Rien n'est inventé ici : le fichier de configuration est le seul état, il est lisible à
// la main, et une machine injoignable est signalée plutôt que passée sous silence.

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const DOSSIER = process.env.OBB_HOME || path.join(os.homedir(), '.orange-black-box');
const FICHIER_MACHINES = path.join(DOSSIER, 'machines.json');
const FICHIER_SONDE = path.join(DOSSIER, 'sonde.json');

// Le projet s'est appelé « Claude N Works » jusqu'au 21 octobre 2026, et son état vivait
// dans `~/.claude-n-works`. On le déménage une fois, au lieu de le laisser derrière :
// ce dossier porte le JETON de la sonde, et le perdre en fabriquerait un nouveau — donc
// casserait silencieusement tous les postes qui avaient noté l'ancien.
const ANCIEN_DOSSIER = path.join(os.homedir(), '.claude-n-works');
function demenagerSiBesoin() {
  if (process.env.OBB_HOME) return;
  if (fs.existsSync(DOSSIER) || !fs.existsSync(ANCIEN_DOSSIER)) return;
  try {
    fs.renameSync(ANCIEN_DOSSIER, DOSSIER);
    process.stderr.write('[orange-black-box] état déménagé : '
      + ANCIEN_DOSSIER + ' → ' + DOSSIER + '\n');
  } catch { /* on continue : un dossier neuf vaut mieux qu'un démarrage refusé */ }
}
demenagerSiBesoin();

// Une sonde qui ne répond pas ne doit pas faire attendre tout l'écran : mesuré, le relevé
// local complet prend quelques dizaines de millisecondes, et une seconde et demie est déjà
// très au-delà de ce qu'un réseau sain demande.
const DELAI_MS = Number(process.env.OBB_DELAI_SONDE_MS || 1500);

function assurerLeDossier() {
  try { fs.mkdirSync(DOSSIER, { recursive: true, mode: 0o700 }); } catch { /* tant pis */ }
}

// ------------------------------------------------------------------ le jeton d'une sonde

/**
 * Le jeton de CETTE machine quand elle sert de sonde. Fabriqué au premier lancement et
 * gardé ; on ne le régénère jamais tout seul, sans quoi chaque redémarrage casserait les
 * postes qui l'avaient déjà noté.
 */
function jetonDeLaSonde() {
  if (process.env.OBB_JETON) return process.env.OBB_JETON;
  try {
    const brut = JSON.parse(fs.readFileSync(FICHIER_SONDE, 'utf8'));
    if (brut && typeof brut.jeton === 'string' && brut.jeton.length >= 16) return brut.jeton;
  } catch { /* pas encore de jeton : on en fabrique un */ }
  const jeton = crypto.randomBytes(16).toString('hex');
  assurerLeDossier();
  try {
    fs.writeFileSync(FICHIER_SONDE, JSON.stringify({ jeton }, null, 2), { mode: 0o600 });
  } catch { /* on continue avec un jeton de session, non persisté */ }
  return jeton;
}

/**
 * Comparaison à temps constant. Un `===` sur une chaîne s'arrête au premier caractère qui
 * diffère, et la durée de la réponse renseigne alors sur le préfixe trouvé. Ce n'est pas
 * un risque théorique sur un réseau local, mais la bonne façon d'écrire tient en deux
 * lignes.
 */
function jetonValide(attendu, donne) {
  if (typeof donne !== 'string' || donne.length !== attendu.length) return false;
  return crypto.timingSafeEqual(Buffer.from(attendu), Buffer.from(donne));
}

/** Le jeton porté par une requête : en-tête `Authorization`, ou paramètre `jeton`. */
function jetonDeLaRequete(requete, url) {
  const entete = requete.headers.authorization || '';
  const m = /^Bearer\s+(\S+)$/i.exec(entete);
  if (m) return m[1];
  return url.searchParams.get('jeton') || null;
}

// ------------------------------------------------------- la liste des machines suivies

function lireLesMachines() {
  try {
    const brut = JSON.parse(fs.readFileSync(FICHIER_MACHINES, 'utf8'));
    if (!Array.isArray(brut)) return [];
    return brut.filter((m) => m && typeof m.nom === 'string' && typeof m.url === 'string');
  } catch {
    return [];
  }
}

async function ecrireLesMachines(liste) {
  assurerLeDossier();
  await fsp.writeFile(FICHIER_MACHINES, JSON.stringify(liste, null, 2), { mode: 0o600 });
}

/** Le nom se normalise : c'est une clé d'URL, elle ne doit pas porter de surprise. */
function nomValide(nom) {
  return typeof nom === 'string' && /^[A-Za-z0-9._-]{1,40}$/.test(nom);
}

function urlValide(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ interroger une sonde

/**
 * Appelle une sonde et rend son JSON. Une panne n'est jamais silencieuse : elle remonte
 * comme une erreur nommée, que l'écran affiche à côté de la machine concernée.
 */
async function interroger(machine, chemin, params = {}) {
  const url = new URL(chemin, machine.url);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const arret = AbortSignal.timeout(DELAI_MS);
  let reponse;
  try {
    reponse = await fetch(url, {
      signal: arret,
      headers: machine.jeton ? { authorization: 'Bearer ' + machine.jeton } : {},
    });
  } catch (err) {
    const cause = err && err.name === 'TimeoutError'
      ? 'ne répond pas au bout de ' + DELAI_MS + ' ms'
      : 'est injoignable à cette adresse';
    throw Object.assign(new Error(cause), { machine: machine.nom, injoignable: true });
  }
  if (reponse.status === 401 || reponse.status === 403) {
    throw Object.assign(new Error('a refusé ce jeton'), { machine: machine.nom, jeton: true });
  }
  if (!reponse.ok) {
    throw Object.assign(new Error('a répondu ' + reponse.status
      + (reponse.status === 404 ? ' — est-ce bien une sonde ?' : '')),
    { machine: machine.nom });
  }
  return reponse.json();
}

module.exports = {
  DOSSIER, FICHIER_MACHINES, FICHIER_SONDE, DELAI_MS,
  jetonDeLaSonde, jetonValide, jetonDeLaRequete,
  lireLesMachines, ecrireLesMachines, nomValide, urlValide,
  interroger,
};
