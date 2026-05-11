/**
 * Configuration for static environment visuals and matching physics colliders.
 *
 * The scene is intentionally simple right now, but the split keeps future biome,
 * prop, or terrain generation work from bloating the Environment class.
 */
export const ENVIRONMENT_CONFIG = {
  FLOOR: {
    SIZE: 140,
    SEGMENTS: 1,
    THICKNESS: 1,
    COLOR: 0x263026,
    ROUGHNESS: 0.96,
    METALNESS: 0,
  },
  BOX_PROPS: {
    GEOMETRY: [1, 2, 1] as const,
    COLLIDER_HALF_EXTENTS: [0.5, 1, 0.5] as const,
    COLOR: 0x343a3d,
    ROUGHNESS: 0.7,
    POSITIONS: [] as readonly [number, number, number][],
  },
} as const;
