// Mannequin 3D animé (Three.js, chargé à la demande) qui montre le mouvement de l'exercice en cours.
// Utilise moves.js (Moves). API : Figure3D.create(conteneur) → { show(exId, opts), setSpeed(v), dispose() }
(() => {
  const D2R = Math.PI / 180;
  let THREE = null;

  async function load() {
    THREE ||= await import('./lib/three/three.module.min.js');
    return THREE;
  }

  // ---------- Squelette ----------
  function buildRig() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xff8a5c, roughness: 0.55, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0xe8506f, roughness: 0.5 });
    const light = new THREE.MeshStandardMaterial({ color: 0xffc2a8, roughness: 0.6 });
    const markers = [];
    const mark = (parent, x, y, z, r) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); markers.push({ o, r }); return o; };
    // Segment qui pend sous son articulation (longueur len, rayon r)
    const limb = (parent, len, r, mat, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 14), mat);
      m.position.y = -len / 2; m.castShadow = true; g.add(m);
      return g;
    };
    const sphere = (parent, r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
    };

    const root = new THREE.Group(); root.rotation.order = 'YXZ';
    sphere(root, 0.15, dark, 0, -0.01, 0, 1.2, 0.75, 0.85);           // bassin
    mark(root, 0, -0.1, -0.05, 0.03);
    const spine = new THREE.Group(); spine.position.set(0, 0.05, 0); root.add(spine);
    sphere(spine, 0.12, skin, 0, 0.13, 0, 1.15, 1.2, 0.85);            // ventre
    const chest = new THREE.Group(); chest.position.set(0, 0.24, 0); spine.add(chest);
    sphere(chest, 0.17, skin, 0, 0.13, 0, 1.15, 1.05, 0.75);           // poitrine
    mark(chest, 0, 0.12, -0.12, 0.02); mark(chest, 0, 0.12, 0.12, 0.02);
    const neck = new THREE.Group(); neck.position.set(0, 0.3, 0); chest.add(neck);
    const nm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 12), light); nm.position.y = 0.04; neck.add(nm);
    const head = sphere(neck, 0.11, light, 0, 0.17, 0.0, 0.92, 1.05, 1);
    sphere(head, 0.03, dark, 0, 0.0, 0.1);                               // nez : indique l'orientation du visage
    mark(neck, 0, 0.29, 0, 0.0); mark(neck, 0, 0.17, -0.11, 0.0); mark(neck, 0, 0.17, 0.11, 0.0);

    const side = (s) => {
      const sh = limb(chest, 0.29, 0.05, skin, 0.2 * s, 0.25, 0); sh.rotation.order = 'XZY';
      sphere(sh, 0.06, skin);
      const el = limb(sh, 0.26, 0.042, skin, 0, -0.29, 0);
      mark(el, 0, 0, 0, 0.045);
      const hand = sphere(el, 0.048, light, 0, -0.28, 0);
      mark(el, 0, -0.29, 0, 0.045);
      const hp = limb(root, 0.44, 0.07, dark, 0.1 * s, -0.04, 0); hp.rotation.order = 'XZY';
      const kn = limb(hp, 0.43, 0.055, skin, 0, -0.44, 0);
      mark(kn, 0, 0, 0.03, 0.06);
      const ak = new THREE.Group(); ak.position.set(0, -0.43, 0); kn.add(ak);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.24), dark); foot.position.set(0, -0.035, 0.06); foot.castShadow = true; ak.add(foot);
      mark(ak, 0, -0.065, 0.18, 0); mark(ak, 0, -0.065, -0.06, 0); mark(ak, 0, 0.0, -0.06, 0.04);
      return { sh, el, hp, kn, ak, hand };
    };
    const L = side(1), R = side(-1);
    return { root, spine, chest, neck, L, R, markers };
  }

  // ---------- Application d'une posture ----------
  function apply(rig, p) {
    const a = k => (p[k] || 0) * D2R;
    rig.root.rotation.set(a('pitch'), a('yaw'), a('roll'));
    rig.spine.rotation.set(a('sp'), a('spT'), -a('spS'));
    rig.chest.rotation.set(a('ch'), a('chT'), 0);
    rig.neck.rotation.set(a('nk'), a('nkT'), -a('nkS'));
    for (const [S, s] of [['L', 1], ['R', -1]]) {
      const j = rig[S];
      const sh = p['sh' + S] || [0, 0, 0], hp = p['hp' + S] || [0, 0, 0];
      j.sh.rotation.set(-sh[0] * D2R, s * (sh[2] || 0) * D2R, s * sh[1] * D2R);
      j.el.rotation.set(-(p['el' + S] || 0) * D2R, 0, 0);
      j.hp.rotation.set(-hp[0] * D2R, s * (hp[2] || 0) * D2R, s * hp[1] * D2R);
      j.kn.rotation.set((p['kn' + S] || 0) * D2R, 0, 0);
      // Pieds à plat (debout) : on compense l'inclinaison de la jambe
      const flat = p.flat ?? (Math.abs(p.pitch || 0) < 45 && Math.abs(p.roll || 0) < 45);
      const ak = (p['ak' + S] || 0) * D2R;
      j.ak.rotation.set(flat ? (hp[0] - (p['kn' + S] || 0) - (p.pitch || 0)) * D2R + ak : ak, 0, 0);
    }
    // Contact avec le sol : le point le plus bas touche le sol, puis on ajoute le saut éventuel
    rig.root.position.set(p.dx || 0, 0, p.dz || 0);
    rig.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let minY = Infinity;
    for (const m of rig.markers) { m.o.getWorldPosition(v); minY = Math.min(minY, v.y - m.r); }
    rig.root.position.y = -minY + (p.lift || 0);
    rig.root.updateMatrixWorld(true);
  }

  // ---------- Accessoires ----------
  function dumbbell(mat) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), mat); bar.rotation.z = Math.PI / 2; g.add(bar);
    for (const x of [-0.09, 0.09]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 14), mat); w.rotation.z = Math.PI / 2; w.position.x = x; g.add(w); }
    return g;
  }

  async function create(container) {
    await load();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
    scene.add(sun); scene.add(sun.target);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.6, 64), new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);

    const rig = buildRig();
    scene.add(rig.root);
    const metal = new THREE.MeshStandardMaterial({ color: 0x555b66, metalness: 0.6, roughness: 0.35 });
    const dbL = dumbbell(metal), dbR = dumbbell(metal);
    rig.L.hand.add(dbL); rig.R.hand.add(dbR);
    dbL.rotation.y = dbR.rotation.y = Math.PI / 2;
    dbL.visible = dbR.visible = false;
    const kb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), metal); kb.position.y = -0.1; rig.R.hand.add(kb);
    kb.visible = false;

    let move = 'idle', t = 0, last = performance.now(), speed = 1, view = 35, drag = 0, running = true, raf = 0;
    const center = new THREE.Vector3(0, 0.9, 0), tmp = new THREE.Vector3(), box = new THREE.Box3();
    let dist = 4;

    function resize() {
      const w = container.clientWidth || 300, h = container.clientHeight || 220;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize); ro.observe(container); resize();

    // Rotation de la vue au doigt
    let dragX = null;
    const el = renderer.domElement;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', e => { dragX = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (dragX != null) { drag += (e.clientX - dragX) * 0.6; dragX = e.clientX; } });
    el.addEventListener('pointerup', () => { dragX = null; });
    el.addEventListener('pointercancel', () => { dragX = null; });

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
      if (!running) return;
      t += dt;
      apply(rig, Moves.poseAt(move, t, speed));
      // Cadrage : centre et taille du corps (lissés)
      box.setFromObject(rig.root);
      box.getCenter(tmp);
      center.lerp(tmp, 0.08);
      const size = box.getSize(new THREE.Vector3());
      const want = Math.max(size.y, Math.max(size.x, size.z) * 0.75, 1.0) * 2.1 + 0.8;
      dist += (want - dist) * 0.05;
      const az = (view + drag) * D2R, el2 = 14 * D2R;
      camera.position.set(center.x + Math.sin(az) * dist * Math.cos(el2), center.y + Math.sin(el2) * dist + 0.15, center.z + Math.cos(az) * dist * Math.cos(el2));
      camera.lookAt(center.x, center.y - 0.05, center.z);
      floor.position.set(center.x, 0, center.z); ring.position.set(center.x, 0.002, center.z);
      sun.target.position.copy(center); sun.position.set(center.x + 2, 4, center.z + 3);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    return {
      // props : 'halteres' | 'kettlebell' | null
      show(exId, opts = {}) {
        const name = Moves.moveFor(exId);
        if (name !== move) { move = name; t = 0; drag = 0; }
        view = Moves.MOVES[name]?.view ?? 35;
        dbL.visible = dbR.visible = opts.props === 'halteres';
        if (name === 'squat_goblet') dbL.visible = false; // un seul haltère tenu contre la poitrine
        kb.visible = opts.props === 'kettlebell';
        return name;
      },
      setSpeed(v) { speed = v; },
      // Fige une posture précise (outil de vérification visuelle)
      renderAt(name, time) { move = name; view = Moves.MOVES[name]?.view ?? 35; drag = 0; running = true; t = time; last = performance.now(); running = false;
        apply(rig, Moves.poseAt(name, time)); box.setFromObject(rig.root); box.getCenter(center); const sz = box.getSize(new THREE.Vector3());
        dist = Math.max(sz.y, Math.max(sz.x, sz.z) * 0.75, 1.0) * 2.1 + 0.8;
        const az = view * D2R, e2 = 14 * D2R;
        camera.position.set(center.x + Math.sin(az) * dist * Math.cos(e2), center.y + Math.sin(e2) * dist + 0.15, center.z + Math.cos(az) * dist * Math.cos(e2));
        camera.lookAt(center.x, center.y - 0.05, center.z); floor.position.set(center.x, 0, center.z); ring.position.set(center.x, 0.002, center.z);
        renderer.render(scene, camera); },
      setRunning(v) { running = v; last = performance.now(); },
      dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.remove(); },
    };
  }

  window.Figure3D = { create, supported: () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } } };
})();
