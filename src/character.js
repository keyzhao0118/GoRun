import * as THREE from 'three';
import {
  TAU,
  clamp,
  damp,
  lerp,
  smoothstep,
  easeInCubic,
  easeOutCubic,
  canvasTexture,
  roundRectPath,
  blobShadowTexture,
} from './utils.js';

const FALL_DURATION = 1.55;

export const PLAYER_PROFILE = {
  id: 'you',
  lane: 4,
  name: 'YOU',
  label: '你',
  country: 'GORUN',
  number: '01',
  skin: 0xf0bb91,
  hair: 0x3d2a37,
  hairStyle: 'swoop',
  height: 1.0,
  build: 1.0,
  kit: {
    top: 0x58d3bd,
    trim: 0xff7c8d,
    shorts: 0xff8798,
    shoe: 0xffd36e,
    sole: 0xfff7ea,
    sock: 0xfff7ea,
  },
  bib: 0xff6f82,
  headband: 0x58d3bd,
  beard: false,
  signature: 'player',
  style: { stride: 1.0, cadence: 1.0, lean: 0.17, arm: 0.95, bounce: 0.055 },
  isPlayer: true,
};

export const OPPONENTS = [
  {
    id: 'gatlin',
    lane: 1,
    name: 'GATLIN',
    label: '加特林',
    country: 'USA',
    number: '1',
    pb: 9.74,
    times: [9.74, 9.76, 9.77, 9.79, 9.80, 9.83, 9.87, 9.89],
    accel: 2.55,
    skin: 0x75492f,
    hair: 0x1a1416,
    hairStyle: 'fade',
    height: 1.035,
    build: 1.1,
    kit: {
      top: 0xe35c6a,
      trim: 0xf6f0e2,
      shorts: 0x2b3957,
      shoe: 0xf6f0e2,
      sole: 0xfff7e9,
      sock: 0x3f5f9f,
    },
    bib: 0x3f5f9f,
    headband: null,
    beard: false,
    signature: 'flex',
    style: { stride: 1.0, cadence: 1.02, lean: 0.2, arm: 1.0, bounce: 0.058 },
  },
  {
    id: 'blake',
    lane: 2,
    name: 'BLAKE',
    label: '布雷克',
    country: 'JAM',
    number: '2',
    pb: 9.69,
    times: [9.69, 9.75, 9.82, 9.85, 9.89, 9.92],
    accel: 2.2,
    skin: 0x6f452d,
    hair: 0x191416,
    hairStyle: 'buzz',
    height: 1.02,
    build: 1.13,
    kit: {
      top: 0x2f9f6e,
      trim: 0xffd45c,
      shorts: 0x24212a,
      shoe: 0x2f9f6e,
      sole: 0xfff4df,
      sock: 0xffd45c,
    },
    bib: 0xffd45c,
    headband: null,
    beard: false,
    signature: 'beast',
    style: { stride: 1.02, cadence: 0.99, lean: 0.23, arm: 1.08, bounce: 0.062 },
  },
  {
    id: 'powell',
    lane: 3,
    name: 'POWELL',
    label: '鲍威尔',
    country: 'JAM',
    number: '3',
    pb: 9.72,
    times: [9.72, 9.74, 9.82, 9.83, 9.84, 9.88, 9.90],
    accel: 2.1,
    skin: 0x784a30,
    hair: 0x1b1516,
    hairStyle: 'short',
    height: 1.045,
    build: 0.98,
    kit: {
      top: 0x42b786,
      trim: 0xffd45c,
      shorts: 0x24212a,
      shoe: 0xffd45c,
      sole: 0xfff7e8,
      sock: 0x42b786,
    },
    bib: 0xffd45c,
    headband: null,
    beard: true,
    signature: 'spread',
    style: { stride: 1.05, cadence: 0.98, lean: 0.15, arm: 0.92, bounce: 0.048 },
  },
  {
    id: 'bolt',
    lane: 5,
    name: 'BOLT',
    label: '博尔特',
    country: 'JAM',
    number: '5',
    pb: 9.58,
    times: [9.58, 9.63, 9.69, 9.72, 9.76, 9.79, 9.81],
    accel: 1.85,
    skin: 0x7a4d31,
    hair: 0x171315,
    hairStyle: 'buzz',
    height: 1.105,
    build: 0.93,
    kit: {
      top: 0xffd45c,
      trim: 0x2e9b6a,
      shorts: 0x24212a,
      shoe: 0xffd45c,
      sole: 0xfff5e1,
      sock: 0x2e9b6a,
    },
    bib: 0x2e9b6a,
    headband: null,
    beard: false,
    signature: 'bolt',
    style: { stride: 1.14, cadence: 0.91, lean: 0.18, arm: 0.96, bounce: 0.052 },
  },
  {
    id: 'gay',
    lane: 6,
    name: 'GAY',
    label: '盖伊',
    country: 'USA',
    number: '6',
    pb: 9.69,
    times: [9.69, 9.71, 9.75, 9.77, 9.84, 9.88],
    accel: 2.3,
    skin: 0x71462e,
    hair: 0x1a1416,
    hairStyle: 'short',
    height: 1.0,
    build: 1.0,
    kit: {
      top: 0xf6f0e3,
      trim: 0xe35c6a,
      shorts: 0x2d3a59,
      shoe: 0x3f5f9f,
      sole: 0xfff7e9,
      sock: 0xe35c6a,
    },
    bib: 0xe35c6a,
    headband: 0xe35c6a,
    beard: false,
    signature: 'salute',
    style: { stride: 1.01, cadence: 1.0, lean: 0.16, arm: 0.95, bounce: 0.05 },
  },
  {
    id: 'su',
    lane: 7,
    name: 'SU',
    label: '苏炳添',
    country: 'CHN',
    number: '7',
    pb: 9.83,
    times: [9.83, 9.90, 9.91, 9.92, 9.95, 9.98, 10.05],
    accel: 2.7,
    skin: 0xd0a077,
    hair: 0x1b1514,
    hairStyle: 'short',
    height: 0.955,
    build: 0.96,
    kit: {
      top: 0xe35c6a,
      trim: 0xffd45c,
      shorts: 0x252129,
      shoe: 0xf6f0e3,
      sole: 0xfff7e9,
      sock: 0xffd45c,
    },
    bib: 0xffd45c,
    headband: null,
    beard: false,
    signature: 'sky',
    style: { stride: 0.93, cadence: 1.1, lean: 0.19, arm: 1.04, bounce: 0.048 },
  },
  {
    id: 'coleman',
    lane: 8,
    name: 'COLEMAN',
    label: '科尔曼',
    country: 'USA',
    number: '8',
    pb: 9.76,
    times: [9.76, 9.79, 9.81, 9.82, 9.85, 9.88, 9.93],
    accel: 2.45,
    skin: 0x74482f,
    hair: 0x1a1416,
    hairStyle: 'fade',
    height: 0.985,
    build: 1.05,
    kit: {
      top: 0x5d90d5,
      trim: 0xf6f0e3,
      shorts: 0x293958,
      shoe: 0x5d90d5,
      sole: 0xfff7e9,
      sock: 0xe35c6a,
    },
    bib: 0xf6f0e3,
    headband: 0xf6f0e3,
    beard: false,
    signature: 'dance',
    style: { stride: 0.98, cadence: 1.03, lean: 0.18, arm: 1.0, bounce: 0.054 },
  },
];

