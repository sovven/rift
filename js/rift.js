// 裂隙 Rift — tear your camera feed open, pull real things out of it, throw them to a friend.
import * as THREE from '../vendor/three.module.js';
import { FilesetResolver, HandLandmarker, InteractiveSegmenter } from '../vendor/mediapipe/vision_bundle.mjs';

const $ = s => document.querySelector(s);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const now = () => performance.now();

// ---------- device tier ----------
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
const TIERS = [
  { name: '低', n: 5000, obj: 1600, dpr: 1, maskDiv: 4, handEvery: 2 },
  { name: '中', n: 12000, obj: 2800, dpr: 1.5, maskDiv: 3, handEvery: 1 },
  { name: '高', n: 26000, obj: 5200, dpr: 2, maskDiv: 3, handEvery: 1 },
];
let tierIdx = IS_MOBILE ? 1 : 2;
const T = () => TIERS[tierIdx];

// ---------- DOM ----------
const glCanvas = $('#gl'), ov = $('#ov'), octx = ov.getContext('2d');
const video = $('#cam');
const statusEl = $('#status'), hintEl = $('#hint'), bannerEl = $('#banner'), recEl = $('#rec');

let W = innerWidth, H = innerHeight;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, T().dpr));
renderer.setSize(W, H, false);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ---------- reality source (camera, photo or the built-in still life) ----------
const src = { el: null, w: 16, h: 9, mirror: false, kind: 'none', facing: 'user' };
const stillC = document.createElement('canvas');
let srcTex = new THREE.CanvasTexture(stillC);
const cover = { x: 0, y: 0, w: 1, h: 1 };
function computeCover() {
  const va = src.w / src.h, sa = W / H;
  if (va > sa) { cover.h = H; cover.w = H * va; } else { cover.w = W; cover.h = W / va; }
  cover.x = (W - cover.w) / 2; cover.y = (H - cover.h) / 2;
}
const toScreen = (u, v) => [cover.x + (src.mirror ? 1 - u : u) * cover.w, cover.y + v * cover.h];
const toSrc = (x, y) => { let u = (x - cover.x) / cover.w; if (src.mirror) u = 1 - u; return [u, (y - cover.y) / cover.h]; };

function drawStillLife() {
  // A small desk scene, shaped to the screen, so there is something to tear and grab without a camera.
  const h = 1000, w = Math.round(clamp(1000 * W / H, 460, 1900)); stillC.width = w; stillC.height = h; const c = stillC.getContext('2d');
  const u = Math.min(h / 1000, w / 620), land = w > h, tY = h * .64;
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#b6c0bd'); g.addColorStop(.64, '#d9d3c5'); g.addColorStop(.64, '#8a6a4b'); g.addColorStop(1, '#5a4130');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,248,225,.5)'; c.beginPath(); c.ellipse(w * (land ? .72 : .7), h * .2, 240 * u, 180 * u, 0, 0, 7); c.fill();
  c.globalAlpha = .07; for (let i = 0; i < 3000; i++) { c.fillStyle = Math.random() < .5 ? '#000' : '#fff'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } c.globalAlpha = 1;
  const box = (x, y, fn) => { c.save(); c.translate(x, y); c.scale(u, u); fn(); c.restore(); };
  box(w * (land ? .2 : .26), h * .07, () => { // picture frame
    c.fillStyle = '#3b2c22'; c.fillRect(-120, 0, 240, 300); c.fillStyle = '#e9e2cf'; c.fillRect(-98, 22, 196, 256);
    c.fillStyle = '#d5643a'; c.beginPath(); c.arc(0, 110, 48, 0, 7); c.fill();
    c.fillStyle = '#2e5c74'; c.beginPath(); c.moveTo(-98, 278); c.lineTo(-20, 180); c.lineTo(40, 230); c.lineTo(98, 190); c.lineTo(98, 278); c.fill(); });
  box(w * (land ? .78 : .74), tY, () => { // plant
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(0, 175, 95, 14, 0, 0, 7); c.fill();
    c.fillStyle = '#c4673f'; c.beginPath(); c.moveTo(-95, 0); c.lineTo(95, 0); c.lineTo(72, 170); c.lineTo(-72, 170); c.fill();
    c.fillStyle = '#3f7a45'; for (let i = 0; i < 9; i++) { c.save(); c.rotate(-1.2 + i * .3); c.beginPath(); c.ellipse(0, -110, 30, 112, 0, 0, 7); c.fill(); c.restore(); } });
  box(w * (land ? .34 : .28), tY + 150 * u, () => { // mug
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 230, 120, 16, 0, 0, 7); c.fill();
    c.fillStyle = '#e8eef2'; c.beginPath(); c.roundRect(-100, 0, 200, 225, 18); c.fill();
    c.strokeStyle = '#e8eef2'; c.lineWidth = 28; c.beginPath(); c.arc(108, 108, 54, -1.3, 1.3); c.stroke();
    c.fillStyle = '#2b3a8f'; c.fillRect(-100, 58, 200, 32); });
  box(w * (land ? .55 : .56), tY + 290 * u, () => { // lemon
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 52, 76, 13, 0, 0, 7); c.fill();
    c.fillStyle = '#f2c935'; c.beginPath(); c.ellipse(0, 0, 66, 50, -.3, 0, 7); c.fill(); });
  c.fillStyle = 'rgba(29,26,22,.78)'; c.textAlign = 'center';
  c.font = `600 ${Math.round(42 * u)}px "Kaiti SC","STKaiti","KaiTi",serif`; c.fillText('没有摄像头，也可以撕', w / 2, h * .55);
  c.font = `${Math.round(28 * u)}px "Kaiti SC","STKaiti","KaiTi",serif`; c.fillText('长按杯子、柠檬或盆栽，把它抠出来', w / 2, h * .55 + 46 * u);
}
function useStill(canvas) {
  stopCamera();
  src.el = canvas; src.w = canvas.width; src.h = canvas.height; src.mirror = false; src.kind = canvas === stillC ? 'still' : 'photo';
  srcTex.dispose(); srcTex = new THREE.CanvasTexture(canvas); srcTex.minFilter = THREE.LinearFilter;
  quad.material.uniforms.uSrc.value = srcTex; computeCover(); clearAll();
}
let stream = null;
function stopCamera() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
async function startCamera(facing = src.facing) {
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } });
  video.srcObject = stream; await video.play();
  await new Promise(r => video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true }));
  src.el = video; src.w = video.videoWidth; src.h = video.videoHeight; src.facing = facing; src.mirror = facing === 'user'; src.kind = 'camera';
  srcTex.dispose(); srcTex = new THREE.VideoTexture(video); srcTex.minFilter = THREE.LinearFilter;
  quad.material.uniforms.uSrc.value = srcTex; computeCover(); clearAll();
}

// ---------- tear mask (screen space, low-res) ----------
const tearC = document.createElement('canvas'), tctx = tearC.getContext('2d');
const maskC = document.createElement('canvas'), mctx = maskC.getContext('2d');
const maskTex = new THREE.CanvasTexture(maskC); maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter; maskTex.generateMipmaps = false;
let mW = 1, mH = 1, mS = 1, maskDirty = true;
function sizeMask() {
  const div = T().maskDiv; const nw = Math.max(2, Math.ceil(W / div)), nh = Math.max(2, Math.ceil(H / div));
  const keep = document.createElement('canvas'); keep.width = tearC.width; keep.height = tearC.height;
  if (tearC.width > 1 && tearC.height > 1) keep.getContext('2d').drawImage(tearC, 0, 0);
  tearC.width = maskC.width = nw; tearC.height = maskC.height = nh;
  if (keep.width > 1) tctx.drawImage(keep, 0, 0, nw, nh);
  mW = nw; mH = nh; mS = nw / W; maskDirty = true;
  maskTex.dispose(); // canvas resized → texture storage must be rebuilt
}
const holes = []; // {img: canvas in src space, alive}
function composeMask() {
  mctx.globalCompositeOperation = 'source-over';
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, mW, mH);
  if (tearC.width && tearC.height) mctx.drawImage(tearC, 0, 0);
  mctx.globalCompositeOperation = 'lighter';
  for (const h of holes) {
    if (!h.alive) continue;
    mctx.save(); mctx.globalAlpha = h.a;
    const x = cover.x * mS, y = cover.y * mS, w = cover.w * mS, hh = cover.h * mS;
    if (src.mirror) { mctx.translate(x + w, y); mctx.scale(-1, 1); mctx.drawImage(h.img, 0, 0, w, hh); }
    else mctx.drawImage(h.img, x, y, w, hh);
    mctx.restore();
  }
  mctx.globalCompositeOperation = 'source-over';
  maskTex.needsUpdate = true; maskDirty = false;
}
let tornArea = 0;
function clearAll() { tctx.clearRect(0, 0, mW, mH); holes.length = 0; maskDirty = true; tornArea = 0; }

