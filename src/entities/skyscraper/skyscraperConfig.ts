/**
 * Runtime configuration for the hero skyscraper feature.
 *
 * Values here intentionally describe presentation and integration, while the
 * loader/entity code stays focused on lifecycle, transforms, and resources.
 */
export const SKYSCRAPER_CONFIG = {
  MODEL_PATH: '/models/skyscraper/free__atlanta_corperate_office_building.glb',

  /** World-space placement of the normalized building root. */
  POSITION: { x: 0, y: 0, z: 185 },

  /** Model authored near 212 units tall; this keeps city scale believable. */
  SCALE: 0.78,

  /** Faces the most visually rich facade toward the default player camera. */
  ROTATION_Y: Math.PI,

  MATERIALS: {
    DEFAULT_ENV_MAP_INTENSITY: 0.85,
    GLASS_ENV_MAP_INTENSITY: 1.35,
    GLASS_ROUGHNESS_MAX: 0.18,
    GLASS_METALNESS_MIN: 0.02,
    OPAQUE_ROUGHNESS_MIN: 0.38,
    EMISSIVE_INTENSITY_MIN: 0.95,
  },

  COLLIDER: {
    FOOTPRINT_SCALE_X: 0.9,
    FOOTPRINT_SCALE_Z: 0.92,
    HEIGHT_SCALE: 1,
  },

  ACCENT_LIGHTS: {
    COLOR: 0xffc38a,
    INTENSITY: 1.45,
    DISTANCE: 44,
    DECAY: 2,
    ENTRANCE_OFFSET_Z: -34,
    ENTRANCE_OFFSET_X: 14,
    ENTRANCE_HEIGHT: 5.5,
  },

  LOD: {
    FULL_DETAIL_DISTANCE: 0,
    PROXY_DISTANCE: 620,
    PROXY_COLOR: 0x38464d,
    PROXY_EMISSIVE: 0xffc179,
    PROXY_EMISSIVE_INTENSITY: 0.08,
  },
} as const;
