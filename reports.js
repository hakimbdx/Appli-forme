// Bilans hebdomadaires : génération automatique (dimanche soir), affichage, partage et défi en cours.
// S'appuie sur weekly.js (Weekly), progression.js, progress-ui.js (SportProgress), bloodparser.js et app.js.
(() => {
  const W = window.Weekly;
  const reports = () => (state.reports ||= []);
  let viewing = null; // rapport affiché

  // ---------- Données de la semaine ----------
  function labsInfo(ws, we) {
    const BP = window.BloodParser;
    const labs = [...(state.labs || [])].sort((a, b) => a.date.localeCompare(b.date));
    const inWeek = labs.filter(l => l.date >= ws && l.date <= we);
    const improved = [];
    for (const lab of inWeek) {
      for (const r of lab.results) {
        const prev = labs.filter(l => l.date < lab.date).flatMap(l => l.results.filter(x => x.key === r.key)).at(-1);
        if (prev && ['low', 'high'].includes(BP.status(prev)) && BP.status(r) === 'normal') improved.push(BP.BY_KEY[r.key]?.name || r.key);
      }
    }
    return { count: inWeek.length, improved };
  }

  function gather(ws) {
    const from = W.addDays(ws, -7), we = W.addDays(ws, 6);
    const days = [];
    for (let i = 0; i < 14; i++) {
      const date = W.addDays(from, i);
      const t = dayTotals(date);
      const meals = {};
      (state.meals[date] || []).forEach(m => { meals[m.type] = (meals[m.type] || 0) + m.kcal; });
      days.push({ date, kcal: t.kcal, protein: t.protein, burned: t.burned, meals, water: state.water[date] || 0 });
    }
    const sp = state.sport || {};
    // Séances : coach (hors courses, comptées à part) + activités saisies à la main
    const sessions = (sp.history || []).filter(h => !h.run).map(h => ({ date: h.date, minutes: h.minutes, kcal: h.kcal, title: h.title }));
    for (const [date, list] of Object.entries(state.activities || {})) {
      for (const a of list) if (!a.src && a.id !== 'apple' && a.minutes > 0) sessions.push({ date, minutes: a.minutes, kcal: a.kcal, title: a.name });
    }
    const today = todayStr();
    const readiness = window.Progression && window.SportProgress
      ? Progression.readiness({ sessions: SportProgress.sessionsForLoad(), lifts: sp.lifts, runs: sp.runs, fatigueLog: sp.fatigueLog, today: we < today ? we : today })
      : null;
    const names = Object.fromEntries((window.SportData?.EXERCISES || []).map(e => [e.id, e.name]));
    const labs = labsInfo(ws, we);
    const prevReport = reports().find(r => r.week === W.addDays(ws, -7));
    const tg = targets();
    return {
      days, target: tg ? { kcal: tg.kcal, protein: tg.protein } : null, waterGoal: state.profile?.waterGoal || 8,
      profile: state.profile, sex: state.profile?.sex || null, weights: state.weights, sessions,
      lifts: sp.lifts || {}, runs: sp.runs || [], steps: (state.syncLog || []).map(x => ({ date: x.date, pas: x.pas })),
      readiness, labsInWeek: labs.count, labsImproved: labs.improved, names,
      previousChallenge: prevReport?.report?.challenge || null,
    };
  }

  // Y a-t-il de quoi faire un bilan (au moins une donnée jusqu'à la fin de la semaine) ?
  function hasData(we) {
    const any = obj => Object.entries(obj || {}).some(([d, v]) => d <= we && (Array.isArray(v) ? v.length : v));
    return !!state.profile && (any(state.meals) || any(state.activities) || (state.weights || []).some(w => w.date <= we) || (state.sport?.history || []).some(h => h.date <= we));
  }

  // ---------- Génération automatique ----------
  function checkWeekly() {
    const ws = W.dueWeek(new Date());
    if (reports().some(r => r.week === ws) || !hasData(W.addDays(ws, 6))) return updateBadge();
    const report = W.build(gather(ws), ws);
    state.reports = [{ week: ws, createdAt: new Date().toISOString(), read: false, report }, ...reports()].slice(0, 52);
    save();
    renderReports();
  }
  function updateBadge() {
    const n = reports().filter(r => !r.read).length;
    try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch { /* non pris en charge */ }
  }

  // ---------- Affichage d'un bilan ----------
  const MOOD = { great: 'rp-great', good: 'rp-good', tough: 'rp-tough' };
  function reportHtml(r, preview) {
    const pc = r.previousChallenge;
    return `<div class="rp-head ${MOOD[r.mood]}">
        <small>${preview ? 'Aperçu (semaine en cours)' : 'Bilan de la semaine'}</small>
        <h2>${esc(r.label.replace(/^du /, 'Du '))}</h2>
        <p>${esc(r.opening)}</p>
      </div>
      <div class="card">
        <p class="rp-summary">${esc(r.summary)}</p>
        <h3>🏆 Tes victoires</h3>
        <ul class="rp-wins">${r.victories.map(v => `<li><span>${v.icon}</span><span>${esc(v.text)}</span></li>`).join('')}</ul>
        ${pc && !pc.done && pc.value != null ? `<p class="rp-prev">Défi de la semaine dernière (${esc(pc.label)}) : ${esc(W.challengeNote(pc))}</p>` : ''}
      </div>
      <div class="card rp-focus">
        <h3>🎯 Ton axe de la semaine</h3>
        <p class="rp-focus-title">${esc(r.focus.title)}</p>
        <p>${esc(r.focus.why)}</p>
        <p class="tip">💡 ${esc(r.focus.tip)}</p>
        <div class="rp-challenge"><small>Défi de la semaine</small><strong>${esc(r.challenge.label.charAt(0).toUpperCase() + r.challenge.label.slice(1))}</strong></div>
      </div>
      <div class="card">
        <h3>📊 En chiffres</h3>
        <table class="mk-table rp-kpis"><tr><th></th><th>Cette semaine</th><th>Semaine d'avant</th></tr>
          ${r.kpis.map(([k, a, b]) => `<tr><td>${esc(k)}</td><td><strong>${esc(a)}</strong></td><td>${esc(b)}</td></tr>`).join('')}
        </table>
      </div>
      <p class="rp-closing">${esc(r.closing)}</p>`;
  }
  function openReport(entry, preview = false) {
    viewing = entry.report;
    $('#reportView').innerHTML = reportHtml(entry.report, preview);
    if (!preview && !entry.read) { entry.read = true; save(); }
    showTab('reports');
    window.scrollTo(0, 0);
    renderReports();
  }

  // ---------- Tableau de bord : bannière, défi en cours, liste ----------
  window.renderReports = function renderReports() {
    if (!$('#reportList')) return;
    const list = reports();
    const unread = list.find(r => !r.read);
    $('#reportBanner').classList.toggle('hidden', !unread);
    $('#reportBanner').innerHTML = unread
      ? `<span class="rb-icon">📬</span><div><strong>Ton bilan de la semaine est prêt !</strong><small>Semaine ${esc(unread.report.label)}</small></div><button type="button" class="primary" data-report="${unread.week}">Lire</button>`
      : '';
    // Défi de la semaine en cours, avec la progression en direct
    const ch = list[0]?.report?.challenge;
    const curWs = W.weekStartOf(todayStr());
    if (ch && list[0].week === W.addDays(curWs, -7)) {
      const st = W.stats(gather(curWs), curWs);
      const ev = W.evalChallenge(ch, st);
      const pct = Math.min(100, Math.round((ev?.value || 0) / ch.target * 100));
      $('#challengeCard').classList.remove('hidden');
      $('#challengeCard').innerHTML = `<div class="ch-top"><span>Progression</span><strong>${ev?.done ? '✅ Réussi !' : `${ch.type === 'steps_avg' ? Math.round(ev?.value || 0).toLocaleString('fr-FR') : ev?.value ?? 0} / ${ch.type === 'steps_avg' ? ch.target.toLocaleString('fr-FR') : ch.target}`}</strong></div>
        <p>${esc(ch.label.charAt(0).toUpperCase() + ch.label.slice(1))}</p>
        <div class="bar"><span style="width:${pct}%;background:${ev?.done ? 'var(--primary)' : 'var(--sport)'}"></span></div>`;
    } else $('#challengeCard').classList.add('hidden');
    $('#reportList').innerHTML = list.length
      ? list.slice(0, 6).map(r => `<button type="button" class="report-item" data-report="${r.week}">
          <span>${{ great: '🌟', good: '💪', tough: '🌱' }[r.report.mood]}</span>
          <span>Semaine ${esc(r.report.label)}<small>${esc(r.report.focus.title)}</small></span>
          ${r.read ? '' : '<em>Nouveau</em>'}</button>`).join('')
      : '<p class="muted hint">Ton premier bilan arrivera dimanche soir.</p>';
    updateBadge();
  };

  // ---------- Événements ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-report]');
    if (!b) return;
    const entry = reports().find(r => r.week === b.dataset.report);
    if (entry) openReport(entry);
  });
  $('#reportPreview').addEventListener('click', () => {
    const ws = W.weekStartOf(todayStr());
    openReport({ week: ws, read: true, report: W.build(gather(ws), ws) }, true);
  });
  async function shareText() { return W.toText(viewing); }
  $('#reportShare').addEventListener('click', async () => {
    if (!viewing) return;
    const text = await shareText();
    try {
      if (navigator.share) await navigator.share({ title: viewing.title, text });
      else { await navigator.clipboard.writeText(text); $('#reportShare').textContent = '✅ Copié'; }
    } catch { /* partage annulé */ }
  });
  $('#reportCopy').addEventListener('click', async () => {
    if (!viewing) return;
    try { await navigator.clipboard.writeText(await shareText()); $('#reportCopy').textContent = '✅ Copié'; }
    catch { $('#reportCopy').textContent = 'Copie impossible'; }
    setTimeout(() => { $('#reportCopy').textContent = '📋 Copier le texte'; }, 2000);
  });
  // Vérifie à l'ouverture et à chaque retour dans l'appli (l'appli peut rester ouverte en arrière-plan)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkWeekly(); });

  renderReports();
  checkWeekly();
})();
