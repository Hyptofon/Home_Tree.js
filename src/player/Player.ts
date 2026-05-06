import * as THREE from 'three';

import { CHARACTER_MODEL_PATH } from '../types/animations.ts';
import { ModelLoader } from '../loaders/ModelLoader.ts';
import { PlayerAnimator } from './PlayerAnimator.ts';
import { PlayerController } from './PlayerController.ts';
import { PlayerCamera } from './PlayerCamera.ts';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * The Player class acts as a thin Facade / Composition Root.
 * 

 * - Owns ZERO core logic. It merely orchestrates the subsystems (`PlayerAnimator`, 
 *   `PlayerController`, `PlayerCamera`).
 * - Manages the asynchronous loading of the character mesh and delegates animation loading.
 * - Exposes a clean, high-level API to the rest of the game loop.
 */
export class Player {
  /** The top-level 3D Group containing the character mesh. Add this to your Scene. */
  readonly root = new THREE.Group();

  /** Subsystem managing animation playback and blending. */
  private animator!:   PlayerAnimator;
  
  /** Subsystem managing physics, collisions, and state resolution. */
  private controller!: PlayerController;
  
  /** Subsystem managing the third/first-person follow camera. */
  private cam!:        PlayerCamera;

  /** Utility used to load external GLB assets. */
  private readonly loader = new ModelLoader();
  
  /** Tracks whether the asynchronous load has completed. */
  private loaded = false;

  /** Reference to the game's active camera. */
  private readonly camera: THREE.PerspectiveCamera;
  
  /** Reference to the active physics engine world. */
  private readonly world: RAPIER.World;

  /**
   * Initializes the Player facade.
   * 
   * @param camera The active Three.js camera for the `PlayerCamera` subsystem.
   * @param world The active Rapier physics world for the `PlayerController` subsystem.
   */
  constructor(camera: THREE.PerspectiveCamera, world: RAPIER.World) {
    this.camera = camera;
    this.world = world;
  }

  /**
   * Asynchronously loads the 3D character model, configures shadows, applies the Mixamo 
   * default 180-degree rotation, and initializes all subsystems.
   * 
   * MUST be called and awaited before `update()` is called.
   */
  async load(): Promise<void> {
    const model = await this.loader.loadModel(CHARACTER_MODEL_PATH);
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow    = true;
        obj.receiveShadow = true;
      }
    });
    
    model.rotation.y = Math.PI;
    this.root.add(model);

    this.animator   = new PlayerAnimator(model);
    this.controller = new PlayerController(this.world);
    this.cam        = new PlayerCamera(this.camera);
    await this.animator.loadClips(this.loader);
    this.animator.play('idle', 0);

    this.loaded = true;
  }

  /**
   * Toggles the camera between third-person and first-person view.
   * In first-person mode, the character's visual mesh is hidden to prevent clipping.
   * 
   * @returns True if the camera is now in first-person mode.
   */
  public toggleCamera(): boolean {
    this.cam.isFirstPerson = !this.cam.isFirstPerson;
    
    this.root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.visible = !this.cam.isFirstPerson;
      }
    });
    
    return this.cam.isFirstPerson;
  }

  /**
   * Updates the player's subsystems. Must be called once per frame.
   * Safe to call even if `load()` hasn't finished (it will early-return).
   * 
   * @param delta Frame delta time in seconds.
   */
  update(delta: number): void {
    if (!this.loaded) return;

    const { desiredAnimation } = this.controller.update(this.root, delta);
    this.animator.play(desiredAnimation);
    this.animator.update(delta);
    this.cam.update(this.root);
  }

  playAnimation(name: Parameters<PlayerAnimator['play']>[0], fadeTime?: number): void {
    this.animator?.play(name, fadeTime);
  }

  /**
   * Cleans up all resources. Call when removing the player from the scene.
   */
  dispose(): void {
    this.animator?.dispose();
    this.root.clear();
  }
}