// ---------- letter (text hidden in the cosmos) & watermark ----------
const msgC = document.createElement('canvas'), msgTex = new THREE.CanvasTexture(msgC);
let letter = '';
function drawMsg() {
  const s = .5; msgC.width = Math.ceil(W * s); msgC.height = Math.ceil(H * s); const c = msgC.getContext('2d');
  c.clearRect(0, 0, msgC.width, msgC.height);
  if (letter) {
    const lines = wrap(letter, W < 600 ? 8 : 12);
    const fs = Math.min(msgC.width / (Math.max(...lines.map(l => l.length)) + 1), msgC.height / (lines.length * 1.7 + 1)) * .95;
    c.font = `700 ${fs}px "Songti SC","STSong","Noto Serif SC",serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(255,170,90,1)'; c.shadowBlur = fs * .35; c.fillStyle = '#fff';
    lines.forEach((l, i) => c.fillText(l, msgC.width / 2, msgC.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.45));
    c.shadowBlur = 0; lines.forEach((l, i) => c.fillText(l, msgC.width / 2, msgC.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.45));
  }
  msgTex.dispose(); msgTex.needsUpdate = true;
}
function wrap(t, n) { const out = []; for (const para of t.split('\n')) { let s = [...para]; while (s.length > n) { out.push(s.slice(0, n).join('')); s = s.slice(n); } out.push(s.join('')); } return out.filter(Boolean).slice(0, 4); }
const markC = document.createElement('canvas'), markTex = new THREE.CanvasTexture(markC);
function drawMark() {
  markC.width = Math.ceil(W / 2); markC.height = Math.ceil(H / 2); const c = markC.getContext('2d');
  c.clearRect(0, 0, markC.width, markC.height);
  c.font = '600 11px "Songti SC","STSong",serif'; c.textAlign = 'right'; c.fillStyle = 'rgba(255,255,255,.8)';
  c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 3;
  c.fillText('裂隙 · sovven.github.io/rift', markC.width - 10, markC.height - 10);
  markTex.dispose(); markTex.needsUpdate = true;
}

// ---------- full-screen composite: reality, torn edges, cosmos ----------
const GLSL_NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return s; }
`;
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: {
    uSrc: { value: srcTex }, uMask: { value: maskTex }, uMsg: { value: msgTex }, uMark: { value: markTex },
    uRes: { value: new THREE.Vector2(W, H) }, uCover: { value: new THREE.Vector4() }, uMirror: { value: 0 },
    uTime: { value: 0 }, uMsgOn: { value: 0 }, uMarkOn: { value: 0 }, uPar: { value: new THREE.Vector2() }, uHasSrc: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`,
  fragmentShader: `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc, uMask, uMsg, uMark;
uniform vec2 uRes, uPar; uniform vec4 uCover; uniform float uMirror, uTime, uMsgOn, uMarkOn, uHasSrc;
${GLSL_NOISE}
vec3 stars(vec2 p, float cell, float seed){
  vec2 g = floor(p/cell), f = fract(p/cell)-.5; float h = hash(g+seed);
  if(h < .9) return vec3(0.);
  vec2 o = vec2(hash(g+1.7+seed), hash(g+3.1+seed))-.5;
  float d = length(f - o*.7); float tw = .55+.45*sin(uTime*(.8+h*3.)+h*60.);
  float core = smoothstep(.07,.0,d), halo = smoothstep(.28,.0,d)*.18;
  return (core+halo)*tw*mix(vec3(.75,.82,1.), vec3(1.,.86,.7), hash(g+9.+seed));
}
vec3 cosmos(vec2 p){
  float m = min(uRes.x,uRes.y);
  vec2 q = (p + uPar*30.)/m; float t = uTime*.018;
  float n1 = fbm(q*2.1 + vec2(t,-t*.7));
  float n2 = fbm(q*3.7 - vec2(t*.6,t) + n1*1.4);
  vec3 c = vec3(.010,.009,.028);
  c += vec3(.12,.05,.30)*smoothstep(.38,.92,n1);
  c += vec3(.02,.15,.22)*smoothstep(.48,1.,n2);
  c += vec3(.55,.16,.34)*pow(smoothstep(.52,1.,n1*n2*1.7),2.)*.7;
  c += stars(p + uPar*12., 13., 0.) + stars(p*.7 + uPar*28., 22., 5.)*.9 + stars(p*1.3 + uPar*6., 9., 11.)*.5;
  if(uMsgOn > 0.){ vec4 mt = texture2D(uMsg, vUv); float sh = .8+.2*sin(uTime*2.2 + p.x*.015 + p.y*.01);
    c = mix(c, vec3(1.,.82,.52)*1.15*sh, mt.a*uMsgOn); }
  return c;
}
float msk(vec2 uv){ return texture2D(uMask, uv).r; }
void main(){
  vec2 p = vec2(vUv.x*uRes.x, (1.-vUv.y)*uRes.y);           // css px, y down
  vec2 su = vec2((p.x-uCover.x)/uCover.z, (p.y-uCover.y)/uCover.w);
  if(uMirror > .5) su.x = 1.-su.x;
  vec3 real = uHasSrc > .5 ? texture2D(uSrc, vec2(su.x, 1.-su.y)).rgb : vec3(.84,.81,.75);

  vec2 px = 1./uRes;
  float m = msk(vUv)*.2;
  for(int i=0;i<8;i++){ float a = float(i)*.785398; vec2 d = vec2(cos(a),sin(a));
    m += msk(vUv + d*px*4.)*.05 + msk(vUv + d*px*10.)*.05; }
  float n = fbm(p/18.), fiber = vnoise(p/1.4)*.6 + vnoise(p/3.1)*.4;
  float tm = m + (n-.5)*.24 + (fiber-.5)*.17;
  float hole  = smoothstep(.5,.535,tm);
  float edge  = smoothstep(.22,.33,tm)*(1.-hole);
  float shade = smoothstep(.04,.24,tm);
  float ember = smoothstep(.52,.58,tm)*(1.-smoothstep(.58,.86,tm));

  vec3 col = real*(1.-.38*shade);
  vec3 paper = vec3(.97,.955,.915)*(.84+.16*vnoise(p/1.1)) - vec3(.06,.07,.08)*(1.-smoothstep(.22,.3,tm));
  col = mix(col, paper, edge*.96);
  vec3 sky = cosmos(p) + vec3(1.,.42,.12)*ember*(1.5+.5*sin(uTime*3.+p.y*.05+p.x*.03));
  col = mix(col, sky, hole);
  if(uMarkOn > .5){ vec4 mk = texture2D(uMark, vUv); col = mix(col, mk.rgb, mk.a); }
  gl_FragColor = vec4(col,1.);
}`,
}));
quad.frustumCulled = false; quad.renderOrder = 0; scene.add(quad);

// ---------- particles (CPU sim, GPU draw) ----------
let CAP = TIERS[tierIdx].n + TIERS[tierIdx].obj * 3;
const P = {
  x: new Float32Array(CAP), y: new Float32Array(CAP), vx: new Float32Array(CAP), vy: new Float32Array(CAP),
  life: new Float32Array(CAP), max: new Float32Array(CAP), kind: new Uint8Array(CAP), own: new Int32Array(CAP),
  hx: new Float32Array(CAP), hy: new Float32Array(CAP), r: new Float32Array(CAP), g: new Float32Array(CAP), b: new Float32Array(CAP),
  size: new Float32Array(CAP), glow: new Float32Array(CAP),
};
const K_DEAD = 0, K_DEBRIS = 1, K_DUST = 2, K_OBJ = 3, K_HEART = 4;
const gPos = new Float32Array(CAP * 3), gCol = new Float32Array(CAP * 3), gA = new Float32Array(CAP), gS = new Float32Array(CAP), gG = new Float32Array(CAP);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aCol', new THREE.BufferAttribute(gCol, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aA', new THREE.BufferAttribute(gA, 1).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aS', new THREE.BufferAttribute(gS, 1).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aG', new THREE.BufferAttribute(gG, 1).setUsage(THREE.DynamicDrawUsage));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  uniforms: { uRes: { value: new THREE.Vector2(W, H) }, uDpr: { value: renderer.getPixelRatio() } },
  vertexShader: `attribute vec3 aCol; attribute float aA, aS, aG; uniform vec2 uRes; uniform float uDpr;
    varying vec3 vC; varying float vA, vG;
    void main(){ vC=aCol; vA=aA; vG=aG; gl_Position = vec4(position.x/uRes.x*2.-1., 1.-position.y/uRes.y*2., 0., 1.);
      gl_PointSize = max(aS*uDpr, 1.); }`,
  fragmentShader: `varying vec3 vC; varying float vA, vG;
    void main(){ vec2 d = gl_PointCoord-.5; float r = length(d);
      float a = mix(smoothstep(.5,.36,r), smoothstep(.5,0.,r), vG)*vA; if(a < .01) discard;
      gl_FragColor = vec4(vC*a, a*(1.-vG)); }`,
});
const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 1; scene.add(points);
let pCursor = 0, pHigh = 0, liveCount = 0;
function alloc() {
  for (let k = 0; k < CAP; k++) { const i = (pCursor + k) % CAP; if (P.kind[i] === K_DEAD) { pCursor = (i + 1) % CAP; if (i >= pHigh) pHigh = i + 1; return i; } }
  return -1;
}
function freeCount() { return T().n - liveCount; }

// ---------- frame sampling (colors for debris) ----------
const frameC = document.createElement('canvas'), fctx = frameC.getContext('2d', { willReadFrequently: true });
let frameData = null, frameStamp = -1, frameNo = 0;
function ensureFrame() {
  if (frameStamp === frameNo || !src.el) return; frameStamp = frameNo;
  const fw = 160, fh = Math.max(1, Math.round(160 * src.h / src.w)); if (frameC.width !== fw || frameC.height !== fh) { frameC.width = fw; frameC.height = fh; }
  try { fctx.drawImage(src.el, 0, 0, fw, fh); frameData = fctx.getImageData(0, 0, fw, fh).data; } catch { frameData = null; }
}
function sampleColor(x, y) {
  ensureFrame(); if (!frameData) return [.8, .78, .72];
  const [u, v] = toSrc(x, y); const fx = clamp(Math.floor(u * frameC.width), 0, frameC.width - 1), fy = clamp(Math.floor(v * frameC.height), 0, frameC.height - 1);
  const k = (fy * frameC.width + fx) * 4; return [frameData[k] / 255, frameData[k + 1] / 255, frameData[k + 2] / 255];
}

function spawnDebris(x, y, dx, dy, count) {
  count = Math.min(count, freeCount()); const sc = IS_MOBILE ? .8 : 1;
  for (let c = 0; c < count; c++) {
    const i = alloc(); if (i < 0) return;
    const px = x + (Math.random() - .5) * 10, py = y + (Math.random() - .5) * 10;
    P.kind[i] = K_DEBRIS; P.own[i] = -1; P.x[i] = px; P.y[i] = py;
    const sp = 40 + Math.random() * 160; const a = Math.random() * 6.283;
    P.vx[i] = dx * (60 + Math.random() * 120) + Math.cos(a) * sp * .5; P.vy[i] = dy * (60 + Math.random() * 120) + Math.sin(a) * sp * .5 - 50;
    P.life[i] = 0; P.max[i] = 1.4 + Math.random() * 1.8;
    if (Math.random() < .45) { P.r[i] = .96; P.g[i] = .94; P.b[i] = .89; } else { const [r, g, b] = sampleColor(px, py); P.r[i] = r; P.g[i] = g; P.b[i] = b; }
    P.size[i] = (2 + Math.random() * 4.5) * sc; P.glow[i] = 0; liveCount++;
  }
}
function toDust(i, ox, oy, power) {
  P.kind[i] = K_DUST; P.own[i] = -1; const dx = P.x[i] - ox, dy = P.y[i] - oy, d = Math.hypot(dx, dy) + 1;
  const sp = power * (.35 + Math.random() * .9);
  P.vx[i] = dx / d * sp + (Math.random() - .5) * sp * .5; P.vy[i] = dy / d * sp + (Math.random() - .5) * sp * .5;
  P.life[i] = 0; P.max[i] = 1.6 + Math.random() * 2.4; P.glow[i] = .7;
}

// ---------- objects pulled out of reality ----------
const objects = []; let objSeq = 1;
function makeObject({ cx, cy, crop, stride, pxScale, hole, home }) {
  // crop: canvas with alpha (object pixels only); stride: sample step in crop px; pxScale: screen px per crop px
  const c = crop.getContext('2d', { willReadFrequently: true }); const d = c.getImageData(0, 0, crop.width, crop.height).data;
  const o = { id: objSeq++, cx, cy, vx: 0, vy: 0, squeeze: 0, sq: 0, state: 'free', holder: null, hole, home, crop,
    w: crop.width * pxScale, h: crop.height * pxScale, born: now(), parts: [], radius: Math.max(crop.width, crop.height) * pxScale * .5 };
  const size = stride * pxScale * 1.45;
  for (let y = stride / 2; y < crop.height; y += stride) for (let x = stride / 2; x < crop.width; x += stride) {
    const k = ((y | 0) * crop.width + (x | 0)) * 4; if (d[k + 3] < 128) continue;
    const i = alloc(); if (i < 0) break;
    P.kind[i] = K_OBJ; P.own[i] = o.id;
    P.hx[i] = (x - crop.width / 2) * pxScale; P.hy[i] = (y - crop.height / 2) * pxScale;
    P.x[i] = cx + P.hx[i]; P.y[i] = cy + P.hy[i]; P.vx[i] = P.vy[i] = 0;
    P.r[i] = d[k] / 255; P.g[i] = d[k + 1] / 255; P.b[i] = d[k + 2] / 255; P.size[i] = size; P.glow[i] = 0; P.life[i] = 0; P.max[i] = 1e9;
    o.parts.push(i); liveCount++;
  }
  objects.push(o); return o;
}
function killObject(o, mode) {
  for (const i of o.parts) {
    if (P.kind[i] !== K_OBJ || P.own[i] !== o.id) continue;
    if (mode === 'explode') toDust(i, o.cx, o.cy, 520 + o.squeeze * 900);
    else if (mode === 'drift') { toDust(i, o.cx, o.cy, 60); P.vx[i] += o.vx * .6; P.vy[i] += o.vy * .6; }
    else { P.kind[i] = K_DEAD; liveCount--; }
  }
  o.parts.length = 0; const k = objects.indexOf(o); if (k >= 0) objects.splice(k, 1);
}

let segmenter = null, segBusy = false;
const segC = document.createElement('canvas'), sctx = segC.getContext('2d', { willReadFrequently: true });
function grabAt(x, y, holder) {
  if (!src.el) return null;
  if (!segmenter) { say(modelsReady ? '抓取模型加载失败' : '抓取模型还在加载，稍等一下'); return null; }
  if (segBusy) return null;
  const [u, v] = toSrc(x, y); if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const sw = 320, sh = Math.round(320 * src.h / src.w); segC.width = sw; segC.height = sh;
  sctx.drawImage(src.el, 0, 0, sw, sh);
  let best = null; segBusy = true;
  try {
    segmenter.segment(segC, { keypoint: { x: u, y: v } }, res => {
      const ms = res.confidenceMasks || []; let bi = -1, bv = -1;
      const kx = clamp(Math.round(u * (ms[0]?.width || sw)), 0, (ms[0]?.width || sw) - 1), ky = clamp(Math.round(v * (ms[0]?.height || sh)), 0, (ms[0]?.height || sh) - 1);
      ms.forEach((m, j) => { const a = m.getAsFloat32Array(); const val = a[ky * m.width + kx]; if (val > bv) { bv = val; bi = j; } });
      if (bi >= 0) { const m = ms[bi]; best = { w: m.width, h: m.height, a: Float32Array.from(m.getAsFloat32Array()), kx, ky }; }
    });
  } catch (e) { console.warn(e); }
  segBusy = false;
  if (!best) return null;
  // flood-fill the component under the finger
  const { w, h, a } = best; const bin = new Uint8Array(w * h); for (let i = 0; i < a.length; i++) bin[i] = a[i] > .5 ? 1 : 0;
  let seed = best.ky * w + best.kx;
  if (!bin[seed]) { let found = -1, bd = 1e9; const r = 12; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = best.kx + dx, yy = best.ky + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (bin[j] && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; found = j; } } seed = found; }
  if (seed < 0) { say('这里抓不起来，换个东西试试'); return null; }
  const comp = new Uint8Array(w * h); const stack = [seed]; comp[seed] = 1; let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  while (stack.length) { const j = stack.pop(); area++; const xx = j % w, yy = (j / w) | 0; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
    if (xx > 0 && bin[j - 1] && !comp[j - 1]) { comp[j - 1] = 1; stack.push(j - 1); } if (xx < w - 1 && bin[j + 1] && !comp[j + 1]) { comp[j + 1] = 1; stack.push(j + 1); }
    if (yy > 0 && bin[j - w] && !comp[j - w]) { comp[j - w] = 1; stack.push(j - w); } if (yy < h - 1 && bin[j + w] && !comp[j + w]) { comp[j + w] = 1; stack.push(j + w); } }
  const frac = area / (w * h);
  if (frac < .0025) { say('太小了，捏住大一点的东西'); return null; }
  if (frac > .6) { say('这一块太大了，对准一样具体的东西'); return null; }
  // hole image (src space, same res as mask) and the colour crop
  const holeC = document.createElement('canvas'); holeC.width = w; holeC.height = h; const hctx = holeC.getContext('2d');
  const hid = hctx.createImageData(w, h); for (let j = 0; j < w * h; j++) { const on = comp[j] ? 255 : 0; hid.data[j * 4] = hid.data[j * 4 + 1] = hid.data[j * 4 + 2] = on; hid.data[j * 4 + 3] = 255; }
  hctx.putImageData(hid, 0, 0);
  const pad = 2; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1; const crop = document.createElement('canvas'); crop.width = cw; crop.height = ch; const cctx = crop.getContext('2d');
  // colours come from segC (sw×sh); mask may differ in size, so sample by ratio
  const sd = sctx.getImageData(0, 0, sw, sh).data; const cd = cctx.createImageData(cw, ch);
  for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
    const mx = x0 + xx, my = y0 + yy; const on = comp[my * w + mx]; if (!on) continue;
    const sx = Math.min(sw - 1, Math.floor(mx * sw / w)), sy = Math.min(sh - 1, Math.floor(my * sh / h)); const sk = (sy * sw + sx) * 4, ck = (yy * cw + xx) * 4;
    cd.data[ck] = sd[sk]; cd.data[ck + 1] = sd[sk + 1]; cd.data[ck + 2] = sd[sk + 2]; cd.data[ck + 3] = 255;
  }
  cctx.putImageData(cd, 0, 0);
  if (src.mirror) { const f = document.createElement('canvas'); f.width = cw; f.height = ch; const fc = f.getContext('2d'); fc.translate(cw, 0); fc.scale(-1, 1); fc.drawImage(crop, 0, 0); cctx.clearRect(0, 0, cw, ch); cctx.drawImage(f, 0, 0); }
  const pxScale = cover.w / w; // screen px per mask px
  const [sx0, sy0] = toScreen((x0 + cw / 2) / w, (y0 + ch / 2) / h);
  const stride = Math.max(1, Math.ceil(Math.sqrt(area / T().obj)));
  const hole = { img: holeC, alive: true, a: 1 }; holes.push(hole); maskDirty = true;
  const o = makeObject({ cx: sx0, cy: sy0, crop, stride, pxScale, hole, home: { x: sx0, y: sy0 } });
  o.state = 'held'; o.holder = holder; o.grabDX = sx0 - x; o.grabDY = sy0 - y;
  spawnDebris(sx0, sy0, 0, -1, 40);
  vibrate(12); firstTime('grab', '你从现实里抠出了一块', '甩出屏幕边缘，或者握拳捏碎它');
  return o;
}
function objectAt(x, y) { for (let k = objects.length - 1; k >= 0; k--) { const o = objects[k]; if (Math.hypot(o.cx - x, o.cy - y) < Math.max(40, o.radius * .9)) return o; } return null; }

// ---------- tearing ----------
const JAG = 72;
let tear = null;
function startTear(p1, p2, kind = 'rift') {
  const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2; const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) + Math.PI / 2;
  const jag = new Float32Array(JAG * 2); const ph = Array.from({ length: 6 }, () => Math.random() * 6.283); for (let i = 0; i < JAG; i++) for (let s2 = 0; s2 < 2; s2++) { const o = ph[s2 * 3]; jag[i * 2 + s2] = Math.sin(i * .23 + o) * .7 + Math.sin(i * .61 + ph[s2 * 3 + 1]) * .4 + Math.sin(i * 1.7 + ph[s2 * 3 + 2]) * .18 + (Math.random() - .5) * .35; }
  tear = { kind, mx, my, ang, d0: Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), jag, open: 0, area: 0, tips: [Math.random() * 6, Math.random() * 6] };
}
function updateTear(p1, p2) {
  if (!tear) return;
  const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); const open = Math.max(0, d - tear.d0 - 12);
  if (open <= tear.open + .5) return; tear.open = open;
  const diag = Math.hypot(W, H); const len = Math.min(diag * 1.15, 90 + open * 3.0), wid = Math.min(open * .95, diag * .8);
  const ax = Math.cos(tear.ang), ay = Math.sin(tear.ang), nx = -ay, ny = ax;
  const L = [], R = [];
  for (let i = 0; i < JAG; i++) {
    const t = i / (JAG - 1) * 2 - 1; const bulge = Math.pow(Math.max(0, 1 - t * t), .55) * wid / 2;
    const j1 = tear.jag[i * 2] * (5 + wid * .07), j2 = tear.jag[i * 2 + 1] * (5 + wid * .07);
    const cx = tear.mx + ax * t * len / 2, cy = tear.my + ay * t * len / 2;
    L.push([cx + nx * (bulge + j1), cy + ny * (bulge + j1)]); R.push([cx - nx * (bulge + j2), cy - ny * (bulge + j2)]);
  }
  tctx.fillStyle = '#fff'; tctx.beginPath();
  L.forEach(([x, y], i) => i ? tctx.lineTo(x * mS, y * mS) : tctx.moveTo(x * mS, y * mS));
  for (let i = R.length - 1; i >= 0; i--) tctx.lineTo(R[i][0] * mS, R[i][1] * mS);
  tctx.closePath(); tctx.fill();
  // hairline cracks running ahead of the tips
  tctx.strokeStyle = '#fff'; tctx.lineWidth = Math.max(1, 1.2 * mS * 3);
  for (const s of [-1, 1]) { tctx.beginPath(); let x = tear.mx + ax * s * len / 2, y = tear.my + ay * s * len / 2; tctx.moveTo(x * mS, y * mS);
    for (let k = 1; k < 6; k++) { x += ax * s * 14 + (Math.sin(k * 2.1 + tear.tips[s > 0 ? 1 : 0]) * 9) * nx; y += ay * s * 14 + (Math.sin(k * 2.1 + tear.tips[s > 0 ? 1 : 0]) * 9) * ny; tctx.lineTo(x * mS, y * mS); } tctx.stroke(); }
  maskDirty = true;
  const area = len * wid; const grow = area - tear.area; tear.area = area; tornArea += Math.max(0, grow);
  const n = clamp(Math.round(grow / 900), 0, 90);
  for (let k = 0; k < n; k++) { const i = (Math.random() * JAG) | 0; const side = Math.random() < .5 ? L : R; const sgn = side === L ? 1 : -1; spawnDebris(side[i][0], side[i][1], nx * sgn, ny * sgn, 1); }
  if (n && Math.random() < .3) vibrate(6);
  firstTime('tear', '现实被你撕开了', '继续拉，或者单手捏住一样东西把它抠出来');
}
function endTear() { tear = null; }
let strip = null;
function stripTo(x, y) {
  if (!strip) return; const dx = x - strip.x, dy = y - strip.y, d = Math.hypot(dx, dy); if (d < 4) return;
  const w = 14 + Math.min(30, d * .35); const nx = -dy / d, ny = dx / d; const j = () => (Math.random() - .5) * w * .5;
  tctx.fillStyle = '#fff'; tctx.beginPath();
  tctx.moveTo((strip.x + nx * (w / 2 + j())) * mS, (strip.y + ny * (w / 2 + j())) * mS);
  tctx.lineTo((x + nx * (w / 2 + j())) * mS, (y + ny * (w / 2 + j())) * mS);
  tctx.lineTo((x - nx * (w / 2 + j())) * mS, (y - ny * (w / 2 + j())) * mS);
  tctx.lineTo((strip.x - nx * (w / 2 + j())) * mS, (strip.y - ny * (w / 2 + j())) * mS);
  tctx.closePath(); tctx.fill(); tctx.beginPath(); tctx.arc(x * mS, y * mS, w / 2 * mS, 0, 7); tctx.fill();
  maskDirty = true; tornArea += d * w;
  spawnDebris(x, y, nx, ny, 2); spawnDebris(x, y, -nx, -ny, 2);
  strip.x = x; strip.y = y; firstTime('tear', '现实被你撕开了', '长按画面里的一样东西，把它抠出来');
}
let healing = 0;
function heal() { healing = 1.6; say('裂缝在愈合'); for (const o of [...objects]) if (o.hole && o.state !== 'held') { o.hole.alive = false; } }

// ---------- reveal for letters ----------
let reveal = null;
function startReveal() {
  if (reveal || !letter) return; reveal = { t: 0, x: W / 2, y: H / 2, seed: Math.random() * 10 };
  banner('', ''); vibrate([20, 40, 30]);
}
function stepReveal(dt) {
  if (!reveal) return; reveal.t += dt; const r = Math.pow(reveal.t / 2.6, 1.4) * Math.hypot(W, H) * .62;
  tctx.fillStyle = '#fff'; tctx.beginPath();
  for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.283; const rr = r * (1 + .12 * Math.sin(a * 7 + reveal.seed) + .06 * Math.sin(a * 17)); const x = reveal.x + Math.cos(a) * rr, y = reveal.y + Math.sin(a) * rr; i ? tctx.lineTo(x * mS, y * mS) : tctx.moveTo(x * mS, y * mS); }
  tctx.fill(); maskDirty = true;
  for (let k = 0; k < 10; k++) { const a = Math.random() * 6.283; spawnDebris(reveal.x + Math.cos(a) * r, reveal.y + Math.sin(a) * r, Math.cos(a), Math.sin(a), 1); }
  if (reveal.t > 2.8) { reveal = null; banner(letter, '录一段发给 TA 吧'); }
}
function heartBurst(x, y) {
  const n = Math.min(700, freeCount());
  for (let k = 0; k < n; k++) { const i = alloc(); if (i < 0) break; const t = Math.random() * 6.283;
    const hx = 16 * Math.pow(Math.sin(t), 3), hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const s = Math.min(W, H) / 70; P.kind[i] = K_HEART; P.own[i] = -1; P.x[i] = x; P.y[i] = y; P.hx[i] = x + hx * s; P.hy[i] = y + hy * s;
    P.vx[i] = (Math.random() - .5) * 200; P.vy[i] = (Math.random() - .5) * 200; P.life[i] = 0; P.max[i] = 2.4 + Math.random();
    P.r[i] = 1; P.g[i] = .35 + Math.random() * .3; P.b[i] = .45 + Math.random() * .2; P.size[i] = 2.5 + Math.random() * 3; P.glow[i] = 1; liveCount++; }
}

// ---------- particle step ----------
function stepParticles(dt, t) {
  const byId = new Map(objects.map(o => [o.id, o]));
  let hi = 0;
  for (let i = 0; i < pHigh; i++) {
    const k = P.kind[i]; if (k === K_DEAD) { gA[i] = 0; continue; } hi = i + 1;
    if (k === K_OBJ) {
      const o = byId.get(P.own[i]); if (!o) { P.kind[i] = K_DEAD; liveCount--; gA[i] = 0; continue; }
      const s = 1 - .82 * o.squeeze; const jit = o.squeeze * 4;
      const tx = o.cx + P.hx[i] * s + (Math.random() - .5) * jit, ty = o.cy + P.hy[i] * s + (Math.random() - .5) * jit;
      const kk = o.state === 'held' ? 260 : 150;
      P.vx[i] += (tx - P.x[i]) * kk * dt; P.vy[i] += (ty - P.y[i]) * kk * dt;
      const damp = Math.exp(-16 * dt); P.vx[i] *= damp; P.vy[i] *= damp;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
      gA[i] = 1; gG[i] = o.squeeze * .8; gS[i] = P.size[i];
      const br = 1 + o.squeeze * 1.2; gCol[i * 3] = Math.min(1.5, P.r[i] * br); gCol[i * 3 + 1] = Math.min(1.5, P.g[i] * br); gCol[i * 3 + 2] = Math.min(1.5, P.b[i] * br);
    } else {
      P.life[i] += dt; const lf = P.life[i] / P.max[i]; if (lf >= 1) { P.kind[i] = K_DEAD; liveCount--; gA[i] = 0; continue; }
      if (k === K_DEBRIS) {
        const cx = Math.sin(P.y[i] * .013 + t * .9) * 60, cy = Math.cos(P.x[i] * .011 - t * .7) * 30;
        P.vx[i] += cx * dt; P.vy[i] += (300 + cy) * dt; const damp = Math.exp(-1.6 * dt); P.vx[i] *= damp; P.vy[i] *= damp;
        // paper turns to embers then ash
        const burn = clamp((lf - .35) / .4, 0, 1);
        gCol[i * 3] = lerp(P.r[i], 1.3, burn * .9); gCol[i * 3 + 1] = lerp(P.g[i], .45, burn * .9); gCol[i * 3 + 2] = lerp(P.b[i], .12, burn * .9);
        gG[i] = burn; gA[i] = 1 - Math.pow(lf, 3); gS[i] = P.size[i] * (1 - burn * .5);
      } else if (k === K_DUST) {
        const damp = Math.exp(-2.2 * dt); P.vx[i] *= damp; P.vy[i] *= damp; P.vy[i] += 14 * dt;
        P.vx[i] += Math.sin(P.y[i] * .02 + t) * 30 * dt;
        const f = clamp(lf * 1.6, 0, 1);
        gCol[i * 3] = lerp(P.r[i] * 1.3, .85, f); gCol[i * 3 + 1] = lerp(P.g[i] * 1.3, .9, f); gCol[i * 3 + 2] = lerp(P.b[i] * 1.3, 1.1, f);
        gG[i] = P.glow[i]; gA[i] = (1 - lf) * (1 - lf); gS[i] = P.size[i] * (1 - lf * .6);
      } else if (k === K_HEART) {
        const settle = clamp(P.life[i] / .7, 0, 1);
        P.vx[i] += (P.hx[i] - P.x[i]) * 30 * settle * dt; P.vy[i] += (P.hy[i] - P.y[i]) * 30 * settle * dt;
        const damp = Math.exp(-5 * dt); P.vx[i] *= damp; P.vy[i] *= damp; if (lf > .7) P.vy[i] -= 40 * dt;
        gCol[i * 3] = P.r[i] * 1.4; gCol[i * 3 + 1] = P.g[i]; gCol[i * 3 + 2] = P.b[i]; gG[i] = 1; gA[i] = Math.min(1, (1 - lf) * 2.5); gS[i] = P.size[i] * (1 + .25 * Math.sin(t * 9));
      }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
      if (P.y[i] > H + 40 || P.x[i] < -80 || P.x[i] > W + 80) { P.kind[i] = K_DEAD; liveCount--; gA[i] = 0; continue; }
    }
    gPos[i * 3] = P.x[i]; gPos[i * 3 + 1] = P.y[i];
  }
  pHigh = hi; pGeo.setDrawRange(0, pHigh);
  for (const a of ['position', 'aCol', 'aA', 'aS', 'aG']) { const at = pGeo.attributes[a]; at.needsUpdate = true; at.clearUpdateRanges?.(); at.addUpdateRange?.(0, pHigh * at.itemSize); }
}

// ---------- objects step ----------
function stepObjects(dt) {
  for (const o of [...objects]) {
    o.squeeze = lerp(o.squeeze, o.sq, 1 - Math.exp(-10 * dt));
    if (o.state === 'held') continue; // driven by its holder
    o.cx += o.vx * dt; o.cy += o.vy * dt;
    const drag = o.state === 'thrown' ? .55 : (o.state === 'entering' ? 1.6 : 2.4);
    o.vx *= Math.exp(-drag * dt); o.vy *= Math.exp(-drag * dt);
    if (o.state === 'entering' && o.cx > o.radius * .3 && o.cx < W - o.radius * .3 && o.cy > 0 && o.cy < H) o.state = 'free';
    if (o.state === 'thrown' && Math.hypot(o.vx, o.vy) < 120) o.state = 'free';
    if (o.state === 'free') { o.cy += Math.sin(now() / 700 + o.id) * 6 * dt; }
    // returning home heals its hole
    if (o.home && o.state !== 'thrown' && Math.hypot(o.cx - o.home.x, o.cy - o.home.y) < 26 && Math.hypot(o.vx, o.vy) < 200 && now() - o.born > 900) {
      o.hole.alive = false; maskDirty = true; killObject(o, 'vanish'); say('它回到了现实里'); continue;
    }
    // leaving the screen
    const out = o.cx < -o.radius * .6 || o.cx > W + o.radius * .6 || o.cy < -o.radius * .6 || o.cy > H + o.radius * .6;
    if (out && o.state !== 'entering') {
      if (peer.conn && peer.open) { sendObject(o); killObject(o, 'vanish'); say('它飞去了对面'); }
      else { killObject(o, 'drift'); firstTime('lost', '它掉进了裂隙', '想扔给朋友？点右上角「投送」'); }
    } else if (o.state === 'free' && !(peer.conn && peer.open)) {
      // without a partner, keep it on screen
      if (o.cx < o.radius * .5) o.vx = Math.abs(o.vx) * .5; if (o.cx > W - o.radius * .5) o.vx = -Math.abs(o.vx) * .5;
      if (o.cy < o.radius * .5) o.vy = Math.abs(o.vy) * .5; if (o.cy > H - o.radius * .5) o.vy = -Math.abs(o.vy) * .5;
    }
  }
}
function releaseObject(o, vx, vy) {
  o.holder = null;
  if (o.squeeze > .45) { vibrate([10, 30, 40]); killObject(o, 'explode'); firstTime('crush', '捏碎了', ''); return; }
  o.sq = 0; o.vx = vx; o.vy = vy; o.state = Math.hypot(vx, vy) > 700 ? 'thrown' : 'free';
}

// ---------- hands ----------
let hands = null, modelsReady = false, handFrame = 0, lastVideoTime = -1;
const handState = [mkHand(), mkHand()];
function mkHand() { return { seen: false, lm: null, pinch: false, fist: false, open: false, px: 0, py: 0, hist: [], holding: null, pendingAt: 0, lost: 0, releaseFrames: 0 }; }
function detectHands(t) {
  if (!hands || src.kind !== 'camera' || video.readyState < 2) { handState.forEach(h => h.seen = false); return; }
  if (video.currentTime === lastVideoTime) return; lastVideoTime = video.currentTime;
  if (++handFrame % T().handEvery) return;
  let res; try { res = hands.detectForVideo(video, t); } catch (e) { return; }
  const found = (res.landmarks || []).map(lm => lm.map(p => toScreen(p.x, p.y)));
  // match to previous slots by wrist distance
  const used = [false, false];
  for (const h of handState) h._m = null;
  for (const lm of found) {
    let best = -1, bd = 1e9; handState.forEach((h, k) => { if (used[k]) return; const d = h.seen && h.lm ? Math.hypot(h.lm[0][0] - lm[0][0], h.lm[0][1] - lm[0][1]) : 5e8 + k; if (d < bd) { bd = d; best = k; } });
    if (best >= 0) { used[best] = true; handState[best]._m = lm; }
  }
  handState.forEach(h => {
    const lm = h._m; if (!lm) { if (h.seen && (h.lost += 1) > 6) h.seen = false; return; }
    h.lost = 0;
    if (!h.seen || !h.lm) h.lm = lm.map(p => [...p]); else h.lm.forEach((p, i) => { p[0] = lerp(p[0], lm[i][0], .6); p[1] = lerp(p[1], lm[i][1], .6); });
    h.seen = true; classify(h);
  });
}
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function classify(h) {
  const L = h.lm, sc = D(L[0], L[9]) + 1e-3;
  const curled = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tp, pip]) => D(L[tp], L[0]) < D(L[pip], L[0]) * 1.08);
  const ncurl = curled.filter(Boolean).length;
  const pd = D(L[4], L[8]) / sc;
  h.fist = ncurl >= 4 || (ncurl >= 3 && curled[0] && pd > .25);
  if (!h.fist) h.pinch = h.pinch ? pd < .44 : pd < .3; else h.pinch = false;
  h.open = ncurl === 0 && pd > .55;
  h.px = (L[4][0] + L[8][0]) / 2; h.py = (L[4][1] + L[8][1]) / 2;
  const t = now(); h.hist.push([t, h.px, h.py]); while (h.hist.length > 2 && t - h.hist[0][0] > 110) h.hist.shift();
}
function velOf(hist) { if (hist.length < 2) return [0, 0]; const a = hist[0], b = hist[hist.length - 1]; const dt = Math.max(.016, (b[0] - a[0]) / 1000); return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt]; }

let heartCool = 0, healPose = null;
function driveHands(dt) {
  const [a, b] = handState; const both = a.seen && b.seen;
  // two-hand tear
  if (tear && tear.kind === 'rift' && tear.by === 'hands') {
    if (both && a.pinch && b.pinch) updateTear([a.px, a.py], [b.px, b.py]); else { endTear(); a.pendingAt = b.pendingAt = -1; }
  } else if (both && a.pinch && b.pinch && !a.holding && !b.holding) {
    startTear([a.px, a.py], [b.px, b.py]); tear.by = 'hands'; a.pendingAt = b.pendingAt = 0;
  }
  for (const h of handState) {
    if (!h.seen) { if (h.holding) { releaseObject(h.holding, 0, 0); h.holding = null; } h.pendingAt = 0; continue; }
    const other = h === a ? b : a;
    if (h.holding) {
      const o = h.holding; o.cx = lerp(o.cx, h.px + o.grabDX, .55); o.cy = lerp(o.cy, h.py + o.grabDY, .55);
      o.sq = h.fist ? 1 : 0;
      if (!h.pinch && !h.fist) { if (++h.releaseFrames > 1) { const [vx, vy] = velOf(h.hist); releaseObject(o, vx, vy); h.holding = null; } }
      else h.releaseFrames = 0;
      continue;
    }
    if (h.pinch && !h.pendingAt && !(tear && tear.by === 'hands')) h.pendingAt = now();
    if (!h.pinch) h.pendingAt = 0;
    if (h.pendingAt && now() - h.pendingAt > 200 && !(other.seen && other.pinch) && !(tear && tear.by === 'hands')) {
      h.pendingAt = -1; // consumed until the pinch is released
      const hit = objectAt(h.px, h.py);
      if (hit && hit.state !== 'held') { hit.state = 'held'; hit.holder = h; hit.grabDX = hit.cx - h.px; hit.grabDY = hit.cy - h.py; h.holding = hit; }
      else { const o = grabAt(h.px, h.py, h); if (o) h.holding = o; }
    }
  }
  // heart: both index tips touch and both thumb tips touch
  heartCool -= dt;
  if (both && heartCool <= 0) {
    const sc = (D(a.lm[0], a.lm[9]) + D(b.lm[0], b.lm[9])) / 2;
    if (D(a.lm[8], b.lm[8]) < sc * .45 && D(a.lm[4], b.lm[4]) < sc * .45 && !a.pinch && !b.pinch) {
      heartCool = 2.5; const x = (a.lm[8][0] + b.lm[8][0] + a.lm[4][0] + b.lm[4][0]) / 4, y = (a.lm[8][1] + b.lm[8][1] + a.lm[4][1] + b.lm[4][1]) / 4;
      if (letter && !reveal) startReveal(); else heartBurst(x, y);
    }
  }
  // heal: two open palms brought together
  if (both && a.open && b.open) {
    const d = D(a.lm[9], b.lm[9]);
    if (!healPose) healPose = { d0: d }; else if (d < healPose.d0 * .55 && healPose.d0 > 160) { heal(); healPose = { d0: 0 }; }
  } else healPose = null;
}

// ---------- pointer (touch / mouse) ----------
const ptrs = new Map();
glCanvas.addEventListener('pointerdown', e => {
  if (!started) return; glCanvas.setPointerCapture(e.pointerId);
  const p = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: now(), hist: [[now(), e.clientX, e.clientY]], mode: 'pending', holding: null };
  ptrs.set(e.pointerId, p);
  const list = [...ptrs.values()];
  if (list.length === 2) {
    const holder = list.find(q => q.holding);
    if (holder) { holder.holding.sq = 1; p.mode = 'squeeze'; return; }
    list.forEach(q => { q.mode = 'rift'; }); strip = null; startTear([list[0].x, list[0].y], [list[1].x, list[1].y]); tear.by = 'touch'; return;
  }
  const hit = objectAt(p.x, p.y);
  if (hit && hit.state !== 'held') { hit.state = 'held'; hit.holder = p; hit.grabDX = hit.cx - p.x; hit.grabDY = hit.cy - p.y; p.holding = hit; p.mode = 'hold'; }
});
glCanvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY; p.hist.push([now(), p.x, p.y]); while (p.hist.length > 2 && now() - p.hist[0][0] > 110) p.hist.shift();
  if (p.mode === 'pending' && Math.hypot(p.x - p.x0, p.y - p.y0) > 10) { p.mode = 'strip'; strip = { x: p.x0, y: p.y0 }; }
  if (p.mode === 'strip') stripTo(p.x, p.y);
  if (p.mode === 'hold' && p.holding) { p.holding.cx = p.x + p.holding.grabDX; p.holding.cy = p.y + p.holding.grabDY; }
  if (p.mode === 'rift') { const l = [...ptrs.values()].filter(q => q.mode === 'rift'); if (l.length === 2) updateTear([l[0].x, l[0].y], [l[1].x, l[1].y]); }
});
function ptrUp(e) {
  const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
  if (p.mode === 'hold' && p.holding) { const [vx, vy] = velOf(p.hist); releaseObject(p.holding, vx, vy); }
  if (p.mode === 'squeeze') { const h = [...ptrs.values()].find(q => q.holding); if (h) { releaseObject(h.holding, 0, 0); h.holding = null; h.mode = 'done'; } }
  if (p.mode === 'rift') { endTear(); for (const q of ptrs.values()) q.mode = 'done'; }
  if (p.mode === 'strip') strip = null;
  if (p.mode === 'pending' && now() - p.t0 < 250 && letter && tornArea > W * H * .08 && !reveal) startReveal();
}
glCanvas.addEventListener('pointerup', ptrUp); glCanvas.addEventListener('pointercancel', ptrUp);
function checkLongPress() {
  for (const p of ptrs.values()) if (p.mode === 'pending' && now() - p.t0 > 380 && ptrs.size === 1) {
    p.mode = 'busy'; const o = grabAt(p.x, p.y, p); if (o) { p.holding = o; p.mode = 'hold'; } else p.mode = 'done';
  }
}

// ---------- overlay: fingertip cursors ----------
function drawOverlay() {
  octx.clearRect(0, 0, ov.width, ov.height);
  for (const h of handState) {
    if (!h.seen) continue;
    const r = h.holding ? 7 : h.pinch ? 6 : 13;
    octx.strokeStyle = h.pinch || h.holding ? 'rgba(255,140,70,.95)' : 'rgba(255,255,255,.75)'; octx.lineWidth = 1.5;
    octx.beginPath(); octx.arc(h.px, h.py, r, 0, 7); octx.stroke();
    octx.fillStyle = 'rgba(255,255,255,.9)';
    for (const k of [4, 8]) { octx.beginPath(); octx.arc(h.lm[k][0], h.lm[k][1], 2.2, 0, 7); octx.fill(); }
    if (h.fist && h.holding) { octx.strokeStyle = 'rgba(255,90,40,.8)'; octx.beginPath(); octx.arc(h.px, h.py, 18 + Math.sin(now() / 60) * 2, 0, 7); octx.stroke(); }
  }
}

// ---------- HUD helpers ----------
let hintTimer = 0;
function hint(t, ms = 0) { hintEl.textContent = t; hintEl.style.opacity = t ? .92 : 0; clearTimeout(hintTimer); if (ms) hintTimer = setTimeout(() => hintEl.style.opacity = 0, ms); }
let bannerTimer = 0;
function banner(t, sub) { bannerEl.innerHTML = t ? `${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}` : ''; bannerEl.classList.toggle('show', !!t); clearTimeout(bannerTimer); if (t) bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 3200); }
function say(t) { hint(t, 2600); }
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const seenOnce = new Set();
function firstTime(key, big, sub) { if (seenOnce.has(key)) return; seenOnce.add(key); banner(big, sub); }
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { } }
function setStatus(t) { statusEl.textContent = t; }

// ---------- model loading ----------
async function fetchBytes(url, onp) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  const total = +r.headers.get('content-length') || 0; if (!r.body || !total) return new Uint8Array(await r.arrayBuffer());
  const rd = r.body.getReader(); const out = new Uint8Array(total); let got = 0;
  for (; ;) { const { done, value } = await rd.read(); if (done) break; out.set(value, got); got += value.length; onp(got / total); }
  return out;
}
async function loadModels() {
  const prog = [0, 0]; const show = () => { if (!modelsReady) setStatus(`手势识别加载中 ${Math.round((prog[0] * .55 + prog[1] * .45) * 100)}%`); };
  try {
    const fileset = await FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', location.href).href);
    const [hb, sb] = await Promise.all([
      fetchBytes('models/hand_landmarker.task', p => { prog[0] = p; show(); }),
      fetchBytes('models/magic_touch.tflite', p => { prog[1] = p; show(); }),
    ]);
    const mkHands = delegate => HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: hb, delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6, minHandPresenceConfidence: .5, minTrackingConfidence: .5 });
    try { hands = await mkHands('GPU'); } catch { hands = await mkHands('CPU'); }
    segmenter = await InteractiveSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: sb, delegate: 'CPU' }, outputConfidenceMasks: true, outputCategoryMask: false });
    modelsReady = true; updateStatus();
  } catch (e) { console.error(e); modelsReady = true; setStatus('手势识别没加载成功，可以用手指撕'); }
}
function updateStatus() {
  if (!modelsReady) return;
  const room = peer.open && peer.conn ? ` · 房间 ${peer.code} 已连接` : peer.code ? ` · 房间 ${peer.code} 等人中` : '';
  setStatus((src.kind === 'camera' ? (hands ? '手势已就绪' : '手势不可用') : src.kind === 'photo' ? '照片模式' : '触屏模式') + room);
}

// ---------- room (peer to peer) ----------
const peer = { lib: null, p: null, conn: null, open: false, code: '' };
function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/peerjs.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function joinRoom(code) {
  const st = $('#roomState'); st.textContent = '连接中…';
  try { await loadPeerLib(); } catch { st.textContent = '投送组件加载失败'; return; }
  leaveRoom(); peer.code = code;
  const base = `sovven-rift-${code}-`;
  const attach = c => {
    peer.conn = c;
    c.on('open', () => { peer.open = true; st.textContent = `房间 ${code} · 已连接，把东西甩出屏幕边缘`; banner('对面有人了', '抓起一样东西，甩出屏幕边缘'); updateStatus(); vibrate(20); });
    c.on('data', onPeerData);
    c.on('close', () => { peer.open = false; peer.conn = null; st.textContent = `房间 ${code} · 对方离开了`; updateStatus(); });
  };
  const host = () => {
    const p = new Peer(base + 'a'); peer.p = p;
    p.on('open', () => { st.textContent = `房间 ${code} · 等对方进入`; updateStatus(); });
    p.on('connection', c => attach(c));
    p.on('error', err => { if (err.type === 'unavailable-id') { p.destroy(); guest(); } else st.textContent = '连接出错：' + err.type; });
  };
  const guest = () => {
    const p = new Peer(); peer.p = p;
    p.on('open', () => attach(p.connect(base + 'a', { reliable: true, serialization: 'json' })));
    p.on('error', err => { st.textContent = '连接出错：' + err.type; });
  };
  host();
}
function leaveRoom() { try { peer.conn?.close(); peer.p?.destroy(); } catch { } peer.conn = null; peer.p = null; peer.open = false; }
function sendObject(o) {
  const edge = o.cx < 0 ? 'L' : o.cx > W ? 'R' : o.cy < 0 ? 'T' : 'B';
  const pos = edge === 'L' || edge === 'R' ? clamp(o.cy / H, 0, 1) : clamp(o.cx / W, 0, 1);
  const vmax = Math.max(1, Math.hypot(o.vx, o.vy));
  peer.conn.send({ t: 'obj', img: o.crop.toDataURL('image/png'), edge, pos, vx: o.vx / W, vy: o.vy / H, wf: o.w / W, sp: vmax / Math.hypot(W, H) });
}
function onPeerData(m) {
  if (!m || m.t !== 'obj') return;
  const img = new Image(); img.onload = () => {
    const tw = clamp(m.wf * W, 40, W * .7); const sc = tw / img.width;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    const opp = { L: 'R', R: 'L', T: 'B', B: 'T' }[m.edge];
    const r = Math.max(img.width, img.height) * sc * .5;
    let cx, cy; if (opp === 'L') { cx = -r; cy = m.pos * H; } else if (opp === 'R') { cx = W + r; cy = m.pos * H; } else if (opp === 'T') { cx = m.pos * W; cy = -r; } else { cx = m.pos * W; cy = H + r; }
    let area = 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) area++;
    const o = makeObject({ cx, cy, crop: c, stride: Math.max(1, Math.ceil(Math.sqrt(area / T().obj))), pxScale: sc, hole: null, home: null });
    const speed = Math.max(600, m.sp * Math.hypot(W, H));
    let vx = m.vx * W, vy = m.vy * H; const vm = Math.hypot(vx, vy) || 1; vx = vx / vm * speed; vy = vy / vm * speed;
    if (opp === 'L') vx = Math.abs(vx); if (opp === 'R') vx = -Math.abs(vx); if (opp === 'T') vy = Math.abs(vy); if (opp === 'B') vy = -Math.abs(vy);
    o.vx = vx; o.vy = vy; o.state = 'entering'; vibrate([15, 20, 15]); say('对面扔过来一样东西');
  };
  img.src = m.img;
}

// ---------- recording ----------
let recorder = null, recLeft = 0, recTick = 0;
function toggleRec() {
  if (recorder) { recorder.stop(); return; }
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const type = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!type || !glCanvas.captureStream) { say('这个浏览器不支持录屏'); return; }
  const chunks = []; recorder = new MediaRecorder(glCanvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 });
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    recorder = null; clearInterval(recTick); recEl.style.display = 'none'; quad.material.uniforms.uMarkOn.value = 0; menuBtn('rec').classList.remove('on');
    const blob = new Blob(chunks, { type: type.split(';')[0] }); const name = `rift-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    const file = new File([blob], name, { type: blob.type });
    if (IS_MOBILE && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: '裂隙' }); return; } catch { } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    say('视频已保存');
  };
  recorder.start(250); recLeft = 10; recEl.textContent = `REC ${recLeft}`; recEl.style.display = 'block'; quad.material.uniforms.uMarkOn.value = 1; menuBtn('rec').classList.add('on');
  recTick = setInterval(() => { recLeft--; recEl.textContent = `REC ${recLeft}`; if (recLeft <= 0) recorder?.stop(); }, 1000);
}

