import type { Updatable } from '../types/interfaces.ts';
import { GAME_LOOP_CONFIG } from './coreConfig.ts';

/** Constructor options for {@link GameLoop}. */
export interface GameLoopOptions {
  /** Maximum accepted delta in seconds before a frame is clamped. */
  readonly maxDeltaSeconds?: number;
}

/**
 * Owns the application `requestAnimationFrame` loop.
 *
 * The loop has a single responsibility: calculate a capped frame delta and
 * dispatch updates in registration order. Rendering, physics, and UI sampling
 * remain inside their own updatable systems.
 */
export class GameLoop {
  /** Ordered list of systems/entities that receive per-frame updates. */
  private readonly updatables: Updatable[] = [];

  /** Active requestAnimationFrame id, or `null` when the loop is stopped. */
  private frameId: number | null = null;

  /** Timestamp of the previous animation frame in milliseconds. */
  private lastTime = 0;

  /** Maximum frame delta in seconds to keep simulation systems stable. */
  private readonly maxDelta: number;

  /**
   * Creates a frame loop with injectable timing config for tests and previews.
   *
   * @param options - Optional frame timing overrides.
   */
  constructor(options: GameLoopOptions = {}) {
    this.maxDelta = options.maxDeltaSeconds ?? GAME_LOOP_CONFIG.MAX_DELTA_SECONDS;
  }

  /**
   * Registers one or more systems for ordered updates.
   *
   * @param items - Objects implementing the `Updatable` interface.
   * @returns `this` for chaining.
   */
  register(...items: Updatable[]): this {
    this.updatables.push(...items);
    return this;
  }

  /** Starts the animation loop. Safe to call multiple times. */
  start(): void {
    if (this.frameId !== null) return;

    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  /** Stops the animation loop if it is currently active. */
  stop(): void {
    if (this.frameId === null) return;

    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  /**
   * Processes a single animation frame and schedules the next one.
   *
   * @param time - Timestamp provided by `requestAnimationFrame`.
   */
  private readonly tick = (time: number): void => {
    const delta = Math.min((time - this.lastTime) / 1000, this.maxDelta);
    this.lastTime = time;

    for (const updatable of this.updatables) {
      updatable.update(delta);
    }

    this.frameId = requestAnimationFrame(this.tick);
  };
}
