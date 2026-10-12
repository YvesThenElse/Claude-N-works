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
// Par appel d'outil on est bien plus avare : une session en compte des milliers, et tout
// garder ferait gonfler le modèle au-delà du raisonnable.
const LIMITE_APPEL = 700;

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

function tronquer(texte, limite = LIMITE_TEXTE) {
  if (typeof texte !== 'string') return '';
  return texte.length > limite ? texte.slice(0, limite) + '\n…' : texte;
}

/** Le texte d'un résultat d'outil, quelle que soit la forme qu'il a prise. */
function texteResultat(resultat) {
  if (resultat === null || resultat === undefined) return '';
  if (typeof resultat === 'string') return resultat;
  if (typeof resultat !== 'object') return String(resultat);
  // Un bloc tool_result porte parfois directement un tableau de blocs de texte.
  if (Array.isArray(resultat)) return texteDe(resultat);
  if (typeof resultat.stdout === 'string' || typeof resultat.stderr === 'string') {
    return [resultat.stdout, resultat.stderr].filter(Boolean).join('\n');
  }
  if (Array.isArray(resultat.content)) return texteDe(resultat.content);
  if (typeof resultat.content === 'string') return resultat.content;
  if (typeof resultat.file === 'object' && typeof resultat.file?.content === 'string') {
    return resultat.file.content;
  }
  try {
    return JSON.stringify(resultat);
  } catch {
    return '';
  }
}

