import * as THREE from 'three';


/**
 * Manages the core Three.js rendering pipeline.
 * 

 * - Owns the WebGLRenderer, Scene, and active Camera.
 * - Handles window resize events to keep the aspect ratio correct.
 * - Responsible strictly for rendering, knows nothing about game objects.
 */
export class SceneManager {
  /** The primary WebGL renderer used to draw the scene. */
  readonly renderer: THREE.WebGLRenderer;
  
  /** The root 3D scene holding all objects, lights, and helpers. */
  readonly scene:    THREE.Scene;
  
  /** The perspective camera defining the player's view into the scene. */
  readonly camera:   THREE.PerspectiveCamera;

  /**
   * Initializes the renderer, scene, camera, and default lighting.
   * 
   * @param canvas The HTMLCanvasElement where Three.js will draw.
   */
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace  = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog        = new THREE.Fog(0x87ceeb, 40, 100);
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 3, 8);

    this.buildLighting();

    window.addEventListener('resize', this.onResize);
  }
  /**
   * Called every frame by the GameLoop to render the active scene.
   * 
   * @param _delta Unused delta time.
   */
  update(_delta: number): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Cleans up renderer resources and removes event listeners.
   */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }

  private buildLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a7c3f, 0.8);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(15, 20, 10);
    sun.castShadow              = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near      = 0.5;
    sun.shadow.camera.far       = 100;
    sun.shadow.camera.left      = -40;
    sun.shadow.camera.right     = 40;
    sun.shadow.camera.top       = 40;
    sun.shadow.camera.bottom    = -40;
    sun.shadow.bias             = -0.001;
    this.scene.add(sun);
  }

  /**
   * Resizes the WebGL renderer and camera aspect ratio to match the 
   * current browser window dimensions.
   */
  private readonly onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
