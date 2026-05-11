/**
 * @fileoverview All numeric constants and phase definitions for the Day/Night Cycle.
 * Every magic number lives here — never inline in logic code.
 */
import type { DayPhase, PhaseDefinition, PostFxPhaseParams } from './types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Timing
// ─────────────────────────────────────────────────────────────────────────────

export const CYCLE_CONFIG = {
  DEFAULT_CYCLE_DURATION_SECONDS: 240,
  DEFAULT_START_TIME: 6,
  DEFAULT_TIME_SCALE: 1,
  MIN_TIME_SCALE: 0.1,
  MAX_TIME_SCALE: 10,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Sun / DirectionalLight
// ─────────────────────────────────────────────────────────────────────────────

export const SUN_CONFIG = {
  SHADOW_MAP_SIZE: 1024,
  SHADOW_NEAR: 0.5,
  SHADOW_FAR: 180,
  SHADOW_BIAS: -0.0005, // Tuned to reduce peter-panning
  SHADOW_NORMAL_BIAS: 0.018,
  SHADOW_CAMERA_EXTENT: 40, // Tightened bounds: VSMShadowMap needs narrower focus for best quality
  /** Orbital radius (distance from scene centre) */
  ORBIT_RADIUS: 400,
  COLOR_DAY: 0xfff1d6,    // Warm balanced daylight; avoids washed-out noon whites
  COLOR_SUNSET: 0xff5500, // Deep fiery orange
  COLOR_SUNRISE: 0xff7733, // Soft peach/orange
  COLOR_NIGHT: 0x050510,
  INTENSITY_DAY: 1.25,    // PBR intensity scaling tuned for ACES without noon clipping
  AMBIENT_INTENSITY_DAY: 0.42,
  AMBIENT_INTENSITY_SUNSET: 0.3,
  AMBIENT_INTENSITY_NIGHT: 0.15, // Provide enough fill light for character visibility at night
  INTENSITY_SUNSET: 1.2,
  INTENSITY_SUNRISE: 0.8,
  INTENSITY_NIGHT: 0,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Moon
// ─────────────────────────────────────────────────────────────────────────────

export const MOON_CONFIG = {
  ORBIT_RADIUS: 300,
  SPRITE_SIZE: 40,
  LIGHT_COLOR: 0xc5cae9,  // cool blue-lavender
  LIGHT_INTENSITY: 0.3,
  LIGHT_DISTANCE: 1000,
  /** In-game hours of moon fade-in duration */
  FADE_HOURS: 0.5,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────────────────────────────────────

export const STARS_CONFIG = {
  COUNT: 4200,
  SPHERE_RADIUS: 850,
  SIZE_MIN: 0.4, // Tinier, sharper stars
  SIZE_MAX: 1.5,
  /** Stars start fading in when time >= this hour */
  APPEAR_HOUR: 19.0,
  /** Stars fully gone when time <= this hour */
  DISAPPEAR_HOUR: 6.5,
  /** Twinkle amplitude (fraction of base opacity) */
  TWINKLE_AMPLITUDE: 0.15, // More pronounced twinkle
  /** Number of star "chunks" with independent twinkle phase */
  CHUNK_COUNT: 10,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Clouds
// ─────────────────────────────────────────────────────────────────────────────

export const CLOUD_CONFIG = {
  WIND_DIRECTION: Math.PI * 0.18,
  UPDATE_INTERVAL_SECONDS: 1 / 30,
  LAYERS: [
    {
      clusterCount: 12,
      centerAnchorCount: 4,
      particlesPerCluster: 16,
      orbitRadiusMin: 0,
      orbitRadiusMax: 540,
      heightMin: 118,
      heightMax: 215,
      driftSpeedMin: 2.8,
      driftSpeedMax: 5.0,
      windVariance: 0.35,
      clusterLengthMin: 260,
      clusterLengthMax: 430,
      clusterDepthMin: 96,
      clusterDepthMax: 168,
      clusterHeightMin: 42,
      clusterHeightMax: 84,
      puffSizeMin: 82,
      puffSizeMax: 158,
      stretchMin: 0.7,
      stretchMax: 1.08,
      opacityMin: 0.74,
      opacityMax: 0.98,
      wrapRadius: 1080,
    },
    {
      clusterCount: 7,
      particlesPerCluster: 12,
      orbitRadiusMin: 220,
      orbitRadiusMax: 780,
      heightMin: 76,
      heightMax: 150,
      driftSpeedMin: 3.6,
      driftSpeedMax: 5.9,
      windVariance: 0.38,
      clusterLengthMin: 220,
      clusterLengthMax: 360,
      clusterDepthMin: 76,
      clusterDepthMax: 132,
      clusterHeightMin: 32,
      clusterHeightMax: 68,
      puffSizeMin: 72,
      puffSizeMax: 138,
      stretchMin: 0.66,
      stretchMax: 1.0,
      opacityMin: 0.68,
      opacityMax: 0.92,
      wrapRadius: 1160,
    },
    {
      clusterCount: 9,
      particlesPerCluster: 12,
      orbitRadiusMin: 480,
      orbitRadiusMax: 1180,
      heightMin: 145,
      heightMax: 265,
      driftSpeedMin: 4.8,
      driftSpeedMax: 7.6,
      windVariance: 0.42,
      clusterLengthMin: 180,
      clusterLengthMax: 290,
      clusterDepthMin: 58,
      clusterDepthMax: 104,
      clusterHeightMin: 28,
      clusterHeightMax: 54,
      puffSizeMin: 64,
      puffSizeMax: 122,
      stretchMin: 0.62,
      stretchMax: 0.94,
      opacityMin: 0.62,
      opacityMax: 0.86,
      wrapRadius: 1460,
    },
    {
      clusterCount: 10,
      particlesPerCluster: 10,
      orbitRadiusMin: 840,
      orbitRadiusMax: 1680,
      heightMin: 265,
      heightMax: 455,
      driftSpeedMin: 6.6,
      driftSpeedMax: 10.2,
      windVariance: 0.52,
      clusterLengthMin: 140,
      clusterLengthMax: 230,
      clusterDepthMin: 42,
      clusterDepthMax: 78,
      clusterHeightMin: 22,
      clusterHeightMax: 40,
      puffSizeMin: 48,
      puffSizeMax: 98,
      stretchMin: 0.58,
      stretchMax: 0.88,
      opacityMin: 0.5,
      opacityMax: 0.74,
      wrapRadius: 1960,
    },
  ],
  OPACITY_DAWN: 0.34,
  OPACITY_MORNING: 0.74,
  OPACITY_DAY: 0.82,
  OPACITY_SUNSET: 0.04,
  OPACITY_EVENING: 0,
  OPACITY_NIGHT: 0,
  COLOR_HIGHLIGHT_DAWN: 0xffdcc4,
  COLOR_HIGHLIGHT_MORNING: 0xf6fbff,
  COLOR_HIGHLIGHT_DAY: 0xeaf3ff,
  COLOR_HIGHLIGHT_SUNSET: 0xffe2c5,
  COLOR_HIGHLIGHT_EVENING: 0xb7c7e2,
  COLOR_HIGHLIGHT_NIGHT: 0x5b6f96,
  COLOR_BASE_DAWN: 0xeec2b0,
  COLOR_BASE_MORNING: 0xddeafa,
  COLOR_BASE_DAY: 0xd2e2f4,
  COLOR_BASE_SUNSET: 0xffd7bd,
  COLOR_BASE_EVENING: 0x8295b9,
  COLOR_BASE_NIGHT: 0x344665,
  COLOR_SHADOW_DAWN: 0xc89586,
  COLOR_SHADOW_MORNING: 0x9fb3cc,
  COLOR_SHADOW_DAY: 0x8398b6,
  COLOR_SHADOW_SUNSET: 0xc08c74,
  COLOR_SHADOW_EVENING: 0x5e7193,
  COLOR_SHADOW_NIGHT: 0x1e2a40,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Fog
// ─────────────────────────────────────────────────────────────────────────────

export const FOG_CONFIG = {
  DENSITY_DAY: 0.000035,
  DENSITY_MORNING: 0.00008,
  DENSITY_SUNSET: 0.0001,
  DENSITY_NIGHT: 0.00035,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Sky shader (THREE.Sky)
// ─────────────────────────────────────────────────────────────────────────────

export const SKY_CONFIG = {
  SCALE: 2500,
  TURBIDITY_DAY: 0.75,
  TURBIDITY_SUNSET: 3.4,
  TURBIDITY_NIGHT: 1.2,
  RAYLEIGH_DAY: 0.42,
  RAYLEIGH_SUNSET: 2.2,
  RAYLEIGH_NIGHT: 0.22,
  MIE_COEFFICIENT_DAY: 0.00001,
  MIE_COEFFICIENT_SUNSET: 0.0034,
  MIE_COEFFICIENT_NIGHT: 0.00025,
  MIE_DIRECTIONAL_G_DAY: 0.32,
  MIE_DIRECTIONAL_G_SUNSET: 0.86,
  MIE_DIRECTIONAL_G_NIGHT: 0.76,
  HORIZON_TINT_STRENGTH: 0.58,
  MAX_CHANNEL_VALUE: 0.78,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Ambient light
// ─────────────────────────────────────────────────────────────────────────────

export const AMBIENT_CONFIG = {
  COLOR_SKY: 0x87ceeb,
  COLOR_GROUND: 0x1a1a0a,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing per phase
// ─────────────────────────────────────────────────────────────────────────────

const POST_FX_DAY: PostFxPhaseParams = {
  bloomIntensity: 0.025,
  bloomThreshold: 1.38,
  toneMappingExposure: 0.34,
  vignetteDarkness: 0.18,
  vignetteOffset: 0.62,
  ssaoIntensity: 0.28,
  ssaoRadius: 0.65,
};

const POST_FX_SUNSET: PostFxPhaseParams = {
  bloomIntensity: 0.12,
  bloomThreshold: 1.04,
  toneMappingExposure: 0.54,
  vignetteDarkness: 0.22,
  vignetteOffset: 0.54,
  ssaoIntensity: 0.3,
  ssaoRadius: 0.68,
};

const POST_FX_NIGHT: PostFxPhaseParams = {
  bloomIntensity: 0.38,
  bloomThreshold: 0.3,
  toneMappingExposure: 0.45,
  vignetteDarkness: 0.58,
  vignetteOffset: 0.3,
  ssaoIntensity: 0.2,
  ssaoRadius: 0.7,
};

const POST_FX_DAWN: PostFxPhaseParams = {
  bloomIntensity: 0.075,
  bloomThreshold: 1.12,
  toneMappingExposure: 0.52,
  vignetteDarkness: 0.16,
  vignetteOffset: 0.6,
  ssaoIntensity: 0.28,
  ssaoRadius: 0.65,
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase definitions (ordered by startHour)
// ─────────────────────────────────────────────────────────────────────────────

export const PHASE_DEFINITIONS: Readonly<Record<DayPhase, PhaseDefinition>> = {
  night: {
    startHour: 0,
    endHour: 4.5,
    skyColor: [5, 6, 12],
    fogColor: [3, 4, 10], // Matches night sky horizon
    fogDensity: FOG_CONFIG.DENSITY_NIGHT,
    ambientIntensity: SUN_CONFIG.AMBIENT_INTENSITY_NIGHT,
    sunIntensity: 0,
    postFx: POST_FX_NIGHT,
  },
  dawn: {
    startHour: 4.5,
    endHour: 6.5,
    skyColor: [244, 171, 120],
    fogColor: [188, 148, 126],
    fogDensity: FOG_CONFIG.DENSITY_MORNING,
    ambientIntensity: 0.34,
    sunIntensity: 0.48,
    postFx: POST_FX_DAWN,
  },
  morning: {
    startHour: 6.5,
    endHour: 10.0,
    skyColor: [74, 145, 222],
    fogColor: [120, 172, 224],
    fogDensity: FOG_CONFIG.DENSITY_DAY,
    ambientIntensity: 0.48,
    sunIntensity: 1.05,
    postFx: POST_FX_DAY,
  },
  day: {
    startHour: 10.0,
    endHour: 16.0,
    skyColor: [38, 118, 218],
    fogColor: [70, 132, 202],
    fogDensity: FOG_CONFIG.DENSITY_DAY,
    ambientIntensity: SUN_CONFIG.AMBIENT_INTENSITY_DAY,
    sunIntensity: SUN_CONFIG.INTENSITY_DAY,
    postFx: POST_FX_DAY,
  },
  sunset: {
    startHour: 16.0,
    endHour: 19.5,
    skyColor: [255, 164, 98],
    fogColor: [219, 160, 118],
    fogDensity: FOG_CONFIG.DENSITY_SUNSET,
    ambientIntensity: SUN_CONFIG.AMBIENT_INTENSITY_SUNSET,
    sunIntensity: SUN_CONFIG.INTENSITY_SUNSET,
    postFx: POST_FX_SUNSET,
  },
  evening: {
    startHour: 19.5,
    endHour: 24.0,
    skyColor: [28, 40, 68],
    fogColor: [14, 20, 34],
    fogDensity: FOG_CONFIG.DENSITY_NIGHT,
    ambientIntensity: SUN_CONFIG.AMBIENT_INTENSITY_NIGHT,
    sunIntensity: 0,
    postFx: POST_FX_NIGHT,
  },
} as const;

/** Ordered list of phases (by startHour ascending) for binary-search queries. */
export const ORDERED_PHASES: readonly DayPhase[] = [
  'night', 'dawn', 'morning', 'day', 'sunset', 'evening',
] as const;