export function pickRaceTime(profile) {
  return profile.times[Math.floor(Math.random() * profile.times.length)];
}

const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  smallSphere: new THREE.SphereGeometry(1, 14, 10),
  torso: new THREE.CylinderGeometry(0.33, 0.28, 0.48, 14),
  waist: new THREE.TorusGeometry(0.255, 0.028, 7, 22),
  collar: new THREE.TorusGeometry(0.13, 0.027, 6, 18),
  shortsCap: new THREE.CylinderGeometry(0.165, 0.15, 0.22, 12),
  armUpper: new THREE.CapsuleGeometry(0.078, 0.2, 4, 10),
  armLower: new THREE.CapsuleGeometry(0.069, 0.16, 4, 10),
  wrist: new THREE.CylinderGeometry(0.082, 0.082, 0.052, 12),
  thigh: new THREE.CapsuleGeometry(0.108, 0.22, 4, 10),
  shin: new THREE.CapsuleGeometry(0.086, 0.19, 4, 10),
  sock: new THREE.CylinderGeometry(0.09, 0.095, 0.085, 12),
  shoe: new THREE.SphereGeometry(1, 18, 12),
  eyeWhite: new THREE.SphereGeometry(1, 16, 12),
  eyeDark: new THREE.SphereGeometry(1, 14, 10),
  glint: new THREE.SphereGeometry(1, 8, 6),
  brow: new THREE.CapsuleGeometry(0.013, 0.06, 4, 6),
  mouth: new THREE.TorusGeometry(0.045, 0.009, 5, 12, Math.PI),
  mouthLine: new THREE.BoxGeometry(0.075, 0.014, 0.014),
  nose: new THREE.SphereGeometry(1, 12, 9),
  ear: new THREE.SphereGeometry(1, 12, 10),
  hairCap: new THREE.SphereGeometry(1, 24, 14, 0, TAU, 0, Math.PI * 0.46),
  headband: new THREE.CylinderGeometry(0.31, 0.315, 0.062, 24, 1, true),
  bibBack: new THREE.PlaneGeometry(0.34, 0.43),
  bibFront: new THREE.PlaneGeometry(0.22, 0.29),
  stripe: new THREE.BoxGeometry(0.018, 0.34, 0.11),
  shadow: new THREE.PlaneGeometry(1.1, 0.82),
  tongue: new THREE.SphereGeometry(1, 12, 8),
  hairTuft: new THREE.SphereGeometry(1, 12, 8),
  badge: new THREE.CircleGeometry(0.075, 16),
};

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x2a1820,
    emissiveIntensity: options.emissiveIntensity ?? 0.022,
    flatShading: options.flatShading ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    map: options.map ?? null,
    alphaTest: options.alphaTest ?? 0,
    depthWrite: options.depthWrite ?? true,
  });
}

function shade(color, factor) {
  const c = new THREE.Color(color);
  c.multiplyScalar(factor);
  return c.getHex();
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

function noShadow(object) {
  object.castShadow = false;
  object.receiveShadow = false;
  return object;
}

function makeBibTexture(profile) {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff9ee';
    roundRectPath(ctx, 15, 15, w - 30, h - 30, 28);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#44323d';
    ctx.stroke();

    ctx.fillStyle = '#' + profile.bib.toString(16).padStart(6, '0');
    roundRectPath(ctx, 15, 15, w - 30, 42, 20);
    ctx.fill();
    ctx.fillStyle = '#fff9ee';
    ctx.font = '600 18px Fredoka, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GORUN 100M', w / 2, 37);

    ctx.fillStyle = '#44323d';
    ctx.font = '700 ' + (profile.name.length > 5 ? 40 : 54) + 'px Fredoka, Arial, sans-serif';
    ctx.fillText(profile.name, w / 2, 145);
    ctx.fillStyle = '#9c6b6e';
    ctx.font = '500 19px Fredoka, Arial, sans-serif';
    ctx.fillText('LANE ' + profile.number, w / 2, 198);
    ctx.fillStyle = '#44323d';
    ctx.font = '600 24px Fredoka, Arial, sans-serif';
    ctx.fillText(profile.country, w / 2, 244);
    ctx.fillStyle = '#' + profile.bib.toString(16).padStart(6, '0');
    ctx.beginPath();
    ctx.arc(w / 2, 283, 9, 0, TAU);
    ctx.fill();
  });
}

