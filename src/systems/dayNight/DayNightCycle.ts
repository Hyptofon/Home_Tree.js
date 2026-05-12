/**
 * @fileoverview DayNightCycle — the primary orchestrator class.
 *
 * Implements {@link Updatable} and {@link Disposable} from the project's
 * interface layer, making it a first-class citizen of the engine GameLoop.
 *
 * Dependency Injection pattern: all external objects (scene, renderer, etc.)
 * are injected via the constructor. The class never touches `window`,
 * `document`, or any global directly.
 *
 * Architecture:
 *   DayNightCycle
 *     ├─ SkyController      (THREE.Sky shader + sun DirectionalLight + LensFlare)
 *     ├─ StarField          (single THREE.Points, procedural, fade in/out)
 *     ├─ MoonSystem         (Sprite + PointLight)
 *     ├─ CloudSystem        (pool of THREE.Sprite)
 *     └─ PostProcessingController (postprocessing EffectComposer pipeline)
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

import type { Updatable, Disposable } from '../../types/interfaces.ts';
import type { DayPhase, DayNightCycleOptions } from './types.ts';

import {
  CYCLE_CONFIG,
  SUN_CONFIG,
  ORDERED_PHASES,
  PHASE_DEFINITIONS,
  SKY_CONFIG,
  AMBIENT_CONFIG,
} from './config.ts';

import {
  wrapTime,
  resolvePhase,
  celestialPositionInto,
  lerpRGB,
  applyRGBToColor,
  lerp,
  clamp,
} from './utils.ts';

import { StarField }               from './StarField.ts';
import { CloudSystem }              from './CloudSystem.ts';
import { MoonSystem }               from './MoonSystem.ts';
import { PostProcessingController } from './PostProcessingController.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Pre-allocated scratch objects (zero allocations per frame)
// ─────────────────────────────────────────────────────────────────────────────

const _sunColor    = new THREE.Color();
const _fogColor    = new THREE.Color();
const _skyColor    = new THREE.Color();
const _groundColor = new THREE.Color();
const _sunDir      = new THREE.Vector3();
const _dayColor    = new THREE.Color(SUN_CONFIG.COLOR_DAY);
const _sunsetColor = new THREE.Color(SUN_CONFIG.COLOR_SUNSET);
const _blackColor  = new THREE.Color(0x000000);

// ─────────────────────────────────────────────────────────────────────────────
// DayNightCycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full 24-hour Day/Night Cycle orchestrator.
 *
 * @example
 * ```ts
 * const dnc = new DayNightCycle(scene, renderer, postFxController, textureLoader, {
 *   cycleDurationSeconds: 120,
 *   startTime: 6,
 * });
 * await dnc.init();
 * loop.register(dnc);
 * ```
 */
export class DayNightCycle implements Updatable, Disposable {
  // ── Dependencies ───────────────────────────────────────────────────────────
  private readonly scene:    THREE.Scene;
  private readonly camera:   THREE.Camera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly postFx:   PostProcessingController;
  private readonly texLoader: THREE.TextureLoader;

  // ── Options ────────────────────────────────────────────────────────────────
  private readonly cycleDurationSeconds: number;
  private timeScale: number;
  private readonly cloudTexturePath: string;
  private readonly moonTexturePath:  string;

  // ── State ──────────────────────────────────────────────────────────────────
  private time:      number; // game hours [0, 24)
  private totalTime: number; // accumulated real seconds (for twinkle)

  // ── Lights ─────────────────────────────────────────────────────────────────
  private sun!:     THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private hemi!:    THREE.HemisphereLight;

  // ── Sky ────────────────────────────────────────────────────────────────────
  private sky!:       Sky;
  private readonly sunPosition = new THREE.Vector3();

  // ── Subsystems ─────────────────────────────────────────────────────────────
  private stars!:  StarField;
  private clouds!: CloudSystem;
  private moon!:   MoonSystem;
  private postFxHealthy = true;
  /** Accumulates time for 30 Hz throttled scene-graph updates. */
  private throttleAccumulator = 0;

