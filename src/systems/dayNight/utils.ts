/**
 * @fileoverview Pure math / interpolation utilities for the Day/Night Cycle.
 * All functions are stateless, side-effect-free, and fully typed.
 */
import * as THREE from 'three';
import type { DayPhase, RGB } from './types.ts';
import { ORDERED_PHASES, PHASE_DEFINITIONS } from './config.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps a value into [0, 24) range using modulo.
 * @param time - Raw game time (may exceed 24)
 */
export function wrapTime(time: number): number {
  return ((time % 24) + 24) % 24;
}

/**
 * Determines the current {@link DayPhase} and the normalised blend factor [0,1]
 * indicating progress through that phase.
 *
 * @param time - Current game hour in [0, 24)
 * @returns Tuple [phase, blendFactor]
 */
export function resolvePhase(time: number): [DayPhase, number] {
  const t = wrapTime(time);

  for (const phase of ORDERED_PHASES) {
    const def = PHASE_DEFINITIONS[phase];
    if (t >= def.startHour && t < def.endHour) {
      const blend = (t - def.startHour) / (def.endHour - def.startHour);
      return [phase, blend];
    }
  }

  // Fallback: night wraps at 24 → 0, so any overflow lands here
  return ['night', 0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Linearly interpolates between two RGB tuples.
 * @param a   - Start colour [r, g, b] (0–255)
 * @param b   - End colour   [r, g, b] (0–255)
 * @param t   - Blend factor [0, 1]
 */
export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Converts an RGB tuple (0–255 each channel) into a {@link THREE.Color}.
 */
export function rgbToThreeColor(rgb: RGB): THREE.Color {
  return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

/**
 * Applies an RGB tuple directly onto an existing {@link THREE.Color} to avoid allocation.
 */
export function applyRGBToColor(color: THREE.Color, rgb: RGB): void {
  color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

// ─────────────────────────────────────────────────────────────────────────────
// Celestial position
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the world-space position of a celestial body on a parabolic arc.
 *
 * @param hour        - Current game hour [0, 24)
 * @param riseHour    - The hour at which the body rises above horizon
 * @param setHour     - The hour at which it sets below horizon
 * @param orbitRadius - Distance from scene centre
 * @param tiltDeg     - East–West tilt of the orbit plane in degrees
 */
export function celestialPosition(
  hour: number,
  riseHour: number,
  setHour: number,
  orbitRadius: number,
  tiltDeg: number = 0,
): THREE.Vector3 {
  const span = setHour - riseHour;
  const progress = (hour - riseHour) / span; // 0 = rise, 1 = set
  // Elevation: peaks at π/2 at noon (progress=0.5), zero at horizon
  const elevation = Math.sin(progress * Math.PI);
  // Azimuth: sweeps from East (−1) through South (0) to West (+1)
  const azimuth = (progress - 0.5) * 2;

  const tiltRad = (tiltDeg * Math.PI) / 180;
  return new THREE.Vector3(
    azimuth   * orbitRadius,
    elevation * orbitRadius * Math.cos(tiltRad),
    -elevation * orbitRadius * Math.sin(tiltRad) - orbitRadius * 0.1,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scalar interpolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard linear interpolation between two scalars.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Smooth step (hermite interpolation) for a more organic feel.
 */
export function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Clamps `v` to [min, max].
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