function buildFace(head, materials, profile) {
  const face = {
    normalEyes: [],
    brows: [],
    mouthNormal: new THREE.Group(),
    mouthOpen: new THREE.Group(),
    mouthFocused: new THREE.Group(),
    happyEyes: new THREE.Group(),
    dizzyEyes: new THREE.Group(),
  };

  for (const side of [-1, 1]) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.105, 0.035, -0.282);
    head.add(eyeGroup);
    noShadow(mesh(GEO.eyeWhite, materials.eyeWhite, eyeGroup, [0, 0, 0], [0.061, 0.075, 0.032]));
    noShadow(mesh(GEO.eyeDark, materials.eye, eyeGroup, [side * 0.006, -0.003, -0.026], [0.029, 0.043, 0.018]));
    noShadow(mesh(GEO.glint, materials.glint, eyeGroup, [side * 0.012, 0.018, -0.043], [0.011, 0.014, 0.008]));
    face.normalEyes.push(eyeGroup);

    const brow = new THREE.Group();
    brow.position.set(side * 0.108, 0.145, -0.29);
    head.add(brow);
    noShadow(mesh(GEO.brow, materials.hair, brow, [0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]));
    face.brows.push(brow);

    const cheek = new THREE.Group();
    cheek.position.set(side * 0.19, -0.065, -0.263);
    head.add(cheek);
    noShadow(mesh(GEO.smallSphere, materials.blush, cheek, [0, 0, 0], [0.055, 0.028, 0.012]));
  }

  head.add(face.mouthNormal);
  const smile = mesh(GEO.mouth, materials.mouth, face.mouthNormal, [0, -0.12, -0.295], null, [0, 0, Math.PI]);
  noShadow(smile);

  head.add(face.mouthOpen);
  const openMouth = mesh(GEO.smallSphere, materials.mouth, face.mouthOpen, [0, -0.135, -0.286], [0.047, 0.055, 0.018]);
  noShadow(openMouth);
  const tongue = mesh(GEO.tongue, materials.tongue, face.mouthOpen, [0.002, -0.155, -0.301], [0.026, 0.021, 0.01]);
  noShadow(tongue);

  head.add(face.mouthFocused);
  const line = mesh(GEO.mouthLine, materials.mouth, face.mouthFocused, [0, -0.13, -0.292]);
  noShadow(line);

  head.add(face.happyEyes);
  for (const side of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 5, 12, Math.PI), materials.eye);
    arc.position.set(side * 0.105, 0.04, -0.296);
    arc.castShadow = false;
    arc.receiveShadow = false;
    face.happyEyes.add(arc);
  }

  head.add(face.dizzyEyes);
  const xgeo = new THREE.BoxGeometry(0.075, 0.014, 0.012);
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(side * 0.105, 0.035, -0.295);
    const a = new THREE.Mesh(xgeo, materials.eye);
    a.rotation.z = Math.PI / 4;
    const b = new THREE.Mesh(xgeo, materials.eye);
    b.rotation.z = -Math.PI / 4;
    g.add(a, b);
    face.dizzyEyes.add(g);
  }

  noShadow(mesh(GEO.nose, materials.nose, head, [0, -0.026, -0.3], [0.034, 0.028, 0.024]));

  if (profile.beard) {
    noShadow(mesh(GEO.smallSphere, materials.hair, head, [0, -0.178, -0.245], [0.095, 0.057, 0.033]));
    const mustache = mesh(GEO.mouthLine, materials.hair, head, [0, -0.078, -0.299], [0.9, 1, 1]);
    noShadow(mustache);
  }

  face.happyEyes.visible = false;
  face.dizzyEyes.visible = false;
  face.mouthOpen.visible = false;
  face.mouthFocused.visible = false;

  return face;
}

function addHair(head, materials, profile) {
  const hair = materials.hair;
  const top = mesh(GEO.hairCap, hair, head, [0, 0.065, 0.008], [0.31, 0.32, 0.305]);
  top.castShadow = true;
  noShadow(mesh(GEO.sphere, hair, head, [0, 0.01, 0.135], [0.245, 0.225, 0.16]));
  for (const side of [-1, 1]) {
    noShadow(mesh(GEO.sphere, hair, head, [side * 0.255, -0.005, 0.04], [0.072, 0.135, 0.13]));
  }

  if (profile.hairStyle === 'buzz') {
    top.scale.set(0.298, 0.292, 0.296);
    noShadow(mesh(GEO.sphere, hair, head, [0, 0.17, -0.16], [0.14, 0.055, 0.1]));
  } else if (profile.hairStyle === 'fade') {
    top.scale.set(0.305, 0.305, 0.3);
    noShadow(mesh(GEO.sphere, hair, head, [0, 0.19, -0.13], [0.19, 0.07, 0.13]));
  } else if (profile.hairStyle === 'short') {
    noShadow(mesh(GEO.sphere, hair, head, [0, 0.205, -0.145], [0.18, 0.085, 0.14]));
    noShadow(mesh(GEO.sphere, hair, head, [0.055, 0.22, -0.05], [0.12, 0.075, 0.12]));
  } else if (profile.hairStyle === 'swoop') {
    noShadow(mesh(GEO.sphere, hair, head, [-0.03, 0.215, -0.145], [0.185, 0.095, 0.13]));
    noShadow(mesh(GEO.sphere, hair, head, [0.09, 0.25, -0.02], [0.11, 0.065, 0.11]));
    noShadow(mesh(GEO.sphere, hair, head, [-0.08, 0.255, 0.01], [0.075, 0.05, 0.08]));
  } else if (profile.hairStyle === 'curls') {
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI * 0.8 + (i / 6) * Math.PI * 1.6;
      noShadow(
        mesh(
          GEO.smallSphere,
          hair,
          head,
          [Math.cos(a) * 0.19, 0.235 + (i % 2) * 0.025, -0.08 + Math.sin(a) * 0.13],
          [0.085, 0.075, 0.085]
        )
      );
    }
  }
}

