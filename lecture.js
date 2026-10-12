// Claude N Works — reconstruction du déroulé d'une session à partir de ses transcripts.
//
// Lecture seule. Deux sources, conformément au §3.2 du cahier des charges :
//   <sessionId>.jsonl                     la session et son agent racine
//   <sessionId>/subagents/agent-*.jsonl   un fichier par sous-agent, toutes profondeurs
//
// Les règles appliquées ici sont celles mesurées dans OBSERVATIONS-FORMAT.md. Chaque
// endroit où le format surprend porte une référence au paragraphe correspondant.

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

const LIMITE_TEXTE = 4000; // au-delà, on tronque : un prompt peut faire des pages

// ----------------------------------------------------------------------- petits outils

function instant(ligne) {
  const t = Date.parse(ligne.timestamp || '');
  return Number.isNaN(t) ? null : t;
}

/** Le texte lisible d'un contenu de message, quelle que soit sa forme. */
function texteDe(contenu) {
  if (typeof contenu === 'string') return contenu;
  if (!Array.isArray(contenu)) return '';
  return contenu
    .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
    .map((b) => b.text || '')
    .join('\n');
}

function tronquer(texte) {
  if (typeof texte !== 'string') return '';
  return texte.length > LIMITE_TEXTE ? texte.slice(0, LIMITE_TEXTE) + '\n…' : texte;
}

/** Résumé d'une entrée d'outil, pour une marque survolée. */
function resumerEntree(nom, entree) {
  if (!entree || typeof entree !== 'object') return '';
  if (nom === 'Bash') return entree.command || '';
  if (nom === 'Read' || nom === 'Edit' || nom === 'Write') return entree.file_path || '';
  if (nom === 'Skill') return entree.skill || '';
  if (nom === 'Agent' || nom === 'Task') return entree.description || '';
  if (nom === 'Grep' || nom === 'Glob') return entree.pattern || '';
  const premier = Object.values(entree).find((v) => typeof v === 'string');
  return premier || '';
}

async function* lignesDe(chemin) {
  const flux = fs.createReadStream(chemin, { encoding: 'utf8' });
  const lecteur = readline.createInterface({ input: flux, crlfDelay: Infinity });
  let n = 0;
  for await (const brute of lecteur) {
    n += 1;
    if (!brute.trim()) continue;
    try {
      yield { n, ligne: JSON.parse(brute) };
    } catch {
      // Une ligne illisible n'arrête pas la lecture : le fichier peut être en cours
      // d'écriture et sa dernière ligne incomplète.
    }
  }
}

// --------------------------------------------------- dépouillement d'un seul transcript

/**
 * Lit un transcript et en extrait ce qui nous intéresse, sans encore rien interpréter :
 * les appels d'outils, leurs résultats, les requêtes humaines, les notifications de fin
 * d'agent d'arrière-plan, et les bornes de temps.
 */
async function depouiller(chemin) {
  const appels = new Map();   // id du tool_use -> appel
  const requetes = [];
  const notifications = [];
  let premier = null;
  let dernier = null;
  let modele = null;
  let effort = null;
  let interrompu = false;

  for await (const { ligne } of lignesDe(chemin)) {
    const t = instant(ligne);
    if (t !== null) {
      if (premier === null || t < premier) premier = t;
      if (dernier === null || t > dernier) dernier = t;
    }

    if (ligne.type === 'assistant') {
      if (ligne.message && ligne.message.model) modele = ligne.message.model;
      if (ligne.effort) effort = ligne.effort;
      for (const bloc of ligne.message?.content || []) {
        if (bloc.type !== 'tool_use') continue;
        appels.set(bloc.id, {
          id: bloc.id,
          nom: bloc.name,
          debut: t,
          fin: null,
          ok: null,
          resume: resumerEntree(bloc.name, bloc.input),
          entree: bloc.input,
        });
      }
      continue;
    }

    if (ligne.type !== 'user') continue;

    const contenu = ligne.message?.content;
    const texte = texteDe(contenu);

    // Une notification de fin d'agent d'arrière-plan : §5 bis d'OBSERVATIONS-FORMAT.
    if (ligne.origin && ligne.origin.kind === 'task-notification') {
      const id = /<task-id>([^<]+)<\/task-id>/.exec(texte);
      const statut = /<status>([^<]+)<\/status>/.exec(texte);
      if (id) notifications.push({ agentId: id[1], statut: statut ? statut[1] : null, instant: t });
      continue;
    }

    // Une vraie requête d'Yves, et elle seule : §5 bis également.
    if (ligne.origin && ligne.origin.kind === 'human') {
      requetes.push({ instant: t, texte: tronquer(texte) });
      continue;
    }

    if (texte.startsWith('[Request interrupted by user')) interrompu = true;

    if (Array.isArray(contenu)) {
      for (const bloc of contenu) {
        if (bloc.type !== 'tool_result') continue;
        const appel = appels.get(bloc.tool_use_id);
        if (!appel) continue;
        appel.fin = t;
        appel.ok = !bloc.is_error;
        // Attention : toolUseResult est tantôt un objet, tantôt une chaîne — §5 quater.
        appel.resultat = ligne.toolUseResult;
      }
    }
  }

  return { appels, requetes, notifications, premier, dernier, modele, effort, interrompu };
}

