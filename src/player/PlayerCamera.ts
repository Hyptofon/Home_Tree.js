import * as THREE from 'three';

import { InputManager } from '../core/InputManager.ts';
import { PLAYER_CAMERA_CONFIG } from './playerConfig.ts';

/** Runtime overrides for the player's third-person follow camera. */
export type CameraConfig = {
  /** Desired distance between camera and player root. */
  readonly distance: number;
  /** Vertical offset above the player root in third-person mode. */
  readonly height: number;
  /** Look-at target offset above the player root. */
  readonly lookOffset: number;
  /** Per-frame interpolation factor for third-person camera movement. */
  readonly smoothing: number;
};

const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  distance: PLAYER_CAMERA_CONFIG.DISTANCE,
  height: PLAYER_CAMERA_CONFIG.HEIGHT,
  lookOffset: PLAYER_CAMERA_CONFIG.LOOK_OFFSET,
  smoothing: PLAYER_CAMERA_CONFIG.SMOOTHING,
};

/**
 * Controls the active perspective camera for the player feature.
 *
 * The camera consumes pointer-lock deltas, maintains orbit angles, and supports
 * a first-person mode without coupling itself to player movement or animation.
 */
export class PlayerCamera {
  /** Active configuration after merging defaults with optional overrides. */
  private readonly config: CameraConfig;

  /** Scratch look target reused every frame. */
  private readonly lookAtTarget = new THREE.Vector3();

  /** Scratch desired camera position reused every frame. */
  private readonly desiredPosition = new THREE.Vector3();

  /** Camera instance owned by SceneManager and controlled by this subsystem. */
  private readonly camera: THREE.PerspectiveCamera;

  /** Shared input source for pointer-lock mouse deltas. */
  private readonly input = InputManager.instance;

  /** Whether first-person camera placement is active. */
  private firstPerson = false;

  /** Horizontal orbit angle around the player in radians. */
  private azimuth: number = PLAYER_CAMERA_CONFIG.DEFAULT_AZIMUTH;

  /** Vertical camera angle in radians. */
  private elevation: number = PLAYER_CAMERA_CONFIG.DEFAULT_ELEVATION;

  /**
   * Creates a camera controller.
   *
   * @param camera - Active Three.js camera to position and orient.
   * @param config - Optional third-person behavior overrides.
   */
  constructor(
    camera: THREE.PerspectiveCamera,
    config: Partial<CameraConfig> = {},
  ) {
    this.camera = camera;
    this.config = { ...DEFAULT_CAMERA_CONFIG, ...config };
  }

  /** Returns true when the camera is currently in first-person mode. */
  get isFirstPerson(): boolean {
    return this.firstPerson;
  }

  /**
   * Toggles first-person mode.
   *
   * @returns The new first-person state.
   */
  toggleMode(): boolean {
    this.firstPerson = !this.firstPerson;
    return this.firstPerson;
  }

  /**
   * Updates camera position and orientation after player movement.
   *
   * @param playerRoot - Visual player root to follow.
   */
  update(playerRoot: THREE.Group): void {
    this.consumeLookInput();

    if (this.firstPerson) {
      this.updateFirstPerson(playerRoot);
      return;
    }

    this.updateThirdPerson(playerRoot);
  }

  /** Applies pointer-lock deltas to orbit angles and clamps pitch. */
  private consumeLookInput(): void {
    const { x, y } = this.input.consumeMouseDelta();
    this.azimuth -= x * PLAYER_CAMERA_CONFIG.MOUSE_SENSITIVITY;
    this.elevation -= y * PLAYER_CAMERA_CONFIG.MOUSE_SENSITIVITY;

    const maxElevation = Math.PI / 2 - PLAYER_CAMERA_CONFIG.ELEVATION_PADDING;
    this.elevation = THREE.MathUtils.clamp(this.elevation, -maxElevation, maxElevation);
  }

  /**
   * Positions the camera at the character head and looks along orbit angles.
   *
   * @param playerRoot - Visual player root.
   */
  private updateFirstPerson(playerRoot: THREE.Group): void {
    this.desiredPosition.set(
      playerRoot.position.x,
      playerRoot.position.y + PLAYER_CAMERA_CONFIG.FIRST_PERSON_HEAD_HEIGHT,
      playerRoot.position.z,
    );
    this.camera.position.lerp(
      this.desiredPosition,
      PLAYER_CAMERA_CONFIG.FIRST_PERSON_SMOOTHING,
    );

    this.lookAtTarget.set(
      this.camera.position.x + Math.sin(this.azimuth) * Math.cos(this.elevation),
      this.camera.position.y + Math.sin(this.elevation),
      this.camera.position.z + Math.cos(this.azimuth) * Math.cos(this.elevation),
    );
    this.camera.lookAt(this.lookAtTarget);
  }

  /**
   * Positions the camera on a smoothed third-person orbit.
   *
   * @param playerRoot - Visual player root.
   */
  private updateThirdPerson(playerRoot: THREE.Group): void {
    const { config } = this;
    const cosElevation = Math.cos(this.elevation);
    this.desiredPosition.set(
      playerRoot.position.x + config.distance * Math.sin(this.azimuth) * cosElevation,
      playerRoot.position.y + config.height + config.distance * Math.sin(this.elevation),
      playerRoot.position.z + config.distance * Math.cos(this.azimuth) * cosElevation,
    );
    this.camera.position.lerp(this.desiredPosition, config.smoothing);

    this.lookAtTarget.set(
      playerRoot.position.x,
      playerRoot.position.y + config.lookOffset,
      playerRoot.position.z,
    );
    this.camera.lookAt(this.lookAtTarget);
  }
}
