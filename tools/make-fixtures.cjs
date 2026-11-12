// Génère des bilans FICTIFS en PDF (tests/fixtures) pour tester le parseur.
// Nécessite Playwright (node tools/make-fixtures.cjs). Les patients et les valeurs sont inventés.
const { chromium } = require('playwright');
const path = require('path');

const css = `body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222;margin:28px}
h1{font-size:14pt;margin:0}h2{font-size:11pt;background:#eee;padding:3px 6px;margin:14px 0 4px}
table{width:100%;border-collapse:collapse}td,th{padding:3px 6px;text-align:left;vertical-align:top}
th{font-size:8.5pt;color:#555;border-bottom:1px solid #999}.v{font-weight:bold}.small{font-size:8pt;color:#666}
.com{font-size:8.5pt;font-style:italic;color:#444;margin:4px 6px}.hdr{display:flex;justify-content:space-between}`;

const rowA = (n, v, u, r, ant = '') => `<tr><td>${n}</td><td class="v">${v}</td><td>${u}</td><td>${r}</td><td class="small">${ant}</td></tr>`;
const A = `<style>${css}</style>
<div class="hdr"><div><h1>LABORATOIRE FICTIF DE BIOLOGIE MÉDICALE</h1><div class="small">12 rue de l'Exemple – 33000 Bordeaux – Document de test</div></div>
<div>Mme FICTIVE Exemple<br>Née le 05/06/1990<br>Dossier n° 2603140042</div></div>
<p>Prélevé le 14/03/2026 à 08:12 – Édité le 14/03/2026</p>
<h2>HÉMATOLOGIE – Numération formule sanguine</h2>
<table><tr><th>Analyse</th><th>Résultat</th><th>Unité</th><th>Valeurs de référence</th><th>Antériorités</th></tr>
${rowA('Hématies', '4,31', 'T/L', '3,80 - 5,20')}
${rowA('Hémoglobine', '11,6', 'g/dL', '12,0 - 16,0', '12,4 (10/09/2025)')}
${rowA('Hématocrite', '35,8', '%', '37,0 - 47,0')}
${rowA('VGM', '83', 'fL', '80 - 100')}
${rowA('Leucocytes', '6,40', 'G/L', '4,00 - 10,00')}
${rowA('Plaquettes', '268', 'G/L', '150 - 400')}
</table>
<h2>BIOCHIMIE</h2>
<table><tr><th>Analyse</th><th>Résultat</th><th>Unité</th><th>Valeurs de référence</th><th>Antériorités</th></tr>
${rowA('Glycémie à jeun', '0,98', 'g/L', '0,70 - 1,10', '0,94 (10/09/2025)')}
${rowA('Hémoglobine glyquée (HbA1c)', '5,7', '%', '4,0 - 6,0')}
${rowA('Cholestérol total', '2,24<br><span class="small">5,79</span>', 'g/L<br><span class="small">mmol/L</span>', '< 2,00')}
${rowA('Cholestérol HDL', '0,58', 'g/L', '> 0,50')}
${rowA('Cholestérol LDL calculé', '1,48', 'g/L', '< 1,60')}
${rowA('Triglycérides', '0,92', 'g/L', '< 1,50')}
${rowA('Créatinine', '7,1', 'mg/L', '5,0 - 9,6')}
${rowA('DFG (CKD-EPI)', '104', 'mL/min/1,73m²', '> 90')}
${rowA('Transaminases ASAT (TGO)', '19', 'UI/L', '< 35')}
${rowA('Transaminases ALAT (TGP)', '24', 'UI/L', '< 35')}
${rowA('Gamma GT', '18', 'UI/L', '< 38')}
${rowA('Protéine C réactive (CRP)', '< 0,6', 'mg/L', '< 5,0')}
</table>
<p class="com">Cholestérol LDL : selon les recommandations, l'objectif est inférieur à 1,00 g/L chez les patients à haut risque.</p>
<h2>FER – VITAMINES – HORMONOLOGIE</h2>
<table><tr><th>Analyse</th><th>Résultat</th><th>Unité</th><th>Valeurs de référence</th><th>Antériorités</th></tr>
${rowA('Ferritine', '12', 'µg/L', '15 - 150', '21 (10/09/2025)')}
${rowA('25-OH Vitamine D (D2+D3)', '17,5', 'ng/mL', '30 - 100')}
${rowA('Vitamine B12', '356', 'pg/mL', '190 - 900')}
${rowA('TSH ultra sensible', '1,92', 'mUI/L', '0,40 - 4,00')}
</table>
<p class="com">Vitamine D : insuffisance entre 10 et 30 ng/mL.</p>`;

const rowB = (n, v, r) => `<div>${n} ${'.'.repeat(Math.max(4, 40 - n.length))} <b>${v}</b> &nbsp; (${r})</div>`;
const B = `<style>${css} div{margin:2px 0}</style>
<h1>Biologie Exemple – laboratoire fictif</h1>
<p>Patient : FICTIVE Exemple – Date de naissance : 05/06/1990<br>Date de prélèvement : 2 octobre 2026</p>
<h2>Biochimie sanguine</h2>
${rowB('Glycémie à jeun', '5,6 mmol/L', '3,9 à 6,1')}
${rowB('HbA1c', '5,5 %', '4,0 à 6,0')}
${rowB('Cholestérol total', '1,98 g/L', 'inférieur à 2,00')}
${rowB('HDL cholestérol', '0,61 g/L', 'supérieur à 0,50')}
${rowB('LDL cholestérol', '1,21 g/L', 'inférieur à 1,60')}
${rowB('Triglycérides', '0,81 g/L', 'inférieur à 1,50')}
${rowB('Ferritine', '34 ng/mL', '15 à 150')}
${rowB('Vitamine D 25-OH', '31 ng/mL', '30 à 100')}
${rowB('Hémoglobine', '12,7 g/dL', '12,0 à 16,0')}
${rowB('TSH', '2,10 mUI/L', '0,40 à 4,00')}
<p class="com">Résultats validés par le biologiste. Document fictif de démonstration.</p>`;

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, html] of [['bilan-fictif-2026-03.pdf', A], ['bilan-fictif-2026-10.pdf', B]]) {
    await p.setContent(html);
    await p.pdf({ path: path.join(__dirname, '..', 'tests', 'fixtures', name), format: 'A4' });
  }
  await b.close();
})();
