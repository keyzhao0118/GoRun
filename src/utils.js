import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, value) => clamp((value - a) / (b - a), 0, 1);
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInCubic = (t) => Math.pow(clamp(t, 0, 1), 3);
export const easeInOutCubic = (t) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (t, overshoot = 1.70158) => {
  const x = clamp(t, 0, 1) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
};
export const easeOutElastic = (t) => {
  const x = clamp(t, 0, 1);
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3)) + 1;
};

/** Frame-rate independent smoothing. */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * Math.max(0, dt)));

export const dampVec3 = (current, target, lambda, dt) =>
  current.lerp(target, 1 - Math.exp(-lambda * Math.max(0, dt)));

export function createRng(seed = 20241109) {
  let state = seed >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function canvasTexture(width, height, draw, options = {}) {
  const { canvas, ctx } = makeCanvas(width, height);
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = options.anisotropy ?? 8;
  if (options.wrapS) texture.wrapS = options.wrapS;
  if (options.wrapT) texture.wrapT = options.wrapT;
  if (options.repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(options.repeat[0], options.repeat[1]);
  }
  texture.needsUpdate = true;
  return texture;
}

export function softCircleTexture(size = 128, hardness = 0.16) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.02, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(hardness, 'rgba(255,255,255,.95)');
    g.addColorStop(0.48, 'rgba(255,255,255,.42)');
    g.addColorStop(0.78, 'rgba(255,255,255,.09)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function starTexture(size = 128) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.translate(cx, cy);
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, w * 0.5);
    glow.addColorStop(0, 'rgba(255,255,255,.9)');
    glow.addColorStop(0.35, 'rgba(255,255,255,.35)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    const points = 5;
    const outer = w * 0.34;
    const inner = outer * 0.44;
    for (let i = 0; i < points * 2; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / points;
      const radius = i % 2 === 0 ? outer : inner;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
}

export function blobShadowTexture(size = 128) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(31,18,25,.65)');
    g.addColorStop(0.46, 'rgba(31,18,25,.34)');
    g.addColorStop(1, 'rgba(31,18,25,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function petalTexture(size = 128) {
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.45);
    const g = ctx.createLinearGradient(-w * 0.2, -h * 0.3, w * 0.2, h * 0.3);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.32, 'rgba(255,255,255,.7)');
    g.addColorStop(0.7, 'rgba(255,255,255,.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.19, h * 0.075, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.13, h * 0.035, w * 0.12, h * 0.055, 0.35, 0, TAU);
    ctx.fill();
  });
}

export function createStarGeometry(outer = 0.16, inner = 0.068, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const radius = i % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function createHeartGeometry(size = 0.1) {
  const shape = new THREE.Shape();
  const s = size;
  shape.moveTo(0, -0.55 * s);
  shape.bezierCurveTo(-0.15 * s, -0.35 * s, -0.8 * s, 0.05 * s, -0.5 * s, 0.38 * s);
  shape.bezierCurveTo(-0.28 * s, 0.62 * s, 0, 0.38 * s, 0, 0.2 * s);
  shape.bezierCurveTo(0, 0.38 * s, 0.28 * s, 0.62 * s, 0.5 * s, 0.38 * s);
  shape.bezierCurveTo(0.8 * s, 0.05 * s, 0.15 * s, -0.35 * s, 0, -0.55 * s);
  return new THREE.ShapeGeometry(shape, 10);
}

export function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}
