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

  function setSlot(o) { Object.assign(conv, o); ask(); }

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
      const goals = [['burn', '🔥 Brûler des calories'], ['strength', '💪 Me renforcer'], ['cardio', '❤️ Cardio'], ['mobility', '🧘 Mobilité / détente']];
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
    const opts = {
      fatigue: conv.fatigue, injuries: conv.injuries, equipment: conv.equipment || [], duration: conv.duration,
      goal: conv.goal || 'burn', focus: conv.focus || 'full', level: s.level, lowImpact: conv.lowImpact, force: conv.force,
      adj: clamp(s.adj + conv.adjSession, -2, 2), weightKg: latestWeight() || 65, seed: (conv.seed ??= Math.floor(Math.random() * 1e9)),
    };
    workout = C.generate(opts);
    const intro = workout.recovery
      ? `Tu es ${g('épuisé', 'épuisée')} : aujourd'hui, le meilleur entraînement c'est la récupération 💛. Voici une séance douce de mobilité et d'étirements.`
      : { 1: 'Tu es en forme : on peut y aller franchement 💪', 2: 'Voici ta séance du jour 👇', 3: 'On adapte à ta fatigue : moins de volume et pas de sauts 🙏' }[conv.fatigue];
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
          <details><summary><span class="wk-name">${esc(i.name)}</span><span class="wk-dose">${esc(dose(b, i))}</span></summary>
            <p class="wk-cue">${esc(i.cue || '')}</p></details>
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
      conv.fatigue = p.fatigue; changed = true;
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
    pl = { steps, i: 0, elapsed: 0, last: Date.now(), running: true, started: Date.now(), beeped: {} };
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
      $('#plBig').innerHTML = `<div class="pl-reps">${esc(st.reps)}<small> rép.${st.side ? ' / côté' : ''}</small></div><button class="primary pl-done" id="plDone">✓ C'est fait</button>`;
      $('#plDone').addEventListener('click', next);
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
    if (left <= 0) { beep(1040, 0.3); next(); }
  }
  function go(i) {
    pl.i = i; pl.elapsed = 0; pl.last = Date.now(); pl.beeped = {};
    renderStep();
  }
  function next() { if (pl.i + 1 >= pl.steps.length) finish(); else go(pl.i + 1); }
  function prev() { go(Math.max(0, pl.i - 1)); }
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
    $('#plEnd').classList.remove('hidden');
  }
  $('#plPlay').addEventListener('click', () => { pl.running = !pl.running; pl.last = Date.now(); $('#plPlay').textContent = pl.running ? '⏸' : '▶️'; });
  $('#plNextBtn').addEventListener('click', next);
  $('#plPrev').addEventListener('click', prev);
  $('#plClose').addEventListener('click', () => {
    const done = pl.i / pl.steps.length;
    if (done >= 0.5 && confirm('Tu as fait plus de la moitié de la séance. L\'enregistrer dans tes activités ?')) return finish();
    if (done < 0.5 && !confirm('Quitter la séance ?')) return;
    stopPlayer(); closePlayer();
    bot('Pas de souci, on remet ça quand tu veux 😉', [{ label: '▶️ Reprendre la séance', primary: true, silent: true, run: startPlayer }]);
  });
  document.querySelectorAll('#plEnd [data-fb]').forEach(b => b.addEventListener('click', () => {
    const fb = Number(b.dataset.fb);
    const s = S();
    s.adj = clamp(s.adj + fb, -2, 2);
    const today = todayStr();
    s.history.unshift({ date: today, title: workout.title, minutes: pl.minutes, kcal: pl.kcal, feedback: fb, goal: workout.goal });
    s.history = s.history.slice(0, 30);
    (state.activities[today] ||= []).push({ id: uid(), name: `🏋️ Coach : ${workout.title}`, minutes: pl.minutes, kcal: pl.kcal });
    save();
    closePlayer();
    renderAll();
    const msg = { '-1': 'Merci ! La prochaine séance sera un peu plus douce 🙏', 0: 'Parfait, on garde ce niveau 👌', 1: 'Noté, la prochaine sera un peu plus intense 😎' }[fb];
    bot(`Bravo pour cette séance 🎉 ${msg}<br><small>Elle est ajoutée à tes activités du jour (${pl.minutes} min, ~${pl.kcal} kcal).</small>`, [
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

  resetConv();
  renderHistory();
  restart();
})();
