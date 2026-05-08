/**
 * Configuration for the composed player feature.
 *
 * Values are grouped by subsystem so movement, camera, model, and animation
 * behavior can evolve independently without changing controller logic.
 */

/** Movement and Rapier character-controller tuning. */
export const PLAYER_CONTROLLER_CONFIG = {
  SPAWN_POSITION: { x: 0, y: 0.9, z: -58 },
  CHARACTER_GROUND_OFFSET: 0.9,
  CAPSULE_HALF_HEIGHT: 0.5,
  CAPSULE_RADIUS: 0.4,
  CHARACTER_CONTROLLER_OFFSET: 0.01,
  AUTOSTEP_MAX_HEIGHT: 0.5,
  AUTOSTEP_MIN_WIDTH: 0.2,
  SNAP_TO_GROUND_DISTANCE: 0.5,
  MOVE_SPEED: 4,
  RUN_SPEED: 8,
  ROTATE_SPEED: 10,
  JUMP_FORCE: 8,
  GRAVITY: -20,
  VELOCITY_FRICTION: 10,
} as const;

/** Default third-person and first-person camera behavior. */
export const PLAYER_CAMERA_CONFIG = {
  DISTANCE: 3.2,
  HEIGHT: 1.8,
  LOOK_OFFSET: 1.5,
  SMOOTHING: 0.09,
  FIRST_PERSON_HEAD_HEIGHT: 1.7,
  FIRST_PERSON_SMOOTHING: 0.5,
  ELEVATION_PADDING: 0.05,
  DEFAULT_AZIMUTH: Math.PI,
  DEFAULT_ELEVATION: 0.02,
  MOUSE_SENSITIVITY: 0.002,
} as const;

/** Character model asset and orientation defaults. */
export const PLAYER_MODEL_CONFIG = {
  CHARACTER_MODEL_PATH: '/models/character.glb',
  MIXAMO_FORWARD_ROTATION_Y: Math.PI,
} as const;

/** Shared animation playback defaults. */
export const PLAYER_ANIMATION_CONFIG = {
  DEFAULT_FADE_SECONDS: 0.2,
  DEFAULT_TIME_SCALE: 1,
  REVERSE_WALK_TIME_SCALE: -1,
} as const;
