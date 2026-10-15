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

// Rien n'est tronqué. La mesure a tranché : sur le plus gros transcript de la machine,
// 37 Mo et 1717 appels d'outils, tout garder porte le modèle de 4,7 à 8,6 Mo — et une
// limite à 700 caractères amputait 44 % des entrées d'outils et 32 % de leurs résultats,
// c'est-à-dire précisément ce qu'on vient lire. Le pire contenu observé fait 27 176
// caractères ; aucun ne dépasse cent mille.
const LIMITE_TEXTE = Infinity;
const LIMITE_APPEL = Infinity;
const LIMITE_REQUETE = Infinity;

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
  if (!Number.isFinite(limite) || texte.length <= limite) return texte;
  return texte.slice(0, limite) + '\n…';
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

/**
 * Ce qu'une pièce jointe ajoute **réellement** au contexte.
 *
 * Compter l'enregistrement entier serait un mensonge : un `hook_success` pèse 3 226
 * caractères en moyenne et douze millions au total sur la session `819d3fef`, presque
 * uniquement parce qu'il recopie la commande du hook — qui n'est jamais envoyée au
 * modèle. On ne retient donc que les champs dont on sait qu'ils sont injectés.
 */
function tailleInjectee(att) {
  if (!att || typeof att !== 'object') return 0;
  let n = 0;
  if (typeof att.text === 'string') n += att.text.length;
  if (typeof att.content === 'string') n += att.content.length;
  if (Array.isArray(att.skills)) {
    for (const s of att.skills) if (typeof s.content === 'string') n += s.content.length;
  }
  if (Array.isArray(att.systemPrompt)) {
    for (const s of att.systemPrompt) if (typeof s === 'string') n += s.length;
  }
  if (Array.isArray(att.addedBlocks)) {
    for (const b of att.addedBlocks) if (typeof b === 'string') n += b.length;
  }
  if (att.file && typeof att.file.content === 'string') n += att.file.content.length;
  return n;
}

/**
 * Cette ligne `user` est-elle une consigne donnée à la session ?
 *
 * Deux portes d'entrée, mesurées sur les 125 transcrits de la machine.
 *
 * ① La saisie interactive porte `origin.kind === 'human'` — 311 lignes, toutes en
 *    `promptSource` `queued` ou `typed`.
 * ② Le lancement **non interactif** — `claude -p`, le SDK — n'écrit aucun `origin` mais un
 *    `promptSource: "sdk"`. Les écarter faisait afficher « 0 requête » aux six sessions du
 *    kit cuisine, qu'on avait pourtant bel et bien commandées, et comptait leur consigne
 *    en « système » dans la composition du contexte.
 *
 * ⚠️ Deux pièges, mesurés, et c'est pourquoi le second cas est si étroit.
 *
 * - **Ne jamais lire ce test comme « pas d'`origin` »** : 266 lignes `isMeta` (les
 *   réinvocations de `/loop`) et 10 résumés de compactage sont aussi sans `origin`, et ce
 *   ne sont pas des consignes.
 * - **Le contenu doit être une chaîne.** 24 lignes `promptSource: "sdk"` portent un
 *   tableau de blocs : ce sont les transcrits des worktrees Cline, où le client réinjecte
 *   à chaque tour son invite système et le rejeu de ses résultats d'outils — 41 343
 *   caractères pour l'une d'elles. Ce n'est pas une consigne d'Yves, et la compter en
 *   ferait une fausse requête **et** une fausse part humaine du contexte. Une consigne
 *   entrée par la ligne de commande est du texte simple ; on s'en tient là.
 */
function estUneConsigne(ligne) {
  if (ligne.origin) return ligne.origin.kind === 'human';
  return Boolean(ligne.promptSource)
    && typeof ligne.message?.content === 'string'
    && !ligne.isMeta
    && !ligne.isCompactSummary;
}

/**
 * Ce qui a déclenché un appel au modèle : la nature du dernier enregistrement qui le
 * précède. C'est la seule « entrée » que le transcript donne — le prompt complet envoyé à
 * l'API n'y figure pas.
 */
