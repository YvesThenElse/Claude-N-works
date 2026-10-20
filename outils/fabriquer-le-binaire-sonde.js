#!/usr/bin/env node
// Fabrique la sonde en **exécutable autonome**, pour une machine où Node n'est pas
// installé.
//
// Le fichier unique `cnw-sonde.js` suffit partout où Node est là, et il pèse 116 ko contre
// 119 Mo. Ce binaire-ci n'existe que pour le cas où il n'y est pas — un serveur de
// construction nu, une image minimale — et c'est le seul argument en sa faveur.
//
// ⚠️ On part du Node **officiel**, jamais de celui de la machine. Mesuré sur Fedora :
// `/usr/bin/node-22` fait 28 ko et se lie dynamiquement à `libnode.so`. Un SEA bâti
// là-dessus produirait un exécutable de 28 ko qui réclamerait la bibliothèque à
// l'exécution — tout le contraire d'autonome, et la panne n'apparaîtrait que sur la
// machine cible.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(RACINE, 'distribution');
const TRAVAIL = path.join(SORTIE, 'sea');

// La sentinelle est celle de Node lui-même : postject cherche cette chaîne dans le binaire
// pour savoir où poser le blob. Elle est publiée avec le format SEA.
const FUSIBLE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function courir(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...options });
}

/**
 * Le Node officiel pour cette plateforme. En intégration continue, `actions/setup-node`
 * installe exactement celui-là : `process.execPath` est alors le bon. Ailleurs, on
 * refuse plutôt que de fabriquer un binaire qui ne marchera pas chez l'autre.
 */
function nodeDeBase() {
  const donne = process.env.NODE_DE_BASE;
  if (donne) return donne;
  const chemin = process.execPath;
  const taille = fs.statSync(chemin).size;
  // Le Node officiel pèse une centaine de mégaoctets ; un lanceur lié dynamiquement en
  // pèse quelques dizaines de kilooctets. Le seuil n'a pas besoin d'être fin.
  if (taille < 20 * 1024 * 1024) {
    throw new Error(
      'ce Node (' + chemin + ', ' + Math.round(taille / 1024) + ' ko) est lié dynamiquement : '
      + 'un binaire bâti dessus ne serait pas autonome.\n'
      + 'Donnez le Node officiel par NODE_DE_BASE=/chemin/vers/node, '
      + 'ou lancez cette fabrication sous actions/setup-node.');
  }
  return chemin;
}

const nom = 'cnw-sonde' + (os.platform() === 'win32' ? '.exe' : '');
const binaire = path.join(SORTIE, nom);

fs.mkdirSync(TRAVAIL, { recursive: true });
// Le fichier unique est l'entrée : `node:sea` n'embarque qu'un script et ne résout aucun
// `require` relatif.
courir(process.execPath, [path.join(__dirname, 'fabriquer-la-sonde.js')]);
fs.copyFileSync(path.join(SORTIE, 'cnw-sonde.js'), path.join(TRAVAIL, 'cnw-sonde.js'));
fs.writeFileSync(path.join(TRAVAIL, 'sea-config.json'), JSON.stringify({
  main: 'cnw-sonde.js',
  output: 'sea-prep.blob',
  disableExperimentalSEAWarning: true,
}, null, 2));

courir(process.execPath, ['--experimental-sea-config', 'sea-config.json'], { cwd: TRAVAIL });

const base = nodeDeBase();
fs.copyFileSync(base, binaire);
fs.chmodSync(binaire, 0o755);

// postject vient du registre : c'est l'outil que Node lui-même recommande, et il n'y a pas
// d'autre façon raisonnable d'injecter une section dans un ELF, un Mach-O et un PE.
//
// ⚠️ Sous Windows, `npx` est un `.cmd`, et depuis Node 20 `execFileSync` refuse de lancer
// un script de commandes sans passer par le shell — c'est le correctif de la
// CVE-2024-27980. Sans `shell: true`, la fabrication meurt sur `EINVAL spawnSync npx.cmd`,
// et seulement sous Windows : mesuré en intégration continue, Linux et macOS passaient.
// Les arguments sont alors guillemetés, puisque le shell les redécoupe.
const sousWindows = os.platform() === 'win32';
const args = ['--yes', 'postject', binaire, 'NODE_SEA_BLOB',
  path.join(TRAVAIL, 'sea-prep.blob'), '--sentinel-fuse', FUSIBLE];
if (sousWindows) {
  courir('npx.cmd', args.map((a) => (/[\s"]/.test(a) ? '"' + a + '"' : a)), { shell: true });
} else {
  courir('npx', args);
}

const taille = fs.statSync(binaire).size;
process.stdout.write('\n  ' + nom + ' — ' + Math.round(taille / 1048576) + ' Mo, autonome\n');
