/**
 * Shared lifecycle contracts used by engine, feature, and UI systems.
 *
 * These interfaces intentionally stay tiny so systems can compose without
 * inheriting from framework base classes or sharing unnecessary dependencies.
 */

/** System that receives frame updates from {@link GameLoop}. */
export type Updatable = {
  /**
   * Advances the system by one frame.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void;
};

/** Object that owns resources requiring explicit teardown. */
export type Disposable = {
  /** Releases event listeners, GPU resources, physics objects, or DOM nodes. */
  dispose(): void;
};

/** Optional third-person camera tuning consumed by configurable player features. */
export type CameraConfigurable = {
  /** Partial player-camera configuration override. */
  cameraConfig?: Partial<{
    distance: number;
    height: number;
    lookOffset: number;
    smoothing: number;
  }>;
};
