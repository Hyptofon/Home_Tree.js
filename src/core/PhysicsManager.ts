import RAPIER from '@dimforge/rapier3d-compat';

import { PHYSICS_CONFIG } from './coreConfig.ts';

/** Physics runs at a fixed 60 Hz regardless of the render frame rate. */
const PHYSICS_FIXED_STEP = 1 / 60;

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

  /** Accumulates unprocessed render-frame time for the fixed-step integrator. */
  private accumulator = 0;

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
   * Steps the physics at a fixed 60 Hz budget, regardless of render FPS.
   *
   * On 90+ FPS displays Rapier was being called 90+ times/sec which wasted
   * CPU. The accumulator guarantees ≤ one step per render frame.
   *
   * @param delta - Render frame delta in seconds.
   */
  update(delta: number): void {
    if (!this.world) return;
    this.accumulator += Math.min(delta, 0.05); // clamp prevents spiral-of-death
    if (this.accumulator >= PHYSICS_FIXED_STEP) {
      this.accumulator -= PHYSICS_FIXED_STEP;
      this.world.timestep = PHYSICS_FIXED_STEP;
      this.world.step();
    }
  }

  /** Releases the Rapier world and its WASM-side allocations. */
  dispose(): void {
    this.world?.free();
  }
}
