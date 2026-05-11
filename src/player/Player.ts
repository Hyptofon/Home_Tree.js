import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { ModelLoader } from '../loaders/ModelLoader.ts';
import { disposeObjectTree } from '../shared/three/dispose.ts';
import type { AnimationName } from '../types/animations.ts';
import { PlayerAnimator } from './PlayerAnimator.ts';
import { PlayerCamera } from './PlayerCamera.ts';
import { PlayerController } from './PlayerController.ts';
import { PLAYER_MODEL_CONFIG } from './playerConfig.ts';

/**
 * Facade and composition root for the player feature.
 *
 * Player keeps rendering, animation, physics movement, and camera control in
 * dedicated subsystems. The rest of the application interacts with this class
 * through a compact lifecycle API: load, update, toggle camera, dispose.
 */
export class Player {
  /** Top-level visual root that should be added to the scene. */
  readonly root = new THREE.Group();

  /** Utility used to load external GLB assets and clips. */
  private readonly loader = new ModelLoader();

  /** Active perspective camera controlled by PlayerCamera. */
  private readonly camera: THREE.PerspectiveCamera;

  /** Rapier world used by PlayerController. */
  private readonly world: RAPIER.World;

  /** Animation subsystem created after the model is loaded. */
  private animator!: PlayerAnimator;

  /** Movement and collision subsystem created during load. */
  private controller!: PlayerController;

  /** Camera subsystem created during load. */
  private playerCamera!: PlayerCamera;

  /** Whether asynchronous model and animation loading has completed. */
  private loaded = false;

  /**
   * Creates the player facade. Call {@link load} before updating it.
   *
   * @param camera - Active scene camera.
   * @param world - Active Rapier world.
   */
  constructor(camera: THREE.PerspectiveCamera, world: RAPIER.World) {
    this.camera = camera;
    this.world = world;
    this.root.name = 'Player';
  }

  /**
   * Loads the character model, prepares shadows, and initializes subsystems.
   *
   * Must be awaited before the player can animate or collide correctly.
   */
  async load(): Promise<void> {
    const model = await this.loader.loadModel(PLAYER_MODEL_CONFIG.CHARACTER_MODEL_PATH);
    this.prepareModel(model);
    this.root.add(model);

    this.animator = new PlayerAnimator(model);
    this.controller = new PlayerController(this.world);
    this.playerCamera = new PlayerCamera(this.camera);

    await this.animator.loadCriticalClips(this.loader);
    this.animator.play('idle', 0);
    this.loaded = true;
    this.animator.warmupNonCriticalClips(this.loader);
  }

  /**
   * Toggles between third-person and first-person camera modes.
   *
   * @returns True when first-person mode is now active.
   */
  public toggleCamera(): boolean {
    const isFirstPerson = this.playerCamera.toggleMode();
    this.setModelVisible(!isFirstPerson);
    return isFirstPerson;
  }

  /**
   * Moves the player and its kinematic physics body to a world-space point.
   *
   * @param position - Desired visual root position in world units.
   */
  teleportTo(position: THREE.Vector3Like): void {
    if (!this.loaded) {
      this.root.position.set(position.x, position.y, position.z);
      return;
    }

    this.controller.teleportTo(this.root, position);
    this.playerCamera.update(this.root);
  }

  /**
   * Updates movement, animation, and camera subsystems once per frame.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void {
    if (!this.loaded) return;

    const { desiredAnimation } = this.controller.update(this.root, delta, this.camera);
    this.animator.play(desiredAnimation);
    this.animator.update(delta);
    this.playerCamera.update(this.root);
  }

  /**
   * Plays a named animation directly, primarily for debug tooling.
   *
   * @param name - Logical animation state to play.
   * @param fadeTime - Optional cross-fade duration in seconds.
   */
  playAnimation(name: AnimationName, fadeTime?: number): void {
    this.animator?.play(name, fadeTime);
  }

  /** Releases owned animation, physics, loader, and visual resources. */
  dispose(): void {
    this.animator?.dispose();
    this.controller?.dispose();

    disposeObjectTree(this.root);
    this.root.clear();
  }

  /**
   * Applies production render flags and orientation to the loaded character.
   *
   * @param model - Loaded character model root.
   */
  private prepareModel(model: THREE.Group): void {
    model.name = 'CharacterModel';
    model.rotation.y = PLAYER_MODEL_CONFIG.MIXAMO_FORWARD_ROTATION_Y;
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }

  /**
   * Shows or hides all renderable meshes in the player model.
   *
   * @param visible - Whether player meshes should render.
   */
  private setModelVisible(visible: boolean): void {
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.visible = visible;
      }
    });
  }

}
