/*
 * Surcharge progressive et prévention du surentraînement.
 * Fichier partagé entre l'application (navigateur) et les tests (Node).
 *
 * - suggestLift : double progression par exercice (charge ou variante plus difficile)
 * - trainingLoad / readiness : charge d'entraînement (RPE × minutes), ratio aigu/chronique,
 *   monotonie, baisse de performance, fatigue déclarée → feu vert / orange / rouge
 * - suggestRun : allure facile, progression du volume (≈ 10 %/semaine), type de sortie
 *
 * Toutes les dates sont au format 'YYYY-MM-DD'. Les fonctions sont pures : on leur passe
 * l'historique et la date du jour.
 */
(function (root, factory) {
  const data = typeof module !== 'undefined' && module.exports ? require('./sport-data.js') : root.SportData;
  const api = factory(data);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Progression = api;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  // ---------- Dates ----------
  const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const toStr = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

  // ---------- Musculation ----------
  const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0); // formule d'Epley
  function range(target) {
    const [lo, hi] = String(target || '10-12').split('-').map(Number);
    return [lo, hi || lo];
  }
  const KB = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40];
  // Arrondi à une charge réaliste : haltères au kg (2 kg au-delà de 10 kg), kettlebells standards
  function roundLoad(kg, dir, kind = 'halteres') {
    if (kind === 'kettlebell') {
      if (dir > 0) return KB.find(x => x > kg + 0.01) ?? kg + 4;
      if (dir < 0) return [...KB].reverse().find(x => x < kg - 0.01) ?? Math.max(2, kg - 2);
      return KB.reduce((a, b) => (Math.abs(b - kg) < Math.abs(a - kg) ? b : a));
    }
    const step = kg < 10 ? 1 : 2;
    if (dir > 0) return Math.max(Math.ceil((kg * 1.05) / step) * step, kg + step);
    if (dir < 0) return Math.max(step, Math.min(Math.floor((kg * 0.9) / step) * step, kg - step));
    return Math.round(kg / step) * step;
  }
  const bestE1rm = e => Math.max(0, ...e.sets.map(s => e1rm(s.kg || 0, s.reps || 0)));
  const totalReps = e => e.sets.reduce((a, s) => a + (s.reps || 0), 0);
  const mainKg = e => Math.max(0, ...e.sets.map(s => s.kg || 0));

  // Variante plus difficile (ou plus facile) de la même famille, faisable avec le matériel
  function variant(id, dir, ok = () => true) {
    const ex = D.BY_ID[id];
    if (!ex) return null;
    const same = D.EXERCISES.filter(e => e.pattern === ex.pattern && e.id !== id && e.time === ex.time && e.lvl === ex.lvl + dir && ok(e));
    return same[0] || null;
  }

  /*
   * entries : [{ date, sets: [{ kg, reps }], target: '10-12', rpe, time }] triées ou non
   * opts : { loaded: bool, kind: 'halteres'|'kettlebell', canUse: e => bool }
   * → { action: 'new'|'up'|'hold'|'down'|'variant'|'easier'|'deload'|'longer', kg, reps, toId, text, reason }
   */
  function suggestLift(entries, opts = {}) {
    const list = [...(entries || [])].filter(e => e.sets?.length).sort((a, b) => a.date.localeCompare(b.date));
    const ex = D.BY_ID[opts.id] || {};
    if (!list.length) return { action: 'new', text: opts.loaded ? 'Première fois : choisis une charge qui te laisse 2 répétitions en réserve.' : 'Première fois : note tes répétitions pour suivre ta progression.' };
    const last = list.at(-1), prev = list.at(-2);
    const [lo, hi] = range(last.target);
    const n = last.sets.length;
    const allTop = last.sets.every(s => s.reps >= hi);
    const fails = last.sets.filter(s => s.reps < lo).length;
    const failed = fails >= Math.ceil(n / 2) || (last.rpe ?? 7) >= 10;
    const hard = (last.rpe ?? 7) >= 9;
    const prevFailed = prev && (prev.sets.filter(s => s.reps < range(prev.target)[0]).length >= Math.ceil(prev.sets.length / 2) || (prev.rpe ?? 7) >= 10);

    // Exercice en durée (gainage…) : +5 s quand c'est réussi sans peine
    if (ex.time || last.time) {
      const secs = Math.max(...last.sets.map(s => s.secs || 0));
      if (!secs) return { action: 'hold', text: 'Continue à noter tes séries.' };
      if (failed || hard) return { action: 'hold', secs, text: `Garde ${secs} s, en restant bien gainé(e).`, reason: 'Effort ressenti élevé.' };
      return { action: 'longer', secs: secs + 5, text: `Passe à ${secs + 5} s.`, reason: 'Durée tenue sans difficulté.' };
    }

    if (opts.loaded) {
      const kg = mainKg(last);
      if (!kg) return { action: 'new', text: 'Note la charge utilisée pour suivre ta progression.' };
      // Stagnation : même charge sur 3 séances sans progrès de répétitions
      const last3 = list.slice(-3);
      const stagnant = last3.length === 3 && last3.every(e => mainKg(e) === kg) && totalReps(last3[2]) <= totalReps(last3[0]) && !allTop;
      if (failed && prevFailed) {
        const down = roundLoad(kg, -1, opts.kind);
        return { action: 'down', kg: down, reps: `${lo}-${hi}`, text: `Baisse à ${down} kg (${lo}-${hi} rép.).`, reason: 'Répétitions manquées deux séances de suite : on consolide la technique.' };
      }
      if (stagnant) {
        const down = roundLoad(kg, -1, opts.kind);
        return { action: 'deload', kg: down, reps: `${hi}`, text: `Séance allégée à ${down} kg, puis reprends ${kg} kg.`, reason: 'Pas de progrès depuis 3 séances : un allègement aide à relancer la progression.' };
      }
      if (allTop && !hard) {
        const up = roundLoad(kg, 1, opts.kind);
        return { action: 'up', kg: up, reps: `${lo}-${hi}`, text: `Augmente à ${up} kg (vise ${lo}-${hi} rép.).`, reason: `Toutes les séries à ${hi} répétitions ou plus.` };
      }
      if (failed) return { action: 'hold', kg, reps: `${lo}`, text: `Garde ${kg} kg et vise au moins ${lo} rép.`, reason: 'Séance difficile : on confirme avant de changer.' };
      const best = Math.max(...last.sets.map(s => s.reps));
      return { action: 'hold', kg, reps: `${Math.min(hi, best + 1)}`, text: `Garde ${kg} kg et vise ${Math.min(hi, best + 1)} rép. par série.`, reason: 'Encore de la marge dans la fourchette de répétitions.' };
    }

    // Poids du corps / élastique : répétitions puis variante plus difficile
    const twiceTop = allTop && prev && prev.sets.every(s => s.reps >= range(prev.target)[1]);
    if (twiceTop && !hard) {
      const v = variant(opts.id, 1, opts.canUse);
      if (v) return { action: 'variant', toId: v.id, text: `Passe à « ${v.name} ».`, reason: `Haut de la fourchette atteint deux séances de suite.` };
      return { action: 'up', reps: `${lo + 2}-${hi + 3}`, text: `Vise ${lo + 2}-${hi + 3} rép., descente lente sur 3 s.`, reason: 'Haut de la fourchette atteint deux séances de suite.' };
    }
    if (failed && prevFailed) {
      const v = variant(opts.id, -1, opts.canUse);
      if (v) return { action: 'easier', toId: v.id, text: `Reviens à « ${v.name} » pour consolider.`, reason: 'Répétitions manquées deux séances de suite.' };
      return { action: 'down', reps: `${Math.max(4, lo - 2)}-${Math.max(6, hi - 2)}`, text: `Vise ${Math.max(4, lo - 2)}-${Math.max(6, hi - 2)} rép.`, reason: 'Répétitions manquées deux séances de suite.' };
    }
    return { action: 'hold', reps: `${lo}-${hi}`, text: allTop ? 'Encore une séance au top et on passe à la variante supérieure.' : `Vise ${hi} rép. sur toutes les séries.`, reason: '' };
  }

  // ---------- Course à pied ----------
  const pace = (km, min) => (km > 0 && min > 0 ? (min * 60) / km : null); // secondes par km
  const fmtPace = s => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km` : '—');
  const weekStart = s => { const d = toDate(s); const wd = (d.getUTCDay() + 6) % 7; return addDays(s, -wd); }; // lundi

  /*
   * runs : [{ date, km, min, rpe, type: 'easy'|'interval'|'long' }]
   * → { easyPace, trend, thisWeekKm, lastWeekKm, targetWeekKm, next: { type, minutes, pace, text }, reasons }
   */
  function suggestRun(runs, today, readinessLevel = 'green') {
    const list = [...(runs || [])].filter(r => r.km > 0 && r.min > 0).sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length) return { empty: true, next: { type: 'easy', minutes: 20, text: 'Commence par 20 min de footing très facile (tu dois pouvoir parler), en alternant course et marche si besoin.' }, reasons: [] };
    const recent = list.filter(r => daysBetween(r.date, today) <= 42);
    const easy = recent.filter(r => (r.rpe ?? 5) <= 6 && r.type !== 'interval');
    const pool = (easy.length ? easy : recent.length ? recent : list).slice(-6);
    let easyPace = median(pool.map(r => pace(r.km, r.min)));
    if (!easy.length) easyPace += 20; // pas de sortie facile : on ralentit un peu la référence
    const reasons = [];

    // Tendance : allure facile des 3 dernières vs 3 précédentes, à effort comparable
    let trend = 'stable';
    if (easy.length >= 4) {
      const a = easy.slice(-6, -3), b = easy.slice(-3);
      const pa = median(a.map(r => pace(r.km, r.min))), pb = median(b.map(r => pace(r.km, r.min)));
      const ra = mean(a.map(r => r.rpe ?? 5)), rb = mean(b.map(r => r.rpe ?? 5));
      if (pb < pa * 0.98 && rb <= ra + 0.5) { trend = 'faster'; reasons.push('Ton allure facile s\'améliore à effort égal 👏'); }
      else if (pb > pa * 1.04 && rb >= ra) { trend = 'slower'; reasons.push('Ton allure facile ralentit alors que l\'effort ressenti est le même ou plus élevé : signe de fatigue.'); }
    }
    // Footings ressentis comme durs : on ralentit
    const lastEasy = list.filter(r => r.type !== 'interval').slice(-2);
    if (lastEasy.length && mean(lastEasy.map(r => r.rpe ?? 5)) >= 7.5) { easyPace += 15; reasons.push('Tes dernières sorties « faciles » étaient dures : ralentis l\'allure de footing.'); }
    else if (trend === 'faster') easyPace -= 5;

    const ws = weekStart(today);
    const kmIn = (from, to) => list.filter(r => r.date >= from && r.date < to).reduce((a, r) => a + r.km, 0);
    const thisWeekKm = kmIn(ws, addDays(ws, 7));
    const lastWeekKm = kmIn(addDays(ws, -7), ws);
    const weeks = [1, 2, 3, 4].map(i => kmIn(addDays(ws, -7 * i), addDays(ws, -7 * (i - 1))));
    const base = Math.max(lastWeekKm, mean(weeks.filter(x => x > 0)) || 0, 5);
    // Semaine allégée après 3 semaines de hausse
    const rising3 = weeks[2] > 0 && weeks[0] > weeks[1] * 1.03 && weeks[1] > weeks[2] * 1.03;
    let factor = readinessLevel === 'red' ? 0.7 : readinessLevel === 'yellow' ? 1 : 1.1;
    if (rising3 && readinessLevel !== 'red') { factor = 0.75; reasons.push('3 semaines de hausse : cette semaine est allégée pour assimiler le travail.'); }
    const targetWeekKm = Math.round(base * factor * 10) / 10;
    if (thisWeekKm > lastWeekKm * 1.3 && lastWeekKm > 0) reasons.push(`Volume de la semaine déjà en hausse de ${Math.round((thisWeekKm / lastWeekKm - 1) * 100)} % : attention à la règle des 10 %.`);

    // Prochaine sortie
    const weekRuns = list.filter(r => r.date >= ws);
    const avgMin = mean(list.slice(-5).map(r => r.min));
    const easyMin = Math.round(Math.min(60, Math.max(20, avgMin)) / 5) * 5;
    let next;
    if (readinessLevel === 'red') {
      next = { type: 'easy', minutes: Math.max(20, easyMin - 10), pace: easyPace + 20, text: `Repos, ou footing très tranquille de ${Math.max(20, easyMin - 10)} min vers ${fmtPace(easyPace + 20)}.` };
    } else if (thisWeekKm >= targetWeekKm && targetWeekKm > 0) {
      next = { type: 'rest', minutes: 0, text: `Objectif de la semaine atteint (${round1(thisWeekKm)} km) : repos ou marche active.` };
    } else if (readinessLevel === 'green' && weekRuns.length >= 1 && !weekRuns.some(r => r.type === 'interval') && list.length >= 3) {
      const fast = Math.max(easyPace - 60, 180);
      next = { type: 'interval', minutes: 30, pace: fast, reps: 6, work: 60, rest: 90, text: `Fractionné : 10 min d'échauffement, 6 × 1 min vers ${fmtPace(fast)} avec 1 min 30 de trot, 5 min de retour au calme.` };
    } else if (weekRuns.length >= 2 && !weekRuns.some(r => r.type === 'long')) {
      const longMin = Math.round(Math.min(120, avgMin * 1.3) / 5) * 5;
      next = { type: 'long', minutes: longMin, pace: easyPace + 10, text: `Sortie longue : ${longMin} min très tranquille vers ${fmtPace(easyPace + 10)}.` };
    } else {
      next = { type: 'easy', minutes: easyMin, pace: easyPace, text: `Footing de ${easyMin} min vers ${fmtPace(easyPace)} (tu dois pouvoir parler).` };
    }
    return { easyPace, trend, thisWeekKm, lastWeekKm, targetWeekKm, next, reasons };
  }
  const round1 = x => Math.round(x * 10) / 10;

  // ---------- Charge d'entraînement et état de forme ----------
  /*
   * sessions : [{ date, minutes, rpe }]  (séances du coach, courses, autres activités)
   * → { daily: { date: charge }, acute, chronic, acwr, monotony, weeks: [{ start, load }] }
   */
  function trainingLoad(sessions, today) {
    const daily = {};
    for (const s of sessions || []) {
      if (!s.date || !(s.minutes > 0)) continue;
      daily[s.date] = (daily[s.date] || 0) + s.minutes * (s.rpe ?? 5);
    }
    const sumRange = (from, to) => Object.entries(daily).filter(([d]) => d > from && d <= to).reduce((a, [, v]) => a + v, 0);
    const acute = sumRange(addDays(today, -7), today);
    const chronic28 = sumRange(addDays(today, -28), today);
    const chronic = chronic28 / 4; // moyenne hebdomadaire sur 4 semaines
    const first = Object.keys(daily).sort()[0];
    const history = first ? daysBetween(first, today) : 0;
    const acwr = chronic > 0 && history >= 14 ? acute / chronic : null;
    const last7 = [...Array(7)].map((_, i) => daily[addDays(today, -i)] || 0);
    const monotony = sd(last7) > 0 ? mean(last7) / sd(last7) : (mean(last7) > 0 ? 3 : 0);
    const ws = weekStart(today);
    const weeks = [5, 4, 3, 2, 1, 0].map(i => { const st = addDays(ws, -7 * i); return { start: st, load: sumRange(addDays(st, -1), addDays(st, 6)) }; });
    return { daily, acute, chronic, acwr, monotony, weeks, historyDays: history };
  }

  /*
   * input : { sessions, lifts: { exId: entries }, runs, fatigueLog: [{date, fatigue}], today }
   * → { level: 'green'|'yellow'|'red', score, reasons: [], adj: -1|0|1, load }
   */
  function readiness(input) {
    const today = input.today;
    const load = trainingLoad(input.sessions, today);
    const reasons = [];
    let score = 0, red = false;

    if (load.acwr != null) {
      const r = load.acwr.toFixed(2).replace('.', ',');
      if (load.acwr > 1.5) { red = true; reasons.push(`Charge de la semaine ${r} fois supérieure à ta moyenne : risque de surentraînement et de blessure.`); }
      else if (load.acwr > 1.3) { score++; reasons.push(`Charge de la semaine en forte hausse (×${r}) : ne l'augmente pas davantage.`); }
    }
    // Trois semaines de hausse d'affilée
    const w = load.weeks.map(x => x.load);
    if (w[2] > 0 && w[3] > w[2] && w[4] > w[3] && w[5] >= w[4] * 0.6) { score++; reasons.push('Charge en hausse depuis 3 semaines : prévois une semaine plus légère.'); }

    // Effort ressenti élevé sur les dernières séances
    const recent = [...(input.sessions || [])].filter(s => s.rpe != null && daysBetween(s.date, today) <= 10).sort((a, b) => a.date.localeCompare(b.date)).slice(-3);
    if (recent.length >= 2 && mean(recent.map(s => s.rpe)) >= 8.5) { score++; reasons.push('Tes dernières séances ont été très dures (effort ≥ 8,5/10).'); }

    // Fatigue déclarée au coach
    const fat = (input.fatigueLog || []).filter(f => daysBetween(f.date, today) <= 7 && daysBetween(f.date, today) >= 0);
    if (fat.filter(f => f.fatigue >= 3).length >= 3) { score++; reasons.push('Tu t\'es senti(e) fatigué(e) plusieurs fois cette semaine.'); }

    // Jours d'entraînement consécutifs
    let streak = 0;
    for (let i = 0; i < 14 && load.daily[addDays(today, -i)]; i++) streak++;
    if (streak >= 6) { score++; reasons.push(`${streak} jours d'entraînement sans repos.`); }

    // Monotonie élevée (même charge tous les jours) avec une charge importante
    if (load.monotony > 2 && load.acute > 0 && load.chronic > 0 && load.acute > load.chronic) { score++; reasons.push('Séances très similaires chaque jour : varie l\'intensité et garde des jours faciles.'); }

    // Baisse de performance en musculation
    let declines = 0;
    for (const entries of Object.values(input.lifts || {})) {
      const l = [...entries].sort((a, b) => a.date.localeCompare(b.date)).filter(e => daysBetween(e.date, today) <= 21);
      if (l.length >= 2) {
        const a = bestE1rm(l.at(-2)) || totalReps(l.at(-2)), b = bestE1rm(l.at(-1)) || totalReps(l.at(-1));
        if (a > 0 && b < a * 0.93) declines++;
      }
    }
    if (declines >= 2) { score++; reasons.push(`Performances en baisse sur ${declines} exercices.`); }

    // Allure de course qui se dégrade
    if (input.runs?.length) {
      const rs = suggestRun(input.runs, today, 'green');
      if (rs.trend === 'slower') { score++; reasons.push('Allure de footing en baisse à effort égal.'); }
    }

    const level = red || score >= 3 ? 'red' : score >= 1 ? 'yellow' : 'green';
    const lowLoad = load.acwr != null && load.acwr < 0.8;
    const easyRecent = recent.length >= 2 && mean(recent.map(s => s.rpe)) <= 6;
    const adj = level === 'red' ? -1 : level === 'green' && (lowLoad || easyRecent) ? 1 : 0;
    if (level === 'green') {
      if (load.historyDays < 14) reasons.push('Encore peu d\'historique : la surveillance de la charge s\'affinera après 2 semaines.');
      else if (lowLoad) reasons.push('Charge plus faible que d\'habitude : tu peux augmenter un peu la difficulté.');
      else reasons.push('Charge d\'entraînement bien dosée : continue la progression.');
    }
    return { level, score, reasons, adj, load };
  }

  return { e1rm, range, roundLoad, suggestLift, variant, pace, fmtPace, suggestRun, trainingLoad, readiness, addDays, weekStart, bestE1rm, totalReps, mainKg };
});
