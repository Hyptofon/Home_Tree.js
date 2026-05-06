export type AnimationName =
  | 'idle'
  | 'walk'
  | 'walkBack'
  | 'run'
  | 'jump'
  | 'strafeLeft'
  | 'strafeRight'
  | 'turnLeft'
  | 'turnRight';

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

export const CHARACTER_MODEL_PATH = '/mosels/character.glb';
