/*
 * Coach sportif : génération de séances sur mesure et compréhension des messages.
 * Fichier partagé entre l'application (navigateur) et les tests (Node).
 *
 * generate(opts) → séance structurée (échauffement, bloc principal, retour au calme)
 *   opts = { fatigue: 1..4, injuries: { genou: 'gene'|'douleur', ... }, equipment: [...],
 *            duration: minutes, goal: 'burn'|'strength'|'cardio'|'mobility',
 *            focus: 'full'|'upper'|'lower'|'core', level: 1..3, adj: -2..2,
 *            lowImpact: bool, seed: nombre, weightKg }
 * parse(texte) → informations comprises (fatigue, douleurs, matériel, durée, objectif…)
 */
(function (root, factory) {
  const data = typeof module !== 'undefined' && module.exports ? require('./sport-data.js') : root.SportData;
  const api = factory(data);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Coach = api;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const FATIGUE = {
    1: { label: 'En forme', rpe: '7-8/10', setsDelta: 1, workDelta: 5, restDelta: -5, lvlDelta: 0 },
    2: { label: 'Normal', rpe: '6-7/10', setsDelta: 0, workDelta: 0, restDelta: 0, lvlDelta: 0 },
    3: { label: 'Fatigué(e)', rpe: '5-6/10 (tu dois pouvoir parler)', setsDelta: -1, workDelta: -10, restDelta: 10, lvlDelta: -1 },
    4: { label: 'Épuisé(e)', rpe: '3-4/10', setsDelta: -1, workDelta: -10, restDelta: 15, lvlDelta: -2 },
  };
  const GOALS = { burn: 'Brûler des calories', strength: 'Renforcement musculaire', cardio: 'Cardio', mobility: 'Mobilité et récupération' };
  const FOCUS = { full: 'Corps entier', upper: 'Haut du corps', lower: 'Bas du corps', core: 'Abdos et gainage' };
  const MET = { burn: 6, strength: 4.5, cardio: 7, mobility: 2.5 };

  const SEQUENCES = {
    burn: {
      full: ['squat', 'push_h', 'cardio', 'hinge', 'pull', 'cardio', 'lunge', 'core'],
      lower: ['squat', 'cardio', 'lunge', 'glutes', 'cardio', 'hinge', 'calves', 'core'],
      upper: ['push_h', 'pull', 'cardio', 'push_v', 'arms', 'cardio', 'core', 'pull'],
      core: ['core', 'cardio', 'core', 'core', 'cardio', 'core', 'core', 'cardio'],
    },
    strength: {
      full: ['squat', 'push_h', 'hinge', 'pull', 'lunge', 'push_v', 'core', 'glutes'],
      lower: ['squat', 'hinge', 'lunge', 'glutes', 'squat', 'calves', 'core', 'lunge'],
      upper: ['push_h', 'pull', 'push_v', 'pull', 'arms', 'arms', 'core', 'push_h'],
      core: ['core', 'core', 'back', 'core', 'core', 'glutes', 'core', 'core'],
    },
    cardio: { full: ['cardio', 'squat', 'cardio', 'core', 'cardio', 'lunge', 'cardio', 'push_h'] },
  };
  const PATTERN_GROUPS = { pull: ['pull_h', 'pull_v', 'back'] };
  const FALLBACK = {
    pull: ['back'], arms: ['push_h', 'pull'], push_v: ['push_h'], push_h: ['push_v', 'core'], calves: ['glutes'],
    glutes: ['hinge'], hinge: ['glutes', 'back'], squat: ['lunge', 'glutes'], lunge: ['squat', 'glutes'],
    cardio: ['squat', 'core', 'glutes'], core: ['back', 'glutes'], back: ['core'],
  };

  // ---------- Outils ----------
  function rng(seed) { // mulberry32 : aléatoire reproductible
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function context(o) {
    const fatigue = clamp(o.fatigue || 2, 1, 4);
    const level = clamp(o.level || 1, 1, 3);
    const F = FATIGUE[fatigue];
    const injuries = o.injuries || {};
    const lowImpact = !!o.lowImpact || fatigue >= 3 || ['genou', 'cheville', 'hanche'].some(z => injuries[z]);
    return {
      fatigue, level, F, injuries, lowImpact, adj: clamp(o.adj || 0, -2, 2),
      equipment: new Set(['', ...(o.equipment || [])]),
      lvlCap: clamp(level + F.lvlDelta + (o.adj > 0 && fatigue <= 2 ? 1 : 0), 1, 3),
    };
  }

  function eligible(e, ctx, opts = {}) {
    if (e.eq) {
      const ok = e.eq.split('+').every(group => group.split('|').some(item => ctx.equipment.has(item)));
      if (!ok) return false;
    }
    if (e.lvl > (opts.lvlCap ?? ctx.lvlCap)) return false;
    if (ctx.lowImpact && e.impact) return false;
    for (const [zone, sev] of Object.entries(ctx.injuries)) {
      const s = e.stress[zone] || 0;
      if (sev === 'douleur' && s >= 1) return false;
      if (sev === 'gene' && s >= 2) return false;
    }
    return true;
  }

  function candidates(pattern, ctx, used) {
    const pats = PATTERN_GROUPS[pattern] || [pattern];
    return D.EXERCISES.filter(e => pats.includes(e.pattern) && !used.has(e.id) && eligible(e, ctx));
  }

  // Choix pondéré : on privilégie les exercices proches du niveau visé
  function pick(pattern, ctx, used, rand, depth = 0) {
    const list = candidates(pattern, ctx, used);
    if (!list.length) {
      if (depth > 1) return null;
      for (const fb of FALLBACK[pattern] || []) { const e = pick(fb, ctx, used, rand, depth + 1); if (e) return e; }
      return null;
    }
    const w = list.map(e => (e.lvl === ctx.lvlCap ? 3 : e.lvl === ctx.lvlCap - 1 ? 2 : 1) + (e.eq ? (ctx.eqBonus || 1) : 0));
    let r = rand() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list.at(-1);
  }

  const item = (e, extra) => ({ id: e.id, name: e.name, cue: e.cue, side: e.side, pattern: e.pattern, ...extra });

  // ---------- Construction des blocs ----------
  function listBlock(key, title, pattern, seconds, ctx, used, rand, per = 40) {
    const n = Math.max(1, Math.round(seconds / (per + 5)));
    const items = [];
    for (let i = 0; i < n; i++) {
      const e = pick(pattern, ctx, used, rand);
      if (!e) break;
      used.add(e.id);
      items.push(item(e, { time: e.side ? per * 2 : per }));
    }
    // Plus assez d'exercices différents : on tient chaque position plus longtemps
    const total = items.reduce((a, i) => a + i.time + 5, 0);
    if (items.length && total < seconds * 0.85) {
      const k = Math.min(4, seconds / total);
      items.forEach(i => { i.time = Math.round(i.time * k / 5) * 5; });
    }
    return { key, title, format: 'list', items };
  }

  function warmupBlock(seconds, ctx, used, rand) {
    // Alterne mobilité douce et activation cardio légère
    const per = 40, n = Math.max(2, Math.round(seconds / (per + 5)));
    const soft = { ...ctx, lowImpact: true };
    const items = [];
    for (let i = 0; i < n; i++) {
      const e = pick('warm', i % 2 && ctx.fatigue <= 2 ? ctx : soft, used, rand);
      if (!e) break;
      used.add(e.id);
      items.push(item(e, { time: per }));
    }
    return { key: 'warmup', title: 'Échauffement', format: 'list', items };
  }

  function circuitBlock(seq, seconds, ctx, used, rand) {
    const base = { 1: [30, 30], 2: [40, 20], 3: [45, 15] }[ctx.level];
    const work = clamp(base[0] + ctx.F.workDelta + ctx.adj * 5, 20, 50);
    const rest = clamp(base[1] + ctx.F.restDelta - ctx.adj * 5, 10, 45);
    const roundRest = ctx.fatigue >= 3 ? 75 : 60;
    let n = seconds <= 480 ? 4 : seconds <= 900 ? 5 : seconds <= 1500 ? 6 : 8;
    const items = [];
    for (const p of seq) {
      if (items.length >= n) break;
      const e = pick(p, ctx, used, rand);
      if (!e) continue;
      used.add(e.id);
      items.push(item(e, { time: work }));
    }
    n = items.length || 1;
    const roundSecs = n * (work + rest);
    const rounds = clamp(Math.round((seconds + roundRest) / (roundSecs + roundRest)), 1, 10);
    return { key: 'main', title: 'Circuit', format: 'circuit', rounds, work, rest, roundRest, items,
      note: `${rounds} tour${rounds > 1 ? 's' : ''} : ${work} s d'effort, ${rest} s de pause entre les exercices, ${roundRest} s entre les tours. Les exercices en répétitions se font en continu pendant ${work} s.` };
  }

  function setsBlock(seq, seconds, ctx, used, rand) {
    let sets = clamp({ 1: 2, 2: 3, 3: 3 }[ctx.level] + ctx.F.setsDelta + (ctx.adj > 0 ? 1 : ctx.adj < 0 ? -1 : 0), 1, 5);
    const reps = ctx.fatigue >= 3 ? ['8', '8-10', '10'][ctx.level - 1] : ['8-10', '10-12', '12-15'][ctx.level - 1];
    const hold = clamp([25, 35, 45][ctx.level - 1] + ctx.F.workDelta + ctx.adj * 5, 15, 60);
    const rest = ctx.fatigue >= 3 ? 75 : 60;
    const repSecs = Number(reps.split('-').at(-1)) * 3.5;
    const exSecs = e => sets * ((e.time ? hold : repSecs) * (e.side ? 2 : 1) + rest);
    const items = [];
    let total = 0;
    for (const p of [...seq, ...seq]) {
      if (items.length >= 10 || total >= seconds * 0.92) break;
      const e = pick(p, ctx, used, rand);
      if (!e) continue;
      if (items.length >= 1 && total + exSecs(e) > seconds * 1.12) break;
      used.add(e.id);
      items.push(item(e, e.time ? { sets, time: hold, rest } : { sets, reps, rest }));
      total += exSecs(e);
    }
    const sum = () => items.reduce((a, i) => a + exSecs(D.BY_ID[i.id]), 0);
    // Ajuste le nombre de séries pour coller à la durée demandée
    while (sum() > seconds * 1.15 && sets > 1) { sets--; items.forEach(i => { i.sets = sets; }); }
    while (sum() < seconds * 0.75 && sets < 5 && sum() * (sets + 1) / sets <= seconds * 1.15) { sets++; items.forEach(i => { i.sets = sets; }); }
    return { key: 'main', title: 'Renforcement', format: 'sets', items,
      note: `${sets} série${sets > 1 ? 's' : ''} par exercice, ${rest} s de récupération entre les séries. Choisis une charge qui laisse 2 répétitions « en réserve ».` };
  }

  function machineBlock(machineKey, seconds, ctx) {
    const m = D.MACHINES[machineKey];
    if (ctx.fatigue >= 3) {
      return { key: 'main', title: m.name, format: 'list', items: [{ id: machineKey, name: `${m.name} : allure modérée continue`, cue: 'Rythme régulier, tu dois pouvoir parler.', time: Math.round(seconds / 60) * 60 }] };
    }
    const fast = ctx.fatigue === 1 ? 60 : 45, slow = ctx.fatigue === 1 ? 60 : 75;
    const rounds = clamp(Math.floor(seconds / (fast + slow)), 2, 40);
    return { key: 'main', title: `Fractionné ${m.name.toLowerCase()}`, format: 'circuit', rounds, work: fast, rest: 0, roundRest: 0,
      items: [
        { id: machineKey + '_fast', name: `${m.name} : rapide`, cue: m.fast, time: fast },
        { id: machineKey + '_slow', name: `${m.name} : récupération`, cue: m.slow, time: slow },
      ],
      note: `${rounds} répétitions de ${fast} s rapides et ${slow} s lentes.` };
  }

  // ---------- Durée et calories ----------
  function blockSeconds(b) {
    if (b.format === 'list') return b.items.reduce((a, i) => a + i.time + 5, 0);
    if (b.format === 'circuit') return b.rounds * b.items.reduce((a, i) => a + i.time + b.rest, 0) + (b.rounds - 1) * b.roundRest;
    return b.items.reduce((a, i) => {
      const w = i.time || Number(String(i.reps).split('-').at(-1)) * 3.5;
      return a + i.sets * (w * (i.side ? 2 : 1) + i.rest);
    }, 0);
  }
  const estimateMinutes = w => Math.round(w.blocks.reduce((a, b) => a + blockSeconds(b), 0) / 60);

  // ---------- Génération ----------
  function generate(o = {}) {
    const ctx = context(o);
    ctx.eqBonus = o.goal === 'strength' ? 12 : 1; // en renforcement, on privilégie le matériel disponible
    const seed = o.seed ?? Math.floor(Math.random() * 1e9);
    const rand = rng(seed);
    let duration = clamp(Math.round(o.duration || 30), 10, 90);
    let goal = o.goal || 'burn';
    const recovery = ctx.fatigue === 4 && !o.force;
    if (recovery) goal = 'mobility';
    const warnings = [];
    const maxMob = recovery ? 45 : 60;
    if (goal === 'mobility' && duration > maxMob) {
      warnings.push(`Séance de ${recovery ? 'récupération' : 'mobilité'} limitée à ${maxMob} min : au-delà, une marche tranquille est plus utile.`);
      duration = maxMob;
    }
    const focus = goal === 'mobility' || goal === 'cardio' ? 'full' : (o.focus || 'full');
    const used = new Set();

    const warmMin = goal === 'mobility' ? 0 : duration <= 10 ? 2 : duration <= 20 ? 4 : duration <= 30 ? 5 : duration <= 45 ? 7 : 8;
    const coolMin = duration <= 10 ? 1.5 : duration <= 20 ? 2.5 : duration <= 30 ? 3 : duration <= 45 ? 5 : 6;
    const mainSecs = (duration - warmMin - coolMin) * 60;
    const blocks = [];
    if (warmMin) blocks.push(warmupBlock(warmMin * 60, ctx, used, rand));

    if (goal === 'mobility') {
      const flow = listBlock('main', 'Mobilité douce', 'warm', mainSecs * 0.55, { ...ctx, lowImpact: true }, used, rand, 45);
      const stretch = listBlock('main2', 'Étirements', 'stretch', mainSecs * 0.45, ctx, used, rand, 45);
      blocks.push(flow, stretch);
    } else if (goal === 'cardio' && ['velo', 'rameur', 'tapis_course'].some(m => ctx.equipment.has(m) && eligible({ eq: '', lvl: 1, stress: D.MACHINES[m].stress }, ctx))) {
      const m = ['velo', 'rameur', 'tapis_course'].find(k => ctx.equipment.has(k) && eligible({ eq: '', lvl: 1, stress: D.MACHINES[k].stress }, ctx));
      blocks.push(machineBlock(m, mainSecs, ctx));
    } else if (goal === 'strength') {
      blocks.push(setsBlock(SEQUENCES.strength[focus], mainSecs, ctx, used, rand));
    } else {
      const seq = goal === 'cardio' ? SEQUENCES.cardio.full : SEQUENCES.burn[focus];
      blocks.push(circuitBlock(seq, mainSecs, ctx, used, rand));
    }
    if (goal !== 'mobility') blocks.push(listBlock('cooldown', 'Retour au calme', 'stretch', coolMin * 60, ctx, used, rand, 45));

    // Avertissements liés aux douleurs signalées
    for (const [zone, sev] of Object.entries(ctx.injuries)) {
      const z = D.ZONES[zone] || zone;
      warnings.push(sev === 'douleur'
        ? `${z} : j'ai retiré les exercices qui sollicitent cette zone. Si la douleur persiste ou augmente, consulte un professionnel de santé.`
        : `${z} : seulement des exercices qui la sollicitent peu. Réduis l'amplitude si besoin et arrête-toi en cas de douleur.`);
    }
    if (ctx.lowImpact && !o.lowImpact && goal !== 'mobility') warnings.push('Séance sans sauts pour ménager tes articulations.');
    const pool = D.EXERCISES.filter(e => !['warm', 'stretch'].includes(e.pattern) && eligible(e, ctx)).length;
    if (pool < 8 && goal !== 'mobility') warnings.push('Peu d\'exercices compatibles avec tes contraintes : une séance de mobilité ou une marche serait peut-être plus adaptée aujourd\'hui.');

    const w = {
      seed, duration, goal, focus, fatigue: ctx.fatigue, level: ctx.level, recovery,
      title: recovery ? 'Séance récupération' : goal === 'mobility' ? 'Mobilité et récupération' : goal === 'cardio' ? 'Cardio' : `${GOALS[goal]} · ${FOCUS[focus]}`,
      rpe: ctx.F.rpe, warnings, blocks, opts: { ...o, seed, goal: o.goal, duration },
    };
    w.estMinutes = estimateMinutes(w);
    w.kcal = Math.round(MET[goal] * (ctx.fatigue >= 3 ? 0.85 : 1) * (o.weightKg || 65) * w.estMinutes / 60);
    return w;
  }

  // Remplace un exercice par un autre de la même famille
  function swap(w, blockIdx, itemIdx, seed = Math.floor(Math.random() * 1e9)) {
    const ctx = context(w.opts);
    const b = w.blocks[blockIdx], it = b?.items[itemIdx];
    const cur = it && D.BY_ID[it.id];
    if (!cur) return null;
    const used = new Set(w.blocks.flatMap(x => x.items.map(i => i.id)));
    const e = pick(cur.pattern, ctx, used, rng(seed));
    if (!e) return null;
    const copy = structuredCloneSafe(w);
    const old = copy.blocks[blockIdx].items[itemIdx];
    const extra = { ...old };
    delete extra.id; delete extra.name; delete extra.cue; delete extra.side; delete extra.pattern;
    if (b.format === 'sets') {
      if (e.time) { delete extra.reps; extra.time = extra.time || 30; } else { delete extra.time; extra.reps = extra.reps || '10-12'; }
    }
    copy.blocks[blockIdx].items[itemIdx] = item(e, extra);
    copy.estMinutes = estimateMinutes(copy);
    return copy;
  }
  const structuredCloneSafe = o => JSON.parse(JSON.stringify(o));

  // Retrouve un exercice de la séance à partir de mots du message (« remplace les pompes »)
  function findItem(w, text) {
    const n = norm(text).replace(/\b(remplace|change|enleve|retire|supprime|autre|exercice|les|le|la|l|des|du|de|un|une|par|stp|svp|moi)\b/g, ' ');
    const words = n.split(/[^a-z0-9]+/).filter(x => x.length > 3).map(x => x.replace(/s$/, ''));
    if (!words.length) return null;
    let best = null;
    w.blocks.forEach((b, bi) => b.items.forEach((it, ii) => {
      if (!D.BY_ID[it.id]) return;
      const name = norm(it.name);
      const score = words.filter(x => name.includes(x)).length;
      if (score && (!best || score > best.score)) best = { bi, ii, score };
    }));
    return best;
  }

  // ---------- Déroulé pas à pas (lecteur de séance) ----------
  function flatten(w) {
    const steps = [];
    for (const b of w.blocks) {
      if (b.format === 'list') {
        b.items.forEach(i => steps.push({ id: i.id, fmt: 'list', block: b.title, kind: 'time', secs: i.time, name: i.name, cue: i.cue, side: i.side }));
      } else if (b.format === 'circuit') {
        for (let r = 1; r <= b.rounds; r++) {
          b.items.forEach((i, k) => {
            steps.push({ id: i.id, fmt: 'circuit', block: b.title, kind: 'time', secs: i.time, name: i.name, cue: i.cue, side: i.side, label: `Tour ${r}/${b.rounds}` });
            const lastOfRound = k === b.items.length - 1;
            if (!lastOfRound && b.rest) steps.push({ block: b.title, kind: 'rest', secs: b.rest, name: 'Pause' });
            if (lastOfRound && r < b.rounds && b.roundRest) steps.push({ block: b.title, kind: 'rest', secs: b.roundRest, name: 'Pause entre les tours' });
          });
        }
      } else {
        b.items.forEach(i => {
          for (let s = 1; s <= i.sets; s++) {
            const common = { id: i.id, fmt: 'sets', set: s, sets: i.sets, target: i.target || null, block: b.title, name: i.name, cue: i.cue, side: i.side, label: `Série ${s}/${i.sets}` };
            steps.push(i.time ? { ...common, kind: 'time', secs: i.time } : { ...common, kind: 'reps', reps: i.reps });
            if (s < i.sets || i !== b.items.at(-1)) steps.push({ block: b.title, kind: 'rest', secs: i.rest, name: 'Récupération' });
          }
        });
      }
    }
    steps.forEach((s, i) => { s.next = steps.slice(i + 1).find(x => x.kind !== 'rest')?.name || null; });
    return steps;
  }

  // ---------- Compréhension des messages ----------
  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const ZONE_WORDS = {
    genou: /\bgenoux?\b|\bmenisque|\brotule|\bligament croise/,
    dos: /\bdos\b|\blombaire|\blumbago|\bsciatique|\breins\b|\bhernie/,
    epaule: /\bepaules?\b|\bcoiffe des rotateurs/,
    poignet: /\bpoignets?\b|\bcanal carpien/,
    cheville: /\bchevilles?\b|\bpieds?\b|\btendon d achille|\bachille|\bvoute plantaire|\bmollets?\b/,
    hanche: /\bhanches?\b|\bbassin\b|\bpsoas/,
    nuque: /\bnuque\b|\bcou\b|\bcervicales?\b|\btorticolis/,
  };
  const EQUIP_WORDS = {
    halteres: /\bhalteres?\b|\bdumbbells?\b/,
    kettlebell: /\bkettle ?bells?\b|\bkettle\b/,
    elastique: /\belastiques?\b|\bbandes? (elastiques?|de resistance)\b|\bresistance band/,
    barre_traction: /\bbarre (de|a) tractions?\b|\bbarre de porte\b/,
    banc: /\bbanc\b/,
    chaise: /\bchaises?\b|\bmarches?\b|\bescaliers?\b|\btabouret/,
    corde: /\bcorde\b/,
    velo: /\bvelo\b|\bspinning\b/,
    rameur: /\brameur\b/,
    tapis_course: /\btapis de course\b/,
  };

  function parse(text) {
    const t = ' ' + norm(text) + ' ';
    const r = { intents: [] };

    // Fatigue
    if (/(epuise|creve|crevee|ko\b|a plat|vide|zombie|mal dormi|pas dormi|tres fatigue|plus d energie|aucune energie|lessive|naze)/.test(t)) r.fatigue = 4;
    else if (/(pas (tres |trop |vraiment )?en forme|pas (tres |trop )?bien|fatigue|bof|moyen|pas top|courbatur|un peu lasse|lasse|pas la peche)/.test(t)) r.fatigue = 3;
    else if (/(en forme|pleine forme|au top|la peche|motive|patate|super bien|tres bien|genial|en feu|a fond)/.test(t)) r.fatigue = 1;
    else if (/(\bnormal|ca va\b|correct|(je vais|ca va|vais|plutot) bien|bien merci|^ ?bien ?$|pas mal\b|comme d hab)/.test(t)) r.fatigue = 2;

    // Douleurs et gênes
    const better = /(va mieux|gueri|plus mal|plus de douleur|n ai plus|passe\b|disparu)/.test(t);
    const zones = Object.keys(ZONE_WORDS).filter(z => ZONE_WORDS[z].test(t));
    // « dos » comme zone à muscler (« muscler le dos ») n'est pas une douleur
    const dosFocus = /(muscler|travailler|renforcer|bosser) (le |mon )?dos/.test(t);
    const painZones = zones.filter(z => !(z === 'dos' && dosFocus));
    if (painZones.length && /(mal|douleur|douloureu|bless|entorse|tendinite|tendon|bloque|coince|opere|fracture|lumbago|sciatique|hernie|gene|sensible|raide|tiraille|fragile|souci|probleme|torticolis|foulure|claquage|elongation|arthrose|inflam)/.test(t) || (painZones.length && better)) {
      if (better) r.injuriesRemove = painZones;
      else {
        const sev = /(un peu|leger|legere|gene|sensible|raide|tiraille|fragile|petite?)/.test(t) && !/(tres mal|vraiment mal|grosse douleur|entorse|fracture|opere|bless)/.test(t) ? 'gene' : 'douleur';
        r.injuries = Object.fromEntries(painZones.map(z => [z, sev]));
      }
    } else if (/(aucune (douleur|gene)|pas de (douleur|gene|bobo)|rien du tout|aucun (souci|probleme|bobo)|tout va bien|pas mal nulle part|nulle part)/.test(t)) {
      r.injuries = {};
    }

    // Matériel
    if (/(pas de materiel|sans materiel|aucun materiel|poids du corps|rien comme materiel|pas d equipement|que mon corps)/.test(t)) r.equipment = [];
    else {
      const eqs = Object.keys(EQUIP_WORDS).filter(k => EQUIP_WORDS[k].test(t));
      if (eqs.length) {
        const neg = eqs.filter(k => new RegExp('(pas d(e|u|es|e la?)? ?|sans (de |d )?|plus d(e|es)? ?)(' + EQUIP_WORDS[k].source.replace(/\\b/g, '') + ')').test(t));
        const pos = eqs.filter(k => !neg.includes(k));
        if (pos.length) r.equipmentAdd = pos;
        if (neg.length) r.equipmentRemove = neg;
      }
    }

    // Durée
    let m;
    if ((m = t.match(/(\d)\s*h\s*(\d{1,2})/))) r.duration = Number(m[1]) * 60 + Number(m[2]);
    else if ((m = t.match(/(\d{1,3})\s*(min|minutes?|mn|')/))) r.duration = Number(m[1]);
    else if (/(une heure|1 ?h\b|1 heure)/.test(t)) r.duration = 60;
    else if (/demi[- ]heure/.test(t)) r.duration = 30;
    else if (/quart d heure/.test(t)) r.duration = 15;
    else if (/trois quarts d heure/.test(t)) r.duration = 45;

    // Objectif et zone travaillée
    if (/(maigrir|perdre du poids|bruler|calories|perte de poids|secher|mincir|hiit|transpirer)/.test(t)) r.goal = 'burn';
    else if (/(muscl|renforc|tonif|force|raffermir|sculpt)/.test(t)) r.goal = 'strength';
    else if (/(courir|course a pied|footing|jogging|running|\bcourse\b|fractionne)/.test(t)) r.goal = 'run';
    else if (/(cardio|endurance|souffle)/.test(t)) r.goal = 'cardio';
    else if (/(mobilite|souplesse|etire|etirement|yoga|detente|relax|recup|doux|douce|zen)/.test(t)) r.goal = 'mobility';
    if (/(haut du corps|\bbras\b|pecs|pectoraux|triceps|biceps)/.test(t) || dosFocus) r.focus = 'upper';
    else if (/(bas du corps|jambes|fessiers?|fesses|cuisses)/.test(t)) r.focus = 'lower';
    else if (/(abdos|ventre|gainage|sangle|tablette|taille)/.test(t)) r.focus = 'core';
    else if (/(corps entier|full ?body|complet|tout le corps)/.test(t)) r.focus = 'full';

    // Niveau
    if (/(debutante?|reprise|reprends|jamais fait|pas sportive?)/.test(t)) r.level = 1;
    else if (/(intermediaire)/.test(t)) r.level = 2;
    else if (/(avancee?|confirmee?|tres sportive?|experte?)/.test(t)) r.level = 3;

    // Modifications d'une séance existante
    if (/(plus facile|trop dur|trop difficile|moins intense|plus doux|plus douce|moins dur|y aller doucement)/.test(t)) r.intents.push('easier');
    if (/(plus dur|plus difficile|trop facile|plus intense|plus hard|corse|challenge)/.test(t)) r.intents.push('harder');
    if (/(plus court|moins long|raccourci|moins de temps)/.test(t)) r.intents.push('shorter');
    if (/(plus long|rallonge|plus de temps)/.test(t)) r.intents.push('longer');
    if (/(sans saut|pas de saut|sans sauter|voisins?|silencieu|bruit|appartement|impact)/.test(t)) r.intents.push('lowImpact');
    if (/(remplace|change (l |le |la |les )?(exercice|\w{4,})|enleve|retire|supprime|j aime pas|je n aime pas|deteste)/.test(t) && !/(change tout|autre seance|nouvelle seance)/.test(t)) r.intents.push('swap');
    if (/(autre seance|nouvelle seance|change tout|refais|une autre|regenere|differente|autre chose)/.test(t)) r.intents.push('reroll');
    if (/(quand meme|vraie seance|je veux m entrainer)/.test(t)) r.intents.push('force');
    if (/\b(go|vas[- ]y|c est parti|on y va|demarre|lance|commence|start)\b/.test(t)) r.intents.push('start');
    if (/\b(merci|super|parfait|top|genial|cool)\b/.test(t)) r.intents.push('thanks');
    if (/\b(salut|bonjour|coucou|hello|hey|bonsoir)\b/.test(t)) r.intents.push('hello');
    if (/(aide|comment ca marche|tu fais quoi|que sais[- ]tu)/.test(t)) r.intents.push('help');
    return r;
  }

  const understood = r => ['fatigue', 'injuries', 'injuriesRemove', 'equipment', 'equipmentAdd', 'equipmentRemove', 'duration', 'goal', 'focus', 'level'].some(k => r[k] !== undefined) || r.intents.length > 0;

  // Un exercice est-il compatible avec ces réglages (matériel, niveau, douleurs, sauts) ?
  function isEligible(o, id) { const e = D.BY_ID[id]; return !!e && eligible(e, context(o), { lvlCap: 3 }); }

  return { generate, swap, findItem, flatten, parse, understood, estimateMinutes, isEligible, FATIGUE, GOALS, FOCUS, norm };
});
