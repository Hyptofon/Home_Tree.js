import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  VignetteEffect,
} from 'postprocessing';

import type { PostFxPhaseParams } from './types.ts';
import { lerp } from './utils.ts';

/**
 * Owns the lightweight post-processing chain used by the day/night system.
 *
 * SSAO was deliberately removed from the active runtime path because the
 * current postprocessing package can produce an all-black framebuffer when its
 * depth/normal setup is not fully initialized. Bloom, vignette, ACES exposure,
 * scene fog, and shadows still provide the cinematic grade without risking a
 * dead render loop.
 */
export class PostProcessingController {
  readonly composer: EffectComposer;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly smaa: SMAAEffect;
  private readonly bloom: BloomEffect;
  private readonly vignette: VignetteEffect;

  /**
   * @param renderer - Active WebGL renderer.
   * @param scene - Scene rendered by the first composer pass.
   * @param camera - Camera rendered by the first composer pass.
   */
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // SMAA: Subpixel Morphological Antialiasing
    // Much more efficient than MSAA when using EffectComposer:
    // analyzes only object edges and smooths them without reducing sharpness.
    this.smaa = new SMAAEffect({
      preset: SMAAPreset.MEDIUM,
    });

    this.bloom = new BloomEffect({
      intensity: 0.015, // Reduced from 0.025: subtle bloom saves GPU
      luminanceThreshold: 1.35, // Increased from 1.28: fewer bright pixels processed
      luminanceSmoothing: 0.04,
      mipmapBlur: false,
    });

    this.vignette = new VignetteEffect({
      darkness: 0.18,
      offset: 0.62,
    });

    this.composer.addPass(new EffectPass(camera, this.smaa, this.bloom, this.vignette));
  }

  /**
   * Interpolates grade parameters toward the current day phase.
   *
   * @param target - Desired post-processing values for the current phase.
   * @param t - Lerp factor in [0, 1].
   * @param _delta - Frame delta kept for interface stability.
   */
  update(target: PostFxPhaseParams, t: number, _delta: number): void {
    this.bloom.intensity = lerp(this.bloom.intensity, target.bloomIntensity, t);
    this.bloom.luminanceMaterial.threshold = lerp(
      this.bloom.luminanceMaterial.threshold,
      target.bloomThreshold,
      t,
    );

    const darkness = this.vignette.uniforms.get('darkness');
    const offset = this.vignette.uniforms.get('offset');
    if (darkness) darkness.value = lerp(darkness.value as number, target.vignetteDarkness, t);
    if (offset) offset.value = lerp(offset.value as number, target.vignetteOffset, t);

    this.renderer.toneMappingExposure = lerp(
      this.renderer.toneMappingExposure,
      target.toneMappingExposure,
      t,
    );
  }

  /**
   * Renders the scene through the post-processing composer.
   *
   * @param delta - Frame delta passed to the composer.
   */
  render(delta: number): void {
    this.composer.render(delta);
  }

  /**
   * Mirrors viewport changes into composer render targets.
   *
   * @param width - CSS viewport width in pixels.
   * @param height - CSS viewport height in pixels.
   */
  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /** Releases composer-owned render targets and materials. */
  dispose(): void {
    this.smaa.dispose();
    this.composer.dispose();
  }
}
