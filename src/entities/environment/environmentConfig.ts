/**
 * Configuration for static environment visuals and matching physics colliders.
 *
 * The scene is intentionally simple right now, but the split keeps future biome,
 * prop, or terrain generation work from bloating the Environment class.
 */
export const ENVIRONMENT_CONFIG = {
  FLOOR: {
    SIZE: 2000,
    SEGMENTS: 1,
    THICKNESS: 1,
    COLOR: 0x4a7c3f,
    ROUGHNESS: 0.9,
    METALNESS: 0,
  },
  GRID: {
    SIZE: 2000,
    DIVISIONS: 500,
    COLOR: 0x000000,
    OPACITY: 0.05,
  },
  BOX_PROPS: {
    GEOMETRY: [1, 2, 1] as const,
    COLLIDER_HALF_EXTENTS: [0.5, 1, 0.5] as const,
    COLOR: 0x8b4513,
    ROUGHNESS: 0.7,
    POSITIONS: [
      [5, 1, -5],
      [-5, 1, -5],
      [8, 1, 3],
      [-8, 1, 3],
      [12, 1, -8],
      [-12, 1, 8],
    ] as const,
  },
} as const;
