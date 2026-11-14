/* ───── 벅샷 룰렛 3D 장면 (WebGL, three.js r170) ─────
   판 그림(bsTableHTML)은 화면을 자주 새로 그린다. 그래서 캔버스 하나를 계속 살려 두고, 새로 그려진 무대의 .bs3-slot에 옮겨 붙인다.
   장면은 매 프레임 BSV(연출 상태)를 읽어 총·손·탄의 목표 자세를 정하고 부드럽게 따라간다 → 화면을 다시 그려도 동작이 끊기지 않는다.
   WebGL을 못 쓰거나 three.js를 못 받으면 예전 2D 그림을 그대로 쓴다.
   좌표: 탁자 윗면 y=0, 단위는 대략 m. 나(카메라)는 +z 쪽, 딜러는 −z 쪽. 총 모형은 총구가 −x. */
const BS3 = {st:'idle', T:null};
const BS3_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
function bs3Want(){
  if (BS3.st === 'idle'){
    BS3.st = 'loading';
    let gl = null;
    try { const c = document.createElement('canvas'); gl = c.getContext('webgl2') || c.getContext('webgl'); } catch(e){}
    if (!gl){ BS3.st = 'off'; return false; }
    import(BS3_URL).then(T => {
      BS3.T = T;
      try { bs3Build(); BS3.st = 'on'; } catch(e){ console.error('3D 장면 만들기 실패', e); BS3.st = 'off'; }
      bs3Rer();
    }).catch(e => { console.warn('three.js를 받지 못해 2D로 그립니다', e); BS3.st = 'off'; });
  }
  return BS3.st === 'on';
}
function bs3Rer(){ if ($('#bsCard .bs-table')) bsRender(); else if (typeof mbsRer === 'function' && $('#mbsBody')) mbsRer(); }

