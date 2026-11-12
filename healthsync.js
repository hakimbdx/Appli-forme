/*
 * Lecture du texte copié par le raccourci iOS « Synchro Forme ».
 * Format : FORME;kcal=…;min=…;pas=…;poids=…[;course=…;duree=…]
 * Les valeurs peuvent contenir des unités et des séparateurs français (« 1 234,5 kcal »).
 * Fichier partagé entre l'application et les tests (Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HealthSync = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const raw = (txt, key) => {
    const m = txt.match(new RegExp('(?:^|;)\\s*' + key + '\\s*=\\s*([^;\\n]*)', 'i'));
    return m ? m[1].trim() : null;
  };
  // « 1 234,5 kcal » → 1234.5
  function number(v) {
    if (v == null) return null;
    const s = v.replace(/[\s  ]/g, '').replace(/[^\d,.-]/g, '').replace(',', '.');
    return s === '' || isNaN(Number(s)) ? null : Number(s);
  }
  // Distance en km : « 5,2 km », « 5200 m », « 3,1 mi »
  function distanceKm(v) {
    if (v == null) return null;
    const n = number(v);
    if (n == null) return null;
    if (/\bmi\b|mile/i.test(v)) return n * 1.609;
    if (/(^|[\d\s])m\b|mètre|metre/i.test(v) && !/km/i.test(v)) return n / 1000;
    return n;
  }
  // Durée en minutes : « 32:15 », « 1:05:00 », « 32 min », « 1 h 5 min », « 1920 s », « 32 »
  function durationMin(v) {
    if (v == null || v === '') return null;
    const t = String(v).trim().toLowerCase().replace(',', '.');
    if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
      const p = t.split(':').map(Number);
      return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p[0] + p[1] / 60;
    }
    let total = 0, found = false, m;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*h/))) { total += Number(m[1]) * 60; found = true; }
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:min|mn|m\b)/))) { total += Number(m[1]); found = true; }
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec)/))) { total += Number(m[1]) / 60; found = true; }
    if (found) return total;
    const n = number(t);
    if (n == null) return null;
    return n >= 400 ? n / 60 : n; // grand nombre sans unité : des secondes
  }

  function parse(txt) {
    if (!/FORME/i.test(txt || '')) return null;
    const km = distanceKm(raw(txt, 'course'));
    const runMin = durationMin(raw(txt, 'duree') ?? raw(txt, 'durée'));
    return {
      kcal: number(raw(txt, 'kcal')), min: number(raw(txt, 'min')), pas: number(raw(txt, 'pas')), poids: number(raw(txt, 'poids')),
      run: km > 0.2 && km < 100 && runMin > 2 && runMin < 600 ? { km: Math.round(km * 100) / 100, min: Math.round(runMin * 10) / 10 } : null,
    };
  }

  return { parse, number, distanceKm, durationMin };
});
