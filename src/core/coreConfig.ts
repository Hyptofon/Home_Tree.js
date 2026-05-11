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

/** Renderer defaults tuned for 90 FPS at 2K quality on capable hardware. */
export const RENDERER_CONFIG = {
  ANTIALIAS: false,          // Disabled: SMAA ULTRA handles AA at the composer level
  INITIAL_PIXEL_RATIO: 2.0,  // Start at 2K quality immediately
  MIN_PIXEL_RATIO: 1.0,      // Drop to 1.0 only under heavy load
  MAX_PIXEL_RATIO: 2.5,      // Allow 2.5x on hi-DPI displays (4K monitors)
  PIXEL_RATIO_STEP: 0.1,
  QUALITY_SAMPLE_SECONDS: 0.4,  // Fast adaptation
  TARGET_FRAME_MS: 11.1,        // 90 FPS target
  DOWNGRADE_FRAME_MS: 12.5,     // Drop quality if frame > ~80 FPS threshold
  UPGRADE_FRAME_MS: 10.0,       // Raise quality if frame < ~100 FPS
  TONE_MAPPING_EXPOSURE: 0.55,
} as const;

/** Perspective camera defaults for the primary player view. */
export const CAMERA_CONFIG = {
  FOV: 62,
  NEAR: 0.1,
  FAR: 1500, // Reduced from 3000: most scene elements are within 500 units
  INITIAL_POSITION: [0, 3, 8] as const,
} as const;

/** Rapier world defaults. The player controller mirrors this gravity value. */
export const PHYSICS_CONFIG = {
  GRAVITY: { x: 0, y: -20, z: 0 },
} as const;