// 캔버스로 만든 질감 (외부 그림 파일 없이)
function bs3Tex(w, h, draw, rep){
  const T = BS3.T, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); draw(x, w, h);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  if (rep){ t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function bs3Noise(x, w, h, base, amp, n){
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let k = 0; k < n; k++){ const v = (Math.random() - 0.5) * amp; x.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
}

function bs3Build(){
  const T = BS3.T;
  const R = new T.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
  R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.15;
  R.outputColorSpace = T.SRGBColorSpace;
  R.domElement.className = 'bs3-canvas';
  const scene = new T.Scene();
  scene.background = new T.Color(0x060303); scene.fog = new T.Fog(0x060303, 2.4, 5.5);
  const cam = new T.PerspectiveCamera(40, 1.6, 0.05, 20);

  // 금속이 비칠 주변 빛 (작은 장면을 미리 구워 환경 지도로 쓴다)
  const pm = new T.PMREMGenerator(R), es = new T.Scene();
  const panel = (c, x, y, z, w, h) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({color:c, side:T.DoubleSide})); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  panel(0xffe6c4, 0, 3, 0, 1.6, 1.6); panel(0x5a1410, 0, 0.6, -3, 6, 2.4); panel(0x1d1614, 3, 0.4, 0, 4, 2); panel(0x1d1614, -3, 0.4, 0, 4, 2); panel(0x0d0b0a, 0, 0.4, 3, 6, 2);
  scene.environment = pm.fromScene(es, 0.04).texture; scene.environmentIntensity = 0.55;

  // 질감
  const feltT = bs3Tex(256, 256, (x, w, h) => bs3Noise(x, w, h, '#2f3b24', 0.22, 9000), [5, 4]);
  const woodT = bs3Tex(512, 64, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#8a5530'); g.addColorStop(1, '#5a3319'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 46; k++){ x.strokeStyle = `rgba(${Math.random() < .5 ? '40,20,8' : '200,140,90'},${0.08 + Math.random() * 0.18})`; x.lineWidth = 0.6 + Math.random() * 1.6; x.beginPath(); const y0 = Math.random() * h; x.moveTo(0, y0); for (let i = 0; i <= w; i += 32) x.lineTo(i, y0 + Math.sin(i / 60 + k) * 3 + (Math.random() - .5) * 2); x.stroke(); }
  });
  const maskT = bs3Tex(256, 256, (x, w, h) => {
    bs3Noise(x, w, h, '#57493b', 0.3, 7000);
    for (let k = 0; k < 40; k++){ x.fillStyle = `rgba(${90 + Math.random() * 40},${40 + Math.random() * 20},15,${0.15 + Math.random() * 0.25})`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 0, 7); x.fill(); }   // 녹
    for (let k = 0; k < 70; k++){ x.strokeStyle = `rgba(200,190,170,${0.1 + Math.random() * 0.25})`; x.lineWidth = 0.6; x.beginPath(); const a = Math.random() * w, b = Math.random() * h; x.moveTo(a, b); x.lineTo(a + (Math.random() - .5) * 40, b + (Math.random() - .5) * 14); x.stroke(); }   // 긁힘
  });
  const clothT = bs3Tex(128, 128, (x, w, h) => { bs3Noise(x, w, h, '#1a1311', 0.25, 4000); for (let i = 0; i < w; i += 3){ x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(i, 0, 1, h); } }, [3, 3]);
  const hullT = bs3Tex(64, 64, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 4){ x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(i, 0, 1.5, h); } }, [1, 1]);
  const tileT = bs3Tex(256, 256, (x, w, h) => { bs3Noise(x, w, h, '#2a2422', 0.2, 3000); x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 3; for (let i = 0; i <= w; i += 32){ x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); } }, [6, 3]);
  const glowT = bs3Tex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(.25, 'rgba(255,190,80,.9)'); g.addColorStop(.6, 'rgba(255,90,20,.35)'); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const smokeT = bs3Tex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(200,195,185,.55)'); g.addColorStop(1, 'rgba(200,195,185,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });

  const M = {
    felt: new T.MeshStandardMaterial({map:feltT, roughness:0.95}),
    wood: new T.MeshStandardMaterial({map:woodT, color:0xb8a898, roughness:0.55, metalness:0.05}),
    steel: new T.MeshStandardMaterial({color:0x2c3036, roughness:0.32, metalness:0.9}),
    steelD: new T.MeshStandardMaterial({color:0x141619, roughness:0.45, metalness:0.85}),
    steelL: new T.MeshStandardMaterial({color:0x8d939b, roughness:0.25, metalness:1}),
    mask: new T.MeshStandardMaterial({map:maskT, roughness:0.7, metalness:0.55, side:T.DoubleSide}),
    cloth: new T.MeshStandardMaterial({map:clothT, color:0x8a8582, roughness:1}),
    leather: new T.MeshStandardMaterial({color:0x1d120d, roughness:0.55, metalness:0.05}),
    glass: new T.MeshStandardMaterial({color:0x050404, roughness:0.08, metalness:0.2}),
    brass: new T.MeshStandardMaterial({color:0xc9a23a, roughness:0.3, metalness:1}),
    rubber: new T.MeshStandardMaterial({color:0x151110, roughness:0.9}),
  };
  const add = (p, m) => { m.castShadow = true; m.receiveShadow = true; p.add(m); return m; };
  const cyl = (r, l, m, seg) => new T.Mesh(new T.CylinderGeometry(r, r, l, seg || 20), m);

  // 방: 뒤 벽(낡은 타일), 바닥
  const wall = new T.Mesh(new T.PlaneGeometry(9, 4.5), new T.MeshStandardMaterial({map:tileT, roughness:0.85}));
  wall.position.set(0, 1.2, -2.7); wall.receiveShadow = true; scene.add(wall);
  const floor = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshStandardMaterial({color:0x0c0908, roughness:1}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.75; floor.receiveShadow = true; scene.add(floor);

  // 탁자: 나무 테두리 + 녹색 펠트 + 둥근 선
  const table = new T.Group(); scene.add(table);
  const rim = add(table, new T.Mesh(new T.BoxGeometry(2.3, 0.09, 1.78), M.wood)); rim.position.y = -0.05;
  const felt = add(table, new T.Mesh(new T.BoxGeometry(2.14, 0.02, 1.62), M.felt)); felt.position.y = -0.0;
  felt.position.y = -0.01;
  const ring = new T.Mesh(new T.RingGeometry(0.6, 0.614, 96), new T.MeshBasicMaterial({color:0xd8cdb0, transparent:true, opacity:0.28}));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.0015; table.add(ring);
  const legG = new T.BoxGeometry(0.08, 0.7, 0.08);
  [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]].forEach(([x, z]) => { const l = add(table, new T.Mesh(legG, M.wood)); l.position.set(x, -0.43, z); });

  // 전등: 갓 + 전구 + 그림자를 만드는 스포트라이트, 뒤에서 붉은 빛
  const lamp = new T.Group(); lamp.position.set(0, 1.62, -0.3); scene.add(lamp);
  const shade = new T.Mesh(new T.ConeGeometry(0.3, 0.22, 40, 1, true), new T.MeshStandardMaterial({color:0x2a2c24, roughness:0.5, metalness:0.7, side:T.DoubleSide}));
  lamp.add(shade);
  const bulb = new T.Mesh(new T.SphereGeometry(0.06, 20, 12), new T.MeshStandardMaterial({color:0xfff0c8, emissive:0xffe0a0, emissiveIntensity:3}));
  bulb.position.y = -0.08; lamp.add(bulb);
  const cord = cyl(0.006, 1.6, M.rubber); cord.position.y = 0.9; lamp.add(cord);
  const spot = new T.SpotLight(0xffe2b8, 22, 6, 0.98, 0.7, 1.5);
  spot.position.set(0, 1.52, -0.3); spot.target.position.set(0, 0, -0.35); spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 4; spot.shadow.radius = 4;
  scene.add(spot, spot.target);
  const red = new T.PointLight(0xff2a14, 3, 6, 1.6); red.position.set(0.3, 1.4, -2.3); scene.add(red);
  scene.add(new T.HemisphereLight(0x4a3430, 0x080505, 0.8));
  const fill = new T.PointLight(0xffd6b0, 0.9, 3.2, 1.8); fill.position.set(0.5, 0.9, 0.6); scene.add(fill);   // 앞에서 딜러를 살짝 비추는 빛

  // ── 딜러 (이 게임만의 인물: 낡은 용접 가면, 검은 코트, 가죽 장갑) ──
  // 자리(seat)는 탁자 둘레의 고정 위치·방향, 그 안의 몸(dealer)이 젖히고 쓰러진다. 여럿이 하면 상대마다 자리를 하나씩 더 만든다 (bs3Figs)
  const seat0 = new T.Group(); seat0.position.set(0, 0, -1.08); scene.add(seat0);
  const dealer = new T.Group(); seat0.add(dealer);
  const torsoG = new T.LatheGeometry([[0, -0.3], [0.33, -0.3], [0.36, 0.05], [0.37, 0.28], [0.33, 0.44], [0.22, 0.53], [0.09, 0.57], [0, 0.58]].map(([r, y]) => new T.Vector2(r, y)), 40);
  const torso = add(dealer, new T.Mesh(torsoG, M.cloth)); torso.scale.z = 0.62;
  const lapG = new T.BoxGeometry(0.075, 0.34, 0.015);
  [-1, 1].forEach(s => { const l = add(dealer, new T.Mesh(lapG, M.cloth)); l.position.set(s * 0.07, 0.36, 0.215); l.rotation.set(-0.2, 0, s * 0.42); });
  const shirt = add(dealer, new T.Mesh(new T.BoxGeometry(0.1, 0.2, 0.01), new T.MeshStandardMaterial({color:0x0f0a08, roughness:0.9}))); shirt.position.set(0, 0.45, 0.2); shirt.rotation.x = -0.25;
  const collar = add(dealer, new T.Mesh(new T.TorusGeometry(0.09, 0.025, 10, 28), M.cloth)); collar.position.set(0, 0.585, 0.0); collar.rotation.x = Math.PI / 2; collar.scale.set(1.15, 0.9, 1);
  const neck = add(dealer, cyl(0.055, 0.12, M.cloth)); neck.position.y = 0.64;
  const head = new T.Group(); head.position.set(0, 0.8, 0.0); dealer.add(head);
  const hood = add(head, new T.Mesh(new T.SphereGeometry(0.125, 28, 20), M.cloth)); hood.scale.set(1, 1.12, 1.05); hood.position.z = -0.02;
  // 가면: 앞쪽 곡면 판 + 위 덮개 + 옆 돌쩌귀 + 머리띠 + 리벳
  const L = Math.PI * 1.05;
  const shield = add(head, new T.Mesh(new T.SphereGeometry(0.155, 40, 24, Math.PI / 2 - L / 2, L, Math.PI * 0.2, Math.PI * 0.62), M.mask)); shield.scale.set(1, 1.28, 0.92);
  const cap = add(head, new T.Mesh(new T.SphereGeometry(0.158, 40, 12, Math.PI / 2 - L / 2, L, Math.PI * 0.12, Math.PI * 0.1), M.mask)); cap.scale.set(1, 1.28, 0.92);
  const chinBar = add(head, new T.Mesh(new T.BoxGeometry(0.16, 0.012, 0.012), M.steelD)); chinBar.position.set(0, -0.11, 0.115);
  const visorF = add(head, new T.Mesh(new T.BoxGeometry(0.17, 0.05, 0.03), M.steelD)); visorF.position.set(0, 0.025, 0.135);
  const visor = add(head, new T.Mesh(new T.BoxGeometry(0.145, 0.03, 0.02), M.glass)); visor.position.set(0, 0.025, 0.147);
  const eyeM = new T.MeshStandardMaterial({color:0x200000, emissive:0xff1408, emissiveIntensity:1.6});
  const eye = new T.Mesh(new T.BoxGeometry(0.125, 0.009, 0.004), eyeM); eye.position.set(0, 0.025, 0.158); head.add(eye);
  const eyeG = new T.Sprite(new T.SpriteMaterial({map:glowT, color:0xff2010, transparent:true, opacity:0.7, blending:T.AdditiveBlending, depthWrite:false})); eyeG.scale.set(0.24, 0.07, 1); eyeG.position.set(0, 0.025, 0.17); head.add(eyeG);
  const eyeL = new T.PointLight(0xff2a1a, 0.2, 1.4, 2); eyeL.position.set(0, -0.1, 0.5); head.add(eyeL);
  const rivG = new T.SphereGeometry(0.0065, 10, 8);
  [[-0.11, 0.06], [0.11, 0.06], [-0.12, -0.04], [0.12, -0.04], [-0.06, -0.1], [0.06, -0.1]].forEach(([x, y]) => { const r = add(head, new T.Mesh(rivG, M.steelL)); r.position.set(x, y, Math.sqrt(Math.max(0, 0.0215 - x * x)) * 0.92 + 0.004); });
  [-1, 1].forEach(s => { const k = add(head, cyl(0.022, 0.03, M.steelD)); k.rotation.z = Math.PI / 2; k.position.set(s * 0.158, 0.0, -0.005); const k2 = add(head, cyl(0.01, 0.012, M.steelL)); k2.rotation.z = Math.PI / 2; k2.position.set(s * 0.177, 0, -0.005); });
  const band = add(head, new T.Mesh(new T.TorusGeometry(0.145, 0.009, 8, 40, Math.PI), M.leather)); band.rotation.set(0, Math.PI / 2, 0); band.position.y = 0.02; band.scale.set(1, 1.18, 1);
  const pipe = add(head, new T.Mesh(new T.TorusGeometry(0.14, 0.006, 6, 30, Math.PI * 0.8), M.steelD)); pipe.position.set(0.02, -0.02, -0.03); pipe.rotation.set(0.4, 0.4, -1.2);

  // 팔: 어깨-팔꿈치-손 (두 마디 IK), 손은 가죽 장갑
  const armG = new T.CylinderGeometry(1, 0.85, 1, 14); armG.translate(0, 0.5, 0);
  const mkArm = s => {
    const up = add(scene, new T.Mesh(armG, M.cloth)), fo = add(scene, new T.Mesh(armG, M.cloth));
    const hand = new T.Group(); hand.scale.setScalar(1.35); scene.add(hand);
    const jG = new T.SphereGeometry(1, 14, 10), j1 = add(scene, new T.Mesh(jG, M.cloth)), j2 = add(scene, new T.Mesh(jG, M.cloth)); j1.scale.setScalar(0.07); j2.scale.setScalar(0.05);
    const palm = add(hand, new T.Mesh(new T.BoxGeometry(0.075, 0.026, 0.07), M.leather)); palm.position.z = 0.01;
    const fg = new T.CapsuleGeometry(0.0105, 0.04, 4, 8); fg.rotateX(Math.PI / 2);
    for (let k = 0; k < 4; k++){ const f = add(hand, new T.Mesh(fg, M.leather)); f.position.set((k - 1.5) * 0.019, -0.006, 0.07); f.rotation.x = 0.35; }
    const th = add(hand, new T.Mesh(fg, M.leather)); th.position.set(-s * 0.045, -0.004, 0.025); th.rotation.set(0.2, -s * 0.9, 0);
    const cuffM = add(hand, cyl(0.04, 0.04, M.cloth)); cuffM.rotation.x = Math.PI / 2; cuffM.position.z = -0.04;
    return {s, up, fo, hand, j1, j2, shL:new T.Vector3(s * 0.29, 0.46, 0.03), sh:new T.Vector3(s * 0.29, 0.46, -1.05), p:new T.Vector3(s * 0.3, 0.03, -0.62), a:0.44, b:0.43};
  };
  const arms = [mkArm(-1), mkArm(1)];
  const fig0 = {seat:seat0, body:dealer, head, torso:null, arms, eyeM, eyeG, eyeL};

  // ── 산탄총 (펌프식, 직접 만든 모형) ──
  const gun = new T.Group(); scene.add(gun);
  const gunIn = new T.Group(); gun.add(gunIn);   // 반동은 안쪽 묶음만 흔든다
  const barrel = new T.Group(); barrel.position.x = -0.02; gunIn.add(barrel);   // 톱으로 자를 때 받침점(기관부 앞)
  const bar = add(barrel, cyl(0.017, 0.46, M.steel, 24)); bar.rotation.z = Math.PI / 2; bar.position.set(-0.23, 0.032, 0);
  const rib = add(barrel, new T.Mesh(new T.BoxGeometry(0.44, 0.006, 0.012), M.steelD)); rib.position.set(-0.23, 0.052, 0);
  const muz = add(barrel, cyl(0.02, 0.025, M.steelD, 24)); muz.rotation.z = Math.PI / 2; muz.position.set(-0.455, 0.032, 0);
  const bore = new T.Mesh(new T.CircleGeometry(0.012, 20), new T.MeshBasicMaterial({color:0x000000})); bore.rotation.y = -Math.PI / 2; bore.position.set(-0.469, 0.032, 0); barrel.add(bore);
  const bead = add(barrel, new T.Mesh(new T.SphereGeometry(0.006, 10, 8), M.brass)); bead.position.set(-0.43, 0.058, 0);
  const tube = add(barrel, cyl(0.015, 0.36, M.steel, 20)); tube.rotation.z = Math.PI / 2; tube.position.set(-0.18, -0.003, 0);
  const tubeCap = add(barrel, cyl(0.017, 0.02, M.steelD, 20)); tubeCap.rotation.z = Math.PI / 2; tubeCap.position.set(-0.365, -0.003, 0);
  const clamp = add(barrel, new T.Mesh(new T.BoxGeometry(0.018, 0.06, 0.036), M.steelD)); clamp.position.set(-0.34, 0.015, 0);
  const pump = new T.Group(); gunIn.add(pump);
  const pmp = add(pump, new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.16, 24), M.wood)); pmp.rotation.z = Math.PI / 2; pmp.position.set(-0.21, 0.002, 0); pmp.scale.set(1, 1, 0.82);
  for (let k = 0; k < 7; k++){ const g = new T.Mesh(new T.TorusGeometry(0.0302, 0.0028, 6, 24), M.steelD); g.rotation.y = Math.PI / 2; g.position.set(-0.27 + k * 0.02, 0.002, 0); g.scale.set(1, 1, 0.82); pump.add(g); }
  const rcv = add(gunIn, new T.Mesh(new T.BoxGeometry(0.21, 0.078, 0.048), M.steel)); rcv.position.set(0.075, 0.018, 0);
  const rcvTop = add(gunIn, new T.Mesh(new T.CylinderGeometry(0.024, 0.024, 0.21, 20, 1, false, 0, Math.PI), M.steel)); rcvTop.rotation.set(0, 0, Math.PI / 2); rcvTop.position.set(0.075, 0.056, 0); rcvTop.scale.set(1, 1, 1);
  const port = new T.Mesh(new T.BoxGeometry(0.075, 0.026, 0.004), M.steelD); port.position.set(0.06, 0.03, 0.025); gunIn.add(port);
  const bolt = add(gunIn, new T.Mesh(new T.BoxGeometry(0.03, 0.016, 0.004), M.steelL)); bolt.position.set(0.045, 0.03, 0.0275);
  const loadPort = new T.Mesh(new T.BoxGeometry(0.07, 0.004, 0.026), M.steelD); loadPort.position.set(0.08, -0.022, 0); gunIn.add(loadPort);
  [[0.0, -0.005], [0.15, -0.005], [0.15, 0.04]].forEach(([x, y]) => { const sc = add(gunIn, cyl(0.005, 0.052, M.steelL, 10)); sc.rotation.x = Math.PI / 2; sc.position.set(x, y, 0); });
  const guard = add(gunIn, new T.Mesh(new T.TorusGeometry(0.03, 0.0045, 8, 24, Math.PI), M.steelD)); guard.rotation.z = Math.PI; guard.position.set(0.13, -0.022, 0);
  const trig = add(gunIn, new T.Mesh(new T.BoxGeometry(0.006, 0.03, 0.008), M.steelL)); trig.position.set(0.128, -0.035, 0); trig.rotation.z = -0.25;
  const stockS = new T.Shape(); stockS.moveTo(0, 0.05); stockS.lineTo(0.3, 0.045); stockS.quadraticCurveTo(0.31, 0.045, 0.31, 0.03); stockS.lineTo(0.31, -0.07); stockS.quadraticCurveTo(0.31, -0.085, 0.295, -0.085);
  stockS.lineTo(0.08, -0.03); stockS.quadraticCurveTo(0.03, -0.02, 0.02, -0.035); stockS.lineTo(0, -0.03); stockS.lineTo(0, 0.05);
  const stockG = new T.ExtrudeGeometry(stockS, {depth:0.034, bevelEnabled:true, bevelThickness:0.006, bevelSize:0.006, bevelSegments:3, curveSegments:10}); stockG.translate(0, 0, -0.017);
  const stock = add(gunIn, new T.Mesh(stockG, M.wood)); stock.position.set(0.18, 0.005, 0);
  const pad = add(gunIn, new T.Mesh(new T.BoxGeometry(0.012, 0.14, 0.046), M.rubber)); pad.position.set(0.497, -0.013, 0); pad.rotation.z = -0.02;
  const peekM = new T.MeshBasicMaterial({color:0x6ab8ff, transparent:true, opacity:0, blending:T.AdditiveBlending, depthWrite:false});
  const peekGlow = new T.Mesh(new T.BoxGeometry(0.24, 0.1, 0.07), peekM); peekGlow.position.set(0.075, 0.02, 0); gunIn.add(peekGlow);
  // 총의 부분 위치 (총 모형 안 좌표): 총구, 탄피 나오는 곳, 탄 넣는 곳, 손잡이, 펌프
  const GP = {muzzle:new T.Vector3(-0.48, 0.032, 0), eject:new T.Vector3(0.06, 0.035, 0.03), load:new T.Vector3(0.08, -0.03, 0), grip:new T.Vector3(0.2, -0.03, 0), pump:new T.Vector3(-0.21, -0.02, 0)};
  // 톱 (손톱): 이가 아래로 난 날 + 나무 손잡이. 날은 모형의 x축, 손잡이는 +x 끝
  const saw = new T.Group(); saw.visible = false; scene.add(saw);
  const bladeS = new T.Shape(); bladeS.moveTo(-0.17, 0); const TN = 22; for (let k = 0; k <= TN; k++){ const x = -0.17 + k * (0.3 / TN); bladeS.lineTo(x, k % 2 ? -0.008 : 0); }
  bladeS.lineTo(0.13, 0.055); bladeS.lineTo(-0.17, 0.035); bladeS.lineTo(-0.17, 0);
  const blade = add(saw, new T.Mesh(new T.ExtrudeGeometry(bladeS, {depth:0.0016, bevelEnabled:false}), new T.MeshStandardMaterial({color:0xb7bcc2, roughness:0.28, metalness:1, side:T.DoubleSide})));
  blade.position.z = -0.0008;
  const hdl = new T.Group(); hdl.position.set(0.12, -0.012, 0); saw.add(hdl);
  [[0.0125, 0.04, 0.025, 0.09, 0], [0.068, 0.04, 0.022, 0.1, -0.12], [0.04, 0.083, 0.07, 0.02, 0.06], [0.04, 0.0, 0.07, 0.02, -0.08]].forEach(([x, y, w, h, r]) => { const b = add(hdl, new T.Mesh(new T.BoxGeometry(w, h, 0.022), M.wood)); b.position.set(x, y, 0); b.rotation.z = r; });
  [0.02, 0.05].forEach(y => { const r = add(saw, cyl(0.004, 0.03, M.brass, 8)); r.rotation.x = Math.PI / 2; r.position.set(0.135, y, 0); });
  // 아이템 모형: 돋보기, 담배, 맥주 캔, 수갑
  const IT = {};
  IT.glass = new T.Group();
  add(IT.glass, new T.Mesh(new T.TorusGeometry(0.045, 0.006, 10, 40), M.steelL));
  IT.glass.add(new T.Mesh(new T.CircleGeometry(0.044, 32), new T.MeshStandardMaterial({color:0xa8d4ff, transparent:true, opacity:0.28, roughness:0.05, metalness:0, side:T.DoubleSide})));
  const gh = add(IT.glass, cyl(0.009, 0.11, M.wood, 12)); gh.position.y = -0.1;
  IT.cig = new T.Group();
  const cg1 = add(IT.cig, cyl(0.0045, 0.06, new T.MeshStandardMaterial({color:0xefe9dc, roughness:0.8}), 12)); cg1.rotation.z = Math.PI / 2; cg1.position.x = 0.01;
  const cg2 = add(IT.cig, cyl(0.0046, 0.022, new T.MeshStandardMaterial({color:0xc9893a, roughness:0.7}), 12)); cg2.rotation.z = Math.PI / 2; cg2.position.x = -0.03;
  const emberM = new T.MeshStandardMaterial({color:0x220000, emissive:0xff4a10, emissiveIntensity:0.5});
  const ember = new T.Mesh(new T.SphereGeometry(0.0048, 10, 8), emberM); ember.position.x = 0.041; IT.cig.add(ember);
  const canT = bs3Tex(128, 64, (x, w, h) => { x.fillStyle = '#2f6b3a'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8c27a'; x.fillRect(0, h * 0.35, w, h * 0.3); x.fillStyle = '#7a1712'; x.font = 'bold 14px sans-serif'; x.fillText('LAGER', 40, h * 0.58); });
  IT.beer = new T.Group();
  add(IT.beer, new T.Mesh(new T.CylinderGeometry(0.033, 0.033, 0.12, 28), new T.MeshStandardMaterial({map:canT, roughness:0.35, metalness:0.6})));
  const lid = add(IT.beer, cyl(0.03, 0.006, M.steelL, 28)); lid.position.y = 0.063;
  IT.cuff = new T.Group();
  [-1, 1].forEach(sx => { const r = add(IT.cuff, new T.Mesh(new T.TorusGeometry(0.038, 0.0065, 8, 32), M.steelL)); r.position.x = sx * 0.055; r.rotation.x = Math.PI / 2; });
  for (let k = 0; k < 3; k++){ const l = add(IT.cuff, new T.Mesh(new T.TorusGeometry(0.008, 0.0025, 6, 12), M.steel)); l.position.x = -0.013 + k * 0.013; l.rotation.y = k % 2 ? Math.PI / 2 : 0; }
  Object.values(IT).forEach(o => { o.visible = false; scene.add(o); });
  const cuffOn = IT.cuff.clone(); cuffOn.visible = false; scene.add(cuffOn);   // 묶여 있는 동안 손목에 남는 수갑
  const puffs = Array.from({length:8}, () => { const sp = new T.Sprite(new T.SpriteMaterial({map:smokeT, transparent:true, opacity:0, depthWrite:false})); sp.userData = {v:new T.Vector3(), t:9}; scene.add(sp); return sp; });
  const sparkN = 40, sparkM = new T.MeshBasicMaterial({color:0xffc060, transparent:true, opacity:0.95, blending:T.AdditiveBlending, depthWrite:false});
  const sparks = new T.Group(); scene.add(sparks);
  const sparkG2 = new T.BoxGeometry(0.0025, 0.0025, 0.012);
  const sparkV = Array.from({length:sparkN}, () => { const m = new T.Mesh(sparkG2, sparkM); m.visible = false; sparks.add(m); return {m, v:new T.Vector3(), p:new T.Vector3(), life:0}; });
  const sparkP = null;
  // 총구 불꽃·연기
  const flash = new T.Sprite(new T.SpriteMaterial({map:glowT, transparent:true, opacity:0, blending:T.AdditiveBlending, depthWrite:false})); flash.scale.set(0.5, 0.5, 1); scene.add(flash);
  const flashL = new T.PointLight(0xffb35a, 0, 2.6, 2); scene.add(flashL);
  const smokes = Array.from({length:10}, () => { const s = new T.Sprite(new T.SpriteMaterial({map:smokeT, transparent:true, opacity:0, depthWrite:false})); s.userData = {v:new T.Vector3(), t:9}; scene.add(s); return s; });

  // 탄: 회색 몸통(골 무늬) + 놋쇠 머리. 장전 전에는 모두 같은 색, 탄피로 튀어나올 때만 실탄 빨강·공포탄 파랑
  const hullG = new T.CylinderGeometry(0.0118, 0.0118, 0.058, 18), headG = new T.CylinderGeometry(0.0125, 0.0125, 0.013, 18);
  const mkShell = col => {
    const g = new T.Group(), hm = new T.MeshStandardMaterial({color:col, map:hullT, roughness:0.55});
    const h = add(g, new T.Mesh(hullG, hm)); h.position.y = 0.0;
    const b = add(g, new T.Mesh(headG, M.brass)); b.position.y = -0.0355;
    g.userData.hm = hm; return g;
  };
  const lay = Array.from({length:8}, () => { const s = mkShell(0x8f8a80); s.visible = false; scene.add(s); return s; });
  const ejects = [];

  BS3.R = R; BS3.scene = scene; BS3.cam = cam;
  fig0.torso = torso;
  BS3.o = {T, M, IT, cuffOn, emberM, puffs, eyeG, saw, sparks, sparkP, sparkV, gun, gunIn, barrel, pump, peekM, GP, flash, flashL, smokes, lay, ejects, mkShell, arms, dealer, head, eyeM, eyeL, spot, bulb, red, torso,
    figs:[fig0], mkArm, scene, headIdx:dealer.children.indexOf(head), torsoIdx:dealer.children.indexOf(torso)};
  const v = () => new T.Vector3();
  BS3.a = {blackT:99, blackD:0, blackF:1, t:0, last:0, gP:new T.Vector3(0, 0.03, 0.05), gQ:new T.Quaternion(), prev:{}, feed:null, rackT:9, bangT:9, clickT:9, sawT:9, hitT:9, hitMe:false, shake:0, saw:1, peek:0, layT:0, tmp:[v(), v(), v(), v()]};
  BS3.a.gQ.copy(bs3Q(new T.Vector3(-1, 0, 0), 'side'));

  // 처음 보이는 순간에 셰이더를 만드느라 멈칫하지 않게 미리 만들어 둔다 (톱·불똥·탄은 평소에 숨겨져 있다)
  const hid = []; scene.traverse(o => { if (!o.visible){ hid.push(o); o.visible = true; } });
  try { R.compile(scene, cam); } catch(e){}
  hid.forEach(o => { o.visible = false; });
  // 새로 그려진 무대에 캔버스를 옮겨 붙인다 (그리기 전에 붙어서 깜빡이지 않는다)
  new MutationObserver(bs3Mount).observe(document.body, {childList:true, subtree:true});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) bs3Mount(); });
}
function bs3Mount(){
  if (BS3.st !== 'on' && !BS3.R) return;
  const slot = document.querySelector('.bs3-slot');
  if (!slot) return;
  const c = BS3.R.domElement;
  if (c.parentNode !== slot) slot.appendChild(c);
  if (!BS3.tags){ BS3.tags = document.createElement('div'); BS3.tags.className = 'bs3-tags'; }
  if (BS3.tags.parentNode !== slot) slot.appendChild(BS3.tags);
  if (!BS3.raf){ BS3.a.last = performance.now(); BS3.raf = requestAnimationFrame(bs3Frame); }
}
// 총 방향: 총구(모형의 −x)가 dir을 보게. mode 'side'는 탁자에 옆으로 눕힘, 'flip'은 뒤집어 탄 넣는 곳이 위로
function bs3Q(dir, mode){
  const T = BS3.T, x = dir.clone().normalize().multiplyScalar(-1);
  let up = new T.Vector3(0, 1, 0);
  if (mode === 'side') up = new T.Vector3(0, 0, 1);
  const y = up.sub(x.clone().multiplyScalar(up.dot(x))).normalize();
  if (mode === 'flip') y.multiplyScalar(-1);
  const z = new T.Vector3().crossVectors(x, y);
  const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
  if (mode === 'side') q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2));
  return q;
}
/* 여럿이 하는 판: 상대마다 탁자 둘레에 인물을 앉힌다. 나는 앞(카메라), 상대는 내 다음 자리부터 왼쪽 → 앞 → 오른쪽.
   둘이면 딜러 하나가 상대. 각 인물은 자리(seat: 고정 위치·방향)와 몸(body: 젖힘·쓰러짐), 머리, 두 팔을 가진다 */
