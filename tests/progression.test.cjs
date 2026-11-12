// Tests de la surcharge progressive et du suivi de charge : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../progression.js');

const S = (date, kg, reps, target = '10-12', rpe = 7) => ({ date, target, rpe, sets: reps.map(r => ({ kg, reps: r })) });

test('arrondi des charges', () => {
  assert.equal(P.roundLoad(8, 1), 9);
  assert.equal(P.roundLoad(20, 1), 22);
  assert.equal(P.roundLoad(8, -1), 7);
  assert.equal(P.roundLoad(12, 1, 'kettlebell'), 14);
  assert.equal(P.roundLoad(12, -1, 'kettlebell'), 10);
});

test('double progression : toutes les séries au maximum → charge augmentée', () => {
  const s = P.suggestLift([S('2026-11-01', 8, [12, 12, 12])], { id: 'squat_gobelet', loaded: true });
  assert.equal(s.action, 'up');
  assert.equal(s.kg, 9);
});

test('dans la fourchette → même charge, une répétition de plus', () => {
  const s = P.suggestLift([S('2026-11-01', 8, [11, 10, 10])], { id: 'squat_gobelet', loaded: true });
  assert.equal(s.action, 'hold');
  assert.equal(s.kg, 8);
  assert.equal(s.reps, '12');
});

test('séance au maximum mais effort 9+/10 → pas d\'augmentation', () => {
  assert.notEqual(P.suggestLift([S('2026-11-01', 8, [12, 12, 12], '10-12', 9)], { id: 'squat_gobelet', loaded: true }).action, 'up');
});

test('échec deux séances de suite → charge diminuée', () => {
  const s = P.suggestLift([S('2026-11-01', 10, [8, 7, 6]), S('2026-11-04', 10, [9, 7, 6])], { id: 'squat_gobelet', loaded: true });
  assert.equal(s.action, 'down');
  assert.ok(s.kg < 10);
  // un seul échec : on confirme d'abord
  assert.equal(P.suggestLift([S('2026-11-04', 10, [9, 7, 6])], { id: 'squat_gobelet', loaded: true }).action, 'hold');
});

test('stagnation sur 3 séances → séance allégée', () => {
  const s = P.suggestLift([S('2026-11-01', 10, [11, 10, 10]), S('2026-11-04', 10, [11, 10, 10]), S('2026-11-07', 10, [10, 10, 10])], { id: 'squat_gobelet', loaded: true });
  assert.equal(s.action, 'deload');
});

test('poids du corps : maximum deux fois → variante plus difficile', () => {
  const s = P.suggestLift([S('2026-11-01', 0, [12, 12]), S('2026-11-03', 0, [12, 13])], { id: 'pompes_genoux', loaded: false });
  assert.equal(s.action, 'variant');
  assert.equal(s.toId, 'pompes');
  // variante filtrée (matériel, douleur) : on augmente les répétitions à la place
  const s2 = P.suggestLift([S('2026-11-01', 0, [12, 12]), S('2026-11-03', 0, [12, 13])], { id: 'pompes_genoux', loaded: false, canUse: () => false });
  assert.equal(s2.action, 'up');
});

test('exercice en durée : +5 s', () => {
  const s = P.suggestLift([{ date: '2026-11-01', target: '30', rpe: 6, time: true, sets: [{ secs: 30 }, { secs: 30 }] }], { id: 'planche' });
  assert.equal(s.action, 'longer');
  assert.equal(s.secs, 35);
});

// Génère des séances régulières : n jours, une séance tous les k jours
const plan = (end, days, every, minutes, rpe) => [...Array(days)].map((_, i) => i).filter(i => i % every === 0)
  .map(i => ({ date: P.addDays(end, -i), minutes, rpe }));

test('charge régulière → feu vert', () => {
  const r = P.readiness({ sessions: plan('2026-11-12', 35, 2, 40, 6), today: '2026-11-12' });
  assert.equal(r.level, 'green');
  assert.ok(r.load.acwr > 0.8 && r.load.acwr < 1.3);
});

