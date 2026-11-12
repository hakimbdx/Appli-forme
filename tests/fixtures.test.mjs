// Lecture complète des bilans FICTIFS en PDF (pdf.js + parseur)
import test from 'node:test';
import assert from 'node:assert/strict';
import { BP, pdfLines } from '../tools/pdf-lines.mjs';

const parse = async f => BP.parseLines(await pdfLines(new URL(`./fixtures/${f}`, import.meta.url)), { sex: 'f' });
const byKey = res => Object.fromEntries(res.results.map(r => [r.key, r]));

test('bilan fictif de mars 2026 (tableau à colonnes)', async () => {
  const res = await parse('bilan-fictif-2026-03.pdf');
  const r = byKey(res);
  assert.equal(res.date, '2026-03-14');
  assert.equal(res.lab, 'LABORATOIRE FICTIF DE BIOLOGIE MÉDICALE');
  assert.equal(res.results.length, 22);
  assert.equal(r.chol.value, 2.24); assert.equal(BP.status(r.chol), 'high');
  assert.equal(r.creat.value, 62.76);
  assert.equal(r.crp.comparator, '<');
  assert.equal(BP.status(r.ferritine), 'low');
  assert.equal(BP.status(r.vitd), 'low');
  assert.deepEqual([r.hb.value, r.hb.refLow, r.hb.refHigh], [11.6, 12, 16]);
});

test('bilan fictif d\'octobre 2026 (lignes avec pointillés)', async () => {
  const res = await parse('bilan-fictif-2026-10.pdf');
  const r = byKey(res);
  assert.equal(res.date, '2026-10-02');
  assert.equal(res.results.length, 10);
  assert.equal(r.glucose.value, 1.009);
  assert.deepEqual([r.ldl.refLow, r.ldl.refHigh], [null, 1.6]);
  assert.deepEqual([r.vitd.value, r.vitd.refLow], [31, 30]);
});
