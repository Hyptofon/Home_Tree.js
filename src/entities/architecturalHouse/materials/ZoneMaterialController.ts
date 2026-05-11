import * as THREE from 'three';

import { HOUSE_EDITABLE_ZONES } from '../architecturalHouseConfig.ts';
import { HouseMaterialFactory } from './HouseMaterialFactory.ts';
import type {
  MaterialZoneDefinition,
  ZoneId,
  WallSurface,
  WallpaperOption,
} from '../types.ts';

/** Owns per-zone material state and material swapping. */
export class ZoneMaterialController {
  private readonly materialFactory: HouseMaterialFactory;
  private readonly meshesByZone = new Map<ZoneId, THREE.Mesh[]>();
  private readonly activeMaterialByZone = new Map<ZoneId, string>();
  private readonly zonesById = new Map<ZoneId, MaterialZoneDefinition>();

  /**
   * @param materialFactory - Factory used to create cloned wall materials.
   * @param wallSurfaces - Interactable meshes grouped by zone.
   */
  constructor(
    materialFactory: HouseMaterialFactory,
    wallSurfaces: readonly WallSurface[],
  ) {
    this.materialFactory = materialFactory;

    for (const zone of HOUSE_EDITABLE_ZONES) {
      this.zonesById.set(zone.id, zone);
      this.activeMaterialByZone.set(zone.id, zone.defaultMaterial);
    }

    this.registerSurfaces(wallSurfaces);
  }

  /** Dynamically registers surfaces after initialization. */
  registerSurfaces(surfaces: readonly WallSurface[]): void {
    for (const surface of surfaces) {
      const meshes = this.meshesByZone.get(surface.zoneId) ?? [];
      meshes.push(surface.mesh);
      this.meshesByZone.set(surface.zoneId, meshes);
    }
  }

  /**
   * Applies a material variant to every mesh owned by a zone.
   *
   * @param zoneId - Zone id receiving the material.
   * @param materialId - Material variant id.
   */
  applyMaterial(zoneId: ZoneId, materialId: string): void {
    const zone = this.getZone(zoneId);
    if (!zone.materialIds.includes(materialId)) return;

    const meshes = this.meshesByZone.get(zoneId);
    if (!meshes) return;

    this.activeMaterialByZone.set(zoneId, materialId);

    for (const [index, mesh] of meshes.entries()) {
      this.disposeWallMaterial(mesh);
      mesh.material = this.materialFactory.createZoneMaterial(
        materialId,
        `Zone_${zoneId}_${materialId}_${index}`,
      );
    }
  }

  /** Applies one material to all zones that support it. */
  applyMaterialEverywhere(materialId: string): void {
    for (const zone of this.zonesById.values()) {
      if (zone.materialIds.includes(materialId)) {
        this.applyMaterial(zone.id, materialId);
      }
    }
  }

  /** Returns the zone config for an id. */
  getZone(zoneId: ZoneId): MaterialZoneDefinition {
    const zone = this.zonesById.get(zoneId);
    if (!zone) throw new Error(`Unknown zone: ${zoneId}`);
    return zone;
  }

  /** Returns the selected material id for a zone. */
  getActiveMaterial(zoneId: ZoneId): string {
    return this.activeMaterialByZone.get(zoneId) ?? this.getZone(zoneId).defaultMaterial;
  }

  /** Returns material options allowed in the given zone. */
  getMaterialOptions(zoneId: ZoneId): WallpaperOption[] {
    return this.materialFactory.getMaterialOptions(this.getZone(zoneId).materialIds);
  }

  /** Releases cloned materials currently assigned to meshes. */
  dispose(): void {
    for (const meshes of this.meshesByZone.values()) {
      for (const mesh of meshes) {
        this.disposeWallMaterial(mesh);
      }
    }

    this.meshesByZone.clear();
    this.activeMaterialByZone.clear();
    this.zonesById.clear();
  }

  private disposeWallMaterial(mesh: THREE.Mesh): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material.name.startsWith('Zone_')) {
        material.dispose();
      }
    }
  }
}
