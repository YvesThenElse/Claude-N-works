#!/usr/bin/env node
// Le livre de recettes — un serveur MCP en stdio, sans aucune dépendance.
//
// Il ne fait rien d'autre que lire les fichiers de `recettes/` et de `reperes/` et les
// rendre à qui les demande. C'est volontairement le serveur MCP le plus simple qu'on
// puisse écrire : un échange JSON-RPC par ligne sur l'entrée et la sortie standard.
//
//   {"jsonrpc":"2.0","id":1,"method":"tools/list"}
//
// Pour l'éprouver à la main, sans Claude Code :
//   printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node livre/serveur.js

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const RACINE = __dirname;
const VERSION_REPLI = '2024-11-05';

/** Sans accents et sans casse : « Velouté » et « veloute » doivent se rencontrer. */
function aplatir(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function charger(sousDossier) {
  const dossier = path.join(RACINE, sousDossier);
  const out = new Map();
  let noms = [];
  try {
    noms = fs.readdirSync(dossier).filter((n) => n.endsWith('.json'));
  } catch {
    return out;
  }
  for (const nom of noms) {
    try {
      const o = JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8'));
      out.set(o.id || nom.replace(/\.json$/, ''), o);
    } catch (e) {
      // Une fiche illisible ne doit pas fermer le livre : on la saute et on le dira.
      process.stderr.write(`livre : ${nom} illisible — ${e.message}\n`);
    }
  }
  return out;
}

// Rechargé à chaque appel : on peut ajouter une recette sans redémarrer le serveur.
const recettes = () => charger('recettes');
const reperes = () => charger('reperes');

// ------------------------------------------------------------------ les trois outils

const OUTILS = [
  {
    name: 'chercher',
    description: 'Cherche un plat au livre. Rend les fiches dont le nom ou un synonyme '
      + 'ressemble à ce qui est demandé, avec leur identifiant et leur résumé. '
      + 'Une liste vide veut dire que le plat n\'est pas au livre.',
    inputSchema: {
      type: 'object',
      properties: { plat: { type: 'string', description: 'le plat demandé, tel que l\'utilisateur l\'a dit' } },
      required: ['plat'],
    },
  },
  {
    name: 'recette',
    description: 'La fiche technique complète d\'une recette : ses postes, et pour chaque '
      + 'poste ses gestes avec leur durée en minutes et ce qu\'il dépose en mise en place.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'l\'identifiant rendu par chercher' } },
      required: ['id'],
    },
  },
  {
    name: 'repere',
    description: 'Les repères de métier d\'un poste : tailles et durées pour le taillage, '
      + 'points de cuisson, temps de réduction, ordre des couches au dressage. '
      + 'À demander une fois, au début du poste.',
    inputSchema: {
      type: 'object',
      properties: {
        poste: {
          type: 'string',
          description: 'taillage, cuisson, sauce ou dressage',
          enum: ['taillage', 'cuisson', 'sauce', 'dressage'],
        },
      },
      required: ['poste'],
    },
  },
];

function chercher({ plat }) {
  const q = aplatir(plat);
  if (!q) return { trouve: [], note: 'Aucun plat demandé.' };
  const mots = q.split(/\s+/).filter((m) => m.length > 2);
  const sortie = [];
  for (const [id, r] of recettes()) {
    const foin = aplatir([r.nom, id, ...(r.synonymes || [])].join(' '));
    const touche = foin.includes(q) || mots.some((m) => foin.includes(m));
    if (touche) sortie.push({ id, nom: r.nom, resume: r.resume, postes: (r.postes || []).map((p) => p.poste) });
  }
  return {
    trouve: sortie,
    note: sortie.length
      ? 'Appelle `recette` avec l\'identifiant pour avoir la fiche entière.'
      : 'Ce plat n\'est pas au livre. Compose la fiche toi-même, en respectant la même '
        + 'forme : trois ou quatre postes, des gestes, des minutes.',
  };
}

function recette({ id }) {
  const r = recettes().get(String(id || ''));
  if (!r) {
    return {
      erreur: `Pas de recette « ${id} » au livre.`,
      disponibles: [...recettes().keys()],
    };
  }
  return r;
}

function repere({ poste }) {
  const r = reperes().get(aplatir(poste));
  if (!r) {
    return { erreur: `Pas de repères pour « ${poste} ».`, disponibles: [...reperes().keys()] };
  }
  return r;
}

const EXECUTION = { chercher, recette, repere };

// ------------------------------------------------------------------------- le dialogue

function envoyer(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function repondre(id, result) {
  envoyer({ jsonrpc: '2.0', id, result });
}

function echouer(id, code, message) {
  envoyer({ jsonrpc: '2.0', id, error: { code, message } });
}

function traiter(requete) {
  const { id, method, params } = requete;
  // Une notification n'a pas d'identifiant et n'attend pas de réponse.
  const notification = id === undefined || id === null;

  if (method === 'initialize') {
    const demandee = params && typeof params.protocolVersion === 'string' ? params.protocolVersion : null;
    return repondre(id, {
      protocolVersion: demandee || VERSION_REPLI,
      capabilities: { tools: {} },
      serverInfo: { name: 'livre-de-recettes', version: '1.0.0' },
    });
  }
  if (method === 'ping') return repondre(id, {});
  if (method === 'tools/list') return repondre(id, { tools: OUTILS });
  if (method === 'tools/call') {
    const nom = params && params.name;
    const faire = EXECUTION[nom];
    if (!faire) return echouer(id, -32602, `Outil inconnu : ${nom}`);
    let resultat;
    try {
      resultat = faire(params.arguments || {});
    } catch (e) {
      return repondre(id, {
        content: [{ type: 'text', text: `Le livre a trébuché : ${e.message}` }],
        isError: true,
      });
    }
    return repondre(id, {
      content: [{ type: 'text', text: JSON.stringify(resultat, null, 2) }],
    });
  }
  if (notification) return; // initialized, cancelled, et tout ce qu'on ignore
  return echouer(id, -32601, `Méthode inconnue : ${method}`);
}

const lecteur = readline.createInterface({ input: process.stdin });
lecteur.on('line', (ligne) => {
  const brut = ligne.trim();
  if (!brut) return;
  let requete;
  try {
    requete = JSON.parse(brut);
  } catch (e) {
    return echouer(null, -32700, `JSON illisible : ${e.message}`);
  }
  try {
    traiter(requete);
  } catch (e) {
    if (requete && requete.id !== undefined) echouer(requete.id, -32603, e.message);
  }
});
