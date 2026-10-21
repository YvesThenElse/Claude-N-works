#!/usr/bin/env node
// Fabrique les icônes de l'application à partir de `public/logo.svg`, sans aucune
// dépendance.
//
// Il n'y a pas d'outil d'image sur la machine de développement, et en ajouter un pour
// quelques rectangles serait une dépendance de plus. Un PNG est un format simple : un
// en-tête, des pixels préfixés d'un octet de filtre, le tout dans un flux zlib — et
// `zlib` est dans la bibliothèque standard de Node.
//
// Ce programme ne dessine rien de lui-même : il **lit le logo** et le rastérise. Sans
// cela il y aurait deux dessins à tenir d'accord, et c'est toujours le second qu'on
// oublie de corriger. En échange, le logo n'a le droit de contenir que des `<rect>` à
// coins arrondis — ce que son propre commentaire rappelle.
//
// Deux choses que l'ancienne version ne faisait pas :
//   — les coins sont **lissés**, par un rendu à quatre fois la taille puis moyenne ;
//     sans cela les arrondis sortaient en escalier à 128 px ;
//   — le fond est **transparent** hors de la boîte (PNG en couleur vraie + alpha), parce
//     que macOS n'arrondit pas les icônes lui-même et qu'un carré noir se verrait.

'use strict';

const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const LOGO = path.join(__dirname, '..', 'public', 'logo.svg');
const SUR = 4; // suréchantillonnage : on rend à SUR× puis on moyenne

/**
 * Les rectangles du logo, dans l'ordre où ils sont peints. On ne lit que ce que le logo
 * a le droit de contenir ; tout le reste est ignoré, et un logo qui n'aurait aucun
 * rectangle arrête le programme plutôt que de produire une icône vide.
 */
function lireLeLogo(source) {
  const svg = fs.readFileSync(source, 'utf8');
  const cote = /viewBox\s*=\s*"0 0 (\d+) (\d+)"/.exec(svg);
  if (!cote || cote[1] !== cote[2]) {
    throw new Error(`${source} : viewBox carrée attendue, trouvé ${cote ? cote[0] : 'rien'}`);
  }
  const nombre = (balise, nom, defaut) => {
    const m = new RegExp(`${nom}\\s*=\\s*"([-\\d.]+)"`).exec(balise);
    return m ? Number(m[1]) : defaut;
  };
  const rects = [];
  for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
    const b = m[0];
    const couleur = /fill\s*=\s*"(#[0-9a-fA-F]{6})"/.exec(b);
    if (!couleur) continue; // un rect sans remplissage ne peint rien
    rects.push({
      x: nombre(b, 'x', 0), y: nombre(b, 'y', 0),
      l: nombre(b, 'width', 0), h: nombre(b, 'height', 0),
      r: nombre(b, 'rx', 0),
      a: nombre(b, 'opacity', 1),
      rgb: [1, 3, 5].map((i) => parseInt(couleur[1].slice(i, i + 2), 16)),
    });
  }
  if (!rects.length) throw new Error(`${source} : aucun <rect> peint`);
  return { unite: Number(cote[1]), rects };
}

/** Un point est-il dans un rectangle à coins arrondis ? */
function dedans(x, y, r) {
  if (x < r.x || y < r.y || x >= r.x + r.l || y >= r.y + r.h) return false;
  const ray = Math.min(r.r, r.l / 2, r.h / 2);
  if (ray <= 0) return true;
  const dx = Math.min(x - r.x, r.x + r.l - x);
  const dy = Math.min(y - r.y, r.y + r.h - y);
  if (dx >= ray || dy >= ray) return true;
  const ex = ray - dx;
  const ey = ray - dy;
  return ex * ex + ey * ey <= ray * ray;
}

/** Rend le logo en RGBA, à `cote` pixels, lissé par suréchantillonnage. */
function dessiner(logo, cote) {
  const grand = cote * SUR;
  const echelle = logo.unite / grand;
  // Accumulateurs en prémultiplié : c'est le seul moyen de moyenner des pixels
  // d'opacités différentes sans assombrir les bords.
  const acc = new Float64Array(cote * cote * 4);
  for (let gy = 0; gy < grand; gy += 1) {
    const sy = (gy + 0.5) * echelle;
    const py = (gy / SUR) | 0;
    for (let gx = 0; gx < grand; gx += 1) {
      const sx = (gx + 0.5) * echelle;
      let r = 0; let v = 0; let b = 0; let a = 0;
      for (const rect of logo.rects) {
        if (!dedans(sx, sy, rect)) continue;
        const ai = rect.a;
        r = rect.rgb[0] * ai + r * (1 - ai);
        v = rect.rgb[1] * ai + v * (1 - ai);
        b = rect.rgb[2] * ai + b * (1 - ai);
        a = ai + a * (1 - ai);
      }
      const i = (py * cote + ((gx / SUR) | 0)) * 4;
      acc[i] += r * a; acc[i + 1] += v * a; acc[i + 2] += b * a; acc[i + 3] += a;
    }
  }
  const n = SUR * SUR;
  const px = Buffer.alloc(cote * cote * 4);
  for (let i = 0; i < cote * cote; i += 1) {
    const a = acc[i * 4 + 3] / n;
    px[i * 4 + 3] = Math.round(a * 255);
    for (let c = 0; c < 3; c += 1) {
      px[i * 4 + c] = a > 0 ? Math.round(Math.min(255, acc[i * 4 + c] / n / a)) : 0;
    }
  }
  return px;
}

function png(cote, pixels) {
  const brut = Buffer.alloc(cote * (cote * 4 + 1));
  for (let y = 0; y < cote; y += 1) {
    brut[y * (cote * 4 + 1)] = 0; // filtre « aucun »
    pixels.copy(brut, y * (cote * 4 + 1) + 1, y * cote * 4, (y + 1) * cote * 4);
  }
  const morceau = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corps) >>> 0);
    return Buffer.concat([len, corps, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cote, 0); ihdr.writeUInt32BE(cote, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, couleur vraie + alpha
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

const logo = lireLeLogo(LOGO);
process.stdout.write(`  d'après ${path.relative(process.cwd(), LOGO)} — `
  + `${logo.rects.length} rectangles sur ${logo.unite}×${logo.unite}\n`);
const dossier = path.join(__dirname, '..', 'icones');
fs.mkdirSync(dossier, { recursive: true });
// 512 pour electron-builder, qui en tire lui-même le .icns et le .ico.
for (const cote of [512, 256, 128]) {
  const nom = cote === 512 ? 'icone.png' : `icone-${cote}.png`;
  const fichier = path.join(dossier, nom);
  fs.writeFileSync(fichier, png(cote, dessiner(logo, cote)));
  process.stdout.write(`  ${nom} — ${cote}×${cote}, ${fs.statSync(fichier).size} octets\n`);
}
