import type { AnimationName } from '../types/animations.ts';

/**
 * External GLB animation sources mapped to logical player animation states.
 *
 * This is intentionally configuration, not a type module, so asset paths do not
 * leak into the shared type layer.
 */
export const ANIMATION_SOURCES: Readonly<Record<AnimationName, string>> = {
  idle: '/animations/character/idle.glb',
  walk: '/animations/character/walking.glb',
  walkBack: '/animations/character/walking.glb',
  run: '/animations/character/standard_run.glb',
  jump: '/animations/character/jump.glb',
  strafeLeft: '/animations/character/left_strafe_walking.glb',
  strafeRight: '/animations/character/right_strafe_walking.glb',
  turnLeft: '/animations/character/left_turn_90.glb',
  turnRight: '/animations/character/right_turn_90.glb',
} as const;
