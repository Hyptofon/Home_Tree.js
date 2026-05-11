import type * as THREE from 'three';
import type { Vector3Tuple } from 'three';

/** Stable identifier for an architectural zone. */
export type ZoneId = string;

/** Stable identifier for a wallpaper/material variant. */
export type WallpaperId = string;

/** Axis used by long wall and railing segments. */
export type SegmentAxis = 'x' | 'z';

/** A logical zone grouping architectural meshes for material customization. */
export type MaterialZoneDefinition = {
  readonly id: ZoneId;
  readonly label: string;
  readonly defaultMaterial: string;
  readonly materialIds: readonly string[];
  readonly meshKeywords: readonly string[];
};

/** Mesh metadata required for wall hover/click interaction. */
export type WallSurface = {
  readonly mesh: THREE.Mesh;
  readonly zoneId: ZoneId;
};

/** Door object animated by the door interaction controller. */
export type DoorInteraction = {
  readonly pivot: THREE.Group;
  readonly mesh: THREE.Mesh;
  readonly label: string;
  readonly closedAngle: number;
  readonly openAngle: number;
  currentAngle: number;
  targetAngle: number;
  readonly rigidBody?: any;
};

/** Texture set used for a physically based material. */
export type PbrTextureSet = {
  readonly color: string;
  readonly normal?: string;
  readonly roughness?: string;
  readonly ao?: string;
  readonly height?: string;
  readonly repeat: readonly [number, number];
  readonly roughnessValue: number;
};

/** Runtime material information shown by the wallpaper panel. */
export type WallpaperOption = {
  readonly id: WallpaperId;
  readonly label: string;
  readonly previewUrl: string;
};

/** Optional static physics proxy for an imported decorative model. */
export type PlacementCollider = {
  readonly halfExtents: Vector3Tuple;
  readonly offset: Vector3Tuple;
};

/** Size hints used to normalize imported models into architectural scale. */
export type PlacementFit = {
  readonly width?: number;
  readonly depth?: number;
  readonly height?: number;
};

/** Config entry for a model instance placed inside or around the house. */
export type ModelPlacement = {
  readonly name: string;
  readonly path: string;
  readonly position: Vector3Tuple;
  readonly rotationY: number;
  readonly fit: PlacementFit;
  readonly collider?: PlacementCollider;
  readonly lodDistance?: number;
};

/** Public controls exposed to debug UI without coupling it to implementation. */
export type HouseDebugApi = {
  setInteriorLightIntensity(value: number): void;

  setFirstFloorVisible(value: boolean): void;
  setSecondFloorVisible(value: boolean): void;
  playIntroTour(): void;
};
