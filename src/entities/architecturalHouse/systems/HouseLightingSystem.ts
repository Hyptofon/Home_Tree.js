import * as THREE from 'three';

import {
  HOUSE_CONFIG,
  HOUSE_RENDERING_CONFIG,
} from '../architecturalHouseConfig.ts';

type LightRigEntry = {
  readonly light: THREE.PointLight | THREE.SpotLight;
  readonly baseIntensity: number;
};

type SpotLightRigEntry = {
  readonly light: THREE.SpotLight;
  readonly baseIntensity: number;
};

const NIGHT_START = 18.2;
const NIGHT_END = 6.5;

/** Interior and exterior architectural light rig with day/night response. */
export class HouseLightingSystem {
  private readonly root = new THREE.Group();
  private readonly entries: LightRigEntry[] = [];
  private readonly emissiveBulbs: THREE.Mesh[] = [];
  private readonly bulbMaterial = new THREE.MeshStandardMaterial({
    name: 'WarmBulbGlass',
    color: 0xffd7a2,
    emissive: 0xffb36b,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0,
  });

  private intensityMultiplier = 1;
  private shadowedInteriorLights = 0;

  /**
   * @param sceneRoot - House feature root receiving the light rig.
   */
  constructor(sceneRoot: THREE.Group) {
    this.root.name = 'ArchitecturalLightRig';
    sceneRoot.add(this.root);
    this.buildInteriorLights();
    this.buildExteriorAccentLights();
  }

  /**
   * Updates light intensities from time-of-day.
   *
   * @param timeOfDay - Current simulation hour in [0, 24).
   */
  update(timeOfDay: number): void {
    const nightFactor = this.resolveNightFactor(timeOfDay);
    const interiorFactor = THREE.MathUtils.lerp(0.28, 1.0, nightFactor) * this.intensityMultiplier;

    for (const entry of this.entries) {
      entry.light.intensity = entry.baseIntensity * interiorFactor;
    }

    this.bulbMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.35, 1.75, nightFactor);
  }

  /** Runtime debug control for the whole architectural light rig. */
  setIntensityMultiplier(value: number): void {
    this.intensityMultiplier = value;
  }

  /** Releases light helper materials. */
  dispose(): void {
    this.bulbMaterial.dispose();
  }

  private buildInteriorLights(): void {
    const floorHeight = HOUSE_CONFIG.FLOOR_HEIGHT;
    const warm = 0xffd8aa;
    const lights = [
      { position: [-7.2, 2.55, -2.2], intensity: 38, distance: 8.5, shadow: true },
      { position: [7.0, 2.55, -3.0], intensity: 34, distance: 8.0, shadow: true },
      { position: [0, 2.5, -3.0], intensity: 24, distance: 8.0, shadow: false },
      { position: [7.0, 2.45, 5.5], intensity: 24, distance: 7.0, shadow: false },
      { position: [-8.0, floorHeight + 2.45, -6.2], intensity: 28, distance: 7.5, shadow: true },
      { position: [8.0, floorHeight + 2.45, -5.6], intensity: 24, distance: 7.0, shadow: false },
      { position: [-8.0, floorHeight + 2.45, 5.4], intensity: 24, distance: 7.0, shadow: false },
      { position: [8.0, floorHeight + 2.45, 5.4], intensity: 28, distance: 7.0, shadow: true },
      { position: [0, floorHeight + 2.5, 3.5], intensity: 22, distance: 7.0, shadow: false },
    ] as const;

    for (const config of lights) {
      const light = new THREE.PointLight(warm, config.intensity, config.distance, 2.0);
      light.position.set(config.position[0], config.position[1], config.position[2]);
      light.castShadow = this.shouldCastInteriorShadow(config.shadow);
      light.shadow.mapSize.set(256, 256);
      light.shadow.bias = -0.00012;
      this.entries.push({ light, baseIntensity: config.intensity });
      this.root.add(light);
      this.addBulb(config.position);
    }
  }

  private buildExteriorAccentLights(): void {
    const left = this.createEntranceSpot([-3.0, 2.2, -11.7], [0, 0.8, -14.8]);
    const right = this.createEntranceSpot([3.0, 2.2, -11.7], [0, 0.8, -14.8]);
    this.root.add(left.light, left.light.target, right.light, right.light.target);
    this.entries.push(left, right);
  }

  private createEntranceSpot(
    position: readonly [number, number, number],
    target: readonly [number, number, number],
  ): SpotLightRigEntry {
    const light = new THREE.SpotLight(0xffc993, 28, 18, Math.PI * 0.18, 0.58, 1.6);
    light.name = 'EntranceWarmSpot';
    light.position.set(position[0], position[1], position[2]);
    light.target.position.set(target[0], target[1], target[2]);
    light.castShadow = false;
    light.shadow.mapSize.set(256, 256);
    light.shadow.bias = -0.00015;
    return { light, baseIntensity: 28 };
  }

  private addBulb(position: readonly [number, number, number]): void {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      this.bulbMaterial,
    );
    bulb.name = 'WarmBulb';
    bulb.position.set(position[0], position[1], position[2]);
    bulb.castShadow = false;
    bulb.receiveShadow = false;
    this.emissiveBulbs.push(bulb);
    this.root.add(bulb);
  }

  private resolveNightFactor(timeOfDay: number): number {
    if (timeOfDay >= NIGHT_START || timeOfDay <= NIGHT_END) return 1;

    const morningFade = THREE.MathUtils.smoothstep(timeOfDay, NIGHT_END, NIGHT_END + 2.2);
    const eveningFade = THREE.MathUtils.smoothstep(timeOfDay, NIGHT_START - 2.2, NIGHT_START);
    return Math.max(1 - morningFade, eveningFade);
  }

  private shouldCastInteriorShadow(requested: boolean): boolean {
    if (!requested) return false;
    if (this.shadowedInteriorLights >= HOUSE_RENDERING_CONFIG.MAX_SHADOWED_INTERIOR_LIGHTS) {
      return false;
    }

    this.shadowedInteriorLights += 1;
    return true;
  }
}