function addHeadband(head, material, profile) {
  const band = mesh(GEO.headband, material, head, [0, 0.082, 0]);
  band.material.side = THREE.DoubleSide;
  band.castShadow = false;
  noShadow(band);
}

function buildAthlete(profile) {
  const group = new THREE.Group();
  group.name = profile.id;
  const tilt = new THREE.Group();
  const bob = new THREE.Group();
  group.add(tilt);
  tilt.add(bob);

  const upper = new THREE.Group();
  upper.position.y = 0.92;
  bob.add(upper);

  const materials = {
    skin: standard(profile.skin, { roughness: 0.69 }),
    skinShade: standard(shade(profile.skin, 0.84), { roughness: 0.72 }),
    hair: standard(profile.hair, { roughness: 0.78 }),
    top: standard(profile.kit.top, { roughness: 0.73 }),
    trim: standard(profile.kit.trim, { roughness: 0.68 }),
    shorts: standard(profile.kit.shorts, { roughness: 0.78 }),
    shoe: standard(profile.kit.shoe, { roughness: 0.48 }),
    sole: standard(profile.kit.sole, { roughness: 0.9 }),
    sock: standard(profile.kit.sock, { roughness: 0.8 }),
    eyeWhite: standard(0xfff8ec, { roughness: 0.36, emissive: 0x5c3d32, emissiveIntensity: 0.012 }),
    eye: standard(0x2b1d26, { roughness: 0.3 }),
    glint: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    mouth: standard(0x743542, { roughness: 0.5 }),
    tongue: standard(0xff91a3, { roughness: 0.6 }),
    nose: standard(shade(profile.skin, 0.8), { roughness: 0.7 }),
    blush: standard(0xff8c9d, { roughness: 1, transparent: true, opacity: profile.isPlayer ? 0.65 : 0.36 }),
    shadow: new THREE.MeshBasicMaterial({
      map: blobShadowTexture(128),
      color: 0x3a2029,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  };

  const shadow = new THREE.Mesh(GEO.shadow, materials.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.renderOrder = 2;
  group.add(shadow);

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.92;
  bob.add(pelvis);
  mesh(GEO.sphere, materials.shorts, pelvis, [0, 0, 0], [0.31, 0.17, 0.235]);

  const t = mesh(GEO.torso, materials.top, upper, [0, 0.32, 0]);
  t.scale.z = 0.72;
  t.castShadow = true;
  const chest = mesh(GEO.sphere, materials.top, upper, [0, 0.535, 0], [0.395, 0.235, 0.235]);
  chest.castShadow = true;

  const waist = mesh(GEO.waist, materials.trim, upper, [0, 0.075, 0], null, [Math.PI / 2, 0, 0]);
  noShadow(waist);
  const collar = mesh(GEO.collar, materials.trim, upper, [0, 0.61, 0], null, [Math.PI / 2, 0, 0]);
  noShadow(collar);

  for (const side of [-1, 1]) {
    noShadow(mesh(GEO.stripe, materials.trim, upper, [side * 0.328, 0.31, 0]));
  }

  const bibMaterial = standard(0xffffff, {
    roughness: 0.83,
    map: makeBibTexture(profile),
    transparent: true,
    alphaTest: 0.05,
  });
  bibMaterial.emissiveIntensity = 0;

  const backBib = mesh(GEO.bibBack, bibMaterial, upper, [0, 0.38, 0.272]);
  noShadow(backBib);
  const frontBib = mesh(GEO.bibFront, bibMaterial, upper, [0, 0.42, -0.272], null, [0, Math.PI, 0]);
  noShadow(frontBib);

  noShadow(mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.17, 12), materials.skin, upper, [0, 0.66, 0]));

  const head = new THREE.Group();
  head.position.set(0, 0.98, -0.012);
  upper.add(head);
  const headMesh = mesh(GEO.sphere, materials.skin, head, [0, 0, 0], [0.3, 0.335, 0.3]);
  headMesh.castShadow = true;

  for (const side of [-1, 1]) {
    noShadow(mesh(GEO.ear, materials.skinShade, head, [side * 0.293, 0.0, 0.005], [0.055, 0.085, 0.045]));
  }

  const face = buildFace(head, materials, profile);
  addHair(head, materials, profile);

  if (profile.headband !== null) {
    const bandMaterial = standard(profile.headband, { roughness: 0.68 });
    addHeadband(head, bandMaterial, profile);
  }

  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.395, 0.52, 0);
    upper.add(shoulder);

    const sleeve = mesh(GEO.sphere, materials.top, shoulder, [0, -0.01, 0], [0.12, 0.135, 0.12]);
    sleeve.castShadow = true;
    const upperArm = mesh(GEO.armUpper, materials.skin, shoulder, [0, -0.16, 0]);
    upperArm.castShadow = true;

    const elbow = new THREE.Group();
    elbow.position.y = -0.31;
    shoulder.add(elbow);
    const forearm = mesh(GEO.armLower, materials.skin, elbow, [0, -0.145, 0]);
    forearm.castShadow = true;
    noShadow(mesh(GEO.wrist, materials.trim, elbow, [0, -0.26, 0]));
    const hand = mesh(GEO.sphere, materials.skin, elbow, [0, -0.315, 0], [0.074, 0.088, 0.075]);
    hand.castShadow = true;

    return { shoulder, elbow, hand };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.17, 0.92, 0);
    bob.add(hip);

    const shortLeg = mesh(GEO.sphere, materials.shorts, hip, [0, -0.06, 0], [0.168, 0.13, 0.185]);
    shortLeg.castShadow = true;
    const thigh = mesh(GEO.thigh, materials.skin, hip, [0, -0.245, 0]);
    thigh.castShadow = true;

    const knee = new THREE.Group();
    knee.position.y = -0.43;
    hip.add(knee);
    const shin = mesh(GEO.shin, materials.skin, knee, [0, -0.17, 0]);
    shin.castShadow = true;
    noShadow(mesh(GEO.sock, materials.sock, knee, [0, -0.305, 0]));

    const foot = new THREE.Group();
    foot.position.y = -0.355;
    knee.add(foot);
    const shoe = mesh(GEO.shoe, materials.shoe, foot, [0, -0.02, -0.07], [0.155, 0.088, 0.285], [0.03, 0, 0]);
    shoe.castShadow = true;
    const sole = mesh(GEO.shoe, materials.sole, foot, [0, -0.098, -0.072], [0.168, 0.033, 0.292], [0.03, 0, 0]);
    sole.castShadow = true;
    noShadow(mesh(GEO.sphere, materials.trim, foot, [0, 0.045, -0.12], [0.12, 0.014, 0.1]));

    return { hip, knee, foot, shoe };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  group.scale.set(profile.build, profile.height, profile.build);

  const rig = {
    profile,
    group,
    tilt,
    bob,
    upper,
    head,
    face,
    materials,
    shadow,
    armL,
    armR,
    legL,
    legR,
    baseUpperY: 0.92,
    baseHeadY: 0.98,
  };
  return rig;
}

