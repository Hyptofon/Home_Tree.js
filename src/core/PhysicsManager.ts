import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Manages the initialization and stepping of the Rapier physics engine.
 * Wraps the physics world lifecycle to decouple it from other game logic.
 */
export class PhysicsManager {
  /**
   * The core Rapier physics world instance.
   * Exposed publicly so it can be passed to entities and controllers that need to spawn colliders.
   */
  public world!: RAPIER.World;

  /**
   * Asynchronously initializes the Rapier WebAssembly module and creates 
   * the physical world with standard Earth-like gravity.
   * Must be called before creating any rigid bodies.
   */
  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
  }

  /**
   * Steps the physics simulation forward.
   * 
   * @param delta The delta time in seconds since the last frame.
   */
  update(delta: number): void {
    if (this.world) {
      this.world.timestep = delta;
      this.world.step();
    }
  }
}
