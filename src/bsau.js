/* ───── 벅샷 룰렛 소리 (Web Audio로 그 자리에서 합성: 녹음 파일을 쓰지 않는다) ─────
   배경: 낮게 깔리는 화이트 노이즈(방 소리). 연출 소리: 총소리, 딸깍, 펌프, 탄 넣기, 탄피 떨어지는 소리, 톱질, 귀울림, 쓰러짐 등.
   브라우저는 사용자가 한 번 누르기 전에는 소리를 낼 수 없어서, 첫 터치 때 소리 장치를 켠다.
   켜고 끄기는 무대 오른쪽 위 스피커 단추 (이 기기에만 저장). */
const BSA = {ctx:null, on:true, amb:null, vol:0.7};
try { BSA.on = localStorage.getItem('seed10k.bs.sound') !== '0'; } catch(e){}
function bsaInit(){
  if (BSA.ctx) return BSA.ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const c = new AC(); BSA.ctx = c;
  // 마지막 단: 귀울림 때 소리를 먹먹하게 하는 저역 통과 → 압축기 → 출력
  BSA.muff = c.createBiquadFilter(); BSA.muff.type = 'lowpass'; BSA.muff.frequency.value = 20000; BSA.muff.Q.value = 0.5;
  BSA.comp = c.createDynamicsCompressor(); BSA.comp.threshold.value = -6; BSA.comp.knee.value = 6; BSA.comp.ratio.value = 3; BSA.comp.attack.value = 0.002; BSA.comp.release.value = 0.2;
  BSA.master = c.createGain(); BSA.master.gain.value = BSA.on ? BSA.vol : 0;
  BSA.muff.connect(BSA.comp); BSA.comp.connect(BSA.master); BSA.master.connect(c.destination);
  // 방 울림: 작은 타일 방 (약 2초). 시간이 갈수록 고역을 더 깎아 꼬리가 어두워지고, 앞부분에 벽 반사 몇 개를 넣는다
  const sr = c.sampleRate, len = Math.floor(sr * 2.0), ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++){
    const d = ir.getChannelData(ch); let y = 0;
    for (let i = 0; i < len; i++){ const t = i / sr, a = 0.85 * Math.exp(-t * 2.4) + 0.05; y += a * ((Math.random() * 2 - 1) - y); d[i] = y * Math.exp(-t * 3.1) * (t < 0.008 ? t / 0.008 : 1) * 1.6; }
    [[0.0071, 0.7], [0.0123, 0.5], [0.0189, 0.42], [0.0264, 0.3], [0.0347, 0.22]].forEach(([t, g]) => { const k = Math.floor((t + ch * 0.0013) * sr); for (let j = 0; j < 40; j++) d[k + j] += g * (1 - j / 40) * (j % 2 ? -1 : 1); });
  }
  BSA.verb = c.createConvolver(); BSA.verb.buffer = ir;
  BSA.wet = c.createGain(); BSA.wet.gain.value = 0.32; BSA.verb.connect(BSA.wet); BSA.wet.connect(BSA.muff);
  BSA.dry = c.createGain(); BSA.dry.connect(BSA.muff); BSA.dry.connect(BSA.verb);
  // 잡음 원본 (2초, 반복해서 쓴다)
  const nl = c.sampleRate * 2, nb = c.createBuffer(1, nl, c.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
  BSA.noise = nb;
  // 분홍 잡음 (고역으로 갈수록 약해지는 잡음, 폭발·몸통 소리에 쓴다. Paul Kellet의 근사 필터)
  const pb = c.createBuffer(1, nl, c.sampleRate), pd = pb.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < nl; i++){ const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
  BSA.pink = pb;
  BSA.send = c.createGain(); BSA.send.gain.value = 0.7; BSA.send.connect(BSA.verb);   // 총소리처럼 방을 크게 울릴 것만 따로 보낸다
  return c;
}
// 첫 터치에 소리 장치를 켠다 (iOS는 사용자 동작 안에서 resume해야 한다)
['pointerdown', 'touchend', 'keydown'].forEach(k => document.addEventListener(k, () => { const c = bsaInit(); if (c && c.state !== 'running') c.resume().catch(() => {}); }, {passive:true}));

