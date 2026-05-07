/**
 * @fileoverview PostProcessingController — wraps the `postprocessing` library
 * EffectComposer and manages per-phase parameter interpolation.
 *
 * Uses the `postprocessing` npm package (significantly faster than THREE.EffectComposer).
 * All effect instances are created once; only their parameters are mutated per frame.
 */
import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  BloomEffect,
  VignetteEffect,
  EffectPass,
  SSAOEffect,
} from 'postprocessing';
import { lerp } from './utils.ts';
import type { PostFxPhaseParams } from './types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// FPS adaptive quality guard
// ─────────────────────────────────────────────────────────────────────────────

const FPS_CHECK_INTERVAL = 3; // seconds between FPS samples
const FPS_LOW_THRESHOLD  = 50;

// ─────────────────────────────────────────────────────────────────────────────
// PostProcessingController
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates and owns the full postprocessing pipeline:
 *   RenderPass → BloomEffect → SSAOEffect → VignetteEffect → ToneMappingEffect
 *
 * Exposes {@link update} to lerp all effect parameters toward a target phase config.
 */
export class PostProcessingController {
  readonly composer: EffectComposer;

  private readonly bloom: BloomEffect;
  private readonly vignette: VignetteEffect;
  private readonly ssao: SSAOEffect;
  private readonly ssaoPass: EffectPass;

  private readonly renderer: THREE.WebGLRenderer;

  // FPS monitoring
  private fpsTimer = 0;
  private frameCount = 0;
  private ssaoEnabled = true;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.renderer = renderer;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // ── Bloom ────────────────────────────────────────────────────────────────
    this.bloom = new BloomEffect({
      intensity: 0.3,
      luminanceThreshold: 0.85,
      luminanceSmoothing: 0.025,
      mipmapBlur: true,
    });

    // ── SSAO ─────────────────────────────────────────────────────────────────
    this.ssao = new SSAOEffect(camera as THREE.PerspectiveCamera, undefined, {
      intensity: 5,
      radius: 0.5,
      samples: 16,
      rings: 4,
    });
    this.ssaoPass = new EffectPass(camera, this.ssao);
    this.composer.addPass(this.ssaoPass);

    // ── Vignette ─────────────────────────────────────────────────────────────
    this.vignette = new VignetteEffect({
      darkness: 0.3,
      offset: 0.5,
    });

    this.composer.addPass(new EffectPass(camera, this.bloom, this.vignette));
  }

  /**
   * Smoothly interpolates all effect parameters toward `target`.
   * Also runs the adaptive FPS guard to disable SSAO when below threshold.
   *
   * @param target  - Desired postFX parameters for the current phase
   * @param t       - Lerp factor [0, 1] applied per call (typically: delta * 2)
   * @param delta   - Frame delta in seconds (for FPS monitoring)
   */
  update(target: PostFxPhaseParams, t: number, delta: number): void {
    this.updateFpsGuard(delta);

    // Bloom
    this.bloom.intensity = lerp(this.bloom.intensity, target.bloomIntensity, t);
    this.bloom.luminanceMaterial.threshold = lerp(
      this.bloom.luminanceMaterial.threshold,
      target.bloomThreshold,
      t,
    );

    // Vignette
    const vu = this.vignette.uniforms.get('darkness');
    const vo = this.vignette.uniforms.get('offset');
    if (vu) vu.value = lerp(vu.value as number, target.vignetteDarkness, t);
    if (vo) vo.value = lerp(vo.value as number, target.vignetteOffset, t);

    // ToneMapping exposure via renderer
    this.renderer.toneMappingExposure = lerp(
      this.renderer.toneMappingExposure,
      target.toneMappingExposure,
      t,
    );

    // SSAO (only when enabled by adaptive quality)
    if (this.ssaoEnabled) {
      const ssaoUniforms = this.ssao.uniforms;
      const intensityU = ssaoUniforms.get('intensity');
      const radiusU    = ssaoUniforms.get('radius');
      if (intensityU) intensityU.value = lerp(intensityU.value as number, target.ssaoIntensity, t);
      if (radiusU)    radiusU.value    = lerp(radiusU.value    as number, target.ssaoRadius, t);
    }
  }

  /**
   * Renders the scene through the postprocessing pipeline.
   * Call this instead of `renderer.render()`.
   *
   * @param delta - Frame delta in seconds (passed to EffectComposer)
   */
  render(delta: number): void {
    this.composer.render(delta);
    this.frameCount++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private
  // ───────────────────────────────────────────────────────────────────────────

  private updateFpsGuard(delta: number): void {
    this.fpsTimer += delta;
    if (this.fpsTimer >= FPS_CHECK_INTERVAL) {
      const fps = this.frameCount / this.fpsTimer;
      this.fpsTimer = 0;
      this.frameCount = 0;

      if (fps < FPS_LOW_THRESHOLD && this.ssaoEnabled) {
        this.ssaoEnabled = false;
        this.ssaoPass.enabled = false;
        console.warn(`[PostFX] FPS ${fps.toFixed(0)} < ${FPS_LOW_THRESHOLD} — SSAO disabled.`);
      } else if (fps >= FPS_LOW_THRESHOLD + 10 && !this.ssaoEnabled) {
        this.ssaoEnabled = true;
        this.ssaoPass.enabled = true;
      }
    }
  }

  /** Releases all GPU resources. */
  dispose(): void {
    this.composer.dispose();
  }
}
