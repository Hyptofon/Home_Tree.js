import * as THREE from 'three';
import type { Updatable, Disposable } from '../../types/interfaces.ts';

/**
 * Lightweight real-time performance overlay.
 *
 * Enabled by adding `?perf` to the URL.
 *
 * The monitor disables Three.js autoReset so it can accumulate draw calls
 * across all EffectComposer passes and read the true frame totals.
 */
export class FrameBudgetMonitor implements Updatable, Disposable {
  private readonly element: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;

  private frames = 0;
  private totalMs = 0;
  private minMs = Infinity;
  private maxMs = 0;
  /** Snapshot of last peak draw count to keep it readable. */
  private peakCalls = 0;
  private peakTris = 0;

  static create(renderer: THREE.WebGLRenderer): FrameBudgetMonitor | null {
    if (!window.location.search.includes('perf')) return null;
    return new FrameBudgetMonitor(renderer);
  }

  private constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    // Disable auto-reset so we can accumulate across all EffectComposer passes.
    this.renderer.info.autoReset = false;
    this.element = this.buildElement();
    document.body.appendChild(this.element);
  }

  update(delta: number): void {
    const ms = delta * 1000;
    this.frames += 1;
    this.totalMs += ms;
    if (ms < this.minMs) this.minMs = ms;
    if (ms > this.maxMs) this.maxMs = ms;

    // Capture peak draw stats BEFORE resetting for the next frame.
    const calls = this.renderer.info.render.calls;
    const tris  = this.renderer.info.render.triangles;
    if (calls > this.peakCalls) this.peakCalls = calls;
    if (tris  > this.peakTris)  this.peakTris  = tris;

    // Manually reset renderer info every frame (we disabled autoReset).
    this.renderer.info.reset();

    // Refresh DOM every 45 frames (~0.5s at 90 FPS).
    if (this.frames < 45) return;

    const avg = this.totalMs / this.frames;
    const fps = 1000 / avg;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const heapMb = mem ? (mem.usedJSHeapSize / 1_048_576).toFixed(1) + ' MB' : 'n/a';

    const color = fps >= 85 ? '#00ff88' : fps >= 55 ? '#ffcc00' : '#ff4444';
    this.element.style.color = color;

    this.element.innerHTML = [
      `<b>${fps.toFixed(1)} FPS</b> &nbsp; <b>${avg.toFixed(2)} ms</b> avg`,
      `min ${this.minMs.toFixed(1)} &nbsp; max ${this.maxMs.toFixed(1)}`,
      `draws: ${this.peakCalls} &nbsp; tris: ${(this.peakTris / 1000).toFixed(1)}k`,
      `DPR: ${this.renderer.getPixelRatio().toFixed(2)} &nbsp; heap: ${heapMb}`,
    ].join('<br>');

    this.frames   = 0;
    this.totalMs  = 0;
    this.minMs    = Infinity;
    this.maxMs    = 0;
    this.peakCalls = 0;
    this.peakTris  = 0;
  }

  dispose(): void {
    this.renderer.info.autoReset = true;
    this.element.remove();
  }

  private buildElement(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'perf-monitor';
    Object.assign(el.style, {
      position:        'fixed',
      top:             '0',
      left:            '0',
      zIndex:          '9999',
      padding:         '6px 12px',
      background:      'rgba(0,0,0,0.78)',
      color:           '#00ff88',
      fontFamily:      'monospace',
      fontSize:        '11px',
      lineHeight:      '1.7',
      pointerEvents:   'none',
      backdropFilter:  'blur(4px)',
      borderRadius:    '0 0 8px 0',
    });
    return el;
  }
}
