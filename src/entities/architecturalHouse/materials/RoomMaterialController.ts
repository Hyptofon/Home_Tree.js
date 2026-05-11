import * as THREE from 'three';

import { HOUSE_ROOMS } from '../architecturalHouseConfig.ts';
import { HouseMaterialFactory } from './HouseMaterialFactory.ts';
import type {
  RoomDefinition,
  RoomId,
  WallSurface,
  WallpaperId,
  WallpaperOption,
} from '../types.ts';

/** Owns per-room wall material state and material swapping. */
export class RoomMaterialController {
  private readonly materialFactory: HouseMaterialFactory;
  private readonly wallsByRoom = new Map<RoomId, THREE.Mesh[]>();
  private readonly activeWallpaperByRoom = new Map<RoomId, WallpaperId>();
  private readonly roomsById = new Map<RoomId, RoomDefinition>();

  /**
   * @param materialFactory - Factory used to create cloned wall materials.
   * @param wallSurfaces - Interactable wall meshes grouped by room.
   */
  constructor(
    materialFactory: HouseMaterialFactory,
    wallSurfaces: readonly WallSurface[],
  ) {
    this.materialFactory = materialFactory;

    for (const room of HOUSE_ROOMS) {
      this.roomsById.set(room.id, room);
      this.activeWallpaperByRoom.set(room.id, room.defaultWallpaper);
    }

    for (const surface of wallSurfaces) {
      const meshes = this.wallsByRoom.get(surface.roomId) ?? [];
      meshes.push(surface.mesh);
      this.wallsByRoom.set(surface.roomId, meshes);
    }

    // HouseStructureBuilder already assigns default wall materials. The
    // controller only tracks state until the user requests a material swap.
  }

  /**
   * Applies a wallpaper variant to every wall owned by a room.
   *
   * @param roomId - Room id receiving the material.
   * @param wallpaperId - Wallpaper variant id.
   */
  applyWallpaper(roomId: RoomId, wallpaperId: WallpaperId): void {
    const room = this.getRoom(roomId);
    if (!room.wallpaperIds.includes(wallpaperId)) return;

    const walls = this.wallsByRoom.get(roomId);
    if (!walls) return;

    this.activeWallpaperByRoom.set(roomId, wallpaperId);

    for (const [index, wall] of walls.entries()) {
      this.disposeWallMaterial(wall);
      wall.material = this.materialFactory.createWallpaperMaterial(
        wallpaperId,
        `Wall_${roomId}_${wallpaperId}_${index}`,
      );
    }
  }

  /** Applies one wallpaper to all rooms that support it. */
  applyWallpaperEverywhere(wallpaperId: WallpaperId): void {
    for (const room of this.roomsById.values()) {
      if (room.wallpaperIds.includes(wallpaperId)) {
        this.applyWallpaper(room.id, wallpaperId);
      }
    }
  }

  /** Returns the room config for an id. */
  getRoom(roomId: RoomId): RoomDefinition {
    const room = this.roomsById.get(roomId);
    if (!room) throw new Error(`Unknown room: ${roomId}`);
    return room;
  }

  /** Returns the selected wallpaper id for a room. */
  getActiveWallpaper(roomId: RoomId): WallpaperId {
    return this.activeWallpaperByRoom.get(roomId) ?? this.getRoom(roomId).defaultWallpaper;
  }

  /** Returns material options allowed in the given room. */
  getWallpaperOptions(roomId: RoomId): WallpaperOption[] {
    return this.materialFactory.getWallpaperOptions(this.getRoom(roomId).wallpaperIds);
  }

  /** Releases cloned materials currently assigned to wall meshes. */
  dispose(): void {
    for (const walls of this.wallsByRoom.values()) {
      for (const wall of walls) {
        this.disposeWallMaterial(wall);
      }
    }

    this.wallsByRoom.clear();
    this.activeWallpaperByRoom.clear();
    this.roomsById.clear();
  }

  private disposeWallMaterial(mesh: THREE.Mesh): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.dispose();
    }
  }
}
