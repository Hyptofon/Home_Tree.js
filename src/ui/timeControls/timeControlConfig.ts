import type { DayPhase } from '../../systems/dayNight/types.ts';

/** UI timing and quick-scrub behavior for the world-time panel. */
export const TIME_CONTROL_CONFIG = {
  MINUTES_PER_DAY: 24 * 60,
  DEFAULT_UPDATE_INTERVAL_SECONDS: 0.12,
  QUICK_SCRUB_STEP_MINUTES: 15,
  QUICK_SCRUB_LARGE_STEP_MINUTES: 60,
  QUICK_SCRUB_WHEEL_UNIT: 120,
} as const;

/** User-facing labels for the day/night phases shown in the time HUD. */
export const PHASE_LABELS: Readonly<Record<DayPhase, string>> = {
  night: 'Night',
  dawn: 'Dawn',
  morning: 'Morning',
  day: 'Day',
  sunset: 'Sunset',
  evening: 'Evening',
};
