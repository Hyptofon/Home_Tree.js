import RAPIER from '@dimforge/rapier3d-compat';

import { PHYSICS_CONFIG } from './coreConfig.ts';

/**
 * Wraps the Rapier physics world lifecycle.
 *
 * The manager initializes the WASM runtime, owns the world instance, and exposes
 * a small `Updatable` surface for the game loop. Entity-specific bodies and
 * colliders are created by their owning feature classes.
 */
export class PhysicsManager {
  /**
   * Active Rapier world. Available after {@link init} resolves.
   *
   * It is public by design because entity factories need to register bodies in
   * the same physics simulation while keeping body ownership local.
   */
  public world!: RAPIER.World;

  /**
   * Initializes Rapier WASM and creates the simulation world.
   *
   * Must be awaited before any entity creates rigid bodies or colliders.
   */
  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World(PHYSICS_CONFIG.GRAVITY);
  }

  /**
   * Steps the physics simulation by the frame delta.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void {
    if (!this.world) return;

    // OPTIMIZATION: Cap physics timestep to prevent spiral of death
    // and allow sub-stepping for stability without performance cost
    const clampedDelta = Math.min(delta, 1/30); // Max 30 FPS physics
    this.world.timestep = clampedDelta;
    this.world.step();
  }

  /** Releases the Rapier world and its WASM-side allocations. */
  dispose(): void {
    this.world?.free();
  }
}
