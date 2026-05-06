import * as THREE from 'three';

import type { AnimationName } from '../types/animations.ts';
import { ANIMATION_SOURCES } from '../types/animations.ts';
import { ModelLoader } from '../loaders/ModelLoader.ts';

/**
 * Manages the AnimationMixer and clip lifecycle for the player.
 * 

 * - Loads and parses Three.js AnimationClips from external GLB files via ModelLoader.
 * - Handles smooth cross-fading (`crossFadeTo`) between animation states.
 * - Manages playback loops, time scales (e.g., reversing walk), and clamping.
 * - Decoupled entirely from input, movement, and camera logic.
 */
export class PlayerAnimator {
  /** Internal Three.js AnimationMixer that manages clip playback. */
  private readonly mixer: THREE.AnimationMixer;
  
  /** Map of AnimationNames to their loaded Three.js AnimationActions. */
  private readonly actions = new Map<AnimationName, THREE.AnimationAction>();
  
  /** Reference to the currently playing AnimationAction. */
  private currentAction:  THREE.AnimationAction | null = null;
  
  /** Logical name of the currently playing animation. */
  private currentName:    AnimationName = 'idle';

  /**
   * Initializes the animator and binds it to the provided 3D model.
   * Also listens for finished animations to transition back to 'idle'.
   * 
   * @param model The main character THREE.Object3D mesh that has bones/armature.
   */
  constructor(model: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(model);

    this.mixer.addEventListener('finished', (e) => {
      const action = e.action as THREE.AnimationAction;
      if (action === this.actions.get('jump')) {
        this.play('idle');
      }
    });
  }

  /**
   * Asynchronously loads all defined animation clips from `ANIMATION_SOURCES` using the ModelLoader.
   * Once loaded, prepares the AnimationActions and configures their looping properties.
   * 
   * @param loader The instantiated ModelLoader used to fetch GLB assets.
   */
  async loadClips(loader: ModelLoader): Promise<void> {
    const entries = Object.entries(ANIMATION_SOURCES) as [AnimationName, string][];

    await Promise.all(
      entries.map(async ([name, path]) => {
        const clip = await loader.loadClip(path);
        if (!clip) {
          console.warn(`[PlayerAnimator] No clip found in: ${path}`);
          return;
        }
        clip.name = name;
        const action = this.mixer.clipAction(clip);

        if (name === 'walkBack') {
          action.timeScale = -1;
        }
        if (name === 'jump') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }

        this.actions.set(name, action);
      })
    );
  }

  /**
   * Cross-fades to the specified animation state smoothly over a given duration.
   * If the target animation is already playing, this method silently returns to avoid stutter.
   * 
   * Note: The `warp` parameter in `crossFadeTo` is set to `false` internally to prevent 
   * the bones from stretching abruptly when blending animations of different lengths.
   * 
   * @param name The registered AnimationName to play.
   * @param fadeTime The duration of the cross-fade blend in seconds (default: 0.2).
   */
  play(name: AnimationName, fadeTime = 0.2): void {
    if (name === this.currentName && this.currentAction?.isRunning()) return;

    const next = this.actions.get(name);
    if (!next) {
      console.warn(`[PlayerAnimator] Animation "${name}" not loaded.`);
      return;
    }

    next.reset();
    next.setEffectiveWeight(1);
    
    if (name === 'walkBack') next.timeScale = -1;
    else next.timeScale = 1;

    if (this.currentAction && fadeTime > 0 && this.currentAction !== next) {
      next.play();
      this.currentAction.crossFadeTo(next, fadeTime, false);
    } else {
      this.currentAction?.stop();
      next.play();
    }

    this.currentAction = next;
    this.currentName   = name;
  }

  get activeAnimation(): AnimationName { return this.currentName; }

  /**
   * Steps the internal Three.js AnimationMixer forward.
   * Must be called exactly once per frame.
   * 
   * @param delta Frame delta time in seconds.
   */
  update(delta: number): void {
    this.mixer.update(delta);
  }

  /**
   * Frees all animation resources and stops the mixer entirely.
   * Required for memory management when the Player is destroyed.
   */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
