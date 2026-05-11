import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

import type { AssetStreamingScheduler } from '../../../core/AssetStreamingScheduler.ts';
import { HouseMaterialFactory } from '../materials/HouseMaterialFactory.ts';

const FONT_PATH = '/fonts/helvetiker_regular.typeface.json';

/** Adds volumetric architectural project title text. */
export class SignageSystem {
  private readonly scheduler: AssetStreamingScheduler;
  private readonly loader = new FontLoader();
  private readonly material: THREE.MeshStandardMaterial;
  private textMesh: THREE.Mesh | null = null;

  /**
   * @param materials - Material factory used for the text material.
   */
  constructor(materials: HouseMaterialFactory, scheduler: AssetStreamingScheduler) {
    this.scheduler = scheduler;
    this.material = materials.createSolidMaterial('BronzeSignage', 0xd8b06a, 0.34, 0.22);
  }

  /**
   * Loads the font and adds extruded text to the house frontage.
   *
   * @param root - House root receiving signage.
   */
  async load(root: THREE.Group): Promise<void> {
    await this.scheduler.enqueue('signage:project-title', 'idle', async () => {
      await this.loadText(root);
    });
  }

  private async loadText(root: THREE.Group): Promise<void> {
    const font = await this.loader.loadAsync(FONT_PATH);
    const geometry = new TextGeometry('SERENE HOUSE', {
      font,
      size: 0.58,
      depth: 0.065,
      curveSegments: 10,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.01,
      bevelSegments: 2,
    });
    geometry.center();

    this.textMesh = new THREE.Mesh(geometry, this.material);
    this.textMesh.name = 'VolumetricProjectTitle';
    this.textMesh.position.set(0, 1.72, -12.02);
    this.textMesh.rotation.y = 0;
    this.textMesh.castShadow = true;
    this.textMesh.receiveShadow = true;
    root.add(this.textMesh);
  }

  /** Releases text geometry and material. */
  dispose(): void {
    this.textMesh?.geometry.dispose();
    this.material.dispose();
  }
}
