/**
 * Logical animation states supported by the player animation subsystem.
 *
 * Asset paths and playback tuning live in player configuration modules; this
 * file remains a pure shared type contract.
 */
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
