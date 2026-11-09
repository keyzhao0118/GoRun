import * as THREE from 'three';
import { COURSE, PLAYER_LANE_X, createWorld, laneCenterX } from './world.js';
import { createRunner, createOpponent, OPPONENTS, PLAYER_PROFILE, pickRaceTime } from './character.js';
import { createFX } from './fx.js';
import { AudioKit } from './audio.js';
import { clamp, damp, lerp, easeInOutCubic, canvasTexture, roundRectPath, createStarGeometry } from './utils.js';

const COUNTDOWN_DURATION = 2.4;
const FINISH_DELAY = 3.4;
const PODIUM_Z = COURSE.finishZ - 4.8;
const LUNGE_DURATION = 0.55;
const LUNGE_SPEED = 19;
const LUNGE_HOT_AT = 90;
const BEST_KEY = 'gorun.best.v1';
const MAX_SPEED = 10.5;
let fallDuration = 1.55;

const $ = (selector) => document.querySelector(selector);

const dom = {
  stage: $('#stage'),
  loader: $('#loader'),
  error: $('#error'),
  body: document.body,
  pauseBtn: $('#pauseBtn'),
  helpBtn: $('#helpBtn'),
  soundBtn: $('#soundBtn'),
  timeValue: $('#timeValue'),
  distanceValue: $('#distanceValue'),
  speedValue: $('#speedValue'),
  progressFill: $('#progressFill'),
  progressRunner: $('#progressRunner'),
  speedFill: $('#speedFill'),
  hudPlace: $('#hudPlace'),
  stepDock: $('#stepDock'),
  comboBadge: $('#comboBadge'),
  comboValue: $('#comboValue'),
  stepHint: $('#stepHint'),
  diveBtn: $('#diveBtn'),
  diveLabel: $('#diveLabel'),
  diveKey: $('#diveKey'),
  leftKey: $('#leftKey'),
  rightKey: $('#rightKey'),
  leftZone: $('#leftZone'),
  rightZone: $('#rightZone'),
  countdown: $('#countdown'),
  countdownKicker: $('#countdownKicker'),
  countdownNumber: $('#countdownNumber'),
  countdownSub: $('#countdownSub'),
  finishBanner: $('#finishBanner'),
  podiumBanner: $('#podiumBanner'),
  podiumNames: $('#podiumNames'),
  toast: $('#toast'),
  srLive: $('#srLive'),
  menu: $('#menu'),
  startBtn: $('#startBtn'),
  howBtn: $('#howBtn'),
  bestValue: $('#bestValue'),
  results: $('#results'),
  resultTime: $('#resultTime'),
  newBestBadge: $('#newBestBadge'),
  bestResult: $('#bestResult'),
  fallResult: $('#fallResult'),
  comboResult: $('#comboResult'),
  maxSpeedResult: $('#maxSpeedResult'),
  placeBadge: $('#placeBadge'),
  placeNumber: $('#placeNumber'),
  placeLabel: $('#placeLabel'),
  raceBoard: $('#raceBoard'),
  resultsTitle: $('#resultsTitle'),
  resultSummary: $('#resultSummary'),
  restartBtn: $('#restartBtn'),
  copyBtn: $('#copyBtn'),
  homeBtn: $('#homeBtn'),
  pause: $('#pause'),
  resumeBtn: $('#resumeBtn'),
  pauseHomeBtn: $('#pauseHomeBtn'),
  help: $('#help'),
  helpClose: $('#helpClose'),
  helpStart: $('#helpStart'),
  flash: $('#flash'),
};

const state = {
  phase: 'loading',
  best: loadBest(),
  newBest: false,
  countdownTime: 0,
  countdownTick: -1,
  goOverlayTime: 0,
  raceTime: 0,
  distance: 0,
  speed: 0,
  targetSpeed: 0,
  lastDir: null,
  lastStepAt: -1,
  combo: 0,
  maxCombo: 0,
  falls: 0,
  maxSpeed: 0,
  isFalling: false,
  fallTime: 0,
  fallImpactDone: false,
  isLunging: false,
  lungeTime: 0,
  diveFinish: false,
  diveFallTime: 0,
  finishTime: 0,
  finishElapsed: 0,
  resultsShown: false,
  cameraKick: 0,
  sprintNotified: false,
  helpOpen: false,
  lastHudTime: '',
  lastCombo: -1,
  opponents: [],
  finishBoard: [],
  playerPlace: 1,
  podiumEntries: [],
  playerOnPodium: false,
  podiumBannerShown: false,
};

const cameraRig = {
  base: new THREE.Vector3(),
  look: new THREE.Vector3(),
  fov: 49,
  targetFov: 49,
  shake: 0,
  menuAngle: 2.63,
};

let stage = null;
let runner = null;
let podium = null;
let fx = null;
let audio = null;
let elapsed = 0;
let lastFrame = performance.now();
let toastTimer = 0;
let finishBannerTimer = 0;
let reducedMotion = false;
let touchMode = false;

const tempVec = new THREE.Vector3();
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const tempLook = new THREE.Vector3();
const playerPos = new THREE.Vector3(0, 0, COURSE.startZ);

const portrait = () => stage && stage.camera.aspect < 0.82;

function loadBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch (error) {
    return null;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch (error) {
    /* The run still counts even if the record cannot be saved. */
  }
}

function formatTime(value) {
  const total = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  if (minutes > 0) {
    return minutes + ':' + seconds.toFixed(2).padStart(5, '0');
  }
  return seconds.toFixed(2).padStart(5, '0');
}

function setBodyMode(mode) {
  state.phase = mode;
  dom.body.dataset.mode = mode;
  dom.pauseBtn.hidden = mode !== 'running';
}

function showScreen(element) {
  if (!element) return;
  element.classList.add('is-open');
  element.setAttribute('aria-hidden', 'false');
}

function hideScreen(element) {
  if (!element) return;
  element.classList.remove('is-open');
  element.setAttribute('aria-hidden', 'true');
}

function setLoaderHidden() {
  if (!dom.loader) return;
  dom.loader.classList.add('is-hidden');
  dom.loader.setAttribute('aria-hidden', 'true');
}

function announce(text) {
  if (dom.srLive) dom.srLive.textContent = text;
}

function showToast(text, tone = '', duration = 1600) {
  if (!dom.toast) return;
  window.clearTimeout(toastTimer);
  dom.toast.textContent = text;
  dom.toast.dataset.tone = tone;
  dom.toast.classList.remove('is-visible');
  void dom.toast.offsetWidth;
  dom.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove('is-visible');
  }, duration);
}

function flashScreen(color = '255, 247, 236', peak = 0.55, duration = 480) {
  if (!dom.flash) return;
  dom.flash.style.background = 'rgb(' + color + ')';
  dom.flash.getAnimations().forEach((animation) => animation.cancel());
  dom.flash.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: peak, offset: 0.13 },
      { opacity: 0, offset: 1 },
    ],
    { duration, easing: 'ease-out' }
  );
}


function makePodiumNumberTexture(place) {
  const medal = place === 1 ? '#ffd36e' : place === 2 ? '#dfe9ec' : '#e8b28e';
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff8ed';
    roundRectPath(ctx, 14, 14, w - 28, h - 28, 66);
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#4a333d';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 8, 78, 0, Math.PI * 2);
    ctx.fillStyle = medal;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#4a333d';
    ctx.stroke();
    ctx.fillStyle = '#4a333d';
    ctx.font = '700 120px Fredoka, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(place), w / 2, h / 2 - 8);
    ctx.fillStyle = '#8a5f61';
    ctx.font = '600 22px Fredoka, Arial, sans-serif';
    ctx.fillText('PLACE', w / 2, 224);
  });
}

