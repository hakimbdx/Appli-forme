/*
 * Bibliothèque de mouvements du mannequin 3D (sans dépendance : testable dans Node).
 *
 * Une posture = angles des articulations en degrés (valeurs absentes = 0) :
 *   pitch / roll / yaw : orientation du bassin (pitch + = penché en avant, 90 = à plat ventre, -90 = sur le dos)
 *   lift, dx, dz       : décalages en mètres (saut, déplacement latéral)
 *   sp, spS, spT       : colonne (flexion avant, inclinaison latérale, rotation)
 *   ch, chT            : haut du dos (flexion, rotation)   nk, nkS, nkT : nuque
 *   shL / shR = [flexion (bras vers l'avant/haut), abduction (bras sur le côté), rotation]
 *   elL / elR = flexion du coude    hpL / hpR = [flexion, abduction, rotation]
 *   knL / knR = flexion du genou    akL / akR = pointe de pied (+ = talon levé)
 *   flat : pieds maintenus à plat (par défaut quand le corps est debout)
 * Un mouvement = { poses: [...], dur (s par cycle), seq (enchaînement) ou aller-retour,
 *                  alt (alterne gauche/droite à chaque cycle), hold (posture tenue), view (angle de caméra) }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Moves = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ARMS = { shL: [0, 7, 0], shR: [0, 7, 0] };
  const P = o => ({ ...ARMS, ...o });

  // Inverse gauche / droite d'une posture
  function mirror(p) {
    const m = { ...p };
    const swap = (a, b) => { const t = p[a]; if (p[b] !== undefined) m[a] = p[b]; else delete m[a]; if (t !== undefined) m[b] = t; else delete m[b]; };
    ['sh', 'el', 'hp', 'kn', 'ak'].forEach(k => swap(k + 'L', k + 'R'));
    ['roll', 'yaw', 'spS', 'spT', 'chT', 'nkS', 'nkT', 'dx'].forEach(k => { if (m[k]) m[k] = -m[k]; });
    return m;
  }

  // ---------- Postures de base ----------
  const STAND = P({});
  const squatLow = (depth = 1, arms = 'front') => P({
    hpL: [100 * depth, 14, 0], hpR: [100 * depth, 14, 0], knL: 112 * depth, knR: 112 * depth, sp: 22 * depth,
    ...(arms === 'front' ? { shL: [85, 5, 0], shR: [85, 5, 0] } : arms === 'chest' ? { shL: [35, 10, 0], shR: [35, 10, 0], elL: 135, elR: 135 } : arms === 'head' ? { shL: [150, 40, 0], shR: [150, 40, 0], elL: 140, elR: 140 } : {}),
  });
  // Bras pendants quand le buste est penché (bras verticaux)
  const hang = (lean, extra = 0) => ({ shL: [lean + extra, 4, 0], shR: [lean + extra, 4, 0] });
  const hinge = (lean = 70, arms = 'hang') => P({ pitch: lean, hpL: [lean + 5, 6, 0], hpR: [lean + 5, 6, 0], knL: 15, knR: 15,
    ...(arms === 'hang' ? hang(lean) : arms === 'head' ? { shL: [150 + 0, 45, 0], shR: [150, 45, 0], elL: 140, elR: 140 } : {}) });
  const lunge = (deep = 1) => P({ hpL: [88 * deep, 4, 0], knL: 92 * deep, hpR: [-22 * deep, 4, 0], knR: 100 * deep, akR: 35 * deep, sp: 3 });
  // À plat ventre / sur le dos / à quatre pattes
  const plankHigh = P({ pitch: 72, flat: false, shL: [74, 8, 0], shR: [74, 8, 0], akL: -12, akR: -12 });
  const plankLow = P({ pitch: 88, flat: false, shL: [12, 32, 0], shR: [12, 32, 0], elL: 110, elR: 110, akL: -5, akR: -5 });
  const forearmPlank = P({ pitch: 82, flat: false, shL: [82, 10, 0], shR: [82, 10, 0], elL: 95, elR: 95, akL: -8, akR: -8 });
  const quad = P({ pitch: 90, flat: false, hpL: [90, 6, 0], hpR: [90, 6, 0], knL: 90, knR: 90, shL: [90, 6, 0], shR: [90, 6, 0], akL: 60, akR: 60 });
  const supine = P({ pitch: -90, flat: false, shL: [0, 12, 0], shR: [0, 12, 0], akL: 20, akR: 20 });
  const supineKnees = P({ ...supine, hpL: [50, 6, 0], hpR: [50, 6, 0], knL: 105, knR: 105, akL: 0, akR: 0 });
  const prone = P({ pitch: 90, flat: false, shL: [170, 15, 0], shR: [170, 15, 0], akL: 70, akR: 70 });
  const sideLying = P({ roll: 90, flat: false, shR: [170, 0, 0], elR: 0, shL: [10, 10, 0], hpL: [10, 0, 0], hpR: [10, 0, 0], akL: 20, akR: 20 });
  const seated = P({ pitch: 0, flat: false, hpL: [90, 5, 0], hpR: [90, 5, 0], akL: 10, akR: 10 });

  const M = {};
  const def = (name, poses, o = {}) => { M[name] = { poses, dur: 2.4, view: 35, ...o }; };

  // ---------- Debout / jambes ----------
  def('idle', [STAND, P({ ch: 3, shL: [3, 9, 0], shR: [3, 9, 0] })], { dur: 3.5, hold: true, view: 25 });
  def('squat', [STAND, squatLow(1)], { dur: 2.6 });
  def('squat_pause', [STAND, squatLow(1), squatLow(1), STAND], { dur: 4, seq: true });
  def('squat_box', [STAND, squatLow(0.8)], { dur: 2.6 });
  def('squat_goblet', [P({ shL: [35, 10, 0], shR: [35, 10, 0], elL: 135, elR: 135 }), squatLow(1, 'chest')], { dur: 2.6 });
  def('squat_sumo', [P({ hpL: [0, 25, 0], hpR: [0, 25, 0] }), P({ hpL: [80, 38, 0], hpR: [80, 38, 0], knL: 95, knR: 95, sp: 12, shL: [70, 5, 0], shR: [70, 5, 0], elL: 60, elR: 60 })], { dur: 2.6, view: 15 });
  def('squat_jump', [squatLow(0.9, 'none'), P({ lift: 0.28, akL: 35, akR: 35, shL: [160, 15, 0], shR: [160, 15, 0], flat: false })], { dur: 1.4 });
  def('wall_sit', [P({ hpL: [90, 8, 0], hpR: [90, 8, 0], knL: 90, knR: 90, sp: -3 }), P({ hpL: [90, 8, 0], hpR: [90, 8, 0], knL: 90, knR: 90, sp: -3, ch: 3 })], { dur: 3, hold: true, view: 80 });
  def('lunge', [STAND, lunge(1)], { dur: 2.6, alt: true, view: 70 });
  def('lunge_jump', [lunge(0.9), P({ lift: 0.22, flat: false, hpL: [40, 4, 0], knL: 50, hpR: [-10, 4, 0], knR: 40, shL: [-20, 7, 0], shR: [40, 7, 0], elL: 80, elR: 80 })], { dur: 1.2, alt: true, view: 70 });
  def('lunge_side', [P({ hpL: [0, 20, 0], hpR: [0, 20, 0] }), P({ hpL: [70, 32, 0], knL: 95, hpR: [5, 30, 0], sp: 28, shL: [80, 5, 0], shR: [80, 5, 0], elL: 50, elR: 50 })], { dur: 2.6, alt: true, view: 10 });
  def('lunge_rot', [lunge(1.05), P({ ...lunge(1.05), chT: -50, shR: [0, 170, 0], shL: [60, 5, 0] })], { dur: 3, alt: true, view: 40 });
  def('step_up', [STAND, P({ hpL: [75, 4, 0], knL: 80, shR: [40, 7, 0], shL: [-20, 7, 0], elR: 70, elL: 30 })], { dur: 2, alt: true, view: 70 });
  def('calf_raise', [STAND, P({ akL: 40, akR: 40, flat: true })], { dur: 2 });
  def('hinge', [STAND, hinge(70)], { dur: 2.8, view: 80 });
  def('good_morning', [P({ shL: [150, 45, 0], shR: [150, 45, 0], elL: 140, elR: 140 }), hinge(65, 'head')], { dur: 2.8, view: 80 });
  def('swing', [P({ ...hinge(60), ...{ shL: [20, 4, 0], shR: [20, 4, 0] } }), P({ shL: [90, 4, 0], shR: [90, 4, 0] })], { dur: 1.6, view: 80 });
  def('monster_walk', [P({ hpL: [30, 14, 0], hpR: [30, 14, 0], knL: 35, knR: 35, sp: 12 }), P({ hpL: [35, 30, 0], hpR: [30, 8, 0], knL: 38, knR: 35, sp: 12, dx: 0.12 })], { dur: 1.6, alt: true, view: 10 });
  def('march', [P({ hpL: [80, 4, 0], knL: 85, shR: [45, 7, 0], shL: [-25, 7, 0], elL: 40, elR: 60 }), STAND], { dur: 1.3, alt: true, view: 45 });
  def('high_knees', [P({ lift: 0.06, flat: false, hpL: [95, 4, 0], knL: 100, akR: 25, shR: [50, 7, 0], shL: [-30, 7, 0], elL: 90, elR: 90 }), P({ lift: 0.04, flat: false, akL: 25, akR: 25, elL: 90, elR: 90 })], { dur: 0.55, alt: true, view: 45 });
  def('butt_kicks', [P({ lift: 0.05, flat: false, hpL: [-10, 4, 0], knL: 130, akR: 25, elL: 90, elR: 90, shL: [20, 7, 0], shR: [-20, 7, 0] }), P({ lift: 0.03, flat: false, akL: 20, akR: 20, elL: 90, elR: 90 })], { dur: 0.55, alt: true, view: 70 });
  def('jumping_jack', [P({}), P({ lift: 0.1, flat: false, akL: 25, akR: 25, hpL: [0, 22, 0], hpR: [0, 22, 0], shL: [0, 165, 0], shR: [0, 165, 0] })], { dur: 0.9, view: 0 });
  def('step_touch', [P({ hpL: [5, 18, 0], knL: 10, knR: 15, hpR: [0, 4, 0], shL: [30, 30, 0], shR: [30, 30, 0], elL: 70, elR: 70, dx: 0.12 }), P({ knL: 15, knR: 15, shL: [10, 10, 0], shR: [10, 10, 0], elL: 70, elR: 70 })], { dur: 1, alt: true, view: 0 });
  def('shuffle', [P({ hpL: [35, 25, 0], hpR: [35, 10, 0], knL: 45, knR: 45, sp: 15, shL: [40, 15, 0], shR: [40, 15, 0], elL: 80, elR: 80, dx: 0.18 }), P({ hpL: [35, 12, 0], hpR: [35, 12, 0], knL: 45, knR: 45, sp: 15, shL: [40, 15, 0], shR: [40, 15, 0], elL: 80, elR: 80, lift: 0.04 })], { dur: 0.8, alt: true, view: 0 });
  def('skater', [P({ pitch: 15, hpL: [55, 10, 0], knL: 60, hpR: [-25, -25, 0], knR: 50, shR: [60, 10, 0], shL: [-30, 10, 0], elR: 30, dx: 0.3 }), P({ lift: 0.18, flat: false, pitch: 10, hpL: [30, 10, 0], knL: 30, hpR: [10, 10, 0], knR: 30, akL: 20, akR: 20 })], { dur: 1.1, alt: true, view: 0 });
  def('knee_elbow', [P({ hpL: [85, 15, 0], knL: 90, sp: 18, spT: -25, shR: [100, 50, 0], elR: 120, shL: [80, 70, 0], elL: 120 }), P({ shL: [150, 50, 0], shR: [150, 50, 0], elL: 140, elR: 140 })], { dur: 1.1, alt: true, view: 20 });
  def('boxing', [P({ knL: 15, knR: 15, hpL: [10, 6, 0], hpR: [10, 6, 0], spT: -25, shL: [85, 15, 0], elL: 5, shR: [60, 20, 0], elR: 120 }), P({ knL: 15, knR: 15, hpL: [10, 6, 0], hpR: [10, 6, 0], shL: [60, 20, 0], elL: 120, shR: [60, 20, 0], elR: 120 })], { dur: 0.7, alt: true, view: 30 });
  def('jump_rope', [P({ lift: 0.07, flat: false, akL: 30, akR: 30, shL: [15, 25, 0], shR: [15, 25, 0], elL: 70, elR: 70 }), P({ flat: true, knL: 15, knR: 15, hpL: [10, 4, 0], hpR: [10, 4, 0], shL: [15, 25, 0], shR: [15, 25, 0], elL: 70, elR: 70 })], { dur: 0.45, view: 20 });
  def('run', [P({ lift: 0.05, flat: false, pitch: 8, hpL: [55, 4, 0], knL: 85, hpR: [-20, 4, 0], knR: 40, akR: 25, shR: [45, 8, 0], shL: [-35, 8, 0], elL: 90, elR: 90 }), P({ lift: 0.02, flat: false, pitch: 8, hpL: [15, 4, 0], knL: 40, hpR: [10, 4, 0], knR: 60, shL: [5, 8, 0], shR: [5, 8, 0], elL: 90, elR: 90 })], { dur: 0.7, alt: true, view: 75 });
  def('walk', [P({ hpL: [25, 4, 0], knL: 10, hpR: [-15, 4, 0], knR: 15, akR: 15, shR: [25, 7, 0], shL: [-20, 7, 0], elL: 20, elR: 20 }), P({ hpL: [0, 4, 0], hpR: [5, 4, 0], knR: 30 })], { dur: 1.1, alt: true, view: 75 });

  // ---------- Bras debout ----------
  def('press_overhead', [P({ shL: [5, 80, 80], shR: [5, 80, 80], elL: 100, elR: 100 }), P({ shL: [5, 165, 80], shR: [5, 165, 80], elL: 10, elR: 10 })], { dur: 2.4, view: 15 });
  def('lateral_raise', [P({ shL: [5, 12, 0], shR: [5, 12, 0], elL: 10, elR: 10 }), P({ shL: [5, 85, 0], shR: [5, 85, 0], elL: 15, elR: 15 })], { dur: 2.4, view: 0 });
  def('curl', [P({ shL: [0, 8, 0], shR: [0, 8, 0], elL: 5, elR: 5 }), P({ shL: [8, 8, 0], shR: [8, 8, 0], elL: 135, elR: 135 })], { dur: 2.2, view: 45 });
  def('triceps', [P({ shL: [170, 12, 0], shR: [170, 12, 0], elL: 120, elR: 120 }), P({ shL: [170, 12, 0], shR: [170, 12, 0], elL: 10, elR: 10 })], { dur: 2.2, view: 70 });
  def('chest_press_stand', [P({ shL: [70, 45, 0], shR: [70, 45, 0], elL: 110, elR: 110 }), P({ shL: [88, 12, 0], shR: [88, 12, 0], elL: 5, elR: 5 })], { dur: 2, view: 60 });
  def('row_band', [P({ knL: 10, knR: 10, shL: [85, 8, 0], shR: [85, 8, 0], elL: 5, elR: 5 }), P({ knL: 10, knR: 10, shL: [5, 12, 0], shR: [5, 12, 0], elL: 105, elR: 105, ch: -5 })], { dur: 2.2, view: 70 });
  def('face_pull', [P({ shL: [90, 8, 0], shR: [90, 8, 0], elL: 5, elR: 5 }), P({ shL: [20, 85, 80], shR: [20, 85, 80], elL: 110, elR: 110 })], { dur: 2.2, view: 40 });
  def('pulldown', [P({ shL: [5, 160, 0], shR: [5, 160, 0], elL: 10, elR: 10 }), P({ shL: [5, 70, 80], shR: [5, 70, 80], elL: 100, elR: 100 })], { dur: 2.2, view: 15 });
  def('pallof', [P({ knL: 12, knR: 12, hpL: [10, 12, 0], hpR: [10, 12, 0], shL: [30, 10, 0], shR: [30, 10, 0], elL: 120, elR: 120 }), P({ knL: 12, knR: 12, hpL: [10, 12, 0], hpR: [10, 12, 0], shL: [88, 5, 0], shR: [88, 5, 0], elL: 5, elR: 5 })], { dur: 2.4, view: 30 });
  def('row_one_arm', [P({ ...hinge(60), hpL: [80, 6, 0], knL: 45, shR: [120, 10, 0], elR: 25, shL: [60, 4, 0] }), P({ ...hinge(60), hpL: [80, 6, 0], knL: 45, shR: [120, 10, 0], elR: 25, shL: [5, 8, 0], elL: 100 })], { dur: 2.4, alt: true, view: 80 });
  def('row_bent', [P({ ...hinge(55) }), P({ ...hinge(55), shL: [0, 15, 0], shR: [0, 15, 0], elL: 100, elR: 100 })], { dur: 2.2, view: 80 });
  def('pullup', [P({ flat: false, lift: 0.0, hpL: [10, 4, 0], hpR: [10, 4, 0], knL: 50, knR: 50, akL: 20, akR: 20, shL: [5, 168, 0], shR: [5, 168, 0], elL: 5, elR: 5 }), P({ flat: false, lift: 0.4, hpL: [20, 4, 0], hpR: [20, 4, 0], knL: 60, knR: 60, akL: 20, akR: 20, shL: [5, 80, 80], shR: [5, 80, 80], elL: 115, elR: 115, nk: -10 })], { dur: 3, view: 25 });
  def('hang', [P({ flat: false, lift: 0.15, hpL: [10, 4, 0], hpR: [10, 4, 0], knL: 45, knR: 45, akL: 20, akR: 20, shL: [5, 168, 0], shR: [5, 168, 0] }), P({ flat: false, lift: 0.15, hpL: [12, 4, 0], hpR: [12, 4, 0], knL: 50, knR: 50, akL: 20, akR: 20, shL: [5, 166, 0], shR: [5, 166, 0] })], { dur: 3, hold: true, view: 25 });
  def('arm_circles', [P({ shL: [0, 90, 0], shR: [0, 90, 0] }), P({ shL: [30, 90, 0], shR: [30, 90, 0] }), P({ shL: [0, 110, 0], shR: [0, 110, 0] }), P({ shL: [-25, 90, 0], shR: [-25, 90, 0] }), P({ shL: [0, 90, 0], shR: [0, 90, 0] })], { dur: 1.6, seq: true, view: 30 });
  def('hip_circles', [P({ spS: 12, shL: [20, 40, 0], shR: [20, 40, 0], elL: 100, elR: 100 }), P({ sp: 12, shL: [20, 40, 0], shR: [20, 40, 0], elL: 100, elR: 100 }), P({ spS: -12, shL: [20, 40, 0], shR: [20, 40, 0], elL: 100, elR: 100 }), P({ sp: -10, shL: [20, 40, 0], shR: [20, 40, 0], elL: 100, elR: 100 }), P({ spS: 12, shL: [20, 40, 0], shR: [20, 40, 0], elL: 100, elR: 100 })], { dur: 2.4, seq: true, view: 20 });
  def('joint_circles', [P({ hpL: [20, 4, 0], knL: 10, akL: 30, shL: [60, 10, 0], shR: [60, 10, 0], elL: 80, elR: 80 }), P({ hpL: [20, 4, 0], knL: 10, akL: -20, shL: [60, 10, 30], shR: [60, 10, 30], elL: 80, elR: 80 })], { dur: 1.4, alt: true, view: 45 });
  def('squat_open', [P({ shL: [0, 10, 0], shR: [0, 10, 0] }), P({ ...squatLow(0.8, 'none'), shL: [80, 90, 0], shR: [80, 90, 0] })], { dur: 3, view: 20 });

  // ---------- Pompes / gainage (à plat ventre) ----------
  def('pushup', [plankHigh, plankLow], { dur: 2.4, view: 85 });
  def('pushup_knees', [P({ ...plankHigh, pitch: 58, shL: [62, 8, 0], shR: [62, 8, 0], knL: 90, knR: 90, akL: 60, akR: 60 }), P({ ...plankLow, pitch: 74, knL: 90, knR: 90, akL: 60, akR: 60 })], { dur: 2.4, view: 85 });
  def('pushup_wall', [P({ pitch: 22, flat: true, akL: 20, akR: 20, shL: [112, 10, 0], shR: [112, 10, 0] }), P({ pitch: 34, flat: true, akL: 30, akR: 30, shL: [75, 30, 0], shR: [75, 30, 0], elL: 95, elR: 95 })], { dur: 2.4, view: 85 });
  def('pushup_incline', [P({ pitch: 48, flat: false, akL: -5, akR: -5, shL: [100, 8, 0], shR: [100, 8, 0] }), P({ pitch: 62, flat: false, akL: -5, akR: -5, shL: [55, 28, 0], shR: [55, 28, 0], elL: 95, elR: 95 })], { dur: 2.4, view: 85 });
  def('pike', [P({ pitch: 125, flat: false, hpL: [100, 5, 0], hpR: [100, 5, 0], shL: [165, 10, 0], shR: [165, 10, 0], akL: -15, akR: -15, nk: 20 }), P({ pitch: 140, flat: false, hpL: [110, 5, 0], hpR: [110, 5, 0], shL: [120, 25, 0], shR: [120, 25, 0], elL: 85, elR: 85, akL: -15, akR: -15, nk: 20 })], { dur: 2.6, view: 85 });
  def('dips', [P({ ...seated, pitch: 5, shL: [-40, 10, 0], shR: [-40, 10, 0], hpL: [80, 5, 0], hpR: [80, 5, 0], knL: 85, knR: 85, akL: 0, akR: 0 }), P({ ...seated, pitch: 5, shL: [-70, 10, 0], shR: [-70, 10, 0], elL: 85, elR: 85, hpL: [95, 5, 0], hpR: [95, 5, 0], knL: 80, knR: 80, akL: 0, akR: 0 })], { dur: 2.4, view: 80 });
  def('plank', [forearmPlank, P({ ...forearmPlank, ch: 2 })], { dur: 3, hold: true, view: 85 });
  def('plank_knees', [P({ ...forearmPlank, pitch: 68, shL: [68, 10, 0], shR: [68, 10, 0], knL: 90, knR: 90, akL: 60, akR: 60 }), P({ ...forearmPlank, pitch: 68, shL: [68, 10, 0], shR: [68, 10, 0], knL: 90, knR: 90, akL: 60, akR: 60, ch: 2 })], { dur: 3, hold: true, view: 85 });
  def('side_plank', [P({ roll: 68, flat: false, shR: [0, 70, 0], elR: 95, shL: [0, 10, 0], akL: 20, akR: 20 }), P({ roll: 68, flat: false, shR: [0, 70, 0], elR: 95, shL: [0, 160, 0], akL: 20, akR: 20 })], { dur: 3, hold: true, view: 5 });
  def('mountain_climber', [P({ ...plankHigh, hpL: [95, 6, 0], knL: 110 }), plankHigh], { dur: 0.6, alt: true, view: 85 });
  def('burpee', [STAND, P({ ...squatLow(1.05, 'none'), sp: 55, shL: [70, 8, 0], shR: [70, 8, 0] }), plankHigh, P({ ...squatLow(1.05, 'none'), sp: 55, shL: [70, 8, 0], shR: [70, 8, 0] }), P({ lift: 0.25, flat: false, akL: 30, akR: 30, shL: [165, 15, 0], shR: [165, 15, 0] }), STAND], { dur: 3.2, seq: true, view: 80 });
  def('burpee_soft', [STAND, P({ ...squatLow(1.05, 'none'), sp: 55, shL: [70, 8, 0], shR: [70, 8, 0] }), plankHigh, plankHigh, P({ ...squatLow(1.05, 'none'), sp: 55, shL: [70, 8, 0], shR: [70, 8, 0] }), STAND], { dur: 4, seq: true, view: 80 });
  def('superman', [prone, P({ ...prone, sp: -18, ch: -10, nk: -10, hpL: [-18, 6, 0], hpR: [-18, 6, 0] })], { dur: 2.4, view: 85 });
  def('ytw', [P({ ...prone, sp: -8, shL: [140, 40, 0], shR: [140, 40, 0] }), P({ ...prone, sp: -8, shL: [90, 90, 0], shR: [90, 90, 0] }), P({ ...prone, sp: -8, shL: [40, 60, 0], shR: [40, 60, 0], elL: 90, elR: 90 }), P({ ...prone, sp: -8, shL: [140, 40, 0], shR: [140, 40, 0] })], { dur: 3.6, seq: true, view: 20 });

  // ---------- Quatre pattes ----------
  def('cat_cow', [P({ ...quad, sp: 18, ch: 15, nk: 25 }), P({ ...quad, sp: -15, ch: -15, nk: -25 })], { dur: 3, view: 85 });
  def('bird_dog', [quad, P({ ...quad, shL: [175, 6, 0], hpR: [-5, 6, 0], knR: 0, akR: 30 })], { dur: 2.6, alt: true, view: 80 });
  def('donkey_kick', [quad, P({ ...quad, hpL: [-15, 6, 0], knL: 90 })], { dur: 2, alt: true, view: 85 });
  def('thoracic_rot', [P({ ...quad, shL: [92, -28, 0], shR: [90, -20, 0], chT: -22, nkT: -15 }), P({ ...quad, shL: [90, 115, 0], shR: [90, 55, 0], chT: 62, nkT: 35 })], { dur: 3, alt: true, view: 10 });
  def('child_pose', [P({ pitch: 100, flat: false, hpL: [158, 10, 0], hpR: [158, 10, 0], knL: 150, knR: 150, akL: 90, akR: 90, shL: [178, 15, 0], shR: [178, 15, 0], nk: 15 }), P({ pitch: 97, flat: false, hpL: [155, 10, 0], hpR: [155, 10, 0], knL: 150, knR: 150, akL: 90, akR: 90, shL: [176, 15, 0], shR: [176, 15, 0], nk: 15, ch: 3 })], { dur: 3.5, hold: true, view: 85 });

  // ---------- Sur le dos ----------
  def('bridge', [supineKnees, P({ ...supineKnees, pitch: -118, hpL: [-30, 6, 0], hpR: [-30, 6, 0], knL: 95, knR: 95, akL: -25, akR: -25 })], { dur: 2.4, view: 85 });
  def('bridge_single', [P({ ...supineKnees, hpR: [45, 6, 0], knR: 0 }), P({ ...supineKnees, pitch: -115, hpL: [-30, 6, 0], knL: 95, akL: -25, hpR: [0, 6, 0], knR: 0 })], { dur: 2.4, alt: true, view: 85 });
  def('floor_press', [P({ ...supineKnees, shL: [30, 70, 0], shR: [30, 70, 0], elL: 90, elR: 90 }), P({ ...supineKnees, shL: [90, 12, 0], shR: [90, 12, 0], elL: 0, elR: 0 })], { dur: 2.2, view: 60 });
  def('dead_bug', [P({ ...supine, hpL: [90, 6, 0], hpR: [90, 6, 0], knL: 90, knR: 90, shL: [90, 8, 0], shR: [90, 8, 0], akL: 0, akR: 0 }), P({ ...supine, hpL: [90, 6, 0], knL: 90, hpR: [15, 6, 0], knR: 0, shL: [175, 8, 0], shR: [90, 8, 0], akL: 0, akR: 20 })], { dur: 2.6, alt: true, view: 70 });
  def('crunch', [P({ ...supineKnees, shL: [150, 60, 0], shR: [150, 60, 0], elL: 145, elR: 145 }), P({ ...supineKnees, sp: 22, ch: 15, nk: 10, shL: [150, 60, 0], shR: [150, 60, 0], elL: 145, elR: 145 })], { dur: 2, view: 85 });
  def('leg_raise', [P({ ...supine, hpL: [10, 4, 0], hpR: [10, 4, 0] }), P({ ...supine, hpL: [88, 4, 0], hpR: [88, 4, 0] })], { dur: 2.6, view: 85 });
  def('hollow', [P({ ...supine, sp: 14, ch: 10, nk: 12, hpL: [28, 4, 0], hpR: [28, 4, 0], shL: [160, 10, 0], shR: [160, 10, 0], akL: 30, akR: 30 }), P({ ...supine, sp: 15, ch: 11, nk: 12, hpL: [30, 4, 0], hpR: [30, 4, 0], shL: [158, 10, 0], shR: [158, 10, 0], akL: 30, akR: 30 })], { dur: 2.5, hold: true, view: 85 });
  def('russian_twist', [P({ ...seated, pitch: -40, hpL: [95, 8, 0], hpR: [95, 8, 0], knL: 90, knR: 90, chT: 40, nkT: 20, shL: [45, 12, 0], shR: [45, 12, 0], elL: 35, elR: 35 }), P({ ...seated, pitch: -40, hpL: [95, 8, 0], hpR: [95, 8, 0], knL: 90, knR: 90, chT: -40, nkT: -20, shL: [45, 12, 0], shR: [45, 12, 0], elL: 35, elR: 35 })], { dur: 1.6, view: 80 });
  def('knees_chest', [P({ ...supine, hpL: [125, 10, 0], hpR: [125, 10, 0], knL: 130, knR: 130, shL: [70, 15, 0], shR: [70, 15, 0], elL: 60, elR: 60, roll: 8 }), P({ ...supine, hpL: [125, 10, 0], hpR: [125, 10, 0], knL: 130, knR: 130, shL: [70, 15, 0], shR: [70, 15, 0], elL: 60, elR: 60, roll: -8 })], { dur: 2.6, view: 85 });
  def('supine_twist', [P({ ...supine, hpL: [88, 55, 0], hpR: [88, -50, 0], knL: 90, knR: 90, shL: [0, 88, 0], shR: [0, 88, 0], nkT: -30, akL: 0, akR: 0 }), P({ ...supine, hpL: [90, 58, 0], hpR: [90, -53, 0], knL: 92, knR: 92, shL: [0, 88, 0], shR: [0, 88, 0], nkT: -30, akL: 0, akR: 0 })], { dur: 3.5, hold: true, alt: true, view: 20 });
  def('figure4', [P({ ...supineKnees, hpR: [80, 6, 0], knR: 90, hpL: [80, 45, 60], knL: 90, shL: [60, 15, 0], shR: [60, 15, 0], elL: 60, elR: 60 }), P({ ...supineKnees, hpR: [90, 6, 0], knR: 90, hpL: [90, 45, 60], knL: 90, shL: [62, 15, 0], shR: [62, 15, 0], elL: 60, elR: 60 })], { dur: 3, hold: true, alt: true, view: 50 });
  def('breathing', [P({ ...supineKnees, shL: [20, 20, 0], shR: [20, 20, 0], elL: 80, elR: 80 }), P({ ...supineKnees, ch: -4, shL: [20, 20, 0], shR: [20, 20, 0], elL: 80, elR: 80 })], { dur: 4.5, view: 60 });

  // ---------- Allongé sur le côté ----------
  def('side_leg_raise', [sideLying, P({ ...sideLying, hpL: [10, 40, 0] })], { dur: 2.2, view: 0 });
  def('clamshell', [P({ ...sideLying, hpL: [45, 0, 0], hpR: [45, 0, 0], knL: 90, knR: 90 }), P({ ...sideLying, hpL: [45, 35, 0], hpR: [45, 0, 0], knL: 90, knR: 90 })], { dur: 2.2, view: 0 });

  // ---------- Assis / étirements ----------
  def('seated_fold', [P({ ...seated, sp: 10, shL: [60, 8, 0], shR: [60, 8, 0] }), P({ ...seated, sp: 40, ch: 15, shL: [70, 8, 0], shR: [70, 8, 0], akL: 0, akR: 0 })], { dur: 4, view: 85 });
  def('quad_stretch', [P({ hpL: [-8, 4, 0], knL: 150, shL: [-40, 15, 0], elL: 20, shR: [80, 30, 0], elR: 10 }), P({ hpL: [-10, 4, 0], knL: 152, shL: [-42, 15, 0], elL: 20, shR: [80, 30, 0], elR: 10, ch: 2 })], { dur: 3.5, hold: true, alt: true, view: 75 });
  def('calf_stretch', [P({ pitch: 15, hpL: [35, 4, 0], knL: 30, hpR: [-18, 4, 0], shL: [110, 15, 0], shR: [110, 15, 0], elL: 20, elR: 20 }), P({ pitch: 18, hpL: [38, 4, 0], knL: 34, hpR: [-20, 4, 0], shL: [110, 15, 0], shR: [110, 15, 0], elL: 22, elR: 22 })], { dur: 3.5, hold: true, alt: true, view: 75 });
  def('chest_stretch', [P({ shL: [0, 90, 0], elL: 90, chT: 0 }), P({ shL: [-10, 90, 0], elL: 90, chT: -25 })], { dur: 3.5, hold: true, alt: true, view: 20 });
  def('neck_stretch', [P({ nkS: 25, shR: [20, 60, 0], elR: 140 }), P({ nkS: 30, shR: [20, 62, 0], elR: 140 })], { dur: 3.5, hold: true, alt: true, view: 0 });

  // ---------- Machines ----------
  def('bike', [P({ ...seated, lift: 0.35, pitch: 20, hpL: [95, 6, 0], knL: 110, hpR: [45, 6, 0], knR: 45, shL: [65, 10, 0], shR: [65, 10, 0], elL: 25, elR: 25, akL: 0, akR: 10 }), P({ ...seated, lift: 0.35, pitch: 20, hpL: [45, 6, 0], knL: 45, hpR: [95, 6, 0], knR: 110, shL: [65, 10, 0], shR: [65, 10, 0], elL: 25, elR: 25, akL: 10, akR: 0 })], { dur: 0.9, view: 75 });
  def('rower', [P({ ...seated, pitch: 25, hpL: [125, 8, 0], hpR: [125, 8, 0], knL: 125, knR: 125, shL: [80, 10, 0], shR: [80, 10, 0], akL: -20, akR: -20 }), P({ ...seated, pitch: -20, hpL: [75, 8, 0], hpR: [75, 8, 0], knL: 5, knR: 5, shL: [10, 15, 0], shR: [10, 15, 0], elL: 110, elR: 110, akL: 20, akR: 20 })], { dur: 2.2, view: 85 });

  // ---------- Exercice → mouvement ----------
  const MAP = {
    marche_genoux: 'march', jumping_jacks: 'jumping_jack', jumping_jacks_c: 'jumping_jack', step_touch: 'step_touch', talons_fesses: 'butt_kicks',
    moulinets: 'arm_circles', cercles_hanches: 'hip_circles', chat_vache: 'cat_cow', rotation_thoracique: 'thoracic_rot', fente_rotation: 'lunge_rot',
    good_morning_pdc: 'good_morning', cercles_articulations: 'joint_circles', squat_ouverture: 'squat_open',
    etir_ischios: 'seated_fold', etir_quadri: 'quad_stretch', etir_fessiers: 'figure4', posture_enfant: 'child_pose', etir_pectoraux: 'chest_stretch',
    etir_mollets: 'calf_stretch', genoux_poitrine: 'knees_chest', torsion_allongee: 'supine_twist', etir_nuque: 'neck_stretch', respiration: 'breathing',
    squat_pdc: 'squat', squat_chaise: 'squat_box', squat_gobelet: 'squat_goblet', squat_elastique: 'squat', chaise_murale: 'wall_sit', squat_sumo: 'squat_sumo',
    squat_saute: 'squat_jump', squat_pause: 'squat_pause',
    pont_fessier: 'bridge', pont_1j: 'bridge_single', sdt_halteres: 'hinge', swing_kb: 'swing', good_morning_el: 'good_morning', hip_thrust: 'bridge',
    fente_arriere: 'lunge', fente_avant: 'lunge', fente_laterale: 'lunge_side', step_up: 'step_up', squat_bulgare: 'lunge', fente_halteres: 'lunge', fente_sautee: 'lunge_jump',
    monster_walk: 'monster_walk', abduction_allongee: 'side_leg_raise', donkey_kick: 'donkey_kick', clamshell: 'clamshell', mollets: 'calf_raise',
    pompes_mur: 'pushup_wall', pompes_inclinees: 'pushup_incline', pompes_genoux: 'pushup_knees', pompes: 'pushup', dev_couche: 'floor_press',
    dev_elastique: 'chest_press_stand', pompes_declinees: 'pushup', dips_chaise: 'dips',
    dev_epaules: 'press_overhead', dev_epaules_el: 'press_overhead', pike: 'pike', elev_laterales: 'lateral_raise',
    rowing_haltere: 'row_one_arm', rowing_elastique: 'row_band', face_pull: 'face_pull', rowing_penche: 'row_bent',
    tractions: 'pullup', tractions_neg: 'pullup', suspension: 'hang', tirage_vertical_el: 'pulldown', superman: 'superman', ytw: 'ytw',
    curl: 'curl', triceps: 'triceps', dips_banc: 'dips',
    planche: 'plank', planche_genoux: 'plank_knees', planche_laterale: 'side_plank', dead_bug: 'dead_bug', bird_dog: 'bird_dog', crunch: 'crunch',
    releve_jambes: 'leg_raise', hollow: 'hollow', russian_twist: 'russian_twist', mountain_climbers: 'mountain_climber', pallof: 'pallof',
    burpees: 'burpee', burpees_doux: 'burpee_soft', patineur: 'skater', montees_genoux: 'high_knees', boxe: 'boxing', pas_chasses: 'shuffle',
    genoux_coudes: 'knee_elbow', corde: 'jump_rope', swing_cardio: 'swing',
  };
  const PREFIX = [[/^velo/, 'bike'], [/^rameur/, 'rower'], [/^tapis_course/, 'run'], [/^run_(walk|cool)$/, 'walk'], [/^run_/, 'run']];
  function moveFor(id) {
    if (MAP[id]) return MAP[id];
    for (const [re, m] of PREFIX) if (re.test(id || '')) return m;
    return 'idle';
  }

  // ---------- Interpolation ----------
  const KEYS = ['pitch', 'roll', 'yaw', 'lift', 'dx', 'dz', 'sp', 'spS', 'spT', 'ch', 'chT', 'nk', 'nkS', 'nkT', 'elL', 'elR', 'knL', 'knR', 'akL', 'akR'];
  const VKEYS = ['shL', 'shR', 'hpL', 'hpR'];
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * x);
  function lerpPose(a, b, k) {
    const o = { flat: k < 0.5 ? a.flat : b.flat };
    for (const key of KEYS) { const va = a[key] || 0, vb = b[key] || 0; if (va || vb) o[key] = va + (vb - va) * k; }
    for (const key of VKEYS) {
      const va = a[key] || [0, 0, 0], vb = b[key] || [0, 0, 0];
      o[key] = [0, 1, 2].map(i => (va[i] || 0) + ((vb[i] || 0) - (va[i] || 0)) * k);
    }
    return o;
  }
  // Posture à l'instant t (secondes) ; alt : côté inversé un cycle sur deux
  function poseAt(name, t, speed = 1) {
    const m = M[name] || M.idle;
    t = Math.max(0, Number(t) || 0);
    const dur = m.dur / (speed > 0 ? speed : 1);
    const cycle = Math.floor(t / dur);
    const f = (t % dur) / dur;
    let pose;
    if (m.seq) {
      const n = m.poses.length - 1;
      const x = f * n, i = Math.min(n - 1, Math.floor(x));
      pose = lerpPose(m.poses[i], m.poses[i + 1], ease(x - i));
    } else {
      // aller-retour : 0 → 1 → 0 sur un cycle
      pose = lerpPose(m.poses[0], m.poses[1], ease(f < 0.5 ? f * 2 : 2 - f * 2));
    }
    return m.alt && cycle % 2 ? mirror(pose) : pose;
  }

  return { MOVES: M, MAP, moveFor, poseAt, mirror, lerpPose };
});