function resetRigPose(rig) {
  rig.tilt.rotation.set(0, 0, 0);
  rig.bob.position.set(0, 0, 0);
  rig.bob.rotation.set(0, 0, 0);
  rig.bob.scale.set(1, 1, 1);
  rig.upper.position.set(0, rig.baseUpperY, 0);
  rig.upper.rotation.set(0, 0, 0);
  rig.head.position.set(0, rig.baseHeadY, -0.012);
  rig.head.rotation.set(0, 0, 0);

  rig.armL.shoulder.rotation.set(0, 0, -0.12);
  rig.armR.shoulder.rotation.set(0, 0, 0.12);
  rig.armL.elbow.rotation.set(0.14, 0, 0);
  rig.armR.elbow.rotation.set(0.14, 0, 0);

  for (const leg of [rig.legL, rig.legR]) {
    leg.hip.rotation.set(0, 0, 0);
    leg.knee.rotation.set(0, 0, 0);
    leg.foot.rotation.set(0, 0, 0);
  }

  rig.shadow.scale.set(1, 1, 1);
  rig.shadow.material.opacity = 0.24;
}

function setFaceExpression(rig, expression) {
  const normalVisible = expression === 'normal' || expression === 'focused';
  const happy = expression === 'happy';
  const dizzy = expression === 'dizzy';
  rig.face.normalEyes.forEach((eye) => {
    eye.visible = normalVisible;
  });
  rig.face.brows.forEach((brow) => {
    brow.visible = normalVisible;
  });
  rig.face.happyEyes.visible = happy;
  rig.face.dizzyEyes.visible = dizzy;
  rig.face.mouthNormal.visible = expression === 'normal';
  rig.face.mouthFocused.visible = expression === 'focused';
  rig.face.mouthOpen.visible = happy || dizzy;

  if (normalVisible) {
    const focused = expression === 'focused';
    rig.face.brows[0].rotation.z = focused ? -0.18 : -0.03;
    rig.face.brows[1].rotation.z = focused ? 0.18 : 0.03;
  }
}

function updateBlink(rig, state, dt, expression) {
  const normalVisible = expression === 'normal' || expression === 'focused';
  state.blinkTimer -= dt;
  if (state.blinkTime > 0) {
    state.blinkTime -= dt;
  } else if (normalVisible && state.blinkTimer <= 0) {
    state.blinkTime = 0.11;
    state.blinkTimer = 2.4 + Math.random() * 2.8;
  }
  const closed = state.blinkTime > 0;
  rig.face.normalEyes.forEach((eye) => {
    eye.scale.y = closed ? 0.14 : 1;
  });
}

function poseIdle(rig, time, profile, signature) {
  resetRigPose(rig);
  const breathe = Math.sin(time * 2.1) * 0.009;
  rig.bob.position.y = breathe;
  rig.upper.rotation.z = Math.sin(time * 0.9) * 0.012;
  rig.upper.rotation.x = -0.015 + Math.sin(time * 1.3) * 0.008;
  rig.head.rotation.x = 0.01;
  rig.head.rotation.y = Math.sin(time * 0.7) * 0.08;
  rig.head.rotation.z = Math.sin(time * 0.55) * 0.018;

  rig.legL.hip.rotation.z = 0.045;
  rig.legR.hip.rotation.z = -0.045;
  rig.legL.knee.rotation.x = -0.04;
  rig.legR.knee.rotation.x = -0.06;

  rig.armL.shoulder.rotation.set(0.02, 0, -0.16 + Math.sin(time * 1.45) * 0.012);
  rig.armR.shoulder.rotation.set(0.02, 0, 0.16 - Math.sin(time * 1.45) * 0.012);
  rig.armL.elbow.rotation.x = 0.16;
  rig.armR.elbow.rotation.x = 0.16;

  if (profile.isPlayer) {
    rig.armR.shoulder.rotation.set(-0.2, 0, 2.4 + Math.sin(time * 3.4) * 0.12);
    rig.armR.elbow.rotation.set(0.28, 0, 0);
    rig.head.rotation.y = -0.12 + Math.sin(time * 0.8) * 0.06;
    rig.head.rotation.z = 0.035;
  } else if (signature) {
    applySignature(rig, time, profile.signature, 0.75, false);
  }
}

