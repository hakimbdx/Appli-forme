// Rubrique « Synchro Forme » : import des données d'Apple Santé via le raccourci iOS.
// S'appuie sur healthsync.js (HealthSync), progress-ui.js (SportProgress) et app.js.
(() => {
  const H = window.HealthSync;
  const SHORTCUT_NAME = 'Synchro Forme';
  const syncLog = () => (state.syncLog ||= []);
  const fr = (v, d = 0) => Number(v.toFixed(d)).toLocaleString('fr-FR');
  const shortDate = d => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; };
  const status = t => { $('#syncStatus').textContent = t; };
  let pendingRunId = null;

  function importHealth(txt) {
    const d = H.parse(txt);
    if (!d) { status('Aucune donnée Forme trouvée. Lance d\'abord « 1. Récupérer ».'); return false; }
    const date = todayStr();
    // Activité de la journée (remplace l'import précédent du même jour)
    const list = (state.activities[date] || []).filter(a => a.id !== 'apple');
    if (d.kcal || d.min || d.pas) {
      list.unshift({ id: 'apple', name: `Apple Forme${d.pas ? ` · ${Math.round(d.pas).toLocaleString('fr-FR')} pas` : ''}`,
        minutes: Math.round(d.min || 0), kcal: Math.round(d.kcal || 0) });
    }
    state.activities[date] = list;
    if (d.poids && d.poids >= 20 && d.poids <= 400) {
      state.weights = state.weights.filter(w => w.date !== date);
      state.weights.push({ date, kg: round(d.poids, 1) });
    }
    // Course du jour → suivi des allures (sans la recompter dans les calories : elle est déjà dans l'énergie active)
    let newRun = null;
    if (d.run && window.SportProgress) {
      const runs = state.sport?.runs || [];
      const dup = runs.find(r => r.date === date && Math.abs(r.km - d.run.km) < 0.05);
      if (!dup) {
        newRun = { date, km: d.run.km, min: d.run.min, rpe: 5, type: 'easy', src: 'apple' };
        SportProgress.logRun(newRun, { activity: false });
        pendingRunId = newRun.id;
      }
    }
    if (d.sleep) {
      state.sleep ||= {};
      state.sleep[date] = { ...(state.sleep[date] || {}), h: d.sleep, src: 'apple' };
    }
    const entry = { sleep: d.sleep ?? null, date, at: new Date().toISOString(), kcal: d.kcal, min: d.min, pas: d.pas, poids: d.poids, km: d.run?.km ?? null, runMin: d.run?.min ?? null };
    state.syncLog = [...syncLog().filter(x => x.date !== date), entry].slice(-30);
    state.lastSync = entry.at;
    save();
    currentDate = date;
    renderAll();
    const parts = [];
    if (d.kcal != null) parts.push(`${Math.round(d.kcal)} kcal actives`);
    if (d.min != null) parts.push(`${Math.round(d.min)} min d'exercice`);
    if (d.pas != null) parts.push(`${Math.round(d.pas).toLocaleString('fr-FR')} pas`);
    if (d.poids) parts.push(`poids ${fr(d.poids, 1)} kg`);
    if (d.run) parts.push(`course ${fr(d.run.km, 1)} km`);
    if (d.sleep) parts.push(`sommeil ${Math.floor(d.sleep)} h ${String(Math.round((d.sleep % 1) * 60)).padStart(2, '0')}`);
    status(`✅ Importé pour aujourd'hui : ${parts.join(', ') || 'aucune donnée'}.`);
    renderRunAsk();
    return true;
  }

  // Après l'import d'une course : effort ressenti et type de sortie (pour la progression)
  function renderRunAsk() {
    const el = $('#syncRunAsk');
    const run = (state.sport?.runs || []).find(r => r.id === pendingRunId);
    if (!run) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const P = window.Progression;
    el.classList.remove('hidden');
    el.innerHTML = `<h3>🏃 Course importée</h3>
      <p>${fr(run.km, 1)} km en ${Math.round(run.min)} min · ${P.fmtPace(P.pace(run.km, run.min))}</p>
      <p class="muted hint">Type de sortie :</p>
      <div class="chips run-type">${[['easy', 'Footing'], ['interval', 'Fractionné'], ['long', 'Sortie longue']].map(([k, l]) => `<button type="button" data-run-type="${k}" class="${run.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <p class="muted hint">Effort ressenti :</p>
      <div class="chips">${[[3, '😌 Très facile'], [5, '🙂 Facile'], [7, '💪 Modéré'], [8, '😤 Dur'], [9, '🥵 Très dur']].map(([v, l]) => `<button type="button" data-run-rpe="${v}">${l}</button>`).join('')}</div>`;
  }
  $('#syncRunAsk').addEventListener('click', e => {
    const run = (state.sport?.runs || []).find(r => r.id === pendingRunId);
    if (!run) return;
    const t = e.target.closest('[data-run-type]'), r = e.target.closest('[data-run-rpe]');
    if (t) { run.type = t.dataset.runType; save(); renderRunAsk(); return; }
    if (r) {
      run.rpe = Number(r.dataset.runRpe);
      pendingRunId = null; save(); renderAll();
      status('✅ Course enregistrée : retrouve ton allure dans Sport › 📈 Progression.');
      renderRunAsk();
    }
  });

  // ---------- Affichage ----------
  function tile(icon, value, label) { return `<div><span>${icon}</span><strong>${value}</strong><small>${label}</small></div>`; }
  window.renderSync = function renderSync() {
    if (!$('#syncToday')) return;
    const today = todayStr();
    const e = syncLog().find(x => x.date === today);
    const synced = !!e;
    $('#syncDot').classList.toggle('hidden', synced);
    if (!$('#syncStatus').textContent || /^Dernière|^Pas encore/.test($('#syncStatus').textContent)) {
      status(state.lastSync ? `Dernière synchronisation : ${new Date(state.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Pas encore de synchronisation.');
    }
    $('#syncToday').innerHTML = e
      ? tile('🔥', e.kcal != null ? fr(e.kcal) : '—', 'kcal actives') + tile('⏱', e.min != null ? fr(e.min) : '—', 'min d\'exercice')
        + tile('👟', e.pas != null ? fr(e.pas) : '—', 'pas') + tile('⚖️', e.poids ? `${fr(e.poids, 1)} kg` : '—', 'pesée')
        + (e.km ? tile('🏃', `${fr(e.km, 1)} km`, `${Math.round(e.runMin)} min`) : '')
        + (e.sleep ? tile('😴', `${Math.floor(e.sleep)} h ${String(Math.round((e.sleep % 1) * 60)).padStart(2, '0')}`, 'sommeil') : '')
      : '<p class="muted hint">Rien d\'importé aujourd\'hui. Touche « 1. Récupérer » puis « 2. Importer ».</p>';
    const hist = [...syncLog()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
    $('#syncHistoryCard').classList.toggle('hidden', !hist.length);
    $('#syncHistory').innerHTML = hist.length ? `<table class="mk-table sync-table"><tr><th>Jour</th><th>kcal</th><th>Exercice</th><th>Pas</th><th>Poids</th><th>Course</th></tr>
      ${hist.map(x => `<tr><td>${shortDate(x.date)}</td><td>${x.kcal != null ? fr(x.kcal) : '—'}</td><td>${x.min != null ? fr(x.min) + ' min' : '—'}</td><td>${x.pas != null ? fr(x.pas) : '—'}</td><td>${x.poids ? fr(x.poids, 1) : '—'}</td><td>${x.km ? fr(x.km, 1) + ' km' : '—'}</td></tr>`).join('')}</table>` : '';
  };

  // ---------- Boutons ----------
  $('#syncHeaderBtn').addEventListener('click', () => { showTab('sync'); window.scrollTo(0, 0); });
  $('#syncRun').addEventListener('click', () => {
    status('Reviens ici après le raccourci, puis touche « 2. Importer ».');
    location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
  });
  $('#syncImport').addEventListener('click', async () => {
    try { importHealth(await navigator.clipboard.readText()); }
    catch { status('Impossible de lire le presse-papiers : utilise « Coller à la main » plus bas.'); $('#syncPaste').open = true; }
  });
  $('#syncPasteBtn').addEventListener('click', () => {
    if (importHealth($('#syncText').value)) { $('#syncText').value = ''; $('#syncPaste').open = false; }
  });

  renderSync();
})();