function createPodium() {
  const group = new THREE.Group();
  group.position.set(0, 0, PODIUM_Z);
  group.visible = false;

  const cream = new THREE.MeshStandardMaterial({ color: 0xfff4e5, roughness: 0.78 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x4a333d, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd36e, roughness: 0.48, metalness: 0.06 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xdbe5e9, roughness: 0.52, metalness: 0.04 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xe6b08c, roughness: 0.55, metalness: 0.04 });
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd36e, roughness: 0.45, emissive: 0xd99a26, emissiveIntensity: 0.08 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.12, 2.2), cream);
  base.position.y = 0.06;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const star = new THREE.Mesh(createStarGeometry(0.28, 0.115), starMat);
  star.position.set(0, 0.17, -1.115);
  star.rotation.y = Math.PI;
  star.castShadow = true;
  group.add(star);

  const configs = [
    { place: 1, x: 0, h: 0.82, w: 1.9, d: 1.55, cap: gold, numberSize: 0.56 },
    { place: 2, x: 1.55, h: 0.5, w: 1.62, d: 1.42, cap: silver, numberSize: 0.47 },
    { place: 3, x: -1.55, h: 0.32, w: 1.5, d: 1.38, cap: bronze, numberSize: 0.38 },
  ];

  const tiers = {};
  for (const config of configs) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(config.w, config.h, config.d), cream);
    box.position.set(config.x, 0.12 + config.h / 2, 0);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(config.w + 0.035, 0.06, config.d + 0.035), config.cap);
    cap.position.set(config.x, 0.12 + config.h + 0.03, 0);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(config.numberSize, config.numberSize),
      new THREE.MeshBasicMaterial({ map: makePodiumNumberTexture(config.place), transparent: true, toneMapped: false })
    );
    plane.position.set(config.x, 0.12 + config.h * 0.52, -config.d / 2 - 0.012);
    plane.rotation.y = Math.PI;
    group.add(plane);

    tiers[config.place] = {
      x: config.x,
      top: 0.12 + config.h + 0.06,
      width: config.w,
      depth: config.d,
    };
  }

  return { group, tiers };
}

function showPodiumBanner() {
  if (!dom.podiumBanner || !dom.podiumNames || !state.podiumEntries.length) return;
  const entries = state.podiumEntries.slice(0, 3);
  const displayOrder = [entries[1], entries[0], entries[2]].filter(Boolean);
  dom.podiumNames.innerHTML = displayOrder
    .map((entry) => {
      const color = '#' + entry.profile.kit.top.toString(16).padStart(6, '0');
      return (
        '<span class="podium-chip' +
        (entry.isPlayer ? ' is-player' : '') +
        '" data-place="' +
        entry.place +
        '"><i>' +
        entry.place +
        '</i><span class="podium-dot" style="--dot:' +
        color +
        '"></span><b>' +
        entry.name +
        '</b></span>'
      );
    })
    .join('');
  dom.podiumBanner.classList.add('is-visible');
  dom.podiumBanner.setAttribute('aria-hidden', 'false');
  state.podiumBannerShown = true;
}

function hidePodiumBanner() {
  if (!dom.podiumBanner) return;
  dom.podiumBanner.classList.remove('is-visible');
  dom.podiumBanner.setAttribute('aria-hidden', 'true');
}

function arrangePodium() {
  if (!podium) return;
  const top = state.finishBoard.slice(0, 3);
  const scaleX = stage && stage.camera.aspect < 0.82 ? 0.74 : 1;
  podium.group.scale.x = scaleX;
  podium.group.visible = true;
  state.podiumEntries = [];
  state.playerOnPodium = false;

  if (runner) runner.group.visible = false;
  for (const npc of state.opponents) {
    npc.onPodium = false;
    npc.group.visible = false;
  }

  top.forEach((entry, index) => {
    const place = index + 1;
    const tier = podium.tiers[place];
    if (!tier) return;
    let controller = null;
    let group = null;
    let npc = null;
    if (entry.isPlayer) {
      controller = runner;
      group = runner.group;
      state.playerOnPodium = true;
    } else {
      npc = state.opponents.find((item) => item.profile.id === entry.profile.id) || null;
      controller = npc ? npc.controller : null;
      group = npc ? npc.group : null;
      if (npc) npc.onPodium = true;
    }
    if (!controller || !group) return;

    group.visible = true;
    group.rotation.set(0, 0, 0);
    group.position.set(tier.x * scaleX, tier.top, PODIUM_Z + 0.04);
    controller.reset();
    controller.update(0, elapsed, { mode: 'finished', speedNorm: 0 });
    state.podiumEntries.push({
      ...entry,
      place,
      controller,
      group,
      npc,
    });
  });

  if (state.playerOnPodium && runner) {
    playerPos.copy(runner.group.position);
  } else {
    playerPos.set(0, 0, PODIUM_Z);
  }

  if (fx) {
    fx.burstConfetti(new THREE.Vector3(0, 4.4, PODIUM_Z));
    fx.spawnSparkle(new THREE.Vector3(0, 5.0, PODIUM_Z), 18, 1.15);
  }
}

function updatePodium(dt) {
  for (const entry of state.podiumEntries) {
    entry.controller.update(dt, elapsed, { mode: 'finished', speedNorm: 0 });
  }
}

function showFinishBanner() {
  if (!dom.finishBanner) return;
  window.clearTimeout(finishBannerTimer);
  dom.finishBanner.classList.remove('is-visible');
  void dom.finishBanner.offsetWidth;
  dom.finishBanner.classList.add('is-visible');
  dom.finishBanner.setAttribute('aria-hidden', 'false');
  finishBannerTimer = window.setTimeout(() => {
    dom.finishBanner.classList.remove('is-visible');
    dom.finishBanner.setAttribute('aria-hidden', 'true');
  }, 1350);
}

function hideFinishBanner() {
  window.clearTimeout(finishBannerTimer);
  if (dom.finishBanner) {
    dom.finishBanner.classList.remove('is-visible');
    dom.finishBanner.setAttribute('aria-hidden', 'true');
  }
}

function countdownDigit(value) {
  if (!dom.countdownNumber) return;
  dom.countdownNumber.textContent = value;
  dom.countdownNumber.classList.remove('is-pop');
  void dom.countdownNumber.offsetWidth;
  dom.countdownNumber.classList.add('is-pop');
  countdownBounce(value);
}

function countdownBounce(value) {
  // A tiny camera bounce makes the countdown feel physical.
  cameraRig.shake = Math.max(cameraRig.shake, value === 'GO!' ? 0.16 : 0.045);
}

function showCountdownOverlay() {
  if (!dom.countdown) return;
  dom.countdown.classList.remove('is-go');
  dom.countdown.classList.remove('is-intro');
  dom.countdown.classList.add('is-open');
  dom.countdown.setAttribute('aria-hidden', 'false');
  dom.countdownKicker.textContent = 'READY?';
  dom.countdownSub.textContent = '左右交替 · 越快越快';
}

function hideCountdownOverlay() {
  if (!dom.countdown) return;
  dom.countdown.classList.remove('is-open');
  dom.countdown.classList.remove('is-go');
  dom.countdown.classList.remove('is-intro');
  dom.countdown.setAttribute('aria-hidden', 'true');
}

function updateBestLabel() {
  if (!dom.bestValue) return;
  dom.bestValue.textContent = state.best ? formatTime(state.best) : '--.--';
}

function syncSoundIcon() {
  if (!audio) return;
  const muted = audio.muted;
  dom.body.classList.toggle('is-muted', muted);
  if (dom.soundBtn) {
    dom.soundBtn.setAttribute('aria-label', muted ? '打开声音' : '关闭声音');
    dom.soundBtn.setAttribute('title', muted ? '打开声音' : '关闭声音');
  }
}

