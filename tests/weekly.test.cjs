// Tests des bilans hebdomadaires : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../weekly.js');

const WS = '2026-11-09'; // lundi
const PREV = '2026-11-02';
const target = { kcal: 1500, protein: 95 };
// Génère 14 jours (semaine précédente + semaine étudiée)
function days(fn) {
  return [...Array(14)].map((_, i) => ({ date: W.addDays(PREV, i), ...fn(i >= 7, i % 7) }));
}

const greatWeek = () => ({
  target, waterGoal: 8, sex: 'f', profile: { goal: -500, startWeight: 72 },
  days: days((cur, d) => ({ kcal: cur ? 1450 : 1700, protein: cur ? 100 : 70, burned: 0, water: cur ? 8 : 4, meals: { 'Dîner': 600, 'Déjeuner': 500, 'Petit-déjeuner': 350 } })),
  weights: [{ date: '2026-11-03', kg: 70.2 }, { date: '2026-11-15', kg: 69.5 }],
  sessions: [{ date: '2026-11-10', minutes: 30 }, { date: '2026-11-12', minutes: 30 }, { date: '2026-11-14', minutes: 40 }, { date: '2026-11-04', minutes: 30 }],
  lifts: { squat_gobelet: [{ date: '2026-11-04', sets: [{ kg: 8, reps: 12 }] }, { date: '2026-11-12', sets: [{ kg: 10, reps: 10 }] }] },
  names: { squat_gobelet: 'Squat gobelet' }, runs: [], steps: [], readiness: { level: 'green', reasons: [] },
  previousChallenge: { type: 'sessions', target: 3, label: 'faire 3 séances de sport' },
});

test('semaine réussie : victoires et ton enthousiaste', () => {
  const r = W.build(greatWeek(), WS);
  assert.equal(r.label, 'du 9 au 15 novembre');
  assert.equal(r.mood, 'great');
  assert.match(r.summary, /, noté tes repas 7 jours sur 7 et ton poids a baissé de 0,7 kg\.$/);
  const txt = r.victories.map(v => v.text).join(' | ');
  assert.match(txt, /Défi de la semaine réussi/);
  assert.match(txt, /-0,7 kg cette semaine/);
  assert.match(txt, /record : Squat gobelet \(10 kg × 10\)/);
  assert.ok(r.victories.length <= 4);
  assert.equal(r.previousChallenge.done, true);
  // tout est au vert : l'axe propose de passer au niveau suivant
  assert.equal(r.focus.key, 'next');
  assert.match(W.toText(r), /🎯 Ton axe de la semaine/);
});

test('peu de repas notés → axe « noter ses repas » avec défi mesurable', () => {
  const input = { ...greatWeek(), days: days((cur, d) => ({ kcal: cur && d > 1 ? 0 : 1500, protein: 90, water: 8 })), previousChallenge: null };
  const r = W.build(input, WS);
  assert.equal(r.focus.key, 'logging');
  assert.deepEqual(r.challenge, { type: 'log_days', target: 5, label: 'noter tes repas au moins 5 jours' });
});

test('dépassements surtout au dîner → conseil ciblé sur le dîner', () => {
  const input = { ...greatWeek(), sessions: [{ date: '2026-11-10', minutes: 30 }, { date: '2026-11-13', minutes: 30 }],
    days: days((cur, d) => ({ kcal: cur && d < 4 ? 2000 : 1450, protein: 100, water: 8, meals: cur && d < 4 ? { 'Petit-déjeuner': 350, 'Déjeuner': 500, 'Dîner': 1150 } : { 'Dîner': 500 } })) };
  const r = W.build(input, WS);
  assert.equal(r.focus.key, 'over');
  assert.match(r.focus.tip, /dîner/);
  assert.equal(r.stats.worstMeal, 'Dîner');
});

test('sous-alimentation prioritaire sur les autres axes', () => {
  const input = { ...greatWeek(), days: days(() => ({ kcal: 900, protein: 50, water: 2 })) };
  assert.equal(W.build(input, WS).focus.key, 'under');
});

test('surentraînement → axe récupération', () => {
  const input = { ...greatWeek(), readiness: { level: 'red', reasons: ['Charge de la semaine 1,8 fois supérieure à ta moyenne.'] } };
  const r = W.build(input, WS);
  assert.equal(r.focus.key, 'recovery');
  assert.equal(r.challenge.type, 'rest_days');
});

test('semaine sans données : ton bienveillant et victoire par défaut', () => {
  const r = W.build({ days: [], sessions: [], weights: [], runs: [], previousChallenge: null }, WS);
  assert.equal(r.mood, 'tough');
  assert.equal(r.victories.length, 1);
  assert.equal(r.focus.key, 'logging');
});

test('défi non réussi : valeur mesurée', () => {
  const input = { ...greatWeek(), previousChallenge: { type: 'water_days', target: 7, label: 'boire 8 verres tous les jours' },
    days: days((cur, d) => ({ kcal: 1450, protein: 100, water: d < 5 ? 8 : 3 })) };
  const r = W.build(input, WS);
  assert.deepEqual([r.previousChallenge.done, r.previousChallenge.value], [false, 5]);
  assert.match(W.toText(r), /5\/7\. Tout près/);
  assert.match(W.challengeNote({ type: 'water_days', value: 0, target: 5 }), /retente/);
  assert.match(W.challengeNote({ type: 'water_days', value: 4, target: 5 }), /presque/);
});

test('course : progrès d\'allure et kilomètres', () => {
  const runs = [['2026-10-20', 33], ['2026-10-27', 33], ['2026-11-03', 32.5], ['2026-11-11', 31], ['2026-11-14', 31.2]].map(([date, min]) => ({ date, km: 5, min, rpe: 5 }));
  const r = W.build({ ...greatWeek(), runs }, WS);
  assert.ok(r.stats.paceGain >= 5, String(r.stats.paceGain));
  assert.equal(r.stats.km, 10);
});

test('semaine à résumer : dimanche soir = semaine en cours, sinon la précédente', () => {
  assert.equal(W.dueWeek(new Date(2026, 10, 15, 19, 0)), '2026-11-09'); // dimanche 19 h
  assert.equal(W.dueWeek(new Date(2026, 10, 15, 10, 0)), '2026-11-02'); // dimanche matin
  assert.equal(W.dueWeek(new Date(2026, 10, 18, 9, 0)), '2026-11-09');  // mercredi suivant
});