/** L'entrée d'un outil, rendue lisible : la commande seule plutôt que tout l'objet. */
function texteEntree(nom, entree) {
  if (entree === null || entree === undefined) return '';
  if (typeof entree === 'string') return entree;
  if (nom === 'Bash' && typeof entree.command === 'string') return entree.command;
  if (nom === 'Skill') {
    return [entree.skill, entree.args].filter(Boolean).join('\n\n');
  }
  try {
    return JSON.stringify(entree, null, 2);
  } catch {
    return '';
  }
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

/** L'état d'un dépouillement qui n'a encore rien vu. */
function etatVide() {
  return {
    appels: new Map(), // id du tool_use -> appel
    requetes: [],
    notifications: [],
    premier: null,
    dernier: null,
    modele: null,
    effort: null,
    interrompu: false,
    derniereReponse: '',
    // La taille du contexte à chaque requête : c'est la somme des jetons d'entrée, de
    // lecture de cache et de création de cache. Elle monte jusqu'à saturer la fenêtre,
    // puis retombe d'un coup au compactage — mesuré : 996 455 puis 52 151.
    contexte: [],
    // Les instants où l'agent prend la parole. Sans eux, le temps qu'il passe à réfléchir
    // entre deux appels d'outils ressemblerait à de l'attente, alors qu'il travaille.
    paroles: [],
    compactages: [],
    reveils: [],      // les réveils de boucle vus du côté du système
    erreurs: [],      // les messages que Claude Code s'écrit à lui-même sur une panne
    skillsCharges: [],
  };
}

/**
 * Absorbe une ligne de transcript dans un état. Écrite pour être appelée ligne à ligne,
 * aussi bien sur un fichier entier que sur ce qui vient de s'y ajouter : c'est ce qui
 * permet au suivi d'une session vivante de ne pas tout relire (voir suivi.js).
 */
function avaler(etat, ligne) {
  const t = instant(ligne);
  if (t !== null) {
    if (etat.premier === null || t < etat.premier) etat.premier = t;
    if (etat.dernier === null || t > etat.dernier) etat.dernier = t;
  }

  if (ligne.type === 'system') {
    if (ligne.subtype === 'compact_boundary') {
      etat.compactages.push({ instant: t });
    } else if (ligne.subtype === 'scheduled_task_fire') {
      etat.reveils.push({ instant: t, texte: String(ligne.content || '').slice(0, 200) });
    }
    return;
  }

  if (ligne.type === 'attachment' && ligne.attachment?.type === 'invoked_skills') {
    for (const s of ligne.attachment.skills || []) {
      etat.skillsCharges.push({
        instant: t,
        nom: s.name,
        chemin: s.path || null,
        taille: typeof s.content === 'string' ? s.content.length : null,
        contenu: tronquer(s.content || ''),
      });
    }
    return;
  }

  if (ligne.type === 'assistant') {
    // Un message que Claude Code s'écrit lui-même sur une panne : « API Error: … ».
    // C'est la seule trace d'un agent qui échoue de lui-même, par opposition à un agent
    // interrompu de l'extérieur.
    if (ligne.message?.model === '<synthetic>') {
      etat.erreurs.push({ instant: t, texte: texteDe(ligne.message?.content).slice(0, 300) });
      return;
    }
    const u = ligne.message?.usage;
    if (u && typeof u === 'object') {
      const taille = (u.input_tokens || 0)
        + (u.cache_read_input_tokens || 0)
        + (u.cache_creation_input_tokens || 0);
      if (taille > 0 && t !== null) etat.contexte.push({ instant: t, jetons: taille });
    }
    if (ligne.message && ligne.message.model) etat.modele = ligne.message.model;
    if (ligne.effort) etat.effort = ligne.effort;
    if (t !== null) etat.paroles.push(t);
    const dit = texteDe(ligne.message?.content);
    if (dit.trim()) etat.derniereReponse = dit;
    for (const bloc of ligne.message?.content || []) {
      if (bloc.type !== 'tool_use') continue;
      etat.appels.set(bloc.id, {
        id: bloc.id,
        nom: bloc.name,
        debut: t,
        fin: null,
        ok: null,
        resume: resumerEntree(bloc.name, bloc.input),
        entree: bloc.input,
      });
    }
    return;
  }

  if (ligne.type !== 'user') return;

  const contenu = ligne.message?.content;
  const texte = texteDe(contenu);

  // Une notification de fin d'agent d'arrière-plan : §5 bis d'OBSERVATIONS-FORMAT.
  if (ligne.origin && ligne.origin.kind === 'task-notification') {
    const id = /<task-id>([^<]+)<\/task-id>/.exec(texte);
    const statut = /<status>([^<]+)<\/status>/.exec(texte);
    if (id) {
      etat.notifications.push({
        agentId: id[1], statut: statut ? statut[1] : null, instant: t,
      });
    }
    return;
  }

  // Une vraie requête d'Yves, et elle seule : §5 bis également.
  if (ligne.origin && ligne.origin.kind === 'human') {
    etat.requetes.push({ instant: t, texte: tronquer(texte) });
    return;
  }

  if (texte.startsWith('[Request interrupted by user')) etat.interrompu = true;

  if (!Array.isArray(contenu)) return;
  for (const bloc of contenu) {
    if (bloc.type !== 'tool_result') continue;
    const appel = etat.appels.get(bloc.tool_use_id);
    if (!appel) continue;
    appel.fin = t;
    // `is_error` vaut parfois null : on ne transforme pas une absence d'information en
    // succès, on la laisse inconnue.
    appel.ok = bloc.is_error === true ? false : (bloc.is_error === false ? true : null);
    // Attention : toolUseResult est tantôt un objet, tantôt une chaîne — §5 quater — et
    // surtout il est **absent des transcripts de sous-agents**, où le résultat ne vit que
    // dans le bloc tool_result lui-même.
    appel.resultat = ligne.toolUseResult;
    appel.resultatBloc = bloc.content;
  }
}

/** Dépouille un transcript entier, d'un coup. */
async function depouiller(chemin) {
  const etat = etatVide();
  for await (const { ligne } of lignesDe(chemin)) avaler(etat, ligne);
  return etat;
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
  const trouves = await listerSousAgents(cheminTranscript);
  const sousAgents = [];
  for (const sa of trouves) {
    sousAgents.push({ ...sa, etat: await depouiller(sa.chemin) });
  }
  return assembler({ cheminTranscript, racine, sousAgents, sessionVivante, nomSession });
}

/**
 * Assemble le déroulé à partir des états déjà dépouillés. Partagé par la lecture d'un
 * coup (ci-dessus) et par le suivi incrémental d'une session vivante : les deux doivent
 * produire exactement le même résultat, sans quoi l'écran changerait au rafraîchissement.
 */
function assembler({ cheminTranscript, racine, sousAgents, sessionVivante, nomSession }) {
  // Tous les appels de tous les transcripts, pour retrouver celui qui a créé un agent
  // donné — un agent de profondeur 2 est créé depuis le transcript d'un sous-agent.
  const tousAppels = new Map(racine.appels);
  const depouilles = new Map();
  for (const sa of sousAgents) {
    depouilles.set(sa.agentId, sa.etat);
    for (const [id, appel] of sa.etat.appels) tousAppels.set(id, appel);
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
    // L'agent racine ne « rend » rien : sa dernière réponse tient lieu de sortie.
    sortie: tronquer(racine.derniereReponse),
    dureeMs: racine.premier !== null && racine.dernier !== null
      ? racine.dernier - racine.premier : null,
    jetons: null,
    outils: [...racine.appels.values()].map(nettoyerAppel),
    boucles: construireBoucles(racine.appels, 'racine', racine.reveils,
      [racine.premier, ...racine.requetes.map((r) => r.instant)]),
    contexte: racine.contexte,
    paroles: racine.paroles,
    compactages: racine.compactages,
    erreurs: racine.erreurs,
    skillsCharges: racine.skillsCharges,
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
      // Un agent de profondeur 2 n'a pas de résultat côté parent : son transcript ne
      // porte pas toolUseResult. Sa dernière réponse fait alors office de sortie.
      sortie: tronquer(res ? texteDe(res.content) : d.derniereReponse),
      dureeMs: res?.totalDurationMs ?? (fin !== null && debut !== null ? fin - debut : null),
      jetons: res?.totalTokens ?? null,
      compteurs: res?.toolStats ?? null,
      boucles: construireBoucles(d.appels, sa.agentId, d.reveils,
        [d.premier, ...d.requetes.map((r) => r.instant)]),
      contexte: d.contexte,
      paroles: d.paroles,
      compactages: d.compactages,
      erreurs: d.erreurs,
      skillsCharges: d.skillsCharges,
      statutBrut: typeof appelParent?.resultat === 'string'
        ? appelParent.resultat
        : (res?.status ?? null),
      arrierePlan: Boolean(appelParent?.entree?.run_in_background),
      outils: [...d.appels.values()].map(nettoyerAppel),
    });
  }

  // La voie d'attente, par agent. L'instant présent sert de borne quand la session tourne
  // encore : une attente en cours n'a pas de fin.
  const maintenant = Date.now();
  for (const a of agents) {
    a.requetesVues = a.id === 'racine' ? racine.requetes.map((r) => r.instant) : [];
    a.attentes = construireAttentes(a, bornesFin(a, racine), sessionVivante, maintenant);
    delete a.requetesVues;
  }

  // Un agent naît parfois pendant une itération de boucle — et s'il a lui-même des
  // sous-agents, eux aussi. Chacun est rattaché à l'itération dont la fenêtre contient sa
  // naissance, quelle que soit sa profondeur : c'est la seule façon de répondre à « ce
  // sous-agent, il est né au tour de boucle numéro combien ? ».
  const toutesBoucles = [];
  for (const a of agents) for (const b of a.boucles || []) toutesBoucles.push({ b, agent: a });
  for (const a of agents) {
    if (a.id === 'racine' || a.debut === null) continue;
    for (const { b } of toutesBoucles) {
      const rang = b.iterations.findIndex(
        (it) => a.debut >= it.depuis && a.debut <= it.jusqua);
      if (rang < 0) continue;
      a.neDansBoucle = { boucle: b.id, rang, total: b.iterations.length };
      const it = b.iterations[rang];
      if (!it.agents) it.agents = [];
      it.agents.push({ id: a.id, nom: a.nom, profondeur: a.profondeur, debut: a.debut });
      break;
    }
  }

  // Dans chaque itération, les agents se lisent dans l'ordre où ils sont nés.
  for (const { b } of toutesBoucles) {
    for (const it of b.iterations) {
      if (it.agents) it.agents.sort((x, y) => (x.debut ?? 0) - (y.debut ?? 0));
    }
  }

  // Chaque réveil porte le numéro de sa boucle et son rang, pour qu'un clic sur la marque
  // ouvre directement la bonne itération.
  for (const a of agents) {
    const parAppel = new Map();
    for (const b of a.boucles || []) {
      b.iterations.forEach((it, rang) => parAppel.set(it.idAppel, { boucle: b.id, rang }));
      if (b.idSkill) parAppel.set(b.idSkill, { boucle: b.id, rang: -1 });
    }
    for (const o of a.outils) {
      const lien = parAppel.get(o.id);
      if (lien) { o.boucle = lien.boucle; o.rang = lien.rang; }
    }
  }

  // L'ordre de `readdir` n'a aucun sens. Deux règles : les frères et sœurs se classent par
  // naissance, et un enfant suit immédiatement son parent — le §5 du cahier des charges
  // demande que la voie d'un sous-agent soit sous celle de son parent, pas plus bas.
  agents.sort((a, b) => (a.debut ?? 0) - (b.debut ?? 0));
  const enfantsDe = new Map();
  for (const a of agents) {
    if (a.id === 'racine') continue;
    const cle = a.parent || 'racine';
    if (!enfantsDe.has(cle)) enfantsDe.set(cle, []);
    enfantsDe.get(cle).push(a);
  }
  const ordonnes = [];
  const descendre = (a) => {
    ordonnes.push(a);
    for (const e of enfantsDe.get(a.id) || []) descendre(e);
  };
  descendre(agents.find((a) => a.id === 'racine'));
  // Un agent dont le parent n'a pas été retrouvé ne doit pas disparaître pour autant.
  for (const a of agents) if (!ordonnes.includes(a)) ordonnes.push(a);
  agents.length = 0;
  agents.push(...ordonnes);

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

