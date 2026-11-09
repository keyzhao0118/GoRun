import * as THREE from 'three';
import { COURSE, createWorld } from './world.js';
import { createRunner } from './character.js';
import { createFX } from './fx.js';
import { AudioKit } from './audio.js';
import { clamp, damp, lerp, easeInOutCubic } from './utils.js';

const COUNTDOWN_DURATION = 2.4;
const FINISH_DELAY = 1.28;
const FINISH_PAST = 1.8;
const BEST_KEY = 'gorun.best.v1';
const MAX_SPEED = 12.2;
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
  stepDock: $('#stepDock'),
  comboBadge: $('#comboBadge'),
  comboValue: $('#comboValue'),
  stepHint: $('#stepHint'),
  leftKey: $('#leftKey'),
  rightKey: $('#rightKey'),
  countdown: $('#countdown'),
  countdownKicker: $('#countdownKicker'),
  countdownNumber: $('#countdownNumber'),
  countdownSub: $('#countdownSub'),
  finishBanner: $('#finishBanner'),
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
  gradeBadge: $('#gradeBadge'),
  gradeLetter: $('#gradeLetter'),
  gradeLabel: $('#gradeLabel'),
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
  finishTime: 0,
  finishElapsed: 0,
  resultsShown: false,
  cameraKick: 0,
  sprintNotified: false,
  helpOpen: false,
  lastHudTime: '',
  lastCombo: -1,
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
let fx = null;
let audio = null;
let elapsed = 0;
let lastFrame = performance.now();
let toastTimer = 0;
let finishBannerTimer = 0;
let reducedMotion = false;

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
  dom.countdown.classList.add('is-open');
  dom.countdown.setAttribute('aria-hidden', 'false');
  dom.countdownKicker.textContent = 'READY?';
  dom.countdownSub.textContent = '左右交替 · 越快越快';
}

