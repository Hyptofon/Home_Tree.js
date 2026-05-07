/**
 * Core engine configuration shared by renderer, loop, camera, and physics.
 *
 * These values describe infrastructure-level behavior rather than feature
 * logic, so systems can stay config-driven and free from hardcoded numbers.
 */
export const GAME_LOOP_CONFIG = {
  /** Maximum frame delta used by physics-sensitive systems after tab switches. */
  MAX_DELTA_SECONDS: 0.05,
} as const;

/** Renderer defaults tuned for stable cinematic quality on common displays. */
export const RENDERER_CONFIG = {
  MAX_PIXEL_RATIO: 2,
  TONE_MAPPING_EXPOSURE: 1,
} as const;

/** Perspective camera defaults for the primary player view. */
export const CAMERA_CONFIG = {
  FOV: 55,
  NEAR: 0.1,
  FAR: 3000,
  INITIAL_POSITION: [0, 3, 8] as const,
} as const;

/** Rapier world defaults. The player controller mirrors this gravity value. */
export const PHYSICS_CONFIG = {
  GRAVITY: { x: 0, y: -20, z: 0 },
} as const;