// ------------------------------------------------------------------ assemblage du tout

function cheminSousAgents(cheminTranscript) {
  return path.join(
    path.dirname(cheminTranscript),
    path.basename(cheminTranscript, '.jsonl'),
    'subagents',
  );
}

async function listerSousAgents(cheminTranscript) {
  const dossier = cheminSousAgents(cheminTranscript);
  let entrees;
  try {
    entrees = await fsp.readdir(dossier);
  } catch {
    return []; // le dossier n'existe pas tant qu'aucun sous-agent n'a été lancé
  }
  const trouves = [];
  for (const nom of entrees) {
    if (!nom.startsWith('agent-') || !nom.endsWith('.jsonl')) continue;
    const agentId = nom.slice('agent-'.length, -'.jsonl'.length);
    let meta = {};
    try {
      meta = JSON.parse(await fsp.readFile(path.join(dossier, `agent-${agentId}.meta.json`), 'utf8'));
    } catch {
      // un sous-agent sans fiche reste affichable, avec moins d'informations
    }
    trouves.push({ agentId, meta, chemin: path.join(dossier, nom) });
  }
  return trouves;
}

/** L'état d'un agent, selon les trois fins possibles mesurées en §5 quater. */
function conclure({ appelParent, notification, interrompu, sessionVivante, dernierSigne }) {
  if (interrompu) {
    return { etat: 'interrompu', fin: appelParent?.fin ?? dernierSigne };
  }
  const resultat = appelParent?.resultat;
  const estObjet = resultat && typeof resultat === 'object';

  if (typeof resultat === 'string') {
    // « User rejected tool use » : une interruption vue du côté du parent.
    return { etat: 'interrompu', fin: appelParent.fin };
  }
  if (estObjet && resultat.status === 'async_launched') {
    // Agent d'arrière-plan : le tool_result marque le lancement, pas la fin.
    if (notification) return { etat: 'terminé', fin: notification.instant };
    return sessionVivante
      ? { etat: 'en cours', fin: null }
      : { etat: 'fin inconnue', fin: dernierSigne };
  }
  if (appelParent && appelParent.fin !== null) {
    return { etat: 'terminé', fin: appelParent.fin };
  }
  // Aucun marqueur : soit il travaille encore, soit sa session est morte sans rien écrire.
  return sessionVivante
    ? { etat: 'en cours', fin: null }
    : { etat: 'fin inconnue', fin: dernierSigne };
}

/**
 * Construit le déroulé complet d'une session.
 * `sessionVivante` vient de l'écran 1 : c'est la seule façon de distinguer un agent qui
 * travaille d'un agent tué net, qui n'écrit aucun marqueur (§5 quater).
 */
