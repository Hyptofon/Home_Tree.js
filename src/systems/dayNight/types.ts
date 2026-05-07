/**
 * @fileoverview Type definitions and interfaces for the Day/Night Cycle module.
 * All types are strictly defined — no `any` usage.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** The six phases of the 24-hour day cycle. */
export type DayPhase =
  | 'night'
  | 'dawn'
  | 'morning'
  | 'day'
  | 'sunset'
  | 'evening';

// ─────────────────────────────────────────────────────────────────────────────
// Config interfaces
// ─────────────────────────────────────────────────────────────────────────────

/** RGB color as a plain tuple [r, g, b] — all channels in 0–255 range. */
export type RGB = readonly [number, number, number];

/** Postprocessing effect parameters for a given phase. */
export interface PostFxPhaseParams {
  readonly bloomIntensity: number;
  readonly bloomThreshold: number;
  readonly toneMappingExposure: number;
  readonly vignetteDarkness: number;
  readonly vignetteOffset: number;
  readonly ssaoIntensity: number;
  readonly ssaoRadius: number;
}

/** Parameters defining a single phase of the day. */
export interface PhaseDefinition {
  readonly startHour: number;
  readonly endHour: number;
  readonly skyColor: RGB;
  readonly fogColor: RGB;
  readonly fogDensity: number;
  readonly ambientIntensity: number;
  readonly sunIntensity: number;
  readonly postFx: PostFxPhaseParams;
}

/** Constructor options for {@link DayNightCycle}. */
export interface DayNightCycleOptions {
  /** Total real-world seconds for one full 24 h cycle. Default: 240 */
  cycleDurationSeconds?: number;
  /** Starting in-game hour (0–24). Default: 6 */
  startTime?: number;
  /** Playback speed multiplier. Default: 1 */
  timeScale?: number;
  /** Path to the cloud PNG (with alpha). Default: '/textures/cloud.png' */
  cloudTexturePath?: string;
  /** Path to the moon JPG. Default: '/textures/moon.jpg' */
  moonTexturePath?: string;
}