function libelleDeclencheur(etat, ligne) {
  if (ligne.type === 'system') {
    if (ligne.subtype === 'scheduled_task_fire') return 'le réveil d’une boucle';
    return 'un événement système (' + (ligne.subtype || '?') + ')';
  }
  if (ligne.type === 'attachment') return null; // trop anodin pour écraser le vrai motif
  if (ligne.type !== 'user') return null;
  if (estUneConsigne(ligne)) return 'une requête d’Yves';
  // Une notification de tâche couvre aussi bien un sous-agent d'arrière-plan qu'une
  // commande lancée en arrière-plan : la session `819d3fef` en compte 77 sans avoir le
  // moindre sous-agent.
  if (ligne.origin?.kind === 'task-notification') return 'la fin d’une tâche d’arrière-plan';
  const contenu = ligne.message?.content;
  if (Array.isArray(contenu)) {
    for (const bloc of contenu) {
      if (bloc.type !== 'tool_result') continue;
      const appel = etat.appels.get(bloc.tool_use_id);
      return 'le résultat de ' + (appel ? appel.nom : 'un outil')
        + (appel && appel.resume ? ' — ' + appel.resume.slice(0, 70) : '');
    }
  }
  const texte = texteDe(contenu);
  if (texte.startsWith('[Request interrupted')) return 'une interruption';
  return texte ? 'un message : ' + texte.slice(0, 70) : null;
}

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
    // Les tours : Claude Code écrit lui-même la durée de chacun à sa fin. C'est l'unité
    // naturelle de l'échange — de ce qui réveille l'agent jusqu'à ce qu'il rende la main —
    // et la seule mesure exacte du temps où la machine travaille.
    tours: [],
    // L'outillage offert à l'agent et ses changements. Les permissions proprement dites
    // sont presque toujours vides — 2 enregistrements non vides sur 230 dans tout le
    // corpus — mais le catalogue d'outils, lui, bouge : il s'ouvre au démarrage, s'enrichit
    // quand ToolSearch remonte des outils, et se restreint quand un skill l'impose.
    outillage: [],
    outilsOfferts: new Set(),
    // De quoi le contexte est fait, à l'instant où il est envoyé. On tient les totaux au
    // fil de la lecture et on en prend un instantané à chaque appel : reconstruire tout
    // l'historique pour chacun des deux mille appels coûterait un carré.
    composition: { humain: 0, modele: 0, outilEntree: 0, outilSortie: 0, systeme: 0, n: 0 },
    // Un appel au modèle, vu depuis le transcript : l'instant du dernier événement qui le
    // précède, celui du premier bloc de réponse écrit, et celui du dernier.
    requetesModele: [],
    requetesVues_: new Map(),
    dernierAvantReponse: null,
    dernierLibelle: null,
    compactages: [],
    reveils: [],      // les réveils de boucle vus du côté du système
    erreurs: [],      // les messages que Claude Code s'écrit à lui-même sur une panne
    skillsCharges: [],
    // Les hooks. Ils décident de ce qui a le droit de se produire, et ils étaient
    // entièrement invisibles alors que le transcript les écrit depuis toujours : 32 609
    // enregistrements sur cette machine. Chacun dit quel hook, sur quel événement, pour
    // quel appel d'outil, combien de temps il a pris et comment il s'est terminé.
    hooks: [],
    // Le répertoire de travail. Ce n'est pas une propriété fixe de la session : il change
    // en cours de route dans 44 fichiers sur 194, jusqu'à six valeurs pour une seule
    // session, et 7 sous-agents sur 69 travaillent ailleurs que leur parent.
    repertoire: null,
    branche: null,
    repertoires: [],            // les répertoires DISTINCTS, avec le temps passé dans chacun
    changementsDeRepertoire: 0, // le compte brut, qui dit le bruit
    // Les tâches d'arrière-plan. Une commande lancée avec `run_in_background` continue
    // pendant que l'agent fait autre chose, et rend compte plus tard. Mesuré sur la
    // machine : 508 lancements, dont 501 annoncent leur identifiant dans leur résultat,
    // et 456 ont aussi leur notification de fin — le cycle est donc reconstructible.
    taches: [],
    tachesParId: new Map(),
    finsDeTache: new Map(),     // identifiant -> { instant, statut }, la plus précoce
    evenementsDeTache: [],      // les consultations (TaskOutput) et les arrêts (TaskStop)
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

  // Le répertoire de travail, et la branche git avec lui. Ce n'est pas une propriété fixe
  // qu'on pourrait lire une fois : mesuré sur les 194 transcripts de la machine, il change
  // en cours de session dans 44 d'entre eux, et 7 sous-agents sur 69 travaillent ailleurs
  // que leur parent.
  //
  // ⚠️ Mais un changement n'est PAS un événement à marquer. Mesuré sur la session
  // `454ef787` : **188 changements pour 6 répertoires distincts**. Le `cwd` oscille entre
  // un dossier et son sous-dossier à presque chaque appel — ce n'est pas un déplacement
  // voulu, et en faire des marques noyait les douze vraies marques d'outillage sous 187
  // marques de bruit. On retient donc les répertoires **distincts**, avec le compte de
  // lignes passées dans chacun.
  if (ligne.cwd) {
    if (ligne.cwd !== etat.repertoire) etat.changementsDeRepertoire += 1;
    etat.repertoire = ligne.cwd;
    const vu = etat.repertoires.find((r) => r.chemin === ligne.cwd);
    if (vu) { vu.lignes += 1; vu.dernier = t; }
    else etat.repertoires.push({ chemin: ligne.cwd, premier: t, dernier: t, lignes: 1 });
  }
  if (ligne.gitBranch) etat.branche = ligne.gitBranch;

  // Tout enregistrement qui n'est pas une réponse du modèle marque le moment où l'on s'est
  // mis à l'attendre. Un réveil de boucle en fait partie : sans lui, la latence d'un tour
  // de boucle engloberait tout le sommeil.
  if (ligne.type !== 'assistant' && t !== null) {
    etat.dernierAvantReponse = t;
    // Une pièce jointe compte comme instant mais ne dit rien du motif : elle ne doit pas
    // effacer le libellé du vrai déclencheur, qui la précède de quelques millisecondes.
    const motif = libelleDeclencheur(etat, ligne);
    if (motif) etat.dernierLibelle = motif;
  }

  // ⚠️ Une notification de fin de tâche arrive sous TROIS formes, et n'en lire qu'une
  // perdait la moitié des fins. Mesuré sur une session de 131 tâches : 327 lignes
  // portent un `<task-id>`, réparties en `queue-operation` (la mise en file, au moment
  // où la tâche finit), `attachment`/`queued_command` (elle attend d'être remise) et
  // `user` avec `origin.kind: task-notification` (elle est remise à l'agent). Seule la
  // dernière était lue, et seules 66 fins sur 128 appariables étaient trouvées.
  //
  // On retient la **plus précoce** : la mise en file dit quand la tâche a fini, la
  // remise dit seulement quand l'agent l'a appris — l'écart est de quelques dizaines de
  // millisecondes quand il est libre, et de tout un tour quand il ne l'est pas.
  if (t !== null) {
    const brut = typeof ligne.content === 'string' ? ligne.content
      : (ligne.attachment && typeof ligne.attachment.prompt === 'string') ? ligne.attachment.prompt
        : (typeof ligne.message?.content === 'string' ? ligne.message.content : '');
    if (brut && brut.includes('<task-id>')) {
      const id = /<task-id>([^<]+)<\/task-id>/.exec(brut);
      const st = /<status>([^<]+)<\/status>/.exec(brut);
      if (id) {
        const vu = etat.finsDeTache.get(id[1]);
        if (!vu || t < vu.instant) {
          etat.finsDeTache.set(id[1], { instant: t, statut: st ? st[1] : null });
        }
      }
    }
  }

  if (ligne.type === 'system') {
    if (ligne.subtype === 'compact_boundary') {
      etat.compactages.push({ instant: t });
      // Un compactage remet le contexte à zéro : la composition repart du résumé.
      etat.composition = { humain: 0, modele: 0, outilEntree: 0, outilSortie: 0, systeme: 0, n: 0 };
    } else if (ligne.subtype === 'turn_duration') {
      if (t !== null && typeof ligne.durationMs === 'number') {
        etat.tours.push({ debut: t - ligne.durationMs, fin: t, dureeMs: ligne.durationMs });
      }
    } else if (ligne.subtype === 'scheduled_task_fire') {
      etat.reveils.push({ instant: t, texte: String(ligne.content || '').slice(0, 200) });
    }
    return;
  }

  if (ligne.type === 'attachment') {
    const taille = tailleInjectee(ligne.attachment);
    if (taille > 0) { etat.composition.systeme += taille; etat.composition.n += 1; }
  }

  // Les hooks. Trois formes mesurées sur la machine : `hook_success` (32 609),
  // `hook_system_message` (5 — et celle-là **injecte du texte** dans la conversation) et
  // `hook_non_blocking_error` (1). Chacune porte le `toolUseID` de l'appel qu'elle
  // encadre, ce qui les rattache directement à la ligne du temps.
  //
  // ⚠️ BLANC : aucun hook **bloquant** n'a jamais été observé ici — les 32 609 codes de
  // sortie valent 0. On ne sait donc pas ce qu'écrit un hook qui refuse, et l'application
  // ne doit rien prétendre à son sujet.
  if (ligne.type === 'attachment' && String(ligne.attachment?.type || '').startsWith('hook')) {
    const att = ligne.attachment;
    const rate = att.type === 'hook_non_blocking_error' || (att.exitCode != null && att.exitCode !== 0);
    etat.hooks.push({
      instant: t,
      nom: att.hookName || att.hookEvent || 'hook',
      evenement: att.hookEvent || null,
      dureeMs: typeof att.durationMs === 'number' ? att.durationMs : null,
      code: att.exitCode != null ? att.exitCode : null,
      idAppel: att.toolUseID || null,
      // Un hook qui parle : son `content` entre vraiment dans la conversation.
      injecte: (att.content || '').trim() ? att.content : null,
      sortie: (att.stdout || '').trim() || null,
      erreur: (att.stderr || '').trim() || null,
      commande: att.command || null,
      ok: !rate,
    });
  }

  if (ligne.type === 'attachment') {
    const att = ligne.attachment;
    if (att.type === 'deferred_tools_delta') {
      const ajout = att.addedNames || [];
      const retire = att.removedNames || [];
      const remonte = att.surfacedNames || [];
      const rendu = att.readdedNames || [];
      for (const n of ajout.concat(rendu)) etat.outilsOfferts.add(n);
      for (const n of retire) etat.outilsOfferts.delete(n);
      if (ajout.length || retire.length || remonte.length || rendu.length) {
        etat.outillage.push({
          instant: t,
          genre: remonte.length ? 'remontés' : (retire.length ? 'retirés' : 'offerts'),
          ajoutes: ajout.length,
          retires: retire.length,
          remontes: remonte,
          total: etat.outilsOfferts.size,
          noms: (remonte.length ? remonte : ajout).slice(0, 200),
        });
      }
    } else if (att.type === 'command_permissions' && (att.allowedTools || []).length) {
      etat.outillage.push({
        instant: t,
        genre: 'restreint',
        noms: att.allowedTools,
        total: att.allowedTools.length,
      });
    } else if (att.type === 'mcp_instructions_delta' && (att.addedNames || []).length) {
      etat.outillage.push({
        instant: t,
        genre: 'serveurs',
        noms: att.addedNames,
        total: etat.outilsOfferts.size,
      });
    }
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
    // Ce que le modèle vient d'ajouter au contexte : ses paroles, sa réflexion, et les
    // appels d'outils qu'il écrit.
    for (const bloc of ligne.message?.content || []) {
      if (bloc.type === 'text') etat.composition.modele += (bloc.text || '').length;
      else if (bloc.type === 'thinking') etat.composition.modele += (bloc.thinking || '').length;
      else if (bloc.type === 'tool_use') {
        etat.composition.outilEntree += JSON.stringify(bloc.input || {}).length;
      }
    }
    etat.composition.n += 1;
    const rid = ligne.requestId;
    if (rid && t !== null && ligne.message?.model) {
      let r = etat.requetesVues_.get(rid);
      if (!r) {
        r = {
          id: rid,
          modele: ligne.message.model,
          appel: etat.dernierAvantReponse,
          declencheur: etat.dernierLibelle,
          debut: t,
          fin: t,
          blocs: 0,
          dit: '',
          outils: [],
          composition: { ...etat.composition },
        };
        etat.requetesVues_.set(rid, r);
        etat.requetesModele.push(r);
      }
      r.fin = Math.max(r.fin, t);
      r.blocs += 1;
      if (ligne.message.stop_reason) r.arret = ligne.message.stop_reason;
      // L'usage est répété à l'identique sur chaque enregistrement d'une même requête :
      // on garde le dernier vu.
      if (u && typeof u === 'object') r.usage = u;
      for (const bloc of ligne.message?.content || []) {
        if (bloc.type === 'tool_use') r.outils.push(bloc.name);
        else if (bloc.type === 'text' && bloc.text) r.dit += (r.dit ? '\n' : '') + bloc.text;
        else if (bloc.type === 'thinking') r.reflechi = true;
      }
    }
    const dit = texteDe(ligne.message?.content);
    if (dit.trim()) etat.derniereReponse = dit;
    for (const bloc of ligne.message?.content || []) {
      if (bloc.type !== 'tool_use') continue;
      if ((bloc.name === 'TaskOutput' || bloc.name === 'TaskStop')
          && (bloc.input || {}).task_id) {
        etat.evenementsDeTache.push({
          idTache: bloc.input.task_id, instant: t,
          genre: bloc.name === 'TaskStop' ? 'arrêt' : 'consultation',
        });
      }
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
  if (ligne.permissionMode && ligne.permissionMode !== etat.modePermission) {
    if (etat.modePermission !== undefined) {
      etat.outillage.push({
        instant: t, genre: 'mode', noms: [ligne.permissionMode],
        detail: 'de « ' + etat.modePermission + ' » à « ' + ligne.permissionMode + ' »',
      });
    }
    etat.modePermission = ligne.permissionMode;
  }

  // Une consigne donnée à la session, par quelque bout qu'elle soit entrée — voir
  // `estUneConsigne` : les écarter faisait afficher « 0 requête » à une session qu'on
  // avait bel et bien commandée, et comptait sa consigne en « système ».
  if (estUneConsigne(ligne)) {
    etat.requetes.push({ instant: t, texte: tronquer(texte) });
    etat.composition.humain += texte.length;
    etat.composition.n += 1;
    return;
  }

  if (texte.startsWith('[Request interrupted by user')) etat.interrompu = true;

  if (!Array.isArray(contenu)) {
    if (texte) { etat.composition.systeme += texte.length; etat.composition.n += 1; }
    return;
  }
  for (const bloc of contenu) {
    if (bloc.type === 'tool_result') {
      etat.composition.outilSortie += typeof bloc.content === 'string'
        ? bloc.content.length
        : JSON.stringify(bloc.content || '').length;
      etat.composition.n += 1;
    }
    if (bloc.type !== 'tool_result') continue;
    const appel = etat.appels.get(bloc.tool_use_id);
    if (!appel) continue;
    // La naissance d'une tâche d'arrière-plan : son identifiant n'est écrit nulle part
    // ailleurs que dans la phrase que Claude Code rend en réponse au lancement.
    if (appel.entree?.run_in_background) {
      const brut = typeof bloc.content === 'string'
        ? bloc.content
        : texteResultat(bloc.content);
      const m = /background with ID: ([A-Za-z0-9]+)/.exec(brut || '');
      if (m && !etat.tachesParId.has(m[1])) {
        const tache = {
          id: m[1],
          debut: appel.debut,
          fin: null,
          statut: null,
          commande: resumerEntree(appel.nom, appel.entree),
          outil: appel.nom,
          idAppel: appel.id,
        };
        etat.taches.push(tache);
        etat.tachesParId.set(m[1], tache);
      }
    }
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
function conclure({ appelParent, notification, interrompu, sessionVivante, dernierSigne,
                   appelEnSuspens = false }) {
  if (interrompu) {
    return { etat: 'interrompu', fin: appelParent?.fin ?? dernierSigne };
  }
  const resultat = appelParent?.resultat;
  const estObjet = resultat && typeof resultat === 'object';

  if (typeof resultat === 'string') {
    // « User rejected tool use » : une interruption vue du côté du parent.
    return { etat: 'interrompu', fin: appelParent.fin };
  }
  // Deux formes de lancement en arrière-plan, et il faut les deux :
  //   - `status: "async_launched"` quand on a demandé `run_in_background: true` ;
  //   - un simple texte « Async agent launched successfully » quand un sous-agent en
  //     lance un autre — à partir de la profondeur 2, c'est toujours asynchrone, sans
  //     que personne ne l'ait demandé. Mesuré : le parent rend 92 ms après l'appel
  //     pendant que l'enfant travaille encore une minute et demie.
  // Le texte vit dans le bloc tool_result, pas dans toolUseResult, qui est absent des
  // transcripts de sous-agents : c'est justement là que le cas se produit.
  const lanceEnFond = (estObjet && resultat.status === 'async_launched')
    || /^Async agent launched successfully/.test(
      texteResultat(resultat ?? appelParent?.resultatBloc).trim());
  if (lanceEnFond) {
    // Le tool_result marque le lancement, pas la fin.
    if (notification) return { etat: 'terminé', fin: notification.instant };
    // Sans notification — le cas des agents imbriqués, dont le parent a fermé son
    // transcript avant d'en recevoir une — on juge l'agent sur son propre transcript,
    // exactement comme on juge la racine : plus aucun appel en suspens dans une session
    // qui ne tourne plus, c'est qu'il a rendu. Tant que la session vit, on s'abstient :
    // un agent entre deux outils n'a lui non plus rien en suspens.
    if (!sessionVivante && !appelEnSuspens && dernierSigne !== null) {
      return { etat: 'terminé', fin: dernierSigne };
    }
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

  /**
   * Fermer les tâches d'arrière-plan d'un agent.
   *
   * Le `task-id` d'une notification désigne tantôt un agent — 17 chiffres hexadécimaux —
   * tantôt une **tâche** — un identifiant court. Mesuré sur la machine : 1 373 des 1 451
   * notifications désignent une tâche, et seules les 78 autres étaient exploitées. Les
   * 95 % restants étaient lus puis jetés.
   */
  const fermerLesTaches = (d) => {
    const parId = new Map(d.taches.map((t) => [t.id, t]));
    for (const [id, f] of d.finsDeTache) {
      const t = parId.get(id);
      if (t && t.fin === null) { t.fin = f.instant; t.statut = f.statut; }
    }
    for (const e of d.evenementsDeTache) {
      const t = parId.get(e.idTache);
      if (!t) continue;
      (t.evenements = t.evenements || []).push(e);
      // Un arrêt forcé clôt la tâche même sans notification : c'est bien une fin.
      if (e.genre === 'arrêt' && t.fin === null) { t.fin = e.instant; t.statut = 'arrêtée'; }
    }
    return d.taches;
  };

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
    requetesModele: nettoyerRequetes(racine.requetesModele),
    tours: racine.tours,
    outillage: racine.outillage,
    outilsOfferts: [...racine.outilsOfferts],
    compactages: racine.compactages,
    erreurs: racine.erreurs,
    skillsCharges: racine.skillsCharges,
    taches: fermerLesTaches(racine),
    hooks: racine.hooks,
    repertoire: racine.repertoire,
    branche: racine.branche,
    repertoires: racine.repertoires,
    changementsDeRepertoire: racine.changementsDeRepertoire,
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
      appelEnSuspens: [...d.appels.values()].some((a) => a.fin === null),
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
      requetesModele: nettoyerRequetes(d.requetesModele),
      tours: d.tours,
      outillage: d.outillage,
      outilsOfferts: [...d.outilsOfferts],
      compactages: d.compactages,
      erreurs: d.erreurs,
      skillsCharges: d.skillsCharges,
      taches: fermerLesTaches(d),
    hooks: d.hooks,
      repertoire: d.repertoire,
      branche: d.branche,
      repertoires: d.repertoires,
      changementsDeRepertoire: d.changementsDeRepertoire,
      statutBrut: typeof appelParent?.resultat === 'string'
        ? appelParent.resultat
        : (res?.status ?? null),
      arrierePlan: Boolean(appelParent?.entree?.run_in_background),
      outils: [...d.appels.values()].map(nettoyerAppel),
    });
  }

  // La courbe du nombre de fichiers, une fois les appels nettoyés.
  for (const a of agents) a.courbeFichiers = construireCourbeFichiers(a);

  // Les échecs et ce qui les suit. Mesuré sur les 297 échecs du corpus : 78 % sont suivis
  // d'un appel du même outil, mais presque jamais à l'identique — cinq cas seulement.
  // L'agent corrige et relance ; c'est ce geste-là qu'il faut rendre visible.
  for (const a of agents) {
    const ordonnes = a.outils.filter((o) => o.debut !== null).sort((x, y) => x.debut - y.debut);
    ordonnes.forEach((o, i) => {
      if (o.ok !== false) return;
      const suivant = ordonnes[i + 1];
      if (!suivant || suivant.nom !== o.nom) {
        o.suite = suivant ? 'autre' : 'rien';
        return;
      }
      o.suite = suivant.entree === o.entree ? 'identique' : 'corrigée';
      o.repriseParId = suivant.id;
      suivant.reprendId = o.id;
      suivant.repriseDe = o.nom;
      suivant.repriseGenre = o.suite;
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
 * dix boucles de la session `819d3fef`, trois seulement commencent par un `tool_use` `Skill`.
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
  // de celle d'avant — mesuré sur la session `819d3fef`.
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

/**
 * Met les requêtes en forme pour l'affichage. On écarte les modèles synthétiques — ce sont
 * les messages que Claude Code s'écrit à lui-même sur une panne, pas des appels — et les
 * requêtes dont on ne saurait pas dire quand elles ont été lancées.
 */
function nettoyerRequetes(requetes) {
  return requetes
    .filter((r) => r.modele && r.modele !== '<synthetic>' && r.appel !== null)
    .map((r) => {
      const u = r.usage || {};
      // Les enregistrements ne sont pas strictement ordonnés par horodatage : une pièce
      // jointe peut porter un instant postérieur à la réponse qu'elle précède. Un appel
      // ne peut pas suivre sa propre réponse, on le ramène donc à son début.
      const appel = Math.min(r.appel, r.debut);
      return {
        modele: r.modele,
        appel,
        declencheur: r.declencheur,
        debut: r.debut,
        fin: r.fin,
        blocs: r.blocs,
        arret: r.arret || null,
        latenceMs: Math.max(0, r.debut - appel),
        reponseMs: Math.max(0, r.fin - r.debut),
        reflechi: Boolean(r.reflechi),
        composition: r.composition,
        outils: r.outils,
        dit: tronquer(r.dit, LIMITE_REQUETE),
        ditTronque: r.dit.length > LIMITE_REQUETE,
        jetons: {
          entree: u.input_tokens || 0,
          sortie: u.output_tokens || 0,
          cacheLu: u.cache_read_input_tokens || 0,
          cacheEcrit: u.cache_creation_input_tokens || 0,
          reflexion: u.output_tokens_details?.thinking_tokens || 0,
        },
      };
    });
}

/**
 * Les chemins qu'une commande supprime, quand on peut le dire sans risque.
 *
 * On ne devine pas : un `rm` sur un motif, une variable ou une substitution est ignoré,
 * parce qu'on ne saurait pas ce qu'il efface réellement. Mieux vaut une courbe qui rate
 * des suppressions qu'une courbe qui en invente.
 */
function cheminsSupprimes(commande) {
  if (typeof commande !== 'string' || !/\brm\b/.test(commande)) return [];
  const sortis = [];
  for (const bout of commande.split(/[\n;]|&&|\|\|/)) {
    const m = /^\s*(?:sudo\s+)?rm\s+(.+)$/.exec(bout);
    if (!m) continue;
    for (const brut of m[1].split(/\s+/)) {
      const arg = brut.replace(/^["']|["']$/g, '');
      if (!arg || arg.startsWith('-')) continue;
      // Tout ce qui pourrait désigner autre chose que ce qu'on lit est écarté.
      if (/[$*?`<>{}\[\]]/.test(arg)) return [];
      sortis.push(arg);
    }
  }
  return sortis;
}

/**
 * La courbe du nombre de fichiers que l'agent a fait exister : elle monte à chaque fichier
 * écrit pour la première fois, et descend quand il en supprime un qu'il avait écrit.
 *
 * Elle ne prétend pas compter les fichiers du projet — seulement ceux dont le transcript
 * permet d'affirmer qu'ils sont passés entre les mains de l'agent.
 */
function construireCourbeFichiers(agent) {
  const vivants = new Set();
  const points = [];
  let ignorees = 0;
  const appels = agent.outils
    .filter((o) => o.debut !== null)
    .sort((x, y) => x.debut - y.debut);

  for (const o of appels) {
    let change = false;
    if (o.fichier && (o.fichier.genre === 'écrit' || o.fichier.genre === 'modifié')) {
      if (!vivants.has(o.fichier.chemin)) { vivants.add(o.fichier.chemin); change = true; }
    } else if (o.nom === 'Bash') {
      const cibles = cheminsSupprimes(o.entreeBrute);
      if (/\brm\b/.test(o.entreeBrute || '') && !cibles.length) ignorees += 1;
      for (const c of cibles) {
        for (const v of vivants) {
          if (v === c || v.endsWith('/' + c.replace(/^\.\//, ''))) {
            vivants.delete(v);
            change = true;
          }
        }
      }
    }
    if (change) points.push({ instant: o.debut, nombre: vivants.size });
  }
  return { points, ignorees, finale: vivants.size };
}

/** La borne de fin à prendre pour un agent dont la fin n'est pas connue. */
function bornesFin(agent, racine) {
  return agent.fin ?? racine.dernier ?? agent.debut;
}

/**
 * Ce qu'un appel fait à un fichier. Le transcript ne contient aucun diff git, mais il
 * contient mieux : ce que l'agent a demandé. `Edit` porte l'ancien et le nouveau texte,
 * donc le compte de lignes est exact. `Write` ne porte que le nouveau contenu : on sait
 * ce qui est écrit, jamais ce qui est remplacé.
 */
function toucheFichier(nom, entree) {
  if (!entree || typeof entree !== 'object') return null;
  const chemin = entree.file_path || entree.notebook_path;
  if (!chemin) return null;
  const lignes = (s) => (typeof s === 'string' && s.length ? s.split('\n').length : 0);
  if (nom === 'Read') return { chemin, genre: 'lu', plus: 0, moins: 0 };
  if (nom === 'Write') {
    return { chemin, genre: 'écrit', plus: lignes(entree.content), moins: 0, remplace: true };
  }
  if (nom === 'Edit' || nom === 'NotebookEdit') {
    return {
      chemin,
      genre: 'modifié',
      plus: lignes(entree.new_string ?? entree.new_source),
      moins: lignes(entree.old_string ?? entree.old_source),
      partout: Boolean(entree.replace_all),
    };
  }
  return null;
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
    fichier: toucheFichier(a.nom, a.entree),
    // La commande telle quelle, pour pouvoir y repérer les suppressions.
    entreeBrute: a.nom === 'Bash' ? (a.entree?.command || '') : '',
  };
}

/**
 * Le contenu du contexte tel qu'il était au moment d'un appel donné.
 *
 * On relit le transcript dans l'ordre et on garde tout ce qui précède l'instant visé, en
 * repartant de zéro à chaque compactage — le résumé qui le suit porte `isCompactSummary`
 * et devient le premier élément du nouveau contexte.
 *
 * Ce qui est rendu est **exact** pour la conversation. Ce qui manque et qui ne peut pas
 * être reconstruit : l'invite système complète, les définitions d'outils et la mémoire du
 * projet, que le transcript n'enregistre pas.
 */
async function lireContexte(cheminTranscript, borne) {
  let elements = [];
  let compactages = 0;
  const nomDe = new Map(); // id d'appel -> nom d'outil, pour nommer les résultats

  for await (const { ligne } of lignesDe(cheminTranscript)) {
    const t = instant(ligne);
    // `Number.isFinite` et non la véracité : une borne à zéro est une borne, et la tester
    // par `borne &&` rendait **tout** le contexte au lieu de rien — 137 éléments contre 9.
    if (t !== null && Number.isFinite(borne) && t > borne) break;

    if (ligne.type === 'system' && ligne.subtype === 'compact_boundary') {
      elements = [];
      compactages += 1;
      continue;
    }

    if (ligne.type === 'attachment') {
      const taille = tailleInjectee(ligne.attachment);
      if (taille > 0) {
        elements.push({
          instant: t,
          genre: 'systeme',
          titre: ligne.attachment?.type || 'rappel',
          texte: texteInjecte(ligne.attachment),
        });
      }
      continue;
    }

    if (ligne.type === 'assistant') {
      if (ligne.message?.model === '<synthetic>') continue;
      for (const bloc of ligne.message?.content || []) {
        if (bloc.type === 'text' && bloc.text) {
          elements.push({ instant: t, genre: 'modele', titre: 'parole du modèle', texte: bloc.text });
        } else if (bloc.type === 'thinking') {
          // Le contenu d'un bloc de réflexion n'est pas conservé : le transcript n'en
          // garde que la signature. On le montre quand même, pour qu'on sache qu'il
          // occupait de la place dans le contexte.
          elements.push({
            instant: t,
            genre: 'reflexion',
            titre: 'réflexion',
            texte: bloc.thinking || '',
            vide: !bloc.thinking,
          });
        } else if (bloc.type === 'tool_use') {
          nomDe.set(bloc.id, bloc.name);
          elements.push({
            instant: t,
            genre: 'outilEntree',
            titre: 'appel de ' + bloc.name,
            texte: texteEntree(bloc.name, bloc.input),
          });
        }
      }
      continue;
    }

    if (ligne.type !== 'user') continue;
    const contenu = ligne.message?.content;

    if (ligne.isCompactSummary) {
      elements.push({
        instant: t, genre: 'resume', titre: 'résumé du compactage', texte: texteDe(contenu),
      });
      continue;
    }
    if (estUneConsigne(ligne)) {
      elements.push({ instant: t, genre: 'humain', titre: 'requête d’Yves', texte: texteDe(contenu) });
      continue;
    }
    if (Array.isArray(contenu)) {
      let vu = false;
      for (const bloc of contenu) {
        if (bloc.type !== 'tool_result') continue;
        vu = true;
        elements.push({
          instant: t,
          genre: 'outilSortie',
          titre: 'résultat de ' + (nomDe.get(bloc.tool_use_id) || 'un outil'),
          texte: typeof bloc.content === 'string' ? bloc.content : texteDe(bloc.content),
        });
      }
      if (vu) continue;
    }
    const texte = texteDe(contenu);
    if (texte) elements.push({ instant: t, genre: 'systeme', titre: 'message', texte });
  }

  const caracteres = elements.reduce((n, e) => n + (e.texte || '').length, 0);
  return { elements, caracteres, compactages, borne };
}

/** Le texte qu'une pièce jointe injecte, pour pouvoir le relire. */
function texteInjecte(att) {
  const bouts = [];
  if (typeof att.text === 'string') bouts.push(att.text);
  if (typeof att.content === 'string' && att.content) bouts.push(att.content);
  if (Array.isArray(att.skills)) {
    for (const s of att.skills) if (typeof s.content === 'string') bouts.push(s.content);
  }
  if (Array.isArray(att.systemPrompt)) {
    for (const s of att.systemPrompt) if (typeof s === 'string') bouts.push(s);
  }
  if (Array.isArray(att.addedBlocks)) {
    for (const b of att.addedBlocks) if (typeof b === 'string') bouts.push(b);
  }
  if (att.file && typeof att.file.content === 'string') bouts.push(att.file.content);
  return bouts.join('\n\n');
}

module.exports = {
  lireSession, lireContexte, assembler, etatVide, avaler, cheminSousAgents,
};
