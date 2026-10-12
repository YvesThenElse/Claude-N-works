#!/usr/bin/env node
// Vérifie que le livre se tient : on ne dresse que ce qu'un poste a produit.
//
//   node livre/verifier.js
//
// Sort 0 si tout va bien, 1 sinon. C'est la seule règle qu'on peut vérifier
// mécaniquement, et c'est celle qui comptait : une assiette qui réclame des copeaux
// de parmesan que personne n'a taillés fait un service bancal et un commis qui invente.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACINE = __dirname;
const AGENTS = new Set(['commis-taillage', 'commis-cuisson', 'commis-saucier', 'chef-de-partie']);

let fautes = 0;
function faute(id, texte) {
  console.log(`  ✗ ${id} — ${texte}`);
  fautes += 1;
}

const dossier = path.join(RACINE, 'recettes');
const fichiers = fs.readdirSync(dossier).filter((n) => n.endsWith('.json')).sort();

for (const nom of fichiers) {
  const r = JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8'));
  const id = r.id || nom;

  if (!Array.isArray(r.postes) || r.postes.length < 3 || r.postes.length > 4) {
    faute(id, `${(r.postes || []).length} poste(s) — il en faut trois ou quatre`);
  }

  const depots = new Map(); // élément déposé -> le poste qui le produit
  for (const p of r.postes || []) {
    if (!AGENTS.has(p.agent)) faute(id, `poste « ${p.poste} » confié à « ${p.agent} », qui n'existe pas`);
    let total = 0;
    for (const g of p.gestes || []) {
      if (typeof g.minutes !== 'number' || g.minutes <= 0) faute(id, `« ${g.geste} » sans durée`);
      else total += g.minutes;
    }
    if (total < 10 || total > 40) faute(id, `poste « ${p.poste} » à ${total} min — viser entre 10 et 40`);
    for (const d of p.depose || []) {
      if (depots.has(d)) faute(id, `« ${d} » déposé deux fois, par ${depots.get(d)} et par ${p.poste}`);
      depots.set(d, p.poste);
    }
  }

  if (!Array.isArray(r.assiette) || !r.assiette.length) {
    faute(id, 'pas d’assiette : on ne sait pas ce qui se dresse ni d’où ça vient');
  }
  for (const c of r.assiette || []) {
    for (const source of c.depuis || []) {
      if (!depots.has(source)) faute(id, `la couche « ${c.couche} » réclame « ${source} », qu’aucun poste ne dépose`);
    }
    if (!(c.depuis || []).length) faute(id, `la couche « ${c.couche} » ne vient de nulle part`);
  }

  // Un élément jamais dressé n'est pas une faute : beaucoup de mise en place est
  // consommée en cours de cuisson. On le signale seulement si rien du poste ne sort.
  for (const p of r.postes || []) {
    const sort = (p.depose || []).some((d) => (r.assiette || []).some((c) => (c.depuis || []).includes(d)));
    const consomme = (r.postes || []).some((q) => q !== p && (q.gestes || [])
      .some((g) => (p.depose || []).some((d) => g.geste.includes(d.split('-')[0]))));
    if (!sort && !consomme) {
      console.log(`  · ${id} — rien de ce que dépose « ${p.poste} » ne se retrouve à l’assiette (c’est permis, mais vérifie)`);
    }
  }
}

console.log(fautes
  ? `\n${fichiers.length} recette(s), ${fautes} faute(s).`
  : `\n${fichiers.length} recette(s), aucune faute : tout ce qui se dresse a été produit.`);
process.exit(fautes ? 1 : 0);
