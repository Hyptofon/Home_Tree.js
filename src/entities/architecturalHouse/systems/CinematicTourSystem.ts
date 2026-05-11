import * as THREE from 'three';

import type { Player } from '../../../player/Player.ts';
import { HOUSE_CONFIG } from '../architecturalHouseConfig.ts';

type TourWaypoint = {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly duration: number;
};

type CinematicTourOptions = {
  readonly onFinish?: () => void;
};

/** Smooth camera path used for the arrival-to-door architectural reveal. */
export class CinematicTourSystem {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly player: Player;
  private readonly onFinish?: () => void;
  private readonly waypoints: TourWaypoint[];
  private readonly currentPosition = new THREE.Vector3();
  private readonly currentTarget = new THREE.Vector3();
  private readonly playerEndPosition = new THREE.Vector3(...HOUSE_CONFIG.INTRO_TOUR.PLAYER_END_POSITION);

  private active = false;
  private segmentIndex = 0;
  private segmentElapsed = 0;

  /**
   * @param camera - Active scene camera to animate.
   * @param player - Player facade teleported to the tour endpoint on completion.
   */
  constructor(
    camera: THREE.PerspectiveCamera,
    player: Player,
    options: CinematicTourOptions = {},
  ) {
    this.camera = camera;
    this.player = player;
    this.onFinish = options.onFinish;
    this.waypoints = HOUSE_CONFIG.INTRO_TOUR.WAYPOINTS.map((waypoint) => ({
      position: new THREE.Vector3(...waypoint.position),
      target: new THREE.Vector3(...waypoint.target),
      duration: waypoint.duration,
    }));
  }

  /** Starts the intro camera path from the first waypoint. */
  playIntro(): void {
    if (this.waypoints.length < 2) {
      this.onFinish?.();
      return;
    }

    this.active = true;
    this.segmentIndex = 0;
    this.segmentElapsed = 0;

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /**
   * Updates the active camera tour after player camera update.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void {
    if (!this.active) return;

    const from = this.waypoints[this.segmentIndex];
    const to = this.waypoints[this.segmentIndex + 1];
    if (!from || !to) {
      this.finish();
      return;
    }

    this.segmentElapsed += delta;
    const t = THREE.MathUtils.clamp(this.segmentElapsed / from.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);

    this.currentPosition.lerpVectors(from.position, to.position, eased);
    this.currentTarget.lerpVectors(from.target, to.target, eased);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentTarget);

    if (t < 1) return;

    this.segmentIndex += 1;
    this.segmentElapsed = 0;

    if (this.segmentIndex >= this.waypoints.length - 1) {
      this.finish();
    }
  }

  /** Returns true while the camera is being overridden by the tour. */
  get isActive(): boolean {
    return this.active;
  }

  private finish(): void {
    this.active = false;
    this.player.teleportTo(this.playerEndPosition);
    this.onFinish?.();
  }
}
