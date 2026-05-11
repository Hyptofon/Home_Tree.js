import * as THREE from 'three';

import { RENDERER_CONFIG } from '../../core/coreConfig.ts';
import type { Disposable, Updatable } from '../../types/interfaces.ts';

type ResizableRenderPipeline = {
  setSize(width: number, height: number): void;
};

/**
 * Maintains a stable frame budget by adapting renderer pixel ratio over time.
 *
 * The system samples actual frame time instead of guessing device capability.
 * It only changes resolution at coarse intervals, so it does not create visible
 * oscillation or layout churn during normal camera movement.
 */
export class AdaptiveQualitySystem implements Updatable, Disposable {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly postProcessing?: ResizableRenderPipeline;

  private currentPixelRatio: number;
  private sampleElapsed = 0;
  private sampledFrames = 0;
  private sampledFrameMs = 0;

  /**
   * @param renderer - Active renderer whose drawing-buffer scale is adapted.
   * @param postProcessing - Optional post pipeline that mirrors render size.
   */
  constructor(
    renderer: THREE.WebGLRenderer,
    postProcessing?: ResizableRenderPipeline,
  ) {
    this.renderer = renderer;
    this.postProcessing = postProcessing;
    this.currentPixelRatio = this.resolveInitialPixelRatio();
    this.applyPixelRatio(this.currentPixelRatio);
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Samples frame duration and nudges render resolution toward the 60 FPS budget.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void {
    this.sampleElapsed += delta;
    this.sampledFrames += 1;
    this.sampledFrameMs += delta * 1000;

    if (this.sampleElapsed < RENDERER_CONFIG.QUALITY_SAMPLE_SECONDS) return;

    const averageFrameMs = this.sampledFrameMs / Math.max(1, this.sampledFrames);
    this.adjustPixelRatio(averageFrameMs);
    this.sampleElapsed = 0;
    this.sampledFrames = 0;
    this.sampledFrameMs = 0;
  }

  /** Removes resize listeners. */
  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
  }

  private adjustPixelRatio(averageFrameMs: number): void {
    const maxPixelRatio = this.resolveMaxPixelRatio();
    let nextPixelRatio = this.currentPixelRatio;

    if (averageFrameMs > RENDERER_CONFIG.DOWNGRADE_FRAME_MS) {
      nextPixelRatio -= RENDERER_CONFIG.PIXEL_RATIO_STEP;
    } else if (averageFrameMs < RENDERER_CONFIG.UPGRADE_FRAME_MS) {
      nextPixelRatio += RENDERER_CONFIG.PIXEL_RATIO_STEP;
    }

    nextPixelRatio = THREE.MathUtils.clamp(
      nextPixelRatio,
      RENDERER_CONFIG.MIN_PIXEL_RATIO,
      maxPixelRatio,
    );

    this.applyPixelRatio(nextPixelRatio);
  }

  private applyPixelRatio(pixelRatio: number): void {
    if (Math.abs(pixelRatio - this.currentPixelRatio) < 0.005) {
      this.syncRenderTargets();
      return;
    }

    this.currentPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.syncRenderTargets();
  }

  private syncRenderTargets(): void {
    this.postProcessing?.setSize(window.innerWidth, window.innerHeight);
  }

  private resolveInitialPixelRatio(): number {
    return THREE.MathUtils.clamp(
      Math.min(window.devicePixelRatio || 1, RENDERER_CONFIG.INITIAL_PIXEL_RATIO),
      RENDERER_CONFIG.MIN_PIXEL_RATIO,
      this.resolveMaxPixelRatio(),
    );
  }

  private resolveMaxPixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, RENDERER_CONFIG.MAX_PIXEL_RATIO);
  }

  private readonly handleResize = (): void => {
    this.applyPixelRatio(
      THREE.MathUtils.clamp(
        this.currentPixelRatio,
        RENDERER_CONFIG.MIN_PIXEL_RATIO,
        this.resolveMaxPixelRatio(),
      ),
    );
  };
}
