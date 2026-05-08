import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import type { Disposable } from '../../types/interfaces.ts';
import { disposeObjectTree } from '../../shared/three/dispose.ts';

const ENVIRONMENT_INTENSITY = 0.92;

/**
 * Builds a PMREM-filtered environment map for physically based materials.
 *
 * The project does not ship a separate HDR texture, so this system generates a
 * compact studio-grade high-dynamic-range probe from Three.js RoomEnvironment.
 * PBR assets still receive realistic specular response, while the sky remains
 * owned by the dynamic day/night system.
 */
export class EnvironmentMapSystem implements Disposable {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly pmremGenerator: THREE.PMREMGenerator;

  private environmentMap: THREE.Texture | null = null;

  /**
   * @param renderer - Renderer used by PMREMGenerator.
   * @param scene - Scene receiving the generated environment texture.
   */
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
  }

  /** Generates and assigns the environment map once during bootstrap. */
  init(): void {
    if (this.environmentMap) return;

    const roomEnvironment = new RoomEnvironment();
    const target = this.pmremGenerator.fromScene(roomEnvironment, 0.04);
    this.environmentMap = target.texture;
    this.environmentMap.name = 'ProceduralPMREMEnvironment';

    this.scene.environment = this.environmentMap;
    this.scene.environmentIntensity = ENVIRONMENT_INTENSITY;

    disposeObjectTree(roomEnvironment);
    target.dispose();
  }

  /** Releases generated GPU resources and detaches the scene environment. */
  dispose(): void {
    if (this.scene.environment === this.environmentMap) {
      this.scene.environment = null;
    }

    this.environmentMap?.dispose();
    this.environmentMap = null;
    this.pmremGenerator.dispose();
  }
}