function updateDiveButton() {
  if (!dom.diveBtn) return;
  const running = state.phase === 'running';
  const canDive = running && !state.isFalling && !state.isLunging;
  const hot = canDive && state.distance >= LUNGE_HOT_AT;
  dom.diveBtn.disabled = !canDive;
  dom.diveBtn.classList.toggle('is-hot', hot);
  dom.diveBtn.classList.toggle('is-lunging', state.isLunging);
  dom.diveBtn.setAttribute('aria-label', state.isLunging ? '冲线中' : hot ? '现在冲线' : '冲线');
  if (dom.diveLabel) {
    dom.diveLabel.textContent = state.isLunging ? '冲线中…' : hot ? '现在冲线！' : '冲线';
  }
}

function refreshKeys() {
  if (!dom.leftKey || !dom.rightKey) return;
  const running = state.phase === 'running';
  const locked = !running || state.isFalling || state.isLunging;
  const expected = locked ? null : state.lastDir === 'left' ? 'right' : state.lastDir === 'right' ? 'left' : 'both';
  dom.leftKey.classList.toggle('is-next', expected === 'left' || expected === 'both');
  dom.rightKey.classList.toggle('is-next', expected === 'right' || expected === 'both');
  dom.leftKey.classList.toggle('is-locked', locked);
  dom.rightKey.classList.toggle('is-locked', locked);
  dom.leftKey.setAttribute('aria-disabled', locked ? 'true' : 'false');
  dom.rightKey.setAttribute('aria-disabled', locked ? 'true' : 'false');
  dom.stepDock.classList.toggle('is-locked', locked);

  let hint = touchMode ? '点左右两侧屏幕，交替迈步！' : '左右交替按，越快越快！';
  if (state.phase === 'countdown') hint = '准备好，要起跑啦…';
  else if (state.phase === 'menu') hint = touchMode ? '点左右两侧屏幕，交替迈步！' : '左右交替按，越快越快！';
  else if (state.phase === 'finished') hint = '冲过终点啦！';
  else if (state.phase === 'paused') hint = '比赛暂停中';
  else if (state.isFalling) hint = '哎呀！等 GoRun 爬起来…';
  else if (state.isLunging) hint = '冲线中…';
  else if (!state.lastDir) {
    const startingFresh = state.distance < 0.5;
    if (touchMode) hint = startingFresh ? '点左右两侧屏幕起跑！' : '继续点左右两侧加速！';
    else hint = startingFresh ? '按 ← 或 → 起跑！' : '继续按 ← 或 → 加速！';
  } else if (touchMode) hint = state.lastDir === 'left' ? '下一拍：点右半边' : '下一拍：点左半边';
  else hint = state.lastDir === 'left' ? '下一拍：→ 右' : '下一拍：← 左';
  dom.stepHint.textContent = hint;
  updateDiveButton();
}

function refreshCombo(animate = false) {
  if (!dom.comboBadge) return;
  const visible = state.phase === 'running' && !state.isFalling && !state.isLunging && state.combo > 1;
  dom.comboBadge.hidden = !visible;
  dom.comboValue.textContent = state.combo;
  if (visible && animate) {
    dom.comboBadge.classList.remove('is-pop');
    void dom.comboBadge.offsetWidth;
    dom.comboBadge.classList.add('is-pop');
  }
}

function resetOpponents() {
  for (const npc of state.opponents) {
    npc.distance = 0;
    npc.finished = false;
    npc.finishT = 0;
    npc.speedNorm = 0;
    npc.onPodium = false;
    npc.targetTime = pickRaceTime(npc.profile);
    npc.group.position.set(laneCenterX(npc.profile.lane), 0, COURSE.startZ);
    npc.group.visible = false;
    npc.controller.reset();
    npc.controller.update(0, 0, { mode: 'menu', speedNorm: 0 });
  }
}

function npcRaceProgress(time, targetTime, accel) {
  const T = Math.max(0.1, targetTime);
  const tau = Math.min(time, T);
  const total = T - (1 - Math.exp(-accel * T)) / accel;
  const current = tau - (1 - Math.exp(-accel * tau)) / accel;
  return { progress: clamp(current / total, 0, 1), cur: current, total };
}

function updateOpponents(dt, mode) {
  if (!state.opponents.length) return;
  const isRace = mode === 'running' || mode === 'finished';
  const now = state.phase === 'finished' ? state.finishTime + state.finishElapsed : state.raceTime;

  for (const npc of state.opponents) {
    if (npc.onPodium) {
      npc.controller.update(dt, elapsed, { mode: 'finished', speedNorm: 0 });
      continue;
    }
    if (state.phase === 'finished') {
      npc.group.visible = false;
      continue;
    }
    if (!isRace) {
      npc.group.visible = mode !== 'menu';
      npc.group.position.set(laneCenterX(npc.profile.lane), 0, COURSE.startZ);
      npc.controller.update(dt, elapsed, { mode, speedNorm: 0 });
      continue;
    }

    npc.group.visible = true;
    const T = npc.targetTime;
    const accel = npc.profile.accel || 2.4;
    const { progress } = npcRaceProgress(now, T, accel);
    const speed = now < T ? (1 - Math.exp(-accel * now)) * 100 / npcRaceProgress(T, T, accel).total : 0;
    npc.speedNorm = clamp(speed / 10.5, 0, 1);
    npc.distance = progress * 100;

    if (!npc.finished && now >= T) {
      npc.finished = true;
      npc.finishT = 0;
    }
    if (npc.finished) npc.finishT += dt;

    const post = npc.finished ? Math.min(1.8, Math.max(0, now - T) * 2.4) : 0;
    npc.group.position.x = laneCenterX(npc.profile.lane);
    npc.group.position.z = COURSE.startZ - npc.distance - post;
    npc.group.visible = true;
    npc.controller.update(dt, elapsed, {
      mode: npc.finished ? 'finished' : 'running',
      speedNorm: npc.speedNorm,
    });
  }
}

function refreshPlace() {
  if (!dom.hudPlace) return;
  let place = state.playerPlace;
  if (state.phase !== 'finished') {
    place = 1;
    for (const npc of state.opponents) {
      if (npc.distance > state.distance + 0.02) place += 1;
    }
    state.playerPlace = place;
  }
  dom.hudPlace.textContent = String(state.playerPlace);
}

function buildFinishBoard() {
  const entries = [
    {
      name: '你',
      shortName: 'YOU',
      time: state.finishTime,
      lane: COURSE.playerLane,
      isPlayer: true,
      profile: PLAYER_PROFILE,
    },
    ...state.opponents.map((npc) => ({
      name: npc.profile.label,
      shortName: npc.profile.name,
      time: npc.targetTime,
      lane: npc.profile.lane,
      isPlayer: false,
      profile: npc.profile,
    })),
  ];
  entries.sort((a, b) => a.time - b.time || (a.isPlayer ? -1 : b.isPlayer ? 1 : 0));
  state.finishBoard = entries;
  state.playerPlace = entries.findIndex((entry) => entry.isPlayer) + 1;
}

function resetRace() {
  state.countdownTime = 0;
  state.countdownTick = -1;
  state.goOverlayTime = 0;
  dom.body.classList.remove('go-flash');
  state.raceTime = 0;
  state.distance = 0;
  state.speed = 0;
  state.targetSpeed = 0;
  state.lastDir = null;
  state.lastDirX = 0;
  state.lastStepAt = -1;
  state.combo = 0;
  state.maxCombo = 0;
  state.falls = 0;
  state.maxSpeed = 0;
  state.isFalling = false;
  state.isLunging = false;
  state.lungeTime = 0;
  state.diveFinish = false;
  state.diveFallTime = 0;
  state.fallTime = 0;
  state.fallImpactDone = false;
  state.finishTime = 0;
  dom.body.classList.remove('is-lunging');
  state.finishElapsed = 0;
  state.resultsShown = false;
  state.cameraKick = 0;
  state.sprintNotified = false;
  state.newBest = false;
  state.lastHudTime = '';
  state.lastCombo = -1;
  state.finishBoard = [];
  state.playerPlace = 1;
  state.podiumEntries = [];
  state.playerOnPodium = false;
  state.podiumBannerShown = false;
  hidePodiumBanner();
  if (podium) podium.group.visible = false;
  if (runner) runner.group.visible = true;
  if (runner) {
    runner.reset();
    runner.group.position.set(PLAYER_LANE_X, 0, COURSE.startZ);
  }
  resetOpponents();
  if (fx) fx.reset();
  updateHud();
  refreshKeys();
  refreshCombo();
  hideCountdownOverlay();
  hideFinishBanner();
  dom.comboBadge.hidden = true;
}


