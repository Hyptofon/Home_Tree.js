import * as THREE from 'three';

import { HOUSE_CONFIG } from '../architecturalHouseConfig.ts';

const DUST_COUNT = 900;

/** Lightweight volumetric dust motes for sunbeam/depth atmosphere. */
export class DustParticleSystem {
  private readonly material: THREE.ShaderMaterial;
  readonly points: THREE.Points;

  /**
   * Builds a single GPU-friendly points draw call.
   *
   * @param root - House root receiving the particle field.
   */
  constructor(root: THREE.Group) {
    const positions = new Float32Array(DUST_COUNT * 3);
    const seeds = new Float32Array(DUST_COUNT);

    for (let index = 0; index < DUST_COUNT; index += 1) {
      const seed = this.hash(index);
      const seed2 = this.hash(index + 97);
      const seed3 = this.hash(index + 211);
      positions[index * 3] = THREE.MathUtils.lerp(-10.5, 10.5, seed);
      positions[index * 3 + 1] = THREE.MathUtils.lerp(0.65, HOUSE_CONFIG.FLOOR_HEIGHT * 2 - 0.55, seed2);
      positions[index * 3 + 2] = THREE.MathUtils.lerp(-9.8, 9.8, seed3);
      seeds[index] = seed;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.material = new THREE.ShaderMaterial({
      name: 'InteriorDustShader',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.32 },
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        varying float vSeed;

        void main() {
          vSeed = aSeed;
          vec3 animated = position;
          animated.x += sin(uTime * 0.18 + aSeed * 15.0) * 0.055;
          animated.y += sin(uTime * 0.11 + aSeed * 21.0) * 0.035;
          animated.z += cos(uTime * 0.14 + aSeed * 19.0) * 0.055;
          vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
          gl_PointSize = clamp(18.0 / -mvPosition.z, 1.2, 3.4);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vSeed;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float dist = dot(uv, uv);
          float alpha = smoothstep(0.25, 0.0, dist) * uOpacity * (0.55 + vSeed * 0.45);
          gl_FragColor = vec4(1.0, 0.86, 0.62, alpha);
        }
      `,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.name = 'InteriorVolumetricDust';
    this.points.frustumCulled = false;
    root.add(this.points);
  }

  /**
   * Advances dust shader time.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void {
    this.material.uniforms['uTime'].value += delta;
  }

  /** Toggles dust visibility from debug UI. */
  setVisible(visible: boolean): void {
    this.points.visible = visible;
  }

  /** Releases GPU resources owned by the points system. */
  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }

  private hash(value: number): number {
    return THREE.MathUtils.euclideanModulo(Math.sin(value * 12.9898) * 43758.5453, 1);
  }
}
