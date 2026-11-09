import * as THREE from 'three';
import {
  TAU,
  clamp,
  damp,
  smoothstep,
  easeOutCubic,
  easeInCubic,
  easeOutBack,
  blobShadowTexture,
  canvasTexture,
  roundRectPath,
  createStarGeometry,
} from './utils.js';

const COLORS = {
  fur: 0xffe7ce,
  furShade: 0xf2d0aa,
  innerEar: 0xff92a8,
  blush: 0xff91a6,
  outfit: 0x55d4bc,
  outfitDark: 0x2fa28d,
  scarf: 0xf55d74,
  scarfLight: 0xff8698,
  shoe: 0xffc44f,
  sole: 0xfff7e8,
  eye: 0x3b2730,
  mouth: 0x6d3541,
  tongue: 0xff8da2,
  star: 0xffcc50,
  cream: 0xfff5e3,
};

const FALL_DURATION = 1.55;

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x3d241d,
    emissiveIntensity: options.emissiveIntensity ?? 0.025,
    flatShading: options.flatShading ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    map: options.map ?? null,
    alphaTest: options.alphaTest ?? 0,
    depthWrite: options.depthWrite ?? true,
  });
}

function mesh(geometry, material, parent, position, scale, rotation) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.set(position[0], position[1], position[2]);
  if (scale) object.scale.set(scale[0], scale[1], scale[2]);
  if (rotation) object.rotation.set(rotation[0], rotation[1], rotation[2]);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function makeBibTexture() {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.97)';
    roundRectPath(ctx, 18, 18, w - 36, h - 36, 34);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#4b333c';
    ctx.stroke();
    ctx.fillStyle = '#ff778a';
    ctx.font = '700 126px Fredoka, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('01', w / 2, 136);
    ctx.fillStyle = '#4b333c';
    ctx.font = '600 26px Fredoka, Arial, sans-serif';
    ctx.letterSpacing = '5px';
    ctx.fillText('GO RUN', w / 2, 220);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#ffd36e';
    ctx.beginPath();
    const cx = w / 2;
    const cy = 260;
    const outer = 22;
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const radius = i % 2 === 0 ? outer : outer * 0.43;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  });
}

function createRibbon(width, length, color, phase, offsetX, segments = 14) {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
    emissive: color,
    emissiveIntensity: 0.02,
  });
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = true;
  object.receiveShadow = true;
  object.frustumCulled = false;

  function update(time, speedNorm, mode) {
    const pos = geometry.attributes.position.array;
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const wind = Math.sin(time * (3.2 + speedNorm * 3.2) + phase + t * 5.2);
      const wave = wind * 0.105 * t * (0.45 + speedNorm);
      const lift = speedNorm * 0.14 * Math.sin(t * Math.PI * 0.85);
      const x = offsetX + wave + Math.sin(t * 4.5 + phase) * 0.025 * t;
      const y = 1.52 + lift - t * 0.55 - t * t * 0.05 + Math.sin(time * 4.1 + phase + t * 4) * 0.04 * t;
      const z = 0.24 + t * (length + speedNorm * 0.62);
      const half = (width * 0.5) * (1 - t * 0.48);
      const idx = i * 2 * 3;
      pos[idx] = x - half;
      pos[idx + 1] = y;
      pos[idx + 2] = z;
      pos[idx + 3] = x + half;
      pos[idx + 4] = y;
      pos[idx + 5] = z;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  update(0, 0, 'menu');
  return { mesh: object, update };
}