async function startGame() {
  if (!runner || !['menu', 'finished'].includes(state.phase)) return;
  const fromMenu = state.phase === 'menu';
  hideScreen(dom.menu);
  hideScreen(dom.results);
  hideScreen(dom.pause);
  if (audio) {
    void audio.unlock();
    audio.stopMusic(0.08);
  }
  if (state.helpOpen) closeHelp();
  resetRace();
  runner.group.position.set(PLAYER_LANE_X, 0, COURSE.startZ);
  for (const npc of state.opponents) {
    npc.targetTime = pickRaceTime(npc.profile);
    npc.distance = 0;
    npc.finished = false;
    npc.finishT = 0;
    npc.speedNorm = 0;
    npc.group.position.set(laneCenterX(npc.profile.lane), 0, COURSE.startZ);
    npc.group.visible = true;
    npc.controller.reset();
  }
  flashScreen('255, 247, 236', fromMenu ? 0.24 : 0.5, fromMenu ? 300 : 440);
  setBodyMode('countdown');
  dom.body.classList.remove('is-rushing');
  showCountdownOverlay();
  dom.countdown.classList.add('is-intro');
  state.countdownTime = 0;
  state.countdownTick = 0;
  countdownDigit('3');
  if (dom.countdownKicker) dom.countdownKicker.textContent = 'READY?';
  if (dom.countdownSub) dom.countdownSub.textContent = '左右交替 · 越快越快';
  if (audio) audio.countdown(3);
  if (runner) runner.onCountdownTick();
  pauseIntroVisuals();
  refreshKeys();
  refreshCombo();
  announce('三秒后起跑。左右方向键交替按，越快越快。');
}

function pauseIntroVisuals() {
  dom.body.classList.remove('is-rushing');
  if (dom.progressFill) dom.progressFill.style.width = '0%';
  if (dom.progressRunner) dom.progressRunner.style.left = '0%';
}

function beginRace() {
  if (state.phase !== 'countdown') return;
  state.phase = 'running';
  dom.body.dataset.mode = 'running';
  dom.pauseBtn.hidden = false;
  state.raceTime = 0;
  state.lastStepAt = -1;
  state.speed = 0;
  state.targetSpeed = 0;
  state.goOverlayTime = 0.52;
  state.countdownTime = COUNTDOWN_DURATION;
  dom.countdown.classList.remove('is-intro');
  dom.body.classList.add('go-flash');
  countdownDigit('GO!');
  dom.countdown.classList.add('is-go');
  dom.countdownKicker.textContent = 'RUN!';
  dom.countdownSub.textContent = '左右交替 · 越快越快';
  if (runner) runner.onGo();
  if (audio) {
    audio.go();
    audio.startMusic();
  }
  cameraRig.shake = Math.max(cameraRig.shake, 0.1);
  refreshKeys();
  refreshCombo();
  announce('起跑！左右交替按方向键。');
}

function updateCountdown(dt) {
  state.countdownTime += dt;
  if (state.countdownTime >= 0.8 && state.countdownTick < 1) {
    state.countdownTick = 1;
    countdownDigit('2');
    if (audio) audio.countdown(2);
    if (runner) runner.onCountdownTick();
  }
  if (state.countdownTime >= 1.6 && state.countdownTick < 2) {
    state.countdownTick = 2;
    dom.countdown.classList.remove('is-intro');
    countdownDigit('1');
    if (audio) audio.countdown(1);
    if (runner) runner.onCountdownTick();
  }
  if (state.countdownTime >= COUNTDOWN_DURATION) {
    beginRace();
  }
}

function updateRunning(dt) {
  if (state.goOverlayTime > 0) {
    state.goOverlayTime -= dt;
    if (state.goOverlayTime <= 0) {
      hideCountdownOverlay();
      dom.body.classList.remove('go-flash');
    }
  }

  state.raceTime += dt;

  if (state.isFalling) {
    state.fallTime += dt;
    state.speed = 0;
    state.targetSpeed = 0;
    if (!state.fallImpactDone && state.fallTime > 0.27) {
      state.fallImpactDone = true;
      fx.spawnDust(tempVec.set(state.lastDirX || 0, 0, playerPos.z - 0.9), 5, 1.5);
      cameraRig.shake = Math.max(cameraRig.shake, 0.36);
    }
    runner.group.updateMatrixWorld(true);
    fx.showDizzy(runner.getDizzyAnchor(tempVecA), 1);
    if (state.fallTime >= fallDuration) {
      finishFall();
    }
  } else if (state.isLunging) {
    state.lungeTime += dt;
    state.speed = LUNGE_SPEED;
    state.targetSpeed = 0;
    state.distance += LUNGE_SPEED * dt;
    state.maxSpeed = Math.max(state.maxSpeed, state.speed);
    if (state.distance >= COURSE.length) {
      finishRace();
    } else if (state.lungeTime >= LUNGE_DURATION) {
      endLungeFall();
    }
  } else {
    if (state.lastStepAt >= 0 && state.raceTime - state.lastStepAt > 0.42) {
      state.targetSpeed = Math.max(0, state.targetSpeed - 17 * dt);
    }
    const lambda = state.targetSpeed >= state.speed ? 6.2 : 2.9;
    state.speed = damp(state.speed, state.targetSpeed, lambda, dt);
    state.speed = clamp(state.speed, 0, MAX_SPEED);
    state.distance += state.speed * dt;
    state.maxSpeed = Math.max(state.maxSpeed, state.speed);
    if (!state.sprintNotified && state.distance >= LUNGE_HOT_AT) {
      state.sprintNotified = true;
      showToast('最后 10 米！现在可以冲线了', 'good', 1600);
    }
    if (state.distance >= COURSE.length) {
      finishRace();
    }
  }

  if (state.phase === 'running') {
    updateOpponents(dt, 'running');
  }

  if (state.phase !== 'running') return;

  state.cameraKick = damp(state.cameraKick, 0, 8, dt);
  const swaySpeed = clamp(state.speed / 11, 0, 1);
  const sway = state.isFalling ? 0 : Math.sin(state.raceTime * 10.5) * 0.018 * swaySpeed;
  const z = COURSE.startZ - state.distance;
  runner.group.position.set(PLAYER_LANE_X + sway, 0, z);
  playerPos.copy(runner.group.position);

  runner.update(dt, elapsed, {
    mode: state.isFalling ? 'falling' : state.isLunging ? 'lunging' : 'running',
    speed: state.isFalling ? 0 : state.speed,
    fallTime: state.fallTime,
    lungeT: state.lungeTime / LUNGE_DURATION,
  });
  updateHud();
  refreshComboIfNeeded();
  if (audio) {
    audio.setEnergy(clamp((state.speed - 3) / 8, 0, 1));
  }
  updateRushVisual();
}

function finishFall() {
  state.isFalling = false;
  state.fallTime = 0;
  state.fallImpactDone = false;
  state.lastDir = null;
  state.lastStepAt = -1;
  state.targetSpeed = 0;
  state.speed = 0;
  fx.hideDizzy();
  if (audio) audio.recover();
  refreshKeys();
  refreshCombo();
  showToast('爬起来啦！继续交替按', 'good', 1000);
  announce('重新开始交替按方向键。');
}

