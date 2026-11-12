/*
 * Base d'exercices du coach sportif.
 * Chaque exercice : id, nom, famille (pattern), matériel requis, niveau (1-3),
 * impact (sauts), sollicitation des articulations (0 = aucune, 1 = modérée, 2 = forte),
 * mode (répétitions ou durée), exercice unilatéral (par côté) et consigne.
 *
 * Matériel : chaînes séparées par « + » (tout est requis) et « | » (au choix).
 * '' = poids du corps.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SportData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EQUIPMENT = {
    chaise: 'Chaise / marche',
    halteres: 'Haltères',
    kettlebell: 'Kettlebell',
    elastique: 'Élastique',
    barre_traction: 'Barre de traction',
    banc: 'Banc',
    corde: 'Corde à sauter',
    velo: 'Vélo d\'appartement',
    rameur: 'Rameur',
    tapis_course: 'Tapis de course',
  };

  const ZONES = {
    genou: 'Genou', dos: 'Dos (lombaires)', epaule: 'Épaule', poignet: 'Poignet',
    cheville: 'Cheville', hanche: 'Hanche', nuque: 'Nuque',
  };

  const EXERCISES = [];
  // opts : { time: true } exercice en durée, { side: true } par côté
  function ex(id, name, pattern, eq, lvl, impact, stress, opts, cue) {
    EXERCISES.push({ id, name, pattern, eq, lvl, impact: !!impact, stress, time: !!opts.time, side: !!opts.side, cue });
  }
  const T = { time: true }, R = {}, RS = { side: true }, TS = { time: true, side: true };

  // ----- Échauffement / mobilité -----
  ex('marche_genoux', 'Marche dynamique genoux hauts', 'warm', '', 1, 0, {}, T, 'Monte les genoux à hauteur de hanches, balance les bras.');
  ex('jumping_jacks', 'Jumping jacks', 'warm', '', 1, 1, { cheville: 1, genou: 1 }, T, 'Atterris en souplesse sur l\'avant du pied.');
  ex('step_touch', 'Step touch', 'warm', '', 1, 0, {}, T, 'Pas latéral, rapproche le pied, accompagne avec les bras.');
  ex('talons_fesses', 'Talons-fesses', 'warm', '', 1, 1, { genou: 1, cheville: 1 }, T, 'Petits pas rapides, talons vers les fessiers.');
  ex('moulinets', 'Moulinets de bras', 'warm', '', 1, 0, { epaule: 1 }, T, 'Grands cercles lents, vers l\'avant puis l\'arrière.');
  ex('cercles_hanches', 'Cercles de hanches', 'warm', '', 1, 0, {}, T, 'Mains sur les hanches, grands cercles dans les deux sens.');
  ex('chat_vache', 'Chat-vache', 'warm', '', 1, 0, { poignet: 1 }, T, 'À 4 pattes, enroule puis creuse le dos en suivant ta respiration.');
  ex('rotation_thoracique', 'Rotations du buste à 4 pattes', 'warm', '', 1, 0, { poignet: 1 }, TS, 'Passe le bras sous ton corps, puis ouvre-le vers le plafond en suivant ta main du regard.');
  ex('fente_rotation', 'Fente avec rotation du buste', 'warm', '', 2, 0, { genou: 1, hanche: 1 }, TS, 'Grande fente, coude vers le sol puis bras vers le ciel.');
  ex('good_morning_pdc', 'Good morning au poids du corps', 'warm', '', 1, 0, { dos: 1 }, T, 'Mains derrière la tête, bascule le buste dos plat, genoux souples.');
  ex('cercles_articulations', 'Cercles de chevilles et poignets', 'warm', '', 1, 0, {}, T, 'Petits cercles dans les deux sens.');
  ex('squat_ouverture', 'Squat lent avec ouverture des bras', 'warm', '', 1, 0, { genou: 1 }, T, 'Descends doucement, ouvre les bras en remontant.');

  // ----- Retour au calme / étirements -----
  ex('etir_ischios', 'Étirement arrière des cuisses', 'stretch', '', 1, 0, { dos: 1 }, TS, 'Assise, jambe tendue, penche-toi dos droit. Respire.');
  ex('etir_quadri', 'Étirement avant de la cuisse', 'stretch', '', 1, 0, { genou: 1 }, TS, 'Debout, attrape ton pied, genoux serrés. Tiens un appui si besoin.');
  ex('etir_fessiers', 'Étirement des fessiers (figure 4)', 'stretch', '', 1, 0, { hanche: 1 }, TS, 'Allongée, cheville sur le genou opposé, tire la cuisse vers toi.');
  ex('posture_enfant', 'Posture de l\'enfant', 'stretch', '', 1, 0, { genou: 1 }, T, 'Fesses vers les talons, bras devant, relâche le dos.');
  ex('etir_pectoraux', 'Étirement des pectoraux au mur', 'stretch', '', 1, 0, { epaule: 1 }, TS, 'Avant-bras contre le mur, tourne doucement le buste.');
  ex('etir_mollets', 'Étirement des mollets au mur', 'stretch', '', 1, 0, { cheville: 1 }, TS, 'Jambe arrière tendue, talon au sol.');
  ex('genoux_poitrine', 'Genoux à la poitrine allongée', 'stretch', '', 1, 0, {}, T, 'Balance doucement de droite à gauche pour masser le bas du dos.');
  ex('torsion_allongee', 'Torsion allongée', 'stretch', '', 1, 0, {}, TS, 'Genoux d\'un côté, regard de l\'autre, épaules au sol.');
  ex('etir_nuque', 'Étirement doux de la nuque', 'stretch', '', 1, 0, { nuque: 1 }, TS, 'Incline l\'oreille vers l\'épaule, sans forcer.');
  ex('respiration', 'Respiration ventrale', 'stretch', '', 1, 0, {}, T, 'Allongée, inspire en gonflant le ventre, expire lentement.');

  // ----- Squat -----
  ex('squat_pdc', 'Squat', 'squat', '', 1, 0, { genou: 1, hanche: 1 }, R, 'Pieds largeur d\'épaules, fesses en arrière, dos droit.');
  ex('squat_chaise', 'Assis-debout sur une chaise', 'squat', 'chaise', 1, 0, { genou: 1 }, R, 'Effleure la chaise avec les fesses et remonte sans élan.');
  ex('squat_gobelet', 'Squat gobelet', 'squat', 'halteres|kettlebell', 1, 0, { genou: 1, hanche: 1 }, R, 'Charge contre la poitrine, coudes entre les genoux en bas.');
  ex('squat_elastique', 'Squat avec élastique', 'squat', 'elastique', 1, 0, { genou: 1 }, R, 'Élastique sous les pieds, mains aux épaules.');
  ex('chaise_murale', 'Chaise contre le mur', 'squat', '', 1, 0, { genou: 2 }, T, 'Dos au mur, cuisses parallèles au sol si possible.');
  ex('squat_sumo', 'Squat sumo', 'squat', '', 1, 0, { genou: 1, hanche: 1 }, R, 'Pieds écartés, pointes vers l\'extérieur, genoux dans l\'axe.');
  ex('squat_saute', 'Squat sauté', 'squat', '', 2, 1, { genou: 2, cheville: 2 }, R, 'Explose vers le haut, réception amortie.');
  ex('squat_pause', 'Squat avec pause en bas', 'squat', '', 2, 0, { genou: 2, hanche: 1 }, R, 'Tiens 2 secondes en bas, remonte fort.');

  // ----- Charnière de hanche -----
  ex('pont_fessier', 'Pont fessier', 'hinge', '', 1, 0, {}, R, 'Allongée, pousse dans les talons, serre les fessiers en haut.');
  ex('pont_1j', 'Pont fessier sur une jambe', 'hinge', '', 2, 0, { hanche: 1 }, RS, 'Bassin bien horizontal pendant toute la montée.');
  ex('sdt_halteres', 'Soulevé de terre jambes tendues', 'hinge', 'halteres|kettlebell', 2, 0, { dos: 2 }, R, 'Dos plat, la charge glisse le long des cuisses.');
  ex('swing_kb', 'Swing kettlebell', 'hinge', 'kettlebell', 2, 0, { dos: 2, hanche: 1 }, R, 'L\'élan vient des hanches, pas des bras.');
  ex('good_morning_el', 'Good morning avec élastique', 'hinge', 'elastique', 1, 0, { dos: 1 }, R, 'Élastique sous les pieds et derrière la nuque, dos plat.');
  ex('hip_thrust', 'Hip thrust sur banc ou canapé', 'hinge', 'banc|chaise', 2, 0, {}, R, 'Haut du dos sur le support, monte le bassin, menton rentré.');

  // ----- Fentes -----
  ex('fente_arriere', 'Fente arrière', 'lunge', '', 1, 0, { genou: 1, hanche: 1 }, RS, 'Grand pas en arrière, genou avant au-dessus de la cheville.');
  ex('fente_avant', 'Fente avant', 'lunge', '', 2, 0, { genou: 2 }, RS, 'Buste droit, pousse dans le talon avant pour revenir.');
  ex('fente_laterale', 'Fente latérale', 'lunge', '', 2, 0, { genou: 1, hanche: 1 }, RS, 'Fesses en arrière sur la jambe fléchie, l\'autre reste tendue.');
  ex('step_up', 'Montée sur marche ou chaise', 'lunge', 'chaise', 1, 0, { genou: 1 }, RS, 'Pousse dans le pied posé en haut, sans élan.');
  ex('squat_bulgare', 'Squat bulgare', 'lunge', 'chaise', 2, 0, { genou: 2, hanche: 1 }, RS, 'Pied arrière sur la chaise, descends à la verticale.');
  ex('fente_halteres', 'Fente arrière avec haltères', 'lunge', 'halteres', 2, 0, { genou: 1, hanche: 1 }, RS, 'Haltères le long du corps, buste droit.');
  ex('fente_sautee', 'Fentes sautées', 'lunge', '', 3, 1, { genou: 2, cheville: 2 }, R, 'Change de jambe en l\'air, réception amortie.');

  // ----- Fessiers / mollets -----
  ex('monster_walk', 'Pas latéraux avec élastique', 'glutes', 'elastique', 1, 0, {}, T, 'Élastique aux genoux, légèrement fléchie, petits pas.');
  ex('abduction_allongee', 'Élévations latérales de jambe allongée', 'glutes', '', 1, 0, {}, RS, 'Sur le côté, monte la jambe tendue, pointe de pied vers l\'avant.');
  ex('donkey_kick', 'Donkey kick à 4 pattes', 'glutes', '', 1, 0, { poignet: 1 }, RS, 'Genou plié à 90°, pousse le talon vers le plafond.');
  ex('clamshell', 'Ouverture de genoux allongée (clamshell)', 'glutes', '', 1, 0, {}, RS, 'Sur le côté, pieds joints, ouvre le genou sans bouger le bassin.');
  ex('mollets', 'Montées sur pointes', 'calves', '', 1, 0, { cheville: 1 }, R, 'Monte haut, redescends lentement. Appui au mur si besoin.');

  // ----- Poussée horizontale -----
  ex('pompes_mur', 'Pompes contre le mur', 'push_h', '', 1, 0, { epaule: 1 }, R, 'Corps gainé, poitrine vers le mur.');
  ex('pompes_inclinees', 'Pompes inclinées (mains sur une chaise)', 'push_h', 'chaise', 1, 0, { poignet: 1, epaule: 1 }, R, 'Chaise calée contre un mur, corps bien aligné.');
  ex('pompes_genoux', 'Pompes sur les genoux', 'push_h', '', 1, 0, { poignet: 1, epaule: 1 }, R, 'Genoux, hanches et épaules alignés.');
  ex('pompes', 'Pompes', 'push_h', '', 2, 0, { poignet: 2, epaule: 1 }, R, 'Coudes à 45°, poitrine près du sol, gainage serré.');
  ex('dev_couche', 'Développé couché haltères (au sol)', 'push_h', 'halteres', 1, 0, { epaule: 1 }, R, 'Allongée, coudes qui touchent le sol en bas, pousse vers le plafond.');
  ex('dev_elastique', 'Développé avec élastique', 'push_h', 'elastique', 1, 0, { epaule: 1 }, R, 'Élastique dans le dos, pousse devant toi.');
  ex('pompes_declinees', 'Pompes pieds surélevés', 'push_h', 'chaise', 3, 0, { poignet: 2, epaule: 2 }, R, 'Pieds sur la chaise, corps gainé.');
  ex('dips_chaise', 'Dips sur chaise', 'push_h', 'chaise', 2, 0, { epaule: 2, poignet: 2 }, R, 'Fesses près de la chaise, coudes vers l\'arrière.');

  // ----- Poussée verticale -----
  ex('dev_epaules', 'Développé épaules haltères', 'push_v', 'halteres', 1, 0, { epaule: 2 }, R, 'Assise ou debout, gainée, pousse au-dessus de la tête.');
  ex('dev_epaules_el', 'Développé épaules à l\'élastique', 'push_v', 'elastique', 1, 0, { epaule: 2 }, R, 'Élastique sous les pieds, pousse vers le haut.');
  ex('pike', 'Pompes piquées (pike)', 'push_v', '', 2, 0, { epaule: 2, poignet: 2 }, R, 'Fesses en l\'air, tête entre les mains.');
  ex('elev_laterales', 'Élévations latérales', 'push_v', 'halteres|elastique', 1, 0, { epaule: 1 }, R, 'Coudes légèrement fléchis, monte jusqu\'à l\'horizontale.');

  // ----- Tirage -----
  ex('rowing_haltere', 'Rowing à un bras', 'pull_h', 'halteres|kettlebell', 1, 0, { dos: 1 }, RS, 'Appui sur une chaise, tire le coude vers la hanche.');
  ex('rowing_elastique', 'Tirage horizontal à l\'élastique', 'pull_h', 'elastique', 1, 0, {}, R, 'Serre les omoplates en fin de mouvement.');
  ex('face_pull', 'Face pull à l\'élastique', 'pull_h', 'elastique', 1, 0, { epaule: 1 }, R, 'Tire vers le visage, coudes hauts.');
  ex('rowing_penche', 'Rowing buste penché deux bras', 'pull_h', 'halteres', 2, 0, { dos: 2 }, R, 'Dos plat, tire les haltères vers le nombril.');
  ex('tractions', 'Tractions', 'pull_v', 'barre_traction', 3, 0, { epaule: 2, poignet: 1 }, R, 'Menton au-dessus de la barre, descente contrôlée.');
  ex('tractions_neg', 'Tractions négatives', 'pull_v', 'barre_traction', 2, 0, { epaule: 2 }, R, 'Pars en haut et descends le plus lentement possible.');
  ex('suspension', 'Suspension à la barre', 'pull_v', 'barre_traction', 1, 0, { epaule: 1, poignet: 1 }, T, 'Épaules actives, ne te laisse pas pendre.');
  ex('tirage_vertical_el', 'Tirage vertical à l\'élastique', 'pull_v', 'elastique', 1, 0, { epaule: 1 }, R, 'Élastique accroché en hauteur, tire vers la poitrine.');
  ex('superman', 'Superman', 'back', '', 1, 0, { dos: 1, nuque: 1 }, R, 'Allongée sur le ventre, décolle bras et jambes, regard au sol.');
  ex('ytw', 'Y-T-W allongée', 'back', '', 1, 0, { epaule: 1 }, R, 'Sur le ventre, dessine Y, T puis W avec les bras, pouces vers le haut.');

  // ----- Bras -----
  ex('curl', 'Curl biceps', 'arms', 'halteres|kettlebell|elastique', 1, 0, { poignet: 1 }, R, 'Coudes collés au corps, descente lente.');
  ex('triceps', 'Extension triceps', 'arms', 'halteres|elastique', 1, 0, { epaule: 1 }, R, 'Coudes fixes, tends les bras complètement.');
  ex('dips_banc', 'Dips sur banc', 'arms', 'banc', 2, 0, { epaule: 2, poignet: 2 }, R, 'Coudes vers l\'arrière, descente contrôlée.');

  // ----- Gainage / abdos -----
  ex('planche', 'Gainage planche (sur les avant-bras)', 'core', '', 1, 0, { epaule: 1, dos: 1 }, T, 'Fesses alignées, nombril rentré, respire.');
  ex('planche_genoux', 'Gainage sur les genoux', 'core', '', 1, 0, {}, T, 'Avant-bras au sol, genoux posés, dos bien droit.');
  ex('planche_laterale', 'Gainage latéral', 'core', '', 1, 0, { epaule: 1 }, TS, 'Bassin haut, corps bien aligné. Genou au sol pour simplifier.');
  ex('dead_bug', 'Dead bug', 'core', '', 1, 0, {}, R, 'Dos plaqué au sol, tends bras et jambe opposés lentement.');
  ex('bird_dog', 'Bird dog', 'core', '', 1, 0, { poignet: 1 }, RS, 'À 4 pattes, tends bras et jambe opposés sans bouger le bassin.');
  ex('crunch', 'Crunch', 'core', '', 1, 0, { nuque: 1 }, R, 'Mains aux tempes, décolle les épaules sans tirer sur la nuque.');
  ex('releve_jambes', 'Relevés de jambes allongée', 'core', '', 2, 0, { dos: 1 }, R, 'Bas du dos collé au sol, descends lentement.');
  ex('hollow', 'Hollow hold', 'core', '', 2, 0, { dos: 1 }, T, 'Bas du dos au sol, bras et jambes tendus décollés.');
  ex('russian_twist', 'Russian twist', 'core', '', 2, 0, { dos: 2 }, R, 'Buste incliné, tourne de chaque côté, pieds au sol si besoin.');
  ex('mountain_climbers', 'Mountain climbers', 'core', '', 2, 1, { poignet: 2, epaule: 1 }, T, 'Gainage serré, genoux vers la poitrine rapidement.');
  ex('pallof', 'Pallof press à l\'élastique', 'core', 'elastique', 1, 0, {}, RS, 'Élastique sur le côté, tends les bras devant toi sans tourner.');

  // ----- Cardio -----
  ex('burpees', 'Burpees', 'cardio', '', 3, 1, { poignet: 2, genou: 2, epaule: 1, cheville: 1 }, T, 'Poitrine au sol, saut en haut. Garde un rythme régulier.');
  ex('burpees_doux', 'Burpees sans saut', 'cardio', '', 2, 0, { poignet: 2, genou: 1 }, T, 'Recule les pieds un par un, reviens, relève-toi.');
  ex('patineur', 'Pas de patineur', 'cardio', '', 2, 1, { genou: 1, cheville: 2 }, T, 'Bonds latéraux, réception sur une jambe.');
  ex('montees_genoux', 'Montées de genoux rapides', 'cardio', '', 1, 1, { genou: 1, cheville: 1 }, T, 'Sur l\'avant des pieds, rythme rapide.');
  ex('boxe', 'Shadow boxing', 'cardio', '', 1, 0, { epaule: 1 }, T, 'Enchaîne directs et crochets, reste sur l\'avant des pieds.');
  ex('pas_chasses', 'Pas chassés latéraux', 'cardio', '', 1, 0, { cheville: 1 }, T, 'Légèrement fléchie, déplace-toi vite de gauche à droite.');
  ex('genoux_coudes', 'Genou-coude debout', 'cardio', '', 1, 0, {}, T, 'Amène le genou vers le coude opposé, rythme soutenu.');
  ex('jumping_jacks_c', 'Jumping jacks', 'cardio', '', 1, 1, { cheville: 1, genou: 1 }, T, 'Rythme rapide, atterrissage souple.');
  ex('corde', 'Corde à sauter', 'cardio', 'corde', 2, 1, { cheville: 2, genou: 1 }, T, 'Petits sauts sur l\'avant des pieds.');
  ex('swing_cardio', 'Swing kettlebell', 'cardio', 'kettlebell', 2, 0, { dos: 2 }, T, 'Hanches explosives, bras relâchés.');

  // ----- Machines (cardio continu ou fractionné) -----
  const MACHINES = {
    velo: { name: 'Vélo d\'appartement', fast: 'pédale vite, résistance moyenne', slow: 'pédale tranquillement', stress: {} },
    rameur: { name: 'Rameur', fast: 'tirage puissant, rythme soutenu', slow: 'rame tranquillement', stress: { dos: 1 } },
    tapis_course: { name: 'Tapis de course', fast: 'course ou marche rapide en pente', slow: 'marche tranquille', stress: { genou: 1, cheville: 1 } },
  };

  return { EQUIPMENT, ZONES, EXERCISES, MACHINES, BY_ID: Object.fromEntries(EXERCISES.map(e => [e.id, e])) };
});
