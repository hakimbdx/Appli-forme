// Tests du coach sportif : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../coach.js');
const D = require('../sport-data.js');

const allItems = w => w.blocks.flatMap(b => b.items);
const exos = w => allItems(w).map(i => D.BY_ID[i.id]).filter(Boolean);
const base = { fatigue: 2, injuries: {}, equipment: [], duration: 30, goal: 'burn', focus: 'full', level: 2, seed: 42 };

test('chaque exercice a des données cohérentes', () => {
  const ids = new Set();
  for (const e of D.EXERCISES) {
    assert.ok(!ids.has(e.id), 'id en double : ' + e.id); ids.add(e.id);
    assert.ok(e.lvl >= 1 && e.lvl <= 3);
    for (const z of Object.keys(e.stress)) assert.ok(D.ZONES[z], `${e.id} : zone inconnue ${z}`);
    for (const g of e.eq ? e.eq.split('+') : []) for (const k of g.split('|')) assert.ok(D.EQUIPMENT[k], `${e.id} : matériel inconnu ${k}`);
    assert.ok(e.cue.length > 10);
  }
});

test('même graine → même séance ; graine différente → séance différente', () => {
  assert.deepEqual(C.generate(base).blocks, C.generate(base).blocks);
  const ids = s => allItems(C.generate({ ...base, seed: s })).map(i => i.id).join();
  assert.ok(new Set([1, 2, 3, 4, 5].map(ids)).size > 1);
});

test('aucun exercice ne demande du matériel absent', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const goal of ['burn', 'strength', 'cardio']) {
      for (const e of exos(C.generate({ ...base, goal, seed, equipment: [] }))) assert.equal(e.eq, '', `${e.id} demande ${e.eq}`);
    }
  }
});

test('le matériel disponible est utilisé', () => {
  const w = C.generate({ ...base, goal: 'strength', equipment: ['halteres'], seed: 7 });
  assert.ok(exos(w).some(e => e.eq.includes('halteres')));
});

test('douleur : aucun exercice ne sollicite la zone ; gêne : pas de forte sollicitation', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const w1 = C.generate({ ...base, seed, injuries: { genou: 'douleur' }, equipment: ['halteres', 'chaise'] });
    for (const e of exos(w1)) assert.ok(!(e.stress.genou >= 1), `${e.id} sollicite le genou`);
    const w2 = C.generate({ ...base, seed, goal: 'strength', injuries: { epaule: 'gene' }, equipment: ['halteres', 'elastique'] });
    for (const e of exos(w2)) assert.ok(!(e.stress.epaule >= 2), `${e.id} sollicite fort l'épaule`);
  }
  assert.ok(C.generate({ ...base, injuries: { dos: 'douleur' } }).warnings.some(w => /Dos/.test(w)));
});

test('fatigue : pas de sauts, et séance récupération si épuisée', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const e of exos(C.generate({ ...base, seed, fatigue: 3 }))) assert.ok(!e.impact, `${e.id} a des sauts`);
  }
  const w = C.generate({ ...base, fatigue: 4 });
  assert.equal(w.recovery, true);
  assert.equal(w.goal, 'mobility');
  assert.equal(C.generate({ ...base, fatigue: 4, force: true }).recovery, false);
});

test('en forme : plus de volume que fatigué(e)', () => {
  const vol = f => C.generate({ ...base, goal: 'strength', fatigue: f }).blocks.find(b => b.key === 'main').items[0].sets;
  assert.ok(vol(1) > vol(3));
});

test('la durée estimée est proche de la durée demandée', () => {
  for (const duration of [10, 20, 30, 45, 60]) {
    for (const goal of ['burn', 'strength', 'cardio', 'mobility']) {
      for (const level of [1, 3]) {
        const w = C.generate({ ...base, duration, goal, level, equipment: ['halteres', 'elastique', 'chaise'] });
        assert.ok(Math.abs(w.estMinutes - duration) <= Math.max(5, duration * 0.25), `${goal} ${duration} min niveau ${level} → ${w.estMinutes} min`);
      }
    }
  }
});

test('cardio sur machine en fractionné', () => {
  const w = C.generate({ ...base, goal: 'cardio', equipment: ['velo'] });
  assert.match(w.blocks.find(b => b.key === 'main').title, /vélo/i);
});

test('remplacement d\'un exercice', () => {
  const w = C.generate({ ...base, goal: 'strength', equipment: ['halteres'] });
  const bi = w.blocks.findIndex(b => b.key === 'main');
  const before = w.blocks[bi].items[0];
  const w2 = C.swap(w, bi, 0, 99);
  const after = w2.blocks[bi].items[0];
  assert.notEqual(after.id, before.id);
  assert.equal(D.BY_ID[after.id].pattern, D.BY_ID[before.id].pattern === 'pull_v' || D.BY_ID[before.id].pattern === 'pull_h' ? D.BY_ID[after.id].pattern : D.BY_ID[before.id].pattern);
  assert.equal(after.sets, before.sets);
  const f = C.findItem(w, `remplace ${before.name.toLowerCase()}`);
  assert.deepEqual([f.bi, f.ii], [bi, 0]);
});

test('déroulé pas à pas', () => {
  const w = C.generate({ ...base, goal: 'strength' });
  const steps = C.flatten(w);
  assert.ok(steps.some(s => s.kind === 'reps'));
  assert.ok(steps.some(s => s.kind === 'rest'));
  assert.notEqual(steps.at(-1).kind, 'rest');
  const c = C.flatten(C.generate(base));
  assert.ok(c.some(s => /Tour 1\//.test(s.label || '')));
});

test('compréhension des messages', () => {
  const p = C.parse('Je suis crevée, j\'ai un peu mal au genou, 20 min avec mes haltères');
  assert.equal(p.fatigue, 4);
  assert.deepEqual(p.injuries, { genou: 'gene' });
  assert.deepEqual(p.equipmentAdd, ['halteres']);
  assert.equal(p.duration, 20);

  assert.equal(C.parse('en pleine forme !').fatigue, 1);
  assert.equal(C.parse('pas trop en forme').fatigue, 3);
  assert.equal(C.parse('ça va bien').fatigue, 2);
  assert.deepEqual(C.parse('entorse à la cheville').injuries, { cheville: 'douleur' });
  assert.deepEqual(C.parse('mon genou va mieux').injuriesRemove, ['genou']);
  assert.deepEqual(C.parse('aucune douleur').injuries, {});
  assert.deepEqual(C.parse('pas de matériel').equipment, []);
  assert.deepEqual(C.parse('j\'ai un élastique mais pas d\'haltères').equipmentAdd, ['elastique']);
  assert.deepEqual(C.parse('j\'ai un élastique mais pas d\'haltères').equipmentRemove, ['halteres']);
  assert.equal(C.parse('une demi-heure').duration, 30);
  assert.equal(C.parse('1h15').duration, 75);
  assert.equal(C.parse('je veux muscler mes fessiers').goal, 'strength');
  assert.equal(C.parse('je veux muscler mes fessiers').focus, 'lower');
  assert.equal(C.parse('muscler le dos').injuries, undefined);
  assert.equal(C.parse('muscler le dos').focus, 'upper');
  assert.equal(C.parse('renforcement des abdos').intents.includes('force'), false);
  assert.ok(C.parse('trop dur').intents.includes('easier'));
  assert.ok(C.parse('sans sauts, j\'ai des voisins').intents.includes('lowImpact'));
  assert.ok(C.parse('remplace les pompes').intents.includes('swap'));
  assert.ok(C.parse('une autre séance').intents.includes('reroll'));
  assert.equal(C.understood(C.parse('blablabla')), false);
});