test('pic de charge (ratio aigu/chronique > 1,5) → feu rouge et difficulté réduite', () => {
  const sessions = [...plan('2026-11-05', 28, 3, 30, 5), ...plan('2026-11-12', 7, 1, 60, 8)];
  const r = P.readiness({ sessions, today: '2026-11-12' });
  assert.ok(r.load.acwr > 1.5, 'ratio ' + r.load.acwr);
  assert.equal(r.level, 'red');
  assert.equal(r.adj, -1);
  assert.ok(r.reasons.some(x => /surentraînement/.test(x)));
});

test('sous-charge avec séances faciles → feu vert et difficulté augmentée', () => {
  const sessions = [...plan('2026-11-05', 28, 2, 50, 6).filter(s => s.date < '2026-11-06'), { date: '2026-11-10', minutes: 20, rpe: 5 }, { date: '2026-11-12', minutes: 20, rpe: 5 }];
  const r = P.readiness({ sessions, today: '2026-11-12' });
  assert.equal(r.level, 'green');
  assert.equal(r.adj, 1);
});

test('signaux de fatigue cumulés → feu orange ou rouge', () => {
  const sessions = plan('2026-11-12', 35, 1, 30, 9);
  const fatigueLog = ['2026-11-08', '2026-11-10', '2026-11-12'].map(date => ({ date, fatigue: 3 }));
  const r = P.readiness({ sessions, fatigueLog, today: '2026-11-12' });
  assert.notEqual(r.level, 'green');
  assert.ok(r.reasons.some(x => /sans repos/.test(x)));
  assert.ok(r.reasons.some(x => /fatigué/.test(x)));
});

test('baisse de performance sur plusieurs exercices détectée', () => {
  const lifts = {
    squat_gobelet: [S('2026-11-05', 12, [12, 12, 12]), S('2026-11-10', 12, [8, 7, 6])],
    rowing_haltere: [S('2026-11-05', 10, [12, 12, 12]), S('2026-11-10', 10, [8, 8, 7])],
  };
  const r = P.readiness({ sessions: plan('2026-11-12', 30, 3, 40, 6), lifts, today: '2026-11-12' });
  assert.ok(r.reasons.some(x => /baisse sur 2 exercices/.test(x)));
});

test('course : allure facile, tendance et volume de la semaine', () => {
  const runs = [
    { date: '2026-10-20', km: 5, min: 33, rpe: 5 }, { date: '2026-10-23', km: 5, min: 33, rpe: 5 }, { date: '2026-10-27', km: 5, min: 32.5, rpe: 5 },
    { date: '2026-10-30', km: 5, min: 31.5, rpe: 5 }, { date: '2026-11-03', km: 6, min: 37, rpe: 5 }, { date: '2026-11-06', km: 6, min: 36.6, rpe: 5 },
  ];
  const r = P.suggestRun(runs, '2026-11-10');
  assert.equal(r.trend, 'faster');
  assert.ok(r.easyPace > 360 && r.easyPace < 400, P.fmtPace(r.easyPace));
  // allure qui se dégrade à effort plus élevé
  assert.ok(Math.abs(r.targetWeekKm - 13.2) < 0.01, 'objectif ' + r.targetWeekKm); // 12 km × 1,1
  // allure qui se dégrade à effort plus élevé
  const slow = ['2026-10-20', '2026-10-23', '2026-10-27', '2026-10-30', '2026-11-03', '2026-11-06']
    .map((date, i) => ({ date, km: 5, min: i < 3 ? 33 : 35, rpe: i < 3 ? 5 : 6 }));
  assert.equal(P.suggestRun(slow, '2026-11-10').trend, 'slower');
  // 3 semaines de vraie hausse → semaine allégée
  const up = [['2026-10-21', 8], ['2026-10-28', 10], ['2026-11-04', 12]].map(([date, km]) => ({ date, km, min: km * 6.5, rpe: 5 }));
  const ru = P.suggestRun(up, '2026-11-10');
  assert.ok(ru.targetWeekKm < 12, 'allégée ' + ru.targetWeekKm);
  assert.ok(ru.reasons.some(x => /allégée/.test(x)));
  // feu rouge : sortie très facile
  assert.equal(P.suggestRun(runs, '2026-11-10', 'red').next.type, 'easy');
  assert.ok(P.suggestRun([], '2026-11-10').empty);
  assert.equal(P.fmtPace(375), '6:15/km');
});
