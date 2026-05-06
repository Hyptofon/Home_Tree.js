import * as THREE from 'three';

/**
 * Configuration options for the Player's third-person follow camera.
 */
export type CameraConfig = {
  /** Desired distance between the camera and the player (Z offset). */
  distance:   number; 
  /** Desired height offset above the player's root position. */
  height:     number; 
  /** Desired look-at Y offset (to look at the character's head/torso instead of feet). */
  lookOffset: number; 
  /** Easing factor applied per frame (0 to 1). Lower is smoother/slower. */
  smoothing:  number;
};

const DEFAULTS: CameraConfig = {
  distance:   5,
  height:     2.5,
  lookOffset: 1.5,
  smoothing:  0.1,
};

/**
 * Manages the positioning and orientation of the active Three.js PerspectiveCamera.
 * 

 * - Follows a target Group (`root`) with a smoothed third-person offset.
 * - Provides a seamless toggle into a first-person view mode.
 * - Completely decoupled from input handling, animation, and physical movement.
 */
export class PlayerCamera {
  /** Active configuration merging DEFAULTS and any provided overrides. */
  private readonly cfg: CameraConfig;
  
  /** Internal vector reused for calculating the lookAt target. */
  private readonly _lookAt = new THREE.Vector3();
  
  /** Internal vector reused for calculating the desired camera position. */
  private readonly _desired = new THREE.Vector3();

  /** State flag indicating whether the camera is currently in 1st person mode. */
  public isFirstPerson = false;

  /** Reference to the Three.js PerspectiveCamera being controlled. */
  private readonly camera: THREE.PerspectiveCamera;

  /**
   * Initializes the camera controller.
   * 
   * @param camera The active Three.js PerspectiveCamera instance to be controlled.
   * @param cfg Optional overrides for the default third-person camera configuration.
   */
  constructor(
    camera: THREE.PerspectiveCamera,
    cfg: Partial<CameraConfig> = {},
  ) {
    this.camera = camera;
    this.cfg = { ...DEFAULTS, ...cfg };
  }

  /**
   * Updates the camera position and look target.
   * Call this every frame strictly *after* the player's physical root has been updated.
   * 
   * @param playerRoot The visual Three.js Group whose position and rotation the camera should track.
   */
  update(playerRoot: THREE.Group): void {
    const { cfg, camera } = this;
    const angle = playerRoot.rotation.y;

    if (this.isFirstPerson) {
      this._desired.set(
        playerRoot.position.x - Math.sin(angle) * 0.2,
        playerRoot.position.y + 1.7,
        playerRoot.position.z - Math.cos(angle) * 0.2
      );
      camera.position.lerp(this._desired, 0.5);

      this._lookAt.set(
        playerRoot.position.x - Math.sin(angle) * 10,
        playerRoot.position.y + 1.7,
        playerRoot.position.z - Math.cos(angle) * 10
      );
      camera.lookAt(this._lookAt);
    } else {
      this._desired.set(
        playerRoot.position.x + Math.sin(angle) * cfg.distance,
        playerRoot.position.y + cfg.height,
        playerRoot.position.z + Math.cos(angle) * cfg.distance,
      );

      camera.position.lerp(this._desired, cfg.smoothing);

      this._lookAt.set(
        playerRoot.position.x,
        playerRoot.position.y + cfg.lookOffset,
        playerRoot.position.z,
      );
      camera.lookAt(this._lookAt);
    }
  }
}
