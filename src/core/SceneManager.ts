import * as THREE from 'three';

import { CAMERA_CONFIG, RENDERER_CONFIG } from './coreConfig.ts';

/**
 * Manages the core Three.js rendering pipeline.
 *
 * SceneManager owns the renderer, scene, active camera, and viewport resize
 * behavior. Feature systems add content and may take over rendering through a
 * delegated postprocessing pipeline.
 */
export class SceneManager {
  /** Primary WebGL renderer used to draw the scene. */
  readonly renderer: THREE.WebGLRenderer;

  /** Root 3D scene holding all objects, lights, and helpers. */
  readonly scene: THREE.Scene;

  /** Perspective camera defining the player's view into the scene. */
  readonly camera: THREE.PerspectiveCamera;

  /**
   * When `true`, direct `renderer.render()` is skipped because another system
   * owns the final render pass, for example PostProcessingController.
   */
  delegateRendering = false;

  /**
   * Initializes renderer, scene, camera, and resize listeners.
   *
   * @param canvas - Canvas element where Three.js should render.
   */
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: RENDERER_CONFIG.ANTIALIAS,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        RENDERER_CONFIG.INITIAL_PIXEL_RATIO,
        RENDERER_CONFIG.MAX_PIXEL_RATIO,
      ),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDERER_CONFIG.TONE_MAPPING_EXPOSURE;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_CONFIG.FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_CONFIG.NEAR,
      CAMERA_CONFIG.FAR,
    );
    this.camera.position.set(...CAMERA_CONFIG.INITIAL_POSITION);

    window.addEventListener('resize', this.onResize);
  }

  /**
   * Renders the scene only when no delegated postprocessing renderer is active.
   *
   * @param _delta - Frame delta in seconds; unused by this fallback renderer.
   */
  update(_delta: number): void {
    if (!this.delegateRendering) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Removes listeners and releases renderer GPU resources. */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }

  /** Synchronizes renderer size and camera projection with the browser viewport. */
  private readonly onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