function tapDirection(dir) {
  if (state.phase !== 'running' || state.isFalling || state.isLunging) return;
  flashStepKey(dir);
  const now = state.raceTime;
  const first = state.lastDir === null;
  if (state.lastDir === dir) {
    trip(dir);
    return;
  }

  const previousStep = state.lastStepAt;
  let interval = previousStep >= 0 ? now - previousStep : 0.26;
  if (!Number.isFinite(interval) || interval <= 0) interval = 0.2;
  interval = clamp(interval, 0.075, 0.72);
  const cadence = 1 / interval;
  const desired = clamp(3.3 + cadence * 1.03, 3.8, MAX_SPEED);
  state.targetSpeed = desired;
  if (state.speed < 1.1) state.speed = Math.max(state.speed, 2.7);
  state.lastStepAt = now;
  state.lastDir = dir;
  state.cameraKick = (dir === 'left' ? -1 : 1) * 0.06;
  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);

  if (runner) {
    runner.group.updateMatrixWorld(true);
    runner.onStep(dir, first);
    const foot = runner.getFootWorldPosition(dir, tempVec);
    fx.spawnDust(tempVecA.copy(foot), 2, 0.85);
    if (state.combo > 0 && state.combo % 10 === 0) {
      if (audio) audio.combo(state.combo);
      tempVecB.set(runner.group.position.x, 1.35, runner.group.position.z);
      fx.spawnSparkle(tempVecB, 7, 0.8);
    }
  }
  if (audio) audio.step(state.combo);
  refreshKeys();
  refreshCombo(true);
  updateHud();
}

function beginFall(dir, message, tone = 'bad') {
  state.isFalling = true;
  state.isLunging = false;
  state.lungeTime = 0;
  state.fallTime = 0;
  state.fallImpactDone = false;
  state.falls += 1;
  state.combo = 0;
  state.lastDir = null;
  state.lastDirX = runner ? runner.group.position.x : 0;
  state.targetSpeed = 0;
  state.speed = 0;
  state.cameraKick = 0;
  dom.body.classList.remove('is-lunging');
  if (audio) audio.fall();
  cameraRig.shake = Math.max(cameraRig.shake, 0.55);
  if (runner) {
    runner.group.updateMatrixWorld(true);
    const foot = runner.getFootWorldPosition(dir, tempVec);
    fx.spawnDust(tempVec, 4, 1.25);
  }
  showToast(message, tone, 1600);
  flashScreen('255, 125, 135', 0.28, 340);
  refreshKeys();
  refreshCombo();
  updateHud();
  announce('摔倒了，等待 GoRun 爬起来。');
}

function trip(dir) {
  const messages = ['哎呀，同方向啦！', '左脚绊右脚…', '咕咚！摔了个大马趴', '慢一点点，别着急呀'];
  beginFall(dir, messages[Math.floor(Math.random() * messages.length)]);
}

function startLunge() {
  if (state.phase !== 'running' || state.isFalling || state.isLunging) return;
  state.isLunging = true;
  state.lungeTime = 0;
  state.lastDir = null;
  state.lastStepAt = -1;
  state.targetSpeed = 0;
  state.speed = LUNGE_SPEED;
  state.cameraKick = 0.16;
  dom.body.classList.add('is-lunging');
  cameraRig.shake = Math.max(cameraRig.shake, 0.35);
  if (runner) {
    runner.group.updateMatrixWorld(true);
    const foot = runner.getFootWorldPosition('right', tempVec);
    fx.spawnDust(tempVec, 4, 1.0);
    fx.spawnSparkle(tempVecB.set(runner.group.position.x, 1.2, runner.group.position.z - 0.6), 5, 0.75);
  }
  flashScreen('255, 211, 110', 0.1, 180);
  showToast('冲线！向前扑出去！', 'good', 850);
  refreshKeys();
  refreshCombo();
  updateHud();
  announce('冲线，向前扑出。');
}

function endLungeFall() {
  beginFall('right', '扑早啦！没冲过线，等 GoRun 爬起来…');
}

function finishRace() {
  if (state.phase !== 'running') return;
  const finishedWithLunge = state.isLunging;
  state.phase = 'finished';
  state.finishTime = state.raceTime;
  state.distance = COURSE.length;
  state.speed = 0;
  state.targetSpeed = 0;
  state.isFalling = false;
  state.isLunging = false;
  state.lungeTime = 0;
  state.diveFinish = false;
  state.diveFallTime = 0;
  state.fallTime = 0;
  state.resultsShown = false;
  state.finishElapsed = 0;
  state.maxSpeed = Math.max(state.maxSpeed, 0);
  dom.body.classList.remove('is-lunging');
  clearToast();
  fx.hideDizzy();
  buildFinishBoard();
  if (finishedWithLunge) {
    // Crossing the line doesn't cancel the dive's mandatory fall; it just
    // means the clock stops before the tumble. The fall is shown as a short
    // post-finish beat, then the podium ceremony begins.
    state.diveFinish = true;
    state.diveFallTime = 0;
    runner.group.visible = true;
    runner.group.position.set(PLAYER_LANE_X, 0, COURSE.finishZ - 0.45);
    playerPos.copy(runner.group.position);
    for (const npc of state.opponents) npc.group.visible = false;
    beginFall('right', '压线成功！落地还是要摔一下…');
  } else {
    arrangePodium();
  }
  const hadBest = Boolean(state.best);
  state.newBest = !hadBest || state.finishTime < state.best;
  if (state.newBest) {
    state.best = state.finishTime;
    saveBest(state.finishTime);
    updateBestLabel();
  }
  if (audio) {
    audio.stopMusic(0.06);
    audio.finish();
  }
  cameraRig.shake = 0.3;
  setBodyMode('finished');
  hideCountdownOverlay();
  dom.body.classList.remove('go-flash');
  dom.body.classList.remove('is-rushing');
  dom.stepDock.classList.add('is-locked');
  hideFinishBanner();
  showFinishBanner();
  updateHud();
  refreshKeys();
  refreshCombo();
  announce('冲过终点，用时 ' + formatTime(state.finishTime) + ' 秒。');
}

function updateFinished(dt) {
  state.finishElapsed += dt;
  if (!runner) return;
  if (state.diveFinish) {
    state.diveFallTime += dt;
    runner.update(dt, elapsed, { mode: 'falling', speed: 0, fallTime: state.diveFallTime });
    if (state.diveFallTime >= 0.95) {
      state.diveFinish = false;
      state.isFalling = false;
      arrangePodium();
    }
  } else {
    updatePodium(dt);
  }
  if (!state.podiumBannerShown && state.finishElapsed >= 1.45) {
    showPodiumBanner();
  }
  if (!state.resultsShown && state.finishElapsed >= FINISH_DELAY) {
    showResults();
  }
}

function placeLabel(place) {
  if (place === 1) return '冠军';
  if (place === 2) return '亚军';
  if (place === 3) return '季军';
  return '完赛';
}

function renderRaceBoard() {
  if (!dom.raceBoard) return;
  dom.raceBoard.innerHTML = state.finishBoard
    .map((entry, index) => {
      const rank = index + 1;
      const color = '#' + entry.profile.kit.top.toString(16).padStart(6, '0');
      const meta = entry.isPlayer
        ? 'GORUN · 你的成绩'
        : entry.profile.country + ' · PB ' + entry.profile.pb.toFixed(2);
      return (
        '<li class="race-row' +
        (entry.isPlayer ? ' is-you' : '') +
        '" data-rank="' +
        rank +
        '" style="--row-color:' +
        color +
        '">' +
        '<span class="race-rank">' +
        rank +
        '</span>' +
        '<span class="race-dot" aria-hidden="true"></span>' +
        '<span class="race-name"><b>' +
        entry.name +
        '</b><small>' +
        meta +
        '</small></span>' +
        '<span class="race-time">' +
        formatTime(entry.time) +
        '<small>s</small></span>' +
        '</li>'
      );
    })
    .join('');
}