function poseReady(rig, time, profile, bounce, goBurst) {
  resetRigPose(rig);
  const c = 1;
  rig.bob.position.y = -0.06 + bounce * 0.025 + goBurst * 0.04;
  rig.upper.rotation.x = 0.05 + Math.sin(time * 4.6) * 0.006;
  rig.upper.rotation.z = Math.sin(time * 3.9) * 0.008;
  rig.head.rotation.x = -0.035;
  rig.head.rotation.y = 0;

  for (const leg of [rig.legL, rig.legR]) {
    leg.hip.rotation.x = 0.2 * c;
    leg.hip.rotation.z = (leg === rig.legL ? 1 : -1) * 0.05;
    leg.knee.rotation.x = -0.48 * c;
    leg.foot.rotation.x = 0.18;
  }

  rig.armL.shoulder.rotation.set(-0.32, 0, -0.24);
  rig.armR.shoulder.rotation.set(-0.32, 0, 0.24);
  rig.armL.elbow.rotation.x = 0.55;
  rig.armR.elbow.rotation.x = 0.55;
}

function poseRun(rig, phase, intensity, style, stepPulse, stepDir) {
  resetRigPose(rig);
  const eff = clamp(intensity, 0, 1);
  const swing = Math.sin(phase);
  const swingB = Math.sin(phase + Math.PI);
  const strideAmp = (0.45 + eff * 0.52) * style.stride;
  const kneeBend = 0.32 + eff * 0.9;
  const armAmp = (0.38 + eff * 0.52) * style.arm;

  rig.bob.position.y = Math.abs(Math.sin(phase)) * (0.045 + style.bounce * eff) + stepPulse * 0.025;
  rig.bob.rotation.z = Math.sin(phase) * 0.025 * eff + stepDir * stepPulse * 0.03;
  rig.upper.rotation.x = -(0.07 + style.lean * (0.45 + eff * 0.55)) - Math.sin(phase * 2) * 0.012 * eff;
  rig.upper.rotation.z = Math.sin(phase) * 0.017 * eff;
  rig.head.rotation.x = 0.06 + eff * 0.07 + Math.sin(phase * 2) * 0.012 * eff;
  rig.head.rotation.y = 0;
  rig.head.rotation.z = Math.sin(phase) * 0.02 * eff;

  rig.legL.hip.rotation.x = swing * strideAmp;
  rig.legR.hip.rotation.x = swingB * strideAmp;
  rig.legL.hip.rotation.z = 0.06;
  rig.legR.hip.rotation.z = -0.06;
  rig.legL.knee.rotation.x = -0.1 - Math.max(0, Math.sin(phase + 0.82)) * kneeBend;
  rig.legR.knee.rotation.x = -0.1 - Math.max(0, Math.sin(phase + Math.PI + 0.82)) * kneeBend;
  rig.legL.foot.rotation.x = 0.1 - rig.legL.knee.rotation.x * 0.35;
  rig.legR.foot.rotation.x = 0.1 - rig.legR.knee.rotation.x * 0.35;

  rig.armL.shoulder.rotation.x = -swing * armAmp;
  rig.armR.shoulder.rotation.x = swing * armAmp;
  rig.armL.shoulder.rotation.z = -0.2 - eff * 0.1;
  rig.armR.shoulder.rotation.z = 0.2 + eff * 0.1;
  rig.armL.elbow.rotation.x = 0.58 + eff * 0.62;
  rig.armR.elbow.rotation.x = 0.58 + eff * 0.62;
  rig.armL.elbow.rotation.z = 0;
  rig.armR.elbow.rotation.z = 0;

  rig.shadow.scale.set(1.08, 1.05, 1);
  rig.shadow.material.opacity = 0.22;
}

function poseLunge(rig, time, lungeT) {
  resetRigPose(rig);
  const push = smoothstep(clamp(lungeT / 0.24, 0, 1));
  const flutter = Math.sin(time * 18) * 0.02;
  rig.tilt.rotation.x = -0.22 - push * 0.3;
  rig.bob.position.y = 0.05 + Math.sin(clamp(lungeT, 0, 1) * Math.PI) * 0.08;
  rig.upper.rotation.x = -0.26 - push * 0.24;
  rig.upper.rotation.z = flutter;
  rig.head.rotation.x = 0.34 + push * 0.12;
  rig.head.rotation.z = -flutter * 0.6;

  rig.armL.shoulder.rotation.set(1.46, 0, -0.18);
  rig.armR.shoulder.rotation.set(1.46, 0, 0.18);
  rig.armL.elbow.rotation.x = 0.1;
  rig.armR.elbow.rotation.x = 0.1;

  rig.legL.hip.rotation.x = -0.55 - push * 0.15;
  rig.legR.hip.rotation.x = -0.18;
  rig.legL.hip.rotation.z = 0.13;
  rig.legR.hip.rotation.z = -0.1;
  rig.legL.knee.rotation.x = -0.42;
  rig.legR.knee.rotation.x = -0.24;
  rig.legL.foot.rotation.x = 0.35;
  rig.legR.foot.rotation.x = 0.22;

  rig.shadow.scale.set(0.95, 0.85, 1);
  rig.shadow.material.opacity = 0.15;
}

function poseFall(rig, fallT) {
  resetRigPose(rig);
  const impact = clamp(fallT / 0.34, 0, 1);
  let angle = 0;
  if (fallT < 0.34) {
    angle = -1.28 * easeInCubic(impact);
  } else if (fallT < 1.0) {
    angle = -1.28 + Math.sin((fallT - 0.34) * 9) * 0.018;
  } else {
    const recover = easeOutCubic(clamp((fallT - 1.0) / (FALL_DURATION - 1.0), 0, 1));
    angle = -1.28 * (1 - recover);
  }
  rig.tilt.rotation.x = angle;
  rig.tilt.rotation.z = Math.sin(fallT * 2.4) * 0.035 * (fallT < 1.0 ? 1 : 0.35);
  rig.bob.position.y = 0.045;
  rig.upper.rotation.x = -0.12;

  const kick = Math.sin(fallT * 15) * 0.25;
  rig.legL.hip.rotation.x = 0.25 + kick;
  rig.legR.hip.rotation.x = 0.08 - kick;
  rig.legL.hip.rotation.z = 0.22;
  rig.legR.hip.rotation.z = -0.2;
  rig.legL.knee.rotation.x = -0.45;
  rig.legR.knee.rotation.x = -0.32;

  rig.armL.shoulder.rotation.set(0.95, 0, -0.95);
  rig.armR.shoulder.rotation.set(0.8, 0, 0.8);
  rig.armL.elbow.rotation.x = 0.1;
  rig.armR.elbow.rotation.x = 0.1;
  rig.head.rotation.x = 0.2 + Math.sin(fallT * 10) * 0.03;
  rig.head.rotation.z = Math.sin(fallT * 7) * 0.05;
}