/**
 * Les boucles d'un agent — §6.3 du cahier des charges.
 *
 * Une boucle `/loop` en allure libre ne laisse pas toujours d'acte de naissance : sur les
 * dix boucles de la session Litanie, trois seulement commencent par un `tool_use` `Skill`.
 * Ce qui est constant, c'est leur mort : un `ScheduleWakeup` portant `stop: true`. On
 * groupe donc les réveils en suites délimitées par ces arrêts, et on rattache le `Skill`
 * d'ouverture quand il y en a un. À défaut, la consigne se lit dans le champ `prompt` des
 * réveils, qui rejoue l'entrée `/loop` telle quelle.
 */
function construireBoucles(appels, idAgent, reveils = [], departsPossibles = []) {
  const suite = [...appels.values()]
    .filter((a) => a.nom === 'Skill' || a.nom === 'ScheduleWakeup')
    .sort((x, y) => (x.debut ?? 0) - (y.debut ?? 0));

  const boucles = [];
  let courante = null;
  let skillEnAttente = null;
  // Une boucle ne peut pas commencer avant que la précédente se soit arrêtée. Sans cette
  // borne, la remontée ci-dessous faisait démarrer une boucle vingt heures avant la fin
  // de celle d'avant — mesuré sur la session Litanie.
  let finPrecedente = null;

  // Une boucle ouverte sans appel de skill n'a pas d'instant de naissance évident : son
  // premier réveil arrive après coup. On remonte alors au dernier point de départ connu
  // qui le précède — une requête d'Yves, ou le début de la session — sans quoi la fenêtre
  // de la première itération serait vide et les agents qui y sont nés passeraient à la
  // trappe.
  const remonter = (instant) => {
    const avant = departsPossibles.filter((d) => d !== null && d <= instant);
    const choisi = avant.length ? Math.max(...avant) : instant;
    return finPrecedente === null ? choisi : Math.max(choisi, finPrecedente);
  };

  const ouvrir = (depart) => {
    courante = {
      id: idAgent + '-boucle-' + boucles.length,
      agent: idAgent,
      consigne: '',
      source: null,
      debut: remonter(depart),
      fin: null,
      etat: 'en cours',
      iterations: [],
    };
    if (skillEnAttente) {
      courante.consigne = tronquer(skillEnAttente.entree?.args || '');
      courante.source = 'skill';
      courante.debut = skillEnAttente.debut ?? depart;
      courante.idSkill = skillEnAttente.id;
      skillEnAttente = null;
    }
    boucles.push(courante);
  };

  for (const a of suite) {
    if (a.nom === 'Skill') {
      if (a.entree?.skill === 'loop') skillEnAttente = a;
      continue;
    }
    const e = a.entree || {};
    if (!courante) ouvrir(a.debut);
    // Un arrêt ferme la boucle, mais le passage qui l'a précédé a bel et bien eu lieu :
    // il compte comme itération, marquée comme celle qui a décidé d'arrêter.
    courante.iterations.push({
      instant: a.debut,
      noop: e.noop === true,
      arret: e.stop === true,
      raison: typeof e.reason === 'string' ? e.reason : null,
      delaiS: typeof e.delaySeconds === 'number' ? e.delaySeconds : null,
      idAppel: a.id,
    });
    if (e.stop === true) {
      courante.fin = a.debut;
      courante.etat = 'arrêtée';
      finPrecedente = a.debut;
      courante = null;
      continue;
    }
    // Le prompt rejoué porte la consigne, utile quand aucun Skill n'a ouvert la boucle.
    if (!courante.consigne && typeof e.prompt === 'string' && e.prompt !== 'null') {
      courante.consigne = tronquer(e.prompt);
      courante.source = 'réveil';
    }
  }

  // Le délai demandé n'est pas le délai subi : `ScheduleWakeup` dit quand on voudrait être
  // réveillé, `scheduled_task_fire` dit quand on l'a été. On rapproche chaque itération du
  // premier réveil système qui la suit.
  const tries = [...reveils].sort((x, y) => (x.instant ?? 0) - (y.instant ?? 0));
  for (const b of boucles) {
    for (const it of b.iterations) {
      const suivant = tries.find((r) => r.instant > it.instant);
      if (suivant) {
        it.reveilReel = suivant.instant;
        it.attenteMs = suivant.instant - it.instant;
      }
    }
  }

  for (const b of boucles) {
    if (b.fin === null && b.iterations.length) {
      b.fin = b.iterations[b.iterations.length - 1].instant;
    }
    // Combien de passages de suite n'ont rien produit, à la fin : le signe qu'une boucle
    // tourne à vide.
    let sansEffet = 0;
    for (let i = b.iterations.length - 1; i >= 0 && b.iterations[i].noop; i -= 1) sansEffet += 1;
    b.sansEffetALaFin = sansEffet;
    b.sansEffet = b.iterations.filter((i) => i.noop).length;
    // La fenêtre de chaque itération : de la fin de la précédente à son propre réveil.
    // C'est ce qui permet de dire quels agents sont nés pendant laquelle.
    let bord = b.debut;
    for (const it of b.iterations) {
      it.depuis = bord;
      it.jusqua = it.instant;
      bord = it.instant;
    }
  }
  return boucles.filter((b) => b.iterations.length > 0);
}

