#!/usr/bin/env node
// Analyse un bilan sanguin (PDF ou texte) et affiche ce que le parseur reconnaît.
//
//   node tools/parse-bilan.mjs bilan.pdf            → biomarqueurs reconnus + lignes ignorées
//   node tools/parse-bilan.mjs bilan.pdf --lines    → affiche aussi toutes les lignes extraites
//   node tools/parse-bilan.mjs bilan.pdf --json     → résultat complet en JSON
//   options : --sex=f|m   --password=xxxx (PDF protégé)
//
// Les lignes « non reconnues contenant une valeur » indiquent ce qu'il faut
// ajouter au dictionnaire BIOMARKERS de bloodparser.js.
import { readFile } from 'node:fs/promises';
import { BP, pdfLines } from './pdf-lines.mjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
if (!file) { console.error('Usage : node tools/parse-bilan.mjs <bilan.pdf|bilan.txt> [--lines] [--json] [--sex=f|m] [--password=…]'); process.exit(1); }

const lines = /\.pdf$/i.test(file) ? await pdfLines(file, opt('password')) : (await readFile(file, 'utf8')).split(/\r?\n/);
const res = BP.parseLines(lines, { sex: opt('sex') });

if (args.includes('--json')) { console.log(JSON.stringify({ ...res, lines }, null, 2)); process.exit(0); }
if (args.includes('--lines')) { console.log('── Lignes extraites ──'); lines.forEach((l, i) => console.log(String(i + 1).padStart(4), l)); console.log(); }

console.log(`Date du prélèvement : ${res.date || '(non trouvée)'}`);
console.log(`Laboratoire         : ${res.lab || '(non trouvé)'}`);
console.log(`Lignes de texte     : ${res.lineCount}${res.lineCount < 5 ? '  ⚠️ PDF scanné (image) ? Pas de texte exploitable.' : ''}\n`);
const fmt = v => (v == null ? '' : String(v).replace('.', ','));
console.table(res.results.map(r => ({
  biomarqueur: r.name, valeur: (r.comparator || '') + fmt(r.value), unité: r.unit,
  référence: r.refLow == null && r.refHigh == null ? '' : `${fmt(r.refLow) || '…'} – ${fmt(r.refHigh) || '…'} (${r.refSource})`,
  statut: BP.status(r), alertes: r.flags.join(' ; '),
})));
if (res.unmatched.length) {
  console.log('\nLignes non reconnues contenant une valeur :');
  res.unmatched.forEach(l => console.log('  · ' + l.replace(/\s{2,}/g, '  ')));
}
