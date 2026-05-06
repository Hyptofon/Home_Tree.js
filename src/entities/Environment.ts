import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Builds and owns static scene geometry (floor, props, sky helpers) and their 
 * physical representations.
 * 

 * - Independent of player and core game logic.
 * - Easily extensible by adding more `build*()` methods without modifying existing ones.
 */
export class Environment {
  /**
   * Internal Three.js group holding all visual static meshes.
   */
  private readonly group = new THREE.Group();
  
  /**
   * Reference to the Rapier physics world for collider creation.
   */
  private readonly world: RAPIER.World;

  /**
   * Constructs the static environment and registers its physics colliders.
   * 
   * @param world The active Rapier physics world.
   */
  constructor(world: RAPIER.World) {
    this.world = world;
    this.buildFloor();
    this.buildGrid();
    this.buildProps();
  }

  /**
   * Adds the entire environment group to the provided Three.js Scene.
   * 
   * @param scene The active THREE.Scene.
   */
  addTo(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  /**
   * Builds the flat floor plane mesh, adds an infinite grid helper,
   * and registers a fixed physical plane collider in the physics engine.
   */
  private buildFloor(): void {
    const geo = new THREE.PlaneGeometry(200, 200, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color:     0x4a7c3f,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x  = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setTranslation(0, -0.5, 0);
    this.world.createCollider(colliderDesc);
  }

  private buildGrid(): void {
    const grid = new THREE.GridHelper(200, 100, 0x000000, 0x000000);
    const mat  = grid.material as THREE.LineBasicMaterial;
    mat.opacity     = 0.08;
    mat.transparent = true;
    this.group.add(grid);
  }

  /**
   * Generates a series of static box props around the scene.
   * Creates the visual Three.js BoxMesh and the corresponding fixed Rapier cuboid collider for each box.
   */
  private buildProps(): void {
    const geo = new THREE.BoxGeometry(1, 2, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });

    const positions: [number, number, number][] = [
      [ 5, 1, -5], [-5, 1, -5],
      [ 8, 1,  3], [-8, 1,  3],
      [12, 1, -8], [-12, 1, 8],
    ];

    for (const [x, y, z] of positions) {
      const box = new THREE.Mesh(geo, mat);
      box.position.set(x, y, z);
      box.castShadow    = true;
      box.receiveShadow = true;
      this.group.add(box);

      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
      const rigidBody = this.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 1.0, 0.5);
      this.world.createCollider(colliderDesc, rigidBody);
    }
  }
}
