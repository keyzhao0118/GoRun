import * as THREE from 'three';
import {
  TAU,
  createRng,
  canvasTexture,
  roundRectPath,
  softCircleTexture,
  petalTexture,
  createStarGeometry,
} from './utils.js';

export const COURSE = {
  laneCount: 8,
  laneWidth: 1.3,
  playerLane: 4,
  startZ: 0.3,
  finishZ: -99.7,
  length: 100,
  trackEndZ: -110.5,
  trackStartZ: 5.8,
};

COURSE.trackWidth = COURSE.laneCount * COURSE.laneWidth;

export function laneCenterX(laneNumber) {
  return -COURSE.trackWidth / 2 + (laneNumber - 0.5) * COURSE.laneWidth;
}

export const PLAYER_LANE_X = laneCenterX(COURSE.playerLane);

const skyVert = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFrag = `
  uniform vec3 uTop;
  uniform vec3 uMiddle;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition - cameraPosition);
    float h = clamp(dir.y, -0.08, 1.0);
    vec3 color = mix(uHorizon, uMiddle, smoothstep(-0.02, 0.23, h));
    color = mix(color, uTop, smoothstep(0.16, 0.72, h));
    float sunAmount = max(dot(dir, normalize(uSunDir)), 0.0);
    color += uSun * pow(sunAmount, 42.0) * 0.36;
    color += uSun * pow(sunAmount, 6.0) * 0.06;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function makeStandard(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.9,
    metalness: options.metalness ?? 0,
    flatShading: options.flatShading ?? false,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    map: options.map ?? null,
    depthWrite: options.depthWrite ?? true,
  });
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.4 : 1.65));
  renderer.setClearColor(0xf5d7cc, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'game-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf2d2c7, 105, 245);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.06, 430);
  camera.position.set(2.35, 1.55, -4.9);
  camera.lookAt(-0.55, 1.3, 0.3);

  const rng = createRng(190822);
  const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const playerPos = new THREE.Vector3(0, 0, COURSE.startZ);
  const dynamic = {
    clouds: null,
    flags: [],
    balloons: [],
    motes: null,
    petals: null,
    sunSprite: null,
    sky: null,
    keyLight: null,
  };

  const palette = {
    coral: 0xff7587,
    coralDeep: 0xdf5268,
    coralDark: 0xb83b51,
    cream: 0xfff3e2,
    paper: 0xfff8ee,
    mint: 0x83dfcb,
    mintDeep: 0x46bca6,
    sun: 0xffd36e,
    gold: 0xf3b84b,
    lavender: 0xcbb9f5,
    lilac: 0xe8d7f8,
    ink: 0x49333d,
    track: 0xdd4059,
    trackDark: 0x8f2839,
    grass: 0x75ca8b,
    grassDark: 0x5cb779,
    stand: 0xf0e2d0,
    standAlt: 0xe4d2c2,
    skyTop: 0x62b6e8,
    skyMid: 0xf1c9dc,
    skyHorizon: 0xffe3c9,
  };

  dynamic.sky = makeSky(scene, dynamic);
  const lights = makeLighting(scene, palette);
  dynamic.keyLight = lights.key;

  const root = new THREE.Group();
  root.name = 'GoRun stadium';
  scene.add(root);

  makeGround(root, rng, palette, maxAniso);
  makeTrack(root, rng, palette, maxAniso);
  const { crowdMeshes } = makeStadium(root, rng, palette, dynamic, maxAniso);
  makeArches(root, rng, palette, dynamic);
  makeProps(root, rng, palette, dynamic);
  makeScoreboard(root, palette, maxAniso);
  dynamic.motes = makeMotes(scene, 'motes');
  dynamic.petals = makeMotes(scene, 'petals');
  dynamic.clouds = makeClouds(scene, rng);

  const resize = () => {
    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(resize);
    observer.observe(container);
  }
  window.addEventListener('resize', resize, { passive: true });

  const dummy = new THREE.Object3D();
  const skySunDir = new THREE.Vector3(0.46, 0.29, -1).normalize();

  function update(dt, elapsed, player) {
    playerPos.copy(player);
    const time = elapsed;

    if (dynamic.sky) dynamic.sky.position.copy(camera.position);
    if (dynamic.sunSprite) {
      dynamic.sunSprite.position.copy(camera.position).addScaledVector(skySunDir, 285);
    }

    if (dynamic.keyLight) {
      dynamic.keyLight.position.set(player.x - 11, 18, player.z + 14);
      dynamic.keyLight.target.position.set(player.x, 0, player.z - 3.5);
      dynamic.keyLight.target.updateMatrixWorld();
    }

    if (dynamic.clouds) {
      const { mesh, puffs } = dynamic.clouds;
      for (let i = 0; i < puffs.length; i += 1) {
        const p = puffs[i];
        const drift = Math.sin(time * 0.045 + p.phase) * 1.2 + time * p.speed;
        dummy.position.set(p.x + drift, p.y + Math.sin(time * 0.12 + p.phase) * 0.25, p.z);
        dummy.rotation.set(0, p.rotation, 0);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const flag of dynamic.flags) {
      flag.mesh.rotation.y = flag.baseY + Math.sin(time * 2.1 + flag.phase) * 0.24;
      flag.mesh.rotation.z = flag.tilt + Math.sin(time * 2.8 + flag.phase) * 0.05;
    }
    for (const balloon of dynamic.balloons) {
      balloon.group.position.y = balloon.baseY + Math.sin(time * 1.6 + balloon.phase) * 0.055;
      balloon.group.rotation.z = Math.sin(time * 1.2 + balloon.phase) * 0.018;
    }

    updateMotes(dynamic.motes, time, player, false);
    updateMotes(dynamic.petals, time, player, true);
  }

  return {
    renderer,
    scene,
    camera,
    update,
    resize,
    course: COURSE,
    palette,
    crowdMeshes,
  };
}

function makeSky(scene, dynamic) {
  const uniforms = {
    uTop: { value: new THREE.Color(0x68bce9) },
    uMiddle: { value: new THREE.Color(0xf1c8df) },
    uHorizon: { value: new THREE.Color(0xffe3c8) },
    uSun: { value: new THREE.Color(0xfff2c4) },
    uSunDir: { value: new THREE.Vector3(0.46, 0.29, -1).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(330, 40, 24), material);
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  scene.add(sky);

  const sunTexture = canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,244,1)');
    g.addColorStop(0.17, 'rgba(255,246,201,.98)');
    g.addColorStop(0.34, 'rgba(255,225,179,.55)');
    g.addColorStop(0.68, 'rgba(255,206,174,.12)');
    g.addColorStop(1, 'rgba(255,205,175,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const sunMaterial = new THREE.SpriteMaterial({
    map: sunTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
    opacity: 0.55,
  });
  const sun = new THREE.Sprite(sunMaterial);
  sun.scale.set(38, 38, 1);
  scene.add(sun);
  dynamic.sunSprite = sun;
  return sky;
}

function makeLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xd9efff, 0xb08376, 1.5);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffefd7, 2.35);
  key.position.set(-11, 18, 18);
  key.castShadow = true;
  const shadowSize = window.matchMedia?.('(pointer: coarse)').matches ? 1024 : 2048;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 55;
  key.shadow.camera.left = -13;
  key.shadow.camera.right = 13;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -10;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  const target = new THREE.Object3D();
  target.position.set(0, 0, -3);
  key.target = target;
  scene.add(key);
  scene.add(target);

  const fill = new THREE.DirectionalLight(0xffe2d4, 0.95);
  fill.position.set(10, 9, -20);
  scene.add(fill);

  const blush = new THREE.DirectionalLight(0xffb7b2, 0.32);
  blush.position.set(0, 4, -12);
  scene.add(blush);

  return { key, target, hemi, fill };
}

function makeGround(root, rng, palette, maxAniso) {
  const grassTexture = canvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = '#5ec477';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-0.3);
      for (let i = -18; i < 18; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,.045)' : 'rgba(20,90,45,.035)';
        ctx.fillRect(-w, i * 48, w * 2, 27);
      }
      ctx.restore();
      for (let i = 0; i < 6200; i += 1) {
        const x = rng() * w;
        const y = rng() * h;
        const shade = rng();
        ctx.fillStyle =
          shade > 0.8 ? 'rgba(255,255,255,.09)' : shade > 0.42 ? 'rgba(30,120,60,.08)' : 'rgba(88,186,104,.16)';
        ctx.fillRect(x, y, 1 + rng() * 2.5, 1 + rng() * 4);
      }
    },
    { repeat: [13, 13] }
  );
  grassTexture.anisotropy = maxAniso;
  const material = new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.035, -48);
  ground.receiveShadow = true;
  root.add(ground);
}

function makePaintedDecalMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  });
}

function makeTrack(root, rng, palette, maxAniso) {
  const course = COURSE;
  const trackLength = course.trackStartZ - course.trackEndZ;
  const trackCenterZ = (course.trackStartZ + course.trackEndZ) / 2;

  const trackTexture = canvasTexture(
    512,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = '#df455e';
      ctx.fillRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(120,20,35,.14)');
      grad.addColorStop(0.25, 'rgba(255,255,255,.03)');
      grad.addColorStop(0.52, 'rgba(255,255,255,.07)');
      grad.addColorStop(0.8, 'rgba(100,16,33,.08)');
      grad.addColorStop(1, 'rgba(100,16,33,.16)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9500; i += 1) {
        const light = rng() > 0.48;
        ctx.fillStyle = light
          ? 'rgba(255,225,218,' + (0.02 + rng() * 0.07).toFixed(3) + ')'
          : 'rgba(88,24,38,' + (0.02 + rng() * 0.08).toFixed(3) + ')';
        ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
      }
      ctx.fillStyle = 'rgba(255,240,229,.035)';
      ctx.fillRect(w * 0.34, 0, w * 0.12, h);
      ctx.fillRect(w * 0.54, 0, w * 0.12, h);
    },
    { repeat: [3, 16] }
  );
  trackTexture.anisotropy = maxAniso;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(course.trackWidth, 0.26, trackLength),
    makeStandard(palette.trackDark, { roughness: 1 })
  );
  base.position.set(0, -0.13, trackCenterZ);
  base.receiveShadow = true;
  root.add(base);

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(course.trackWidth, trackLength),
    new THREE.MeshStandardMaterial({ map: trackTexture, roughness: 0.82, metalness: 0 })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, 0.006, trackCenterZ);
  surface.receiveShadow = true;
  root.add(surface);

  const laneMat = makeStandard(0xfff0dc, {
    roughness: 0.74,
    emissive: 0x4b302c,
    emissiveIntensity: 0.04,
  });
  for (let i = 0; i <= course.laneCount; i += 1) {
    const x = -course.trackWidth / 2 + i * course.laneWidth;
    const isEdge = i === 0 || i === course.laneCount;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(isEdge ? 0.12 : 0.07, trackLength - 0.3), laneMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.022, trackCenterZ);
    line.receiveShadow = true;
    root.add(line);
  }

  const curbGeo = new THREE.BoxGeometry(0.3, 0.14, 0.92);
  const curbMat = makeStandard(0xffffff, { roughness: 0.82 });
  const curbCols = 2 * Math.ceil(trackLength / 1.0);
  const curbs = new THREE.InstancedMesh(curbGeo, curbMat, curbCols);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let curbIndex = 0;
  for (const side of [-1, 1]) {
    let i = 0;
    for (let z = course.trackStartZ - 0.3; z > course.trackEndZ; z -= 1) {
      if (curbIndex >= curbCols) break;
      dummy.position.set(side * (course.trackWidth / 2 + 0.2), 0.07, z);
      dummy.updateMatrix();
      curbs.setMatrixAt(curbIndex, dummy.matrix);
      curbs.setColorAt(curbIndex, color.set(i % 2 === 0 ? 0xfff2df : 0xe9677b));
      curbIndex += 1;
      i += 1;
    }
  }
  curbs.count = curbIndex;
  curbs.instanceMatrix.needsUpdate = true;
  if (curbs.instanceColor) curbs.instanceColor.needsUpdate = true;
  curbs.castShadow = false;
  curbs.receiveShadow = true;
  root.add(curbs);

  const checkerTexture = makeCheckerTexture(maxAniso);
  const checkerMat = new THREE.MeshStandardMaterial({ map: checkerTexture, roughness: 0.8 });
  const addChecker = (z, depth) => {
    const checker = new THREE.Mesh(new THREE.PlaneGeometry(course.trackWidth - 0.08, depth), checkerMat);
    checker.rotation.x = -Math.PI / 2;
    checker.position.set(0, 0.028, z);
    checker.receiveShadow = true;
    root.add(checker);
  };
  addChecker(course.startZ, 0.62);
  addChecker(course.finishZ, 1.05);

  const finishEdge = new THREE.Mesh(new THREE.PlaneGeometry(course.trackWidth, 0.09), laneMat);
  finishEdge.rotation.x = -Math.PI / 2;
  finishEdge.position.set(0, 0.023, course.finishZ + 0.57);
  root.add(finishEdge);

  for (let lane = 0; lane < course.laneCount; lane += 1) {
    const map = makeLaneNumberTexture(lane + 1);
    const x = -course.trackWidth / 2 + course.laneWidth * (lane + 0.5);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 1.72), makePaintedDecalMaterial(map));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.03, course.startZ - 2.6);
    root.add(plane);
  }

  addTrackText(root, 'GO!', 3.1, 1.5, course.startZ - 7.8, '#fff0dc', 0.82);
  addTrackText(root, '50', 4.7, 2.3, course.startZ - 50, '#fff0dc', 0.56, 'HALFWAY');
  addTrackText(root, 'SPRINT!', 6.2, 1.9, course.startZ - 87.3, '#fff0dc', 0.72);

  const pawTexture = makePawTexture();
  const pawGeo = new THREE.PlaneGeometry(0.38, 0.48);
  pawGeo.rotateX(-Math.PI / 2);
  const pawMat = new THREE.MeshBasicMaterial({
    map: pawTexture,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
    toneMapped: false,
  });
  const pawPositions = [];
  for (let z = course.startZ - 12; z > course.finishZ + 4; z -= 7.6) {
    if (Math.abs(z - (course.startZ - 50)) < 5 || z > course.startZ - 14) continue;
    pawPositions.push(z);
  }
  const paws = new THREE.InstancedMesh(pawGeo, pawMat, pawPositions.length);
  const playerLaneCenter = -course.trackWidth / 2 + (course.playerLane - 0.5) * course.laneWidth;
  pawPositions.forEach((z, i) => {
    dummy.position.set(playerLaneCenter + Math.sin(i * 2.1) * 0.22, 0.027, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    paws.setMatrixAt(i, dummy.matrix);
  });
  paws.instanceMatrix.needsUpdate = true;
  paws.frustumCulled = false;
  root.add(paws);

  const heartMat = new THREE.MeshBasicMaterial({
    color: 0xffe0c3,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const starGeo = createStarGeometry(0.19, 0.08);
  for (let i = 0; i < 7; i += 1) {
    const mark = new THREE.Mesh(starGeo, heartMat);
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = rng() * TAU;
    mark.position.set((rng() > 0.5 ? 1 : -1) * (3.4 + rng() * 1.4), 0.029, course.finishZ + 2 + rng() * 12);
    root.add(mark);
  }
}

function makeCheckerTexture(maxAniso) {
  const texture = canvasTexture(1024, 128, (ctx, w, h) => {
    const cols = 16;
    const rows = 4;
    const cw = w / cols;
    const ch = h / rows;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#fff4e4' : '#44313c';
        ctx.fillRect(x * cw, y * ch, cw, ch);
      }
    }
  });
  texture.anisotropy = maxAniso;
  return texture;
}

function makeLaneNumberTexture(number) {
  return canvasTexture(256, 448, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2 - 22);
    ctx.fillStyle = 'rgba(255,246,232,.9)';
    ctx.font = '700 260px Fredoka, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(w / 2, h - 54);
    ctx.fillStyle = 'rgba(255,246,232,.8)';
    drawStar(ctx, 0, 0, 22, 9);
    ctx.restore();
  });
}

function addTrackText(root, text, width, depth, z, color, opacity, subtitle = '') {
  const map = canvasTexture(1024, 384, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = text.length > 4 ? 190 : 235;
    ctx.font = '700 ' + size + 'px Fredoka, Arial, sans-serif';
    ctx.fillText(text, w / 2, subtitle ? h * 0.44 : h * 0.52);
    if (subtitle) {
      ctx.font = '600 58px Fredoka, Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,246,232,.68)';
      ctx.letterSpacing = '8px';
      ctx.fillText(subtitle, w / 2, h * 0.74);
      ctx.letterSpacing = '0px';
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    for (let i = 0; i < 7; i += 1) {
      const x = 110 + i * 130;
      const y = h * 0.12 + (i % 2) * 250;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.fill();
    }
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.031, z);
  root.add(mesh);
}

function makePawTexture() {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff3e2';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.64, 58, 48, 0, 0, TAU);
    ctx.fill();
    const toes = [
      [-58, -30, 26, 34, -0.35],
      [-20, -64, 25, 35, -0.15],
      [22, -64, 25, 35, 0.15],
      [60, -28, 27, 35, 0.35],
    ];
    for (const [x, y, rx, ry, rot] of toes) {
      ctx.beginPath();
      ctx.ellipse(w / 2 + x, h * 0.43 + y, rx, ry, rot, 0, TAU);
      ctx.fill();
    }
  });
}

function makeStadium(root, rng, palette, dynamic, maxAniso) {
  const course = COURSE;
  const standStartZ = 11.5;
  const standEndZ = -114.5;
  const standLength = standStartZ - standEndZ;
  const standCenterZ = (standStartZ + standEndZ) / 2;
  const rows = 6;
  const rowDepth = 3.25;
  const rowHeight = 1.25;
  const innerX = 9.2;
  const crowd = { bodies: [], heads: [] };
  const tierColors = [0xeedcc7, 0xdcc4b2, 0xe8d2bd, 0xd4b9a7, 0xeedcc7, 0xe0c7b4];
  const flagColors = [0xff7d8d, 0x7bdcc7, 0xffd36e, 0xb7a3f3, 0xfff2df];

  const addFlag = (parent, x, y, z, color, scale = 1) => {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 2.1 * scale, 6),
      makeStandard(0xfff0dd, { roughness: 0.7 })
    );
    pole.position.y = 1.05 * scale;
    group.add(pole);
    const clothGeometry = new THREE.BufferGeometry();
    clothGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 0.95 * scale, 0.2 * scale, 0, 0.1 * scale, -0.4 * scale, 0],
        3
      )
    );
    clothGeometry.computeVertexNormals();
    const cloth = new THREE.Mesh(
      clothGeometry,
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false })
    );
    cloth.position.y = 2.0 * scale;
    cloth.castShadow = false;
    group.add(cloth);
    parent.add(group);
    dynamic.flags.push({
      mesh: cloth,
      baseY: rng() * 0.5 - 0.25,
      phase: rng() * TAU,
      tilt: -0.12,
    });
    return group;
  };

  for (const side of [-1, 1]) {
    for (let row = 0; row < rows; row += 1) {
      const top = (row + 1) * rowHeight;
      const width = rowDepth + 0.38;
      const inner = innerX + row * rowDepth;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(width, top, standLength),
        makeStandard(tierColors[row % tierColors.length], { roughness: 0.96 })
      );
      box.position.set(side * (inner + width / 2), top / 2, standCenterZ);
      box.receiveShadow = true;
      root.add(box);

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.1, standLength),
        makeStandard(row % 2 === 0 ? palette.mintDeep : palette.coral, { roughness: 0.8 })
      );
      rail.position.set(side * (inner + 0.04), top + 0.05, standCenterZ);
      root.add(rail);

      makeCrowdRow(crowd, rng, {
        axis: 'x',
        side,
        inner: inner + 0.35,
        depth: rowDepth - 0.7,
        top,
        zMin: standEndZ + 2,
        zMax: standStartZ - 2,
        count: 215,
      });
    }

    for (let i = 0; i < 6; i += 1) {
      const z = standStartZ - 8 - i * 20;
      addFlag(
        root,
        side * (innerX + rows * rowDepth - 1.4),
        (rows + 0.5) * rowHeight,
        z,
        flagColors[i % flagColors.length],
        1.25
      );
    }

  }

  const endRows = 5;
  for (let row = 0; row < endRows; row += 1) {
    const top = (row + 1) * 1.35;
    const z = -115 - row * rowDepth;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(63, top, rowDepth + 0.35),
      makeStandard(tierColors[(row + 2) % tierColors.length], { roughness: 0.96 })
    );
    box.position.set(0, top / 2, z);
    box.receiveShadow = true;
    root.add(box);
    makeCrowdRow(crowd, rng, {
      axis: 'z',
      side: 1,
      inner: -30,
      depth: 60,
      top,
      zMin: z - rowDepth / 2 + 0.3,
      zMax: z + rowDepth / 2 - 0.3,
      count: 180,
    });
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(63, 0.1, 0.09),
      makeStandard(row % 2 === 0 ? palette.coral : palette.mintDeep)
    );
    rail.position.set(0, top + 0.05, z + rowDepth / 2);
    root.add(rail);
  }
  addFlag(root, -27, 7.0, -116, 0xffd36e, 1.4);
  addFlag(root, 27, 7.0, -116, 0x7bdcc7, 1.4);

  for (let row = 0; row < 4; row += 1) {
    const top = (row + 1) * 1.3;
    const z = 13 + row * rowDepth;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(63, top, rowDepth + 0.35),
      makeStandard(tierColors[(row + 1) % tierColors.length], { roughness: 0.96 })
    );
    box.position.set(0, top / 2, z);
    box.receiveShadow = true;
    root.add(box);
    makeCrowdRow(crowd, rng, {
      axis: 'z',
      side: 1,
      inner: -30,
      depth: 60,
      top,
      zMin: z - rowDepth / 2 + 0.3,
      zMax: z + rowDepth / 2 - 0.3,
      count: 100,
    });
  }
  addFlag(root, -27, 5.9, 12, 0xff7d8d, 1.2);
  addFlag(root, 27, 5.9, 12, 0xb7a3f3, 1.2);

  const bodyGeo = new THREE.CapsuleGeometry(0.105, 0.25, 2, 5);
  const headGeo = new THREE.SphereGeometry(0.095, 6, 5);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, crowd.bodies.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, crowd.heads.length);
  const dummy = new THREE.Object3D();
  const shirtPalette = [
    0xff8e9b, 0xffd36e, 0x7bdcc7, 0x9dc9ff, 0xc7b3ff, 0xfff0dd, 0xfa9e72, 0x75b7ef, 0xe986b3, 0xa5e0a8,
  ];
  const skinPalette = [0xffe0c5, 0xf0c39e, 0xcf936d, 0x9d6247, 0xffd0ae, 0x714434];
  crowd.bodies.forEach((person, i) => {
    const s = person.scale;
    dummy.position.set(person.x, person.y, person.z);
    dummy.rotation.set(0, person.rot, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, new THREE.Color(shirtPalette[Math.floor(rng() * shirtPalette.length)]));
  });
  crowd.heads.forEach((person, i) => {
    const s = person.scale;
    dummy.position.set(person.x, person.y, person.z);
    dummy.rotation.set(0, person.rot, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, new THREE.Color(skinPalette[Math.floor(rng() * skinPalette.length)]));
  });
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  bodies.frustumCulled = false;
  heads.frustumCulled = false;
  root.add(bodies);
  root.add(heads);

  makeAdBoards(root, palette, maxAniso);

  return { crowdMeshes: { bodies, heads } };
}

function makeCrowdRow(crowd, rng, options) {
  const { axis, side, inner, depth, top, zMin, zMax, count } = options;
  for (let i = 0; i < count; i += 1) {
    const scale = 0.74 + rng() * 0.52;
    const z = zMin + rng() * (zMax - zMin);
    const x = axis === 'x' ? side * (inner + rng() * depth) : inner + rng() * depth;
    crowd.bodies.push({ x, y: top + 0.24 * scale, z, rot: rng() * TAU, scale });
    crowd.heads.push({ x, y: top + 0.57 * scale, z, rot: rng() * TAU, scale });
  }
}

function makeAdBoards(root, palette, maxAniso) {
  const course = COURSE;
  const standLength = course.trackStartZ - course.trackEndZ + 2;
  const z = (course.trackStartZ + course.trackEndZ) / 2;
  const boardTexture = canvasTexture(
    1024,
    128,
    (ctx, w, h) => {
      const panels = [
        { bg: '#ff7587', ink: '#fff7ea', label: 'GoRun', shape: 'star' },
        { bg: '#fff0d9', ink: '#e55267', label: '100m', shape: 'heart' },
        { bg: '#7bdcc7', ink: '#3d7771', label: 'RUN!', shape: 'paw' },
        { bg: '#432f3a', ink: '#ffdb89', label: 'GO GO!', shape: 'star' },
      ];
      for (let i = 0; i < 4; i += 1) {
        const p = panels[i];
        const x = (i * w) / 4;
        ctx.fillStyle = p.bg;
        ctx.fillRect(x, 0, w / 4, h);
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.fillRect(x, 0, 7, h);
        ctx.fillStyle = p.ink;
        ctx.font = '600 54px Fredoka, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, x + w / 8, h * 0.53);
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(x + 62, h * 0.5, 20, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
    { repeat: [10, 1] }
  );
  boardTexture.anisotropy = maxAniso;

  const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.78 });
  const wallMat = makeStandard(0x4d3740, { roughness: 0.8 });
  const boardX = COURSE.trackWidth / 2 + 1.18;
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(standLength, 0.9), boardMat);
    board.position.set(side * boardX, 0.5, z);
    board.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(board);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.92, standLength), wallMat);
    wall.position.set(side * (boardX + 0.12), 0.46, z);
    root.add(wall);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, standLength), makeStandard(0xfff2df));
    rail.position.set(side * (boardX + 0.05), 0.97, z);
    root.add(rail);
  }
}

function makeClouds(scene, rng) {
  const puffData = [];
  const cloudColors = [0xfffbf4, 0xfff3f5, 0xffe9ee, 0xfff1e3, 0xffffff];
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * TAU + (rng() - 0.5) * 0.3;
    const radius = 125 + rng() * 125;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius - 30;
    const cy = 27 + rng() * 33;
    const scale = 0.58 + rng() * 0.6;
    const puffCount = 6 + Math.floor(rng() * 4);
    for (let p = 0; p < puffCount; p += 1) {
      const colIndex = rng() > 0.5 ? 0 : Math.floor(rng() * cloudColors.length);
      puffData.push({
        x: cx + (rng() - 0.5) * 17 * scale,
        y: cy + (rng() - 0.35) * 3.8 * scale,
        z: cz + (rng() - 0.5) * 8 * scale,
        sx: (2.1 + rng() * 3.4) * scale,
        sy: (1.45 + rng() * 2.1) * scale,
        sz: (1.9 + rng() * 2.8) * scale,
        rotation: 0,
        phase: rng() * TAU,
        speed: 0.1 + rng() * 0.18,
        color: cloudColors[colIndex],
      });
    }
  }
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: true,
    toneMapped: false,
    transparent: true,
    opacity: 0.98,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, puffData.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  puffData.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rotation, 0);
    dummy.scale.set(p.sx, p.sy, p.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.set(p.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return { mesh, puffs: puffData };
}

function makeArches(root, rng, palette, dynamic) {
  makeArch(root, rng, palette, dynamic, {
    z: COURSE.finishZ,
    label: 'FINISH',
    subtitle: '100 M  ·  NICE RUN!',
    accent: palette.mintDeep,
    secondary: palette.coral,
    finish: true,
  });
  makeStartingBlocks(root, palette);
}

function makeArch(root, rng, palette, dynamic, options) {
  const { z, label, subtitle, accent, secondary, finish } = options;
  const group = new THREE.Group();
  group.position.z = z;
  const pillarX = COURSE.trackWidth / 2 + 1.05;
  const height = options.height || 5.7;
  const creamMat = makeStandard(0xfff1dd, { roughness: 0.78 });
  const accentMat = makeStandard(accent, { roughness: 0.72 });
  const secondaryMat = makeStandard(secondary, { roughness: 0.72 });

  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.43, 0.52, 0.46, 14),
      makeStandard(finish ? 0x49333d : accent)
    );
    base.position.set(side * pillarX, 0.23, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.29, height, 14), creamMat);
    pillar.position.set(side * pillarX, height / 2 + 0.35, 0);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12), accentMat);
    cap.position.set(side * pillarX, height + 0.38, 0);
    cap.castShadow = true;
    group.add(cap);

    for (let r = 0; r < 3; r += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.27, 0.052, 8, 18),
        r % 2 === 0 ? secondaryMat : makeStandard(0xffd36e)
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(side * pillarX, 1.1 + r * 1.2, 0);
      group.add(ring);
    }
  }

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, pillarX * 2 + 0.6, 14), accentMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.y = height + 0.22;
  beam.castShadow = true;
  group.add(beam);
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10), secondaryMat);
    cap.position.set(side * (pillarX + 0.3), height + 0.22, 0);
    cap.castShadow = true;
    group.add(cap);
  }

  const signWidth = 8.7;
  const signHeight = 1.5;
  const signBacking = new THREE.Mesh(
    new THREE.BoxGeometry(signWidth + 0.25, signHeight + 0.2, 0.22),
    makeStandard(0x4b3540, { roughness: 0.7 })
  );
  signBacking.position.set(0, height - 0.26, 0);
  signBacking.castShadow = true;
  group.add(signBacking);

  const signTexture = makeArchSignTexture(label, subtitle, finish ? 'finish' : 'start');
  const signMat = new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false });
  for (const side of [1, -1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signWidth, signHeight), signMat);
    sign.position.set(0, height - 0.26, side * 0.12);
    sign.rotation.y = side === 1 ? 0 : Math.PI;
    group.add(sign);
  }

  const buntingGeo = new THREE.BufferGeometry();
  buntingGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0.32, 0, 0, 0.16, -0.42, 0], 3)
  );
  buntingGeo.computeVertexNormals();
  const buntingColors = [0xff7587, 0xffd36e, 0x7bdcc7, 0xc7b3ff, 0xfff1dd];
  const buntingCount = 18;
  const bunting = new THREE.InstancedMesh(
    buntingGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }),
    buntingCount
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < buntingCount; i += 1) {
    dummy.position.set(-5.1 + i * 0.6, height - 0.85, 0.08);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bunting.setMatrixAt(i, dummy.matrix);
    bunting.setColorAt(i, color.set(buntingColors[i % buntingColors.length]));
  }
  bunting.instanceMatrix.needsUpdate = true;
  if (bunting.instanceColor) bunting.instanceColor.needsUpdate = true;
  bunting.frustumCulled = false;
  group.add(bunting);

  const stringPoints = [];
  for (let i = 0; i < 28; i += 1) {
    const t = i / 27;
    const x = -5.15 + t * 10.3;
    const y = height - 0.78 - Math.sin(t * Math.PI) * 0.16;
    stringPoints.push(new THREE.Vector3(x, y, 0.07));
  }
  const string = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(stringPoints),
    new THREE.LineBasicMaterial({ color: 0x4b3540, transparent: true, opacity: 0.45 })
  );
  group.add(string);

  if (finish) {
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 6), creamMat);
      pole.position.set(side * pillarX, height + 0.85, 0);
      group.add(pole);
      const flagTex = makeCheckerTexture(8);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.46),
        new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide, toneMapped: false })
      );
      flag.position.set(side * pillarX + 0.34, height + 1.05, 0);
      group.add(flag);
    }
  } else {
    for (const side of [-1, 1]) {
      const flag = makeSmallPennant(side * pillarX, height + 0.85, 0, secondary, 0.95, dynamic);
      group.add(flag.group);
    }
  }

  root.add(group);

  const balloonColors1 = [0xff7587, 0x7bdcc7, 0xffd36e, 0xc7b3ff];
  const balloonColors2 = [0xfff1dd, 0xff9aa6, 0x86d5ff, 0xffd36e];
  for (const side of [-1, 1]) {
    const cluster = makeBalloonCluster(balloonColors1, 4, 1.0, rng);
    cluster.group.position.set(side * (pillarX + 1.35), 3.7, z + 0.5);
    cluster.baseY = cluster.group.position.y;
    root.add(cluster.group);
    dynamic.balloons.push(cluster);

    const cluster2 = makeBalloonCluster(balloonColors2, 3, 0.82, rng);
    cluster2.group.position.set(side * (pillarX - 0.9), 1.3, z - 0.4);
    cluster2.baseY = cluster2.group.position.y;
    root.add(cluster2.group);
    dynamic.balloons.push(cluster2);
  }
}

function makeSmallPennant(x, y, z, color, scale = 1, dynamic) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 1.3 * scale, 6),
    makeStandard(0xfff0dd)
  );
  pole.position.y = 0.65 * scale;
  group.add(pole);
  const clothGeometry = new THREE.BufferGeometry();
  clothGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0.72 * scale, 0.16 * scale, 0, 0.08 * scale, -0.32 * scale, 0], 3)
  );
  clothGeometry.computeVertexNormals();
  const cloth = new THREE.Mesh(
    clothGeometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false })
  );
  cloth.position.y = 1.25 * scale;
  group.add(cloth);
  if (dynamic) dynamic.flags.push({ mesh: cloth, baseY: 0.2, phase: Math.random() * TAU, tilt: -0.1 });
  return { group };
}

function makeArchSignTexture(label, subtitle, type) {
  return canvasTexture(1024, 240, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#fff6e9');
    bg.addColorStop(0.52, '#ffeedb');
    bg.addColorStop(1, '#ffe3c6');
    ctx.fillStyle = bg;
    roundRectPath(ctx, 5, 5, w - 10, h - 10, 54);
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#4a323b';
    ctx.stroke();

    if (type === 'finish') {
      for (let i = 0; i < 22; i += 1) {
        if (i % 2 === 0) {
          ctx.fillStyle = '#4a323b';
          ctx.fillRect(50 + i * 18, 30, 18, 13);
          ctx.fillRect(50 + i * 18, h - 44, 18, 13);
        }
      }
    } else {
      ctx.fillStyle = 'rgba(255,117,135,.35)';
      for (let i = 0; i < 9; i += 1) {
        ctx.beginPath();
        ctx.arc(88 + i * 105, 29, 4.5, 0, TAU);
        ctx.fill();
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (type === 'start') {
      ctx.fillStyle = '#e9576c';
      ctx.font = '700 126px Fredoka, Arial, sans-serif';
      ctx.fillText(label, w / 2, h * 0.47);
      ctx.fillStyle = '#4a323b';
      ctx.font = '600 39px Fredoka, Arial, sans-serif';
      ctx.letterSpacing = '8px';
      ctx.fillText(subtitle, w / 2, h * 0.79);
    } else {
      ctx.fillStyle = '#3b7671';
      ctx.font = '700 122px Fredoka, Arial, sans-serif';
      ctx.fillText(label, w / 2, h * 0.47);
      ctx.fillStyle = '#4a323b';
      ctx.font = '600 37px Fredoka, Arial, sans-serif';
      ctx.letterSpacing = '7px';
      ctx.fillText(subtitle, w / 2, h * 0.79);
    }
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#ffd36e';
    drawStar(ctx, 150, 65, 15, 7);
    drawStar(ctx, 878, h - 72, 21, 9);
  });
}

function drawStar(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function makeStartingBlocks(root, palette) {
  const group = new THREE.Group();
  group.position.z = COURSE.startZ + 0.72;
  const mat = makeStandard(palette.coralDeep, { roughness: 0.74 });
  const topMat = makeStandard(0xffd36e, { roughness: 0.7 });
  const dummy = new THREE.Object3D();
  const count = COURSE.laneCount * 2;
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.18, 0.56), mat, count);
  const tops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.29, 0.035, 0.2), topMat, count);
  let index = 0;
  for (let lane = 0; lane < COURSE.laneCount; lane += 1) {
    const laneX = -COURSE.trackWidth / 2 + COURSE.laneWidth * (lane + 0.5);
    for (const side of [-1, 1]) {
      dummy.position.set(laneX + side * 0.27, 0.09, 0);
      dummy.rotation.set(0.14, 0, 0);
      dummy.updateMatrix();
      blocks.setMatrixAt(index, dummy.matrix);

      dummy.position.set(laneX + side * 0.27, 0.185, -0.12);
      dummy.updateMatrix();
      tops.setMatrixAt(index, dummy.matrix);
      index += 1;
    }
  }
  blocks.instanceMatrix.needsUpdate = true;
  tops.instanceMatrix.needsUpdate = true;
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  group.add(blocks, tops);
  root.add(group);
}

function makeBalloonCluster(colors, count, scale, rng) {
  const group = new THREE.Group();
  const balloonGeo = new THREE.SphereGeometry(1, 14, 12);
  const knotGeo = new THREE.CylinderGeometry(1, 0.75, 1, 8);
  const linePoints = [];
  for (let i = 0; i < count; i += 1) {
    const color = colors[i % colors.length];
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.34,
      metalness: 0.02,
      emissive: color,
      emissiveIntensity: 0.035,
    });
    const balloon = new THREE.Mesh(balloonGeo, mat);
    const angle = (i / count) * TAU + rng() * 0.7;
    const radius = 0.16 + rng() * 0.24;
    balloon.position.set(Math.cos(angle) * radius, 0.7 + rng() * 0.28, Math.sin(angle) * radius);
    balloon.scale.set(0.15 * scale, 0.2 * scale, 0.15 * scale);
    group.add(balloon);
    const knot = new THREE.Mesh(knotGeo, mat);
    knot.scale.set(0.027, 0.04, 0.027);
    knot.position.copy(balloon.position);
    knot.position.y -= 0.2 * scale + 0.02;
    group.add(knot);
    linePoints.push(
      new THREE.Vector3(balloon.position.x, balloon.position.y - 0.21 * scale, balloon.position.z),
      new THREE.Vector3(0, 0, 0)
    );
  }
  const string = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(linePoints),
    new THREE.LineBasicMaterial({ color: 0x6a4e56, transparent: true, opacity: 0.38 })
  );
  group.add(string);
  return { group, baseY: 0, phase: rng() * TAU };
}

function makeProps(root, rng, palette, dynamic) {
  const course = COURSE;
  for (let i = 0; i < 8; i += 1) {
    const z = 2 - i * 14;
    const side = i % 2 === 0 ? -1 : 1;
    const group = new THREE.Group();
    group.position.set(side * (COURSE.trackWidth / 2 + 2.35), 0, z);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 2.7, 6),
      makeStandard(0xfff0dc)
    );
    pole.position.y = 1.35;
    group.add(pole);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.5),
      new THREE.MeshBasicMaterial({
        color: [palette.coral, palette.mint, palette.sun][i % 3],
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    cloth.position.set(side * 0.46, 2.15, 0);
    group.add(cloth);
    root.add(group);
    dynamic.flags.push({ mesh: cloth, baseY: side * 0.18, phase: i * 1.7, tilt: 0 });
  }

  for (let i = 0; i < 5; i += 1) {
    const cluster = makeBalloonCluster(
      [0xff7587, 0x7bdcc7, 0xffd36e, 0xc7b3ff, 0xfff1dd],
      4,
      1.1,
      rng
    );
    cluster.group.position.set(-8 + i * 4, 7.9 + (i % 2) * 0.7, course.finishZ - 5.5);
    cluster.baseY = cluster.group.position.y;
    root.add(cluster.group);
    dynamic.balloons.push(cluster);
  }
}

function makeScoreboard(root, palette, maxAniso) {
  const boardTexture = canvasTexture(1024, 512, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#47323e');
    bg.addColorStop(0.55, '#392936');
    bg.addColorStop(1, '#5a3641');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,241,225,.08)';
    for (let i = -4; i < 16; i += 1) {
      ctx.save();
      ctx.translate(i * 100, 0);
      ctx.rotate(-0.25);
      ctx.fillRect(0, -h, 32, h * 3);
      ctx.restore();
    }
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#ffe5c7';
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,117,135,.45)';
    ctx.strokeRect(48, 48, w - 96, h - 96);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff1da';
    ctx.font = '600 44px Fredoka, Arial, sans-serif';
    ctx.letterSpacing = '12px';
    ctx.fillText('WELCOME TO', w / 2, 122);
    ctx.fillStyle = '#ffd36e';
    ctx.font = '700 192px Fredoka, Arial, sans-serif';
    ctx.fillText('GoRun', w / 2, 254);
    ctx.fillStyle = '#7bdcc7';
    ctx.font = '600 54px Fredoka, Arial, sans-serif';
    ctx.letterSpacing = '8px';
    ctx.fillText('THE CUTE 100M FINAL', w / 2, 364);
    ctx.fillStyle = 'rgba(255,241,218,.6)';
    ctx.font = '500 34px Fredoka, Arial, sans-serif';
    ctx.letterSpacing = '5px';
    ctx.fillText('RUN FAST  ·  STAY SOFT', w / 2, 436);
    ctx.fillStyle = '#ff7587';
    for (const [x, y] of [
      [92, 98],
      [932, 105],
      [94, 422],
      [930, 418],
    ]) {
      drawStar(ctx, x, y, 17, 8);
    }
    ctx.letterSpacing = '0px';
  });
  boardTexture.anisotropy = maxAniso;

  const group = new THREE.Group();
  group.position.set(0, 0, -136.5);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(16.8, 8.2, 0.55),
    makeStandard(0x49333d, { roughness: 0.8 })
  );
  frame.position.y = 12.2;
  group.add(frame);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(15.7, 7.3),
    new THREE.MeshBasicMaterial({ map: boardTexture, toneMapped: false, fog: false })
  );
  screen.position.set(0, 12.2, 0.31);
  group.add(screen);
  for (const x of [-6.4, 6.4]) {
    const support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 9.3, 8),
      makeStandard(0xdac8b8, { roughness: 0.85 })
    );
    support.position.set(x, 4.7, -0.2);
    group.add(support);
  }
  for (const side of [-1, 1]) {
    const streamer = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 4.8),
      new THREE.MeshBasicMaterial({
        color: side < 0 ? palette.coral : palette.mintDeep,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    streamer.position.set(side * 9.3, 11.4, 0);
    streamer.rotation.z = side * 0.08;
    group.add(streamer);
  }
  root.add(group);
}

function makeMotes(scene, type) {
  const isPetals = type === 'petals';
  const count = isPetals ? 44 : 150;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const data = [];
  const colorPalette = isPetals
    ? [0xffb8c8, 0xffd7c0, 0xfff1e3, 0xffc4d1]
    : [0xfff7de, 0xffe0b8, 0xffd1dd, 0xffffff];
  const rng = createRng(isPetals ? 5217 : 8821);
  for (let i = 0; i < count; i += 1) {
    const d = {
      x: (rng() - 0.5) * (isPetals ? 22 : 28),
      y: 0.25 + rng() * (isPetals ? 7.5 : 9),
      z: (rng() - 0.5) * (isPetals ? 36 : 48),
      speed: (isPetals ? 0.18 : 0.1) + rng() * 0.24,
      drift: (rng() - 0.5) * 0.18,
      phase: rng() * TAU,
      spin: rng() * TAU,
    };
    data.push(d);
    positions[i * 3] = d.x;
    positions[i * 3 + 1] = d.y;
    positions[i * 3 + 2] = d.z;
    const c = new THREE.Color(colorPalette[i % colorPalette.length]);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const texture = isPetals ? petalTexture(96) : softCircleTexture(64, 0.24);
  const material = new THREE.PointsMaterial({
    size: isPetals ? 0.19 : 0.075,
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: isPetals ? 0.68 : 0.55,
    depthWrite: false,
    blending: isPetals ? THREE.NormalBlending : THREE.AdditiveBlending,
    sizeAttenuation: true,
    alphaTest: 0.02,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return { points, data, positions, count };
}

function updateMotes(system, time, player, petals) {
  if (!system) return;
  const { data, positions, points } = system;
  for (let i = 0; i < data.length; i += 1) {
    const d = data[i];
    d.y += d.speed * 0.016;
    if (d.y > (petals ? 8.4 : 9.4)) d.y = 0.2 + (i % 7) * 0.1;
    const x = d.x + Math.sin(time * 0.4 + d.phase) * 0.7 + player.x;
    const y = d.y + Math.sin(time * 0.7 + d.phase * 2) * 0.12;
    const z = d.z + Math.cos(time * 0.25 + d.phase) * 0.6 + player.z;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  points.geometry.attributes.position.needsUpdate = true;
}
