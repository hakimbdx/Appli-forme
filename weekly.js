/*
 * Bilans hebdomadaires : analyse d'une semaine (lundi → dimanche) et rédaction d'un
 * récapitulatif encourageant (victoires + un axe d'amélioration avec un défi mesurable).
 * Fichier partagé entre l'application (navigateur) et les tests (Node).
 *
 * build(input, weekStart) → rapport structuré ; toText(rapport) → version texte à partager.
 * input = {
 *   days: [{ date, kcal, protein, burned, meals: { 'Dîner': kcal, ... }, water }],  // ≥ 14 jours
 *   target: { kcal, protein } | null, waterGoal, profile, weights: [{date, kg}],
 *   sessions: [{ date, minutes, kcal, title }],       // séances (coach, courses, activités)
 *   lifts: { exId: [{ date, sets: [{kg, reps, secs}] }] }, runs: [{date, km, min, rpe}],
 *   steps: [{ date, pas }], readiness: { level, reasons } | null,
 *   labsInWeek: n, labsImproved: [noms], previousChallenge: { type, target, label } | null,
 *   names: { exId: nom }, sex: 'f'|'m'|null
 * }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Weekly = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Dates ----------
  const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekStartOf = s => { const d = toDate(s); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function weekLabel(ws) {
    const we = addDays(ws, 6);
    const [, m1, d1] = ws.split('-').map(Number), [, m2, d2] = we.split('-').map(Number);
    return m1 === m2 ? `du ${d1} au ${d2} ${MONTHS[m2 - 1]}` : `du ${d1} ${MONTHS[m1 - 1]} au ${d2} ${MONTHS[m2 - 1]}`;
  }
  // Semaine à résumer : la semaine en cours à partir du dimanche 18 h, sinon la précédente
  function dueWeek(now) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const ws = weekStartOf(today);
    return now.getDay() === 0 && now.getHours() >= 18 ? ws : addDays(ws, -7);
  }


  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fr = (v, d = 0) => Number(Number(v).toFixed(d)).toLocaleString('fr-FR');
  const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  const e1rm = (kg, reps) => kg * (1 + reps / 30);
  const paceStr = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km`;

  // ---------- Statistiques d'une semaine ----------
  function stats(input, ws) {
    const we = addDays(ws, 6);
    const inWeek = d => d >= ws && d <= we;
    const days = (input.days || []).filter(d => inWeek(d.date));
    const logged = days.filter(d => d.kcal > 0);
    const t = input.target;
    const goalOf = d => (t ? t.kcal + (d.burned || 0) : null);
    const onTarget = t ? logged.filter(d => d.kcal <= goalOf(d) * 1.05 && d.kcal >= goalOf(d) * 0.75).length : 0;
    const overDays = t ? logged.filter(d => d.kcal > goalOf(d) * 1.1) : [];
    const underDays = t ? logged.filter(d => d.kcal < goalOf(d) * 0.7) : [];
    // Repas qui pèse le plus les jours de dépassement (part au-delà d'une répartition équilibrée)
    const SHARE = { 'Petit-déjeuner': 0.25, 'Déjeuner': 0.35, 'Dîner': 0.3, 'Collation': 0.1 };
    const excess = {};
    for (const d of overDays) for (const [type, kcal] of Object.entries(d.meals || {})) excess[type] = (excess[type] || 0) + kcal - goalOf(d) * (SHARE[type] ?? 0.2);
    const worstMeal = Object.entries(excess).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const proteinDays = t ? logged.filter(d => d.protein >= t.protein * 0.9).length : 0;
    const wg = input.waterGoal || 8;
    const waterDays = days.filter(d => (d.water || 0) >= wg).length;
    const waterAvg = mean(days.map(d => d.water || 0));

    // Poids : dernière pesée de la semaine vs dernière pesée avant la semaine
    const ws_ = [...(input.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
    const wEnd = ws_.filter(w => w.date <= we).at(-1);
    const wBefore = ws_.filter(w => w.date < ws).at(-1) || ws_.filter(w => inWeek(w.date))[0];
    const weightDelta = wEnd && wBefore && inWeek(wEnd.date) && wEnd !== wBefore ? wEnd.kg - wBefore.kg : null;

    const sessions = (input.sessions || []).filter(s => inWeek(s.date));
    const runs = (input.runs || []).filter(r => inWeek(r.date) && r.km > 0);
    const trainDays = new Set([...sessions.map(s => s.date), ...runs.map(r => r.date)]);
    const steps = (input.steps || []).filter(s => inWeek(s.date) && s.pas > 0);

    // Records en renforcement : meilleure performance de la semaine vs avant
    const records = [];
    for (const [id, entries] of Object.entries(input.lifts || {})) {
      const perf = e => Math.max(0, ...e.sets.map(s => (s.secs ? s.secs : s.kg ? e1rm(s.kg, s.reps) : s.reps || 0)));
      const before = entries.filter(e => e.date < ws), during = entries.filter(e => inWeek(e.date));
      if (!before.length || !during.length) continue;
      const bBest = Math.max(...before.map(perf)), dBest = Math.max(...during.map(perf));
      if (dBest > bBest * 1.02) {
        const best = during.flatMap(e => e.sets).reduce((a, s) => (perf({ sets: [s] }) > perf({ sets: [a] }) ? s : a));
        records.push({ id, name: input.names?.[id] || id, set: best, gain: dBest / bBest - 1 });
      }
    }
    records.sort((a, b) => b.gain - a.gain);

    // Allure de course : semaine vs 4 semaines précédentes
    const paceOf = r => (r.min * 60) / r.km;
    const prevRuns = (input.runs || []).filter(r => r.date < ws && r.date >= addDays(ws, -28) && r.km > 0 && (r.rpe ?? 5) <= 6);
    const weekEasy = runs.filter(r => (r.rpe ?? 5) <= 6);
    const paceGain = prevRuns.length >= 2 && weekEasy.length ? median(prevRuns.map(paceOf)) - median(weekEasy.map(paceOf)) : null;

    return {
      ws, we, daysLogged: logged.length, avgKcal: logged.length ? mean(logged.map(d => d.kcal)) : null, onTarget,
      overDays: overDays.length, underDays: underDays.length, worstMeal,
      avgProtein: logged.length ? mean(logged.map(d => d.protein || 0)) : null, proteinDays, waterDays, waterAvg,
      weightEnd: wEnd?.kg ?? null, weightDelta,
      sessions: sessions.length, minutes: sessions.reduce((a, s) => a + (s.minutes || 0), 0) + runs.reduce((a, r) => a + r.min, 0),
      kcalBurned: sessions.reduce((a, s) => a + (s.kcal || 0), 0), trainDays: trainDays.size, restDays: 7 - trainDays.size,
      runs: runs.length, km: runs.reduce((a, r) => a + r.km, 0), paceGain, bestPace: runs.length ? Math.min(...runs.map(paceOf)) : null,
      stepsAvg: steps.length >= 3 ? mean(steps.map(s => s.pas)) : null, records,
    };
  }

  // ---------- Défis ----------
  function evalChallenge(c, s) {
    if (!c) return null;
    const value = {
      log_days: s.daysLogged, target_days: s.onTarget, min_kcal_days: s.daysLogged - s.underDays, protein_days: s.proteinDays,
      water_days: s.waterDays, sessions: s.sessions + s.runs, rest_days: s.restDays, steps_avg: s.stepsAvg ?? 0,
    }[c.type];
    return value == null ? null : { done: value >= c.target, value };
  }

  // ---------- Rédaction ----------
  function build(input, ws) {
    const g = (m, f) => (input.sex === 'm' ? m : input.sex === 'f' ? f : `${m}(e)`);
    const s = stats(input, ws), p = stats(input, addDays(ws, -7));
    const seed = hash(ws);
    const goal = input.profile?.goal ?? 0; // < 0 : perte de poids
    const t = input.target;
    const prevCh = input.previousChallenge ? { ...input.previousChallenge, ...evalChallenge(input.previousChallenge, s) } : null;

    // Victoires candidates, triées par importance
    const wins = [];
    const add = (score, icon, text) => wins.push({ score, icon, text });
    if (prevCh?.done) add(9, '🎯', `Défi de la semaine réussi : ${prevCh.label} (${fr(prevCh.value)}${prevCh.type === 'steps_avg' ? ' pas en moyenne' : '/7'}). Tu tiens tes engagements !`);
    if (s.weightDelta != null) {
      if (goal < 0 && s.weightDelta <= -0.2) add(8, '📉', `${fr(s.weightDelta, 1)} kg cette semaine${input.profile?.startWeight && s.weightEnd ? `, soit ${fr(s.weightEnd - input.profile.startWeight, 1)} kg depuis le début` : ''}. Ton corps répond à tes efforts !`);
      else if (goal > 0 && s.weightDelta >= 0.1) add(8, '📈', `+${fr(s.weightDelta, 1)} kg cette semaine, exactement dans la bonne direction.`);
      else if (goal === 0 && Math.abs(s.weightDelta) <= 0.3) add(6, '⚖️', 'Poids stable : tu maîtrises ton équilibre.');
    }
    if (s.records.length) {
      const r = s.records[0];
      const perf = r.set.secs ? `${r.set.secs} s` : r.set.kg ? `${fr(r.set.kg, 1)} kg × ${r.set.reps}` : `${r.set.reps} répétitions`;
      add(7.5, '🏆', `Nouveau record : ${r.name} (${perf})${s.records.length > 1 ? `, et ${s.records.length - 1} autre${s.records.length > 2 ? 's' : ''} record${s.records.length > 2 ? 's' : ''} battu${s.records.length > 2 ? 's' : ''}` : ''}. Tu deviens plus ${g('fort', 'forte')} !`);
    }
    if (s.paceGain != null && s.paceGain >= 5) add(7, '⚡', `Ton allure de footing s'améliore de ${fr(s.paceGain)} s/km par rapport au mois dernier.`);
    if (t && s.daysLogged >= 3 && s.onTarget >= Math.max(3, s.daysLogged - 1)) add(7, '🥗', `Objectif calorique respecté ${s.onTarget} jour${s.onTarget > 1 ? 's' : ''} sur ${s.daysLogged} : une vraie maîtrise.`);
    const moves = s.sessions + s.runs;
    if (moves >= 2) add(5 + Math.min(2, moves - 2) + (moves > p.sessions + p.runs ? 1 : 0), '💪', `${moves} séance${moves > 1 ? 's' : ''} de sport (${fr(s.minutes)} min)${moves > p.sessions + p.runs && p.sessions + p.runs > 0 ? `, ${moves - p.sessions - p.runs} de plus que la semaine dernière` : ''}.`);
    if (s.km >= 3) add(4.5, '🏃', `${fr(s.km, 1)} km de course${s.bestPace ? `, meilleure allure ${paceStr(s.bestPace)}` : ''}.`);
    if (s.daysLogged >= 5) add(4 + s.daysLogged / 7, '📒', `Repas notés ${s.daysLogged} jours sur 7 : cette régularité est la clé de tes résultats.`);
    if (t && s.avgProtein != null && s.daysLogged >= 3 && s.avgProtein >= t.protein * 0.9) add(3.5, '🍳', `${fr(s.avgProtein)} g de protéines par jour en moyenne : parfait pour préserver tes muscles.`);
    if (s.waterDays >= 5) add(3, '💧', `Objectif d'eau atteint ${s.waterDays} jours sur 7.`);
    if (s.stepsAvg != null && s.stepsAvg >= 8000) add(3, '👟', `${fr(s.stepsAvg)} pas par jour en moyenne.`);
    if (input.labsImproved?.length) add(6.5, '🩸', `Bilan sanguin en progrès : ${input.labsImproved.slice(0, 3).join(', ')} ${input.labsImproved.length > 1 ? 'sont revenus' : 'est revenu'} dans les normes.`);
    else if (input.labsInWeek) add(2, '🩸', 'Nouveau bilan sanguin enregistré : tu prends soin de ta santé.');
    if (input.readiness?.level === 'green' && moves >= 2) add(2.5, '🟢', 'Charge d\'entraînement bien dosée : tu progresses sans t\'épuiser.');
    wins.sort((a, b) => b.score - a.score);
    const victories = wins.slice(0, 4);
    if (!victories.length) victories.push({ icon: '🌱', text: 'Tu as pris le temps de faire le point : c\'est le premier pas de chaque progrès.' });

    // Axe d'amélioration : un seul, celui qui aura le plus d'impact
    const axes = [];
    const axis = (score, key, title, why, tip, challenge) => axes.push({ score, key, title, why, tip, challenge });
    if (s.daysLogged < 4) {
      axis(10 - s.daysLogged * 2, 'logging', 'Noter tes repas plus régulièrement',
        `Tu as noté tes repas ${s.daysLogged} jour${s.daysLogged > 1 ? 's' : ''} sur 7. Sans ces données, difficile de savoir ce qui marche pour toi.`,
        'Astuce : note chaque repas juste après l\'avoir mangé, ou prends-le en photo pour le saisir le soir. La recherche et le scan de code-barres vont très vite.',
        { type: 'log_days', target: 5, label: 'noter tes repas au moins 5 jours' });
    }
    if (t && s.daysLogged >= 3 && s.underDays >= 3) {
      axis(8, 'under', 'Manger suffisamment',
        `${s.underDays} jours très en dessous de ton objectif : trop de restriction fatigue, fait perdre du muscle et finit souvent par des craquages.`,
        'Ajoute une vraie collation (yaourt + fruit + quelques amandes) et une portion de féculents au déjeuner.',
        { type: 'min_kcal_days', target: Math.min(7, s.daysLogged), label: `manger au moins 75 % de ton objectif tous les jours notés` });
    }
    if (input.readiness?.level === 'red') {
      axis(9, 'recovery', 'Récupérer',
        input.readiness.reasons?.[0] || 'Ta charge d\'entraînement est trop élevée.',
        'La progression se fait pendant le repos : garde 2 jours sans séance et privilégie la mobilité ou la marche.',
        { type: 'rest_days', target: 2, label: 'garder au moins 2 jours de repos' });
    }
    if (t && s.daysLogged >= 3 && s.overDays >= 2) {
      const TIPS = {
        'Collation': 'Ce sont surtout les collations qui font la différence : prévois-les à l\'avance (fruit, yaourt, poignée d\'amandes) plutôt que de grignoter.',
        'Dîner': 'C\'est surtout au dîner que ça se joue : remplis la moitié de l\'assiette de légumes et sers-toi une seule fois.',
        'Déjeuner': 'C\'est surtout au déjeuner : une assiette avec ½ légumes, ¼ protéines, ¼ féculents aide à garder le cap.',
        'Petit-déjeuner': 'Le petit-déjeuner pèse lourd : privilégie protéines et fibres (œufs, skyr, flocons d\'avoine) plutôt que viennoiseries.',
      };
      axis(4 + s.overDays, 'over', 'Rester dans ton objectif calorique',
        `${s.overDays} jour${s.overDays > 1 ? 's' : ''} au-dessus de ton objectif cette semaine.`,
        TIPS[s.worstMeal] || 'Prépare tes repas à l\'avance les jours chargés : c\'est là que les écarts arrivent.',
        { type: 'target_days', target: Math.min(7, Math.max(4, s.onTarget + 1)), label: `respecter ton objectif calorique au moins ${Math.min(7, Math.max(4, s.onTarget + 1))} jours` });
    }
    if (moves < 2 && input.readiness?.level !== 'red') {
      axis(5 - moves, 'activity', 'Bouger un peu plus',
        moves ? 'Une seule séance cette semaine.' : 'Pas de séance de sport cette semaine.',
        'Deux séances de 20 minutes avec le coach suffisent pour progresser. Bloque-les dans ton agenda comme un rendez-vous.',
        { type: 'sessions', target: 2, label: 'faire 2 séances de sport' });
    }
    if (t && s.daysLogged >= 3 && s.avgProtein != null && s.avgProtein < t.protein * 0.8) {
      axis(4, 'protein', 'Augmenter tes protéines',
        `${fr(s.avgProtein)} g par jour en moyenne pour un objectif de ${t.protein} g.`,
        'Ajoute une source de protéines à chaque repas : œufs, skyr ou fromage blanc, poulet, poisson, lentilles, tofu.',
        { type: 'protein_days', target: 4, label: `atteindre ${Math.round(t.protein * 0.9)} g de protéines au moins 4 jours` });
    }
    if (s.waterAvg < (input.waterGoal || 8) * 0.7) {
      axis(3, 'water', 'Mieux t\'hydrater',
        `${fr(s.waterAvg, 1)} verres d'eau par jour en moyenne.`,
        'Garde une gourde à portée de main et bois un verre à chaque repas et à chaque pause.',
        { type: 'water_days', target: 5, label: 'atteindre ton objectif d\'eau au moins 5 jours' });
    }
    if (s.stepsAvg != null && s.stepsAvg < 6000) {
      axis(3, 'steps', 'Marcher davantage',
        `${fr(s.stepsAvg)} pas par jour en moyenne.`,
        'Une marche de 15 minutes après le déjeuner ou le dîner ajoute près de 2 000 pas et aide la digestion.',
        { type: 'steps_avg', target: Math.round((s.stepsAvg + 1500) / 500) * 500, label: `atteindre ${fr(Math.round((s.stepsAvg + 1500) / 500) * 500)} pas par jour en moyenne` });
    }
    axes.sort((a, b) => b.score - a.score);
    const focus = axes[0] || {
      key: 'next', title: 'Passer au niveau suivant',
      why: 'Tous tes indicateurs sont au vert, bravo !',
      tip: 'Pour continuer à progresser, ajoute une séance par semaine ou augmente légèrement l\'intensité.',
      challenge: { type: 'sessions', target: Math.min(5, moves + 1), label: `faire ${Math.min(5, moves + 1)} séances de sport` },
    };

    // Ton général de la semaine
    const strong = victories.filter(v => v.score >= 5).length;
    const mood = strong >= 3 ? 'great' : strong >= 1 ? 'good' : 'tough';
    const OPEN = {
      great: ['Quelle semaine ! 🎉', 'Semaine au top 🌟', 'Bravo, c\'était une très belle semaine 👏'],
      good: ['Belle semaine 💪', 'Une semaine solide 👏', 'Tu avances bien 🌿'],
      tough: ['Chaque semaine compte, même les plus calmes 💛', 'Semaine plus tranquille, et c\'est ok 🌱', 'Pas de pression : on repart ensemble cette semaine 💛'],
    };
    const CLOSE = {
      great: ['Continue comme ça, tu es sur une super lancée ✨', 'Garde ce rythme, les résultats suivent 🚀'],
      good: ['Un pas après l\'autre, tu y es presque 💪', 'Tu es sur la bonne voie, on garde le cap 🌟'],
      tough: ['Une nouvelle semaine commence : petit objectif, grande fierté 💛', 'L\'important n\'est pas d\'être parfaite, c\'est de continuer 💛'.replace('parfaite', g('parfait', 'parfaite'))],
    };
    const bits = [];
    if (moves) bits.push(`tu as fait ${moves} séance${moves > 1 ? 's' : ''}`);
    if (s.daysLogged) bits.push(`noté tes repas ${s.daysLogged} jour${s.daysLogged > 1 ? 's' : ''} sur 7`);
    if (s.weightDelta != null) bits.push(`ton poids a ${s.weightDelta < -0.05 ? `baissé de ${fr(-s.weightDelta, 1)} kg` : s.weightDelta > 0.05 ? `augmenté de ${fr(s.weightDelta, 1)} kg` : 'été stable'}`);
    const joined = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} et ${bits.at(-1)}` : bits[0];
    const summary = bits.length ? `Cette semaine, ${joined}.` : 'Peu de données enregistrées cette semaine.';

    // Chiffres comparés à la semaine précédente
    const kpis = [
      ['Repas notés', `${s.daysLogged}/7`, `${p.daysLogged}/7`],
      ['Calories / jour', s.avgKcal != null ? `${fr(s.avgKcal)} kcal` : '—', p.avgKcal != null ? `${fr(p.avgKcal)} kcal` : '—'],
      ['Jours dans l\'objectif', t ? `${s.onTarget}` : '—', t ? `${p.onTarget}` : '—'],
      ['Séances', `${moves}`, `${p.sessions + p.runs}`],
      ['Minutes de sport', `${fr(s.minutes)}`, `${fr(p.minutes)}`],
      ['Poids', s.weightEnd != null ? `${fr(s.weightEnd, 1)} kg` : '—', p.weightEnd != null ? `${fr(p.weightEnd, 1)} kg` : '—'],
    ];
    if (s.km || p.km) kpis.push(['Course', `${fr(s.km, 1)} km`, `${fr(p.km, 1)} km`]);
    if (s.stepsAvg != null || p.stepsAvg != null) kpis.push(['Pas / jour', s.stepsAvg != null ? fr(s.stepsAvg) : '—', p.stepsAvg != null ? fr(p.stepsAvg) : '—']);

    return {
      week: ws, label: weekLabel(ws), mood,
      title: `Ton bilan de la semaine ${weekLabel(ws)}`,
      opening: pick(OPEN[mood], seed), summary, victories,
      previousChallenge: prevCh, focus, challenge: focus.challenge, kpis,
      closing: pick(CLOSE[mood], seed >> 3), stats: s,
    };
  }

  // Défi non réussi : message adapté à l'écart
  function challengeNote(c) {
    const v = c.type === 'steps_avg' ? `${fr(c.value)} pas` : `${fr(c.value)}/${c.target}`;
    const ratio = c.target ? c.value / c.target : 0;
    return ratio >= 0.6 ? `${v}. Tout près, tu y es presque !` : ratio > 0 ? `${v}. Un bon début, on continue !` : `${v}. Pas cette fois : on retente cette semaine ? 💪`;
  }

  function toText(r) {
    const lines = [r.title.replace('Ton bilan', 'Bilan'), '', `${r.opening} ${r.summary}`, '', '🏆 Tes victoires :'];
    r.victories.forEach(v => lines.push(`${v.icon} ${v.text}`));
    if (r.previousChallenge && !r.previousChallenge.done && r.previousChallenge.value != null) lines.push('', `Défi de la semaine dernière : ${r.previousChallenge.label} → ${challengeNote(r.previousChallenge)}`);
    lines.push('', `🎯 Ton axe de la semaine : ${r.focus.title}`, r.focus.why, r.focus.tip, `Défi : ${r.challenge.label}.`, '', r.closing);
    return lines.join('\n');
  }

  return { build, toText, challengeNote, stats, evalChallenge, weekStartOf, dueWeek, addDays, weekLabel };
});
