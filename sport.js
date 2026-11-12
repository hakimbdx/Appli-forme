// Espace sport : coach conversationnel, carte de séance et lecteur avec minuteur.
// S'appuie sur coach.js (Coach), sport-data.js (SportData) et l'état global de app.js.
(() => {
  const C = window.Coach, D = window.SportData;
  const S = () => {
    state.sport ||= {};
    const s = state.sport;
    s.injuries ||= {}; s.history ||= []; s.adj ??= 0; s.level ??= null; s.equipment ??= null;
    return s;
  };
  // Accords selon le profil (féminin par défaut si inconnu → forme inclusive)
  const g = (m, f) => state.profile?.sex === 'm' ? m : state.profile?.sex === 'f' ? f : `${m}(e)`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let conv, workout = null;
  function resetConv() {
    const s = S();
    conv = {
      fatigue: null, injuriesOk: false, injuries: { ...s.injuries }, equipmentOk: false,
      equipment: s.equipment ? [...s.equipment] : null, duration: null, goal: null, focus: null,
      force: false, lowImpact: false, adjSession: 0, seed: null,
    };
    workout = null;
  }

  // ---------- Affichage de la conversation ----------
  const chat = $('#coachChat'), chipsEl = $('#coachChips');
  function scroll() { chat.scrollTop = chat.scrollHeight; }
  function addMsg(who, html) {
    const d = document.createElement('div');
    d.className = `msg ${who}`;
    d.innerHTML = html;
    chat.appendChild(d);
    scroll();
    return d;
  }
  function user(text) { addMsg('user', esc(text)); }
  function bot(html, chips = []) {
    chipsEl.innerHTML = '';
    const typing = addMsg('bot typing', '<span></span><span></span><span></span>');
    setTimeout(() => {
      typing.remove();
      addMsg('bot', html);
      setChips(chips);
    }, 350);
  }
  // chips : [{ label, run }] ; le libellé est affiché comme réponse de l'utilisatrice
  function setChips(chips) {
    chipsEl.innerHTML = '';
    chips.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = c.label;
      if (c.primary) b.className = 'primary';
      b.addEventListener('click', () => { if (!c.silent) user(c.label); chipsEl.innerHTML = ''; c.run(); });
      chipsEl.appendChild(b);
    });
  }
  // Choix multiple (douleurs, matériel)
  function multi(options, selected, doneLabel, onDone, noneOpt) {
    chipsEl.innerHTML = '';
    const sel = new Set(selected);
    const wrap = document.createElement('div');
    wrap.className = 'multi';
    const render = () => {
      wrap.innerHTML = '';
      Object.entries(options).forEach(([k, label]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'toggle' + (sel.has(k) ? ' on' : '');
        b.textContent = (sel.has(k) ? '✓ ' : '') + label;
        b.addEventListener('click', () => { sel.has(k) ? sel.delete(k) : sel.add(k); render(); });
        wrap.appendChild(b);
      });
      const row = document.createElement('div');
      row.className = 'multi-actions';
      if (noneOpt) {
        const n = document.createElement('button');
        n.type = 'button'; n.textContent = noneOpt;
        n.addEventListener('click', () => { user(noneOpt); chipsEl.innerHTML = ''; onDone([]); });
        row.appendChild(n);
      }
      const ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'primary'; ok.textContent = doneLabel;
      ok.addEventListener('click', () => {
        const keys = [...sel];
        user(keys.length ? keys.map(k => options[k]).join(', ') : (noneOpt || 'Aucun'));
        chipsEl.innerHTML = ''; onDone(keys);
      });
      row.appendChild(ok);
      wrap.appendChild(row);
    };
    render();
    chipsEl.appendChild(wrap);
  }

  // ---------- Déroulé de la conversation ----------
  const FATIGUE_CHIPS = () => [
    { label: '💪 En pleine forme', run: () => setSlot({ fatigue: 1 }) },
    { label: '🙂 Normal', run: () => setSlot({ fatigue: 2 }) },
    { label: `😐 Un peu ${g('fatigué', 'fatiguée')}`, run: () => setSlot({ fatigue: 3 }) },
    { label: `😴 ${g('Épuisé', 'Épuisée')}`, run: () => setSlot({ fatigue: 4 }) },
  ];
  const zonesList = inj => Object.entries(inj).map(([z, sev]) => `${sev === 'gene' ? 'gêne' : 'douleur'} ${D.ZONES[z].toLowerCase().replace(/^(\w)/, '$1')}`).join(', ');

  function logFatigue(f) {
    const s = S(), t = todayStr();
    s.fatigueLog = [...(s.fatigueLog || []).filter(x => x.date !== t), { date: t, fatigue: f }].slice(-60);
    save();
  }
  function setSlot(o) { if (o.fatigue) logFatigue(o.fatigue); Object.assign(conv, o); ask(); }

  function ask() {
    const s = S();
    if (!s.level) {
      return bot('Pour bien doser les exercices, quel est ton niveau en sport ?', [
        { label: `🌱 ${g('Débutant', 'Débutante')} / reprise`, run: () => { s.level = 1; save(); ask(); } },
        { label: '🏃 Intermédiaire', run: () => { s.level = 2; save(); ask(); } },
        { label: `🔥 ${g('Avancé', 'Avancée')}`, run: () => { s.level = 3; save(); ask(); } },
      ]);
    }
    if (conv.fatigue == null) return bot('Comment te sens-tu aujourd\'hui ?', FATIGUE_CHIPS());
    if (!conv.injuriesOk) {
      const prev = Object.keys(conv.injuries).length;
      if (prev) {
        return bot(`La dernière fois, tu m'avais signalé : <strong>${esc(zonesList(conv.injuries))}</strong>. C'est toujours le cas ?`, [
          { label: 'Oui, toujours', run: () => setSlot({ injuriesOk: true }) },
          { label: '🙌 Ça va mieux', run: () => setSlot({ injuries: {}, injuriesOk: true }) },
          { label: 'Autre chose', run: askZones },
        ]);
      }
      return bot('As-tu des douleurs ou des gênes en ce moment ?', [
        { label: '👍 Aucune', run: () => setSlot({ injuries: {}, injuriesOk: true }) },
        { label: 'Oui', run: askZones },
      ]);
    }
    if (!conv.equipmentOk) {
      bot('Quel matériel as-tu sous la main ? (touche pour sélectionner)');
      return setTimeout(() => multi(D.EQUIPMENT, conv.equipment || [], 'Valider', keys => setSlot({ equipment: keys, equipmentOk: true }), 'Rien, poids du corps'), 400);
    }
    if (conv.duration == null) {
      return bot('Combien de temps as-tu ?', [10, 20, 30, 45, 60].map(m => ({ label: `${m} min`, run: () => setSlot({ duration: m }) })));
    }
    if (conv.fatigue === 4 && !conv.force) return build();
    if (conv.goal == null) {
      const lose = (state.profile?.goal ?? 0) < 0;
      const goals = [['burn', '🔥 Brûler des calories'], ['strength', '💪 Me renforcer'], ['run', '🏃 Course à pied'], ['cardio', '❤️ Cardio'], ['mobility', '🧘 Mobilité / détente']];
      if (!lose) goals.push(goals.shift());
      return bot(`Quel est ton objectif pour cette séance ?${lose ? ' (Pour ton régime, je te conseille « Brûler des calories ».)' : ''}`,
        goals.map(([k, l]) => ({ label: l, run: () => setSlot({ goal: k }) })));
    }
    if (conv.focus == null && ['burn', 'strength'].includes(conv.goal)) {
      return bot('Quelle partie du corps veux-tu travailler ?', Object.entries(C.FOCUS).map(([k, l]) => ({ label: l, run: () => setSlot({ focus: k }) })));
    }
    build();
  }

  function askZones() {
    bot('Où ça ? (plusieurs choix possibles)');
    setTimeout(() => multi(D.ZONES, Object.keys(conv.injuries), 'Valider', keys => {
      if (!keys.length) return setSlot({ injuries: {}, injuriesOk: true });
      bot('C\'est plutôt…', [
        { label: 'Une gêne légère', run: () => setSlot({ injuries: Object.fromEntries(keys.map(k => [k, 'gene'])), injuriesOk: true }) },
        { label: 'Une vraie douleur / blessure', run: () => setSlot({ injuries: Object.fromEntries(keys.map(k => [k, 'douleur'])), injuriesOk: true }) },
      ]);
    }), 400);
  }

  // ---------- Génération et carte de séance ----------
  function build(prefix = '') {
    const s = S();
    s.equipment = conv.equipment || [];
    s.injuries = conv.injuries;
    save();
    const R = SportProgress.readinessNow();
    // Message sur l'état de forme, une seule fois par conversation
    let rd = '';
    if (!conv.rdShown) {
      conv.rdShown = true;
      if (R.level === 'red') rd = `🔴 ${R.reasons[0]} J'allège automatiquement ta séance.`;
      else if (R.level === 'yellow') rd = `🟡 ${R.reasons[0]} On garde le même niveau.`;
      else if (R.adj > 0) rd = '🟢 Ta charge d\'entraînement est bien maîtrisée : je monte un peu la difficulté.';
    }
    if (rd) prefix = prefix ? `${prefix}<br>${esc(rd)}` : esc(rd);
    if (conv.goal === 'run') return buildRun(prefix, R);
    const opts = {
      fatigue: conv.fatigue, injuries: conv.injuries, equipment: conv.equipment || [], duration: conv.duration,
      goal: conv.goal || 'burn', focus: conv.focus || 'full', level: s.level, lowImpact: conv.lowImpact, force: conv.force,
      adj: clamp(s.adj + conv.adjSession + R.adj, -2, 2), weightKg: latestWeight() || 65, seed: (conv.seed ??= Math.floor(Math.random() * 1e9)),
    };
    workout = C.generate(opts);
    annotate(workout, opts);
    const intro = workout.recovery
      ? `Tu es ${g('épuisé', 'épuisée')} : aujourd'hui, le meilleur entraînement c'est la récupération 💛. Voici une séance douce de mobilité et d'étirements.`
      : R.level === 'red' ? 'Voici une séance allégée pour laisser ton corps récupérer 🙏'
      : { 1: 'Tu es en forme : on peut y aller franchement 💪', 2: 'Voici ta séance du jour 👇', 3: 'On adapte à ta fatigue : moins de volume et pas de sauts 🙏' }[conv.fatigue];
    showWorkout(prefix ? `${prefix}<br>${intro}` : intro);
  }

  // Ajoute à chaque exercice de renforcement la charge / les répétitions conseillées
  // d'après l'historique, et passe à la variante supérieure quand elle est maîtrisée
  function annotate(w, opts) {
    const used = new Set(w.blocks.flatMap(b => b.items.map(i => i.id)));
    for (const b of w.blocks) {
      if (b.format !== 'sets') continue;
      for (const it of b.items) {
        if (it.target) continue;
        let sug = SportProgress.suggestFor(it.id, opts.equipment, opts);
        if ((sug.action === 'variant' || sug.action === 'easier') && sug.toId && !used.has(sug.toId) && C.isEligible(opts, sug.toId)) {
          const e = D.BY_ID[sug.toId], from = it.name;
          used.add(e.id);
          Object.assign(it, { id: e.id, name: e.name, cue: e.cue, side: e.side, pattern: e.pattern });
          it.progress = `${sug.action === 'variant' ? '⬆️ Tu maîtrises' : '⬇️ On consolide :'} « ${from} » → « ${e.name} »`;
          sug = SportProgress.suggestFor(e.id, opts.equipment, opts);
        }
        if (sug.action === 'new' && !SportProgress.loadKind(it.id, opts.equipment)) continue;
        it.target = { kg: sug.kg ?? null, reps: sug.reps ?? null, secs: sug.secs ?? null, text: sug.text, action: sug.action };
        if (it.time && sug.secs) it.time = sug.secs;
        if (!it.time && !SportProgress.loadKind(it.id, opts.equipment) && ['up', 'down'].includes(sug.action) && sug.reps) it.reps = sug.reps;
      }
    }
    w.estMinutes = C.estimateMinutes(w);
  }

  // Séance de course à pied d'après l'historique des allures
  function buildRun(prefix, R) {
    const s = S(), P = window.Progression;
    if (['genou', 'cheville', 'hanche'].some(z => conv.injuries[z] === 'douleur')) {
      conv.goal = 'cardio'; conv.lowImpact = true;
      return build((prefix ? prefix + '<br>' : '') + 'Avec cette douleur, je déconseille la course aujourd\'hui : voici du cardio sans impact.');
    }
    const rs = P.suggestRun(s.runs || [], todayStr(), conv.fatigue >= 4 ? 'red' : R.level);
    let nx = rs.next;
    if (nx.type === 'rest' && !conv.force) {
      return bot(`${prefix ? prefix + '<br>' : ''}${esc(nx.text)} 👏`, [
        { label: 'Je veux quand même courir', run: () => { conv.force = true; build(); } },
        { label: 'Autre type de séance', run: () => { conv.goal = null; ask(); } },
      ]);
    }
    if (nx.type === 'rest') nx = { type: 'easy', minutes: 30, pace: rs.easyPace };
    const minutes = clamp(conv.duration || nx.minutes || 30, 15, 120);
    const paceTxt = nx.pace ? `vers ${P.fmtPace(nx.pace)}` : 'à une allure où tu peux parler';
    let blocks;
    if (nx.type === 'interval') {
      const fast = { id: 'run_fast', name: `Rapide ${nx.pace ? 'vers ' + P.fmtPace(nx.pace) : ''}`.trim(), cue: 'Rapide mais contrôlé : ce n\'est pas un sprint.', time: nx.work || 60 };
      const slow = { id: 'run_slow', name: 'Trot de récupération', cue: 'Trottine tranquillement ou marche.', time: nx.rest || 90 };
      blocks = [
        { key: 'warmup', title: 'Échauffement', format: 'list', items: [{ id: 'run_warm', name: 'Footing très facile', cue: 'Allure très tranquille pour monter en température.', time: 600 }] },
        { key: 'main', title: 'Fractionné', format: 'circuit', rounds: nx.reps || 6, work: fast.time, rest: 0, roundRest: 0, items: [fast, slow], note: `${nx.reps || 6} accélérations de ${fast.time} s.` },
        { key: 'cooldown', title: 'Retour au calme', format: 'list', items: [{ id: 'run_cool', name: 'Trot puis marche', cue: 'Laisse redescendre le cœur.', time: 300 }] },
      ];
    } else {
      blocks = [
        { key: 'warmup', title: 'Échauffement', format: 'list', items: [{ id: 'run_walk', name: 'Marche rapide', cue: 'Grands pas, bras actifs.', time: 180 }] },
        { key: 'main', title: nx.type === 'long' ? 'Sortie longue' : 'Footing', format: 'list', items: [{ id: 'run_main', name: `Course ${paceTxt}`, cue: rs.empty ? 'Tu dois pouvoir parler. Alterne course et marche si besoin (ex : 4 min / 1 min).' : 'Tu dois pouvoir parler en courant.', time: Math.max(5, minutes - 6) * 60 }] },
        { key: 'cooldown', title: 'Retour au calme', format: 'list', items: [{ id: 'run_cool', name: 'Marche de récupération', cue: 'Puis étire mollets et cuisses.', time: 180 }] },
      ];
    }
    workout = {
      title: { easy: 'Footing', interval: 'Fractionné', long: 'Sortie longue' }[nx.type] || 'Course', goal: 'run', run: { type: nx.type, pace: nx.pace || null, easy: rs.easyPace || null },
      rpe: nx.type === 'interval' ? '8/10 sur les accélérations' : '4-5/10', warnings: rs.reasons, blocks, fatigue: conv.fatigue,
      opts: { goal: 'run', duration: minutes }, recovery: false,
    };
    workout.estMinutes = C.estimateMinutes(workout);
    workout.kcal = Math.round(9 * (latestWeight() || 65) * workout.estMinutes / 60);
    const intro = rs.empty ? 'Première sortie avec moi : on y va tranquillement 🏃' : `Voici ta prochaine sortie, calculée d'après tes dernières courses 🏃`;
    showWorkout(prefix ? `${prefix}<br>${intro}` : intro);
  }

  function showWorkout(intro) {
    chat.querySelectorAll('.wk').forEach(el => el.classList.add('stale'));
    bot(`${intro}${card(workout)}`, [
      { label: '▶️ Démarrer', primary: true, silent: true, run: startPlayer },
      ...(workout.recovery ? [{ label: 'Je veux quand même m\'entraîner', run: () => { conv.force = true; ask(); } }] : []),
      { label: '😮‍💨 Plus facile', run: () => modify({ intents: ['easier'] }) },
      { label: '🔥 Plus dur', run: () => modify({ intents: ['harder'] }) },
      { label: '🔇 Sans sauts', run: () => modify({ intents: ['lowImpact'] }) },
      { label: '⏱ Plus court', run: () => modify({ intents: ['shorter'] }) },
      { label: '🎲 Autre séance', run: () => modify({ intents: ['reroll'] }) },
    ]);
  }

  function dose(b, i) {
    if (b.format === 'circuit') return `${i.time} s`;
    if (b.format === 'list') return i.side ? `${i.time / 2} s / côté` : i.time >= 120 ? `${Math.round(i.time / 60)} min` : `${i.time} s`;
    return `${i.sets} × ${i.time ? `${i.time} s` : i.reps}${i.side ? ' / côté' : ''}`;
  }
  function card(w) {
    return `<div class="wk">
      <div class="wk-head"><strong>${esc(w.title)}</strong>
        <span>⏱ ${w.estMinutes} min · 🔥 ~${w.kcal} kcal · Effort ${esc(w.rpe)}</span></div>
      ${w.warnings.length ? `<ul class="wk-warn">${w.warnings.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${w.blocks.map((b, bi) => `<div class="wk-block">
        <h4>${esc(b.title)}${b.format === 'circuit' && b.rounds ? ` <small>× ${b.rounds} tour${b.rounds > 1 ? 's' : ''}</small>` : ''}</h4>
        ${b.note ? `<p class="wk-note">${esc(b.note)}</p>` : ''}
        <ol>${b.items.map((i, ii) => `<li>
          <details><summary><span class="wk-name">${esc(i.name)}</span><span class="wk-dose">${esc(dose(b, i))}${i.target?.kg ? ` · ${String(i.target.kg).replace('.', ',')} kg` : ''}</span></summary>
            <p class="wk-cue">${esc(i.cue || '')}</p></details>
          ${i.progress ? `<small class="wk-prog">${esc(i.progress)}</small>` : ''}
          ${i.target?.text && i.target.action !== 'new' ? `<small class="wk-prog">🎯 ${esc(i.target.text)}</small>` : ''}
          ${D.BY_ID[i.id] ? `<button class="icon wk-swap" data-swap="${bi}:${ii}" title="Remplacer cet exercice" aria-label="Remplacer ${esc(i.name)}">🔄</button>` : ''}
        </li>`).join('')}</ol>
      </div>`).join('')}
    </div>`;
  }

  // Modifications demandées après la génération
  function modify(p, acks = []) {
    const it = p.intents || [];
    const n0 = acks.length;
    if (it.includes('easier')) { conv.adjSession = clamp(conv.adjSession - 1, -2, 2); acks.push('Ok, je baisse l\'intensité.'); }
    if (it.includes('harder')) { conv.adjSession = clamp(conv.adjSession + 1, -2, 2); acks.push('C\'est parti, on corse un peu !'); }
    if (it.includes('shorter')) { conv.duration = Math.max(10, conv.duration - 10); acks.push(`Version de ${conv.duration} min.`); }
    if (it.includes('longer')) { conv.duration = Math.min(90, conv.duration + 10); acks.push(`Version de ${conv.duration} min.`); }
    if (it.includes('lowImpact')) { conv.lowImpact = true; acks.push('Aucun saut : parfait pour les voisins 🤫'); }
    if (it.includes('force') && conv.fatigue === 4) { conv.force = true; acks.push('D\'accord, mais on reste en douceur.'); }
    if (it.includes('swap') && workout) {
      const f = C.findItem(workout, p.text || '');
      if (f) return swapAt(f.bi, f.ii);
      if (acks.length === n0 && !p.changed) { bot('Quel exercice veux-tu remplacer ? Tu peux aussi toucher 🔄 à côté de l\'exercice.'); return true; }
    }
    if (it.includes('reroll')) { conv.seed = null; acks.push('Nouvelle séance 🎲'); }
    if (acks.length === n0 && !p.changed) return false;
    build(esc(acks.join(' ')));
    return true;
  }

  function swapAt(bi, ii) {
    const old = workout.blocks[bi]?.items[ii];
    const w2 = C.swap(workout, bi, ii);
    if (!w2) return bot(`Je n'ai pas d'autre exercice compatible pour remplacer « ${esc(old?.name || '')} » avec tes contraintes.`);
    delete w2.blocks[bi].items[ii].target; delete w2.blocks[bi].items[ii].progress;
    annotate(w2, w2.opts);
    workout = w2;
    showWorkout(`J'ai remplacé « ${esc(old.name)} » par « ${esc(w2.blocks[bi].items[ii].name)} ».`);
  }

  // ---------- Messages libres ----------
  function onText(text) {
    user(text);
    const p = C.parse(text);
    p.text = text;
    // « remplace … » : les noms d'exercices contiennent des mots-clés (bras, genoux…) à ne pas interpréter
    if (workout && p.intents.includes('swap')) {
      const f = C.findItem(workout, text);
      if (f) return swapAt(f.bi, f.ii);
    }
    const s = S();
    const acks = [];
    let changed = false;
    if (p.level) { s.level = p.level; save(); changed = true; }
    if (p.fatigue) {
      conv.fatigue = p.fatigue; changed = true; logFatigue(p.fatigue);
      acks.push({ 1: 'Super, tu es en forme 💪', 2: 'Ok, forme normale.', 3: 'Noté, on y va en douceur 💛', 4: 'Je comprends, on va privilégier la récupération 💛' }[p.fatigue]);
    }
    if (p.injuries) {
      if (!Object.keys(p.injuries).length) { conv.injuries = {}; acks.push('Aucune douleur, parfait 👍'); }
      else { Object.assign(conv.injuries, p.injuries); acks.push(`Noté : ${zonesList(p.injuries)}. J'adapte les exercices.`); }
      conv.injuriesOk = true; changed = true;
    }
    if (p.injuriesRemove) {
      p.injuriesRemove.forEach(z => delete conv.injuries[z]);
      conv.injuriesOk = true; changed = true; acks.push('Content que ça aille mieux 🙌');
    }
    if (p.equipment) { conv.equipment = []; conv.equipmentOk = true; changed = true; acks.push('Ok, séance au poids du corps.'); }
    if (p.equipmentAdd || p.equipmentRemove) {
      const set = new Set(conv.equipment || s.equipment || []);
      (p.equipmentAdd || []).forEach(k => set.add(k));
      (p.equipmentRemove || []).forEach(k => set.delete(k));
      conv.equipment = [...set]; conv.equipmentOk = true; changed = true;
      acks.push(`Matériel : ${conv.equipment.map(k => D.EQUIPMENT[k].toLowerCase()).join(', ') || 'poids du corps'}.`);
    }
    if (p.duration) { conv.duration = clamp(p.duration, 10, 90); changed = true; acks.push(`${conv.duration} minutes, c'est noté.`); }
    if (p.goal) { conv.goal = p.goal; changed = true; }
    if (p.focus) { conv.focus = p.focus; changed = true; }

    if (workout) {
      if (p.intents.includes('start') && !changed) return startPlayer();
      if (modify({ ...p, changed }, acks)) return;
    }
    if (p.intents.includes('help')) {
      return bot('Je crée des séances adaptées à ta forme du jour, à ton matériel et à tes douleurs. Tu peux tout me dire d\'un coup, par exemple : « un peu fatiguée, mal au dos, 30 min avec un élastique, je veux brûler des calories ». Une fois la séance créée, demande-moi « plus facile », « sans sauts », « remplace les squats »…');
    }
    if (!C.understood(p)) {
      return bot('Je n\'ai pas bien compris 🤔 Tu peux me répondre avec les boutons, ou écrire par exemple : « fatiguée, mal au genou, 20 min avec des haltères ».');
    }
    if (p.intents.includes('hello') && !changed) acks.push('Bonjour 👋');
    if (p.intents.includes('thanks') && !changed) return bot('Avec plaisir ! Bonne séance 💪');
    if (acks.length) addMsg('bot', esc(acks.join(' ')));
    ask();
  }

  $('#coachForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#coachInput').value.trim();
    if (!v) return;
    $('#coachInput').value = '';
    onText(v);
  });
  chat.addEventListener('click', e => {
    const b = e.target.closest('[data-swap]');
    if (!b || b.closest('.stale')) return;
    const [bi, ii] = b.dataset.swap.split(':').map(Number);
    user('🔄 Remplacer « ' + workout.blocks[bi].items[ii].name + ' »');
    swapAt(bi, ii);
  });

  // ---------- Lecteur de séance ----------
  let pl = null, audio = null, wake = null;
  function beep(freq = 880, dur = 0.12) {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), gn = audio.createGain();
      o.frequency.value = freq; o.connect(gn); gn.connect(audio.destination);
      gn.gain.setValueAtTime(0.25, audio.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
      o.start(); o.stop(audio.currentTime + dur);
    } catch { /* son indisponible */ }
  }
  const mmss = s => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

  async function startPlayer() {
    if (!workout) return;
    const steps = C.flatten(workout);
    pl = { steps, i: 0, elapsed: 0, last: Date.now(), running: true, started: Date.now(), beeped: {}, log: {} };
    beep(660, 0.01); // débloque le son sur iPhone (geste de l'utilisateur)
    try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }
    $('#plEnd').classList.add('hidden');
    $('#player').classList.remove('hidden');
    document.body.classList.add('no-scroll');
    pl.timer = setInterval(tick, 200);
    renderStep();
  }
  function step() { return pl.steps[pl.i]; }
  function renderStep() {
    const st = step();
    const n = pl.steps.length;
    $('#plBar').style.width = `${(pl.i / n) * 100}%`;
    $('#plCount').textContent = `${pl.i + 1}/${n}`;
    $('#plBlock').textContent = st.block;
    $('#plLabel').textContent = st.label || '';
    $('#plName').textContent = st.name;
    $('#player').classList.toggle('resting', st.kind === 'rest');
    $('#plCue').textContent = st.kind === 'rest' ? '' : (st.cue || '') + (st.side ? (st.kind === 'time' ? ' Change de côté à mi-temps.' : ' De chaque côté.') : '');
    $('#plNext').textContent = st.next ? `Ensuite : ${st.next}` : 'Dernier exercice !';
    $('#plPlay').textContent = pl.running ? '⏸' : '▶️';
    if (st.kind === 'reps') {
      const track = st.fmt === 'sets' && D.BY_ID[st.id];
      const kind = track && SportProgress.loadKind(st.id, conv.equipment);
      const lg = logFor(st);
      const prevSet = lg.sets.at(-1);
      const lastKg = (S().lifts?.[st.id] || []).at(-1)?.sets?.[0]?.kg;
      const kg = prevSet?.kg ?? st.target?.kg ?? lastKg ?? '';
      const goal = Number(String(st.target?.reps || st.reps).split('-').at(-1)) || 10;
      const reps = prevSet?.reps ?? goal;
      const stp = (k, v, unit) => `<div class="stp"><button type="button" data-stp="${k}" data-d="-1" aria-label="moins">−</button>
        <input id="stp-${k}" inputmode="decimal" value="${v}" aria-label="${unit}"/><button type="button" data-stp="${k}" data-d="1" aria-label="plus">+</button><small>${unit}</small></div>`;
      $('#plBig').innerHTML = `<div class="pl-reps">${esc(st.reps)}<small> rép.${st.side ? ' / côté' : ''}</small></div>
        ${st.target?.text && st.target.action !== 'new' ? `<p class="pl-target">🎯 ${esc(st.target.text)}</p>` : ''}
        ${track ? `<div class="pl-log">${kind ? stp('kg', kg, 'kg') : ''}${stp('reps', reps, 'rép. faites')}</div>` : ''}
        <button class="primary pl-done" id="plDone">✓ Série validée</button>`;
      $('#plBig').querySelectorAll('[data-stp]').forEach(b => b.addEventListener('click', () => {
        const inp = $('#stp-' + b.dataset.stp);
        const stepv = b.dataset.stp === 'kg' ? (kind === 'kettlebell' ? 2 : (Number(inp.value) || 0) < 10 ? 1 : 2) : 1;
        inp.value = Math.max(0, (Number(String(inp.value).replace(',', '.')) || 0) + stepv * Number(b.dataset.d));
      }));
      $('#plDone').addEventListener('click', () => {
        if (track) lg.sets.push({ kg: kind ? Number(String($('#stp-kg').value).replace(',', '.')) || 0 : 0, reps: Number($('#stp-reps').value) || 0 });
        next();
      });
    } else {
      $('#plBig').innerHTML = `<div class="pl-time" id="plTime">${mmss(st.secs - pl.elapsed)}</div>`;
    }
  }
  function tick() {
    if (!pl || !pl.running) { if (pl) pl.last = Date.now(); return; }
    const now = Date.now();
    const st = step();
    if (st.kind === 'reps') { pl.last = now; return; }
    pl.elapsed += (now - pl.last) / 1000; pl.last = now;
    const left = st.secs - pl.elapsed;
    const el = $('#plTime');
    if (el) el.textContent = mmss(left);
    const sec = Math.ceil(left);
    if (sec <= 3 && sec >= 1 && !pl.beeped[sec]) { pl.beeped[sec] = 1; beep(660); }
    if (st.side && st.kind === 'time' && !pl.beeped.half && pl.elapsed >= st.secs / 2) { pl.beeped.half = 1; beep(990, 0.25); $('#plCue').textContent = '🔁 Change de côté !'; }
    if (left <= 0) { beep(1040, 0.3); logTime(st, st.secs); next(); }
  }
  function go(i) {
    pl.i = i; pl.elapsed = 0; pl.last = Date.now(); pl.beeped = {};
    renderStep();
  }
  // Journal des séries de la séance en cours, par exercice
  function logFor(st) {
    return (pl.log[st.id] ||= { sets: [], target: st.kind === 'time' ? String(st.secs) : st.reps, time: st.kind === 'time' });
  }
  function logTime(st, secs) {
    if (st.fmt !== 'sets' || st.kind !== 'time' || !D.BY_ID[st.id] || secs < 5) return;
    const lg = logFor(st);
    if (lg.sets.length < st.set) lg.sets.push({ secs: Math.round(secs) });
  }
  function next() { if (pl.i + 1 >= pl.steps.length) finish(); else go(pl.i + 1); }
  function nextManual() { const st = step(); logTime(st, pl.elapsed); next(); }
  function prev() {
    const i = Math.max(0, pl.i - 1), st = pl.steps[i];
    // Revenir sur une série déjà notée l'efface pour la refaire
    if (st.fmt === 'sets' && pl.log[st.id]) pl.log[st.id].sets = pl.log[st.id].sets.slice(0, st.set - 1);
    go(i);
  }
  function stopPlayer() {
    clearInterval(pl?.timer);
    try { wake?.release(); } catch { /* rien */ }
    wake = null;
  }
  function closePlayer() {
    $('#player').classList.add('hidden');
    document.body.classList.remove('no-scroll');
  }
  function finish() {
    stopPlayer();
    const minutes = Math.max(1, Math.round((Date.now() - pl.started) / 60000));
    pl.minutes = minutes;
    pl.kcal = Math.round(workout.kcal * Math.min(1.3, minutes / Math.max(1, workout.estMinutes)));
    $('#plBar').style.width = '100%';
    $('#plEndText').textContent = `${minutes} min d'effort · ~${pl.kcal} kcal ajoutées à tes activités du jour.`;
    const isRun = workout.goal === 'run';
    $('#plKmWrap').classList.toggle('hidden', !isRun);
    if (isRun) {
      // Estimation : temps couru à l'allure facile (la marche d'échauffement compte pour moitié)
      const ref = workout.run.easy || workout.run.pace;
      const runMin = workout.run.type === 'interval' ? minutes : Math.max(1, minutes - 3);
      $('#plKm').value = ref ? String(Math.round(runMin * 60 / ref * 10) / 10).replace('.', ',') : '';
    }
    $('#plEnd').classList.remove('hidden');
  }
  $('#plPlay').addEventListener('click', () => { pl.running = !pl.running; pl.last = Date.now(); $('#plPlay').textContent = pl.running ? '⏸' : '▶️'; });
  $('#plNextBtn').addEventListener('click', nextManual);
  $('#plPrev').addEventListener('click', prev);
  $('#plClose').addEventListener('click', () => {
    const done = pl.i / pl.steps.length;
    if (done >= 0.5 && confirm('Tu as fait plus de la moitié de la séance. L\'enregistrer dans tes activités ?')) return finish();
    if (done < 0.5 && !confirm('Quitter la séance ?')) return;
    stopPlayer(); closePlayer();
    bot('Pas de souci, on remet ça quand tu veux 😉', [{ label: '▶️ Reprendre la séance', primary: true, silent: true, run: startPlayer }]);
  });
  document.querySelectorAll('#plEnd [data-rpe]').forEach(b => b.addEventListener('click', () => {
    const rpe = Number(b.dataset.rpe);
    const fb = rpe <= 5 ? 1 : rpe >= 9 ? -1 : 0; // ressenti → difficulté des prochaines séances
    const s = S();
    s.adj = clamp(s.adj + fb, -2, 2);
    const today = todayStr();
    // Performances par exercice (surcharge progressive)
    s.lifts ||= {};
    const logged = Object.entries(pl.log).filter(([, lg]) => lg.sets.length);
    for (const [id, lg] of logged) {
      s.lifts[id] = [...(s.lifts[id] || []), { date: today, target: lg.target, rpe, sets: lg.sets, ...(lg.time ? { time: true } : {}) }].slice(-50);
    }
    let extra = '';
    if (workout.goal === 'run') {
      const km = Number(String($('#plKm').value).replace(',', '.'));
      if (km > 0) {
        SportProgress.logRun({ date: today, km, min: pl.minutes, rpe, type: workout.run.type });
        extra = ` ${String(km).replace('.', ',')} km à ${window.Progression.fmtPace(window.Progression.pace(km, pl.minutes))}.`;
      }
      s.history.unshift({ date: today, title: workout.title, minutes: pl.minutes, kcal: pl.kcal, rpe, feedback: fb, goal: 'run', run: true });
    } else {
      s.history.unshift({ date: today, title: workout.title, minutes: pl.minutes, kcal: pl.kcal, rpe, feedback: fb, goal: workout.goal });
      (state.activities[today] ||= []).push({ id: uid(), src: 'coach', name: `🏋️ Coach : ${workout.title}`, minutes: pl.minutes, kcal: pl.kcal });
    }
    s.history = s.history.slice(0, 60);
    save();
    closePlayer();
    renderAll();
    const msg = { '-1': 'Merci ! La prochaine séance sera un peu plus douce 🙏', 0: 'Parfait, on garde ce niveau 👌', 1: 'Noté, la prochaine sera un peu plus intense 😎' }[fb];
    const ups = logged.map(([id]) => SportProgress.suggestFor(id, conv.equipment)).filter(x => ['up', 'variant', 'longer'].includes(x.action)).length;
    bot(`Bravo pour cette séance 🎉 ${msg}${esc(extra)}<br><small>Ajoutée à tes activités du jour (${pl.minutes} min, ~${pl.kcal} kcal).${logged.length ? ` ${logged.length} exercice(s) enregistré(s)${ups ? `, dont ${ups} où tu peux augmenter la difficulté la prochaine fois 💪` : ''} : voir l'onglet 📈 Progression.` : ''}</small>`, [
      { label: '🔁 Nouvelle séance', run: restart },
    ]);
  }));

  // ---------- Historique, sous-onglets, démarrage ----------
  function renderHistory() {
    const h = S().history;
    $('#coachHistoryCard').classList.toggle('hidden', !h.length);
    const fbIcon = { '-1': '🥵', 0: '👌', 1: '😎' };
    $('#coachHistory').innerHTML = h.slice(0, 6).map(x => `<div class="item"><div>${esc(x.title)}<br><small>${fmtDate(x.date)} · ${x.minutes} min · ~${x.kcal} kcal</small></div><span>${fbIcon[x.feedback] ?? ''}</span></div>`).join('');
  }
  window.renderSportHistory = renderHistory;

  document.querySelectorAll('.subnav [data-sub]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.subnav [data-sub]').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('#activity .sub').forEach(x => x.classList.toggle('hidden', x.id !== 'sub-' + b.dataset.sub));
  }));

  function restart() {
    resetConv();
    const s = S();
    const last = s.history[0];
    const hello = last
      ? `Re-bonjour ! Ta dernière séance : « ${esc(last.title)} » (${fmtDate(last.date)}).`
      : 'Bonjour ! Je suis ton coach 🏋️‍♀️ Je vais te préparer une séance sur mesure.';
    addMsg('bot', `${hello} <small class="muted">Tu peux répondre avec les boutons ou m'écrire librement.</small>`);
    ask();
  }

  $('#coachReset').addEventListener('click', () => { chat.innerHTML = ''; restart(); });

  resetConv();
  renderHistory();
  restart();
})();
