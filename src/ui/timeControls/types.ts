import type { DayPhase } from '../../systems/dayNight/types.ts';

/**
 * Minimal world-time contract consumed by the DOM panel.
 *
 * This prevents the UI from depending on DayNightCycle internals and keeps the
 * panel testable with a small mock controller.
 */
export interface TimeController {
  getTimeOfDay(): number;
  setTimeOfDay(time: number): void;
  getPhase(): DayPhase;
}

/** Construction options for {@link TimeControlPanel}. */
export interface TimeControlPanelOptions {
  /** Real seconds for a complete in-world 24-hour cycle. */
  readonly cycleDurationSeconds: number;
  /** Optional DOM root for mounting; defaults to `document.body`. */
  readonly root?: HTMLElement;
  /** DOM refresh interval in seconds. */
  readonly updateIntervalSeconds?: number;
}