function addFaceFeatures(head, materials) {
  const eyeGeometry = new THREE.SphereGeometry(1, 18, 14);
  const glintGeometry = new THREE.SphereGeometry(1, 10, 8);
  const normalEyes = [];
  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    group.position.set(side * 0.16, 0.025, -0.43);
    head.add(group);
    const eye = mesh(eyeGeometry, materials.eye, group, [0, 0, 0], [0.072, 0.085, 0.027]);
    eye.castShadow = false;
    eye.receiveShadow = false;
    const glint = mesh(glintGeometry, materials.eyeGlint, group, [0.017, 0.022, -0.022], [0.013, 0.015, 0.009]);
    glint.castShadow = false;
    glint.receiveShadow = false;
    normalEyes.push(group);
  }

  const happyEyes = new THREE.Group();
  happyEyes.visible = false;
  head.add(happyEyes);
  for (const side of [-1, 1]) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.056, 0.012, 6, 14, Math.PI),
      materials.eye
    );
    arc.position.set(side * 0.155, 0.03, -0.452);
    arc.rotation.z = 0;
    arc.castShadow = false;
    happyEyes.add(arc);
  }

  const dizzyEyes = new THREE.Group();
  dizzyEyes.visible = false;
  head.add(dizzyEyes);
  const xGeo = new THREE.BoxGeometry(0.095, 0.016, 0.012);
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(side * 0.155, 0.03, -0.448);
    const a = new THREE.Mesh(xGeo, materials.eye);
    a.rotation.z = Math.PI / 4;
    g.add(a);
    const b = new THREE.Mesh(xGeo, materials.eye);
    b.rotation.z = -Math.PI / 4;
    g.add(b);
    dizzyEyes.add(g);
  }

  const blushGeo = new THREE.SphereGeometry(1, 14, 10);
  for (const side of [-1, 1]) {
    const cheek = mesh(
      blushGeo,
      materials.blush,
      head,
      [side * 0.275, -0.095, -0.355],
      [0.082, 0.043, 0.017]
    );
    cheek.rotation.y = side * 0.38;
    cheek.castShadow = false;
    cheek.receiveShadow = false;
  }

  const nose = mesh(
    new THREE.SphereGeometry(1, 10, 8),
    materials.nose,
    head,
    [0, -0.075, -0.465],
    [0.028, 0.021, 0.015]
  );
  nose.castShadow = false;

  const mouthNormal = new THREE.Group();
  head.add(mouthNormal);
  const mouthArc = new THREE.TorusGeometry(0.034, 0.0085, 5, 10, Math.PI);
  for (const side of [-1, 1]) {
    const arc = new THREE.Mesh(mouthArc, materials.mouth);
    arc.position.set(side * 0.036, -0.155, -0.456);
    arc.rotation.z = Math.PI;
    arc.castShadow = false;
    mouthNormal.add(arc);
  }

  const mouthOpen = new THREE.Group();
  mouthOpen.visible = false;
  head.add(mouthOpen);
  const openShape = mesh(
    new THREE.SphereGeometry(1, 16, 12),
    materials.mouth,
    mouthOpen,
    [0, -0.155, -0.451],
    [0.058, 0.07, 0.018]
  );
  openShape.castShadow = false;
  const tongue = mesh(
    new THREE.SphereGeometry(1, 12, 8),
    materials.tongue,
    mouthOpen,
    [0.005, -0.18, -0.466],
    [0.035, 0.028, 0.012]
  );
  tongue.castShadow = false;

  return {
    normalEyes,
    happyEyes,
    dizzyEyes,
    mouthNormal,
    mouthOpen,
  };
}