function hideCountdownOverlay() {
  if (!dom.countdown) return;
  dom.countdown.classList.remove('is-open');
  dom.countdown.classList.remove('is-go');
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

function refreshKeys() {
  if (!dom.leftKey || !dom.rightKey) return;
  const running = state.phase === 'running';
  const locked = !running || state.isFalling;
  const expected = locked ? null : state.lastDir === 'left' ? 'right' : state.lastDir === 'right' ? 'left' : 'both';
  dom.leftKey.classList.toggle('is-next', expected === 'left' || expected === 'both');
  dom.rightKey.classList.toggle('is-next', expected === 'right' || expected === 'both');
  dom.leftKey.classList.toggle('is-locked', locked);
  dom.rightKey.classList.toggle('is-locked', locked);
  dom.leftKey.setAttribute('aria-disabled', locked ? 'true' : 'false');
  dom.rightKey.setAttribute('aria-disabled', locked ? 'true' : 'false');
  dom.stepDock.classList.toggle('is-locked', locked);

  let hint = '左右交替按，越快越快！';
  if (state.phase === 'countdown') hint = '准备好，要起跑啦…';
  else if (state.phase === 'menu') hint = '左右交替按，越快越快！';
  else if (state.phase === 'finished') hint = '冲过终点啦！';
  else if (state.phase === 'paused') hint = '比赛暂停中';
  else if (state.isFalling) hint = '哎呀！等它爬起来…';
  else if (!state.lastDir) hint = '按 ← 或 → 起跑！';
  else hint = state.lastDir === 'left' ? '下一拍：→ 右' : '下一拍：← 左';
  dom.stepHint.textContent = hint;
}

function refreshCombo(animate = false) {
  if (!dom.comboBadge) return;
  const visible = state.phase === 'running' && !state.isFalling && state.combo > 1;
  dom.comboBadge.hidden = !visible;
  dom.comboValue.textContent = state.combo;
  if (visible && animate) {
    dom.comboBadge.classList.remove('is-pop');
    void dom.comboBadge.offsetWidth;
    dom.comboBadge.classList.add('is-pop');
  }
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
  state.fallTime = 0;
  state.fallImpactDone = false;
  state.finishTime = 0;
  state.finishElapsed = 0;
  state.resultsShown = false;
  state.cameraKick = 0;
  state.sprintNotified = false;
  state.newBest = false;
  state.lastHudTime = '';
  state.lastCombo = -1;
  if (runner) {
    runner.reset();
    runner.group.position.set(0, 0, COURSE.startZ);
  }
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
  runner.group.position.set(0, 0, COURSE.startZ);
  flashScreen('255, 247, 236', fromMenu ? 0.24 : 0.5, fromMenu ? 300 : 440);
  setBodyMode('countdown');
  dom.body.classList.remove('is-rushing');
  showCountdownOverlay();
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
  } else {
    if (state.lastStepAt >= 0 && state.raceTime - state.lastStepAt > 0.42) {
      state.targetSpeed = Math.max(0, state.targetSpeed - 17 * dt);
    }
    const lambda = state.targetSpeed >= state.speed ? 6.2 : 2.9;
    state.speed = damp(state.speed, state.targetSpeed, lambda, dt);
    state.speed = clamp(state.speed, 0, MAX_SPEED);
    state.distance += state.speed * dt;
    state.maxSpeed = Math.max(state.maxSpeed, state.speed);
    if (!state.sprintNotified && state.distance >= 90) {
      state.sprintNotified = true;
      showToast('最后 10 米，冲呀！', 'good', 1300);
    }
    if (state.distance >= COURSE.length) {
      finishRace();
    }
  }

  if (state.phase !== 'running') return;

  state.cameraKick = damp(state.cameraKick, 0, 8, dt);
  const swaySpeed = clamp(state.speed / 11, 0, 1);
  const sway = state.isFalling ? 0 : Math.sin(state.raceTime * 10.5) * 0.018 * swaySpeed;
  const z = COURSE.startZ - state.distance;
  runner.group.position.set(sway, 0, z);
  playerPos.copy(runner.group.position);

  runner.update(dt, elapsed, {
    mode: state.isFalling ? 'falling' : 'running',
    speed: state.isFalling ? 0 : state.speed,
    fallTime: state.fallTime,
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
  if (state.phase !== 'running' || state.isFalling) return;
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

function trip(dir) {
  state.isFalling = true;
  state.fallTime = 0;
  state.fallImpactDone = false;
  state.falls += 1;
  state.combo = 0;
  state.lastDir = null;
  state.lastDirX = runner ? runner.group.position.x : 0;
  state.targetSpeed = 0;
  state.speed = 0;
  state.cameraKick = 0;
  if (audio) audio.fall();
  cameraRig.shake = Math.max(cameraRig.shake, 0.55);
  if (runner) {
    runner.group.updateMatrixWorld(true);
    const foot = runner.getFootWorldPosition(dir, tempVec);
    fx.spawnDust(tempVec, 4, 1.25);
  }
  const messages = ['哎呀，同方向啦！', '左脚绊右脚…', '咕咚！摔了个大屁股蹲', '慢一点点，别着急呀'];
  showToast(messages[Math.floor(Math.random() * messages.length)], 'bad', 1500);
  flashScreen('255, 125, 135', 0.28, 340);
  refreshKeys();
  refreshCombo();
  updateHud();
  announce('摔倒了，等待小兔爬起来。');
}

function finishRace() {
  if (state.phase !== 'running') return;
  state.phase = 'finished';
  state.finishTime = state.raceTime;
  state.distance = COURSE.length;
  state.speed = 0;
  state.targetSpeed = 0;
  state.isFalling = false;
  state.fallTime = 0;
  state.resultsShown = false;
  state.finishElapsed = 0;
  state.maxSpeed = Math.max(state.maxSpeed, 0);
  clearToast();
  runner.group.position.set(0, 0, COURSE.finishZ - FINISH_PAST);
  playerPos.copy(runner.group.position);
  fx.hideDizzy();
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
  fx.burstConfetti(runner.group.position);
  runner.group.updateMatrixWorld(true);
  fx.spawnSparkle(runner.getHeadWorldPosition(tempVec).add(new THREE.Vector3(0, 0.35, 0)), 16, 1.05);
  cameraRig.shake = 0.25;
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
  runner.group.position.set(0, 0, COURSE.finishZ - FINISH_PAST);
  playerPos.copy(runner.group.position);
  runner.update(dt, elapsed, { mode: 'finished', speed: 0, fallTime: 0 });
  if (!state.resultsShown && state.finishElapsed >= FINISH_DELAY) {
    showResults();
  }
}

function getGrade(time, falls) {
  if (time <= 13.0) {
    return {
      letter: 'S',
      label: '闪电兔',
      title: '快得只剩耳朵！',
      summary: falls === 0 ? '没有摔倒，速度拉满，小短腿直接跑出了残影。' : '虽然打了个滚，还是飞快地冲过了终点。',
    };
  }
  if (time <= 16.2) {
    return {
      letter: 'A',
      label: '风之兔',
      title: '漂亮的一跑！',
      summary: falls === 0 ? '节奏顺滑，像一阵刚出炉的小旋风。' : '摔了一跤也不怕，风一样的兔子又站起来啦。',
    };
  }
  if (time <= 21.5) {
    return {
      letter: 'B',
      label: '稳稳达阵',
      title: '稳稳抵达终点！',
      summary: '不慌不忙跑完了 100 米，下一次可以再快一点点。',
    };
  }
  return {
    letter: 'C',
    label: '坚持到底',
    title: '冲线就是英雄！',
    summary: '路上可能有点跌跌撞撞，但你还是把 100 米装进兜里啦。',
  };
}

function showResults() {
  if (state.resultsShown) return;
  state.resultsShown = true;
  const grade = getGrade(state.finishTime, state.falls);
  dom.resultTime.textContent = formatTime(state.finishTime);
  dom.newBestBadge.hidden = !state.newBest;
  dom.bestResult.textContent = formatTime(state.best) + 's';
  dom.fallResult.textContent = String(state.falls);
  dom.comboResult.textContent = String(state.maxCombo);
  dom.maxSpeedResult.innerHTML = Math.round(state.maxSpeed * 3.6) + '<small>km/h</small>';
  dom.gradeBadge.dataset.grade = grade.letter;
  dom.gradeLetter.textContent = grade.letter;
  dom.gradeLabel.textContent = grade.label;
  dom.resultsTitle.textContent = state.newBest ? '新纪录！' : grade.title;
  dom.resultSummary.textContent = grade.summary;
  updateBestLabel();
  showScreen(dom.results);
  announce(
    '完赛。用时 ' + formatTime(state.finishTime) + ' 秒，摔倒 ' + state.falls + ' 次，最高连击 ' + state.maxCombo + '。'
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
  const player = runner ? runner.group.position : tempVec.set(0, 0, COURSE.startZ);
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
    const t = easeInOutCubic(clamp(state.countdownTime / COUNTDOWN_DURATION, 0, 1));
    const startX = isPortrait ? 0.7 : 1.5;
    const startY = isPortrait ? 1.32 : 1.1;
    const startZ = isPortrait ? 5.4 : 4.1;
    const endX = isPortrait ? 0.5 : 1.0;
    const endY = isPortrait ? 1.33 : 1.24;
    const endZ = isPortrait ? 6.0 : 4.9;
    cameraRig.base.set(
      player.x + lerp(startX, endX, t),
      lerp(startY, endY, t) + Math.sin(elapsed * 5.5) * 0.004,
      player.z + lerp(startZ, endZ, t)
    );
    cameraRig.look.set(
      player.x + lerp(0.0, 0.02, t),
      lerp(1.16, 1.27, t) + (isShortLandscape ? 0.22 : 0),
      player.z - lerp(2.8, 5.8, t)
    );
    cameraRig.fov = lerp(isPortrait ? 60 : 57, isPortrait ? 62 : 59, t);
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
      targetX = player.x + (isPortrait ? 0.8 : 1.28);
      targetY = 0.98;
      targetZ = player.z + (isPortrait ? 4.1 : 3.85);
      lookX = player.x;
      lookY = 0.49;
      lookZ = player.z - 1.4;
      targetFov = isPortrait ? 60 : 57;
      lambda = 4.2;
    } else {
      const lateral = isPortrait ? 0.55 : 1.02;
      const sway = Math.sin(elapsed * 2.2) * 0.03 * speedNorm + state.cameraKick;
      const bob = Math.sin(elapsed * 9.5) * 0.008 * speedNorm;
      targetX = player.x + lateral + sway;
      targetY = (isPortrait ? 1.28 : 1.24) + bob + speedNorm * 0.02;
      targetZ = player.z + (isPortrait ? 5.5 : 4.9) + speedNorm * 0.25;
      lookX = player.x + (isPortrait ? 0.08 : 0.02);
      lookY = 1.27 + Math.sin(elapsed * 6.2) * 0.004 * speedNorm + (isShortLandscape ? 0.32 : 0);
      lookZ = player.z - (isPortrait ? 5.1 : 5.9) - speedNorm * 0.4;
      targetFov = (isPortrait ? 61 : 59) + speedNorm * (isPortrait ? 9 : 10) + (isShortLandscape ? 2 : 0);
      lambda = 6.5;
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
    const t = easeInOutCubic(clamp(state.finishElapsed / 1.25, 0, 1));
    const startAngle = Math.atan2(isPortrait ? 0.55 : 1.0, isPortrait ? 5.5 : 4.9);
    const finishAngle = isPortrait ? 2.72 : 2.78;
    const angle = lerp(startAngle, finishAngle, t) + Math.sin(state.finishElapsed * 0.7) * 0.014 * t;
    const radius = lerp(isPortrait ? 5.5 : 4.9, isPortrait ? 5.35 : 4.65, t);
    const y = lerp(isPortrait ? 1.3 : 1.28, isPortrait ? 1.62 : 1.57, t);
    cameraRig.base.set(player.x + Math.sin(angle) * radius, y, player.z + Math.cos(angle) * radius);
    tempVecA.set(player.x + (isPortrait ? 0.06 : 0.02), 1.27, player.z - (isPortrait ? 5.1 : 5.9));
    tempVecB.set(player.x + (isPortrait ? 0.0 : -0.45), 1.24, player.z + 0.1);
    cameraRig.look.lerpVectors(tempVecA, tempVecB, t);
    cameraRig.fov = lerp(isPortrait ? 61 : 59, isPortrait ? 53 : 50, t);
    cameraRig.shake = damp(cameraRig.shake, 0, 3.5, dt);
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
  if (runner) runner.group.position.set(0, 0, COURSE.startZ);
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
  const grade = getGrade(state.finishTime, state.falls);
  const text =
    'GoRun 100m · ' +
    formatTime(state.finishTime) +
    's · 评级 ' +
    grade.letter +
    ' · 摔倒 ' +
    state.falls +
    ' 次 · 最高连击 ' +
    state.maxCombo +
    '\n来挑战我的可爱一百米：' +
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
    runner.group.position.set(0, 0, COURSE.startZ);
    playerPos.copy(runner.group.position);
    runner.update(dt, elapsed, { mode: 'menu', speed: 0, fallTime: 0 });
    fx.update(dt);
    updateHud();
    refreshComboIfNeeded();
    updateCamera(dt);
  } else if (state.phase === 'countdown') {
    updateCountdown(dt);
    if (state.phase === 'countdown') {
      runner.group.position.set(0, 0, COURSE.startZ);
      playerPos.copy(runner.group.position);
      runner.update(dt, elapsed, { mode: 'countdown', speed: 0, fallTime: 0 });
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
    stage = createWorld(dom.stage);
    runner = createRunner();
    fallDuration = runner.fallDuration || fallDuration;
    runner.group.position.set(0, 0, COURSE.startZ);
    stage.scene.add(runner.group);
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
