// Analyses de sang : import de PDF, vérification, synthèse et graphiques d'évolution.
// S'appuie sur bloodparser.js (BloodParser) et sur l'état global de app.js.
(() => {
  const BP = window.BloodParser;
  let draft = null; // bilan en cours de vérification

  const STATUS = {
    low: { label: 'Bas', cls: 'st-low', arrow: '↓' },
    high: { label: 'Élevé', cls: 'st-high', arrow: '↑' },
    normal: { label: 'Normal', cls: 'st-ok', arrow: '' },
    unknown: { label: '—', cls: 'st-na', arrow: '' },
  };
  const sex = () => state.profile?.sex || null;
  const fmtV = v => (v == null || isNaN(v) ? '—' : Number(Number(v).toPrecision(3)).toLocaleString('fr-FR'));
  const fmtRef = r => r.refLow == null && r.refHigh == null ? ''
    : r.refLow == null ? `< ${fmtV(r.refHigh)}` : r.refHigh == null ? `> ${fmtV(r.refLow)}` : `${fmtV(r.refLow)} – ${fmtV(r.refHigh)}`;
  const shortDate = d => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y.slice(2)}`; };
  const longDate = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const badge = st => `<span class="badge ${STATUS[st].cls}">${STATUS[st].label}</span>`;
  const status = r => BP.status(r);

  // Historique par biomarqueur : { key: [{date, value, comparator, refLow, refHigh, labId}] } trié par date
  function history() {
    const h = {};
    for (const lab of state.labs || []) {
      for (const r of lab.results) (h[r.key] ||= []).push({ ...r, date: lab.date, labId: lab.id });
    }
    for (const k in h) h[k].sort((a, b) => a.date.localeCompare(b.date));
    return h;
  }

  // ---------- Lecture du PDF ----------
  async function readPdf(file) {
    const pdfjs = await import('./lib/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdfjs/pdf.worker.min.mjs', location.href).href;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    task.onPassword = (update, reason) => {
      const p = prompt(reason === 2
        ? 'Mot de passe incorrect. Réessayez :'
        : 'Ce PDF est protégé par un mot de passe (souvent indiqué par le laboratoire, par exemple votre date de naissance) :');
      if (p == null) task.destroy(); else update(p);
    };
    const doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items);
    doc.destroy();
    return BP.itemsToLines(pages);
  }

  async function importFile(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      $('#labStatus').textContent = 'Choisissez un fichier PDF.';
      return;
    }
    $('#labStatus').textContent = '⏳ Lecture du PDF…';
    try {
      const lines = await readPdf(file);
      const res = BP.parseLines(lines, { sex: sex() });
      draft = { date: res.date || todayStr(), lab: res.lab || '', source: file.name, results: res.results.map(r => ({ ...r, keep: true })),
        unmatched: res.unmatched, lines, dateFound: !!res.date };
      if (lines.length < 5) $('#labStatus').textContent = '⚠️ Ce PDF ne contient presque pas de texte : c\'est sans doute une image scannée. Saisissez les valeurs à la main ci-dessous.';
      else if (!res.results.length) $('#labStatus').textContent = 'Aucun biomarqueur reconnu dans ce PDF. Vous pouvez les saisir à la main ci-dessous.';
      else $('#labStatus').textContent = `✅ ${res.results.length} biomarqueur(s) trouvé(s). Vérifiez-les avant d'enregistrer.`;
      renderReview();
    } catch (e) {
      $('#labStatus').textContent = e?.name === 'PasswordException' || /password/i.test(e?.message || '')
        ? 'PDF protégé : mot de passe non fourni.'
        : 'Impossible de lire ce PDF. Vérifiez qu\'il s\'agit bien d\'un compte rendu d\'analyses.';
      console.error(e);
    }
  }

  // ---------- Vérification avant enregistrement ----------
  function renderReview() {
    const el = $('#labReview');
    if (!draft) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const present = new Set(draft.results.map(r => r.key));
    const options = BP.BIOMARKERS.filter(b => !present.has(b.key))
      .map(b => `<option value="${b.key}">${esc(b.name)} (${esc(b.unit)})</option>`).join('');
    el.innerHTML = `
      <h3>Vérifiez les valeurs ${draft.source ? 'extraites' : ''}</h3>
      <div class="form-grid">
        <label>Date du prélèvement <input type="date" id="rvDate" value="${draft.date}" required /></label>
        <label>Laboratoire <input id="rvLab" value="${esc(draft.lab)}" placeholder="facultatif" /></label>
      </div>
      ${draft.source && !draft.dateFound ? '<p class="hint warn-text">Date non trouvée dans le PDF : vérifiez-la.</p>' : ''}
      <div class="rv-list">
        ${draft.results.map((r, i) => {
          const st = r.value === '' || r.value == null ? 'unknown' : status(r);
          return `<div class="rv-row ${r.keep ? '' : 'off'}">
            <input type="checkbox" data-rv-keep="${i}" ${r.keep ? 'checked' : ''} aria-label="Garder ${esc(r.name)}" />
            <div class="rv-name">${esc(r.name)}
              <small>Réf. ${fmtRef(r) || '—'}${r.refSource === 'usuel' ? ' (usuelle)' : ''}</small>
              ${r.flags?.length ? `<small class="warn-text">⚠️ ${esc(r.flags.join(' ; '))}</small>` : ''}
              ${r.raw ? `<small class="raw">PDF : ${esc(r.raw)}</small>` : ''}
            </div>
            <div class="rv-val">
              <input type="number" step="any" inputmode="decimal" data-rv-val="${i}" value="${r.value ?? ''}" />
              <span>${esc(r.unit)}</span>
            </div>
            ${badge(st)}
          </div>`;
        }).join('') || '<p class="muted">Aucune valeur pour l\'instant : ajoutez-les ci-dessous.</p>'}
      </div>
      <div class="rv-add">
        <select id="rvAddKey"><option value="">+ Ajouter un biomarqueur…</option>${options}</select>
        <input type="number" step="any" inputmode="decimal" id="rvAddVal" placeholder="Valeur" />
        <button type="button" id="rvAddBtn">Ajouter</button>
      </div>
      ${draft.unmatched?.length ? `<details><summary>Lignes du PDF non reconnues (${draft.unmatched.length})</summary>
        <ul class="raw-list">${draft.unmatched.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>` : ''}
      ${draft.lines ? `<details><summary>Texte extrait du PDF</summary>
        <p class="hint muted">Si une valeur manque ou est fausse, copiez ce texte (en retirant votre nom) pour faire améliorer la lecture automatique.</p>
        <button type="button" id="rvCopy">📋 Copier le texte</button>
        <pre class="raw-text">${esc(draft.lines.join('\n'))}</pre></details>` : ''}
      <div class="row sync-row" style="margin-top:12px">
        <button class="primary" id="rvSave">💾 Enregistrer le bilan</button>
        <button id="rvCancel">Annuler</button>
      </div>`;
  }

  $('#labReview').addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'rvDate') draft.date = t.value;
    else if (t.id === 'rvLab') draft.lab = t.value;
    else if (t.dataset.rvVal != null) {
      const r = draft.results[t.dataset.rvVal];
      r.value = t.value === '' ? null : Number(t.value);
      r.flags = []; r.comparator = null;
      const b = t.closest('.rv-row').querySelector('.badge');
      b.outerHTML = badge(r.value == null ? 'unknown' : status(r));
    }
  });
  $('#labReview').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.rvKeep != null) {
      draft.results[t.dataset.rvKeep].keep = t.checked;
      t.closest('.rv-row').classList.toggle('off', !t.checked);
    }
  });
  $('#labReview').addEventListener('click', async e => {
    const id = e.target.id;
    if (id === 'rvAddBtn') {
      const key = $('#rvAddKey').value, v = $('#rvAddVal').value;
      if (!key || v === '') return;
      const b = BP.BY_KEY[key];
      const [refLow, refHigh] = BP.refFor(b, sex());
      draft.results.push({ key, name: b.name, unit: b.unit, value: Number(v), comparator: null, refLow, refHigh, refSource: 'usuel', flags: [], keep: true });
      renderReview();
    } else if (id === 'rvCancel') {
      draft = null; $('#labStatus').textContent = ''; renderReview();
    } else if (id === 'rvCopy') {
      try { await navigator.clipboard.writeText(draft.lines.join('\n')); e.target.textContent = '✅ Copié'; } catch { e.target.textContent = 'Copie impossible'; }
    } else if (id === 'rvSave') saveDraft();
  });

  function saveDraft() {
    if (!draft.date) { alert('Indiquez la date du prélèvement.'); return; }
    const results = draft.results.filter(r => r.keep && r.value != null && !isNaN(r.value))
      .map(({ key, value, comparator, refLow, refHigh, refSource }) => ({ key, value, comparator, refLow, refHigh, refSource }));
    if (!results.length) { alert('Aucune valeur à enregistrer.'); return; }
    state.labs ||= [];
    const same = state.labs.find(l => l.date === draft.date);
    if (same) {
      // Même date : on complète le bilan existant
      const keys = new Set(results.map(r => r.key));
      same.results = [...same.results.filter(r => !keys.has(r.key)), ...results];
      if (draft.lab) same.lab = draft.lab;
    } else {
      state.labs.push({ id: uid(), date: draft.date, lab: draft.lab.trim(), source: draft.source || null, results });
    }
    save();
    $('#labStatus').textContent = `✅ Bilan du ${longDate(draft.date)} enregistré (${results.length} valeurs).`;
    draft = null;
    renderReview(); renderLabs();
    $('#labSummary').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Graphiques ----------
  function sparkline(pts) {
    if (pts.length < 2) return '';
    const W = 80, H = 26, vals = pts.map(p => p.value);
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const x = i => 3 + i * (W - 6) / (pts.length - 1), y = v => H - 4 - (v - min) / span * (H - 8);
    const last = pts.at(-1);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <polyline points="${pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}" fill="none" stroke="var(--muted)" stroke-width="1.5"/>
      <circle cx="${x(pts.length - 1)}" cy="${y(last.value)}" r="3" class="dot-${status(last)}"/></svg>`;
  }

  function bigChart(b, pts) {
    const W = 360, H = 190, pad = { l: 36, r: 12, t: 16, b: 26 };
    const last = pts.at(-1);
    const lo = last.refLow, hi = last.refHigh;
    const vals = pts.map(p => p.value).concat([lo, hi].filter(v => v != null));
    let min = Math.min(...vals), max = Math.max(...vals);
    const m = (max - min) * 0.15 || Math.abs(max) * 0.2 || 1;
    min = Math.max(0, min - m); max += m;
    const t0 = new Date(pts[0].date).getTime(), t1 = new Date(last.date).getTime();
    const x = d => pts.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (new Date(d).getTime() - t0) / (t1 - t0 || 1) * (W - pad.l - pad.r);
    const y = v => pad.t + (max - v) / (max - min) * (H - pad.t - pad.b);
    const bandTop = hi != null ? y(Math.min(hi, max)) : pad.t, bandBot = lo != null ? y(Math.max(lo, min)) : H - pad.b;
    const ticks = [0, 1, 2, 3].map(i => min + (max - min) * i / 3);
    return `<svg viewBox="0 0 ${W} ${H}" class="lab-chart" role="img" aria-label="Évolution ${esc(b.name)}">
      ${lo != null || hi != null ? `<rect x="${pad.l}" y="${bandTop}" width="${W - pad.l - pad.r}" height="${Math.max(0, bandBot - bandTop)}" class="band"/>` : ''}
      ${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/>
        <text x="${pad.l - 5}" y="${y(v) + 4}" text-anchor="end">${fmtV(v)}</text>`).join('')}
      ${pts.length > 1 ? `<polyline points="${pts.map(p => `${x(p.date)},${y(p.value)}`).join(' ')}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round"/>` : ''}
      ${pts.map(p => `<circle cx="${x(p.date)}" cy="${y(p.value)}" r="5" class="dot-${status(p)}"><title>${shortDate(p.date)} : ${fmtV(p.value)} ${esc(b.unit)}</title></circle>
        <text x="${x(p.date)}" y="${y(p.value) - 9}" text-anchor="middle" class="pt-label">${fmtV(p.value)}</text>`).join('')}
      <text x="${pts.length === 1 ? x(pts[0].date) : pad.l}" y="${H - 7}" text-anchor="${pts.length === 1 ? 'middle' : 'start'}">${shortDate(pts[0].date)}</text>
      ${pts.length > 1 ? `<text x="${W - pad.r}" y="${H - 7}" text-anchor="end">${shortDate(last.date)}</text>` : ''}
    </svg>`;
  }

  // ---------- Synthèse et liste des biomarqueurs ----------
  function trendText(pts) {
    if (pts.length < 2) return '';
    const a = pts.at(-2), b = pts.at(-1);
    if (!a.value) return '';
    const pct = Math.round((b.value - a.value) / Math.abs(a.value) * 100);
    if (pct === 0) return '= stable';
    return `${pct > 0 ? '↗' : '↘'} ${pct > 0 ? '+' : ''}${pct} %`;
  }

  window.renderLabs = function renderLabs() {
    if (!$('#labMarkers')) return;
    const labs = [...(state.labs || [])].sort((a, b) => b.date.localeCompare(a.date));
    const h = history();
    $('#labHistoryCard').classList.toggle('hidden', !labs.length);
    if (!labs.length) {
      $('#labSummary').innerHTML = ''; $('#labMarkers').innerHTML = '';
      return;
    }

    // Synthèse : dernière valeur de chaque biomarqueur
    const latest = Object.entries(h).map(([k, pts]) => ({ b: BP.BY_KEY[k], pts, last: pts.at(-1) })).filter(x => x.b);
    const abnormal = latest.filter(x => ['low', 'high'].includes(status(x.last)));
    const improved = latest.filter(x => x.pts.length > 1 && ['low', 'high'].includes(status(x.pts.at(-2))) && status(x.last) === 'normal');
    const worsened = latest.filter(x => x.pts.length > 1 && status(x.pts.at(-2)) === 'normal' && ['low', 'high'].includes(status(x.last)));
    $('#labSummary').innerHTML = `<div class="card">
      <h3>🔎 Synthèse</h3>
      <p class="muted hint" style="margin-top:0">Dernier bilan : ${longDate(labs[0].date)}${labs[0].lab ? ` · ${esc(labs[0].lab)}` : ''} · ${latest.length} biomarqueurs suivis sur ${labs.length} bilan(s).</p>
      ${abnormal.length ? `<p><strong>${abnormal.length} valeur(s) en dehors des références :</strong></p>
        <ul class="sum-list">${abnormal.map(x => `<li><a href="#" data-lab-open="${x.b.key}">${esc(x.b.name)}</a> ${badge(status(x.last))}
          <span class="muted">${fmtV(x.last.value)} ${esc(x.b.unit)} (réf. ${fmtRef(x.last)})${x.last.date !== labs[0].date ? ` · bilan du ${shortDate(x.last.date)}` : ''}</span></li>`).join('')}</ul>`
        : '<p>✅ Toutes vos dernières valeurs sont dans les références.</p>'}
      ${improved.length ? `<p>👍 Revenu(s) dans la norme depuis le bilan précédent : ${improved.map(x => esc(x.b.name)).join(', ')}.</p>` : ''}
      ${worsened.length ? `<p>👀 Sorti(s) de la norme depuis le bilan précédent : ${worsened.map(x => esc(x.b.name)).join(', ')}.</p>` : ''}
      ${abnormal.some(x => x.b.tips?.[status(x.last)]) ? `<details open><summary>Pistes à discuter avec votre médecin</summary>
        ${abnormal.filter(x => x.b.tips?.[status(x.last)]).map(x => `<p class="tip"><strong>${esc(x.b.name)} :</strong> ${esc(x.b.tips[status(x.last)])}</p>`).join('')}</details>` : ''}
    </div>`;

    // Biomarqueurs regroupés par catégorie
    const cats = [...new Set(BP.BIOMARKERS.map(b => b.cat))];
    $('#labMarkers').innerHTML = cats.map(cat => {
      const items = latest.filter(x => x.b.cat === cat);
      if (!items.length) return '';
      return `<div class="card"><h3>${esc(cat)}</h3>${items.map(({ b, pts, last }) => {
        const st = status(last);
        return `<details class="marker" id="mk-${b.key}">
          <summary>
            <span class="mk-name">${esc(b.name)}<small>${shortDate(last.date)}${pts.length > 1 ? ` · ${trendText(pts)}` : ''}</small></span>
            ${sparkline(pts)}
            <span class="mk-val">${last.comparator || ''}${fmtV(last.value)} <small>${esc(b.unit)}</small></span>
            ${badge(st)}
          </summary>
          <div class="mk-body">
            <p class="muted hint">${esc(b.desc || '')}</p>
            ${bigChart(b, pts)}
            <p class="hint muted">Zone verte : valeurs de référence (${fmtRef(last) || 'non renseignées'} ${esc(b.unit)}${last.refSource === 'usuel' ? ', valeurs usuelles' : ', laboratoire'}).</p>
            ${b.tips?.[st] ? `<p class="tip">💡 ${esc(b.tips[st])}</p>` : ''}
            <table class="mk-table"><tr><th>Date</th><th>Valeur</th><th>Référence</th><th></th></tr>
              ${[...pts].reverse().map(p => `<tr><td>${shortDate(p.date)}</td><td>${p.comparator || ''}${fmtV(p.value)}</td><td>${fmtRef(p)}</td><td>${badge(status(p))}</td></tr>`).join('')}
            </table>
          </div>
        </details>`;
      }).join('')}</div>`;
    }).join('');

    $('#labHistory').innerHTML = labs.map(l => `<div class="item">
      <div>${longDate(l.date)}<br><small>${l.lab ? esc(l.lab) + ' · ' : ''}${l.results.length} valeurs</small></div>
      <button class="icon" data-lab-del="${l.id}" title="Supprimer ce bilan">✕</button></div>`).join('');
  };

  // ---------- Événements ----------
  $('#labFile').addEventListener('change', e => { importFile(e.target.files[0]); e.target.value = ''; });
  $('#labManual').addEventListener('click', () => {
    draft = { date: todayStr(), lab: '', source: null, results: [], dateFound: true };
    $('#labStatus').textContent = '';
    renderReview();
    $('#labReview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // Glisser-déposer (ordinateur)
  const drop = $('#labDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragging'); importFile(e.dataTransfer.files[0]); });

  document.addEventListener('click', e => {
    const del = e.target.closest('[data-lab-del]');
    if (del) {
      const lab = state.labs.find(l => l.id === del.dataset.labDel);
      if (lab && confirm(`Supprimer le bilan du ${longDate(lab.date)} ?`)) {
        state.labs = state.labs.filter(l => l !== lab); save(); renderLabs();
      }
      return;
    }
    const open = e.target.closest('[data-lab-open]');
    if (open) {
      e.preventDefault();
      const d = document.getElementById('mk-' + open.dataset.labOpen);
      if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  });

  renderLabs();
})();