  constructor(
    scene:    THREE.Scene,
    camera:   THREE.Camera,
    renderer: THREE.WebGLRenderer,
    postFx:   PostProcessingController,
    texLoader: THREE.TextureLoader,
    options:  DayNightCycleOptions = {},
  ) {
    this.scene    = scene;
    this.camera   = camera;
    this.renderer = renderer;
    this.postFx   = postFx;
    this.texLoader = texLoader;

    this.cycleDurationSeconds = options.cycleDurationSeconds ?? CYCLE_CONFIG.DEFAULT_CYCLE_DURATION_SECONDS;
    this.timeScale            = options.timeScale            ?? CYCLE_CONFIG.DEFAULT_TIME_SCALE;
    this.time                 = options.startTime            ?? CYCLE_CONFIG.DEFAULT_START_TIME;
    this.cloudTexturePath     = options.cloudTexturePath     ?? '/textures/cloud.png';
    this.moonTexturePath      = options.moonTexturePath      ?? '/textures/moon.jpg';
    this.totalTime            = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialisation (async — loads textures)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Asynchronously loads textures and builds all scene objects.
   * Must be awaited before the game loop starts.
   */
  async init(): Promise<void> {
    // Load textures (parallel)
    const [cloudTex, moonTex] = await Promise.all([
      this.loadTexture(this.cloudTexturePath),
      this.loadTexture(this.moonTexturePath).catch(() => null),
    ]);

    this.buildLighting();
    this.buildSky();

    this.stars  = new StarField();
    this.moon   = new MoonSystem(moonTex);
    this.clouds = new CloudSystem(cloudTex!, this.camera);

    // Add everything to scene
    this.scene.add(
      this.ambient,
      this.hemi,
      this.sun,
      this.sky,
      this.stars.mesh,
      this.moon.light,
      this.moon.sprite,
      this.clouds.group,
    );

    // Initialise fog to hide the edges of the map
    this.scene.fog = new THREE.Fog(0xc9e8ff, 70, 120);

    // Apply initial state synchronously
    this.applyPhaseState(this.time, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IUpdatable implementation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Called every frame by {@link GameLoop}.
   * Updates time, resolves phase, lerps all parameters, and renders via PostFX.
   *
   * @param delta - Frame delta in seconds (capped by GameLoop at 50ms)
   */
  update(delta: number): void {
    // Advance game time every frame (accurate wall-clock)
    const hoursPerSecond = 24 / this.cycleDurationSeconds;
    this.time      = wrapTime(this.time + delta * hoursPerSecond * this.timeScale);
    this.totalTime += delta;

    const [phase, blend] = resolvePhase(this.time);

    // Heavy scene-graph updates (sun position, stars, moon, clouds, sky uniforms)
    // throttled to 30 Hz - these change slowly enough that 30 Hz is indistinguishable from 90 Hz.
    this.throttleAccumulator += delta;
    if (this.throttleAccumulator >= 1 / 30) {
      const td = this.throttleAccumulator;
      this.throttleAccumulator = 0;
      this.applyPhaseState(this.time, blend);
      this.updateSun(this.time);
      this.stars.update(this.time, this.totalTime);
      this.moon.update(this.time);
      this.clouds.update(td, phase, blend);
    }

    // PostFX lerp + render runs every frame for smooth exposure/bloom.
    const postTarget = PHASE_DEFINITIONS[phase].postFx;
    if (this.postFxHealthy) {
      try {
        this.postFx.update(postTarget, clamp(delta * 2, 0, 1), delta);
        this.postFx.render(delta);
        return;
      } catch (error) {
        this.postFxHealthy = false;
        console.error('[DayNightCycle] PostFX failed, falling back to direct render.', error);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /** Returns the current game time in hours [0, 24). */
  getTimeOfDay(): number { return this.time; }

  /**
   * Jumps to a specific game time. Useful for debug controls.
   * @param time - Hour in [0, 24)
   */
  setTimeOfDay(time: number): void {
    this.time = wrapTime(time);
  }

  /**
   * Changes the speed multiplier for the cycle.
   * @param scale - Must be in [MIN_TIME_SCALE, MAX_TIME_SCALE]
   */
  setTimeScale(scale: number): void {
    this.timeScale = clamp(scale, CYCLE_CONFIG.MIN_TIME_SCALE, CYCLE_CONFIG.MAX_TIME_SCALE);
  }

  /** Returns the current {@link DayPhase}. */
  getPhase(): DayPhase { return resolvePhase(this.time)[0]; }

  /**
   * Returns the normalised sun direction vector (for use in custom shaders).
   * The returned vector is pre-allocated and reused — do NOT store a reference.
   */
  getSunDirection(): THREE.Vector3 {
    _sunDir.copy(this.sun.position).normalize();
    return _sunDir;
  }

  /** Returns `true` when stars are visible (evening or night). */
  isNight(): boolean {
    const p = this.getPhase();
    return p === 'night' || p === 'evening';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IDisposable implementation
  // ─────────────────────────────────────────────────────────────────────────

  /** Removes all scene objects and releases GPU resources. */
  dispose(): void {
    this.scene.remove(
      this.ambient, this.hemi, this.sun, this.sky,
      this.stars.mesh, this.moon.light, this.moon.sprite, this.clouds.group,
    );

    this.stars.dispose();
    this.clouds.dispose();
    this.moon.dispose();
    (this.sky.material as THREE.ShaderMaterial).dispose();
    this.sun.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — builders
  // ─────────────────────────────────────────────────────────────────────────

  private buildLighting(): void {
    this.ambient = new THREE.AmbientLight(AMBIENT_CONFIG.COLOR_SKY, 0.8);

    this.hemi = new THREE.HemisphereLight(
      AMBIENT_CONFIG.COLOR_SKY,
      AMBIENT_CONFIG.COLOR_GROUND,
      0.5,
    );

    this.sun = new THREE.DirectionalLight(SUN_CONFIG.COLOR_DAY, SUN_CONFIG.INTENSITY_DAY);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SUN_CONFIG.SHADOW_MAP_SIZE, SUN_CONFIG.SHADOW_MAP_SIZE);
    this.sun.shadow.camera.near   = SUN_CONFIG.SHADOW_NEAR;
    this.sun.shadow.camera.far    = SUN_CONFIG.SHADOW_FAR;
    this.sun.shadow.camera.left   = -SUN_CONFIG.SHADOW_CAMERA_EXTENT;
    this.sun.shadow.camera.right  =  SUN_CONFIG.SHADOW_CAMERA_EXTENT;
    this.sun.shadow.camera.top    =  SUN_CONFIG.SHADOW_CAMERA_EXTENT;
    this.sun.shadow.camera.bottom = -SUN_CONFIG.SHADOW_CAMERA_EXTENT;
    this.sun.shadow.bias          = SUN_CONFIG.SHADOW_BIAS;
    this.sun.shadow.normalBias    = SUN_CONFIG.SHADOW_NORMAL_BIAS;
  }

  private buildSky(): void {
    this.sky = new Sky();
    this.sky.scale.setScalar(SKY_CONFIG.SCALE);
    this.sky.frustumCulled = false;
    
    // Ensure the sky always renders behind world geometry and ignores scene fog.
    this.sky.material.depthWrite = false;
    this.sky.material.fog = false;
    this.sky.renderOrder = -100;
    this.patchSkyShader(this.sky.material as THREE.ShaderMaterial);

    const su = this.sky.material.uniforms;
    su['turbidity'].value       = SKY_CONFIG.TURBIDITY_DAY;
    su['rayleigh'].value        = SKY_CONFIG.RAYLEIGH_DAY;
    su['mieCoefficient'].value  = SKY_CONFIG.MIE_COEFFICIENT_DAY;
    su['mieDirectionalG'].value = SKY_CONFIG.MIE_DIRECTIONAL_G_DAY;
    su['sunPosition'].value.set(0, 1, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — per-frame updates
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Lerps sky colour, fog, ambient and hemisphere light intensities
   * between the current and next phase definition.
   */
  private applyPhaseState(time: number, blend: number): void {
    const [phase] = resolvePhase(time);

    // Find next phase (wraps around)
    const idx      = ORDERED_PHASES.indexOf(phase);
    const nextIdx  = (idx + 1) % ORDERED_PHASES.length;
    const curDef   = PHASE_DEFINITIONS[phase];
    const nextDef  = PHASE_DEFINITIONS[ORDERED_PHASES[nextIdx]];

    // ── Sky, Fog & Ground Colors ─────────────────────────────────────────────
    const fogRGB = lerpRGB(curDef.fogColor, nextDef.fogColor, blend);
    const skyRGB = lerpRGB(curDef.skyColor, nextDef.skyColor, blend);
    
    applyRGBToColor(_fogColor, fogRGB);
    applyRGBToColor(_skyColor, skyRGB);
    
    // Ground is a much darker, slightly desaturated version of the fog/horizon
    _groundColor.copy(_fogColor).lerp(_blackColor, 0.6);

    const fogDensity = lerp(curDef.fogDensity, nextDef.fogDensity, blend);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(_fogColor);
      // Fog remains strictly at the edges of the map regardless of time of day
      this.scene.fog.near = 70;
      this.scene.fog.far = 120;
    } else if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_fogColor);
      this.scene.fog.density = fogDensity;
    }

    // ── Ambient & Hemisphere (GI approximation) ──────────────────────────────
    const ambIntensity = lerp(curDef.ambientIntensity, nextDef.ambientIntensity, blend);
    this.ambient.intensity = ambIntensity * 0.5; // Base fill
    this.ambient.color.copy(_skyColor);
    
    this.hemi.intensity = ambIntensity * 1.5;    // Directional GI from the sky dome
    this.hemi.color.copy(_skyColor);             // Light from the zenith
    this.hemi.groundColor.copy(_groundColor);    // Light bouncing from the ground

    // ── Sky uniforms ─────────────────────────────────────────────────────────
    (this.sky.material.uniforms['uSkyTint'].value as THREE.Color).copy(_skyColor);
    this.updateSkyUniforms(phase, blend);

    // ── Sun colour (handled separately in updateSun) ──────────────────────────
    const sunIntensity = lerp(curDef.sunIntensity, nextDef.sunIntensity, blend);
    this.sun.intensity = sunIntensity;
    this.sun.visible   = sunIntensity > 0.01;
  }

  /**
   * Moves the sun's DirectionalLight along a parabolic arc based on game time.
   * Also lerps its colour between sunrise, day, and sunset tones.
   */
  private updateSun(time: number): void {
    // Sun is visible from ~4:30 to ~19:30
    // Increased tilt to 25 degrees for realistic earth-like solar declination
    celestialPositionInto(this.sunPosition, time, 4.5, 19.5, SUN_CONFIG.ORBIT_RADIUS, 25);
    this.sun.position.copy(this.sunPosition);
    this.sun.target.position.set(0, 0, 0);

    // Colour: warm orange at horizon, white at zenith
    const normalT = clamp((time - 4.5) / (19.5 - 4.5), 0, 1);
    const zenithT = Math.sin(normalT * Math.PI); // peaks at noon

    // Blend from sunrise → day → sunset colour
    if (time < 10) {
      _sunColor.setHex(SUN_CONFIG.COLOR_SUNRISE);
      _sunColor.lerp(_dayColor, zenithT);
    } else if (time >= 10 && time < 16) {
      _sunColor.setHex(SUN_CONFIG.COLOR_DAY);
    } else {
      _sunColor.setHex(SUN_CONFIG.COLOR_DAY);
      _sunColor.lerp(_sunsetColor, 1 - zenithT);
    }

    this.sun.color.copy(_sunColor);

    // Push sun direction into Sky shader
    const su = this.sky.material.uniforms;
    su['sunPosition'].value.copy(this.sun.position).normalize();
  }

  /**
   * Lerps THREE.Sky shader uniforms (turbidity, rayleigh, mie) for each phase.
   */
  private updateSkyUniforms(phase: DayPhase, blend: number): void {
    const su = this.sky.material.uniforms;

    let turbidity: number = SKY_CONFIG.TURBIDITY_DAY;
    let rayleigh:  number = SKY_CONFIG.RAYLEIGH_DAY;
    let mie:       number = SKY_CONFIG.MIE_COEFFICIENT_DAY;
    let mieG:      number = SKY_CONFIG.MIE_DIRECTIONAL_G_DAY;

    switch (phase) {
      case 'sunset':
      case 'dawn':
        turbidity = lerp(SKY_CONFIG.TURBIDITY_DAY,        SKY_CONFIG.TURBIDITY_SUNSET,         blend);
        rayleigh  = lerp(SKY_CONFIG.RAYLEIGH_DAY,         SKY_CONFIG.RAYLEIGH_SUNSET,          blend);
        mie       = lerp(SKY_CONFIG.MIE_COEFFICIENT_DAY,  SKY_CONFIG.MIE_COEFFICIENT_SUNSET,   blend);
        mieG      = lerp(SKY_CONFIG.MIE_DIRECTIONAL_G_DAY, SKY_CONFIG.MIE_DIRECTIONAL_G_SUNSET, blend);
        break;
      case 'evening':
      case 'night':
        turbidity = lerp(SKY_CONFIG.TURBIDITY_SUNSET, SKY_CONFIG.TURBIDITY_NIGHT, blend);
        rayleigh  = lerp(SKY_CONFIG.RAYLEIGH_SUNSET, SKY_CONFIG.RAYLEIGH_NIGHT, blend);
        mie       = lerp(SKY_CONFIG.MIE_COEFFICIENT_SUNSET, SKY_CONFIG.MIE_COEFFICIENT_NIGHT, blend);
        mieG      = lerp(SKY_CONFIG.MIE_DIRECTIONAL_G_SUNSET, SKY_CONFIG.MIE_DIRECTIONAL_G_NIGHT, blend);
        break;
      default:
        break;
    }

    (su['turbidity'].value as number)       = turbidity;
    (su['rayleigh'].value as number)        = rayleigh;
    (su['mieCoefficient'].value as number)  = mie;
    (su['mieDirectionalG'].value as number) = mieG;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — async helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Adds a lightweight phase-aware grade to THREE.Sky so daylight never clips
   * into a featureless white horizon while preserving the existing scattering.
   */
  private patchSkyShader(material: THREE.ShaderMaterial): void {
    const daySky = PHASE_DEFINITIONS.day.skyColor;
    material.uniforms['uSkyTint'] = {
      value: new THREE.Color(daySky[0] / 255, daySky[1] / 255, daySky[2] / 255),
    };
    material.uniforms['uHorizonTintStrength'] = { value: SKY_CONFIG.HORIZON_TINT_STRENGTH };
    material.uniforms['uMaxSkyChannel'] = { value: SKY_CONFIG.MAX_CHANNEL_VALUE };

    material.onBeforeCompile = (shader) => {
      shader.uniforms['uSkyTint'] = material.uniforms['uSkyTint'];
      shader.uniforms['uHorizonTintStrength'] = material.uniforms['uHorizonTintStrength'];
      shader.uniforms['uMaxSkyChannel'] = material.uniforms['uMaxSkyChannel'];
      shader.fragmentShader = shader.fragmentShader.replace(
        'uniform vec3 up;',
        `uniform vec3 up;
    uniform vec3 uSkyTint;
    uniform float uHorizonTintStrength;
    uniform float uMaxSkyChannel;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );',
        `vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );
      float horizonTint = 1.0 - smoothstep(0.02, 0.64, direction.y);
      retColor = mix(retColor, uSkyTint, horizonTint * uHorizonTintStrength);
      retColor = min(retColor, vec3(uMaxSkyChannel));`,
      );
    };
  }

  private loadTexture(path: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.texLoader.load(path, resolve, undefined, reject);
    });
  }
}
