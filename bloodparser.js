/*
 * Parseur de bilans sanguins (comptes rendus de laboratoires français).
 * Fichier partagé entre l'application (navigateur) et les outils/tests (Node).
 *
 * Entrée : les lignes de texte d'un PDF (voir itemsToLines pour la reconstruction
 * des lignes à partir de pdf.js). Sortie : date du prélèvement, laboratoire et
 * liste des biomarqueurs reconnus, convertis dans une unité de référence.
 *
 * Pour ajouter un biomarqueur : compléter BIOMARKERS (alias = débuts de ligne
 * possibles, écrits en minuscules sans accents), puis ajouter un cas dans
 * tests/bloodparser.test.cjs.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BloodParser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Dictionnaire des biomarqueurs ----------
  // unit : unité de référence (affichage) ; conv : facteurs vers cette unité
  // (clés = unités normalisées : minuscules, sans accents, µ → u, ² → 2)
  // plaus : bornes plausibles (unité de référence) pour détecter une erreur
  // ref : valeurs usuelles adultes indicatives [bas, haut] (null = pas de borne),
  //       éventuellement par sexe { f: [...], m: [...] }
  const G_L_LIPIDS = { 'g/l': 1, 'mg/dl': 0.01, 'mg/l': 0.001 };
  const CELLS = { 'g/l': 1, 'giga/l': 1, '10^9/l': 1, '10*9/l': 1, '10e9/l': 1, '10^3/mm3': 1, '10^3/ul': 1, '/mm3': 0.001, '/ul': 0.001, 'mm3': 0.001 };
  const UI_L = { 'ui/l': 1, 'u/l': 1 };

  const BIOMARKERS = [
    // Glucides
    { key: 'hba1c', name: 'Hémoglobine glyquée (HbA1c)', cat: 'Glycémie', unit: '%',
      aliases: [/hemoglobine glyquee/, /hb\s?a1c/, /a1c/], conv: { '%': 1, 'mmol/mol': v => v * 0.0915 + 2.15 },
      plaus: [3, 20], ref: [4, 6],
      desc: 'Reflet de la glycémie moyenne sur les 2 à 3 derniers mois.',
      tips: { high: 'Une HbA1c élevée indique un excès de sucre dans le sang sur la durée : à discuter avec votre médecin. Limiter sucres rapides et boissons sucrées, privilégier les fibres et bouger régulièrement aide à la faire baisser.' } },
    { key: 'glucose', name: 'Glycémie à jeun', cat: 'Glycémie', unit: 'g/L',
      aliases: [/glycemie(?: a jeun)?/, /glucose(?: a jeun)?(?: plasmatique| sanguin)?/],
      conv: { 'g/l': 1, 'mmol/l': 0.18016, 'mg/dl': 0.01 }, plaus: [0.3, 6], ref: [0.7, 1.1],
      desc: 'Taux de sucre dans le sang, mesuré à jeun.',
      tips: { high: 'Une glycémie à jeun élevée est à contrôler avec votre médecin. Réduire les sucres rapides, choisir des féculents complets et des légumes à chaque repas, et l\'activité physique aident à la réguler.',
              low: 'Une glycémie basse peut provoquer fatigue et malaises : évitez de sauter des repas.' } },
    // Lipides
    { key: 'ldl', name: 'Cholestérol LDL', cat: 'Lipides', unit: 'g/L',
      aliases: [/cholesterol[- ]ldl(?: calcule| direct| dose)?/, /ldl[- ]?cholesterol(?: calcule| direct)?/, /ldl(?: calcule| direct| dose)?/, /c[- ]ldl/],
      conv: { ...G_L_LIPIDS, 'mmol/l': 0.3867 }, plaus: [0.2, 5], ref: [null, 1.6],
      desc: '« Mauvais » cholestérol, qui peut se déposer dans les artères. L\'objectif dépend de votre risque cardiovasculaire.',
      tips: { high: 'Pour faire baisser le LDL : moins de graisses saturées (charcuterie, fromages, viandes grasses, beurre, viennoiseries), plus de fibres (légumineuses, avoine, fruits et légumes), d\'oléagineux et d\'huiles végétales (olive, colza). À discuter avec votre médecin.' } },
    { key: 'hdl', name: 'Cholestérol HDL', cat: 'Lipides', unit: 'g/L',
      aliases: [/cholesterol[- ]hdl/, /hdl[- ]?cholesterol/, /hdl/, /c[- ]hdl/],
      conv: { ...G_L_LIPIDS, 'mmol/l': 0.3867 }, plaus: [0.1, 3], ref: [0.4, null],
      desc: '« Bon » cholestérol, qui protège les artères.',
      tips: { low: 'L\'activité physique régulière, l\'arrêt du tabac et la perte de poids aident à augmenter le HDL.' } },
    { key: 'chol', name: 'Cholestérol total', cat: 'Lipides', unit: 'g/L',
      aliases: [/cholesterol(?: total)?(?!\s*(?:-\s*)?(?:hdl|ldl|non|\/|ratio))/, /cholesterolemie(?: totale)?/],
      conv: { ...G_L_LIPIDS, 'mmol/l': 0.3867 }, plaus: [0.5, 6], ref: [null, 2],
      desc: 'Somme des différentes formes de cholestérol. Le LDL et le HDL sont plus parlants.',
      tips: { high: 'Moins de graisses saturées et plus de fibres, de légumes et d\'huiles végétales aident à améliorer le cholestérol.' } },
    { key: 'tg', name: 'Triglycérides', cat: 'Lipides', unit: 'g/L',
      aliases: [/triglycerides?/, /triglyceridemie/],
      conv: { ...G_L_LIPIDS, 'mmol/l': 0.885 }, plaus: [0.2, 20], ref: [null, 1.5],
      desc: 'Graisses du sang, très sensibles à l\'alimentation (sucres, alcool).',
      tips: { high: 'Les triglycérides baissent souvent vite en réduisant sucres, boissons sucrées et alcool, et avec l\'activité physique et la perte de poids.' } },
    // Rein
    { key: 'creat', name: 'Créatinine', cat: 'Rein', unit: 'µmol/L',
      aliases: [/creatinine(?: serique| plasmatique| sanguine)?(?!\s*(?:urinaire|clairance))/, /creatininemie/],
      conv: { 'umol/l': 1, 'mg/l': 8.84, 'mg/dl': 88.4 }, plaus: [20, 1500], ref: { f: [45, 90], m: [60, 110] },
      desc: 'Déchet produit par les muscles et éliminé par les reins : reflète le fonctionnement rénal.' },
    { key: 'dfg', name: 'DFG (filtration rénale)', cat: 'Rein', unit: 'mL/min/1,73m²',
      aliases: [/dfg(?: estime)?/, /debit de filtration glomerulaire(?: estime)?/, /estimation du dfg/],
      conv: { 'ml/min/1,73m2': 1, 'ml/min': 1 }, plaus: [3, 200], ref: [60, null],
      desc: 'Estimation de la capacité de filtration des reins (normal ≥ 90, acceptable ≥ 60).' },
    { key: 'uree', name: 'Urée', cat: 'Rein', unit: 'g/L',
      aliases: [/uree(?: sanguine| plasmatique)?/, /azotemie/],
      conv: { 'g/l': 1, 'mmol/l': 0.06006 }, plaus: [0.05, 3], ref: [0.15, 0.45],
      desc: 'Déchet issu des protéines, éliminé par les reins.' },
    { key: 'uric', name: 'Acide urique', cat: 'Rein', unit: 'mg/L',
      aliases: [/acide urique/, /uricemie/],
      conv: { 'mg/l': 1, 'umol/l': 0.1681, 'mg/dl': 10 }, plaus: [10, 150], ref: { f: [25, 60], m: [35, 70] },
      desc: 'Un excès peut provoquer la goutte.',
      tips: { high: 'Limiter alcool (surtout bière), sodas et jus sucrés, abats et charcuterie ; bien s\'hydrater.' } },
    // Foie
    { key: 'asat', name: 'ASAT (TGO)', cat: 'Foie', unit: 'UI/L',
      aliases: [/(?:transaminases?\s*)?(?:asat|tgo|sgot)/, /aspartate amino ?transferase/],
      conv: UI_L, plaus: [3, 5000], ref: [null, 35], desc: 'Enzyme du foie et des muscles.' },
    { key: 'alat', name: 'ALAT (TGP)', cat: 'Foie', unit: 'UI/L',
      aliases: [/(?:transaminases?\s*)?(?:alat|tgp|sgpt)/, /alanine amino ?transferase/],
      conv: UI_L, plaus: [3, 5000], ref: { f: [null, 35], m: [null, 45] },
      desc: 'Enzyme du foie, augmente notamment en cas de foie gras (stéatose).',
      tips: { high: 'Une ALAT élevée peut être liée au surpoids, à l\'alcool ou à certains médicaments : à discuter avec votre médecin. La perte de poids et la réduction de l\'alcool et des sucres l\'améliorent souvent.' } },
    { key: 'ggt', name: 'Gamma-GT', cat: 'Foie', unit: 'UI/L',
      aliases: [/gamma[- ]?(?:gt|glutamyl[- ]?trans(?:ferase|peptidase))/, /ggt/, /γ[- ]?gt/],
      conv: UI_L, plaus: [3, 5000], ref: { f: [null, 38], m: [null, 55] },
      desc: 'Enzyme du foie, sensible à l\'alcool et à certains médicaments.',
      tips: { high: 'Les Gamma-GT sont souvent sensibles à l\'alcool : à discuter avec votre médecin.' } },
    { key: 'pal', name: 'Phosphatases alcalines', cat: 'Foie', unit: 'UI/L',
      aliases: [/phosphatases? alcalines?/, /pal/], conv: UI_L, plaus: [5, 3000], ref: [35, 105],
      desc: 'Enzymes du foie et des os.' },
    { key: 'bili', name: 'Bilirubine totale', cat: 'Foie', unit: 'µmol/L',
      aliases: [/bilirubine(?: totale)?(?!\s*(?:conjuguee|libre|directe|indirecte|non))/],
      conv: { 'umol/l': 1, 'mg/l': 1.71, 'mg/dl': 17.1 }, plaus: [1, 600], ref: [null, 21],
      desc: 'Pigment issu de la dégradation des globules rouges, éliminé par le foie.' },
    // Inflammation
    { key: 'crp', name: 'CRP', cat: 'Inflammation', unit: 'mg/L',
      aliases: [/crp(?: ultra[- ]?sensible| us| hs)?/, /proteine c[- ]reactive(?: ultra[- ]?sensible)?/],
      conv: { 'mg/l': 1, 'mg/dl': 10 }, plaus: [0, 500], ref: [null, 5],
      desc: 'Marqueur d\'inflammation ou d\'infection.' },
    // Fer
    { key: 'ferritine', name: 'Ferritine', cat: 'Fer et vitamines', unit: 'µg/L',
      aliases: [/ferritine(?:mie)?/], conv: { 'ug/l': 1, 'ng/ml': 1 }, plaus: [1, 5000], ref: { f: [15, 150], m: [30, 400] },
      desc: 'Réserves de fer de l\'organisme.',
      tips: { low: 'Des réserves de fer basses peuvent causer fatigue et essoufflement. Sources de fer : viande rouge, boudin noir, poissons, lentilles, pois chiches, tofu ; associer des aliments riches en vitamine C et éviter le thé ou le café au cours du repas. À discuter avec votre médecin.' } },
    { key: 'fer', name: 'Fer sérique', cat: 'Fer et vitamines', unit: 'µmol/L',
      aliases: [/fer(?: serique| plasmatique)?/, /sideremie/],
      conv: { 'umol/l': 1, 'ug/dl': 0.1791, 'mg/l': 17.91, 'ug/l': 0.01791 }, plaus: [1, 80], ref: { f: [9, 30], m: [11, 32] },
      desc: 'Fer circulant dans le sang (varie beaucoup au cours de la journée).' },
    { key: 'cst', name: 'Saturation de la transferrine', cat: 'Fer et vitamines', unit: '%',
      aliases: [/coefficient de saturation(?: de la transferrine)?(?: en fer)?/, /saturation de la transferrine/, /cst/],
      conv: { '%': 1 }, plaus: [2, 100], ref: [20, 40], desc: 'Part de la transferrine (transporteur du fer) chargée en fer.' },
    { key: 'vitd', name: 'Vitamine D', cat: 'Fer et vitamines', unit: 'ng/mL',
      aliases: [/25[- ]?\(?oh\)?[- ]?(?:vitamine|vit\.?) d(?:2\s*\+?\s*d?3|3)?/, /(?:vitamine|vit\.?) d(?:\s*25[- ]?\(?oh\)?)?(?:2\s*\+?\s*d?3|3)?/, /25[- ]?hydroxy[- ]?(?:vitamine )?d/, /25[- ]?oh[- ]?d/],
      conv: { 'ng/ml': 1, 'ug/l': 1, 'nmol/l': 0.4 }, plaus: [2, 250], ref: [30, 100],
      desc: 'Vitamine produite par la peau au soleil, essentielle aux os et aux muscles.',
      tips: { low: 'Un manque de vitamine D est très fréquent en France, surtout l\'hiver. Sources : poissons gras (sardine, maquereau, saumon), jaune d\'œuf, et exposition au soleil. Votre médecin peut prescrire une supplémentation.' } },
    { key: 'b12', name: 'Vitamine B12', cat: 'Fer et vitamines', unit: 'pg/mL',
      aliases: [/(?:vitamine|vit\.?) b ?12/, /cobalamine/, /b12/],
      conv: { 'pg/ml': 1, 'ng/l': 1, 'pmol/l': 1.355 }, plaus: [30, 3000], ref: [190, 900],
      desc: 'Vitamine des produits animaux, utile aux nerfs et aux globules rouges.',
      tips: { low: 'Sources de B12 : viandes, poissons, œufs, produits laitiers. Point d\'attention en cas d\'alimentation végétalienne.' } },
    { key: 'folates', name: 'Folates (vitamine B9)', cat: 'Fer et vitamines', unit: 'ng/mL',
      aliases: [/folates?(?: seriques?| plasmatiques?)?/, /acide folique/, /(?:vitamine|vit\.?) b ?9/],
      conv: { 'ng/ml': 1, 'ug/l': 1, 'nmol/l': 0.4413 }, plaus: [0.5, 60], ref: [3.9, null],
      desc: 'Vitamine des légumes verts, des légumineuses et du foie.',
      tips: { low: 'Sources de folates : légumes verts à feuilles, légumineuses, agrumes, céréales complètes.' } },
    // Thyroïde
    { key: 'tsh', name: 'TSH', cat: 'Thyroïde', unit: 'mUI/L',
      aliases: [/tsh(?:\s*(?:ultra[- ]?sensible|us|3e? generation))?/, /thyreostimuline/, /thyrotropine/],
      conv: { 'mui/l': 1, 'uui/ml': 1, 'mu/l': 1 }, plaus: [0.001, 150], ref: [0.4, 4],
      desc: 'Hormone qui pilote la thyroïde : élevée si la thyroïde fonctionne au ralenti, basse si elle s\'emballe.' },
    { key: 't4l', name: 'T4 libre', cat: 'Thyroïde', unit: 'pmol/L',
      aliases: [/t4\s*l(?:ibre)?/, /ft4/, /thyroxine libre/],
      conv: { 'pmol/l': 1, 'ng/dl': 12.87, 'ng/l': 1.287 }, plaus: [1, 100], ref: [9, 20],
      desc: 'Hormone thyroïdienne.' },
    // Ionogramme
    { key: 'na', name: 'Sodium', cat: 'Ionogramme', unit: 'mmol/L',
      aliases: [/sodium(?: plasmatique| serique)?/, /natremie/], conv: { 'mmol/l': 1, 'meq/l': 1 }, plaus: [100, 180], ref: [136, 145],
      desc: 'Sel du sang, reflète surtout l\'équilibre en eau.' },
    { key: 'k', name: 'Potassium', cat: 'Ionogramme', unit: 'mmol/L',
      aliases: [/potassium(?: plasmatique| serique)?/, /kaliemie/], conv: { 'mmol/l': 1, 'meq/l': 1 }, plaus: [1.5, 9], ref: [3.5, 5],
      desc: 'Minéral important pour le cœur et les muscles.' },
    { key: 'ca', name: 'Calcium', cat: 'Ionogramme', unit: 'mmol/L',
      aliases: [/calcium(?: total| serique| plasmatique)?(?! ionise)/, /calcemie/], conv: { 'mmol/l': 1, 'mg/l': 0.02495, 'mg/dl': 0.2495 }, plaus: [1, 4], ref: [2.2, 2.6],
      desc: 'Minéral des os, des muscles et des nerfs.' },
    { key: 'mg', name: 'Magnésium', cat: 'Ionogramme', unit: 'mmol/L',
      aliases: [/magnesium(?: serique| plasmatique)?/, /magnesemie/], conv: { 'mmol/l': 1, 'mg/l': 0.04114, 'mg/dl': 0.4114 }, plaus: [0.2, 3], ref: [0.7, 1.05],
      desc: 'Minéral utile aux muscles et aux nerfs.',
      tips: { low: 'Sources de magnésium : oléagineux, chocolat noir, légumineuses, céréales complètes, certaines eaux minérales.' } },
    // Numération formule sanguine
    { key: 'hb', name: 'Hémoglobine', cat: 'Numération (NFS)', unit: 'g/dL',
      aliases: [/hemoglobine(?!\s*(?:glyquee|a1c|corpusculaire))/, /hb(?![a-z0-9]|\s*a1c)/],
      conv: { 'g/dl': 1, 'g/100ml': 1, 'g/l': 0.1, 'mmol/l': 1.611 }, plaus: [3, 25], ref: { f: [12, 16], m: [13, 17] },
      desc: 'Protéine des globules rouges qui transporte l\'oxygène. Basse = anémie.',
      tips: { low: 'Une hémoglobine basse (anémie) est à explorer avec votre médecin, souvent avec le bilan du fer.' } },
    { key: 'ht', name: 'Hématocrite', cat: 'Numération (NFS)', unit: '%',
      aliases: [/hematocrite/], conv: { '%': 1, 'l/l': 100 }, plaus: [10, 75], ref: { f: [37, 47], m: [40, 52] },
      desc: 'Part du volume du sang occupée par les globules rouges.' },
    { key: 'gr', name: 'Globules rouges', cat: 'Numération (NFS)', unit: 'T/L',
      aliases: [/hematies/, /globules rouges/, /erythrocytes/],
      conv: { 't/l': 1, 'tera/l': 1, '10^12/l': 1, '10*12/l': 1, '10e12/l': 1, '10^6/mm3': 1, '10^6/ul': 1, 'm/mm3': 1, 'millions/mm3': 1, '/mm3': 1e-6, 'mm3': 1e-6 },
      plaus: [1, 9], ref: { f: [4, 5.2], m: [4.5, 5.9] }, desc: 'Nombre de globules rouges.' },
    { key: 'vgm', name: 'VGM', cat: 'Numération (NFS)', unit: 'fL',
      aliases: [/vgm/, /volume globulaire moyen/], conv: { 'fl': 1, 'u3': 1, 'um3': 1 }, plaus: [50, 140], ref: [80, 100],
      desc: 'Taille moyenne des globules rouges (petite en cas de manque de fer, grande en cas de manque de B12 ou de folates).' },
    { key: 'gb', name: 'Globules blancs', cat: 'Numération (NFS)', unit: 'G/L',
      aliases: [/leucocytes/, /globules blancs/], conv: CELLS, plaus: [0.5, 100], ref: [4, 10],
      desc: 'Cellules de défense contre les infections.' },
    { key: 'plq', name: 'Plaquettes', cat: 'Numération (NFS)', unit: 'G/L',
      aliases: [/plaquettes/, /thrombocytes/], conv: CELLS, plaus: [10, 1500], ref: [150, 400],
      desc: 'Cellules qui permettent la coagulation.' },
  ];

  // Expressions anchrées en début de ligne (puce ou astérisque tolérés)
  for (const b of BIOMARKERS) {
    b.re = new RegExp('^(?:[-*•>]\\s*)?(?:' + b.aliases.map(r => r.source).join('|') + ')(?![a-z])');
  }
  const BY_KEY = Object.fromEntries(BIOMARKERS.map(b => [b.key, b]));

  // ---------- Normalisation ----------
  function norm(s) {
    return String(s)
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[µμ]/g, 'u').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\u00a0\u2007\u202f\t]/g, ' ')
      .replace(/ {2,}/g, '  ') // conserve un double espace (séparateur de colonnes)
      .trim();
  }
  const toNum = s => Number(String(s).replace(/ /g, '').replace(',', '.'));

  const UNITS = [
    'ml/min/1,73 ?m2', 'ml/min/1.73 ?m2', 'ml/min', 'mmol/mol', 'mmol/l', 'umol/l', 'nmol/l', 'pmol/l',
    'mg/dl', 'mg/l', 'ug/dl', 'ug/l', 'ng/ml', 'ng/dl', 'ng/l', 'pg/ml', 'g/100 ?ml', 'g/dl', 'g/l',
    'mui/l', 'uui/ml', 'mu/l', 'ui/l(?: a 37 ?°c)?', 'u/l', 'meq/l', 'tera/l', 'giga/l',
    '10[\\^*e]?12/l', '10[\\^*e]?9/l', '10[\\^*e]?6/mm3', '10[\\^*e]?6/ul', '10[\\^*e]?3/mm3', '10[\\^*e]?3/ul',
    'millions/mm3', 'm/mm3', 't/l', '/mm3', 'mm3', '/ul', 'um3', 'u3', 'fl', 'l/l', '%',
  ];
  const UNIT_RE = new RegExp('^\\s*(' + UNITS.join('|') + ')(?![a-z])');
  function canonUnitKey(u) {
    return u.replace(/\s/g, '').replace('1.73', '1,73').replace(/^10[*e]/, '10^').replace(/a37°c$/, '');
  }

  // Mots qui signalent une phrase de commentaire plutôt qu'un résultat
  const COMMENT_RE = /(?:inferieur|superieur|objectif|recommand|cible|si |en cas|selon|risque|valeur|seuil|interpret|patient|traitement|souhaitable|methode|technique|automate)/;
  const NUM = '\\d+(?:[.,]\\d+)?';
  const VALUE_RE = new RegExp('^((?:\\([^)]*\\)|\\[[^\\]]*\\]|[^\\d<>≤≥(\\[])*?)\\s*(<=|>=|<|>|≤|≥)?\\s*(\\d{1,3}(?: \\d{3})+(?=\\s*(?:/mm3|mm3|/ul))|' + NUM + ')');
  const DATE_RE_G = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g;

  function parseRange(text) {
    const t = text.replace(DATE_RE_G, ' ');
    const cands = [];
    let m;
    if ((m = t.match(new RegExp('(' + NUM + ')\\s*(?:-|\\ba\\b|\\bto\\b)\\s*(' + NUM + ')')))) cands.push({ i: m.index, low: toNum(m[1]), high: toNum(m[2]) });
    if ((m = t.match(new RegExp('(?:<=?|≤|\\binf(?:erieure?s?)?\\.?\\s*(?:ou egale?\\s*)?(?:a\\s*)?)\\s*(' + NUM + ')')))) cands.push({ i: m.index, low: null, high: toNum(m[1]) });
    if ((m = t.match(new RegExp('(?:>=?|≥|\\bsup(?:erieure?s?)?\\.?\\s*(?:ou egale?\\s*)?(?:a\\s*)?)\\s*(' + NUM + ')')))) cands.push({ i: m.index, low: toNum(m[1]), high: null });
    if (!cands.length) return null;
    cands.sort((a, b) => a.i - b.i);
    const r = cands[0];
    if (r.low != null && r.high != null && r.low >= r.high) return null;
    return r;
  }

  // Analyse le texte qui suit le nom du biomarqueur : valeur, unité, valeurs de référence
  function parseMeasure(rest, maxGap = 45) {
    const m = rest.match(VALUE_RE);
    if (!m) return null;
    const gap = m[1];
    if (gap.length > maxGap || COMMENT_RE.test(gap)) return null;
    const value = toNum(m[3]);
    let after = rest.slice(m[0].length);
    after = after.replace(/^\s*(?:\*+|[↑↓]|(?:h|b)(?=\s|$))\s*/, ' ');
    let unit = null;
    const u = after.match(UNIT_RE);
    if (u) { unit = canonUnitKey(u[1]); after = after.slice(u[0].length); }
    return { value, comparator: m[2] || null, unit, range: parseRange(after) };
  }

  const round = v => (v == null ? null : Number(Number(v).toPrecision(4)));
  function applyConv(f, v) { return v == null ? null : typeof f === 'function' ? f(v) : v * f; }
  function refFor(b, sex) {
    if (!b.ref) return [null, null];
    if (Array.isArray(b.ref)) return b.ref;
    if (b.ref[sex]) return b.ref[sex];
    // Sexe inconnu : intervalle le plus large des deux
    const lo = [b.ref.f[0], b.ref.m[0]].filter(x => x != null);
    const hi = [b.ref.f[1], b.ref.m[1]].filter(x => x != null);
    return [lo.length ? Math.min(...lo) : null, hi.length ? Math.max(...hi) : null];
  }
  const plausible = (b, v) => v >= b.plaus[0] && v <= b.plaus[1];

  // Convertit dans l'unité de référence du biomarqueur et signale les doutes
  function normalizeMeasure(b, meas) {
    const flags = [];
    let factor = meas.unit != null ? b.conv[meas.unit] : undefined;
    if (meas.unit == null) {
      if (plausible(b, meas.value)) { factor = 1; flags.push(`unité absente, ${b.unit} supposé`); }
      else {
        const alt = Object.entries(b.conv).find(([, f]) => plausible(b, applyConv(f, meas.value)));
        if (alt) { factor = alt[1]; flags.push(`unité absente, ${alt[0]} supposé`); }
        else { factor = 1; flags.push('unité absente'); }
      }
    } else if (factor === undefined) {
      factor = 1; flags.push(`unité « ${meas.unit} » non reconnue`);
    }
    const value = round(applyConv(factor, meas.value));
    if (!plausible(b, value)) flags.push('valeur inhabituelle, à vérifier');
    let refLow = null, refHigh = null;
    if (meas.range) {
      refLow = round(applyConv(factor, meas.range.low));
      refHigh = round(applyConv(factor, meas.range.high));
      // Une référence sans rapport avec la valeur vient sans doute d'une autre unité ou colonne
      const ok = [refLow, refHigh].filter(x => x != null).every(x =>
        x >= b.plaus[0] / 10 && x <= b.plaus[1] * 10 && (value === 0 || (x / value < 60 && value / Math.max(x, 1e-9) < 60)));
      if (!ok) { refLow = refHigh = null; }
    }
    return { value, refLow, refHigh, flags };
  }

  // ---------- Date et laboratoire ----------
  const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  function toIso(d, m, y) {
    y = Number(y); if (y < 100) y += 2000;
    d = Number(d); m = Number(m);
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1990 && y <= 2100)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function findDate(nlines) {
    const text = nlines.join('\n');
    const num = '(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2,4})';
    const txt = '(\\d{1,2})(?:er)?\\s+(' + MONTHS.join('|') + ')\\s+(\\d{4})';
    const fromTxt = m => toIso(m[1], MONTHS.indexOf(m[2]) + 1, m[3]);
    const patterns = [
      [new RegExp('prel[eè]v(?:e|ement|ee)s?(?: effectue)?(?: le| du)?[^\\d\\n]{0,25}' + num), m => toIso(m[1], m[2], m[3])],
      [new RegExp('prel[eè]v(?:e|ement|ee)s?(?: effectue)?(?: le| du)?[^\\d\\n]{0,25}' + txt), fromTxt],
      [new RegExp('(?:date (?:du |de l\')?(?:examen|dossier|bilan|analyse)s?|dossier du|demande du|enregistre le)[^\\d\\n]{0,15}' + num), m => toIso(m[1], m[2], m[3])],
    ];
    for (const [re, f] of patterns) { const m = text.match(re); if (m) { const d = f(m); if (d) return d; } }
    // Sinon : première date plausible qui n'est pas une date de naissance
    for (const line of nlines) {
      if (/\bne(?:e)?(?:\(e\))? le|naissance|ddn/.test(line)) continue;
      const m = line.match(new RegExp(num)) || line.match(new RegExp(txt));
      if (m) { const d = /^\d+$/.test(m[2]) ? toIso(m[1], m[2], m[3]) : fromTxt(m); if (d && d >= '2000') return d; }
    }
    return null;
  }
  const LAB_RE = /(laboratoire|biogroup|cerballiance|eurofins|synlab|inovie|bioclinic|unilabs|biomnis|cerba|biopath|bio ?7|lbm|labo )/;
  function findLab(lines, nlines) {
    for (let i = 0; i < nlines.length; i++) {
      if (!LAB_RE.test(nlines[i])) continue;
      // Garder seulement la colonne qui contient le nom du laboratoire
      const cols = lines[i].split(/\s{3,}/), ncols = nlines[i].split(/\s{2,}/);
      const j = ncols.findIndex(c => LAB_RE.test(c));
      const name = (cols.length === ncols.length && j >= 0 ? cols[j] : lines[i]).replace(/\s{2,}/g, ' ').trim();
      if (name.length < 90) return name.slice(0, 70);
    }
    return null;
  }

  // ---------- Analyse d'un document ----------
  function matchBiomarker(nline) {
    for (const b of BIOMARKERS) { const m = nline.match(b.re); if (m) return { b, m }; }
    return null;
  }

  function parseLines(lines, opts = {}) {
    const sex = opts.sex || null;
    lines = lines.map(l => String(l)).filter(l => l.trim());
    const nlines = lines.map(norm);
    const found = new Map();
    const unmatched = [];
    for (let i = 0; i < nlines.length; i++) {
      const n = nlines[i];
      const hit = n.length <= 220 && matchBiomarker(n);
      if (!hit) {
        if (/\d/.test(n) && UNIT_RE.test(' ' + (n.match(new RegExp(NUM + '\\s*(.*)')) || [, ''])[1]) && n.length < 160) unmatched.push(lines[i]);
        continue;
      }
      const { b, m } = hit;
      if (found.has(b.key)) continue;
      let meas = parseMeasure(n.slice(m[0].length));
      let raw = lines[i];
      // Valeur parfois sur la ligne suivante (nom sur deux lignes dans un tableau)
      if (!meas && i + 1 < nlines.length && !matchBiomarker(nlines[i + 1])) {
        meas = parseMeasure(nlines[i + 1], 5);
        if (meas) raw += ' ⏎ ' + lines[i + 1];
      }
      if (!meas) continue;
      const nm = normalizeMeasure(b, meas);
      const [dLow, dHigh] = refFor(b, sex);
      const fromLab = nm.refLow != null || nm.refHigh != null;
      found.set(b.key, {
        key: b.key, name: b.name, unit: b.unit, value: nm.value, comparator: meas.comparator,
        refLow: fromLab ? nm.refLow : dLow, refHigh: fromLab ? nm.refHigh : dHigh,
        refSource: fromLab ? 'labo' : 'usuel', flags: nm.flags, raw: raw.replace(/\s{2,}/g, ' ').trim(),
      });
    }
    const results = BIOMARKERS.filter(b => found.has(b.key)).map(b => found.get(b.key));
    return { date: findDate(nlines), lab: findLab(lines, nlines), results, unmatched, lineCount: lines.length };
  }

  // ---------- Reconstruction des lignes à partir de pdf.js ----------
  // pages : tableau (une entrée par page) des items de page.getTextContent()
  function itemsToLines(pages) {
    const out = [];
    for (const items of pages) {
      const its = items
        .filter(it => it.str && it.str.trim())
        .map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 10 }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      for (const it of its) {
        const row = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2, Math.min(r.h, it.h) * 0.45));
        if (row) row.items.push(it); else rows.push({ y: it.y, h: it.h, items: [it] });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        let line = '', end = null;
        for (const it of r.items) {
          if (end != null) {
            const gap = it.x - end;
            if (gap > it.h * 1.2) line += '   ';
            else if (gap > it.h * 0.12 && !/\s$/.test(line) && !/^\s/.test(it.s)) line += ' ';
          }
          line += it.s;
          end = it.x + it.w;
        }
        out.push(line.replace(/\s+$/, ''));
      }
    }
    return out;
  }

  // ---------- Interprétation ----------
  function status(r) {
    if (r.value == null) return 'unknown';
    if (r.refLow != null && r.value < r.refLow) return 'low';
    if (r.refHigh != null && r.value > r.refHigh) return 'high';
    if (r.refLow == null && r.refHigh == null) return 'unknown';
    return 'normal';
  }

  return { BIOMARKERS, BY_KEY, norm, parseLines, parseMeasure, parseRange, itemsToLines, status, refFor, findDate };
});
