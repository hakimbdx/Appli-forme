// Appli Forme — suivi santé & régime (stockage local, sans dépendances)
const STORAGE_KEY = 'appli-forme-v1';

const defaultState = () => ({
  profile: null,
  meals: {},     // { 'YYYY-MM-DD': [{id, type, name, kcal, protein, carbs, fat}] }
  water: {},     // { 'YYYY-MM-DD': n }
  weights: [],   // [{date, kg}]
  activities: {} // { 'YYYY-MM-DD': [{id, name, minutes, kcal}] }
});

let state = load();
let currentDate = todayStr();

// ---------- Utilitaires ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
  } catch { return defaultState(); }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
function todayStr() {
  const d = new Date();
  return toStr(d);
}
function toStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shiftDate(str, days) {
  const [y, m, d] = str.split('-').map(Number);
  return toStr(new Date(y, m - 1, d + days));
}
function fmtDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
const uid = () => Math.random().toString(36).slice(2, 10);
const num = v => (v === '' || v == null ? 0 : Number(v));
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Calculs santé ----------
function latestWeight() {
  if (state.weights.length) return [...state.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1).kg;
  return state.profile?.startWeight ?? null;
}
function bmi() {
  const w = latestWeight(), h = state.profile?.height;
  return w && h ? w / (h / 100) ** 2 : null;
}
function bmiCategory(v) {
  if (v < 18.5) return 'Insuffisance pondérale';
  if (v < 25) return 'Corpulence normale';
  if (v < 30) return 'Surpoids';
  return 'Obésité';
}
// Mifflin-St Jeor
function bmr() {
  const p = state.profile; const w = latestWeight();
  if (!p || !w) return null;
  return 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
}
function targets() {
  const b = bmr();
  if (!b) return null;
  const tdee = b * state.profile.activity;
  const minKcal = state.profile.sex === 'm' ? 1500 : 1200;
  const kcal = Math.max(minKcal, Math.round(tdee + state.profile.goal));
  return {
    bmr: Math.round(b), tdee: Math.round(tdee), kcal,
    protein: Math.round(kcal * 0.25 / 4),
    carbs: Math.round(kcal * 0.45 / 4),
    fat: Math.round(kcal * 0.30 / 9),
  };
}
function dayTotals(date) {
  const meals = state.meals[date] || [];
  const t = meals.reduce((a, m) => ({
    kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  t.burned = (state.activities[date] || []).reduce((a, x) => a + x.kcal, 0);
  return t;
}

// ---------- Rendu ----------
function renderDashboard() {
  $('#currentDate').value = currentDate;
  $('#profileWarning').classList.toggle('hidden', !!state.profile);

  const t = dayTotals(currentDate);
  const tg = targets();
  const goal = tg ? tg.kcal + t.burned : null;

  // Anneau calories
  const pct = goal ? Math.min(t.kcal / goal, 1) : 0;
  const over = goal && t.kcal > goal;
  const r = 52, c = 2 * Math.PI * r;
  $('#calRing').innerHTML = `
    <svg viewBox="0 0 130 130">
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--primary-soft)" stroke-width="12"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="${over ? 'var(--danger)' : 'var(--primary)'}" stroke-width="12"
        stroke-linecap="round" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 65 65)"/>
      <text x="65" y="62" text-anchor="middle" font-size="22" font-weight="700" fill="currentColor">${Math.round(t.kcal)}</text>
      <text x="65" y="82" text-anchor="middle" font-size="11" fill="var(--muted)">kcal</text>
    </svg>`;
  $('#calText').textContent = goal
    ? (over ? `${Math.round(t.kcal - goal)} kcal au-dessus de l'objectif` : `Reste ${Math.round(goal - t.kcal)} kcal sur ${goal}`)
    : 'Objectif non défini';
  if (t.burned) $('#calText').textContent += ` (dont +${t.burned} brûlées)`;

  // Eau
  const water = state.water[currentDate] || 0;
  const wGoal = state.profile?.waterGoal || 8;
  $('#waterText').textContent = `${water} / ${wGoal}`;
  $('#waterGlasses').textContent = '💧'.repeat(Math.min(water, 20)) || '—';

  // Poids
  const w = latestWeight();
  $('#weightNow').textContent = w ? `${round(w, 1)} kg` : '—';
  if (w && state.profile) {
    const diff = round(w - state.profile.goalWeight, 1);
    $('#weightDelta').textContent = diff === 0 ? 'Objectif atteint 🎉'
      : `${Math.abs(diff)} kg ${diff > 0 ? 'à perdre' : 'à prendre'} (objectif ${state.profile.goalWeight} kg)`;
  } else $('#weightDelta').textContent = '';

  // IMC
  const b = bmi();
  $('#bmiValue').textContent = b ? round(b, 1) : '—';
  $('#bmiLabel').textContent = b ? bmiCategory(b) : '';

  // Macros
  const macros = [
    ['Protéines', t.protein, tg?.protein, '#4a90d9'],
    ['Glucides', t.carbs, tg?.carbs, '#f0a23b'],
    ['Lipides', t.fat, tg?.fat, '#c45ab3'],
  ];
  $('#macros').innerHTML = macros.map(([name, v, g, color]) => `
    <div class="macro">
      <div class="macro-head"><span>${name}</span><span>${round(v)} g${g ? ` / ${g} g` : ''}</span></div>
      <div class="bar"><span style="width:${g ? Math.min(v / g * 100, 100) : 0}%;background:${color}"></span></div>
    </div>`).join('');
}

function renderMeals() {
  $('#mealsDate').textContent = fmtDate(currentDate);
  const meals = state.meals[currentDate] || [];
  if (!meals.length) { $('#mealList').innerHTML = '<p class="muted">Aucun aliment enregistré pour ce jour.</p>'; return; }
  const groups = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Collation'];
  $('#mealList').innerHTML = groups.map(g => {
    const items = meals.filter(m => m.type === g);
    if (!items.length) return '';
    const total = items.reduce((a, m) => a + m.kcal, 0);
    return `<div class="list-group"><h4>${g} — ${total} kcal</h4>${items.map(m => `
      <div class="item">
        <div>${esc(m.name)}<br><small>P ${m.protein} g · G ${m.carbs} g · L ${m.fat} g</small></div>
        <div><strong>${m.kcal} kcal</strong> <button class="icon" data-del-meal="${m.id}" title="Supprimer">✕</button></div>
      </div>`).join('')}</div>`;
  }).join('');
}

function renderWeight() {
  const list = [...state.weights].sort((a, b) => b.date.localeCompare(a.date));
  $('#weightList').innerHTML = list.length ? list.map(w => `
    <div class="item"><span>${fmtDate(w.date)}</span>
      <span><strong>${w.kg} kg</strong> <button class="icon" data-del-weight="${w.date}" title="Supprimer">✕</button></span>
    </div>`).join('') : '<p class="muted">Aucune pesée enregistrée.</p>';
  renderWeightChart();
}

function renderWeightChart() {
  const pts = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const el = $('#weightChart');
  if (pts.length < 2) { el.innerHTML = '<p class="muted">Ajoutez au moins deux pesées pour voir la courbe.</p>'; return; }
  const W = 640, H = 240, pad = { l: 40, r: 16, t: 16, b: 28 };
  const goal = state.profile?.goalWeight;
  const vals = pts.map(p => p.kg).concat(goal ? [goal] : []);
  let min = Math.min(...vals) - 1, max = Math.max(...vals) + 1;
  const t0 = new Date(pts[0].date).getTime(), t1 = new Date(pts.at(-1).date).getTime();
  const x = d => pad.l + (new Date(d).getTime() - t0) / (t1 - t0 || 1) * (W - pad.l - pad.r);
  const y = v => pad.t + (max - v) / (max - min) * (H - pad.t - pad.b);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + (max - min) * i / ticks;
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/>
            <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${round(v, 1)}</text>`;
  }).join('');
  const short = d => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; };
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    ${grid}
    ${goal ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--accent)" stroke-dasharray="6 4"/>
      <text x="${W - pad.r}" y="${y(goal) - 6}" text-anchor="end">objectif ${goal} kg</text>` : ''}
    <path d="${path}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${x(p.date)}" cy="${y(p.kg)}" r="4" fill="var(--primary)"><title>${short(p.date)} : ${p.kg} kg</title></circle>`).join('')}
    <text x="${pad.l}" y="${H - 8}">${short(pts[0].date)}</text>
    <text x="${W - pad.r}" y="${H - 8}" text-anchor="end">${short(pts.at(-1).date)}</text>
  </svg>`;
}

function renderActivity() {
  $('#activityDate').textContent = fmtDate(currentDate);
  const list = state.activities[currentDate] || [];
  $('#activityList').innerHTML = list.length ? list.map(a => `
    <div class="item"><div>${esc(a.name)}<br><small>${a.minutes} min</small></div>
      <div><strong>${a.kcal} kcal</strong> <button class="icon" data-del-activity="${a.id}" title="Supprimer">✕</button></div>
    </div>`).join('') : '<p class="muted">Aucune activité enregistrée pour ce jour.</p>';
}

function renderProfile() {
  const p = state.profile;
  const f = $('#profileForm');
  if (p) for (const k of Object.keys(p)) if (f.elements[k]) f.elements[k].value = p[k];
  const tg = targets();
  $('#profileSummary').innerHTML = tg ? `<div class="summary">
    <div>Métabolisme de base<strong>${tg.bmr} kcal</strong></div>
    <div>Dépense journalière<strong>${tg.tdee} kcal</strong></div>
    <div>Objectif calorique<strong>${tg.kcal} kcal</strong></div>
    <div>Protéines / Glucides / Lipides<strong>${tg.protein} / ${tg.carbs} / ${tg.fat} g</strong></div>
  </div>` : '';
}

function renderAll() {
  renderDashboard(); renderMeals(); renderWeight(); renderActivity(); renderProfile();
}

// ---------- Navigation ----------
function showTab(id) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === id));
}
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); showTab(a.dataset.goto); }));

