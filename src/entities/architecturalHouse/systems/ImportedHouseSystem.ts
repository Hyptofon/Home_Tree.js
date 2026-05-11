import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import type { AssetStreamingScheduler } from '../../../core/AssetStreamingScheduler.ts';
import { ModelLoader } from '../../../loaders/ModelLoader.ts';
import { disposeObjectTree } from '../../../shared/three/dispose.ts';
import { HOUSE_CONFIG, HOUSE_EDITABLE_ZONES } from '../architecturalHouseConfig.ts';
import type { DoorInteraction, WallSurface } from '../types.ts';
import type { Disposable } from '../../../types/interfaces.ts';

const HOUSE_MODEL_PATH = '/models/imported_house/house.gltf';

/** Maps GLTF mesh names from house.gltf to material descriptors. */
const MESH_MATERIAL_MAP = {
  /** Exterior brick walls – warm red-orange brick tint */
  Waende_EG: { color: 0x9b5b3a, roughness: 0.88, metalness: 0 },
  Waende_OG: { color: 0x9b5b3a, roughness: 0.88, metalness: 0 },
  Waende_Terras: { color: 0x9b5b3a, roughness: 0.88, metalness: 0 },

  /** Roof – dark anthracite slate */
  Dach: { color: 0x2e2e2e, roughness: 0.72, metalness: 0.08 },
  Dachstock: { color: 0x2e2e2e, roughness: 0.72, metalness: 0.08 },

  /** Concrete / stone base, paths, entry plates */
  Sockel: { color: 0xc8c0b2, roughness: 0.82, metalness: 0 },
  mauer: { color: 0xc8c0b2, roughness: 0.82, metalness: 0 },
  Platten_Eingang: { color: 0xd6d0c4, roughness: 0.78, metalness: 0 },
  Platten_H_Eingang: { color: 0xd6d0c4, roughness: 0.78, metalness: 0 },
  Platten_Terras: { color: 0xd0c8bc, roughness: 0.80, metalness: 0 },
  Wege: { color: 0x6a6560, roughness: 0.85, metalness: 0 },

  /** Structural floor above ground */
  Bodenplatte_OG: { color: 0xbcb6ae, roughness: 0.80, metalness: 0 },

  /** Staircase – warm oak */
  Treppe: { color: 0x8b6344, roughness: 0.70, metalness: 0 },

  /** Metal railings & frames */
  Balkon_gelaender: { color: 0x282828, roughness: 0.40, metalness: 0.82 },
  Eingang_gelaender: { color: 0x282828, roughness: 0.40, metalness: 0.82 },
  F_Rahmen: { color: 0x1e1e1e, roughness: 0.36, metalness: 0.90 },
  T_Rahmen: { color: 0x1e1e1e, roughness: 0.36, metalness: 0.90 },

  /** Drainage pipes */
  Dachablauf_Kanal_terras: { color: 0x383838, roughness: 0.42, metalness: 0.88 },
  Dachablauf_ablaufrohr_terras: { color: 0x383838, roughness: 0.42, metalness: 0.88 },
  Dachablauf_Fallrohre: { color: 0x383838, roughness: 0.42, metalness: 0.88 },
  Dachablauf_Rohr_001: { color: 0x383838, roughness: 0.42, metalness: 0.88 },
  Dachablauf_Rohr_002: { color: 0x383838, roughness: 0.42, metalness: 0.88 },
  Dachablauf_Kanal_gross: { color: 0x383838, roughness: 0.42, metalness: 0.88 },

  /** Doors – oak wood */
  Doors: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
  Front_Door: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
  Back_Door: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
  Side_Door: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
  Inner_Door: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
  Top_Left_Door: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
  Top_Right_Door: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
  Top_Inner_Door_Left: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
  Top_Inner_Door_Right: { color: 0x7a5230, roughness: 0.68, metalness: 0 },
} as const satisfies Record<string, { color: number; roughness: number; metalness: number }>;

/** Glass parameters shared by all window panes. */
const GLASS_PARAMS = {
  color: 0x8aa8bc,
  roughness: 0.04,
  metalness: 0,
  transmission: 0.72,
  thickness: 0.08,
  transparent: true,
  opacity: 0.42,
  envMapIntensity: 1.2,
} as const;

type ImportedHouseSystemOptions = {
  readonly world: RAPIER.World;
  readonly sceneRoot: THREE.Group;
  readonly scheduler: AssetStreamingScheduler;
};

/**
 * Loads and integrates the imported `house.gltf` 3D model as the primary
 * building in the estate scene, replacing the procedural HouseStructureBuilder.
 *
 * Responsibilities:
 *  - Streams the GLTF asynchronously via the shared AssetStreamingScheduler.
 *  - Applies PBR materials per-mesh using MESH_MATERIAL_MAP.
 *  - Scales and centres the model to align with the estate coordinate system.
 *  - Registers simple Rapier cuboid colliders for the ground floor footprint.
 *  - Exposes dispose() to release GPU and physics resources.
 */
