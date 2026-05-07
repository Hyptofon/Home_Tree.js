/**
 * @fileoverview MoonSystem — PointLight + Sprite for the moon.
 * Orbits the opposite arc to the sun, fades in/out smoothly.
 */
import * as THREE from 'three';
import { MOON_CONFIG, STARS_CONFIG } from './config.ts';
import { celestialPosition, clamp } from './utils.ts';

// ─────────────────────────────────────────────────────────────────────────────
// MoonSystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encapsulates the moon sprite and its associated PointLight.
 * Both are visible only at night and fade smoothly.
 */
export class MoonSystem {
  readonly light: THREE.PointLight;
  readonly sprite: THREE.Sprite;

  private readonly mat: THREE.SpriteMaterial;

  constructor(moonTexture: THREE.Texture | null) {
    // Process the JPG texture into a round PNG-like texture with soft edges
    const processedTexture = moonTexture ? this.createRoundTexture(moonTexture) : null;
    // Moon light — cool blue-lavender
    this.light = new THREE.PointLight(
      MOON_CONFIG.LIGHT_COLOR,
      0, // starts at 0, lerped during update
      MOON_CONFIG.LIGHT_DISTANCE,
    );

    this.mat = new THREE.SpriteMaterial({
      map: processedTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xdde3f5,
    });

    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.setScalar(MOON_CONFIG.SPRITE_SIZE);
    this.sprite.renderOrder = 2;
  }

  /**
   * Converts a square JPG texture into a round texture with soft alpha edges
   * by drawing it to an offscreen canvas and applying a radial gradient mask.
   */
  private createRoundTexture(source: THREE.Texture): THREE.CanvasTexture {
    if (!source.image) return source as THREE.CanvasTexture;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Draw the original image
    ctx.drawImage(source.image, 0, 0, size, size);

    // Create a radial gradient for the alpha mask
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;
    const gradient = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Opaque center
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent edges

    // Apply the mask using destination-in (keeps only overlapping parts)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';

    const newTex = new THREE.CanvasTexture(canvas);
    newTex.generateMipmaps = true;
    newTex.minFilter = THREE.LinearMipmapLinearFilter;
    return newTex;
  }

  /**
   * Called every frame — updates position and opacity.
   *
   * @param time - Current game hour [0, 24)
   */
  update(time: number): void {
    const { APPEAR_HOUR, DISAPPEAR_HOUR } = STARS_CONFIG; // reuse star thresholds
    const { ORBIT_RADIUS, LIGHT_INTENSITY } = MOON_CONFIG;

    // Moon rises when sun sets and vice-versa
    const moonHour = (time + 12) % 24;
    const pos = celestialPosition(moonHour, 6, 20, ORBIT_RADIUS, 10);

    this.light.position.copy(pos);
    this.sprite.position.copy(pos);

    // Fade based on same thresholds as stars
    let targetOpacity = 0;
    if (time >= APPEAR_HOUR) {
      targetOpacity = clamp((time - APPEAR_HOUR) / 1.0, 0, 1);
    } else if (time <= DISAPPEAR_HOUR) {
      targetOpacity = clamp(1 - time / DISAPPEAR_HOUR, 0, 1);
    }
    if (time < 4.5) targetOpacity = 1;

    this.mat.opacity = targetOpacity;
    this.light.intensity = targetOpacity * LIGHT_INTENSITY;
  }

  /** Releases GPU resources. */
  dispose(): void {
    this.mat.dispose();
  }
}
