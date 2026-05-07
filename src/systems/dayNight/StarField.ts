/**
 * @fileoverview StarField subsystem — a single THREE.Points object representing
 * the night sky. Procedurally generated, zero textures, zero allocations per frame.
 */
import * as THREE from 'three';
import { STARS_CONFIG } from './config.ts';
import { clamp } from './utils.ts';

// Pre-allocated per-frame scratch (avoids heap allocation in hot path)
const _tmp = new THREE.Color();

// ─────────────────────────────────────────────────────────────────────────────
// StarField
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages the procedural star field as a single draw call {@link THREE.Points}.
 * Supports fade in/out and per-chunk twinkle via material opacity manipulation.
 */
export class StarField {
  /** The single Points mesh added to the scene. */
  readonly mesh: THREE.Points;

  /** Per-chunk twinkle phase offsets (randomised at construction). */
  private readonly chunkPhases: Float32Array;

  /** Material reference (typed for safe property access). */
  private readonly mat: THREE.PointsMaterial;

  constructor() {
    const { COUNT, SPHERE_RADIUS, SIZE_MIN, SIZE_MAX, CHUNK_COUNT } = STARS_CONFIG;

    const positions = new Float32Array(COUNT * 3);
    const colors    = new Float32Array(COUNT * 3);
    const sizes     = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      // Uniform distribution on sphere surface, upper hemisphere only (Y > 0)
      const theta = Math.random() * 2 * Math.PI;
      const phi   = Math.acos(1 - Math.random()); // [0, π] → keep upper half
      const r     = SPHERE_RADIUS;

      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)); // force Y ≥ 0
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Slight colour variation: cooler or warmer stars
      const warm = Math.random();
      _tmp.setHSL(0.1 * warm, 0.3 * Math.random(), 0.85 + 0.15 * Math.random());
      colors[i * 3 + 0] = _tmp.r;
      colors[i * 3 + 1] = _tmp.g;
      colors[i * 3 + 2] = _tmp.b;

      sizes[i] = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

    this.mat = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.renderOrder = -1; // render behind everything

    // Random twinkle phase per chunk
    this.chunkPhases = new Float32Array(CHUNK_COUNT);
    for (let i = 0; i < CHUNK_COUNT; i++) {
      this.chunkPhases[i] = Math.random() * Math.PI * 2;
    }
  }

  /**
   * Called every frame from {@link DayNightCycle}.
   *
   * @param time      - Current game hour [0, 24)
   * @param totalTime - Elapsed real seconds (for twinkle animation)
   */
  update(time: number, totalTime: number): void {
    const { APPEAR_HOUR, DISAPPEAR_HOUR, TWINKLE_AMPLITUDE, CHUNK_COUNT } = STARS_CONFIG;

    // Compute target opacity based on time of day
    let targetOpacity = 0;
    if (time >= APPEAR_HOUR) {
      targetOpacity = clamp((time - APPEAR_HOUR) / 1.0, 0, 1);
    } else if (time <= DISAPPEAR_HOUR) {
      targetOpacity = clamp(1 - (time / DISAPPEAR_HOUR), 0, 1);
    }
    // Handle wrap-around: 0-4.5 is also night
    if (time < 4.5) targetOpacity = 1;

    if (targetOpacity < 0.001) {
      this.mat.opacity = 0;
      return;
    }

    // Per-chunk twinkle (averaged across all chunks for global opacity effect)
    let twinkle = 0;
    for (let c = 0; c < CHUNK_COUNT; c++) {
      twinkle += Math.sin(totalTime * (0.5 + c * 0.18) + this.chunkPhases[c]);
    }
    twinkle /= CHUNK_COUNT;

    this.mat.opacity = clamp(targetOpacity + twinkle * TWINKLE_AMPLITUDE, 0, 1);
  }

  /** Releases GPU resources. */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
