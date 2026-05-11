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
  ANTIALIAS: false, // Disabled: SMAA is more efficient than MSAA with EffectComposer
  INITIAL_PIXEL_RATIO: 1.0, // Start conservative: most users have 1080p displays
  MIN_PIXEL_RATIO: 0.8, // Allow down to 0.8x for very weak GPUs
  MAX_PIXEL_RATIO: 1.2, // Cap at 1.2x: 30-40% performance boost vs 1.5x
  PIXEL_RATIO_STEP: 0.1,
  QUALITY_SAMPLE_SECONDS: 0.5, // Faster adaptation: respond quicker to frame drops
  TARGET_FRAME_MS: 16.7,
  DOWNGRADE_FRAME_MS: 20.0, // More aggressive downgrade threshold
  UPGRADE_FRAME_MS: 15.0, // More conservative upgrade threshold
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
