import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Thin, Promise-based wrapper around Three.js `GLTFLoader`.
 * 

 * - Isolates the loading of external 3D assets from the rest of the application.
 * - Extracts `THREE.Group` meshes or `THREE.AnimationClip`s.
 * - Applies critical fixes to loaded animations (like stripping root motion) automatically.
 */
export class ModelLoader {
  /** Internal Three.js GLTFLoader instance used to parse files. */
  private readonly loader = new GLTFLoader();

  /**
   * Loads a GLB/GLTF file and resolves with the parsed scene group.
   * 
   * @param path The URL path to the model asset.
   * @returns A promise resolving to the Three.js Group representing the scene.
   */
  async loadModel(path: string): Promise<THREE.Group> {
    const gltf = await this.loader.loadAsync(path);
    return gltf.scene;
  }

  /**
   * Loads a GLB/GLTF file and resolves with its first `AnimationClip`.
   * Also automatically sanitizes the clip by removing unwanted root motion tracks.
   * 
   * @param path The URL path to the animation asset.
   * @returns A promise resolving to the AnimationClip, or null if the file contains none.
   */
  async loadClip(path: string): Promise<THREE.AnimationClip | null> {
    try {
      const gltf = await this.loader.loadAsync(path);
      const clip = gltf.animations[0] ?? null;
      if (clip) {
        this.makeClipInPlace(clip);
      }
      return clip;
    } catch (err) {
      console.error(`[ModelLoader] Failed to load: ${path}`, err);
      return null;
    }
  }

  /**
   * Removes X and Z positional translation tracks from the root bone (e.g., Hips)
   * to ensure that animations play exactly "in-place". 
   * This prevents physical root motion from fighting with the logic-driven `PlayerController`.
   * 
   * @param clip The Three.js AnimationClip to mutate.
   */
  private makeClipInPlace(clip: THREE.AnimationClip): void {
    clip.tracks = clip.tracks.filter(track => !track.name.match(/(Hips|Armature|mixamorig\d*)\.position/i));
  }
}