// ---------- menu ----------
const menuBtn = a => document.querySelector(`#menu [data-act="${a}"]`);
function openPanel(id) { document.querySelectorAll('.scrap').forEach(s => s.classList.toggle('open', s.id === id && !s.classList.contains('open'))); tearEdges(); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('.scrap').classList.remove('open'));
$('#menu').addEventListener('click', async e => {
  const act = e.target.closest('button')?.dataset.act; if (!act || !started) return;
  if (act === 'room') openPanel('roomPanel');
  if (act === 'letter') openPanel('letterPanel');
  if (act === 'rec') toggleRec();
  if (act === 'heal') heal();
  if (act === 'flip') { if (src.kind !== 'camera') { try { await startCamera('user'); updateStatus(); } catch { say('没拿到摄像头'); } return; } try { await startCamera(src.facing === 'user' ? 'environment' : 'user'); } catch { say('切换失败'); } }
  if (act === 'photo') $('#photo').click();
});
$('#photo').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => {
    const c = document.createElement('canvas'); const s = Math.min(1, 1600 / Math.max(img.width, img.height)); c.width = img.width * s; c.height = img.height * s;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); useStill(c); updateStatus(); say('这是你的新现实了'); URL.revokeObjectURL(img.src);
  }; img.src = URL.createObjectURL(f); e.target.value = '';
});
$('#roomRand').onclick = () => { $('#roomCode').value = String(1000 + Math.floor(Math.random() * 9000)); };
$('#roomJoin').onclick = () => { const c = $('#roomCode').value.replace(/\D/g, ''); if (c.length !== 4) { $('#roomState').textContent = '要四位数字'; return; } joinRoom(c); };
const encodeMsg = t => btoa(String.fromCharCode(...new TextEncoder().encode(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decodeMsg = s => { try { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))); } catch { return ''; } };
$('#letterMake').onclick = async () => {
  const t = $('#letterText').value.trim(); if (!t) { $('#letterOut').textContent = '先写一句话'; return; }
  const url = location.origin + location.pathname + '#m=' + encodeMsg(t);
  $('#letterOut').textContent = url;
  if (IS_MOBILE && navigator.share) { try { await navigator.share({ title: '裂隙', text: '有人把一句话藏在了你的现实后面', url }); return; } catch { } }
  try { await navigator.clipboard.writeText(url); $('#letterOut').textContent = '链接已复制：' + url; } catch { }
};
$('#letterTry').onclick = () => { const t = $('#letterText').value.trim(); if (!t) return; letter = t; drawMsg(); quad.material.uniforms.uMsgOn.value = .85; $('#letterPanel').classList.remove('open'); hint('撕开现实，找到那句话 · 双手比心让它完整出现'); };
function tearEdges() {
  // jagged top/bottom edges for the paper scraps
  document.querySelectorAll('.scrap.open').forEach(s => { const pts = []; const n = 18;
    for (let i = 0; i <= n; i++) pts.push(`${i / n * 100}% ${Math.random() * 2.2}%`); for (let i = n; i >= 0; i--) pts.push(`${i / n * 100}% ${100 - Math.random() * 2.2}%`);
    s.style.clipPath = `polygon(${pts.join(',')})`; });
}

