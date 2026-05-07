import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { ENVIRONMENT_CONFIG } from './environmentConfig.ts';

/**
 * Owns the static environment layer and its matching Rapier colliders.
 *
 * The class is deliberately narrow: it builds world geometry, registers fixed
 * physics bodies, exposes a single scene attachment method, and releases the
 * resources it creates. Dynamic weather, sky, and lighting stay in dedicated
 * systems such as DayNightCycle.
 */
export class Environment {
  /** Root node containing every visual object created by this environment. */
  private readonly group = new THREE.Group();

  /** Fixed Rapier bodies created by this environment for deterministic cleanup. */
  private readonly rigidBodies: RAPIER.RigidBody[] = [];

  /** Active Rapier world used to register fixed colliders. */
  private readonly world: RAPIER.World;

  /**
   * Builds the configured static scene geometry and physics colliders.
   *
   * @param world - Initialized Rapier world that owns all static bodies.
   */
  constructor(world: RAPIER.World) {
    this.world = world;
    this.group.name = 'Environment';

    this.buildFloor();
    this.buildGrid();
    this.buildBoxProps();
  }

  /**
   * Adds the environment root to a scene.
   *
   * @param scene - Three.js scene that should render the environment.
   */
  addTo(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  /**
   * Removes the environment from its parent and releases all owned GPU and
   * physics resources. Safe to call during scene teardown.
   */
  dispose(): void {
    this.group.removeFromParent();

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        this.collectMaterials(object.material, materials);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();

    for (const rigidBody of this.rigidBodies) {
      this.world.removeRigidBody(rigidBody);
    }
    this.rigidBodies.length = 0;
    this.group.clear();
  }

  /** Builds the ground plane visual and its fixed cuboid collider. */
  private buildFloor(): void {
    const { FLOOR } = ENVIRONMENT_CONFIG;
    const halfSize = FLOOR.SIZE / 2;
    const halfThickness = FLOOR.THICKNESS / 2;

    const geometry = new THREE.PlaneGeometry(
      FLOOR.SIZE,
      FLOOR.SIZE,
      FLOOR.SEGMENTS,
      FLOOR.SEGMENTS,
    );
    const material = new THREE.MeshStandardMaterial({
      color: FLOOR.COLOR,
      roughness: FLOOR.ROUGHNESS,
      metalness: FLOOR.METALNESS,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'EnvironmentFloor';
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const rigidBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -halfThickness, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfSize, halfThickness, halfSize),
      rigidBody,
    );
    this.rigidBodies.push(rigidBody);
  }

  /** Builds a subtle ground reference grid for player scale and orientation. */
  private buildGrid(): void {
    const { GRID } = ENVIRONMENT_CONFIG;
    const grid = new THREE.GridHelper(
      GRID.SIZE,
      GRID.DIVISIONS,
      GRID.COLOR,
      GRID.COLOR,
    );
    const material = grid.material as THREE.LineBasicMaterial;
    material.opacity = GRID.OPACITY;
    material.transparent = true;
    grid.name = 'EnvironmentGrid';
    this.group.add(grid);
  }

  /** Builds configured box props and matching fixed physics colliders. */
  private buildBoxProps(): void {
    const { BOX_PROPS } = ENVIRONMENT_CONFIG;
    const geometry = new THREE.BoxGeometry(...BOX_PROPS.GEOMETRY);
    const material = new THREE.MeshStandardMaterial({
      color: BOX_PROPS.COLOR,
      roughness: BOX_PROPS.ROUGHNESS,
    });

    for (const [x, y, z] of BOX_PROPS.POSITIONS) {
      const box = new THREE.Mesh(geometry, material);
      box.name = 'EnvironmentBoxProp';
      box.position.set(x, y, z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.group.add(box);

      const rigidBody = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(...BOX_PROPS.COLLIDER_HALF_EXTENTS),
        rigidBody,
      );
      this.rigidBodies.push(rigidBody);
    }
  }

  /**
   * Collects either a single material or a material array produced by a mesh.
   *
   * @param material - Material instance or material array from a Three.js mesh.
   * @param target - Set that receives unique material instances.
   */
  private collectMaterials(
    material: THREE.Material | THREE.Material[],
    target: Set<THREE.Material>,
  ): void {
    if (Array.isArray(material)) {
      for (const item of material) target.add(item);
      return;
    }

    target.add(material);
  }
}