function showResults() {
  if (state.resultsShown) return;
  state.resultsShown = true;
  const place = state.playerPlace;
  const placeClass = place <= 3 ? String(place) : 'other';
  dom.resultTime.textContent = formatTime(state.finishTime);
  dom.newBestBadge.hidden = !state.newBest;
  dom.bestResult.textContent = formatTime(state.best) + 's';
  dom.fallResult.textContent = String(state.falls);
  dom.comboResult.textContent = String(state.maxCombo);
  dom.maxSpeedResult.innerHTML = Math.round(state.maxSpeed * 3.6) + '<small>km/h</small>';
  dom.placeBadge.dataset.place = placeClass;
  dom.placeNumber.textContent = String(place);
  dom.placeLabel.textContent = placeLabel(place);
  dom.resultsTitle.textContent = place <= 3 ? placeLabel(place) + '！' : '第 ' + place + ' 名';
  if (place === 1) {
    dom.resultSummary.textContent = '你在一群飞人中间率先冲线，把这场 100 米决赛拿下了！';
  } else if (place <= 3) {
    dom.resultSummary.textContent = '你和世界级飞人一起站上领奖台，跑出了 ' + formatTime(state.finishTime) + ' 秒。';
  } else if (state.newBest) {
    dom.resultSummary.textContent = '这次是第 ' + place + ' 名，但你刷新了自己的最佳成绩，继续追！';
  } else if (state.falls > 0) {
    dom.resultSummary.textContent = '第 ' + place + ' 名完赛。摔了 ' + state.falls + ' 次也没关系，下一次把节奏踩稳。';
  } else {
    dom.resultSummary.textContent = '第 ' + place + ' 名完赛。飞人们很快，但你的下一次会更快。';
  }
  renderRaceBoard();
  hidePodiumBanner();
  updateBestLabel();
  showScreen(dom.results);
  announce(
    '第 ' +
      place +
      ' 名。用时 ' +
      formatTime(state.finishTime) +
      ' 秒，摔倒 ' +
      state.falls +
      ' 次，最高连击 ' +
      state.maxCombo +
      '。'
  );
}

function refreshComboIfNeeded() {
  const shouldShow = state.phase === 'running' && !state.isFalling && state.combo > 1;
  if (dom.comboBadge.hidden === shouldShow) {
    refreshCombo(false);
  }
  if (state.combo !== state.lastCombo) {
    state.lastCombo = state.combo;
    dom.comboValue.textContent = state.combo;
  }
}

function updateHud() {
  if (!dom.timeValue) return;
  const time = state.phase === 'finished' ? state.finishTime : state.raceTime;
  const formatted = formatTime(time);
  if (formatted !== state.lastHudTime) {
    dom.timeValue.textContent = formatted;
    state.lastHudTime = formatted;
  }
  const distance = clamp(state.distance, 0, COURSE.length);
  dom.distanceValue.textContent = String(Math.floor(distance));
  const pct = (distance / COURSE.length) * 100;
  dom.progressFill.style.width = pct + '%';
  dom.progressRunner.style.left = pct + '%';
  const displaySpeed = state.isFalling ? 0 : state.speed;
  dom.speedValue.textContent = String(Math.round(displaySpeed * 3.6));
  dom.speedFill.style.width = clamp(displaySpeed / MAX_SPEED, 0, 1) * 100 + '%';
  refreshPlace();
  updateDiveButton();
}

function updateRushVisual() {
  const speedNorm = clamp((state.speed - 3.5) / 8, 0, 1);
  document.documentElement.style.setProperty('--rush', speedNorm.toFixed(3));
  dom.body.classList.toggle('is-rushing', speedNorm > 0.48 && state.phase === 'running');
}

function flashStepKey(dir) {
  const button = dir === 'left' ? dom.leftKey : dom.rightKey;
  if (!button) return;
  button.classList.remove('is-hit');
  void button.offsetWidth;
  button.classList.add('is-hit');
}

function menuCameraPoint(now, outPosition, outLook) {
  const isPortrait = stage && stage.camera.aspect < 0.82;
  const angle = cameraRig.menuAngle + Math.sin(now * 0.16) * 0.055;
  const radius = isPortrait ? 6.3 : 5.85;
  outPosition.set(
    Math.sin(angle) * radius,
    (isPortrait ? 1.72 : 1.55) + Math.sin(now * 0.55) * 0.018,
    COURSE.startZ + Math.cos(angle) * radius
  );
  outLook.set(isPortrait ? -0.05 : 0.18, isPortrait ? 1.24 : 1.33, COURSE.startZ + 0.12);
  return isPortrait ? 52 : 48;
}

function snapCameraToMenu() {
  if (!stage) return;
  const camera = stage.camera;
  const fov = menuCameraPoint(elapsed, tempVecA, tempLook);
  cameraRig.base.copy(tempVecA);
  cameraRig.look.copy(tempLook);
  cameraRig.fov = fov;
  cameraRig.targetFov = fov;
  cameraRig.shake = 0;
  camera.position.copy(cameraRig.base);
  camera.lookAt(cameraRig.look);
  camera.fov = cameraRig.fov;
  camera.updateProjectionMatrix();
}