function applySignature(rig, time, signature, amount, jump) {
  const pulse = Math.sin(time * 2.8);
  const sideSway = Math.sin(time * 1.6);
  const lift = jump ? Math.abs(Math.sin(time * 4.3)) * 0.12 : 0;
  rig.bob.position.y += lift;
  rig.upper.rotation.z += sideSway * 0.035 * amount;

  switch (signature) {
    case 'bolt':
      rig.armR.shoulder.rotation.set(-0.16, 0, 2.72 + pulse * 0.05);
      rig.armR.elbow.rotation.x = 0.16;
      rig.armL.shoulder.rotation.set(0.16, 0, -1.14);
      rig.armL.elbow.rotation.x = 0.7;
      rig.head.rotation.x -= 0.12;
      rig.head.rotation.z = 0.06;
      break;
    case 'beast':
      rig.upper.rotation.x += 0.03;
      rig.armL.shoulder.rotation.set(0.35, 0, -1.52);
      rig.armR.shoulder.rotation.set(0.35, 0, 1.52);
      rig.armL.elbow.rotation.z = -1.35;
      rig.armR.elbow.rotation.z = 1.35;
      rig.armL.elbow.rotation.x = 0.1;
      rig.armR.elbow.rotation.x = 0.1;
      rig.head.rotation.x += 0.06;
      rig.head.rotation.z = Math.sin(time * 4.1) * 0.045;
      break;
    case 'sky':
      rig.armL.shoulder.rotation.set(-0.1, 0, -2.76 - pulse * 0.04);
      rig.armR.shoulder.rotation.set(-0.1, 0, 2.76 + pulse * 0.04);
      rig.armL.elbow.rotation.x = 0.12;
      rig.armR.elbow.rotation.x = 0.12;
      rig.head.rotation.x -= 0.14;
      break;
    case 'flex':
      rig.armL.shoulder.rotation.set(0.12, 0, -1.55);
      rig.armR.shoulder.rotation.set(0.12, 0, 1.55);
      rig.armL.elbow.rotation.z = -1.4;
      rig.armR.elbow.rotation.z = 1.4;
      rig.armL.elbow.rotation.x = 0.15;
      rig.armR.elbow.rotation.x = 0.15;
      rig.upper.rotation.x -= 0.02;
      rig.head.rotation.x -= 0.06;
      break;
    case 'salute':
      rig.armR.shoulder.rotation.set(-0.1, 0, 2.62 + pulse * 0.04);
      rig.armR.elbow.rotation.x = 0.2;
      rig.armL.shoulder.rotation.set(0.3, 0, -1.55);
      rig.armL.elbow.rotation.x = 1.7;
      rig.head.rotation.x -= 0.1;
      rig.head.rotation.z = 0.06;
      break;
    case 'spread':
      rig.armL.shoulder.rotation.set(-0.13, 0, -1.4);
      rig.armR.shoulder.rotation.set(-0.13, 0, 1.4);
      rig.armL.elbow.rotation.x = 0.24;
      rig.armR.elbow.rotation.x = 0.24;
      rig.head.rotation.x -= 0.06;
      break;
    case 'dance':
      rig.armR.shoulder.rotation.set(-0.2, 0, 2.6 + pulse * 0.08);
      rig.armR.elbow.rotation.x = 0.3;
      rig.armL.shoulder.rotation.set(0.12, 0, -1.45 - pulse * 0.08);
      rig.armL.elbow.rotation.x = 1.0;
      rig.legL.hip.rotation.z = 0.1 + sideSway * 0.04;
      rig.legR.hip.rotation.z = -0.1 + sideSway * 0.04;
      rig.head.rotation.z = sideSway * 0.08;
      break;
    case 'player':
    default:
      rig.armL.shoulder.rotation.set(-0.12, 0, -2.62 - pulse * 0.05);
      rig.armR.shoulder.rotation.set(-0.12, 0, 2.62 + pulse * 0.05);
      rig.armL.elbow.rotation.x = 0.2;
      rig.armR.elbow.rotation.x = 0.2;
      rig.head.rotation.x -= 0.12;
      break;
  }
  rig.upper.rotation.z *= amount;
}

function poseCelebrate(rig, time, profile) {
  resetRigPose(rig);
  const hop = Math.abs(Math.sin(time * 4.4));
  rig.bob.position.y = hop * (profile.isPlayer ? 0.16 : 0.09);
  rig.upper.rotation.x = -0.02;
  rig.upper.rotation.z = Math.sin(time * 2.1) * 0.03;
  rig.legL.hip.rotation.x = Math.sin(time * 4.4) * 0.25;
  rig.legR.hip.rotation.x = -Math.sin(time * 4.4) * 0.25;
  rig.legL.knee.rotation.x = -0.16;
  rig.legR.knee.rotation.x = -0.16;
  rig.head.rotation.x = -0.02 + Math.sin(time * 4.4) * 0.03;
  rig.head.rotation.y = Math.sin(time * 1.5) * 0.08;
  applySignature(rig, time, profile.signature, 1, true);
  rig.shadow.scale.set(1.15, 1.18, 1);
  rig.shadow.material.opacity = 0.18;
}