$('#currentDate').addEventListener('change', e => { if (e.target.value) { currentDate = e.target.value; renderAll(); } });
$('#prevDay').addEventListener('click', () => { currentDate = shiftDate(currentDate, -1); renderAll(); });
$('#nextDay').addEventListener('click', () => { currentDate = shiftDate(currentDate, 1); renderAll(); });

// ---------- Formulaires ----------
$('#mealForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  (state.meals[currentDate] ||= []).push({
    id: uid(), type: f.type.value, name: f.name.value.trim(),
    kcal: num(f.kcal.value), protein: num(f.protein.value), carbs: num(f.carbs.value), fat: num(f.fat.value),
  });
  save(); e.target.reset(); f.type.focus(); renderAll();
});

$('#weightForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  state.weights = state.weights.filter(w => w.date !== f.date.value);
  state.weights.push({ date: f.date.value, kg: num(f.kg.value) });
  save(); f.kg.value = ''; renderAll();
});

$('#activityForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  (state.activities[currentDate] ||= []).push({
    id: uid(), name: f.name.value.trim(), minutes: num(f.minutes.value), kcal: num(f.kcal.value),
  });
  save(); e.target.reset(); renderAll();
});

$('#profileForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  state.profile = {
    sex: f.sex.value, age: num(f.age.value), height: num(f.height.value),
    startWeight: num(f.startWeight.value), goalWeight: num(f.goalWeight.value),
    activity: num(f.activity.value), goal: num(f.goal.value), waterGoal: num(f.waterGoal.value) || 8,
  };
  save(); renderAll();
});