export function createRunner() {
  const group = new THREE.Group();
  group.name = 'GoRun bunny';
  const tilt = new THREE.Group();
  const bob = new THREE.Group();
  group.add(tilt);
  tilt.add(bob);

  const materials = {
    fur: standard(COLORS.fur, { roughness: 0.8 }),
    furShade: standard(COLORS.furShade, { roughness: 0.85 }),
    innerEar: standard(COLORS.innerEar, { roughness: 0.72 }),
    blush: standard(COLORS.blush, { roughness: 1, transparent: true, opacity: 0.84 }),
    outfit: standard(COLORS.outfit, { roughness: 0.66 }),
    outfitDark: standard(COLORS.outfitDark, { roughness: 0.7 }),
    scarf: standard(COLORS.scarf, { roughness: 0.68 }),
    scarfLight: standard(COLORS.scarfLight, { roughness: 0.7 }),
    shoe: standard(COLORS.shoe, { roughness: 0.45 }),
    sole: standard(COLORS.sole, { roughness: 0.92 }),
    eye: standard(COLORS.eye, { roughness: 0.25 }),
    eyeGlint: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    mouth: standard(COLORS.mouth, { roughness: 0.6 }),
    tongue: standard(COLORS.tongue, { roughness: 0.62 }),
    nose: standard(COLORS.blush, { roughness: 0.6 }),
    star: standard(COLORS.star, { roughness: 0.6 }),
    cream: standard(COLORS.cream, { roughness: 0.8 }),
    shadow: new THREE.MeshBasicMaterial({
      map: blobShadowTexture(128),
      color: 0x3a2029,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  };

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 1.15), materials.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.014;
  shadow.renderOrder = 2;
  group.add(shadow);

  // Soft round running onesie.
  const body = mesh(
    new THREE.SphereGeometry(1, 32, 26),
    materials.outfit,
    bob,
    [0, 1.13, 0],
    [0.445, 0.505, 0.375]
  );
  body.castShadow = true;
  body.receiveShadow = true;

  const waist = mesh(
    new THREE.TorusGeometry(0.335, 0.028, 8, 24),
    materials.cream,
    bob,
    [0, 0.74, 0],
    null,
    [Math.PI / 2, 0, 0]
  );
  waist.castShadow = false;

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.94, 0.34);
  bob.add(tailPivot);
  const tail = mesh(
    new THREE.SphereGeometry(1, 18, 14),
    materials.fur,
    tailPivot,
    [0, 0, 0.06],
    [0.145, 0.145, 0.135]
  );

  // Chest bib and a star on the back.
  const bibTexture = makeBibTexture();
  const bibMaterial = standard(0xffffff, {
    roughness: 0.82,
    map: bibTexture,
    transparent: true,
    alphaTest: 0.04,
  });
  bibMaterial.emissiveIntensity = 0;
  const bib = mesh(new THREE.PlaneGeometry(0.31, 0.39), bibMaterial, bob, [0, 1.16, -0.376]);
  bib.rotation.y = Math.PI;
  bib.castShadow = false;

  const backStar = mesh(createStarGeometry(0.135, 0.06), materials.cream, bob, [0, 1.23, 0.368]);
  backStar.castShadow = false;
  const backStarInner = mesh(createStarGeometry(0.1, 0.044), materials.star, bob, [0, 1.23, 0.372]);
  backStarInner.castShadow = false;

  // Head.
  const head = new THREE.Group();
  head.position.set(0, 1.79, 0);
  bob.add(head);
  const headMesh = mesh(
    new THREE.SphereGeometry(1, 36, 28),
    materials.fur,
    head,
    [0, 0, 0],
    [0.47, 0.465, 0.45]
  );

  // Cheeky cowlick.
  const tuft = new THREE.Group();
  tuft.position.set(0, 0.43, -0.1);
  head.add(tuft);
  mesh(new THREE.SphereGeometry(1, 14, 10), materials.furShade, tuft, [0, 0, 0], [0.09, 0.06, 0.075]);
  mesh(new THREE.SphereGeometry(1, 14, 10), materials.furShade, tuft, [0.075, 0.01, -0.01], [0.055, 0.05, 0.05]);

  const face = addFaceFeatures(head, materials);

  // Ears.
  const earGeo = new THREE.SphereGeometry(1, 22, 20);
  const innerEarGeo = new THREE.SphereGeometry(1, 16, 14);
  const earL = new THREE.Group();
  earL.position.set(-0.19, 0.31, 0.02);
  earL.rotation.z = 0.18;
  head.add(earL);
  mesh(earGeo, materials.fur, earL, [0, 0.31, 0], [0.145, 0.37, 0.095]);
  mesh(innerEarGeo, materials.innerEar, earL, [0, 0.32, -0.074], [0.075, 0.245, 0.027]).castShadow = false;

  const earR = new THREE.Group();
  earR.position.set(0.19, 0.31, 0.02);
  earR.rotation.z = -0.18;
  head.add(earR);
  mesh(earGeo, materials.fur, earR, [0, 0.31, 0], [0.145, 0.37, 0.095]);
  mesh(innerEarGeo, materials.innerEar, earR, [0, 0.32, -0.074], [0.075, 0.245, 0.027]).castShadow = false;

  // Arms with little coral cuffs.
  const armGeo = new THREE.CapsuleGeometry(0.082, 0.24, 4, 12);
  const handGeo = new THREE.SphereGeometry(1, 16, 12);
  const cuffGeo = new THREE.TorusGeometry(0.088, 0.022, 6, 14);
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.44, 1.38, 0);
    bob.add(shoulder);
    const sleeve = mesh(
      new THREE.SphereGeometry(1, 16, 12),
      materials.outfit,
      shoulder,
      [0, -0.035, 0],
      [0.115, 0.115, 0.11]
    );
    const arm = mesh(armGeo, materials.fur, shoulder, [0, -0.19, 0]);
    const cuff = mesh(cuffGeo, materials.scarf, shoulder, [0, -0.335, 0], null, [Math.PI / 2, 0, 0]);
    cuff.castShadow = false;
    const hand = mesh(handGeo, materials.fur, shoulder, [0, -0.38, 0], [0.105, 0.095, 0.1]);
    return shoulder;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Legs and oversized shoes.
  const legGeo = new THREE.CapsuleGeometry(0.112, 0.27, 4, 12);
  const shoeGeo = new THREE.SphereGeometry(1, 20, 14);
  const soleGeo = new THREE.SphereGeometry(1, 18, 10);
  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.215, 0.69, 0);
    bob.add(hip);
    mesh(legGeo, materials.fur, hip, [0, -0.265, 0]);
    const shoe = mesh(shoeGeo, materials.shoe, hip, [0, -0.555, -0.085], [0.19, 0.112, 0.28], [0.04, 0, 0]);
    const sole = mesh(soleGeo, materials.sole, hip, [0, -0.635, -0.08], [0.197, 0.036, 0.29], [0.04, 0, 0]);
    sole.castShadow = false;
    return { hip, shoe, sole };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Neck scarf and two streaming ribbons.
  const scarfRing = mesh(
    new THREE.TorusGeometry(0.295, 0.063, 10, 28),
    materials.scarf,
    bob,
    [0, 1.46, 0],
    null,
    [Math.PI / 2, 0, 0]
  );
  scarfRing.castShadow = true;
  const scarfKnot = mesh(
    new THREE.SphereGeometry(1, 16, 12),
    materials.scarf,
    bob,
    [0.17, 1.48, 0.24],
    [0.085, 0.075, 0.07]
  );
  const ribbonA = createRibbon(0.19, 0.82, COLORS.scarf, 0.4, -0.12, 14);
  bob.add(ribbonA.mesh);
  const ribbonB = createRibbon(0.12, 0.64, COLORS.scarfLight, 2.1, 0.13, 12);
  bob.add(ribbonB.mesh);

  // Cache a few reusable values.
  const headBaseY = head.position.y;
  const state = {
    time: 0,
    mode: 'menu',
    runPhase: 0,
    stepPulse: 0,
    stepDir: 1,
    blinkTimer: 2.6,
    blinkTime: 0,
    crouch: 0,
    readyBounce: 0,
    goBurst: 0,
    finishT: 0,
    expression: 'normal',
    scarfSpeed: 0,
  };

  function setExpression(name) {
    if (state.expression === name) return;
    state.expression = name;
    face.normalEyes.forEach((eye) => {
      eye.visible = name === 'normal';
    });
    face.happyEyes.visible = name === 'happy';
    face.dizzyEyes.visible = name === 'dizzy';
    face.mouthNormal.visible = name !== 'open';
    face.mouthOpen.visible = name === 'open';
  }

  function reset() {
    state.time = 0;
    state.runPhase = 0;
    state.stepPulse = 0;
    state.stepDir = 1;
    state.blinkTimer = 2.8;
    state.blinkTime = 0;
    state.crouch = 0;
    state.readyBounce = 0;
    state.goBurst = 0;
    state.finishT = 0;
    state.mode = 'menu';
    setExpression('normal');
    bob.position.set(0, 0, 0);
    bob.rotation.set(0, 0, 0);
    bob.scale.set(1, 1, 1);
    tilt.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    legL.hip.rotation.set(0, 0, 0);
    legR.hip.rotation.set(0, 0, 0);
    armL.rotation.set(0, 0, -0.14);
    armR.rotation.set(0, 0, 0.14);
    shadow.scale.setScalar(1);
  }

  function onStep(side, first = false) {
    state.stepPulse = 1;
    state.stepDir = side === 'left' ? 1 : -1;
    if (first) {
      state.runPhase = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  function onCountdownTick() {
    state.readyBounce = 1;
  }

  function onGo() {
    state.goBurst = 1;
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    if (mode === 'finished') state.finishT = 0;
    state.mode = mode;
  }

  function update(dt, elapsed, params = {}) {
    state.time += dt;
    const mode = params.mode || 'running';
    setMode(mode);
    const speed = params.speed || 0;
    const speedNorm = clamp((speed - 1.4) / 9.6, 0, 1);
    const fallT = params.fallTime || 0;
    const isFalling = mode === 'falling';
    const isFinished = mode === 'finished';
    const isRunning = mode === 'running' && !isFalling;
    const isMenu = mode === 'menu';
    const isCountdown = mode === 'countdown';

    state.stepPulse *= Math.exp(-8.5 * dt);
    state.readyBounce *= Math.exp(-7 * dt);
    state.goBurst *= Math.exp(-6.5 * dt);
    state.crouch = damp(state.crouch, isCountdown ? 1 : 0, 8.5, dt);

    // Blink like a tiny, busy rabbit.
    state.blinkTimer -= dt;
    if (state.blinkTime > 0) {
      state.blinkTime -= dt;
    } else if (state.blinkTimer <= 0) {
      state.blinkTime = 0.12;
      state.blinkTimer = 2.4 + Math.random() * 2.5;
    }
    const blinkScale = state.blinkTime > 0 ? 0.12 : 1;
    face.normalEyes.forEach((eye) => {
      eye.scale.y = blinkScale;
    });

    if (isFinished) {
      state.finishT += dt;
    }

    // Set the basic pose each frame, then each state layers characterful motion on top.
    let bobY = 0;
    let bobPitch = 0;
    let bobYaw = 0;
    let bobRoll = 0;
    let squash = 1;
    let legLX = 0;
    let legRX = 0;
    let legLZ = 0.06;
    let legRZ = -0.06;
    let armLX = 0;
    let armRX = 0;
    let armLZ = -0.14;
    let armRZ = 0.14;
    let headPitch = 0;
    let headYaw = 0;
    let headRoll = 0;
    let earLX = 0.02;
    let earRX = 0.02;
    let earLZ = 0.18;
    let earRZ = -0.18;
    let tailRot = 0;
    let shadowScale = 1;

    if (isMenu) {
      const t = state.time;
      bobY = Math.sin(t * 1.9) * 0.012;
      bobPitch = 0.02 + Math.sin(t * 1.2) * 0.008;
      bobRoll = Math.sin(t * 0.8) * 0.012;
      legLX = Math.sin(t * 1.4) * 0.02;
      legRX = -legLX;
      armLZ = -0.16 + Math.sin(t * 1.5) * 0.015;
      armRZ = 2.05 + Math.sin(t * 3.2) * 0.22;
      armRX = 0.06 + Math.sin(t * 3.2) * 0.06;
      headPitch = -0.015 + Math.sin(t * 1.1) * 0.02;
      headYaw = -0.22 + Math.sin(t * 0.7) * 0.09;
      headRoll = Math.sin(t * 0.9) * 0.02;
      earLX = 0.03 + Math.sin(t * 1.4) * 0.03;
      earRX = 0.03 + Math.cos(t * 1.3) * 0.03;
      earLZ = 0.2 + Math.sin(t * 1.1) * 0.02;
      earRZ = -0.2 - Math.sin(t * 1.2) * 0.02;
      tailRot = Math.sin(t * 2.3) * 0.08;
      bobY += Math.sin(t * 9) * 0.0015;
    } else if (isCountdown) {
      const c = state.crouch;
      const bounce = state.readyBounce * 0.035;
      bobY = -0.105 * c + bounce;
      bobPitch = 0.18 * c;
      bobRoll = Math.sin(state.time * 5.5) * 0.004 * c;
      legLX = 0.42 * c;
      legRX = -0.34 * c;
      legLZ = 0.08;
      legRZ = -0.08;
      armLX = -0.46 * c;
      armRX = -0.4 * c;
      armLZ = -0.3 - c * 0.12;
      armRZ = 0.3 + c * 0.12;
      headPitch = -0.04 * c;
      headYaw = 0;
      earLX = 0.3 * c + Math.sin(state.time * 7) * 0.012 * c;
      earRX = 0.3 * c + Math.cos(state.time * 7) * 0.012 * c;
      earLZ = 0.2;
      earRZ = -0.2;
      tailRot = Math.sin(state.time * 5) * 0.04;
    } else if (isRunning) {
      const rawSpeedMovement = smoothstep(clamp(speed / 1.8, 0, 1));
      state.runPhase += dt * (1.2 + speed * 1.7) * rawSpeedMovement;
      const phase = state.runPhase;
      const swing = Math.sin(phase);
      const swingAmp = (0.38 + speedNorm * 0.7) * rawSpeedMovement;
      const bobAmplitude = 0.052 * (0.4 + speedNorm) * rawSpeedMovement;
      const breath = Math.sin(state.time * 2.2) * 0.004 * (1 - rawSpeedMovement);
      bobY = Math.abs(Math.sin(phase)) * bobAmplitude + breath + state.stepPulse * 0.035 + state.goBurst * 0.05;
      bobPitch = -0.02 - speedNorm * 0.17 - rawSpeedMovement * 0.03;
      bobRoll = Math.sin(phase) * 0.025 * rawSpeedMovement + state.stepDir * state.stepPulse * 0.035;
      bobYaw = Math.sin(phase) * 0.015 * rawSpeedMovement;
      squash = 1 - Math.sin(phase * 2) * 0.012 * rawSpeedMovement;
      legLX = swing * swingAmp;
      legRX = -swing * swingAmp;
      legLZ = 0.06;
      legRZ = -0.06;
      armLX = -swing * (0.55 + speedNorm * 0.35) * rawSpeedMovement;
      armRX = swing * (0.55 + speedNorm * 0.35) * rawSpeedMovement;
      armLZ = -0.14 - speedNorm * 0.08;
      armRZ = 0.14 + speedNorm * 0.08;
      headPitch = 0.045 + speedNorm * 0.035 + Math.sin(phase * 2) * 0.01;
      headYaw = 0;
      headRoll = Math.sin(phase) * 0.018;
      earLX = 0.12 + speedNorm * 0.34 + Math.abs(swing) * 0.1;
      earRX = 0.12 + speedNorm * 0.34 + Math.abs(swing) * 0.1;
      earLZ = 0.2 + Math.sin(phase * 0.5) * 0.02;
      earRZ = -0.2 - Math.sin(phase * 0.5) * 0.02;
      tailRot = Math.sin(phase * 2) * 0.16;
      shadowScale = 1.05;
    } else if (isFalling) {
      const impact = clamp(fallT / 0.34, 0, 1);
      let fallAngle = 0;
      if (fallT < 0.34) {
        fallAngle = -1.3 * easeInCubic(impact);
      } else if (fallT < 1.0) {
        fallAngle = -1.3 + Math.sin((fallT - 0.34) * 9) * 0.018;
      } else {
        const recover = easeOutCubic(clamp((fallT - 1.0) / (FALL_DURATION - 1.0), 0, 1));
        fallAngle = -1.3 * (1 - recover);
      }
      tilt.rotation.x = fallAngle;
      tilt.rotation.z = Math.sin(fallT * 2.5) * 0.04 * (fallT < 1.0 ? 1 : 0.4);
      const grounded = clamp((fallT - 0.18) / 0.25, 0, 1);
      bobY = 0.04 * grounded;
      bobPitch = 0.08;
      const kick = Math.sin(fallT * 15) * 0.3;
      legLX = 0.25 + kick;
      legRX = 0.08 - kick;
      legLZ = 0.25;
      legRZ = -0.22;
      armLX = -0.4;
      armRX = 0.2;
      armLZ = -1.15 - Math.sin(fallT * 13) * 0.14;
      armRZ = 1.15 + Math.sin(fallT * 13 + 1) * 0.14;
      headPitch = 0.28 + Math.sin(fallT * 10) * 0.04;
      headYaw = Math.sin(fallT * 9) * 0.06;
      headRoll = Math.sin(fallT * 7) * 0.05;
      earLX = 0.56 + Math.sin(fallT * 12) * 0.1;
      earRX = 0.56 + Math.cos(fallT * 12) * 0.1;
      earLZ = 0.35;
      earRZ = -0.35;
      tailRot = Math.sin(fallT * 12) * 0.2;
      shadowScale = 1.2;
    } else if (isFinished) {
      const t = state.finishT;
      const jump = Math.abs(Math.sin(t * 4.4));
      bobY = jump * 0.21;
      bobPitch = -0.01;
      bobRoll = Math.sin(t * 2.2) * 0.035;
      bobYaw = Math.sin(t * 1.7) * 0.05;
      squash = 0.985 + jump * 0.03;
      legLX = Math.sin(t * 4.4) * 0.4;
      legRX = -Math.sin(t * 4.4) * 0.4;
      legLZ = 0.08;
      legRZ = -0.08;
      armLX = 0.1 + Math.sin(t * 5.2) * 0.25;
      armRX = 0.1 + Math.cos(t * 5.2) * 0.25;
      armLZ = -2.1 - Math.sin(t * 6.4) * 0.3;
      armRZ = 2.1 + Math.sin(t * 6.4 + 0.7) * 0.3;
      headPitch = 0.02 + Math.sin(t * 4.4) * 0.03;
      headYaw = -0.18 + Math.sin(t * 1.3) * 0.1;
      headRoll = Math.sin(t * 2.3) * 0.05;
      earLX = 0.05 + Math.sin(t * 8.3) * 0.18;
      earRX = 0.05 + Math.cos(t * 8.3) * 0.18;
      earLZ = 0.22 + Math.sin(t * 5.7) * 0.05;
      earRZ = -0.22 - Math.sin(t * 5.9) * 0.05;
      tailRot = Math.sin(t * 8) * 0.25;
      shadowScale = 1.15;
    } else {
      bobY = Math.sin(state.time * 2) * 0.01;
    }

    if (!isFalling) {
      tilt.rotation.x = damp(tilt.rotation.x, 0, 12, dt);
      tilt.rotation.z = damp(tilt.rotation.z, 0, 12, dt);
    }

    // A little wind-up bounce after the countdown.
    bobY += state.goBurst * 0.045;
    squash *= 1 + state.stepPulse * 0.028;
    if (isFalling) squash *= 1 + Math.sin(fallT * 20) * 0.012 * (fallT < 1 ? 1 : 0);

    bob.position.y = bobY;
    bob.rotation.set(bobPitch, bobYaw, bobRoll);
    bob.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    legL.hip.rotation.set(legLX, 0, legLZ);
    legR.hip.rotation.set(legRX, 0, legRZ);
    armL.rotation.set(armLX, 0, armLZ);
    armR.rotation.set(armRX, 0, armRZ);
    head.position.y = headBaseY + Math.sin(state.time * 2.1) * 0.004;
    head.rotation.set(headPitch, headYaw, headRoll);
    earL.rotation.set(earLX, 0, earLZ);
    earR.rotation.set(earRX, 0, earRZ);
    tailPivot.rotation.y = tailRot;
    tailPivot.rotation.z = Math.sin(state.time * 2.8) * 0.05;

    shadow.scale.set(shadowScale, shadowScale * (isFalling ? 1.25 : 1), 1);
    shadow.material.opacity = clamp(0.28 - bobY * 0.12, 0.12, 0.32);

    // The scarf is a live cloth ribbon, so it gets a small simulation update.
    let scarfSpeed = speedNorm;
    if (isFalling) scarfSpeed = 0.1;
    if (isFinished) scarfSpeed = 0.4 + Math.sin(state.time * 2) * 0.1;
    if (isMenu) scarfSpeed = 0.12;
    ribbonA.update(state.time, scarfSpeed, mode);
    ribbonB.update(state.time + 0.3, scarfSpeed * 0.9, mode);

    // Swap the expression as a whole, like a sticker changing on the face.
    const expression = isFinished ? 'happy' : isFalling ? 'dizzy' : 'normal';
    if (state.expression !== expression) {
      face.normalEyes.forEach((eye) => { eye.visible = expression === 'normal'; });
      face.happyEyes.visible = expression === 'happy';
      face.dizzyEyes.visible = expression === 'dizzy';
      face.mouthNormal.visible = expression === 'normal';
      face.mouthOpen.visible = expression !== 'normal';
      state.expression = expression;
    }
  }

  function getFootWorldPosition(side, target = new THREE.Vector3()) {
    const shoe = side === 'left' ? legL.shoe : legR.shoe;
    shoe.getWorldPosition(target);
    target.y = 0.045;
    return target;
  }

  function getHeadWorldPosition(target = new THREE.Vector3()) {
    head.getWorldPosition(target);
    return target;
  }

  function getDizzyAnchor(target = new THREE.Vector3()) {
    getHeadWorldPosition(target);
    target.y += 1.0;
    target.z -= 0.1;
    return target;
  }

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = child.castShadow ?? true;
      child.receiveShadow = child.receiveShadow ?? true;
    }
  });

  reset();

  return {
    group,
    update,
    reset,
    onStep,
    onCountdownTick,
    onGo,
    setMode,
    getFootWorldPosition,
    getHeadWorldPosition,
    getDizzyAnchor,
    fallDuration: FALL_DURATION,
    materials,
  };
}
