import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import type {
  AssetStreamingPriority,
  AssetStreamingScheduler,
} from '../../../core/AssetStreamingScheduler.ts';
import { ModelLoader } from '../../../loaders/ModelLoader.ts';
import { forEachMaterial } from '../../../shared/three/dispose.ts';
import {
  HOUSE_CONFIG,
  HOUSE_MODEL_PLACEMENTS,
  HOUSE_RENDERING_CONFIG,
} from '../architecturalHouseConfig.ts';
import type { ModelPlacement, PlacementCollider } from '../types.ts';

type CachedModel = Promise<THREE.Group>;

const NON_BLOCKING_MODEL_PATTERNS = [
  /painting/i,
  /mirror/i,
  /curtains/i,
  /balconyrailing/i,
  /livingtv/i,
] as const;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Loads imported models, normalizes scale, and creates coarse static proxies. */
export class FurnishingSystem {
  private readonly world: RAPIER.World;
  private readonly root: THREE.Group;
  private readonly scheduler: AssetStreamingScheduler;
  private readonly loader = new ModelLoader();
  private readonly cache = new Map<string, CachedModel>();
  private readonly rigidBodies: RAPIER.RigidBody[] = [];
  private readonly rotatedOffset = new THREE.Vector3();
  private readonly proxyMaterial = new THREE.MeshStandardMaterial({
    name: 'FurnishingLODProxy',
    color: 0x6c6257,
    roughness: 0.72,
    metalness: 0.02,
    envMapIntensity: 0.42,
  });

  /**
   * @param world - Active Rapier world.
   * @param root - Feature root receiving model instances.
   */
  constructor(
    world: RAPIER.World,
    root: THREE.Group,
    scheduler: AssetStreamingScheduler,
  ) {
    this.world = world;
    this.root = root;
    this.scheduler = scheduler;
  }

  /** Streams and places all configured imported assets. */
  async load(): Promise<void> {
    for (const [index, placement] of HOUSE_MODEL_PLACEMENTS.entries()) {
      try {
        await this.scheduler.enqueue(
          `furnishing:${placement.name}`,
          this.resolvePlacementPriority(index),
          async () => {
            await this.loadPlacement(placement);
          },
        );
      } catch (error) {
        console.warn(`[FurnishingSystem] Placement failed: ${placement.name}`, error);
      }
    }
  }

  /** Removes physics proxies and releases non-shared helper resources. */
  dispose(): void {
    for (const body of this.rigidBodies) {
      this.world.removeRigidBody(body);
    }

    this.rigidBodies.length = 0;
    this.cache.clear();
    this.proxyMaterial.dispose();
  }

  private async loadPlacement(placement: ModelPlacement): Promise<void> {
    const source = await this.getModel(placement.path);
    const model = source.clone(true);
    model.name = `${placement.name}Model`;
    this.prepareModel(model);
    this.normalizeModel(model, placement.fit);

    const container = new THREE.Group();
    container.name = placement.name;
    container.position.set(...placement.position);
    container.rotation.y = placement.rotationY;

    const lod = this.createLod(model, placement);
    container.add(lod);
    container.updateMatrix();
    container.matrixAutoUpdate = false;
    this.root.add(container);

    if (this.shouldCreateCollider(placement)) {
      this.addCollider(placement, model);
    }
  }

  private getModel(path: string): CachedModel {
    const cached = this.cache.get(path);
    if (cached) return cached;

    const promise = this.loader.loadModel(path);
    this.cache.set(path, promise);
    return promise;
  }

  private prepareModel(model: THREE.Group): void {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      object.castShadow = HOUSE_RENDERING_CONFIG.MODEL_CAST_SHADOWS;
      object.receiveShadow = true;
      object.frustumCulled = true;

      forEachMaterial(object.material, (material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return;

        material.envMapIntensity = Math.max(
          material.envMapIntensity,
          HOUSE_RENDERING_CONFIG.MODEL_ENV_INTENSITY,
        );
        material.roughness = Math.max(
          material.roughness,
          HOUSE_RENDERING_CONFIG.MODEL_OPAQUE_ROUGHNESS_MIN,
        );
        material.needsUpdate = true;
      });
    });
  }

  private normalizeModel(model: THREE.Group, fit: ModelPlacement['fit']): void {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const candidates = [
      fit.width ? fit.width / size.x : Number.POSITIVE_INFINITY,
      fit.height ? fit.height / size.y : Number.POSITIVE_INFINITY,
      fit.depth ? fit.depth / size.z : Number.POSITIVE_INFINITY,
    ];
    const scale = Math.min(...candidates.filter(Number.isFinite));
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

    model.scale.setScalar(safeScale);
    model.position.set(
      -center.x * safeScale,
      -bounds.min.y * safeScale,
      -center.z * safeScale,
    );
    model.updateMatrixWorld(true);
  }

  private createLod(model: THREE.Group, placement: ModelPlacement): THREE.LOD {
    const lod = new THREE.LOD();
    lod.name = `${placement.name}LOD`;
    lod.addLevel(model, 0);

    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      this.proxyMaterial,
    );
    proxy.name = `${placement.name}Proxy`;
    proxy.position.copy(center);
    proxy.castShadow = true;
    proxy.receiveShadow = true;
    lod.addLevel(proxy, placement.lodDistance ?? HOUSE_RENDERING_CONFIG.LOD_PROXY_DISTANCE);
    return lod;
  }

  private addCollider(placement: ModelPlacement, model: THREE.Group): void {
    const root = HOUSE_CONFIG.ROOT_POSITION;
    const collider = placement.collider ?? this.createComputedCollider(model);
    const offset = collider.offset;
    const position = placement.position;
    const halfAngle = placement.rotationY / 2;
    this.rotatedOffset
      .set(offset[0], offset[1], offset[2])
      .applyAxisAngle(WORLD_UP, placement.rotationY);

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(
          root[0] + position[0] + this.rotatedOffset.x,
          root[1] + position[1] + this.rotatedOffset.y,
          root[2] + position[2] + this.rotatedOffset.z,
        )
        .setRotation({
          x: 0,
          y: Math.sin(halfAngle),
          z: 0,
          w: Math.cos(halfAngle),
        }),
    );

    const halfExtents = collider.halfExtents;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2]),
      body,
    );
    this.rigidBodies.push(body);
  }

  private createComputedCollider(model: THREE.Group): PlacementCollider {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    return {
      halfExtents: [
        Math.max(size.x * 0.46, 0.16),
        Math.max(size.y * 0.48, 0.18),
        Math.max(size.z * 0.46, 0.16),
      ],
      offset: [center.x, center.y, center.z],
    };
  }

  private shouldCreateCollider(placement: ModelPlacement): boolean {
    if (placement.collider) return true;

    return !NON_BLOCKING_MODEL_PATTERNS.some((pattern) => pattern.test(placement.name));
  }

  private resolvePlacementPriority(index: number): AssetStreamingPriority {
    if (index < 8) return 'near';
    if (index < 20) return 'background';
    return 'idle';
  }
}