export class ImportedHouseSystem implements Disposable {
  public readonly doors: DoorInteraction[] = [];
  public readonly editableSurfaces: WallSurface[] = [];
  private readonly world: RAPIER.World;
  private readonly root = new THREE.Group();
  private readonly scheduler: AssetStreamingScheduler;
  private readonly loader = new ModelLoader();
  private readonly rigidBodies: RAPIER.RigidBody[] = [];
  private readonly materials: THREE.Material[] = [];
  private houseModel: THREE.Group | null = null;

  constructor(options: ImportedHouseSystemOptions) {
    this.world = options.world;
    this.scheduler = options.scheduler;
    this.root.name = 'ImportedHouseRoot';
    options.sceneRoot.add(this.root);
  }

  /**
   * Streams the GLTF model, applies materials, positions it in the world,
   * and registers physics colliders.
   */
  async load(): Promise<void> {
    await this.scheduler.enqueue('imported-house:model', 'idle', async () => {
      const source = await this.loader.loadModel(HOUSE_MODEL_PATH);

      // Every mesh node in house.gltf has a baked rotation quaternion
      // [0.707, 0, 0, 0.707] = +90° around X (FBX-to-GLTF Z-up conversion).
      // Three.js applies this per-child, so resetting the scene-root rotation
      // has no effect. We counter-rotate each top-level child by −90° X.
      const counterQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, 0),
      );
      for (const child of source.children) {
        child.quaternion.premultiply(counterQ);
        child.updateMatrixWorld(true);
      }

      this.applyMaterials(source);
      this.positionModel(source);
      this.enableShadows(source);
      this.extractDoors(source);

      this.houseModel = source;
      this.root.add(source);

      // CRITICAL: Force matrix update AFTER adding to the scene graph
      // so that mesh.matrixWorld is perfectly synced with the actual world space
      // before we extract vertices for Rapier trimeshes.
      this.root.updateMatrixWorld(true);

      this.registerColliders();
    });
  }

  /** Releases GPU materials, Rapier bodies, and scene nodes. */
  dispose(): void {
    for (const body of this.rigidBodies) {
      this.world.removeRigidBody(body);
    }
    this.rigidBodies.length = 0;

    for (const mat of this.materials) {
      mat.dispose();
    }
    this.materials.length = 0;

    if (this.houseModel) {
      disposeObjectTree(this.houseModel);
      this.houseModel = null;
    }

    this.root.removeFromParent();
    this.root.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private applyMaterials(model: THREE.Group): void {
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      name: 'ImportedHouseGlass',
      ...GLASS_PARAMS,
    });
    this.materials.push(glassMaterial);

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      if (child.name === 'mauer') {
        child.visible = false;
        return;
      }
      child.castShadow = true;
      child.receiveShadow = true;

      // Glass panes
      if (child.name === 'F_Glas') {
        child.material = glassMaterial;
        child.castShadow = false;
        return;
      }

      const meshName = child.name as keyof typeof MESH_MATERIAL_MAP;

      const desc = MESH_MATERIAL_MAP[meshName];
      if (desc) {
        const mat = new THREE.MeshStandardMaterial({
          name: `ImportedHouse_${meshName}`,
          color: desc.color,
          roughness: desc.roughness,
          metalness: desc.metalness,
        });
        this.materials.push(mat);
        child.material = mat;
      }
      // meshes not in the map keep their embedded material
      
      // Check if it belongs to an editable zone
      for (const zone of HOUSE_EDITABLE_ZONES) {
        if (zone.meshKeywords.some((keyword) => child.name.includes(keyword))) {
          child.userData['zoneId'] = zone.id;
          this.editableSurfaces.push({
            mesh: child,
            zoneId: zone.id,
          });
          break; // Assign to first matching zone
        }
      }
    });
  }

  /**
   * Measures the loaded model's bounding box, scales it to fit
   * roughly within the estate bounds, and aligns it on the ground plane.
   *
   * The original house's coordinate system has Z pointing up; GLTF
   * export (Z-up → Y-up conversion) is handled by Three.js automatically.
   */
  private positionModel(model: THREE.Group): void {
    // First pass: measure the raw (possibly sideways) bounding box
    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);

    // Determine the longest horizontal span regardless of axis orientation.
    // The house width (X) after correct orientation should be the largest dimension.
    const longestSpan = Math.max(rawSize.x, rawSize.y, rawSize.z);

    // Target: We originally scaled it to 2x estate width, but the user requested 
    // to shrink it by 1.5x. So it becomes (2 / 1.5) = 1.333x of the estate width.
    const estateWidth = HOUSE_CONFIG.HOUSE_BOUNDS.MAX_X - HOUSE_CONFIG.HOUSE_BOUNDS.MIN_X; // 24m
    const targetWidth = (estateWidth * 2) / 1.5; // 32m
    const scaleFactor = targetWidth / longestSpan;
    model.scale.setScalar(scaleFactor);
    model.updateMatrixWorld(true);

    // Second pass: re-measure after scaling to correctly pin base to Y=0
    const scaledBox = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);

    // Centre horizontally, sit exactly on the ground
    model.position.set(
      -center.x,
      -scaledBox.min.y,
      -center.z,
    );

    model.name = 'ImportedHouseModel';
    model.updateMatrixWorld(true);
  }

  private enableShadows(model: THREE.Group): void {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  /** Extracts doors, creates pivot groups for hinges, and registers interaction data. */
  private extractDoors(model: THREE.Group): void {
    const doorMeshes: THREE.Mesh[] = [];
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.includes('Door')) {
        doorMeshes.push(child);
      }
    });

    for (const mesh of doorMeshes) {
      const parent = mesh.parent;
      if (!parent) continue;

      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);

      // The geometry bounding box is in the raw vertex coordinate space (Z-up, unscaled).
      const hingeLocal = new THREE.Vector3();
      box.getCenter(hingeLocal);

      // Doors hinge on their edge. Since the house model doors are wider in X,
      // we snap the hinge to min.x
      if (size.x > size.z) {
        hingeLocal.x = box.min.x;
      } else {
        hingeLocal.z = box.min.z;
      }

      // 1. Create a pivot group that will be positioned exactly at the hinge location.
      const pivot = new THREE.Group();
      pivot.name = `${mesh.name}_Pivot`;

      // The `hingeLocal` vector is in un-scaled, un-rotated space. We must apply 
      // the mesh's scale and local rotation so the pivot sits in the correct 
      // local space relative to the parent.
      const pivotPos = hingeLocal.clone().multiply(mesh.scale).applyQuaternion(mesh.quaternion);
      pivot.position.copy(pivotPos);

      // The pivot takes on the mesh's rotational and scale transforms.
      pivot.quaternion.copy(mesh.quaternion);
      pivot.scale.copy(mesh.scale);

      // 2. Instead of mutating the geometry (which might be an InterleavedBuffer 
      // shared by all doors, causing massive offsets), we nest the mesh inside the pivot
      // and offset its local position by the inverse of the hinge.
      mesh.position.set(-hingeLocal.x, -hingeLocal.y, -hingeLocal.z);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);

      parent.add(pivot);
      pivot.add(mesh);

      // Determine door opening angle based on name (just a heuristic for interior/exterior)
      const isLeft = mesh.name.includes('Left') || mesh.name === 'Front_Door';
      const openAngle = isLeft ? Math.PI / 2 : -Math.PI / 2;

      this.doors.push({
        pivot,
        mesh,
        label: mesh.name.replace(/_/g, ' '),
        closedAngle: 0,
        openAngle,
        currentAngle: 0,
        targetAngle: 0,
      });
    }
  }

  /**
   * Generates exact trimesh colliders for the structural parts of the house
   * so the player can walk on the floors and stairs, and bump into walls.
   * 
   * OPTIMIZATION: Only create colliders for essential structural elements
   * to reduce physics overhead and prevent invisible wall artifacts.
   */
  private registerColliders(): void {
    if (!this.houseModel) return;

    // Only create colliders for core structural elements and avoid any glass / frame geometry.
    const STRUCTURAL_KEYWORDS = ['Sockel', 'Bodenplatte', 'Treppe', 'Platten', 'Waende'];

    this.houseModel.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.visible) return;
      if (this.isUnsupportedCollisionMesh(child)) return;

      const isStructural = STRUCTURAL_KEYWORDS.some((keyword) => child.name.includes(keyword));
      if (!isStructural) return;

      this.createTrimeshCollider(child);
    });

  }

  private isUnsupportedCollisionMesh(mesh: THREE.Mesh): boolean {
    const name = mesh.name.toLowerCase();
    if (name.includes('glas') || name.includes('glaz') || name.includes('rahmen') || name.includes('frame') || name.includes('window')) {
      return true;
    }

    const material = mesh.material as any;
    if (Array.isArray(material)) {
      return material.some((mat) => mat?.transparent || mat?.opacity < 0.95);
    }

    return material?.transparent || material?.opacity < 0.95;
  }

  private createTrimeshCollider(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();

    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;

    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    if (size.x < 0.05 || size.y < 0.05 || size.z < 0.05) return;

    const positionAttribute = geometry.attributes.position;
    if (!positionAttribute) return;

    const positions = positionAttribute.array as Float32Array;
    const index = geometry.index;
    const indices = index
      ? new Uint32Array(index.array as ArrayLike<number>)
      : new Uint32Array(positions.length / 3).map((_, i) => i);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(bodyDesc);
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices), body);
    this.rigidBodies.push(body);
  }

}

