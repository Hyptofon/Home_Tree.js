import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import type { Disposable } from '../../types/interfaces.ts';
import { disposeObjectTree } from '../../shared/three/dispose.ts';

const ENVIRONMENT_INTENSITY = 0.92;
const HDR_ENVIRONMENT_PATH = '/environment/sunset.hdr';

/**
 * Builds a PMREM-filtered environment map for physically based materials.
 *
 * The visual sky remains owned by the dynamic day/night system. This probe is
 * used for realistic PBR reflections and indirect specular response.
 */
export class EnvironmentMapSystem implements Disposable {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly pmremGenerator: THREE.PMREMGenerator;
  private readonly hdrLoader = new RGBELoader();

  private environmentMap: THREE.Texture | null = null;
  private environmentTarget: THREE.WebGLRenderTarget | null = null;

  /**
   * @param renderer - Renderer used by PMREMGenerator.
   * @param scene - Scene receiving the generated environment texture.
   */
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
  }

  /** Loads or generates and assigns the environment map once during bootstrap. */
  async init(): Promise<void> {
    if (this.environmentMap) return;

    try {
      const texture = await this.hdrLoader.loadAsync(HDR_ENVIRONMENT_PATH);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.name = 'SunsetHDRIEnvironmentSource';

      this.environmentTarget = this.pmremGenerator.fromEquirectangular(texture);
      texture.dispose();
      this.assignEnvironment('SunsetHDRIPMREMEnvironment');
      return;
    } catch (error) {
      console.warn('[EnvironmentMapSystem] HDRI load failed, using procedural PMREM.', error);
    }

    const roomEnvironment = new RoomEnvironment();
    this.environmentTarget = this.pmremGenerator.fromScene(roomEnvironment, 0.04);
    disposeObjectTree(roomEnvironment);
    this.assignEnvironment('ProceduralPMREMEnvironment');
  }

  /** Releases generated GPU resources and detaches the scene environment. */
  dispose(): void {
    if (this.scene.environment === this.environmentMap) {
      this.scene.environment = null;
    }

    this.environmentMap = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.pmremGenerator.dispose();
  }

  private assignEnvironment(name: string): void {
    if (!this.environmentTarget) return;

    this.environmentMap = this.environmentTarget.texture;
    this.environmentMap.name = name;
    this.scene.environment = this.environmentMap;
    this.scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  }
}