async function lireSession(cheminTranscript, { sessionVivante = false, nomSession = null } = {}) {
  const racine = await depouiller(cheminTranscript);
  const sousAgents = await listerSousAgents(cheminTranscript);

  // Tous les appels de tous les transcripts, pour retrouver celui qui a créé un agent
  // donné — un agent de profondeur 2 est créé depuis le transcript d'un sous-agent.
  const tousAppels = new Map(racine.appels);
  const depouilles = new Map();
  for (const sa of sousAgents) {
    const d = await depouiller(sa.chemin);
    depouilles.set(sa.agentId, d);
    for (const [id, appel] of d.appels) tousAppels.set(id, appel);
  }

  const notifications = new Map();
  for (const n of racine.notifications) notifications.set(n.agentId, n);

  const agents = [];

  // Un appel resté sans résultat dans une session qui ne tourne plus : elle a été coupée
  // net, l'agent racine n'a donc pas « terminé » — §5 quater.
  const appelEnSuspens = [...racine.appels.values()].some((a) => a.fin === null);
  const etatRacine = sessionVivante
    ? 'en cours'
    : (appelEnSuspens ? 'fin inconnue' : 'terminé');

  agents.push({
    id: 'racine',
    nom: nomSession || 'agent principal',
    type: null,
    profondeur: 0,
    parent: null,
    debut: racine.premier,
    fin: sessionVivante ? null : racine.dernier,
    etat: etatRacine,
    modele: racine.modele,
    effort: racine.effort,
    prompt: null,
    sortie: null,
    dureeMs: racine.premier !== null && racine.dernier !== null
      ? racine.dernier - racine.premier : null,
    jetons: null,
    outils: [...racine.appels.values()].map(nettoyerAppel),
  });

  for (const sa of sousAgents) {
    const d = depouilles.get(sa.agentId);
    const appelParent = sa.meta.toolUseId ? tousAppels.get(sa.meta.toolUseId) : null;
    const notification = notifications.get(sa.agentId) || null;
    const { etat, fin } = conclure({
      appelParent,
      notification,
      interrompu: d.interrompu,
      sessionVivante,
      dernierSigne: d.dernier,
    });

    const res = appelParent && typeof appelParent.resultat === 'object' ? appelParent.resultat : null;
    const debut = appelParent?.debut ?? d.premier;

    agents.push({
      id: sa.agentId,
      nom: sa.meta.description || sa.meta.agentType || sa.agentId.slice(0, 8),
      type: sa.meta.agentType || null,
      profondeur: sa.meta.spawnDepth ?? 1,
      // §5 ter : parentAgentId n'existe qu'à partir de la profondeur 2.
      parent: sa.meta.parentAgentId || 'racine',
      debut,
      fin,
      etat,
      modele: res?.resolvedModel || d.modele,
      effort: d.effort,
      prompt: tronquer(res?.prompt ?? appelParent?.entree?.prompt ?? ''),
      sortie: tronquer(res ? texteDe(res.content) : ''),
      dureeMs: res?.totalDurationMs ?? (fin !== null && debut !== null ? fin - debut : null),
      jetons: res?.totalTokens ?? null,
      arrierePlan: Boolean(appelParent?.entree?.run_in_background),
      outils: [...d.appels.values()].map(nettoyerAppel),
    });
  }

  // L'ordre de `readdir` n'a aucun sens : on classe par naissance, ce qui donne des voies
  // stables d'un rafraîchissement à l'autre.
  agents.sort((a, b) => (a.debut ?? 0) - (b.debut ?? 0));

  const bornes = agents.reduce((acc, a) => {
    if (a.debut !== null) acc.debut = Math.min(acc.debut, a.debut);
    const f = a.fin ?? a.debut;
    if (f !== null) acc.fin = Math.max(acc.fin, f);
    for (const o of a.outils) {
      if (o.debut !== null) acc.debut = Math.min(acc.debut, o.debut);
      if (o.fin !== null) acc.fin = Math.max(acc.fin, o.fin);
    }
    return acc;
  }, { debut: Infinity, fin: -Infinity });

  return {
    transcript: cheminTranscript,
    sessionVivante,
    debut: Number.isFinite(bornes.debut) ? bornes.debut : racine.premier,
    fin: Number.isFinite(bornes.fin) ? bornes.fin : racine.dernier,
    requetes: racine.requetes,
    agents,
  };
}

function nettoyerAppel(a) {
  return {
    id: a.id,
    nom: a.nom,
    debut: a.debut,
    fin: a.fin,
    dureeMs: a.debut !== null && a.fin !== null ? a.fin - a.debut : null,
    ok: a.ok,
    resume: a.resume,
  };
}

module.exports = { lireSession, cheminSousAgents };