// En deçà d'une demi-minute sans rien, ce n'est pas de l'attente : c'est le temps normal
// d'un tour de boucle de l'agent.
const SEUIL_ATTENTE_MS = 30000;

/**
 * Les moments où le système ne travaille pas mais patiente. Trois formes, mesurées sur les
 * transcripts (§5 octies d'OBSERVATIONS-FORMAT.md) :
 *
 *   `question`   — un `AskUserQuestion` posé et pas encore répondu ;
 *   `sommeil`    — une boucle qui dort entre deux tours, après un `ScheduleWakeup` ;
 *   `inoccupée`  — le tour s'est achevé et plus personne n'a repris la main.
 *
 * Les deux dernières se lisent comme des intervalles sans le moindre événement. La
 * première est au contraire un appel d'outil bien présent, dont la durée *est* l'attente :
 * elle est donc traitée à part, et les trous qu'elle recouvre ne sont pas comptés deux
 * fois.
 */
function construireAttentes(agent, finSession, sessionVivante, maintenant) {
  const attentes = [];
  const appels = agent.outils
    .filter((o) => o.debut !== null)
    .sort((x, y) => x.debut - y.debut);

  for (const o of appels) {
    if (o.nom !== 'AskUserQuestion') continue;
    attentes.push({
      debut: o.debut,
      fin: o.fin,
      genre: 'question',
      detail: o.resume || 'une question posée à l’utilisateur',
      ouverte: o.fin === null,
    });
  }
  const couvertParUneQuestion = (a, b) => attentes.some(
    (q) => q.genre === 'question' && q.debut <= a && (q.fin ?? Infinity) >= b);

  // Les intervalles sans aucun événement.
  const instants = [];
  for (const o of appels) {
    instants.push(o.debut);
    if (o.fin !== null) instants.push(o.fin);
  }
  for (const r of agent.requetesVues || []) instants.push(r);
  for (const p of agent.paroles || []) instants.push(p);
  instants.sort((x, y) => x - y);

  let precedent = agent.debut;
  for (const t of instants) {
    if (precedent !== null && t - precedent > SEUIL_ATTENTE_MS
        && !couvertParUneQuestion(precedent, t)) {
      const avant = appels.filter((o) => o.debut <= precedent).pop();
      attentes.push({
        debut: precedent,
        fin: t,
        genre: avant && avant.nom === 'ScheduleWakeup' ? 'sommeil' : 'inoccupée',
        detail: avant ? 'après un ' + avant.nom : 'avant toute action',
        ouverte: false,
      });
    }
    precedent = precedent === null ? t : Math.max(precedent, t);
  }

  // Et si la session tourne encore sans rien faire depuis un moment, l'attente dure.
  const dernier = instants.length ? instants[instants.length - 1] : agent.debut;
  if (sessionVivante && dernier !== null && maintenant - dernier > SEUIL_ATTENTE_MS
      && !couvertParUneQuestion(dernier, maintenant)) {
    const avant = appels.filter((o) => o.debut <= dernier).pop();
    attentes.push({
      debut: dernier,
      fin: null,
      genre: avant && avant.nom === 'ScheduleWakeup' ? 'sommeil' : 'inoccupée',
      detail: avant ? 'après un ' + avant.nom : 'en attente',
      ouverte: true,
    });
  }

  attentes.sort((x, y) => x.debut - y.debut);
  for (const a of attentes) {
    a.dureeMs = (a.fin ?? (sessionVivante ? maintenant : finSession)) - a.debut;
  }
  return attentes;
}