const bsaT = () => BSA.ctx.currentTime;
function bsaReady(){ return BSA.ctx && BSA.ctx.state === 'running' && BSA.on; }
// 잡음 한 줄기: 필터 종류·주파수·Q, 크기, 시작 시각, 엔벌로프(올라감·유지·줄어듦)
function bsaNoise(o){
  const c = BSA.ctx, t0 = bsaT() + (o.at || 0), s = c.createBufferSource(); s.buffer = o.pink ? BSA.pink : BSA.noise; s.loop = true;
  s.playbackRate.value = o.rate || 1;
  const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t0); f.Q.value = o.q || 1;
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.fd || o.d || 0.2));
  const g = c.createGain(), a = o.a || 0.002, d = o.d || 0.1, h = o.h || 0;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.v || 0.5, t0 + a);
  if (h) g.gain.setValueAtTime(o.v || 0.5, t0 + a + h);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + h + d);
  s.connect(f); f.connect(g); g.connect(o.out || BSA.dry); if (o.send) g.connect(BSA.send);
  s.start(t0, Math.random() * 1.5); s.stop(t0 + a + h + d + 0.05);
}
// 사인·삼각파 한 음: 주파수(끝 주파수로 미끄러짐), 크기, 길이
function bsaTone(o){
  const c = BSA.ctx, t0 = bsaT() + (o.at || 0), s = c.createOscillator(); s.type = o.w || 'sine';
  s.frequency.setValueAtTime(o.f, t0); if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.fd || o.d));
  const g = c.createGain(), a = o.a || 0.001;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.v || 0.3, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + o.d);
  s.connect(g); g.connect(o.out || BSA.dry); if (o.send) g.connect(BSA.send); s.start(t0); s.stop(t0 + a + o.d + 0.05);
}
// 쇠붙이가 부딪는 소리: 서로 배수가 아닌 공명 몇 개를 짧게 (작은 쇠 부품의 울림)
function bsaMetal(at, base, v, d, body){
  const R = [1, 1.59, 2.31, 3.2, 4.07, 5.25, 6.71, 8.36];
  R.forEach((m, i) => {
    const f = base * m * (1 + (Math.random() - 0.5) * 0.03), k = v * 0.55 / (1 + 0.55 * i), dd = d * 1.3 / (1 + 0.3 * i);
    if (f > 16000) return;
    bsaTone({at, f, v:k, d:dd, a:0.0006}); bsaTone({at, f:f * 1.0031, v:k * 0.6, d:dd * 0.8, a:0.0006});
  });
  bsaNoise({at, type:'highpass', f:Math.min(9000, base * 4), q:0.7, v:v * 0.4, a:0.0004, d:0.006});   // 부딪는 순간
  if (body !== 0) bsaNoise({at, pink:true, type:'lowpass', f:520, q:0.9, v:v * (body || 1.1) * 0.6, a:0.001, d:0.05});   // 쇳덩이의 무게
}
const BSAU = {
  // 총소리: 날카로운 파열음 + 몸통 잡음 + 낮은 쿵 + 살짝 찌그러짐 + 방 울림
  shot(saw){
    if (!bsaReady()) return; const c = BSA.ctx;
    const sh = c.createWaveShaper(), cv = new Float32Array(2048); for (let i = 0; i < 2048; i++){ const x = i / 1024 - 1; cv[i] = Math.tanh(x * 3.2) * 0.9 + x * 0.1; } sh.curve = cv; sh.oversample = '4x';
    const g = c.createGain(); g.gain.value = 1.6; sh.connect(g); g.connect(BSA.dry); g.connect(BSA.send);
    // 벽에서 되돌아오는 첫 반사 (실내 총소리의 '쾅—' 하는 두께)
    [[0.011, 0.45], [0.019, 0.32], [0.031, 0.22]].forEach(([t, k]) => { const dl = c.createDelay(0.1); dl.delayTime.value = t; const dg = c.createGain(); dg.gain.value = k; g.connect(dl); dl.connect(dg); dg.connect(BSA.muff); });
    bsaNoise({type:'highpass', f:2500, q:0.7, v:1.0, a:0.0003, d:0.012, out:sh});                       // 파열음
    bsaNoise({pink:true, type:'lowpass', f:saw ? 6500 : 5200, f2:350, fd:0.22, q:0.6, v:1.0, a:0.0008, d:0.32, out:sh});   // 폭발
    bsaTone({f:saw ? 68 : 78, f2:30, fd:0.45, v:1.0, a:0.002, d:0.6, out:sh});                          // 낮게 울리는 압력
    bsaTone({f:170, f2:55, fd:0.12, v:0.7, a:0.001, d:0.16, out:sh});                                   // 가슴을 치는 쿵
    bsaNoise({at:0.02, pink:true, type:'lowpass', f:900, f2:300, fd:1.2, v:0.35, a:0.02, d:1.4, send:true});   // 방에 남는 꼬리
    bsaMetal(0.004, 640, 0.12, 0.18, 0);                                                               // 총 몸체가 떨리는 쇳소리
  },
  // 공포탄: 공이가 때리는 딸깍
  click(){ if (!bsaReady()) return; bsaMetal(0, 980, 0.32, 0.09, 0.8); bsaMetal(0.012, 1900, 0.12, 0.05, 0); },
  // 펌프: 뒤로 '착' → 앞으로 '칵'
  rack(at){
    if (!bsaReady()) return; at = at || 0;
    // 쇠가 쇠 위를 미끄러지는 거친 소리: 짧은 잡음 조각을 빠르게 이어 붙인다
    const slide = (t0, f0, f1) => { for (let k = 0; k < 9; k++) bsaNoise({at:t0 + k * 0.009 + Math.random() * 0.003, type:'bandpass', f:f0 + (f1 - f0) * k / 8, q:2.5, v:0.16 + Math.random() * 0.1, a:0.001, d:0.012}); };
    slide(at + 0.05, 3800, 2400);
    bsaMetal(at + 0.13, 410, 0.27, 0.16, 1.4); bsaMetal(at + 0.131, 1230, 0.14, 0.08, 0);             // 뒤 끝에 부딪는 '착'
    slide(at + 0.3, 2400, 3800);
    bsaMetal(at + 0.4, 360, 0.35, 0.2, 1.7); bsaMetal(at + 0.401, 1120, 0.18, 0.1, 0);                // 앞으로 잠기는 '칵' (더 무겁다)
  },
  // 탄피가 탁자에 떨어져 튀는 소리 (점점 작고 빨라진다)
  drop(at){ if (!bsaReady()) return; at = at || 0; [[0, 0.5], [0.16, 0.28], [0.27, 0.15], [0.34, 0.07]].forEach(([t, v]) => { bsaNoise({at:at + t, pink:true, type:'lowpass', f:650, q:1.2, v, a:0.0008, d:0.035}); bsaTone({at:at + t, f:340, f2:250, fd:0.04, v:v * 0.35, d:0.04}); bsaMetal(at + t, 3100 + Math.random() * 500, v * 0.12, 0.07, 0); }); },
  // 탄을 탁자에 내려놓는 소리 (펠트 위라 둔하다)
  lay(at){ if (!bsaReady()) return; bsaNoise({at, type:'lowpass', f:1100, v:0.5, a:0.001, d:0.05}); bsaTone({at, f:420, f2:300, fd:0.05, v:0.25, d:0.06}); },
  // 탄을 약실에 밀어 넣는 소리: 스침 + 걸림
  insert(at){ if (!bsaReady()) return; at = at || 0; for (let k = 0; k < 5; k++) bsaNoise({at:at + k * 0.012, type:'bandpass', f:2900 - k * 200, q:2.5, v:0.1, a:0.001, d:0.012}); bsaMetal(at + 0.07, 760, 0.13, 0.08, 1.2); },
  // 톱질: 밀고 당길 때마다 쇠를 긁는 소리, 끝에 '딱' 잘리고 조각이 떨어진다
  saw(){
    if (!bsaReady()) return;
    for (let k = 0; k < 6; k++){
      const at = 0.35 + k * (Math.PI / 19);
      bsaNoise({at, type:'bandpass', f:k % 2 ? 2400 : 3200, f2:k % 2 ? 3400 : 2200, fd:0.15, q:3, v:0.22, a:0.03, h:0.05, d:0.08});
      bsaTone({at, f:k % 2 ? 1900 : 2300, f2:k % 2 ? 2300 : 1800, fd:0.15, w:'sawtooth', v:0.025, a:0.03, d:0.13});
    }
    bsaMetal(1.3, 520, 0.25, 0.25); bsaNoise({at:1.3, type:'highpass', f:2000, v:0.22, d:0.03});
    bsaMetal(1.62, 380, 0.22, 0.3); bsaNoise({at:1.62, type:'lowpass', f:500, v:0.4, d:0.08}); bsaMetal(1.8, 400, 0.2, 0.2);
  },
  // 귀울림: 맞은 뒤 높은 음이 남고 주변 소리가 먹먹해진다
  ring(sec){
    if (!bsaReady()) return; const c = BSA.ctx, t = bsaT(); sec = sec || 2.6;
    // 이명: 맞는 순간부터 '삐—' 하고 암전 내내 같은 크기로 이어지다가 시야가 돌아올 때 사라진다 (먹먹하게 하는 필터를 거치지 않고 귀에 바로)
    [[3900, 0.075], [3913, 0.04], [7800, 0.008]].forEach(([f, v]) => {   // 살짝 다른 두 음이 맥놀이로 떨린다
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.03);
      g.gain.setValueAtTime(v, t + Math.max(0.1, sec - 0.9)); g.gain.linearRampToValueAtTime(0.0001, t + sec);
      o.connect(g); g.connect(BSA.master); o.start(t); o.stop(t + sec + 0.05);
    });
    BSA.muff.frequency.cancelScheduledValues(t); BSA.muff.frequency.setValueAtTime(20000, t); BSA.muff.frequency.exponentialRampToValueAtTime(380, t + 0.05);
    BSA.muff.frequency.setValueAtTime(380, t + sec * 0.45); BSA.muff.frequency.exponentialRampToValueAtTime(20000, t + sec);
  },
  // 몸이 쓰러지는 둔한 소리
  thud(at){ if (!bsaReady()) return; at = at || 0; bsaTone({at, f:85, f2:40, fd:0.25, v:0.7, d:0.35}); bsaNoise({at, pink:true, type:'lowpass', f:420, v:0.8, a:0.004, d:0.25}); bsaNoise({at:at + 0.18, pink:true, type:'lowpass', f:300, v:0.3, d:0.15}); bsaNoise({at, pink:true, type:'bandpass', f:1400, q:0.8, v:0.15, d:0.08}); },
  // 아이템 소리
  peek(){ if (!bsaReady()) return; bsaNoise({type:'bandpass', f:900, f2:2600, fd:0.25, q:1.5, v:0.12, a:0.08, d:0.2}); },
  cig(){ if (!bsaReady()) return; bsaMetal(0, 2100, 0.15, 0.05); bsaNoise({at:0.05, type:'bandpass', f:3500, q:1, v:0.18, d:0.12}); bsaNoise({at:0.2, type:'lowpass', f:1200, v:0.08, a:0.1, d:0.6}); },
  beer(){ if (!bsaReady()) return; bsaMetal(0, 1900, 0.2, 0.04); bsaNoise({at:0.02, type:'highpass', f:2500, f2:5000, fd:0.3, v:0.35, a:0.005, d:0.35}); },
  cuff(at){ if (!bsaReady()) return; at = at || 0; for (let k = 0; k < 5; k++) bsaMetal(Math.max(0, at - 0.3) + k * 0.045 + Math.random() * 0.02, 2600 + Math.random() * 900, 0.07, 0.06); bsaMetal(at + 0.02, 1200, 0.14, 0.1); },
  // '네 차례다' 배너: 낮게 울리는 한 방
  turn(){ if (!bsaReady()) return; bsaTone({f:55, f2:48, fd:0.8, v:0.5, a:0.01, d:0.9}); bsaNoise({type:'lowpass', f:200, v:0.3, a:0.01, d:0.5}); },
  // 배경 화이트 노이즈: 무대가 보이는 동안 낮게 깔린다 (아주 낮은 웅웅거림을 섞어 방처럼)
  ambient(on){
    if (!BSA.ctx) return; const c = BSA.ctx, t = bsaT();
    if (on && !BSA.amb){
      const s = c.createBufferSource(); s.buffer = BSA.noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 7000; f.Q.value = 0.3;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.008, t + 1.2);   // 배경 크기 (처음 0.045 → 0.0225 → 0.008)
      const hum = c.createOscillator(); hum.frequency.value = 60; const hg = c.createGain(); hg.gain.value = 0.0025;
      s.connect(f); f.connect(g); hum.connect(hg); hg.connect(g); g.connect(BSA.muff);
      s.start(); hum.start(); BSA.amb = {s, hum, g};
    } else if (!on && BSA.amb){
      const A = BSA.amb; BSA.amb = null;
      A.g.gain.cancelScheduledValues(t); A.g.gain.setValueAtTime(A.g.gain.value || 0.0001, t); A.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      A.s.stop(t + 0.45); A.hum.stop(t + 0.45);
    }
  },
};
// ───── 부루마블 소리 (같은 합성 장치·같은 켜고 끄기) ─────
const BMAU = {
  // 주사위: 두 개가 판에 떨어져 몇 번 튀고 구르다 선다 (딱딱한 플라스틱이 나무 판에 부딪는 짧은 '톡' 소리를 간격을 줄여 가며)
  dice(){
    if (!bsaReady()) return;
    [0, 0.05].forEach(off => {
      let t = off, gap = 0.16, v = 0.5;
      for (let k = 0; k < 9 && t < 0.8; k++){
        bsaNoise({at:t, type:'bandpass', f:1800 + Math.random() * 1600, q:3, v:v * 0.5, a:0.0005, d:0.018});
        bsaTone({at:t, f:700 + Math.random() * 500, f2:500, fd:0.03, v:v * 0.35, d:0.035});
        bsaNoise({at:t, pink:true, type:'lowpass', f:500, v:v * 0.5, a:0.0008, d:0.03});
        t += gap; gap *= 0.72; v *= 0.78;
      }
    });
  },
  // 말이 한 칸 갈 때 판을 '톡'
  hop(){ if (!bsaReady()) return; bsaTone({f:540 + Math.random() * 60, f2:420, fd:0.04, v:0.4, d:0.05}); bsaNoise({pink:true, type:'lowpass', f:1100, v:0.45, a:0.0006, d:0.03}); },
  // 멀리 날아갈 때: 바람 소리가 올라갔다 내려온다
  fly(){ if (!bsaReady()) return; bsaNoise({type:'bandpass', f:350, f2:2600, fd:0.32, q:1.4, v:0.22, a:0.08, d:0.22}); bsaNoise({at:0.32, type:'bandpass', f:2600, f2:500, fd:0.3, q:1.4, v:0.18, a:0.01, d:0.3}); bsaNoise({at:0.62, pink:true, type:'lowpass', f:600, v:0.3, d:0.05}); },
  // 동전 짤랑 (n개)
  coins(n){ if (!bsaReady()) return; n = Math.min(10, n || 4); for (let k = 0; k < n; k++) bsaMetal(0.05 * k + Math.random() * 0.03, 3200 + Math.random() * 1600, 0.09, 0.12, 0); },
  // 땅 사기: 금전등록기 '땡' + 동전
  buy(){ if (!bsaReady()) return; bsaMetal(0, 1760, 0.2, 0.5, 0); bsaMetal(0.09, 2350, 0.16, 0.45, 0); this.coins(4); },
  // 짓기: 망치질 세 번
  build(){ if (!bsaReady()) return; [0, 0.13, 0.26].forEach((t, k) => { bsaNoise({at:t, pink:true, type:'lowpass', f:700, v:0.45 - k * 0.08, a:0.0008, d:0.05}); bsaTone({at:t, f:190, f2:120, fd:0.06, v:0.3, d:0.08}); bsaMetal(t, 900, 0.05, 0.06, 0); }); },
  // 통행료: 동전이 쏟아지고 낮게 '쿵'
  rent(big){ if (!bsaReady()) return; this.coins(big ? 9 : 5); bsaTone({f:110, f2:70, fd:0.2, v:big ? 0.45 : 0.25, d:0.3}); },
  // 월급: 밝게 올라가는 세 음 (C6·E6·G6)
  salary(){ if (!bsaReady()) return; [1047, 1319, 1568].forEach((f, k) => { bsaTone({at:k * 0.07, f, v:0.12, d:0.35, w:'triangle'}); bsaTone({at:k * 0.07, f:f * 2, v:0.03, d:0.2}); }); },
  // 황금열쇠: 카드 뒤집는 '착'
  card(){ if (!bsaReady()) return; bsaNoise({type:'highpass', f:2500, v:0.22, a:0.002, d:0.05}); bsaNoise({at:0.12, type:'bandpass', f:3500, f2:1800, fd:0.08, q:1, v:0.18, a:0.004, d:0.08}); },
  // 무인도: 쇠문이 닫힌다
  jail(){ if (!bsaReady()) return; bsaMetal(0, 210, 0.45, 0.6, 1.5); bsaMetal(0.02, 640, 0.15, 0.3, 0); },
  // 파산: 내려가는 음
  bankrupt(){ if (!bsaReady()) return; [523, 440, 349, 262].forEach((f, k) => bsaTone({at:k * 0.16, f, f2:f * 0.97, fd:0.15, v:0.2, d:0.3, w:'triangle'})); BSAU.thud(0.6); },
  // 1위: 짧은 팡파르 (C5·E5·G5·C6)
  win(){ if (!bsaReady()) return; [523, 659, 784, 1047].forEach((f, k) => { bsaTone({at:k * 0.11, f, v:0.16, d:k === 3 ? 0.9 : 0.25, w:'triangle'}); bsaTone({at:k * 0.11, f:f * 1.5, v:0.04, d:0.25}); }); },
  // 내 차례: 부드러운 두 음
  turn(){ if (!bsaReady()) return; bsaTone({f:880, v:0.09, d:0.25, w:'triangle'}); bsaTone({at:0.12, f:1175, v:0.09, d:0.4, w:'triangle'}); },
};
// 무대가 보이면 배경 소리를 켜고, 사라지면 끈다
setInterval(() => { if (!BSA.ctx || BSA.ctx.state !== 'running') return; const st = document.querySelector('.bs-stage'); BSAU.ambient(!!(st && st.offsetParent && BSA.on && !document.hidden)); }, 700);
function bsaToggle(){
  BSA.on = !BSA.on; try { localStorage.setItem('seed10k.bs.sound', BSA.on ? '1' : '0'); } catch(e){}
  const c = bsaInit(); if (c){ if (c.state !== 'running') c.resume().catch(() => {}); BSA.master.gain.setTargetAtTime(BSA.on ? BSA.vol : 0, c.currentTime, 0.05); }
  document.querySelectorAll('.bs-snd, .bm-snd').forEach(b => { b.innerHTML = bsaIcon(); b.setAttribute('aria-label', BSA.on ? '소리 끄기' : '소리 켜기'); });
}
const bsaIcon = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>${BSA.on ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>' : '<path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg>`;
