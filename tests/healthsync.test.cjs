// Tests de la lecture du texte du raccourci « Synchro Forme » : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../healthsync.js');

test('format de base avec unités et séparateurs français', () => {
  const d = H.parse('FORME;kcal=412,6 kcal;min=34 min;pas=8 523 pas;poids=71,4 kg');
  assert.deepEqual([d.kcal, d.min, d.pas, d.poids, d.run], [412.6, 34, 8523, 71.4, null]);
  assert.equal(H.parse('bonjour'), null);
  assert.equal(H.parse('FORME;kcal=500;min=40;pas=9000;poids=').poids, null);
});

test('course du jour : distance et durée dans différents formats', () => {
  assert.deepEqual(H.parse('FORME;kcal=500;min=40;pas=9000;poids=;course=5,2 km;duree=32:30').run, { km: 5.2, min: 32.5 });
  assert.deepEqual(H.parse('FORME;kcal=1;course=5200 m;duree=1 h 5 min').run, { km: 5.2, min: 65 });
  assert.deepEqual(H.parse('FORME;kcal=1;course=3,1 mi;duree=1950').run, { km: 4.99, min: 32.5 });
  assert.equal(H.parse('FORME;kcal=1;course=;duree=').run, null);
  assert.equal(H.parse('FORME;kcal=1;course=0 km;duree=0').run, null);
  // le mot « min » de la durée ne doit pas être confondu avec le champ min
  assert.equal(H.parse('FORME;kcal=1;min=34;course=5 km;duree=30 min').min, 34);
});

test('durées', () => {
  assert.equal(H.durationMin('1:05:00'), 65);
  assert.equal(H.durationMin('45 min'), 45);
  assert.equal(H.durationMin('2 h'), 120);
  assert.equal(H.durationMin('90 s'), 1.5);
  assert.equal(H.durationMin('32'), 32);
});
