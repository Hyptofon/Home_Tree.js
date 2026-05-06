import type { Updatable } from '../types/interfaces.ts';

/**
 * Manages the core `requestAnimationFrame` loop.
 * Responsible strictly for calculating delta time and dispatching update calls.
 * Implements a maximum delta cap to prevent physics explosions.
 */
export class GameLoop {
  /** Internal array storing all registered objects that need per-frame updates. */
  private readonly updatables: Updatable[] = [];
  
  /** Stores the requestAnimationFrame ID so the loop can be stopped. */
  private frameId: number | null = null;
  
  /** Tracks the timestamp of the previous frame to calculate delta time. */
  private lastTime = 0;
  /** Max delta cap (seconds) — avoids physics explosion on tab switch. */
  private readonly maxDelta = 0.05;

  /**
   * Registers one or more updatable entities to the game loop.
   * Entities are updated in the order they are registered.
   * @param items Objects implementing the `Updatable` interface.
   * @returns `this` for chaining.
   */
  register(...items: Updatable[]): this {
    this.updatables.push(...items);
    return this;
  }

  /**
   * Starts the animation loop. Safe to call multiple times.
   */
  start(): void {
    if (this.frameId !== null) return;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  /**
   * Stops the animation loop.
   */
  stop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  /**
   * Internal recursive tick function called by `requestAnimationFrame`.
   * Calculates delta time and triggers updates.
   * 
   * @param time Timestamp provided by requestAnimationFrame.
   */
  private readonly tick = (time: number): void => {
    const delta = Math.min((time - this.lastTime) / 1000, this.maxDelta);
    this.lastTime = time;

    for (const u of this.updatables) u.update(delta);

    this.frameId = requestAnimationFrame(this.tick);
  };
}
