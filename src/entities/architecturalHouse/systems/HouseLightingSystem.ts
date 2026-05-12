import * as THREE from 'three';


type LightRigEntry = {
  readonly light: THREE.PointLight | THREE.SpotLight;
  readonly baseIntensity: number;
};


const NIGHT_START = 18.2;
const NIGHT_END = 6.5;

/** Interior and exterior architectural light rig with day/night response. */
export class HouseLightingSystem {
  private readonly root = new THREE.Group();
  private readonly entries: LightRigEntry[] = [];
  private readonly bulbMaterial = new THREE.MeshStandardMaterial({
    name: 'WarmBulbGlass',
    color: 0xffd7a2,
    emissive: 0xffb36b,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0,
  });

  private intensityMultiplier = 1;

  /**
   * @param sceneRoot - House feature root receiving the light rig.
   */
  constructor(sceneRoot: THREE.Group) {
    this.root.name = 'ArchitecturalLightRig';
    sceneRoot.add(this.root);
    // User requested to remove all house lights entirely
    // this.buildInteriorLights();
    // this.buildExteriorAccentLights();
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

  private resolveNightFactor(timeOfDay: number): number {
    if (timeOfDay >= NIGHT_START || timeOfDay <= NIGHT_END) return 1;

    const morningFade = THREE.MathUtils.smoothstep(timeOfDay, NIGHT_END, NIGHT_END + 2.2);
    const eveningFade = THREE.MathUtils.smoothstep(timeOfDay, NIGHT_START - 2.2, NIGHT_START);
    return Math.max(1 - morningFade, eveningFade);
  }
}