// ---------- start (tear the title page) ----------
let started = false;
function shapeStart() {
  const pts = []; const n = 22; for (let i = 0; i <= n; i++) pts.push([50 + (Math.random() - .5) * 3.4, i / n * 100]);
  const left = `polygon(0 0, ${pts.map(([x, y]) => `${x}% ${y}%`).join(',')}, 0 100%)`;
  const right = `polygon(100% 0, ${pts.map(([x, y]) => `${x}% ${y}%`).join(',')}, 100% 100%)`;
  $('#start .left').style.clipPath = left; $('#start .right').style.clipPath = right;
}
async function begin() {
  if (started) return; started = true;
  const st = $('#start'); st.classList.add('torn'); st.querySelector('.ink').style.transition = 'opacity .5s'; st.querySelector('.ink').style.opacity = 0;
  setTimeout(() => st.classList.add('gone'), 1300);
  try { await startCamera('user'); }
  catch (e) { console.warn(e); useStill(stillC); banner('没拿到摄像头', '先用手指撕吧，也可以点「换现实」上传照片'); }
  loadModels();
  if (letter) hint(src.kind === 'camera' ? '撕开现实，找到那句话 · 双手比心让它完整出现' : '撕开现实，找到那句话 · 撕开一大片后轻点屏幕');
  else if (src.kind === 'camera') hint(IS_MOBILE ? '双手捏住画面往两边拉 · 也可以用两根手指在屏幕上撕' : '把双手举到镜头前，捏住，往两边拉');
  else hint('用手指在屏幕上划一下，或者两指撕开');
  setTimeout(() => { if (!seenOnce.has('tear')) hint(src.kind === 'camera' ? '拇指和食指捏在一起，就是“捏住”' : '两根手指按住屏幕，往两边拉'); }, 9000);
}
$('#start').addEventListener('pointerdown', begin);
$('#start').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') begin(); });
$('#start').tabIndex = 0;
addEventListener('keydown', e => { if (!started) return; if (e.key === 'h') heal(); if (e.key === 'r') toggleRec(); });

