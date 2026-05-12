import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { disposeObjectTree } from '../../shared/three/dispose.ts';
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

    disposeObjectTree(this.group);

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

    const textureLoader = new THREE.TextureLoader();
    const map = textureLoader.load('/textures/terrain/leafy_grass_diff_1k.jpg');
    const normalMap = textureLoader.load('/textures/terrain/leafy_grass_normal_1k.jpg');
    const aoMap = textureLoader.load('/textures/terrain/leafy_grass_arm_1k.jpg');

    [map, normalMap, aoMap].forEach((tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(FLOOR.SIZE / 4, FLOOR.SIZE / 4); // Scale texture based on floor size
      tex.colorSpace = tex === map ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    });

    const material = new THREE.MeshStandardMaterial({
      color: 0x8a9670, // Slightly tint the grass to match the estate
      map,
      normalMap,
      aoMap,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.18,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'EnvironmentFloor';
    mesh.position.y = -0.12;
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

  /** Builds configured box props and matching fixed physics colliders. */
  private buildBoxProps(): void {
    const { BOX_PROPS } = ENVIRONMENT_CONFIG;
    if (BOX_PROPS.POSITIONS.length === 0) return;

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
}