function updateCamera(dt) {
  if (!stage) return;
  const camera = stage.camera;
  const isPortrait = camera.aspect < 0.82;
  const isShortLandscape = window.innerWidth > window.innerHeight && window.innerHeight < 560;
  const player = runner ? runner.group.position : tempVec.set(PLAYER_LANE_X, 0, COURSE.startZ);
  const speedNorm = clamp((state.speed - 1.5) / 9.5, 0, 1);
  cameraRig.targetFov = cameraRig.targetFov || 50;

  if (state.phase === 'menu') {
    const fov = menuCameraPoint(elapsed, tempVecA, tempLook);
    cameraRig.base.copy(tempVecA);
    cameraRig.look.copy(tempLook);
    cameraRig.targetFov = fov;
    cameraRig.fov = damp(cameraRig.fov, fov, 3.5, dt);
    cameraRig.shake = damp(cameraRig.shake, 0, 4, dt);
  } else if (state.phase === 'countdown') {
    if (state.countdownTime < 1.6) {
      const t = clamp(state.countdownTime / 1.6, 0, 1);
      const lineupDistance = isPortrait ? 11.6 : 8.35;
      const lineupX = isPortrait ? 0.05 : 0.38;
      cameraRig.base.set(
        lineupX + lerp(0.2, 0, t),
        (isPortrait ? 3.0 : 2.62) + t * 0.05,
        COURSE.startZ - lerp(lineupDistance + 0.55, lineupDistance, t)
      );
      cameraRig.look.set(
        isPortrait ? 0.12 : 0.08,
        (isPortrait ? 1.38 : 1.31) + (isShortLandscape ? 0.12 : 0),
        COURSE.startZ + 0.08
      );
      cameraRig.fov = isPortrait ? 60 : 50;
    } else {
      const t = easeInOutCubic(clamp((state.countdownTime - 1.6) / (COUNTDOWN_DURATION - 1.6), 0, 1));
      cameraRig.base.set(
        isPortrait ? -1.8 : -2.3,
        lerp(2.75, 2.9, t) + Math.sin(elapsed * 5.5) * 0.004,
        player.z + lerp(7.4, 7.2, t)
      );
      cameraRig.look.set(
        isPortrait ? 0.08 : 0.12,
        lerp(1.15, 1.1, t) + (isShortLandscape ? 0.15 : 0),
        player.z - lerp(5.2, 5.0, t)
      );
      cameraRig.fov = lerp(65, 66, t);
    }
    cameraRig.shake = damp(cameraRig.shake, 0, 5, dt);
  } else if (state.phase === 'running') {
    let targetX;
    let targetY;
    let targetZ;
    let lookX;
    let lookY;
    let lookZ;
    let targetFov;
    let lambda;

    if (state.isFalling) {
      targetX = isPortrait ? -1.9 : -2.4;
      targetY = 2.35;
      targetZ = player.z + (isPortrait ? 6.2 : 6.0);
      lookX = 0.1;
      lookY = 0.7;
      lookZ = player.z - 1.6;
      targetFov = isPortrait ? 68 : 66;
      lambda = 4.2;
    } else {
      let trailingGap = 0;
      for (const npc of state.opponents) {
        if (!npc.group.visible) continue;
        const gap = npc.group.position.z - player.z;
        if (gap > trailingGap) trailingGap = gap;
      }
      const extra = clamp(trailingGap, 0, 6.5);
      const sway = Math.sin(elapsed * 2.2) * 0.04 * speedNorm + state.cameraKick;
      const bob = Math.sin(elapsed * 9.5) * 0.012 * speedNorm;
      targetX = (isPortrait ? -2.3 : -3.0) + sway;
      targetY = (isPortrait ? 3.1 : 2.9) + bob + speedNorm * 0.1 + extra * 0.035;
      targetZ = player.z + (isPortrait ? 8.2 : 7.0) + extra + speedNorm * 0.18;
      lookX = isPortrait ? 0.08 : 0.12;
      lookY = (isPortrait ? 1.08 : 1.12) + (isShortLandscape ? 0.15 : 0);
      lookZ = player.z - (isPortrait ? 5.6 : 4.6) - extra * 0.12;
      targetFov = (isPortrait ? 74 : 72) + speedNorm * (isPortrait ? 4 : 4) + (isShortLandscape ? 2 : 0);
      lambda = 6.2;
    }

    cameraRig.base.x = damp(cameraRig.base.x, targetX, lambda, dt);
    cameraRig.base.y = damp(cameraRig.base.y, targetY, lambda * 0.8, dt);
    cameraRig.base.z = damp(cameraRig.base.z, targetZ, lambda * 1.25, dt);
    cameraRig.look.x = damp(cameraRig.look.x, lookX, lambda, dt);
    cameraRig.look.y = damp(cameraRig.look.y, lookY, lambda, dt);
    cameraRig.look.z = damp(cameraRig.look.z, lookZ, lambda, dt);
    cameraRig.fov = damp(cameraRig.fov, targetFov, 3.2, dt);
    cameraRig.shake = damp(cameraRig.shake, 0, 4.7, dt);
  } else if (state.phase === 'finished') {
    if (state.diveFinish) {
      cameraRig.base.set(
        isPortrait ? PLAYER_LANE_X - 2.0 : PLAYER_LANE_X - 2.9,
        2.0,
        COURSE.finishZ - (isPortrait ? 4.4 : 4.2)
      );
      cameraRig.look.set(PLAYER_LANE_X + 0.05, 0.72, COURSE.finishZ - 0.35);
      cameraRig.fov = isPortrait ? 60 : 62;
      cameraRig.shake = damp(cameraRig.shake, 0, 3.2, dt);
    } else {
      const t = easeInOutCubic(clamp(state.finishElapsed / 2.8, 0, 1));
      const podiumZ = podium ? podium.group.position.z : PODIUM_Z;
      const orbit = Math.sin(state.finishElapsed * 0.32) * 0.05;
      cameraRig.base.set(
        lerp(isPortrait ? 0.9 : 1.45, isPortrait ? 0.55 : 0.9, t) + orbit,
        lerp(isPortrait ? 2.9 : 2.65, isPortrait ? 3.15 : 2.95, t),
        podiumZ - lerp(isPortrait ? 8.7 : 7.3, isPortrait ? 9.0 : 7.55, t)
      );
      cameraRig.look.set(0.0, isPortrait ? 1.1 : 1.3, podiumZ + 0.18);
      cameraRig.fov = isPortrait ? 58 : 50;
      cameraRig.shake = damp(cameraRig.shake, 0, 3.5, dt);
    }
  } else {
    cameraRig.shake = damp(cameraRig.shake, 0, 4, dt);
  }

  // Apply the camera, with a tiny bit of hand-held life at speed.
  const speedShake = state.phase === 'running' && !state.isFalling ? speedNorm * 0.005 : 0;
  const amp = (cameraRig.shake + speedShake) * (reducedMotion ? 0.3 : 1);
  camera.position.copy(cameraRig.base);
  if (amp > 0.0002) {
    const sx = (Math.sin(elapsed * 71) * 0.5 + Math.sin(elapsed * 113 + 1.7) * 0.22) * amp * 0.26;
    const sy = (Math.sin(elapsed * 89 + 0.8) * 0.55 + Math.sin(elapsed * 137 + 2.2) * 0.2) * amp * 0.2;
    camera.position.x += sx;
    camera.position.y += sy;
    tempVecA.copy(cameraRig.look);
    tempVecA.x += sx * 0.25;
    tempVecA.y += sy * 0.25;
    camera.lookAt(tempVecA);
    camera.rotateZ(Math.sin(elapsed * 57) * amp * 0.055);
  } else {
    camera.lookAt(cameraRig.look);
  }
  if (Math.abs(camera.fov - cameraRig.fov) > 0.015) {
    camera.fov = cameraRig.fov;
    camera.updateProjectionMatrix();
  }
}

function pauseGame() {
  if (state.phase !== 'running') return;
  setBodyMode('paused');
  dom.pauseBtn.hidden = true;
  if (audio) audio.stopMusic(0.08);
  showScreen(dom.pause);
  dom.body.classList.remove('is-rushing');
  dom.stepDock.classList.add('is-locked');
  refreshKeys();
  window.setTimeout(() => dom.resumeBtn.focus({ preventScroll: true }), 80);
  announce('比赛已暂停。');
}

function resumeGame() {
  if (state.phase !== 'paused') return;
  hideScreen(dom.pause);
  dom.body.dataset.mode = 'running';
  state.phase = 'running';
  dom.pauseBtn.hidden = false;
  if (audio) {
    void audio.unlock();
    audio.startMusic();
  }
  refreshKeys();
  announce('继续比赛。');
}

function returnToMenu() {
  if (audio) {
    audio.stopMusic(0.12);
  }
  hideScreen(dom.results);
  hideScreen(dom.pause);
  hideScreen(dom.help);
  hideCountdownOverlay();
  hideFinishBanner();
  dom.body.classList.remove('go-flash');
  state.helpOpen = false;
  setBodyMode('menu');
  state.resultsShown = false;
  resetRace();
  state.phase = 'menu';
  dom.body.dataset.mode = 'menu';
  dom.pauseBtn.hidden = true;
  if (runner) runner.group.position.set(PLAYER_LANE_X, 0, COURSE.startZ);
  resetOpponents();
  snapCameraToMenu();
  showScreen(dom.menu);
  updateBestLabel();
  state.best = loadBest();
  updateBestLabel();
  dom.comboBadge.hidden = true;
  dom.stepDock.classList.add('is-locked');
  dom.body.classList.remove('is-rushing');
  document.documentElement.style.setProperty('--rush', '0');
  refreshKeys();
  clearToast();
  flashScreen('255, 247, 236', 0.4, 420);
  announce('回到标题页。');
}

function clearToast() {
  window.clearTimeout(toastTimer);
  dom.toast.classList.remove('is-visible');
}

function openHelp() {
  if (state.helpOpen || state.phase === 'countdown') return;
  if (state.phase === 'running') pauseGame();
  state.helpOpen = true;
  dom.helpStart.textContent = state.phase === 'menu' ? '知道啦，开跑！' : '知道啦';
  showScreen(dom.help);
  dom.helpClose.focus({ preventScroll: true });
  if (audio) {
    void audio.unlock();
    audio.stopMusic(0.1);
  }
}

function closeHelp() {
  if (!state.helpOpen) return;
  state.helpOpen = false;
  hideScreen(dom.help);
  if (state.phase === 'running') {
    if (audio) audio.startMusic();
  }
}

function restartGame() {
  if (state.phase !== 'finished' || !state.resultsShown) return;
  hideScreen(dom.results);
  state.resultsShown = false;
  startGame();
}