// Suppressions (délégation)
document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.delMeal) state.meals[currentDate] = state.meals[currentDate].filter(m => m.id !== t.dataset.delMeal);
  else if (t.dataset.delWeight) state.weights = state.weights.filter(w => w.date !== t.dataset.delWeight);
  else if (t.dataset.delActivity) state.activities[currentDate] = state.activities[currentDate].filter(a => a.id !== t.dataset.delActivity);
  else return;
  save(); renderAll();
});

// Eau
$('#waterPlus').addEventListener('click', () => { state.water[currentDate] = (state.water[currentDate] || 0) + 1; save(); renderDashboard(); });
$('#waterMinus').addEventListener('click', () => { state.water[currentDate] = Math.max(0, (state.water[currentDate] || 0) - 1); save(); renderDashboard(); });

// Export / import / reset
$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `appli-forme-${todayStr()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
});
$('#importInput').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    state = { ...defaultState(), ...JSON.parse(await file.text()) };
    save(); renderAll(); alert('Données importées.');
  } catch { alert('Fichier invalide.'); }
  e.target.value = '';
});
$('#resetBtn').addEventListener('click', () => {
  if (confirm('Effacer toutes vos données ? Cette action est irréversible.')) { state = defaultState(); save(); renderAll(); }
});

// ---------- Init ----------
$('#weightForm').elements.date.value = todayStr();
renderAll();
