#!/usr/bin/env node
// Fabrique les icônes de l'application, sans aucune dépendance.
//
// Il n'y a pas d'outil d'image sur la machine de développement, et en ajouter un pour
// trois rectangles serait une dépendance de plus. Un PNG non compressé est un format
// simple : un en-tête, des pixels préfixés d'un octet de filtre, le tout dans un flux
// zlib — et `zlib` est dans la bibliothèque standard de Node.
//
// Le dessin est ce que l'application est : des **voies** sur une ligne du temps, dans les
// couleurs de la palette. Un agent en haut, ses appels d'outils dessous, une boucle, un
// échec. On reconnaît l'écran dans l'icône.

'use strict';

const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const FOND = [0x11, 0x13, 0x1a];
const VOIES = [
  // y relatif, hauteur, segments [début, fin] en fraction de largeur, couleur
  { y: 0.20, h: 0.085, seg: [[0.12, 0.88]], couleur: [0x7a, 0xa2, 0xf7] },           // l'agent
  { y: 0.345, h: 0.075, seg: [[0.12, 0.20], [0.24, 0.33], [0.37, 0.52],
                              [0.56, 0.62], [0.66, 0.78]], couleur: [0x9e, 0xce, 0x6a] }, // les outils
  { y: 0.345, h: 0.075, seg: [[0.81, 0.88]], couleur: [0xf7, 0x76, 0x8e] },          // un échec
  { y: 0.49, h: 0.075, seg: [[0.26, 0.74]], couleur: [0xbb, 0x9a, 0xf7] },           // un sous-agent
  { y: 0.635, h: 0.065, seg: [[0.30, 0.38], [0.42, 0.55], [0.59, 0.70]], couleur: [0x9e, 0xce, 0x6a] },
  { y: 0.775, h: 0.055, seg: [[0.12, 0.13], [0.30, 0.31], [0.48, 0.49],
                              [0.66, 0.67], [0.86, 0.87]], couleur: [0x2a, 0xc3, 0xde] }, // la boucle
  { y: 0.797, h: 0.011, seg: [[0.12, 0.87]], couleur: [0x2a, 0xc3, 0xde] },          // son rail
];

function dessiner(cote) {
  const px = Buffer.alloc(cote * cote * 3);
  for (let i = 0; i < cote * cote; i += 1) {
    px[i * 3] = FOND[0]; px[i * 3 + 1] = FOND[1]; px[i * 3 + 2] = FOND[2];
  }
  const rayon = Math.max(1, Math.round(cote * 0.012));
  for (const voie of VOIES) {
    const y0 = Math.round(voie.y * cote);
    const y1 = Math.round((voie.y + voie.h) * cote);
    for (const [a, b] of voie.seg) {
      const x0 = Math.round(a * cote);
      const x1 = Math.round(b * cote);
      for (let y = y0; y < y1 && y < cote; y += 1) {
        for (let x = x0; x < x1 && x < cote; x += 1) {
          // coins arrondis : on saute les pixels hors du rayon dans chaque angle
          const dx = Math.min(x - x0, x1 - 1 - x);
          const dy = Math.min(y - y0, y1 - 1 - y);
          if (dx < rayon && dy < rayon) {
            const ex = rayon - dx; const ey = rayon - dy;
            if (ex * ex + ey * ey > rayon * rayon) continue;
          }
          const i = (y * cote + x) * 3;
          px[i] = voie.couleur[0]; px[i + 1] = voie.couleur[1]; px[i + 2] = voie.couleur[2];
        }
      }
    }
  }
  return px;
}

function png(cote, pixels) {
  const brut = Buffer.alloc(cote * (cote * 3 + 1));
  for (let y = 0; y < cote; y += 1) {
    brut[y * (cote * 3 + 1)] = 0; // filtre « aucun »
    pixels.copy(brut, y * (cote * 3 + 1) + 1, y * cote * 3, (y + 1) * cote * 3);
  }
  const morceau = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corps) >>> 0);
    return Buffer.concat([len, corps, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cote, 0); ihdr.writeUInt32BE(cote, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, couleur vraie
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', zlib.deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const dossier = path.join(__dirname, '..', 'icones');
fs.mkdirSync(dossier, { recursive: true });
// 512 pour electron-builder, qui en tire lui-même le .icns et le .ico.
for (const cote of [512, 256, 128]) {
  const nom = cote === 512 ? 'icone.png' : `icone-${cote}.png`;
  const fichier = path.join(dossier, nom);
  fs.writeFileSync(fichier, png(cote, dessiner(cote)));
  process.stdout.write(`  ${nom} — ${cote}×${cote}, ${fs.statSync(fichier).size} octets\n`);
}
