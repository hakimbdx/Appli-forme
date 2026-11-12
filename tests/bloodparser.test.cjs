// Tests du parseur de bilans sanguins : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const BP = require('../bloodparser.js');

const one = (line, opts) => BP.parseLines([line], opts).results[0];

test('valeur, unité et intervalle de référence', () => {
  const r = one('Glycémie à jeun   0,95 g/L   0,70 - 1,10');
  assert.equal(r.key, 'glucose');
  assert.equal(r.value, 0.95);
  assert.equal(r.refLow, 0.7);
  assert.equal(r.refHigh, 1.1);
  assert.equal(r.refSource, 'labo');
});

test('double unité : la première est retenue avec son intervalle', () => {
  const r = one('Cholestérol total   1,95 g/L   5,04 mmol/L   1,50 - 2,00   3,87 - 5,17');
  assert.equal(r.key, 'chol');
  assert.equal(r.value, 1.95);
  assert.deepEqual([r.refLow, r.refHigh], [1.5, 2]);
});

test('conversion vers l\'unité de référence', () => {
  const r = one('Glucose 5,3 mmol/L (3,9 - 6,1)');
  assert.equal(r.value, 0.9548);
  assert.equal(r.unit, 'g/L');
  assert.equal(one('Créatinine 8,0 mg/L 5,7 à 11,3').value, 70.72);
  assert.equal(one('25 OH Vitamine D (D2+D3)  45 nmol/L  75 - 250').value, 18);
});

test('LDL, HDL et total ne se confondent pas', () => {
  const res = BP.parseLines([
    'Cholestérol HDL 0,62 g/L > 0,40',
    'Cholestérol LDL calculé 1,32 g/L < 1,60',
    'Rapport cholestérol total / HDL 3,1',
    'Cholestérol total 2,10 g/L < 2,00',
  ]).results;
  const by = Object.fromEntries(res.map(r => [r.key, r]));
  assert.equal(by.hdl.value, 0.62); assert.equal(by.hdl.refLow, 0.4); assert.equal(by.hdl.refHigh, null);
  assert.equal(by.ldl.value, 1.32); assert.equal(by.ldl.refHigh, 1.6);
  assert.equal(by.chol.value, 2.1);
  assert.equal(BP.status(by.chol), 'high');
});

test('HbA1c et hémoglobine ne se confondent pas', () => {
  const res = BP.parseLines(['Hémoglobine glyquée (HbA1c)  5,6 %  4,0 - 6,0', 'Hémoglobine 13,4 g/dL 12,0 - 16,0', 'HbA1c 38 mmol/mol']).results;
  const by = Object.fromEntries(res.map(r => [r.key, r]));
  assert.equal(by.hba1c.value, 5.6);
  assert.equal(by.hb.value, 13.4);
});

test('HbA1c en mmol/mol convertie en %', () => {
  assert.equal(one('HbA1c 38 mmol/mol').value, 5.627);
});

test('comparateur et référence « inférieur à »', () => {
  const r = one('Protéine C réactive (CRP)   < 0,6 mg/L   inférieur à 5,0');
  assert.equal(r.key, 'crp');
  assert.equal(r.value, 0.6);
  assert.equal(r.comparator, '<');
  assert.equal(r.refHigh, 5);
});

test('les phrases de commentaire sont ignorées', () => {
  const res = BP.parseLines(['Cholestérol LDL : objectif inférieur à 1,00 g/L chez les patients à risque', 'Cholestérol LDL 1,45 g/L']).results;
  assert.equal(res.length, 1);
  assert.equal(res[0].value, 1.45);
});

test('les dates (antériorités) ne sont pas prises pour un intervalle', () => {
  const r = one('Ferritine  22 µg/L   15 - 150   35 (12-03-2025)');
  assert.deepEqual([r.value, r.refLow, r.refHigh], [22, 15, 150]);
});

test('numération : milliers avec espace et /mm3', () => {
  const res = BP.parseLines(['Leucocytes 6 200 /mm3 4 000 - 10 000', 'Plaquettes 245 G/L 150 - 400', 'Hématies 4,52 T/L']).results;
  const by = Object.fromEntries(res.map(r => [r.key, r]));
  assert.equal(by.gb.value, 6.2);
  assert.equal(by.plq.value, 245);
  assert.deepEqual([by.plq.refLow, by.plq.refHigh], [150, 400]);
  assert.equal(by.gr.value, 4.52);
});

test('DFG avec unité contenant 1,73', () => {
  const r = one('DFG (CKD-EPI)   98 mL/min/1,73m²   > 90');
  assert.equal(r.value, 98);
  assert.equal(r.refLow, 90);
});

test('valeur sur la ligne suivante', () => {
  const r = BP.parseLines(['Vitamine B12', '312 pg/mL 190 - 900']).results[0];
  assert.equal(r.key, 'b12');
  assert.equal(r.value, 312);
});

test('unité absente : unité de référence supposée et signalée', () => {
  const r = one('TSH ultra sensible 1,85');
  assert.equal(r.value, 1.85);
  assert.match(r.flags.join(), /unité absente/);
});

test('valeurs usuelles selon le sexe si le labo n\'en donne pas', () => {
  assert.deepEqual([one('Ferritine 20 µg/L', { sex: 'm' }).refLow], [30]);
  assert.deepEqual([one('Ferritine 20 µg/L', { sex: 'f' }).refLow], [15]);
  assert.equal(one('Ferritine 20 µg/L').refSource, 'usuel');
});

test('transaminases et gamma-GT', () => {
  const res = BP.parseLines(['Transaminases ASAT (TGO) 22 UI/L < 35', 'ALAT (TGP) 48 UI/L < 35', 'Gamma GT 30 U/L 9 - 36']).results;
  const by = Object.fromEntries(res.map(r => [r.key, r]));
  assert.equal(by.asat.value, 22); assert.equal(by.alat.value, 48); assert.equal(by.ggt.value, 30);
  assert.equal(BP.status(by.alat), 'high');
});

test('date de prélèvement (pas la date de naissance)', () => {
  const lines = ['Mme FICTIVE Exemple  née le 05/06/1990', 'Dossier n° 123', 'Prélevé le 14/03/2026 à 08h12'];
  assert.equal(BP.parseLines(lines).date, '2026-03-14');
  assert.equal(BP.parseLines(['Née le 05/06/1990', 'Date de prélèvement : 2 octobre 2026']).date, '2026-10-02');
  assert.equal(BP.parseLines(['Née le 05/06/1990', 'Édité le 03/10/2026']).date, '2026-10-03');
});

test('reconstruction des lignes à partir des éléments pdf.js', () => {
  const it = (s, x, y, w) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: w });
  const lines = BP.itemsToLines([[it('0,95', 300, 700.5, 20), it('Glycémie', 50, 700, 45), it('g/L', 330, 700, 15), it('Titre', 50, 750, 25)]]);
  assert.deepEqual(lines, ['Titre', 'Glycémie   0,95 g/L']);
});