// 자리: [x, z, 돌림(y축), 크기]. 모두 탁자 건너편에 앉아 화면 안에 들어오게 하고, 바깥 사람은 가운데 쪽으로 살짝 돌아앉는다
const BS3_SEATS = {1:[[0, -1.08, 0, 1]], 2:[[-0.6, -1.08, 0.22, 0.9], [0.6, -1.08, -0.22, 0.9]], 3:[[-0.92, -0.98, 0.42, 0.84], [0, -1.12, 0, 0.84], [0.92, -0.98, -0.42, 0.84]]};
function bs3Figs(g, me){
  const O = BS3.o, T = O.T, n = g ? g.pl.length : 2, k = Math.max(1, Math.min(3, n - 1)), seats = BS3_SEATS[k];
  while (O.figs.length < k){   // 첫 인물을 복제해 자리를 늘린다 (눈 재질은 따로: 한 사람이 탈락해도 다른 사람 눈은 켜져 있게)
    const seat = new T.Group(); O.scene.add(seat);
    const body = O.dealer.clone(true); body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); seat.add(body);
    const eyeM = O.eyeM.clone(); let eyeG = null;
    body.traverse(o => { if (o.material === O.eyeM) o.material = eyeM; if (o.isSprite && o.material === O.eyeG.material){ o.material = o.material.clone(); eyeG = o; } if (o.isPointLight){ o.intensity = 0; o.visible = false; } });
    O.figs.push({seat, body, head:body.children[O.headIdx], torso:body.children[O.torsoIdx], arms:[O.mkArm(-1), O.mkArm(1)], eyeM, eyeG, eyeL:null});
  }
  O.figs.forEach((f, j) => {
    const on = j < k; f.seat.visible = on; f.arms.forEach(a => [a.up, a.fo, a.hand, a.j1, a.j2].forEach(m => { m.visible = on; }));
    if (!on) return;
    const [x, z, r, sc] = seats[j];
    f.i = (me + 1 + j) % n;
    f.seat.position.set(x, 0, z); f.seat.rotation.set(0, r, 0); f.seat.scale.setScalar(sc); f.seat.updateMatrixWorld(true);
  });
  return O.figs.slice(0, k);
}
// 둘이 할 때의 딜러 기준 좌표(세계 좌표, 딜러가 z=-1.08)를 인물 f 자리 기준으로 옮긴다
function bs3S(f, x, y, z){ return new BS3.T.Vector3(x, y, z + 1.08).applyMatrix4(f.seat.matrixWorld); }
function bs3D(f, x, y, z){ return new BS3.T.Vector3(x, y, z).applyQuaternion(f.seat.quaternion); }
// 두 마디 팔: 어깨 S에서 손 H까지, 팔꿈치는 바깥·아래쪽으로 굽힌다
function bs3Arm(A){
  const T = BS3.T, S = A.sh, H = A.p, d0 = H.clone().sub(S), dist = Math.min(d0.length(), A.a + A.b - 0.002), u = d0.normalize();
  const cosA = (A.a * A.a + dist * dist - A.b * A.b) / (2 * A.a * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // 팔꿈치 방향: 몸 기준 바깥·뒤·약간 아래 (예전엔 세계 기준 아래라 손을 들면 팔꿈치가 탁자를 뚫었다)
  // 손을 어깨 가까이 들어 올리면(맥주 마시기·담배·겨누기) 팔꿈치는 아래·바깥으로 자연스럽게 내린다
  const hk = Math.max(0, Math.min(1, (H.y - (S.y - 0.28)) / 0.3));
  const pole = new T.Vector3(A.s * 0.85, -0.45 - hk * 0.55, -0.85 * (1 - hk) + 0.15 * hk); if (A.q) pole.applyQuaternion(A.q);
  const w = pole.sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
  const E = S.clone().add(u.clone().multiplyScalar(A.a * cosA)).add(w.multiplyScalar(A.a * sinA));
  const Hc = S.clone().add(u.clone().multiplyScalar(dist));
  const seg = (m, p, q, r) => { const d = q.clone().sub(p); m.position.copy(p); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize()); m.scale.set(r, d.length(), r); };
  seg(A.up, S, E, 0.058); seg(A.fo, E, Hc, 0.047); A.j1.position.copy(S); A.j2.position.copy(E);
  A.hand.position.copy(Hc);
  // 손 방향: 손가락(+z)은 팔뚝 방향, 손바닥(−y 쪽, 손가락이 굽는 쪽)은 잡는 물건을 향한다 (A.palmAt: 그 점, 없으면 아래 = 탁자 짚기)
  const z = Hc.clone().sub(E).normalize();
  let pa = A.palmAt;
  if (A.palmAx){   // 총을 쥘 때: 손바닥이 총의 중심선(축)을 직각으로 향한다 → 총을 감싸 쥔다
    const c = A.palmAt, ax = A.palmAx; pa = c.clone().add(ax.clone().multiplyScalar(Hc.clone().sub(c).dot(ax)));
    if (pa.distanceToSquared(Hc) < 1e-5) pa = Hc.clone().add(new T.Vector3(0, 1, 0));
  }
  let n = pa ? pa.clone().sub(Hc) : new T.Vector3(0, -1, 0);
  if (n.lengthSq() < 1e-6) n.set(0, -1, 0);
  const y = n.normalize().multiplyScalar(-1); y.sub(z.clone().multiplyScalar(y.dot(z)));
  if (y.lengthSq() < 1e-6) y.set(0, 1, 0).sub(z.clone().multiplyScalar(z.y));
  y.normalize();
  const x = y.clone().cross(z);
  A.hand.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
}
const bs3Damp = (k, dt) => 1 - Math.exp(-k * dt);
// 펌프질 시간표(초): 손이 닿음 l0 → 들어 올림 l1 → 당기기 b0~b1('착') → 앞으로 f0~f1('칵') → end에 내려놓기 시작. BSAU.rack(BS3_RK.b0) 와 맞춘다
const BS3_RK = {l0:0.08, l1:0.4, b0:0.43, b1:0.56, f0:0.73, f1:0.83, end:1.05}, BS3_PUMP = 0.11;
const bs3Ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
function bs3Frame(now){
  BS3.raf = 0;
  const c = BS3.R.domElement;
  if (!c.isConnected || document.hidden) return;   // 무대가 사라지면 멈춘다 (다시 붙으면 bs3Mount가 켠다)
  BS3.raf = requestAnimationFrame(bs3Frame);
  const A = BS3.a, O = BS3.o, T = O.T, dt = Math.max(0, Math.min(0.05, (now - A.last) / 1000)); A.last = Math.max(A.last, now); A.t += dt;
  const slot = c.parentNode, w = slot.clientWidth, h = slot.clientHeight;
  if (!w || !h) return;   // 무대가 숨겨져 있으면 그리지 않는다
  if (w && h && (c.width !== Math.round(w * BS3.R.getPixelRatio()) || c.height !== Math.round(h * BS3.R.getPixelRatio()))){ BS3.R.setSize(w, h, false); BS3.cam.aspect = w / h; BS3.cam.updateProjectionMatrix(); }
  const ctx = BS3.ctx || {}, g = ctx.g, me = ctx.me || 0;
  const Lay = BSV.lay, fx = BSV.fx || '', P = A.prev;
  // 인물들 (둘이면 딜러 하나). 지금 움직이는 사람: 쏘는 사람 → 아이템 쓰는 사람 → 톱질하는 사람 → 그 사람 차례. 장전은 가운데(가장 앞) 사람
  const figs = bs3Figs(g, me), fOf = i => figs.find(f => f.i === i) || null;
  const multi = figs.length > 1;
  const fovT = multi ? 47 : 40; if (BS3.cam.fov !== fovT){ BS3.cam.fov = fovT; BS3.cam.updateProjectionMatrix(); }
  const I0 = BSV.item;
  let actI = BSV.shooter === 'op' && BSV.si !== undefined && BSV.si !== null ? BSV.si : I0 && I0.by === 'op' && I0.i !== undefined ? I0.i : BSV.fx === 'saw' && BSV.sawBy === 'op' && BSV.sawI !== undefined ? BSV.sawI : g && !g.over && g.turn !== me ? g.turn : A.actI;
  if (!fOf(actI)) actI = figs[0].i;
  A.actI = actI;
  // Fa: 움직이는 상대, Fl: 장전하는 사람 = 살아 있는 사람 중 가운데에 가장 가까운 사람 (탈락한 사람은 장전하지 않는다)
  const alive = f => !(g && g.pl[f.i] && g.pl[f.i].out);
  const Fa = fOf(actI), Fl = figs.filter(alive).sort((a, b) => Math.abs(a.seat.position.x) - Math.abs(b.seat.position.x))[0] || figs[Math.floor((figs.length - 1) / 2)];
  const headOf = f => f.head.getWorldPosition(new T.Vector3());
  // 펌프질하는 사람: 장전 뒤엔 장전한 사람, 쏜 뒤엔 쏜 사람, 맥주는 마신 사람 ('me'면 내 눈앞에서)
  const racking = A.rackT < BS3_RK.end && !Lay, rackMe = racking && BSV.rackBy === 'me';
  let Fr = racking && !rackMe ? (BSV.rackBy !== null && BSV.rackBy !== undefined && fOf(BSV.rackBy)) || Fl : null;
  if (Fr && ((Fr.kb || 0) > 0.05 || !alive(Fr))) Fr = Fl;   // 맞아 넘어졌거나 탈락한 사람 대신 가운데 사람이 당긴다
  // 상태가 바뀐 순간을 잡는다
  if (fx !== P.fx){ if (fx === 'bang') { A.bangT = 0; A.hitMe = BSV.flash === 'p' + me; A.hitT = 0;
    // 내가 맞으면 그 순간 시야가 꺼진다 (톱으로 자른 총이면 더 오래). 탈락이면 짧게 끊고 쓰러지는 모습을 보여 준다
    // 상대가 맞으면 화면은 그대로, 맞은 사람이 뒤로 넘어갔다가 일어난다 (톱이면 더 오래 누워 있다)
    const big = (BSV.dmg || 1) > 1;
    if (BSV.flash && A.hitMe){ const out = g && g.pl[me] && g.pl[me].out; A.blackT = 0; A.blackD = out ? 0.55 : big ? 2.6 : 1.35; A.blackF = out ? 0.45 : 0.65; }
    else if (BSV.flash){ const fh = figs.find(f => 'p' + f.i === BSV.flash); if (fh && alive(fh)){ fh.kbT = 0; fh.kbD = big ? 2.0 : 0.9; } } } if (fx === 'click') A.clickT = 0; if (fx === 'rack'){ A.rackT = 0; A.rk0 = {p:A.gP.clone(), q:A.gQ.clone()}; A.ejQ = null; } if (fx === 'saw') A.sawT = 0; }
  if (BSV.eject !== P.eject && BSV.eject !== null && BSV.eject !== undefined){ if (A.rackT < BS3_RK.b1) A.ejQ = !!BSV.eject; else bs3Eject(!!BSV.eject); }   // 펌프를 끝까지 당기는 순간에 탄피가 튀어나온다
  if (Lay && !P.lay) A.layT = 0;
  // 탁자에 남은 탄피·잘린 총신 조각은 새로 장전할 때(장전 횟수가 바뀌면) 치운다. 새 판이거나 화면이 가려진 사이에 장전돼도 치워진다
  const loadKey = g ? `${g.n}:${g.stake}:${g.load}` : '';
  if (loadKey !== A.loadKey){ A.loadKey = loadKey; O.ejects.splice(0).forEach(s => BS3.scene.remove(s)); }
  if (Lay && Lay.in && Lay.in.length > (P.inN || 0)) A.feed = {k:Lay.in[Lay.in.length - 1], t:0};
  P.fx = fx; P.eject = BSV.eject; P.lay = !!Lay; P.inN = Lay && Lay.in ? Lay.in.length : 0;
  A.blackT = (A.blackT === undefined ? 99 : A.blackT) + dt; A.layT += dt; A.rackT += dt; A.bangT += dt; A.clickT += dt; A.sawT += dt; A.hitT += dt;

  // 총의 목표 자세
  const camP = new T.Vector3(0, 1.1, 1.62), headW = new T.Vector3(0, 0.82, -1.0);
  const shooter = BSV.hold ? 'me' : BSV.shooter || null, aim = BSV.aim || 'rest';
  let gp, gq;
  const SAW_D = 1.6, CUT = 1.3, sawing = A.sawT < SAW_D, sawBy = BSV.sawBy || 'op';
  if (Lay){ gp = bs3S(Fl, 0.02, 0.05, -0.5); gq = bs3Q(bs3D(Fl, -1, 0, 0.18), 'flip'); }
  else if (sawing && sawBy === 'op'){ gp = bs3S(Fa, 0.16, 0.07, -0.42); gq = bs3Q(bs3D(Fa, -1, 0, 0.85), 'up'); }   // 딜러가 탁자에 총을 눕혀 누르고 자른다
  else if (sawing){ gp = new T.Vector3(0.18, 0.42, 0.62); gq = bs3Q(new T.Vector3(-1, -0.25, -0.9), 'up'); }   // 내가 자를 때는 눈앞에서
  else if (shooter === 'op' && ((Fa.kb || 0) > 0.05 || !alive(Fa))){ gp = bs3S(Fa, 0.08, 0.035, -0.5); gq = bs3Q(bs3D(Fa, -1, 0, 0.25), 'flip'); }   // 쏜 사람이 맞아 넘어지면 총은 손에서 떨어져 탁자 위로
  else if (rackMe){ gp = new T.Vector3(0.1, 0.7, 0.92); gq = bs3Q(new T.Vector3(-0.85, -0.22, -0.75), 'up'); }   // 내가 펌프질: 오른쪽 아래에서 총구를 앞쪽 탁자로 비스듬히
  else if (Fr){ gp = bs3S(Fr, 0.07, 0.33, -0.62); gq = bs3Q(bs3D(Fr, -0.85, -0.22, -0.5), 'up'); }   // 상대: 허리 높이에서 총구를 앞·아래로 비스듬히 들고 당긴다
  else if (shooter === 'me'){
    const atMe = aim === 'down' || (BSV.hold && BSV.aimT === me);
    const tI = BSV.hold ? BSV.aimT : BSV.ti, fT = tI !== undefined && tI !== null ? fOf(tI) : null;
    if (atMe){ gp = new T.Vector3(0.03, 0.82, 0.72); gq = bs3Q(camP.clone().sub(gp).add(new T.Vector3(0, 0.05, 0)), 'up'); }
    else { gp = new T.Vector3(0.16, 0.42, 0.92); gq = bs3Q((fT ? headOf(fT) : multi ? new T.Vector3(0, 0.6, -1.0) : headW.clone()).sub(gp), 'up'); }   // 여럿이면 겨눈 사람 쪽으로 (아직 안 골랐으면 가운데)
  } else if (shooter === 'op'){
    const fT = BSV.ti !== undefined && BSV.ti !== null ? fOf(BSV.ti) : null;
    if ((Fa.kb || 0) > 0.05 || !alive(Fa)){ gp = bs3S(Fa, 0.08, 0.035, -0.5); gq = bs3Q(bs3D(Fa, -1, 0, 0.25), 'flip'); }   // 쏜 사람이 맞아 넘어지면 총은 손에서 떨어져 탁자 위로
    else if (aim === 'down'){ gp = bs3S(Fa, 0.0, 0.55, -0.52); gq = bs3Q(camP.clone().sub(gp), 'up'); }
    else if (fT && fT !== Fa){ gp = bs3S(Fa, 0.0, 0.58, -0.58); gq = bs3Q(headOf(fT).sub(gp), 'up'); }   // 다른 상대를 쏜다
    else { gp = bs3S(Fa, 0.2, 0.6, -0.6); gq = bs3Q(headOf(Fa).add(new T.Vector3(0, -0.05, 0)).sub(gp), 'up'); }
  } else { gp = new T.Vector3(0.0, 0.031, 0.08); gq = bs3Q(new T.Vector3(-1, 0, -0.12), 'side'); }
  // 펌프질: 손이 먼저 총에 닿고(0~L0), 부드럽게 들어 올려(L0~L1) 들고 있다가, 내려놓는 건 평소처럼 천천히 돌아간다
  if ((rackMe || Fr) && A.rk0 && !(shooter === 'op' && ((Fa.kb || 0) > 0.05 || !alive(Fa)))){
    const u = bs3Ease((A.rackT - BS3_RK.l0) / (BS3_RK.l1 - BS3_RK.l0));
    A.gP.copy(A.rk0.p).lerp(gp, u); A.gP.y += Math.sin(Math.PI * u) * 0.05;
    A.gQ.copy(A.rk0.q).slerp(gq, u);
  } else {
    const k = bs3Damp(shooter || sawing ? 9 : 7, dt);
    A.gP.lerp(gp, k); A.gQ.slerp(gq, k);
    if (A.rk0 && A.rackT >= BS3_RK.end) A.rk0 = null;
  }
  O.gun.position.copy(A.gP); O.gun.quaternion.copy(A.gQ);
  // 반동·딸깍
  const rb = A.bangT < 0.5 ? Math.exp(-A.bangT * 14) : 0, rc = A.clickT < 0.3 ? Math.sin(A.clickT * 40) * Math.exp(-A.clickT * 12) : 0;
  // 펌프: 빠르게 끝까지 당겨 '착' → 잠깐 멈춤 → 앞으로 밀어 '칵'. 끝에 닿을 때마다 총이 살짝 튄다
  const R = BS3_RK, rt = A.rackT, rp = rt < R.b0 || rt > R.f1 ? 0 : rt < R.b1 ? bs3Ease((rt - R.b0) / (R.b1 - R.b0)) : rt < R.f0 ? 1 : 1 - bs3Ease((rt - R.f0) / (R.f1 - R.f0));
  const jl = (t0, t) => t > t0 && t < t0 + 0.3 ? Math.exp(-(t - t0) * 22) : 0, jb = jl(R.b1, rt), jf = jl(R.f1, rt);
  if (A.ejQ !== null && A.ejQ !== undefined && rt >= R.b1){ O.gun.updateMatrixWorld(true); bs3Eject(A.ejQ); A.ejQ = null; }
  O.gunIn.position.set(rb * 0.07 + rc * 0.006 - rp * 0.018 + jb * 0.012 - jf * 0.014, rb * 0.015 + jb * 0.006, 0);   // 펌프를 당기는 동안 총은 앞으로 조금 밀린다
  O.gunIn.rotation.set(0, 0, -rb * 0.35 + jb * 0.05 - jf * 0.035);
  O.pump.position.x = rp * BS3_PUMP;
  // 톱: 총신 길이
  if (sawing && A.sawT < CUT){ A.saw = 1; }
  else if (sawing && !A.cut){ A.cut = true; A.saw = 0.58; O.gun.updateMatrixWorld(true); bs3Chop(); }
  else { const sawTo = g && g.saw ? 0.58 : 1; A.saw += (sawTo - A.saw) * bs3Damp(6, dt); }
  if (!sawing) A.cut = false;
  O.barrel.scale.x = A.saw;
  if (sawing && A.sawT > 0.35 && A.sawT < CUT) O.gunIn.position.y += Math.sin(A.sawT * 90) * 0.0015;
  // 돋보기: 기관부가 푸르게 빛난다
  A.peek += ((fx === 'peek' ? 0.35 + Math.sin(A.t * 9) * 0.12 : 0) - A.peek) * bs3Damp(10, dt); O.peekM.opacity = A.peek;
  O.gun.updateMatrixWorld(true);
  const W = p => p.clone().applyMatrix4(O.gunIn.matrixWorld);

  // 톱질: 자를 곳 위로 톱이 내려와 앞뒤로 켜고, 쇠붙이에 불똥이 튄다
  if (sawing){
    const cutW = W(new T.Vector3(-0.29, 0.032, 0));
    O.saw.visible = A.sawT < CUT + 0.2;
    const across = new T.Vector3(0, 0, 1).applyQuaternion(O.gun.quaternion), upW = new T.Vector3(0, 1, 0).applyQuaternion(O.gun.quaternion);
    const into = bs3Ease((A.sawT - 0.1) / 0.3), stroke = A.sawT > 0.35 && A.sawT < CUT ? Math.sin((A.sawT - 0.35) * 19) * 0.07 : 0;
    const depth = bs3Ease((A.sawT - 0.35) / (CUT - 0.35)) * 0.034;
    const ax = across.clone().multiplyScalar(-1);
    O.saw.position.copy(cutW).addScaledVector(upW, 0.026 + (1 - into) * 0.14 - depth + (A.sawT > CUT ? (A.sawT - CUT) * 0.8 : 0)).addScaledVector(across, stroke);
    O.saw.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(ax, upW, new T.Vector3().crossVectors(ax, upW)));
    if (A.sawT > 0.35 && A.sawT < CUT){
      for (let i = 0; i < 3; i++){ const sv = O.sparkV.find(x => x.life <= 0); if (!sv) break; sv.life = 0.25 + Math.random() * 0.3; sv.p.copy(cutW).addScaledVector(upW, 0.02); sv.v.set((Math.random() - .5) * 0.9, 0.3 + Math.random() * 0.8, (Math.random() - .5) * 0.9).addScaledVector(across, (Math.random() - .5) * 1.2); }
    }
  } else O.saw.visible = false;
  O.sparkV.forEach(sv => {
    if (sv.life > 0){ sv.life -= dt; sv.v.y -= 3 * dt; sv.p.addScaledVector(sv.v, dt); sv.m.visible = true; sv.m.position.copy(sv.p); sv.m.lookAt(sv.p.clone().add(sv.v)); }
    else sv.m.visible = false;
  });
  // 총구 불꽃·연기
  const mz = W(O.GP.muzzle);
  const fl = A.bangT < 0.16 ? 1 - A.bangT / 0.16 : 0;
  O.flash.position.copy(mz); O.flash.material.opacity = fl; O.flash.scale.setScalar(0.25 + fl * 0.45); O.flash.material.rotation = A.t * 3;
  O.flashL.position.copy(mz); O.flashL.intensity = fl * 6;
  if (A.bangT === 0 || (A.bangT < dt * 1.5 && !A.smoked)){ A.smoked = true; const fwd = W(O.GP.muzzle.clone().add(new T.Vector3(-1, 0, 0))).sub(mz).normalize(); O.smokes.forEach((s, i) => { s.position.copy(mz); s.userData.v.copy(fwd).multiplyScalar(0.15 + Math.random() * 0.35).add(new T.Vector3((Math.random() - .5) * .1, 0.12 + Math.random() * 0.15, (Math.random() - .5) * .1)); s.userData.t = -i * 0.02; }); }
  if (A.bangT > 0.2) A.smoked = false;
  O.smokes.forEach(s => { const u = s.userData; u.t += dt; if (u.t < 0 || u.t > 1.6){ s.material.opacity = 0; return; } s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(0.96); s.scale.setScalar(0.08 + u.t * 0.35); s.material.opacity = 0.5 * (1 - u.t / 1.6); });

  // 아이템 쓰는 동작: 누가(딜러/나) 무엇을. 딜러는 오른손으로 집어 들고, 나는 화면 아래에서 올라온다
  const I = BSV.item;
  if (I !== P.item){ A.itT = 0; P.item = I; Object.values(O.IT).forEach(o => { o.visible = false; }); }
  A.itT = (A.itT || 0) + dt;
  let itHand = null;
  if (I && O.IT[I.it]){
    const m = O.IT[I.it], D = I.d || 1.4, u = Math.min(1, A.itT / D), op = I.by === 'op';
    const pick = op ? bs3S(Fa, 0.36, 0.04, -0.52) : new T.Vector3(0.3, 0.35, 1.3);
    const mouth = op ? bs3S(Fa, 0, 0.71, -0.9) : new T.Vector3(0.06, 0.86, 1.3);
    const inn = bs3Ease(u / 0.25), out = bs3Ease((u - 0.78) / 0.22);
    let p = pick.clone(), q = new T.Quaternion();
    m.visible = u < 1; m.scale.setScalar(out > 0 ? Math.max(0.001, 1 - out * 0.7) : 1);
    if (I.it === 'glass'){
      const over = W(O.GP.eject).add(new T.Vector3(0, 0.11, 0.03));
      p = pick.clone().lerp(over, inn).lerp(pick, out); p.x += Math.sin(A.t * 3) * 0.006 * (1 - out);
      q.setFromEuler(new T.Euler(-1.25, 0, 0));   // 렌즈가 위를 보게 눕혀 총을 들여다본다
    } else if (I.it === 'cig'){
      p = pick.clone().lerp(mouth, inn).lerp(pick, out);
      q.setFromEuler(new T.Euler(0, op ? -Math.PI / 2 + Fa.seat.rotation.y : Math.PI / 2 + 0.3, 0.15));
      const drag = u > 0.3 && u < 0.7 ? Math.sin((u - 0.3) / 0.4 * Math.PI) : 0;
      O.emberM.emissiveIntensity = 0.6 + drag * 4;
      if (u > 0.55 && !A.puffed){ A.puffed = true; O.puffs.forEach((sp, i) => { sp.position.copy(mouth).add(op ? bs3D(Fa, 0, 0.01, 0.05) : new T.Vector3(0, 0.01, -0.06)); sp.userData.v.copy(op ? bs3D(Fa, (Math.random() - .5) * 0.08, 0.1 + Math.random() * 0.08, 0.12) : new T.Vector3((Math.random() - .5) * 0.08, 0.1 + Math.random() * 0.08, -0.15)); sp.userData.t = -i * 0.07; }); }
    } else if (I.it === 'beer'){
      p = pick.clone().lerp(mouth.clone().add(op ? bs3D(Fa, 0, -0.04, 0.06) : new T.Vector3(0, -0.04, -0.04)), inn).lerp(pick, out);
      const tilt = bs3Ease((u - 0.25) / 0.15) * (1 - bs3Ease((u - 0.65) / 0.15));
      q.setFromEuler(new T.Euler(op ? tilt * 1.6 : -tilt * 1.6, op ? Fa.seat.rotation.y : 0, 0, 'YXZ'));
    } else if (I.it === 'cuff'){
      const ct = I.t !== undefined && I.t !== null ? I.t : op ? me : actI, cf = ct === me ? null : fOf(ct);
      const tgt = !cf ? new T.Vector3(0, 0.06, 0.52) : bs3S(cf, 0, 0.07, -0.6);   // 수갑은 묶일 사람 앞으로 미끄러진다
      const slide = bs3Ease((u - 0.15) / 0.45);
      p = pick.clone().lerp(tgt, slide); p.y += Math.sin(Math.PI * slide) * 0.12;
      q.setFromEuler(new T.Euler(0, A.itT * 6 * (1 - slide), 0));
      m.scale.setScalar(1);
      if (u > 0.6 && !A.snapped){ A.snapped = true; A.clickT = 0; }   // 철컥 잠기는 순간 살짝 흔들림
    }
    m.position.copy(p); m.quaternion.copy(q);
    if (op && u < 0.8) itHand = p.clone().add(new T.Vector3(0.02, -0.02, 0.02));
  }
  if (!I){ A.puffed = false; A.snapped = false; O.emberM.emissiveIntensity = 0.5; }
  O.puffs.forEach(sp => { const u2 = sp.userData; u2.t += dt; if (u2.t < 0 || u2.t > 2){ sp.material.opacity = 0; return; } sp.position.addScaledVector(u2.v, dt); sp.scale.setScalar(0.05 + u2.t * 0.16); sp.material.opacity = 0.45 * (1 - u2.t / 2); });
  // 묶인 사람: 딜러면 두 손목에 수갑, 나면 내 앞 탁자에 수갑이 놓인다
  const cuffedF = g ? figs.find(f => g.pl[f.i] && g.pl[f.i].cuffed && !g.pl[f.i].out) : null, dCuffed = !!cuffedF, meCuffed = g && g.pl[me] && g.pl[me].cuffed;
  const cuffShow = !(I && I.it === 'cuff' && A.itT < (I.d || 1.4) * 0.6);
  O.cuffOn.visible = cuffShow && (dCuffed || meCuffed);
  if (meCuffed && !dCuffed){ O.cuffOn.position.set(0, 0.012, 0.52); O.cuffOn.rotation.set(0, 0.2, 0); }
  // 탁자에 늘어놓은 탄 (장전 중), 손에 쥔 탄
  const n = Lay ? Lay.live + Lay.blank : 0, F = A.feed;
  const slotP = i => bs3S(Fl, (i - (n - 1) / 2) * 0.075, 0.0125, -0.2 + ((i * 7) % 3) * 0.012);
  const slotX = i => i - (n - 1) / 2;   // 왼쪽 탄은 왼손, 오른쪽 탄은 오른손
  O.lay.forEach((s, i) => {
    if (i >= n){ s.visible = false; return; }
    const inside = Lay.in && Lay.in.includes(i), held = F && F.k === i && F.t < 0.42;
    s.visible = !inside || held;
    const appear = bs3Ease((A.layT - i * 0.07) / 0.3);
    if (!held){ const p = slotP(i); s.position.set(p.x, p.y + (1 - appear) * 0.12, p.z); s.rotation.set(0, (i * 0.7) % 0.5 - 0.25 + Fl.seat.rotation.y, Math.PI / 2); s.scale.setScalar(Math.max(0.001, appear)); }
  });
  // 딜러 손: 장전(탄 집기 → 넣기), 들고 쏘기(펌프·손잡이), 쉬기. 여럿이면 움직이는 사람(Fa)·장전하는 사람(Fl)만 동작하고 나머지는 손을 탁자에 둔다
  const rest = (f, A2, i) => A2.p.lerp(bs3S(f, A2.s * 0.3, 0.03 + Math.sin(A.t * 1.3 + i + f.i) * 0.006, -0.62), bs3Damp(8, dt));
  const toW = (A2, p, kk) => A2.p.lerp(p, bs3Damp(kk || 14, dt));
  const dealerHolds = shooter === 'op';   // 상대가 쏠 때는 쏘는 사람이 총을 든다
  figs.forEach(f => {
    f.body.updateMatrixWorld(true);
    const fc = g && g.pl[f.i] && g.pl[f.i].cuffed && !g.pl[f.i].out, dead = !alive(f) || (f.kb || 0) > 0.3;   // 넘어져 있는 동안도 손이 늘어진다
    const bq = f.body.getWorldQuaternion(new T.Quaternion());
    const gunC = W(new T.Vector3(0, 0, 0)), gunAx = W(new T.Vector3(1, 0, 0)).sub(gunC).normalize();
    const gunZ = W(new T.Vector3(0, 0, 1)).sub(gunC), bodyW = new T.Vector3(0, 0.3, 0).applyMatrix4(f.body.matrixWorld);
    const gripZ = bodyW.clone().sub(gunC).dot(gunZ) > 0 ? 0.035 : -0.035;   // 총의 몸 쪽 옆면
    const bodyC = new T.Vector3(0, 0.12, 0.02).applyMatrix4(f.body.matrixWorld);
    f.arms.forEach((A2, i) => {
      A2.sh.copy(A2.shL).applyMatrix4(f.body.matrixWorld); A2.q = bq; A2.palmAt = null; A2.palmAx = null;   // 기본: 손바닥이 아래 (탁자 짚기)
      const rising = f.kbT !== undefined && f.kbT > 0.3 + (f.kbD || 0);
      if (rising && alive(f)){   // 일어나는 중: 손을 먼저 탁자 가장자리 위로 들어 올린다 (밑에서 탁자를 뚫고 올라오지 않게)
        A2.p.lerp(bs3S(f, A2.s * 0.32, 0.32, -0.95), bs3Damp(12, dt));
      } else if ((f.kb || 0) > 0.05 && alive(f)){   // 맞아서 넘어가는 중: 팔이 몸을 따라 힘없이 뒤로 축 늘어진다 (탁자를 짚지 않는다)
        A2.p.lerp(A2.sh.clone().add(new T.Vector3(A2.s * 0.16, -0.8, 0.08).applyQuaternion(bq)), bs3Damp(14, dt));
      } else if (dead){   // 탈락한 사람: 손을 탁자 위에 축 늘어뜨린 채 움직이지 않는다 (숨쉬기·흔들림 없음)
        A2.p.lerp(bs3S(f, A2.s * 0.24, 0.02, -0.5), bs3Damp(6, dt));
      } else if (Lay && f === Fl && F && F.t < 0.6 && ((slotX(F.k) >= 0) === (A2.s > 0))){
        // 탄 하나 넣기 (0.56초): 집으러 가기 → 쥐기 → 약실로 → 밀어 넣기 → 돌아오기
        const sp = slotP(F.k).add(new T.Vector3(0, 0.02, 0)), lp = W(O.GP.load).add(new T.Vector3(0, 0.025, 0)), hov = bs3S(Fl, A2.s * 0.22, 0.12, -0.45);
        const t = F.t / 0.56;
        let p;
        if (t < 0.32) p = hov.clone().lerp(sp, bs3Ease(t / 0.32));
        else if (t < 0.42) p = sp.clone();
        else if (t < 0.78) p = sp.clone().lerp(lp, bs3Ease((t - 0.42) / 0.36)).add(new T.Vector3(0, Math.sin(Math.PI * (t - 0.42) / 0.36) * 0.06, 0));
        else if (t < 0.86) p = lp.clone().add(new T.Vector3(0, -0.012 * Math.sin(Math.PI * (t - 0.78) / 0.08), 0));
        else p = lp.clone().lerp(hov, bs3Ease((t - 0.86) / 0.14));
        A2.p.copy(p);
        const s = O.lay[F.k];
        if (t >= 0.32 && t < 0.86){ s.visible = true; s.position.copy(p).add(new T.Vector3(0, -0.02, 0.0)); s.rotation.set(0, 0, Math.PI / 2 * (1 - bs3Ease((t - 0.42) / 0.36))); s.scale.setScalar(1); }
        else if (t >= 0.86) s.visible = false;
      } else if (itHand && f === Fa && A2.s > 0){ toW(A2, itHand, 18); A2.palmAt = O.IT && I && O.IT[I.it] ? O.IT[I.it].getWorldPosition(new T.Vector3()) : null;   // 손바닥이 쥔 아이템 쪽
      } else if (fc && !(f === Fa && shooter) && !(Lay && f === Fl)){ toW(A2, bs3S(f, A2.s * 0.075, 0.035, -0.6), 10); A2.palmAt = bs3S(f, 0, 0.035, -0.6);   // 묶인 손: 손바닥끼리 마주 본다
        if (A2.s > 0 && f === cuffedF){ O.cuffOn.position.copy(bs3S(f, 0, 0.04, -0.6)); O.cuffOn.rotation.set(0, f.seat.rotation.y, 0); }
      } else if (f === Fa && sawing && sawBy === 'op' && A.sawT < CUT + 0.25){   // 톱질: 왼손은 총을 누르고, 오른손은 톱 손잡이
        if (A2.s > 0){ toW(A2, W(O.GP.grip).add(new T.Vector3(0, 0.03, 0)), 14); A2.palmAt = gunC; A2.palmAx = gunAx; }
        else { O.saw.updateMatrixWorld(true); toW(A2, new T.Vector3(0.165, 0.04, 0).applyMatrix4(O.saw.matrixWorld), 30); }
      } else if (Lay && n && f === Fl){ toW(A2, W(A2.s < 0 ? O.GP.pump : O.GP.grip).add(new T.Vector3(0, 0.02, 0)), 10); A2.palmAt = gunC; A2.palmAx = gunAx; }   // 다른 손은 총을 붙잡는다
      else if (f === Fr){   // 펌프질: 한 손은 아래에서 펌프를 받쳐 당기고, 다른 손은 몸 쪽에서 손잡이를 감싸 쥔다
        if (A2.s < 0) toW(A2, W(O.GP.pump.clone().add(new T.Vector3(rp * BS3_PUMP, -0.012, 0))), 40);
        else toW(A2, W(O.GP.grip.clone().add(new T.Vector3(0, 0.025, gripZ))), 18);
        A2.palmAt = gunC; A2.palmAx = gunAx;
      }
      else if (dealerHolds && f === Fa){ toW(A2, W(A2.s < 0 ? O.GP.pump : O.GP.grip.clone().add(new T.Vector3(0, 0.025, gripZ))), 16); A2.palmAt = gunC; A2.palmAx = gunAx; }   // 손바닥으로 총을 감싼다 (손잡이 손은 몸 쪽 옆에서)
      else rest(f, A2, i);
      bs3Arm(A2);
    });
  });
  if (F){ F.t += dt; if (F.t > 0.6) A.feed = null; }

  // 탄피: 튀어 올랐다가 탁자에 떨어져 구른다
  O.ejects.forEach(s => {
    const u = s.userData; if (u.rest) return;
    u.v.y -= 3.2 * dt; s.position.addScaledVector(u.v, dt); s.rotation.x += u.w.x * dt; s.rotation.z += u.w.z * dt;
    if (s.position.y < 0.012 && Math.abs(s.position.x) < 1.05 && Math.abs(s.position.z) < 0.8){ s.position.y = 0.012; u.v.y *= -0.32; u.v.x *= 0.6; u.v.z *= 0.6; u.w.multiplyScalar(0.5); if (Math.abs(u.v.y) < 0.08){ u.rest = true; s.rotation.set(0, s.rotation.y, Math.PI / 2); } }
    if (s.position.y < -1) u.rest = true;
  });

  // 인물: 숨쉬기, 고개, 눈빛, 맞으면 뒤로 젖힘, 지면 앞으로 고꾸라진다 (사람마다 따로)
  const meOut = g && g.pl[me] && g.pl[me].out;
  A.meFall = meOut ? (A.meFall || 0) + dt : 0;
  const iu = I ? Math.min(1, A.itT / (I.d || 1.4)) : 0;
  figs.forEach(f => {
    const out = !!(g && g.pl[f.i] && g.pl[f.i].out);
    f.fall = out ? (f.fall || 0) + dt : 0;
    const B = f.body;
    if (out){
      const t = f.fall, back = t < 0.25 ? Math.sin(Math.PI * t / 0.5) * 0.35 : Math.max(0, 0.35 - (t - 0.25) * 2.5);
      const fwd = bs3Ease((t - 0.3) / 0.6), bounce = t > 0.9 && t < 1.3 ? Math.sin((t - 0.9) / 0.4 * Math.PI) * 0.06 : 0;
      B.rotation.x = -back + fwd * 0.62 - bounce; B.position.y = 0; B.position.z = -fwd * 0.04; B.rotation.z = fwd * 0.1;   // 탁자에 엎어지되 가슴이 탁자를 뚫지 않을 만큼만 숙인다 (고개는 따로 떨군다)
    } else if (f.kbT !== undefined){   // 맞아서 뒤로 넘어졌다가(0.3초) 누워 있다가(kbD) 일어난다(0.8초)
      f.kbT += dt; const t = f.kbT, D = f.kbD;
      f.kb = t < 0.3 ? bs3Ease(t / 0.3) : t < 0.3 + D ? 1 : t < 1.1 + D ? 1 - bs3Ease((t - 0.3 - D) / 0.8) : 0;
      const bounce = t > 0.3 && t < 0.55 ? Math.sin((t - 0.3) / 0.25 * Math.PI) * 0.07 : 0;
      B.rotation.x = -f.kb * 1.5 + bounce; B.position.y = -f.kb * 0.22; B.position.z = -f.kb * 0.28; B.rotation.z = f.kb * (f.i % 2 ? 0.1 : -0.1);   // 완전히 뒤로 벌렁 눕는다
      if (t >= 1.1 + D){ f.kbT = undefined; f.kb = 0; }
    } else { B.rotation.x *= 0.9; B.rotation.z *= 0.9; B.position.y *= 0.9; B.position.z *= 0.9; f.kb = 0; }
    const hit = !A.hitMe && A.hitT < 0.6 && BSV.flash === 'p' + f.i ? Math.exp(-A.hitT * 6) : 0;
    if (f.torso) f.torso.scale.y = out ? 1 : 1 + Math.sin(A.t * 1.6 + f.i) * 0.008;   // 탈락하면 숨쉬기도 멈춘다
    const act = f === Fa;
    const look = Lay && f === Fl ? 0.35 : act && I && I.by === 'op' && I.it === 'glass' ? 0.45 : act && I && I.by === 'op' && I.it === 'beer' && iu > 0.3 && iu < 0.75 ? -0.35 : act && shooter === 'op' ? 0.1 : 0.05;
    f.head.rotation.x += ((out ? 0.75 : look + Math.sin(A.t * 0.7 + f.i * 2) * 0.03 - hit * 0.6) - f.head.rotation.x) * bs3Damp(8, dt);
    // 여럿이면 지금 움직이는 사람 쪽을 본다 (나 자신이면 앞을)
    const yaw = multi && !act && Fa && !out ? Math.atan2(Fa.seat.position.x - f.seat.position.x, 0.6) * 0.5 - f.seat.rotation.y * 0.5 : 0;
    f.head.rotation.y += ((out ? 0 : Math.sin(A.t * 0.43 + f.i) * 0.06 + yaw) - f.head.rotation.y) * bs3Damp(4, dt);
    f.head.position.z = -hit * 0.06;
    const fl2 = out ? 0.15 : 3 + Math.sin(A.t * 23 + f.i * 5) * 0.25 + (Math.random() < 0.01 ? -2 : 0);
    f.eyeM.emissiveIntensity = fl2 * 0.5; if (f.eyeG) f.eyeG.material.opacity = out ? 0 : 0.55 + (fl2 - 3) * 0.3; if (f.eyeL) f.eyeL.intensity = out ? 0.01 : fl2 * 0.05;
  });
  // 전등이 가끔 깜빡인다
  const lf = Math.random() < 0.006 ? 0.55 : 1; O.spot.intensity += (22 * lf - O.spot.intensity) * bs3Damp(20, dt); O.bulb.material.emissiveIntensity = 3 * O.spot.intensity / 22;
  // 카메라: 살짝 흔들림, 쏠 때 떨림 (내가 맞으면 크게)
  const sh = (A.bangT < 0.5 ? Math.exp(-A.bangT * 9) * (A.hitMe ? 0.06 : 0.02) : 0);
  BS3.cam.position.set(Math.sin(A.t * 0.5) * 0.015 + (Math.random() - .5) * sh, 1.1 + Math.sin(A.t * 0.8) * 0.008 + (Math.random() - .5) * sh, 1.62);
  const lookP = new T.Vector3(0, 0.3 + (A.hitMe && A.hitT < 0.4 ? -0.08 * Math.exp(-A.hitT * 5) : 0), -0.45);
  // 암전이 풀릴 때: 쓰러졌다 일어나는 것처럼 시야가 아래에서 위로 올라온다 (암전 동안은 낮은 자리에 있다가, 밝아지는 동안 1초에 걸쳐 제자리로)
  if (A.hitMe && !meOut && A.blackD > 0.6){
    const rt = A.blackT - 0.05 - A.blackD, low = rt < 0 ? 1 : 1 - bs3Ease(rt / 1.0);
    if (low > 0){ BS3.cam.position.y -= low * 0.42; BS3.cam.position.z -= low * 0.1; BS3.cam.position.x += low * 0.06; lookP.y -= low * 0.32; }
  }
  // 내가 지면: 시야가 옆으로 기울며 탁자 높이로 무너지고, 점점 어두워진다
  const up2 = g && !g.over ? bs3Ease((A.meFall - 3.2) / 1.2) : 0;   // 여럿이 하는 판에서 먼저 탈락하면 잠시 뒤 다시 일어나 구경한다
  const mf = bs3Ease((A.meFall - 0.6) / 1.0) * (1 - up2), roll = mf * 1.25 + (A.meFall > 1.6 && A.meFall < 1.95 ? Math.sin((A.meFall - 1.6) / 0.35 * Math.PI) * 0.06 : 0);
  if (mf > 0){ BS3.cam.position.lerp(new T.Vector3(0.45, 0.16, 1.05), mf); lookP.lerp(new T.Vector3(-0.5, 0.02, 0.45), mf); }
  BS3.cam.up.set(Math.sin(roll), Math.cos(roll), 0);
  if (I && I.by === 'me' && I.it === 'beer'){ const tl = bs3Ease((iu - 0.25) / 0.15) * (1 - bs3Ease((iu - 0.65) / 0.15)); lookP.y += tl * 0.35; }
  BS3.cam.lookAt(lookP);
  const bt = A.blackT - 0.05, black = bt < 0 ? 1 : bt < A.blackD ? 0 : bs3Ease((bt - A.blackD) / A.blackF);   // 총구 불꽃을 0.05초 보여 준 뒤 바로 꺼진다
  BS3.R.toneMappingExposure = 1.15 * (1 - 0.8 * bs3Ease((A.meFall - 1.4) / 1.6) * (1 - up2)) * black;
  BS3.black = black;
  BS3.R.render(BS3.scene, BS3.cam);
  bs3Tags(figs, g, me, w, h);
}
// 인물 머리 위 이름표: 머리 위치를 화면 좌표로 옮겨 HTML로 띄운다 (글자가 또렷하게). 차례인 사람은 밝게, 탈락하면 흐리게
function bs3Tags(figs, g, me, w, h){
  const box = BS3.tags; if (!box) return;
  box.hidden = !g || (BS3.ctx && BS3.ctx.solo);   // 혼자 할 때 상대는 딜러뿐이라 이름표를 달지 않는다
  if (box.hidden) return;
  const T = BS3.T;
  while (box.children.length < figs.length){ const el = document.createElement('span'); el.className = 'bs3-tag'; box.appendChild(el); }
  [...box.children].forEach((el, j) => {
    const f = figs[j]; if (!f){ el.hidden = true; return; }
    const p = g.pl[f.i]; if (!p){ el.hidden = true; return; }
    const v = f.head.getWorldPosition(new T.Vector3()); v.y += 0.24 * f.seat.scale.y; v.project(BS3.cam);
    if (v.z > 1 || BS3.black < 0.2){ el.hidden = true; return; }
    el.hidden = false;
    const nm = p.nm || '?'; if (el.textContent !== nm) el.textContent = nm;
    el.dataset.tagi = f.i;
    el.classList.toggle('turn', !g.over && g.turn === f.i && !p.out);
    el.classList.toggle('out', !!p.out);
    const y = Math.max(52, Math.round((1 - v.y) / 2 * h));   // 위로 잘리지 않게, 왼쪽 위 탄 개수 줄 아래로
    el.style.transform = `translate(${Math.round((v.x + 1) / 2 * w)}px, ${y}px) translate(-50%, -100%)`;
  });
}
// 잘린 총신 조각: 탁자로 떨어져 구른다 (탄피와 같이 다음 장전 때 치운다)
function bs3Chop(){
  const O = BS3.o, T = O.T, gp = new T.Group();
  const b = new T.Mesh(new T.CylinderGeometry(0.017, 0.017, 0.19, 20), O.M.steel); b.castShadow = true; gp.add(b);
  const t = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.08, 16), O.M.steel); t.position.set(0.035, 0.05, 0); t.castShadow = true; gp.add(t);
  gp.position.copy(new T.Vector3(-0.385, 0.02, 0).applyMatrix4(O.gunIn.matrixWorld));
  gp.quaternion.copy(O.gun.quaternion).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2));
  gp.userData = {v:new T.Vector3((Math.random() - .5) * 0.3, 0.25, 0.1), w:new T.Vector3(3, 0, 2), rest:false};
  BS3.scene.add(gp); O.ejects.push(gp);
}
function bs3Eject(live){
  const O = BS3.o, T = O.T, s = O.mkShell(live ? 0xb3261e : 0x2f5fa0);
  O.gun.updateMatrixWorld(true);
  s.position.copy(O.GP.eject.clone().applyMatrix4(O.gunIn.matrixWorld));
  const side = new T.Vector3(0, 0, 1).applyQuaternion(O.gun.quaternion);
  s.userData = {v:side.multiplyScalar(0.5 + Math.random() * 0.3).add(new T.Vector3((Math.random() - .5) * 0.3, 0.9 + Math.random() * 0.4, 0.15)), w:new T.Vector3(8 + Math.random() * 8, 0, 6), rest:false};
  BS3.scene.add(s); O.ejects.push(s);
  if (O.ejects.length > 12) BS3.scene.remove(O.ejects.shift());
}
