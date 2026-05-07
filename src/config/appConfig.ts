/**
 * Root-level runtime configuration for the application composition layer.
 *
 * Keep scene-wide defaults here when they are consumed by several systems or
 * used during bootstrap. Feature-specific constants stay inside their modules.
 */
export const APP_CONFIG = {
  /** Real seconds required for a complete 24-hour in-world day. */
  DAY_NIGHT_CYCLE_SECONDS: 240,

  /** Initial in-world time in hours, using a 24-hour clock. */
  START_TIME_OF_DAY: 11,

  /** Default day/night playback multiplier. */
  DAY_NIGHT_TIME_SCALE: 1,
} as const;
