// Orange Black Box — suivi incrémental d'une session vivante.
//
// Relire les 37 Mo d'un transcript à chaque ligne écrite coûterait 610 ms par
// rafraîchissement. On garde donc, par fichier, la position déjà lue et l'état déjà
// dépouillé, et on ne lit que ce qui s'est ajouté depuis.
//
// Deux précautions imposées par le fait qu'on lit un fichier pendant qu'il s'écrit :
//   - une ligne peut être incomplète : on ne traite que jusqu'au dernier saut de ligne,
//     et on garde le reste pour la fois suivante ;
//   - le répertoire des sous-agents n'existe pas tant qu'aucun sous-agent n'a été lancé :
//     il faut le chercher à chaque passage, et non une seule fois à l'ouverture.

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { etatVide, avaler, assembler, cheminSousAgents } = require('./lecture.js');

class Suiveur {
  constructor(cheminTranscript) {
    this.transcript = cheminTranscript;
    this.fichiers = new Map(); // chemin -> { position, reste, etat }
    this.metas = new Map();    // agentId -> contenu du .meta.json
  }

  /** Lit ce qui s'est ajouté à un fichier et le dépouille. Renvoie vrai si ça a bougé. */
  async avancer(chemin) {
    let suivi = this.fichiers.get(chemin);
    if (!suivi) {
      suivi = { position: 0, reste: '', etat: etatVide() };
      this.fichiers.set(chemin, suivi);
    }
    let stat;
    try {
      stat = await fsp.stat(chemin);
    } catch {
      return false;
    }
    // Un fichier qui rétrécit a été remplacé : on repart de zéro plutôt que de lire
    // n'importe quoi au milieu.
    if (stat.size < suivi.position) {
      suivi.position = 0;
      suivi.reste = '';
      suivi.etat = etatVide();
    }
    if (stat.size === suivi.position) return false;

    const fichier = await fsp.open(chemin, 'r');
    try {
      const taille = stat.size - suivi.position;
      const tampon = Buffer.allocUnsafe(taille);
      await fichier.read(tampon, 0, taille, suivi.position);
      suivi.position = stat.size;
      const texte = suivi.reste + tampon.toString('utf8');
      const coupe = texte.lastIndexOf('\n');
      if (coupe < 0) { suivi.reste = texte; return false; }
      suivi.reste = texte.slice(coupe + 1);
      for (const brute of texte.slice(0, coupe).split('\n')) {
        if (!brute.trim()) continue;
        try {
          avaler(suivi.etat, JSON.parse(brute));
        } catch {
          // ligne illisible : on passe, le fichier est peut-être en cours d'écriture
        }
      }
      return true;
    } finally {
      await fichier.close();
    }
  }

  /** Cherche les sous-agents apparus depuis le dernier passage. */
  async decouvrirSousAgents() {
    const dossier = cheminSousAgents(this.transcript);
    let entrees;
    try {
      entrees = await fsp.readdir(dossier);
    } catch {
      return [];
    }
    const trouves = [];
    for (const nom of entrees) {
      if (!nom.startsWith('agent-') || !nom.endsWith('.jsonl')) continue;
      const agentId = nom.slice('agent-'.length, -'.jsonl'.length);
      if (!this.metas.has(agentId)) {
        let meta = {};
        try {
          meta = JSON.parse(
            await fsp.readFile(path.join(dossier, `agent-${agentId}.meta.json`), 'utf8'));
        } catch {
          // un sous-agent dont la fiche n'est pas encore écrite reste affichable
        }
        this.metas.set(agentId, meta);
      }
      trouves.push({ agentId, meta: this.metas.get(agentId), chemin: path.join(dossier, nom) });
    }
    return trouves;
  }

  /**
   * Met tout à jour et renvoie le déroulé assemblé, ou null si rien n'a bougé.
   * `forcer` sert au premier appel, où il faut produire un déroulé même sans changement.
   */
  async rafraichir({ sessionVivante, nomSession, forcer = false } = {}) {
    let bouge = await this.avancer(this.transcript);
    const sousAgents = await this.decouvrirSousAgents();
    for (const sa of sousAgents) {
      if (await this.avancer(sa.chemin)) bouge = true;
    }
    if (!bouge && !forcer) return null;

    return assembler({
      cheminTranscript: this.transcript,
      racine: this.fichiers.get(this.transcript)?.etat || etatVide(),
      sousAgents: sousAgents.map((sa) => ({
        ...sa,
        etat: this.fichiers.get(sa.chemin)?.etat || etatVide(),
      })),
      sessionVivante,
      nomSession,
    });
  }

  /** Surveille le transcript et le répertoire des sous-agents. */
  surveiller(auChangement) {
    const vus = new Set();
    const poser = (cible) => {
      if (vus.has(cible)) return;
      try {
        const g = fs.watch(cible, () => auChangement());
        g.on('error', () => {});
        vus.add(cible);
      } catch {
        // la cible n'existe pas encore : le relevé périodique la rattrapera
      }
    };
    poser(this.transcript);
    poser(path.dirname(this.transcript));
    const dossier = cheminSousAgents(this.transcript);
    poser(dossier);
    return { poserSousAgents: () => poser(dossier) };
  }
}

module.exports = { Suiveur };