/** La borne de fin à prendre pour un agent dont la fin n'est pas connue. */
function bornesFin(agent, racine) {
  return agent.fin ?? racine.dernier ?? agent.debut;
}

function nettoyerAppel(a) {
  const entree = texteEntree(a.nom, a.entree);
  const sortie = a.resultat !== undefined && a.resultat !== null
    ? texteResultat(a.resultat)
    : texteResultat(a.resultatBloc);
  return {
    id: a.id,
    nom: a.nom,
    debut: a.debut,
    fin: a.fin,
    dureeMs: a.debut !== null && a.fin !== null ? a.fin - a.debut : null,
    ok: a.ok,
    resume: a.resume,
    // `tronque` dit franchement que la carte ne montre pas tout, plutôt que de laisser
    // croire que l'appel tenait en sept cents caractères.
    entree: tronquer(entree, LIMITE_APPEL),
    sortie: tronquer(sortie, LIMITE_APPEL),
    tronque: entree.length > LIMITE_APPEL || sortie.length > LIMITE_APPEL,
    // Un appel de skill porte son nom à part : il mérite sa propre carte (§6.2).
    skill: a.nom === 'Skill' ? (a.entree?.skill || null) : null,
  };
}

module.exports = { lireSession, assembler, etatVide, avaler, cheminSousAgents };
