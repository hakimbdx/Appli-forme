// Tableau de bord modulaire : ordre et visibilité des widgets (glisser-déposer au doigt ou à la souris),
// préréglages selon les priorités du moment, widgets Entraînement et Sommeil.
(() => {
  const WIDGETS = {
    defi: { title: '🎯 Défi de la semaine' },
    nutrition: { title: '🍽️ Nutrition' },
    hydratation: { title: '💧 Hydratation' },
    poids: { title: '⚖️ Poids' },
    entrainement: { title: '💪 Entraînement' },
    sommeil: { title: '😴 Sommeil' },
    semaine: { title: '📈 Mes 7 derniers jours' },
    bilans: { title: '📊 Mes bilans hebdomadaires' },
  };
  const DEFAULT = ['defi', 'nutrition', 'hydratation', 'poids', 'entrainement', 'sommeil', 'semaine', 'bilans'];
  const PRESETS = {
    weight: { label: '⚖️ Perte de poids', order: ['nutrition', 'poids', 'hydratation', 'defi', 'semaine', 'entrainement', 'sommeil', 'bilans'] },
    sport: { label: '💪 Sport', order: ['entrainement', 'sommeil', 'hydratation', 'nutrition', 'defi', 'poids', 'semaine', 'bilans'] },
    recovery: { label: '😴 Récupération', order: ['sommeil', 'hydratation', 'entrainement', 'nutrition', 'poids', 'defi', 'semaine', 'bilans'] },
    default: { label: '↺ Par défaut', order: DEFAULT },
  };
  const box = $('#widgets');
  const widgets = () => [...box.querySelectorAll('.widget')];
  const byKey = k => box.querySelector(`.widget[data-w="${k}"]`);
  const cfg = () => {
    state.dashboard ||= {};
    const c = state.dashboard;
    if (!Array.isArray(c.order)) c.order = [...DEFAULT];
    if (!Array.isArray(c.hidden)) c.hidden = [];
    // Widgets ajoutés dans une nouvelle version : placés selon l'ordre par défaut
    for (const k of DEFAULT) if (!c.order.includes(k)) c.order.splice(Math.min(DEFAULT.indexOf(k), c.order.length), 0, k);
    c.order = c.order.filter(k => WIDGETS[k]);
    return c;
  };

  // ---------- En-têtes et outils ----------
  for (const w of widgets()) {
    const k = w.dataset.w;
    const head = document.createElement('div');
    head.className = 'w-head';
    head.innerHTML = `<h3>${WIDGETS[k].title}</h3>
      <div class="w-tools">
        <button type="button" class="w-btn" data-move="-1" aria-label="Monter ${WIDGETS[k].title}">↑</button>
        <button type="button" class="w-btn" data-move="1" aria-label="Descendre ${WIDGETS[k].title}">↓</button>
        <button type="button" class="w-btn w-eye" data-eye aria-label="Masquer ou afficher ${WIDGETS[k].title}">👁</button>
        <span class="w-handle" aria-hidden="true">⠿</span>
      </div>`;
    w.prepend(head);
  }

  // ---------- Ordre, visibilité, largeur ----------
  function layout() {
    const c = cfg();
    c.order.forEach(k => { const w = byKey(k); if (w) box.appendChild(w); });
    const editing = document.body.classList.contains('dash-edit');
    widgets().forEach(w => w.classList.toggle('w-off', c.hidden.includes(w.dataset.w)));
    // Deux petits widgets consécutifs se partagent une ligne ; un petit widget isolé prend toute la largeur
    const visible = widgets().filter(w => (editing || !w.classList.contains('w-off')) && getComputedStyle(w).display !== 'none');
    widgets().forEach(w => w.classList.remove('w-solo'));
    for (let i = 0; i < visible.length; i++) {
      const w = visible[i];
      if (w.dataset.size !== 'half') continue;
      if (visible[i + 1]?.dataset.size === 'half') { i++; continue; }
      w.classList.add('w-solo');
    }
  }
  function saveOrder() {
    cfg().order = widgets().map(w => w.dataset.w);
    save(); layout();
  }

  // ---------- Mode personnalisation ----------
  function setEdit(on) {
    document.body.classList.toggle('dash-edit', on);
    $('#dashBar').classList.toggle('hidden', !on);
    $('#dashEdit').classList.toggle('hidden', on);
    layout();
  }
  $('#dashEdit').addEventListener('click', () => setEdit(true));
  for (const id of ['#dashDone', '#dashDoneFloat']) $(id).addEventListener('click', () => { setEdit(false); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  // En quittant le tableau de bord, on sort du mode personnalisation
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { if (b.dataset.tab !== 'dashboard') setEdit(false); }));
  $('#dashPresets').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button type="button" data-preset="${k}">${p.label}</button>`).join('');
  $('#dashPresets').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const c = cfg();
    c.order = [...PRESETS[b.dataset.preset].order];
    if (b.dataset.preset === 'default') c.hidden = [];
    save(); layout();
    b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 600);
  });
  box.addEventListener('click', e => {
    const w = e.target.closest('.widget');
    if (!w) return;
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const list = widgets(), i = list.indexOf(w), j = i + Number(mv.dataset.move);
      if (j < 0 || j >= list.length) return;
      if (j > i) list[j].after(w); else list[j].before(w);
      saveOrder();
      w.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    if (e.target.closest('[data-eye]')) {
      const c = cfg(), k = w.dataset.w;
      c.hidden = c.hidden.includes(k) ? c.hidden.filter(x => x !== k) : [...c.hidden, k];
      save(); layout();
    }
  });

  // ---------- Glisser-déposer (événements pointeur : doigt et souris) ----------
  let drag = null;
  box.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.w-handle');
    if (!handle || !document.body.classList.contains('dash-edit')) return;
    const w = handle.closest('.widget');
    e.preventDefault();
    const r = w.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.className = 'widget w-ph';
    ph.dataset.size = w.dataset.size || '';
    if (w.classList.contains('w-solo')) ph.classList.add('w-solo');
    ph.style.height = r.height + 'px';
    w.before(ph);
    Object.assign(w.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', zIndex: 40 });
    w.classList.add('w-drag');
    drag = { w, ph, dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY, raf: 0 };
    handle.setPointerCapture(e.pointerId);
    autoScroll();
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.w.style.left = e.clientX - drag.dx + 'px';
    drag.w.style.top = e.clientY - drag.dy + 'px';
    placeholder();
  });
  const endDrag = () => {
    if (!drag) return;
    cancelAnimationFrame(drag.raf);
    const { w, ph } = drag;
    ph.replaceWith(w);
    w.removeAttribute('style');
    w.classList.remove('w-drag');
    drag = null;
    saveOrder();
  };
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);
  // Place l'emplacement vide à côté du widget le plus proche du doigt
  function placeholder() {
    let best = null, bestD = Infinity;
    for (const o of widgets()) {
      if (o === drag.w || o.classList.contains('w-ph')) continue;
      const r = o.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot((drag.x - cx) * 0.6, drag.y - cy);
      if (d < bestD) { bestD = d; best = { o, r, cx, cy }; }
    }
    if (!best) return;
    const after = drag.y > best.cy + best.r.height * 0.1 || (Math.abs(drag.y - best.cy) <= best.r.height * 0.1 && drag.x > best.cx);
    if (after) { if (best.o.nextElementSibling !== drag.ph) best.o.after(drag.ph); }
    else if (best.o.previousElementSibling !== drag.ph) best.o.before(drag.ph);
  }
  // Défilement automatique près des bords de l'écran
  function autoScroll() {
    if (!drag) return;
    const edge = 90, h = window.innerHeight;
    const v = drag.y < edge ? -(edge - drag.y) / 6 : drag.y > h - edge - 60 ? (drag.y - (h - edge - 60)) / 6 : 0;
    if (v) { window.scrollBy(0, v); placeholder(); }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  // ---------- Widget Entraînement ----------
  function renderTraining() {
    const el = $('#wTraining');
    if (!el) return;
    const date = currentDate, today = todayStr();
    const list = state.activities[date] || [];
    const minutes = list.reduce((a, x) => a + (x.minutes || 0), 0);
    const kcal = list.reduce((a, x) => a + (x.kcal || 0), 0);
    const sp = state.sport || {};
    const ws = Weekly.weekStartOf(today);
    const weekCount = (sp.history || []).filter(h => h.date >= ws).length + (sp.runs || []).filter(r => r.date >= ws && r.src === 'apple').length;
    const rd = date === today && window.SportProgress ? SportProgress.readinessNow() : null;
    const L = rd && SportProgress.LEVELS[rd.level];
    el.innerHTML = `
      ${L ? `<div class="tr-ready ${L.cls}"><span>${L.icon}</span><div><strong>${L.title}</strong><small>${esc(rd.reasons[0] || '')}</small></div></div>` : ''}
      <div class="tr-stats">
        <div><strong>${list.length}</strong><small>activité${list.length > 1 ? 's' : ''}</small></div>
        <div><strong>${Math.round(minutes)}</strong><small>minutes</small></div>
        <div><strong>${Math.round(kcal)}</strong><small>kcal brûlées</small></div>
        <div><strong>${weekCount}</strong><small>séance${weekCount > 1 ? 's' : ''} cette sem.</small></div>
      </div>
      ${list.length ? `<ul class="tr-list">${list.slice(0, 4).map(a => `<li><span>${esc(a.name)}</span><small>${a.minutes || 0} min · ${a.kcal || 0} kcal</small></li>`).join('')}</ul>` : ''}
      ${date === today ? `<button type="button" class="primary tr-go" data-goto-tab="activity">🏋️ ${list.some(a => a.src === 'coach') ? 'Nouvelle séance' : 'Séance du jour avec le coach'}</button>` : ''}`;
  }

  // ---------- Widget Sommeil ----------
  const QUAL = ['😫', '😕', '🙂', '😊', '🤩'];
  const fmtH = h => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  function sleepDays() {
    const out = [];
    for (let i = 6; i >= 0; i--) { const d = shiftDate(currentDate, -i); out.push({ d, s: state.sleep?.[d] }); }
    return out;
  }
  function renderSleep() {
    const el = $('#wSleep');
    if (!el) return;
    state.sleep ||= {};
    const e = state.sleep[currentDate];
    const days = sleepDays();
    const known = days.filter(x => x.s?.h);
    const avg = known.length ? known.reduce((a, x) => a + x.s.h, 0) / known.length : null;
    const W = 300, H = 70, bw = W / 7;
    const y = h => H - 14 - Math.min(h, 11) / 11 * (H - 20);
    el.innerHTML = `
      <div class="sl-main">
        <button type="button" class="sl-btn" data-sl="-0.25" aria-label="Moins 15 minutes">−</button>
        <div class="sl-val"><strong>${e?.h ? fmtH(e.h) : '—'}</strong><small>${e?.h ? `nuit précédant le ${esc(fmtDate(currentDate))}${e.src === 'apple' ? ' · iPhone' : ''}` : 'Combien d\'heures as-tu dormi ?'}</small></div>
        <button type="button" class="sl-btn" data-sl="0.25" aria-label="Plus 15 minutes">+</button>
      </div>
      <div class="sl-q" role="group" aria-label="Qualité du sommeil">${QUAL.map((q, i) => `<button type="button" data-q="${i + 1}" class="${e?.q === i + 1 ? 'on' : ''}" aria-label="Qualité ${i + 1} sur 5">${q}</button>`).join('')}</div>
      <svg viewBox="0 0 ${W} ${H}" class="sl-chart" aria-hidden="true">
        <line x1="0" x2="${W}" y1="${y(7)}" y2="${y(7)}" stroke="var(--primary)" stroke-dasharray="4 3" opacity=".6"/>
        ${days.map((x, i) => x.s?.h ? `<rect x="${i * bw + bw * 0.2}" y="${y(x.s.h)}" width="${bw * 0.6}" height="${H - 14 - y(x.s.h)}" rx="4" fill="${x.s.h >= 7 ? '#7b5cff' : '#b9a8ff'}" opacity="${x.d === currentDate ? 1 : 0.7}"/>` : '').join('')}
        ${days.map((x, i) => `<text x="${i * bw + bw / 2}" y="${H - 2}" text-anchor="middle">${['di', 'lu', 'ma', 'me', 'je', 've', 'sa'][new Date(x.d + 'T12:00').getDay()]}</text>`).join('')}
      </svg>
      <p class="muted hint">${avg != null ? `Moyenne : ${fmtH(avg)} sur ${known.length} nuit${known.length > 1 ? 's' : ''}. Pointillés : 7 h.` : 'Note tes nuits pour suivre ton sommeil (ou importe-les avec ❤️ Synchro).'}
        ${avg != null && avg < 7 ? '<br>💡 Moins de 7 h en moyenne : le manque de sommeil augmente la faim et freine la récupération.' : ''}</p>`;
  }
  $('#wSleep').addEventListener('click', ev => {
    state.sleep ||= {};
    const cur = state.sleep[currentDate] || {};
    const b = ev.target.closest('[data-sl]'), q = ev.target.closest('[data-q]');
    if (b) {
      const h = Math.max(0, Math.min(16, (cur.h ?? 7.25) + Number(b.dataset.sl)));
      state.sleep[currentDate] = { ...cur, h, src: 'manual' };
    } else if (q) {
      state.sleep[currentDate] = { ...cur, h: cur.h ?? 7.5, q: Number(q.dataset.q) };
    } else return;
    save(); renderSleep();
  });

  window.renderWidgets = function renderWidgets() { renderTraining(); renderSleep(); layout(); };
  renderWidgets();
})();