async function copyResult() {
  const text =
    'GoRun 100m · 第 ' +
    state.playerPlace +
    ' 名 · ' +
    formatTime(state.finishTime) +
    's · 摔倒 ' +
    state.falls +
    ' 次 · 最高连击 ' +
    state.maxCombo +
    '\n来和博尔特、苏炳添等飞人跑一场：' +
    window.location.href;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast('成绩已复制，去炫耀吧！', 'good', 1500);
  } catch (error) {
    showToast('复制失败，试试手动选择文字吧', 'bad', 1700);
  }
}

function handleKeyDown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const code = event.code;
  const key = event.key.toLowerCase();

  if (key === 'm') {
    toggleSound();
    return;
  }

  if (state.helpOpen) {
    if (code === 'Escape') {
      event.preventDefault();
      closeHelp();
    }
    return;
  }

  if (state.phase === 'menu') {
    if (code === 'Space' || code === 'Enter') {
      event.preventDefault();
      startGame();
    } else if (key === 'h') {
      event.preventDefault();
      openHelp();
    }
    return;
  }

  if (state.phase === 'countdown') {
    return;
  }

  if (state.phase === 'running') {
    if (code === 'ArrowLeft' || code === 'KeyA') {
      event.preventDefault();
      if (!event.repeat) tapDirection('left');
      return;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      event.preventDefault();
      if (!event.repeat) tapDirection('right');
      return;
    }
    if (code === 'Escape' || code === 'KeyP') {
      event.preventDefault();
      pauseGame();
      return;
    }
    if (key === 'h') {
      event.preventDefault();
      openHelp();
      return;
    }
    if (code === 'Space') {
      event.preventDefault();
      if (!event.repeat) startLunge();
      return;
    }
    return;
  }

  if (state.phase === 'paused') {
    if (code === 'Escape' || code === 'KeyP' || code === 'Space' || code === 'Enter') {
      event.preventDefault();
      resumeGame();
    }
    return;
  }

  if (state.phase === 'finished') {
    if (state.resultsShown && (code === 'Space' || code === 'Enter' || key === 'r')) {
      event.preventDefault();
      restartGame();
    }
  }
}

function toggleSound() {
  if (!audio) return;
  audio.toggleMuted();
  syncSoundIcon();
  if (!audio.muted) {
    void audio.unlock();
    if (state.phase === 'running') audio.startMusic();
  }
}

function bindEvents() {
  dom.startBtn.addEventListener('click', startGame);
  dom.restartBtn.addEventListener('click', restartGame);
  dom.howBtn.addEventListener('click', openHelp);
  dom.helpBtn.addEventListener('click', openHelp);
  dom.helpClose.addEventListener('click', closeHelp);
  dom.helpStart.addEventListener('click', () => {
    const wasMenu = state.phase === 'menu';
    closeHelp();
    if (wasMenu) startGame();
  });
  dom.help.addEventListener('click', (event) => {
    if (event.target === dom.help) closeHelp();
  });
  dom.pauseBtn.addEventListener('click', pauseGame);
  dom.resumeBtn.addEventListener('click', resumeGame);
  dom.pauseHomeBtn.addEventListener('click', returnToMenu);
  dom.homeBtn.addEventListener('click', returnToMenu);
  dom.copyBtn.addEventListener('click', copyResult);
  dom.soundBtn.addEventListener('click', toggleSound);

  const bindStep = (button, dir) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      tapDirection(dir);
    });
    button.addEventListener('click', (event) => {
      if (event.detail === 0) tapDirection(dir);
    });
  };
  bindStep(dom.leftKey, 'left');
  bindStep(dom.rightKey, 'right');

  const bindZone = (zone, dir) => {
    if (!zone) return;
    zone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      tapDirection(dir);
      zone.classList.add('is-hit');
      window.setTimeout(() => zone.classList.remove('is-hit'), 170);
    });
  };
  bindZone(dom.leftZone, 'left');
  bindZone(dom.rightZone, 'right');

  if (dom.diveBtn) {
    dom.diveBtn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      startLunge();
    });
    dom.diveBtn.addEventListener('click', (event) => {
      if (event.detail === 0) startLunge();
    });
  }

  window.addEventListener('keydown', handleKeyDown, { passive: false });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.phase === 'running') {
      pauseGame();
    }
  });
}

function update(dt) {
  if (!stage || !runner) return;
  if (state.phase === 'menu') {
    runner.group.position.set(PLAYER_LANE_X, 0, COURSE.startZ);
    playerPos.copy(runner.group.position);
    runner.update(dt, elapsed, { mode: 'menu', speed: 0, fallTime: 0 });
    updateOpponents(dt, 'menu');
    fx.update(dt);
    updateHud();
    refreshComboIfNeeded();
    updateCamera(dt);
  } else if (state.phase === 'countdown') {
    updateCountdown(dt);
    if (state.phase === 'countdown') {
      runner.group.position.set(PLAYER_LANE_X, 0, COURSE.startZ);
      playerPos.copy(runner.group.position);
      const liningUp = state.countdownTime < 1.6;
      runner.update(dt, elapsed, { mode: liningUp ? 'lineup' : 'countdown', speed: 0, fallTime: 0 });
      updateOpponents(dt, liningUp ? 'lineup' : 'countdown');
      fx.update(dt);
      updateHud();
      updateCamera(dt);
    } else {
      // beginRace() just flipped us into running this frame.
      updateRunning(dt);
      fx.update(dt);
      if (state.phase === 'finished') {
        updateFinished(dt);
      }
      updateCamera(dt);
    }
  } else if (state.phase === 'running') {
    updateRunning(dt);
    fx.update(dt);
    if (state.phase === 'finished') {
      updateFinished(dt);
    }
    updateCamera(dt);
  } else if (state.phase === 'finished') {
    updateFinished(dt);
    fx.update(dt);
    updateCamera(dt);
  } else if (state.phase === 'paused') {
    // Leave the runner mid-pose. The world keeps breathing softly behind the card.
    updateCamera(0);
  }

  stage.update(dt, elapsed, playerPos);
  stage.renderer.render(stage.scene, stage.camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.08, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  elapsed += dt;
  if (state.phase === 'loading') return;
  update(dt);
}

async function boot() {
  try {
    if ('fonts' in document) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 1800)),
      ]);
    }
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    touchMode = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    dom.body.classList.toggle('is-touch', touchMode);
    stage = createWorld(dom.stage);
    podium = createPodium();
    stage.scene.add(podium.group);
    runner = createRunner();
    fallDuration = runner.fallDuration || fallDuration;
    runner.group.position.set(PLAYER_LANE_X, 0, COURSE.startZ);
    stage.scene.add(runner.group);
    state.opponents = OPPONENTS.map((profile) => {
      const controller = createOpponent(profile);
      controller.group.position.set(laneCenterX(profile.lane), 0, COURSE.startZ);
      controller.group.visible = false;
      controller.update(0, 0, { mode: 'menu', speedNorm: 0 });
      stage.scene.add(controller.group);
      return {
        profile,
        controller,
        group: controller.group,
        targetTime: pickRaceTime(profile),
        distance: 0,
        finished: false,
        finishT: 0,
        speedNorm: 0,
      };
    });
    fx = createFX(stage.scene);
    audio = new AudioKit();
    syncSoundIcon();
    updateBestLabel();
    setBodyMode('menu');
    dom.results.setAttribute('aria-hidden', 'true');
    dom.pause.setAttribute('aria-hidden', 'true');
    dom.help.setAttribute('aria-hidden', 'true');
    dom.countdown.setAttribute('aria-hidden', 'true');
    dom.error.hidden = true;
    bindEvents();
    snapCameraToMenu();
    updateHud();
    refreshKeys();
    refreshCombo();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    window.setTimeout(() => {
      dom.body.classList.add('is-ready');
      setLoaderHidden();
      if (audio) syncSoundIcon();
    }, 260);
  } catch (error) {
    console.error(error);
    document.body.dataset.mode = 'menu';
    dom.body.classList.add('is-ready');
    setLoaderHidden();
    if (dom.error) dom.error.hidden = false;
  }
}

boot();
