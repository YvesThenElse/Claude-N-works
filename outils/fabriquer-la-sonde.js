#!/usr/bin/env node
// Fabrique la sonde en UN SEUL FICHIER, sans aucune dépendance.
//
// Une sonde s'installe sur une machine qu'on n'a pas sous les yeux : un serveur de
// construction, une machine headless. Y copier quatre fichiers et se souvenir lequel
// lancer est une friction de trop. Un fichier, une commande.
//
// Le liage est écrit ici plutôt qu'emprunté à un empaqueteur : les modules du projet sont
// quatre, en CommonJS, sans dépendance externe — un `require` de trente lignes suffit, et
// il n'y a rien à mettre à jour ni à auditer. C'est la même raison qui a fait écrire le
// fabricant d'icônes à la main.
//
// Le fichier produit sert aussi d'entrée au binaire autonome : `node:sea` ne sait
// embarquer qu'un script, et il ne résout pas les `require` relatifs.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(RACINE, 'distribution');

// L'ordre n'importe pas — le `require` du préambule est paresseux — mais l'entrée, si.
const MODULES = ['lecture.js', 'suivi.js', 'machines.js', 'serveur.js'];
const ENTREE = './serveur.js';

function lire(nom) {
  // Le shebang d'un module ne vaut qu'en tête de fichier : inliné au milieu, il devient
  // une erreur de syntaxe. On le retire, le fichier produit porte le sien.
  return fs.readFileSync(path.join(RACINE, nom), 'utf8').replace(/^#![^\n]*\n/, '');
}

/**
 * Le préambule : un `require` minuscule qui ne connaît que les modules inlinés et laisse
 * passer tout le reste au vrai `require` de Node. Les modules sont évalués au premier
 * appel et gardés, comme le fait Node — sans quoi `machines.js` relirait le jeton à
 * chaque fois.
 */
function assembler() {
  const bouts = [
    '#!/usr/bin/env node',
    '// Orange Black Box — la sonde, en un seul fichier.',
    '// Fabriqué par outils/fabriquer-la-sonde.js ; ne pas modifier à la main.',
    "'use strict';",
    'const __modules = {};',
    'const __charges = {};',
    'function __require(nom) {',
    "  const cle = nom.replace(/^\\.\\//, '');",
    '  if (!(cle in __modules)) return require(nom);',
    '  if (!(cle in __charges)) {',
    '    const module = { exports: {} };',
    '    __charges[cle] = module.exports;',
    '    __modules[cle](module, module.exports, __require);',
    '    __charges[cle] = module.exports;',
    '  }',
    '  return __charges[cle];',
    '}',
  ];

  for (const nom of MODULES) {
    // `require` et `module` sont passés en paramètres : le code du module n'a pas à savoir
    // qu'il a été inliné, et il reste lisible tel quel dans le fichier produit.
    bouts.push(`__modules[${JSON.stringify(nom)}] = function (module, exports, require) {`);
    bouts.push(lire(nom));
    bouts.push('};');
  }

  // `require.main === module` est faux dans un module inliné : le serveur ne démarrerait
  // pas tout seul. On le lance explicitement, en mode sonde.
  bouts.push('');
  bouts.push('// Une sonde ne fait qu’une chose : servir son API. Le mode est forcé ici,');
  bouts.push('// pour qu’on ne puisse pas lancer ce fichier en poste de travail par mégarde.');
  bouts.push("process.env.SONDE = '1';");
  bouts.push(`const __serveur = __require(${JSON.stringify(ENTREE)});`);
  bouts.push('__serveur.demarrer().catch((err) => {');
  bouts.push("  process.stderr.write('la sonde n’a pas pu démarrer : ' + (err && err.message ? err.message : err) + '\\n');");
  bouts.push('  process.exit(1);');
  bouts.push('});');
  return bouts.join('\n') + '\n';
}

fs.mkdirSync(SORTIE, { recursive: true });
const fichier = path.join(SORTIE, 'obb-sonde.js');
const corps = assembler();
fs.writeFileSync(fichier, corps);
process.stdout.write(`  obb-sonde.js — ${corps.length.toLocaleString('fr-FR')} octets, `
  + `${MODULES.length} modules, aucune dépendance\n`);