export function createRunner() {
  const rig = buildAthlete(PLAYER_PROFILE);
  const state = {
    time: 0,
    mode: 'menu',
    runPhase: 0,
    stepPulse: 0,
    stepDir: 1,
    readyBounce: 0,
    goBurst: 0,
    finishT: 0,
    expression: 'normal',
    blinkTimer: 2.4,
    blinkTime: 0,
    fallTime: 0,
  };

  function reset() {
    resetRigPose(rig);
    state.time = 0;
    state.mode = 'menu';
    state.runPhase = 0;
    state.stepPulse = 0;
    state.stepDir = 1;
    state.readyBounce = 0;
    state.goBurst = 0;
    state.finishT = 0;
    state.fallTime = 0;
    state.expression = 'normal';
    state.blinkTimer = 2.5;
    state.blinkTime = 0;
    setFaceExpression(rig, 'normal');
  }

  function onStep(side, first = false) {
    state.stepPulse = 1;
    state.stepDir = side === 'left' ? 1 : -1;
    if (first) state.runPhase = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  }

  function onCountdownTick() {
    state.readyBounce = 1;
  }

  function onGo() {
    state.goBurst = 1;
  }

  function setMode(mode) {
    state.mode = mode;
  }

  function update(dt, elapsedTime, params = {}) {
    state.time += dt;
    const mode = params.mode || 'running';
    const speed = params.speed || 0;
    const speedNorm = clamp((speed - 1.1) / 9.4, 0, 1);
    const fallT = params.fallTime || 0;
    const isCountdown = mode === 'countdown';
    const isMenu = mode === 'menu';
    const isRunning = mode === 'running';
    const isLunging = mode === 'lunging';
    const isFalling = mode === 'falling';
    const isFinished = mode === 'finished';

    state.stepPulse *= Math.exp(-8.5 * dt);
    state.readyBounce *= Math.exp(-7 * dt);
    state.goBurst *= Math.exp(-6.5 * dt);
    state.mode = mode;

    if (isMenu) {
      poseIdle(rig, state.time, PLAYER_PROFILE, false);
    } else if (isCountdown) {
      poseReady(rig, state.time, PLAYER_PROFILE, state.readyBounce, state.goBurst);
    } else if (isLunging) {
      poseLunge(rig, state.time, params.lungeT || 0);
    } else if (isRunning) {
      const moving = smoothstep(clamp(speed / 2.2, 0, 1));
      state.runPhase += dt * (2.2 + speed * 1.7) * moving;
      poseRun(rig, state.runPhase, speedNorm, PLAYER_PROFILE.style, state.stepPulse, state.stepDir);
      // A happy little arm flourish when the player is flying.
      if (speedNorm > 0.58) {
        rig.upper.rotation.x -= 0.015;
      }
    } else if (isFalling) {
      state.fallTime = fallT;
      poseFall(rig, fallT);
    } else if (isFinished) {
      state.finishT += dt;
      poseCelebrate(rig, state.finishT, PLAYER_PROFILE);
    } else {
      poseIdle(rig, state.time, PLAYER_PROFILE, false);
    }

    let expression = 'normal';
    if (isFalling) expression = 'dizzy';
    else if (isLunging) expression = 'focused';
    else if (isFinished) expression = 'happy';
    else if (isRunning) expression = 'focused';
    else if (isCountdown) expression = 'focused';
    if (expression !== state.expression) {
      setFaceExpression(rig, expression);
      state.expression = expression;
    }
    updateBlink(rig, state, dt, expression);
  }

  function getFootWorldPosition(side, target = new THREE.Vector3()) {
    const leg = side === 'left' ? rig.legL : rig.legR;
    leg.shoe.getWorldPosition(target);
    target.y = 0.05;
    return target;
  }

  function getHeadWorldPosition(target = new THREE.Vector3()) {
    rig.head.getWorldPosition(target);
    return target;
  }

  function getDizzyAnchor(target = new THREE.Vector3()) {
    getHeadWorldPosition(target);
    target.y += 0.7;
    target.z -= 0.1;
    return target;
  }

  reset();

  return {
    group: rig.group,
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
    rig,
  };
}

export function createOpponent(profile) {
  const rig = buildAthlete(profile);
  rig.group.traverse((child) => {
    if (child.isMesh) child.castShadow = false;
  });
  const state = {
    time: 0,
    mode: 'menu',
    runPhase: profile.lane * 0.7,
    finishT: 0,
    blinkTimer: 1.6 + Math.random() * 2,
    blinkTime: 0,
    expression: 'normal',
  };

  function reset() {
    resetRigPose(rig);
    state.time = Math.random() * 4;
    state.mode = 'menu';
    state.runPhase = profile.lane * 0.7;
    state.finishT = 0;
    state.expression = 'normal';
    state.blinkTimer = 1.6 + Math.random() * 2;
    state.blinkTime = 0;
    setFaceExpression(rig, 'normal');
  }

  function update(dt, elapsedTime, params = {}) {
    state.time += dt;
    const mode = params.mode || 'menu';
    const speedNorm = clamp(params.speedNorm || 0, 0, 1);
    state.mode = mode;

    if (mode === 'running') {
      state.runPhase += dt * (5.6 + speedNorm * 10.2) * profile.style.stride;
      poseRun(rig, state.runPhase, speedNorm, profile.style, 0, 1);
    } else if (mode === 'finished') {
      state.finishT += dt;
      poseCelebrate(rig, state.finishT, profile);
    } else if (mode === 'countdown') {
      poseReady(rig, state.time, profile, params.bounce || 0, 0);
    } else {
      poseIdle(rig, state.time, profile, true);
    }

    let expression = 'normal';
    if (mode === 'running') expression = 'focused';
    else if (mode === 'finished') expression = 'happy';
    else if (mode === 'countdown') expression = 'focused';
    if (expression !== state.expression) {
      setFaceExpression(rig, expression);
      state.expression = expression;
    }
    updateBlink(rig, state, dt, expression);
  }

  reset();

  return {
    group: rig.group,
    profile,
    update,
    reset,
    rig,
  };
}
