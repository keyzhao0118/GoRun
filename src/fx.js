import * as THREE from 'three';
import { TAU, clamp, starTexture, softCircleTexture, createRng } from './utils.js';

export function createFX(scene) {
  const rng = createRng(78123);
  const dustTexture = softCircleTexture(96, 0.1);
  const sparkleTexture = starTexture(96);
  const dust = [];
  const sparkles = [];
  const starAnchor = new THREE.Group();
  const starSprites = [];
  let dizzyTime = 0;
  let dizzyStrength = 0;

  // Pooled footstep dust puffs.
  for (let i = 0; i < 28; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: dustTexture,
      color: i % 4 === 0 ? 0xffd9c4 : 0xfff7ea,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.setScalar(0.2);
    scene.add(sprite);
    dust.push({
      sprite,
      life: 0,
      maxLife: 0.55,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 0.2,
      growth: 1.4,
    });
  }

  // Pooled star sparkles.
  for (let i = 0; i < 18; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: sparkleTexture,
      color: 0xffe5a0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    scene.add(sprite);
    sparkles.push({
      sprite,
      life: 0,
      maxLife: 0.5,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 0.16,
    });
  }

  // Three dizzy stars orbiting the bunny's head after a tumble.
  starAnchor.visible = false;
  scene.add(starAnchor);
  for (let i = 0; i < 3; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: sparkleTexture,
      color: [0xffd36e, 0xff9aaa, 0x8ce6d0][i],
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const star = new THREE.Sprite(material);
    star.scale.setScalar(0.32 - i * 0.03);
    star.renderOrder = 20;
    starAnchor.add(star);
    starSprites.push(star);
  }

  // Confetti: one instanced draw, lots of tiny rectangles.
  const confettiCount = 220;
  const confettiGeo = new THREE.PlaneGeometry(0.085, 0.14);
  const confettiMat = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
    opacity: 0.96,
  });
  const confetti = new THREE.InstancedMesh(confettiGeo, confettiMat, confettiCount);
  confetti.frustumCulled = false;
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(confetti);
  const confettiData = [];
  const confettiColors = [
    0xff7587, 0xffd36e, 0x7bdcc7, 0x9ccfff, 0xc7b3ff, 0xfff3e2, 0xff9d7c,
  ];
  const dummy = new THREE.Object3D();
  const tempColor = new THREE.Color();
  for (let i = 0; i < confettiCount; i += 1) {
    confetti.setColorAt(i, tempColor.set(confettiColors[i % confettiColors.length]));
    dummy.position.set(0, -100, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    confetti.setMatrixAt(i, dummy.matrix);
    confettiData.push({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      spinX: 0,
      spinY: 0,
      spinZ: 0,
      size: 1,
      life: 0,
      flutter: 0,
    });
  }
  if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
  confetti.instanceMatrix.needsUpdate = true;

  function spawnDust(position, amount = 3, power = 1) {
    for (let i = 0; i < amount; i += 1) {
      const puff = dust.find((d) => d.life <= 0);
      if (!puff) break;
      puff.life = puff.maxLife * (0.7 + rng() * 0.55);
      puff.maxLife = Math.max(puff.life, 0.35);
      puff.sprite.visible = true;
      puff.sprite.position.set(
        position.x + (rng() - 0.5) * 0.34,
        0.06 + rng() * 0.1,
        position.z + (rng() - 0.5) * 0.34
      );
      puff.vx = (rng() - 0.5) * 0.45 * power;
      puff.vy = 0.2 + rng() * 0.36 * power;
      puff.vz = (rng() - 0.5) * 0.4 * power + 0.12;
      puff.size = (0.12 + rng() * 0.17) * (0.8 + power * 0.35);
      puff.growth = 1.2 + rng() * 1.1;
      puff.sprite.scale.setScalar(puff.size);
      puff.sprite.material.opacity = 0.3 + rng() * 0.16;
    }
  }

  function spawnSparkle(position, amount = 7, spread = 0.8) {
    for (let i = 0; i < amount; i += 1) {
      const sparkle = sparkles.find((s) => s.life <= 0);
      if (!sparkle) break;
      sparkle.life = 0.32 + rng() * 0.26;
      sparkle.maxLife = Math.max(0.28, sparkle.life);
      sparkle.sprite.visible = true;
      sparkle.sprite.position.set(
        position.x + (rng() - 0.5) * spread,
        position.y + (rng() - 0.25) * spread * 0.6,
        position.z + (rng() - 0.5) * spread
      );
      sparkle.vx = (rng() - 0.5) * 0.9;
      sparkle.vy = 0.22 + rng() * 0.55;
      sparkle.vz = (rng() - 0.5) * 0.9;
      sparkle.size = (0.06 + rng() * 0.09) * (0.8 + spread * 0.4);
      sparkle.sprite.scale.setScalar(sparkle.size);
      sparkle.sprite.material.opacity = 0.9;
      sparkle.sprite.material.rotation = rng() * TAU;
    }
  }

  function burstConfetti(center) {
    for (const particle of confettiData) {
      particle.active = true;
      particle.x = center.x + (rng() - 0.5) * 11;
      particle.y = 3.4 + rng() * 7.5;
      particle.z = center.z + (rng() - 0.5) * 10;
      particle.vx = (rng() - 0.5) * 2.2;
      particle.vy = -0.7 - rng() * 1.7;
      particle.vz = (rng() - 0.5) * 1.6;
      particle.rx = rng() * TAU;
      particle.ry = rng() * TAU;
      particle.rz = rng() * TAU;
      particle.spinX = (rng() - 0.5) * 7;
      particle.spinY = (rng() - 0.5) * 7;
      particle.spinZ = (rng() - 0.5) * 7;
      particle.size = 0.9 + rng() * 1.5;
      particle.life = 6 + rng() * 3;
      particle.flutter = rng() * TAU;
    }
    tempColor.set(0xffffff);
  }

  function showDizzy(anchor, strength = 1) {
    starAnchor.visible = true;
    starAnchor.position.copy(anchor);
    dizzyStrength = strength;
  }

  function hideDizzy() {
    starAnchor.visible = false;
    dizzyStrength = 0;
    dizzyTime = 0;
  }

  function update(dt) {
    for (const puff of dust) {
      if (puff.life <= 0) continue;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.sprite.visible = false;
        puff.sprite.material.opacity = 0;
        continue;
      }
      const t = 1 - puff.life / puff.maxLife;
      puff.sprite.position.x += puff.vx * dt;
      puff.sprite.position.y += puff.vy * dt;
      puff.sprite.position.z += puff.vz * dt;
      puff.vy -= dt * 0.12;
      puff.vx *= 1 - dt * 1.4;
      puff.vz *= 1 - dt * 1.4;
      puff.sprite.scale.setScalar(puff.size * (1 + t * puff.growth));
      puff.sprite.material.opacity = (1 - t) * 0.36;
    }

    for (const sparkle of sparkles) {
      if (sparkle.life <= 0) continue;
      sparkle.life -= dt;
      if (sparkle.life <= 0) {
        sparkle.sprite.visible = false;
        sparkle.sprite.material.opacity = 0;
        continue;
      }
      const t = 1 - sparkle.life / sparkle.maxLife;
      sparkle.sprite.position.x += sparkle.vx * dt;
      sparkle.sprite.position.y += sparkle.vy * dt;
      sparkle.sprite.position.z += sparkle.vz * dt;
      sparkle.vy -= dt * 1.5;
      sparkle.vx *= 1 - dt * 0.8;
      sparkle.vz *= 1 - dt * 0.8;
      sparkle.sprite.scale.setScalar(sparkle.size * (1 - t * 0.6));
      sparkle.sprite.material.opacity = (1 - t) * 0.9;
      sparkle.sprite.material.rotation += dt * 2.2;
    }

    if (starAnchor.visible) {
      dizzyTime += dt;
      for (let i = 0; i < starSprites.length; i += 1) {
        const angle = dizzyTime * 3.2 + (i / starSprites.length) * TAU;
        const star = starSprites[i];
        star.position.set(
          Math.cos(angle) * 0.52,
          Math.sin(dizzyTime * 4.2 + i) * 0.07,
          Math.sin(angle) * 0.3
        );
        star.material.rotation = angle + Math.PI / 2;
        star.material.opacity = 0.68 + Math.sin(dizzyTime * 5 + i) * 0.28;
      }
    }

    // Confetti flutter and gravity.
    let anyConfetti = false;
    for (let i = 0; i < confettiData.length; i += 1) {
      const p = confettiData[i];
      if (!p.active) continue;
      anyConfetti = true;
      p.life -= dt;
      if (p.life <= 0 || p.y < -0.1) {
        p.active = false;
        dummy.position.set(p.x, -100, p.z);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
        continue;
      }
      p.x += (p.vx + Math.sin(p.life * 2.2 + p.flutter) * 0.35) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= dt * 1.8;
      p.vx *= 1 - dt * 0.42;
      p.vz *= 1 - dt * 0.42;
      p.rx += p.spinX * dt;
      p.ry += p.spinY * dt;
      p.rz += p.spinZ * dt;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      const flutterX = p.size * (0.7 + Math.abs(Math.sin(p.life * 5.3 + p.flutter)) * 0.45);
      dummy.scale.set(flutterX, p.size, 1);
      dummy.updateMatrix();
      confetti.setMatrixAt(i, dummy.matrix);
    }
    if (anyConfetti) confetti.instanceMatrix.needsUpdate = true;
  }

  function reset() {
    for (const puff of dust) {
      puff.life = 0;
      puff.sprite.visible = false;
      puff.sprite.material.opacity = 0;
    }
    for (const sparkle of sparkles) {
      sparkle.life = 0;
      sparkle.sprite.visible = false;
      sparkle.sprite.material.opacity = 0;
    }
    for (let i = 0; i < confettiData.length; i += 1) {
      confettiData[i].active = false;
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      confetti.setMatrixAt(i, dummy.matrix);
    }
    confetti.instanceMatrix.needsUpdate = true;
    hideDizzy();
  }

  return {
    spawnDust,
    spawnSparkle,
    burstConfetti,
    showDizzy,
    hideDizzy,
    update,
    reset,
  };
}