// ---------- resize ----------
function resize() {
  W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, T().dpr)); renderer.setSize(W, H, false);
  ov.width = W; ov.height = H;
  quad.material.uniforms.uRes.value.set(W, H); pMat.uniforms.uRes.value.set(W, H); pMat.uniforms.uDpr.value = renderer.getPixelRatio();
  if (src.kind === 'still' || src.kind === 'none') { drawStillLife(); src.w = stillC.width; src.h = stillC.height; srcTex.dispose(); srcTex.needsUpdate = true; }
  sizeMask(); computeCover(); drawMsg(); drawMark(); maskDirty = true;
}
addEventListener('resize', resize);

// ---------- adaptive quality ----------
let perfAcc = 0, perfN = 0, perfT = 0;
function perf(dt) {
  perfAcc += dt; perfN++; perfT += dt;
  if (perfT > 2.5) { const avg = perfAcc / perfN; perfAcc = perfN = perfT = 0;
    if (avg > 1 / 26 && tierIdx > 0) { tierIdx--; resize(); console.info('quality →', T().name); } }
}

// ---------- main loop ----------
let last = now(), t0 = now();
function frame() {
  requestAnimationFrame(frame);
  const tNow = now(); const dt = Math.min(.05, (tNow - last) / 1000); last = tNow; frameNo++;
  const t = (tNow - t0) / 1000;
  if (started) {
    detectHands(tNow); driveHands(dt); checkLongPress();
    stepObjects(dt); stepReveal(dt);
    if (healing > 0) { healing -= dt; tctx.globalCompositeOperation = 'destination-out'; tctx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 2.2)})`; tctx.fillRect(0, 0, mW, mH); tctx.globalCompositeOperation = 'source-over'; maskDirty = true; tornArea *= .96;
      for (const h of holes) if (!h.alive) h.a = Math.max(0, h.a - dt * 1.5);
      for (let k = holes.length - 1; k >= 0; k--) if (!holes[k].alive && holes[k].a <= 0) holes.splice(k, 1); }
    for (let k = holes.length - 1; k >= 0; k--) { const h = holes[k]; if (!h.alive && healing <= 0) { h.a -= dt * 2; maskDirty = true; if (h.a <= 0) holes.splice(k, 1); } }
    stepParticles(dt, t); perf(dt);
  }
  if (maskDirty) composeMask();
  const u = quad.material.uniforms;
  u.uTime.value = t; u.uCover.value.set(cover.x, cover.y, cover.w, cover.h); u.uMirror.value = src.mirror ? 1 : 0; u.uHasSrc.value = src.el ? 1 : 0;
  const hs = handState.find(h => h.seen); u.uPar.value.lerp(new THREE.Vector2(hs ? (hs.px / W - .5) : 0, hs ? (hs.py / H - .5) : 0), .05);
  if (letter) u.uMsgOn.value = lerp(u.uMsgOn.value, reveal || bannerEl.classList.contains('show') ? 1 : .8, .05);
  renderer.render(scene, camera);
  drawOverlay();
}

// ---------- boot ----------
drawStillLife();
{
  const m = location.hash.match(/m=([\w-]+)/); if (m) { letter = decodeMsg(m[1]).slice(0, 40); }
  if (letter) { $('#letterNote').style.display = 'block'; $('#sub').textContent = '撕开它，找到那句话'; }
}
resize(); shapeStart();
src.el = stillC; src.w = stillC.width; src.h = stillC.height; srcTex.dispose(); srcTex = new THREE.CanvasTexture(stillC); quad.material.uniforms.uSrc.value = srcTex; computeCover();
if (letter) { drawMsg(); quad.material.uniforms.uMsgOn.value = .8; }
setStatus('轻触开始');
frame();
window.__rift = { get state() { return { W, H, live: liveCount, objects: objects.length, tier: T().name, tornArea, modelsReady, src: src.kind, hands: !!hands, seg: !!segmenter }; }, grabAt, startTear, updateTear, endTear, sendObject, get objects() { return objects; } };
