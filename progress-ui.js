// Onglet « Progression » de l'espace sport + fonctions partagées avec le coach (sport.js).
// S'appuie sur progression.js (Progression), sport-data.js (SportData), coach.js (Coach) et app.js.
(() => {
  const P = window.Progression, D = window.SportData, C = window.Coach;
  const sp = () => {
    state.sport ||= {};
    const s = state.sport;
    s.lifts ||= {}; s.runs ||= []; s.fatigueLog ||= []; s.history ||= [];
    return s;
  };
  const fmt = (v, d = 1) => (v == null || isNaN(v) ? '—' : Number(v.toFixed(d)).toLocaleString('fr-FR'));
  const shortDate = d => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; };

  // ---------- Fonctions partagées ----------
  // Séances prises en compte dans la charge : coach, courses, autres activités (effort 5/10 par défaut)
  function sessionsForLoad() {
    const s = sp();
    const out = s.history.filter(h => h.minutes && !h.run).map(h => ({ date: h.date, minutes: h.minutes, rpe: h.rpe ?? ({ '-1': 9, 0: 7, 1: 5 }[h.feedback] ?? 6) }));
    s.runs.forEach(r => out.push({ date: r.date, minutes: r.min, rpe: r.rpe ?? 5 }));
    for (const [date, list] of Object.entries(state.activities || {})) {
      // Les minutes Apple incluent les courses importées depuis l'iPhone : on ne les compte qu'une fois
      const appleRuns = s.runs.filter(r => r.date === date && r.src === 'apple').reduce((a, r) => a + r.min, 0);
      for (const a of list) {
        const minutes = a.id === 'apple' ? Math.max(0, a.minutes - appleRuns) : a.minutes;
        if (!a.src && minutes > 0) out.push({ date, minutes, rpe: 5 });
      }
    }
    return out;
  }
  function readinessNow() {
    const s = sp();
    return P.readiness({ sessions: sessionsForLoad(), lifts: s.lifts, runs: s.runs, fatigueLog: s.fatigueLog, today: todayStr() });
  }
  // L'exercice se fait-il avec une charge (haltères / kettlebell disponibles) ?
  function loadKind(id, equipment) {
    const e = D.BY_ID[id];
    if (!e || !e.eq) return null;
    const eq = new Set(equipment || []);
    const opts = e.eq.split('|');
    if (opts.includes('halteres') && eq.has('halteres')) return 'halteres';
    if (opts.includes('kettlebell') && eq.has('kettlebell')) return 'kettlebell';
    return null;
  }
  function suggestFor(id, equipment, opts) {
    const kind = loadKind(id, equipment);
    return P.suggestLift(sp().lifts[id], { id, loaded: !!kind, kind: kind || 'halteres', canUse: e => C.isEligible(opts || { equipment }, e.id) });
  }
  const LEVELS = {
    green: { icon: '🟢', title: 'Prête à progresser', cls: 'rd-green' },
    yellow: { icon: '🟡', title: 'Maintiens le niveau', cls: 'rd-yellow' },
    red: { icon: '🔴', title: 'Récupération conseillée', cls: 'rd-red' },
  };
  window.SportProgress = { sessionsForLoad, readinessNow, loadKind, suggestFor, LEVELS };

  // ---------- Petits graphiques ----------
  function lineChart(pts, { invert = false, unit = '', label = v => fmt(v) } = {}) {
    if (pts.length < 2) return '<p class="muted hint">Le graphique apparaîtra après deux séances.</p>';
    const W = 360, H = 150, pad = { l: 40, r: 10, t: 14, b: 22 };
    const vals = pts.map(p => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    const m = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1; min -= m; max += m;
    const t0 = new Date(pts[0].d).getTime(), t1 = new Date(pts.at(-1).d).getTime();
    const x = d => pad.l + (new Date(d).getTime() - t0) / (t1 - t0 || 1) * (W - pad.l - pad.r);
    const y = v => { const r = (v - min) / (max - min); return pad.t + (invert ? r : 1 - r) * (H - pad.t - pad.b); };
    return `<svg viewBox="0 0 ${W} ${H}" class="pr-chart">
      ${[0, 0.5, 1].map(f => { const v = min + (max - min) * f; return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${pad.l - 4}" y="${y(v) + 4}" text-anchor="end">${label(v)}</text>`; }).join('')}
      <polyline points="${pts.map(p => `${x(p.d)},${y(p.v)}`).join(' ')}" fill="none" stroke="var(--sport2)" stroke-width="2.5" stroke-linejoin="round"/>
      ${pts.map(p => `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="3.5" fill="var(--sport2)"><title>${shortDate(p.d)} : ${label(p.v)}${unit}</title></circle>`).join('')}
      <text x="${pad.l}" y="${H - 6}">${shortDate(pts[0].d)}</text><text x="${W - pad.r}" y="${H - 6}" text-anchor="end">${shortDate(pts.at(-1).d)}</text>
    </svg>`;
  }
  function weeksChart(weeks, chronic) {
    const W = 360, H = 130, pad = { l: 6, r: 6, t: 16, b: 20 };
    const max = Math.max(...weeks.map(w => w.load), chronic, 1) * 1.15;
    const bw = (W - pad.l - pad.r) / weeks.length;
    const y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    return `<svg viewBox="0 0 ${W} ${H}" class="pr-chart">
      ${weeks.map((w, i) => `<rect x="${pad.l + i * bw + bw * 0.18}" y="${y(w.load)}" width="${bw * 0.64}" height="${y(0) - y(w.load)}" rx="5" fill="var(--sport)" opacity="${i === weeks.length - 1 ? 1 : 0.55}"><title>${Math.round(w.load)}</title></rect>
        <text x="${pad.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${i === weeks.length - 1 ? 'cette sem.' : shortDate(w.start)}</text>`).join('')}
      ${chronic > 0 ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(chronic)}" y2="${y(chronic)}" stroke="var(--primary)" stroke-dasharray="5 4" stroke-width="2"/>` : ''}
    </svg>`;
  }

  // ---------- Rendu de l'onglet ----------
  const ACTION = { up: '⬆️', variant: '⬆️', longer: '⬆️', hold: '➡️', down: '⬇️', easier: '⬇️', deload: '🔄', new: '🆕' };

  function renderProgress() {
    if (!$('#prReady')) return;
    const s = sp();
    const r = readinessNow();
    const L = LEVELS[r.level];
    const ld = r.load;
    $('#prReady').innerHTML = `
      <div class="rd ${L.cls}"><span class="rd-icon">${L.icon}</span><div><strong>${L.title}</strong>
        <small>${r.adj > 0 ? 'Le coach augmente un peu la difficulté.' : r.adj < 0 ? 'Le coach allège automatiquement tes séances.' : 'Le coach garde la difficulté actuelle.'}</small></div></div>
      <ul class="rd-reasons">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="pr-metrics">
        <div><strong>${Math.round(ld.acute)}</strong><small>charge 7 jours</small></div>
        <div><strong>${Math.round(ld.chronic)}</strong><small>moyenne / semaine</small></div>
        <div><strong>${ld.acwr == null ? '—' : fmt(ld.acwr, 2)}</strong><small>ratio (idéal 0,8-1,3)</small></div>
      </div>
      ${weeksChart(ld.weeks, ld.chronic)}
      <p class="muted hint">Charge = durée × effort ressenti (sur 10). Pointillés verts : ta moyenne des 4 dernières semaines. Une semaine bien au-dessus (ratio > 1,5) augmente le risque de blessure et de surentraînement.</p>`;

    // Exercices suivis
    const ids = Object.keys(s.lifts).filter(id => s.lifts[id].length).sort((a, b) => s.lifts[b].at(-1).date.localeCompare(s.lifts[a].at(-1).date));
    $('#prLifts').innerHTML = ids.length ? ids.map(id => {
      const e = D.BY_ID[id];
      const list = [...s.lifts[id]].sort((a, b) => a.date.localeCompare(b.date));
      const last = list.at(-1);
      const sug = suggestFor(id, s.equipment || []);
      const loaded = list.some(x => P.mainKg(x) > 0);
      const timed = list.some(x => x.time);
      const perf = timed ? last.sets.map(x => `${x.secs} s`).join(' · ') : last.sets.map(x => `${x.reps}${x.kg ? `×${fmt(x.kg)} kg` : ''}`).join(' · ');
      const pts = list.map(x => ({ d: x.date, v: timed ? Math.max(...x.sets.map(y => y.secs || 0)) : loaded ? P.bestE1rm(x) : P.totalReps(x) }));
      return `<details class="marker pr-lift">
        <summary><span class="mk-name">${esc(e?.name || id)}<small>${shortDate(last.date)} · ${esc(perf)}</small></span>
          <span class="pr-sug">${ACTION[sug.action] || ''} ${esc(sug.text)}</span></summary>
        <div class="mk-body">
          ${sug.reason ? `<p class="hint muted">Pourquoi : ${esc(sug.reason)}</p>` : ''}
          ${lineChart(pts, { label: v => fmt(v, timed || !loaded ? 0 : 1) })}
          <p class="hint muted">${timed ? 'Durée tenue (s).' : loaded ? 'Force estimée (charge max théorique sur 1 répétition, formule d\'Epley).' : 'Total de répétitions sur la séance.'}</p>
          <table class="mk-table"><tr><th>Date</th><th>Séries</th><th>Effort</th></tr>
            ${[...list].reverse().slice(0, 8).map(x => `<tr><td>${shortDate(x.date)}</td><td>${esc(timed ? x.sets.map(y => `${y.secs} s`).join(', ') : x.sets.map(y => `${y.reps}${y.kg ? `×${fmt(y.kg)}` : ''}`).join(', '))}</td><td>${x.rpe ?? '—'}/10</td></tr>`).join('')}
          </table>
        </div></details>`;
    }).join('') : '<p class="muted hint">Les exercices de renforcement apparaîtront ici après une séance du coach (les charges et répétitions se notent pendant la séance), ou en les ajoutant ci-dessous.</p>';
    renderLiftOptions();

    // Course à pied
    const rs = P.suggestRun(s.runs, todayStr(), r.level);
    const pct = rs.targetWeekKm ? Math.min(100, (rs.thisWeekKm || 0) / rs.targetWeekKm * 100) : 0;
    $('#prRunSug').innerHTML = `<div class="tip"><strong>Prochaine sortie :</strong> ${esc(rs.next.text)}</div>
      ${rs.empty ? '' : `<div class="pr-metrics">
        <div><strong>${P.fmtPace(rs.easyPace)}</strong><small>allure facile</small></div>
        <div><strong>${fmt(rs.thisWeekKm)} / ${fmt(rs.targetWeekKm)} km</strong><small>semaine / objectif</small></div>
        <div><strong>${{ faster: '↗ en progrès', slower: '↘ en baisse', stable: '→ stable' }[rs.trend]}</strong><small>tendance</small></div>
      </div>
      <div class="bar pr-week"><span style="width:${pct}%;background:var(--sport)"></span></div>`}
      ${rs.reasons.length ? `<ul class="rd-reasons">${rs.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
    const runs = [...s.runs].sort((a, b) => a.date.localeCompare(b.date));
    $('#prRunChart').innerHTML = runs.length >= 2
      ? lineChart(runs.map(x => ({ d: x.date, v: P.pace(x.km, x.min) })), { invert: true, label: v => P.fmtPace(v).replace('/km', '') }) + '<p class="hint muted">Allure (min/km) : plus haut = plus rapide.</p>'
      : '';
    const TYPES = { easy: 'Footing', interval: 'Fractionné', long: 'Sortie longue' };
    $('#prRunList').innerHTML = [...runs].reverse().slice(0, 10).map(x => `<div class="item"><div>${TYPES[x.type] || 'Course'} · ${fmt(x.km)} km en ${Math.round(x.min)} min<br>
      <small>${shortDate(x.date)} · ${P.fmtPace(P.pace(x.km, x.min))} · effort ${x.rpe ?? '—'}/10</small></div>
      <button class="icon" data-del-run="${x.id}" title="Supprimer">✕</button></div>`).join('');
  }
  window.renderProgress = renderProgress;

  // ---------- Formulaires ----------
  function renderLiftOptions() {
    const sel = $('#prLiftEx');
    if (sel.options.length > 1) return;
    const strength = D.EXERCISES.filter(e => !['warm', 'stretch', 'cardio'].includes(e.pattern));
    sel.innerHTML = '<option value="">Exercice…</option>' + strength.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  }
  $('#prLiftForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    const id = f.ex.value; if (!id) return;
    const ex = D.BY_ID[id];
    const sets = Math.max(1, Number(f.sets.value) || 1);
    const reps = Number(f.reps.value) || 0, kg = Number(f.kg.value) || 0;
    const entry = { date: f.date.value || todayStr(), target: ex.time ? String(reps) : (f.target.value || '10-12'), rpe: Number(f.rpe.value) || 7,
      sets: [...Array(sets)].map(() => (ex.time ? { secs: reps } : { kg, reps })), ...(ex.time ? { time: true } : {}) };
    (sp().lifts[id] ||= []).push(entry);
    save(); e.target.reset(); f.date.value = todayStr(); renderProgress();
  });
  $('#prLiftEx').addEventListener('change', e => {
    const ex = D.BY_ID[e.target.value];
    $('#prLiftRepsLbl').firstChild.textContent = ex?.time ? 'Durée (s) ' : 'Répétitions ';
  });

  // Durée : « 32 », « 32:30 » ou « 1:05:00 »
  function parseDuration(v) {
    const p = String(v).trim().split(':').map(Number);
    if (p.some(isNaN)) return 0;
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    if (p.length === 2) return p[0] + p[1] / 60;
    return p[0];
  }
  $('#prRunForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    const km = Number(String(f.km.value).replace(',', '.')), min = parseDuration(f.min.value);
    if (!(km > 0) || !(min > 0)) { alert('Indiquez la distance et la durée.'); return; }
    logRun({ date: f.date.value || todayStr(), km, min, rpe: Number(f.rpe.value) || 5, type: f.type.value });
    e.target.reset(); f.date.value = todayStr();
  });
  // opts.activity === false : course déjà comptée ailleurs (import Apple Santé)
  function logRun(run, opts = {}) {
    const s = sp();
    run.id = uid();
    s.runs.push(run);
    if (opts.activity !== false) (state.activities[run.date] ||= []).push({ id: run.id, src: 'run', name: `🏃 Course ${String(run.km).replace('.', ',')} km`, minutes: Math.round(run.min), kcal: Math.round(run.km * (latestWeight() || 65) * 1.0) });
    save(); renderAll();
  }
  window.SportProgress.logRun = logRun;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-del-run]');
    if (!b || !confirm('Supprimer cette sortie ?')) return;
    const s = sp();
    s.runs = s.runs.filter(r => r.id !== b.dataset.delRun);
    const day = Object.keys(state.activities).find(d => state.activities[d].some(a => a.id === b.dataset.delRun));
    if (day) state.activities[day] = state.activities[day].filter(a => a.id !== b.dataset.delRun);
    save(); renderAll();
  });

  $('#prRunForm').elements.date.value = todayStr();
  $('#prLiftForm').elements.date.value = todayStr();
  renderProgress();
})();
