import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Vector3Tuple } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import type { AssetStreamingScheduler } from '../../../core/AssetStreamingScheduler.ts';
import { ModelLoader } from '../../../loaders/ModelLoader.ts';
import { disposeObjectTree, forEachMaterial } from '../../../shared/three/dispose.ts';
import { HOUSE_CONFIG } from '../architecturalHouseConfig.ts';
import { HouseMaterialFactory } from '../materials/HouseMaterialFactory.ts';

type EstateLight = {
  readonly light: THREE.PointLight | THREE.SpotLight;
  readonly baseIntensity: number;
  readonly bulbMaterial?: THREE.MeshStandardMaterial;
};

type MovingCar = {
  readonly root: THREE.Group;
  readonly body: RAPIER.RigidBody;
  readonly bodyTranslation: RAPIER.Vector;
  readonly wheels: readonly THREE.Object3D[];
  readonly headlights: readonly EstateLight[];
  readonly direction: 1 | -1;
  readonly laneZ: number;
  readonly offset: number;
  readonly speed: number;
};

type TrafficCarModelConfig = {
  readonly path: string;
  readonly fit: {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  };
  readonly modelRotationY?: number;
  readonly wheelNamePatterns?: readonly RegExp[];
  readonly headlightsOffset?: { readonly x: number; readonly y: number; readonly z: number };
};

type TrafficCarSource = {
  readonly model: THREE.Group;
  readonly config: TrafficCarModelConfig;
};

type TreeModelConfig = {
  readonly path: string;
  readonly name: string;
  readonly scaleMultiplier: number;
};

type TreeModelSource = {
  readonly model: THREE.Group;
  readonly config: TreeModelConfig;
};

type VegetationPlacement = {
  readonly path: string;
  readonly name: string;
  readonly position: Vector3Tuple;
  readonly rotationY: number;
  readonly fit: {
    readonly width?: number;
    readonly depth?: number;
    readonly height?: number;
  };
  readonly lodDistance: number;
};

type FlowerClusterPlacement = {
  readonly path: string;
  readonly name: string;
  readonly position: Vector3Tuple;
  readonly rotationY: number;
  readonly scale: number;
};

const ROAD_Z = -42;
const ROAD_LENGTH = 132;
const ROAD_WIDTH = 6.2;
const DRIVEWAY_X = 8.8;
const NIGHT_START = 18.2;
const NIGHT_END = 6.5;
const ESTATE_MIN_X = -28;
const ESTATE_MAX_X = 28;
const ESTATE_MIN_Z = -34;
const ESTATE_MAX_Z = 22;
const USE_IMPORTED_TRAFFIC_CARS = true;

const TREE_LAYOUT = [
  // Inside
  { position: [-24, 0, -21], height: 7.2, canopy: 3.4, color: 0x5f7d4c },
  { position: [24, 0, -20], height: 6.8, canopy: 3.1, color: 0x58794a },
  { position: [-24, 0, 4], height: 7.7, canopy: 3.6, color: 0x6c8452 },
  { position: [24, 0, 7], height: 7.1, canopy: 3.25, color: 0x557449 },
  { position: [-15, 0, 18], height: 6.4, canopy: 3.0, color: 0x6f8355 },
  { position: [15, 0, 18], height: 6.6, canopy: 3.0, color: 0x5f7a4d },
  { position: [-22, 0, -30], height: 6.5, canopy: 3.2, color: 0x5f7d4c },
  { position: [22, 0, -30], height: 7.0, canopy: 3.5, color: 0x58794a },
  { position: [-10, 0, 19], height: 6.2, canopy: 2.8, color: 0x6c8452 },
  { position: [10, 0, 19], height: 6.9, canopy: 3.1, color: 0x557449 },
  
  // Back forest
  { position: [-40, 0, 30], height: 8.5, canopy: 4.0, color: 0x4a6b3d },
  { position: [-20, 0, 35], height: 9.2, canopy: 4.5, color: 0x3d5c31 },
  { position: [0, 0, 32], height: 8.8, canopy: 4.2, color: 0x4a6b3d },
  { position: [20, 0, 36], height: 9.5, canopy: 4.6, color: 0x3d5c31 },
  { position: [40, 0, 30], height: 8.2, canopy: 3.9, color: 0x4a6b3d },
  { position: [-35, 0, 45], height: 10.1, canopy: 5.0, color: 0x2e4725 },
  { position: [-10, 0, 42], height: 9.8, canopy: 4.8, color: 0x3d5c31 },
  { position: [15, 0, 48], height: 10.5, canopy: 5.2, color: 0x2e4725 },
  { position: [35, 0, 40], height: 9.0, canopy: 4.4, color: 0x4a6b3d },
  
  // Left forest
  { position: [-35, 0, -20], height: 8.0, canopy: 3.8, color: 0x4a6b3d },
  { position: [-45, 0, -10], height: 9.5, canopy: 4.5, color: 0x3d5c31 },
  { position: [-38, 0, 0], height: 8.5, canopy: 4.0, color: 0x4a6b3d },
  { position: [-42, 0, 10], height: 9.2, canopy: 4.3, color: 0x3d5c31 },
  { position: [-35, 0, 20], height: 8.7, canopy: 4.1, color: 0x4a6b3d },
  { position: [-50, 0, -25], height: 10.0, canopy: 4.8, color: 0x2e4725 },
  { position: [-55, 0, 5], height: 10.5, canopy: 5.0, color: 0x2e4725 },
  { position: [-48, 0, 15], height: 9.8, canopy: 4.6, color: 0x3d5c31 },
  
  // Right forest
  { position: [35, 0, -20], height: 8.2, canopy: 3.9, color: 0x4a6b3d },
  { position: [45, 0, -10], height: 9.0, canopy: 4.4, color: 0x3d5c31 },
  { position: [38, 0, 0], height: 8.4, canopy: 4.0, color: 0x4a6b3d },
  { position: [42, 0, 10], height: 9.5, canopy: 4.6, color: 0x3d5c31 },
  { position: [35, 0, 20], height: 8.8, canopy: 4.2, color: 0x4a6b3d },
  { position: [50, 0, -25], height: 10.2, canopy: 4.9, color: 0x2e4725 },
  { position: [55, 0, 5], height: 10.0, canopy: 4.8, color: 0x2e4725 },
  { position: [48, 0, 15], height: 9.6, canopy: 4.5, color: 0x3d5c31 },

  // Across street
  { position: [-40, 0, -50], height: 8.5, canopy: 4.0, color: 0x4a6b3d },
  { position: [-20, 0, -48], height: 9.2, canopy: 4.5, color: 0x3d5c31 },
  { position: [0, 0, -52], height: 8.8, canopy: 4.2, color: 0x4a6b3d },
  { position: [20, 0, -48], height: 9.5, canopy: 4.6, color: 0x3d5c31 },
  { position: [40, 0, -50], height: 8.2, canopy: 3.9, color: 0x4a6b3d },
  { position: [-35, 0, -60], height: 10.1, canopy: 5.0, color: 0x2e4725 },
  { position: [-10, 0, -65], height: 9.8, canopy: 4.8, color: 0x3d5c31 },
  { position: [15, 0, -58], height: 10.5, canopy: 5.2, color: 0x2e4725 },
  { position: [35, 0, -62], height: 9.0, canopy: 4.4, color: 0x4a6b3d },
] as const;

const LAMP_LAYOUT = [
  { x: -54, side: -1 },
  { x: -38, side: 1 },
  { x: -22, side: -1 },
  { x: -6, side: 1 },
  { x: 10, side: -1 },
  { x: 26, side: 1 },
  { x: 42, side: -1 },
  { x: 58, side: 1 },
] as const;

const VEGETATION_PLACEMENTS: readonly VegetationPlacement[] = [
  { path: '/models/vegetation/fern_02/fern_02.gltf', name: 'PondFernA', position: [18.9, 0.02, 6.1], rotationY: 0.4, fit: { width: 1.4, depth: 1.1, height: 0.7 }, lodDistance: 20 },
  { path: '/models/vegetation/fern_02/fern_02.gltf', name: 'PondFernB', position: [14.5, 0.02, 9.5], rotationY: -0.8, fit: { width: 1.25, depth: 1.0, height: 0.65 }, lodDistance: 20 },
  { path: '/models/vegetation/shrub_02/shrub_02.gltf', name: 'FenceShrubA', position: [-20.5, 0.02, -33.5], rotationY: 1.1, fit: { width: 2.2, depth: 1.5, height: 1.0 }, lodDistance: 24 },
  { path: '/models/vegetation/shrub_02/shrub_02.gltf', name: 'FenceShrubB', position: [21.0, 0.02, -33.0], rotationY: -0.6, fit: { width: 2.0, depth: 1.4, height: 0.95 }, lodDistance: 24 },
  { path: '/models/sketchfab/cracked_tree_trunk.glb', name: 'PhotogrammetryCrackedTreeTrunk', position: [-18.2, 0.02, 11.2], rotationY: -0.35, fit: { width: 1.25, depth: 1.15, height: 0.9 }, lodDistance: 60 },
] as const;

const TRAFFIC_CAR_MODELS: readonly TrafficCarModelConfig[] = [
  {
    path: '/models/sketchfab/cars/porsche_911_930/scene.gltf',
    fit: { width: 1.86, depth: 4.28, height: 1.32 },
    wheelNamePatterns: [
      /^Circle\.00[1-4]_\d+$/i,
    ],
    headlightsOffset: { x: 0.65, y: 0.6, z: 1.2 },
  },
  {
    path: '/models/sketchfab/cars/Classic_Muscle/classic_muscle_car.glb',
    fit: { width: 1.9, depth: 4.5, height: 1.4 },
    modelRotationY: 0,
    wheelNamePatterns: [
      /^Cube\.00[1245]_\d+$/i,
    ],
    headlightsOffset: { x: 0.7, y: 0.6, z: 1.2 },
  },
  {
    path: '/models/sketchfab/cars/Toyota_Corola/toyota_corola.glb',
    fit: { width: 1.85, depth: 4.3, height: 1.4 },
    modelRotationY: 0,
    wheelNamePatterns: [
      /^wheel/i,
    ],
    headlightsOffset: { x: 0.65, y: 0.6, z: 1.2 },
  },
] as const;

const TREE_MODEL_CONFIGS: readonly TreeModelConfig[] = [
  { path: '/models/sketchfab/trees/mega_tree_models.glb', name: 'MegaTree', scaleMultiplier: 1.0 },
  { path: '/models/sketchfab/trees/realistic_tree_models_for_games.glb', name: 'RealisticTree', scaleMultiplier: 1.0 },
] as const;

const SKETCHFAB_PLAYGROUND_MODEL_PATH = '/models/sketchfab/slide_playground.glb';
const SKETCHFAB_PLAYGROUND_FALLBACK_MODEL_PATH = '/models/sketchfab/kids_playground.glb';

const FLOWER_CLUSTER_PLACEMENTS: readonly FlowerClusterPlacement[] = [
  { path: '/models/sketchfab/lowpoly_flower_bushes.glb', name: 'FrontFlowerBushA', position: [-7.7, 0.14, -14.42], rotationY: 0.1, scale: 0.58 },
  { path: '/models/sketchfab/forsythia_bush.glb', name: 'FrontForsythiaA', position: [-6.35, 0.15, -14.35], rotationY: 1.25, scale: 0.72 },
  { path: '/models/sketchfab/lowpoly_flower_bushes.glb', name: 'FrontFlowerBushB', position: [-5.1, 0.14, -14.48], rotationY: -0.8, scale: 0.5 },
  { path: '/models/sketchfab/forsythia_bush.glb', name: 'FrontForsythiaB', position: [5.05, 0.15, -14.37], rotationY: -0.4, scale: 0.72 },
  { path: '/models/sketchfab/lowpoly_flower_bushes.glb', name: 'FrontFlowerBushC', position: [6.55, 0.14, -14.48], rotationY: 0.85, scale: 0.54 },
  { path: '/models/sketchfab/forsythia_bush.glb', name: 'FrontForsythiaC', position: [7.95, 0.15, -14.36], rotationY: -1.1, scale: 0.68 },
];

/** Builds and animates the exterior estate around the architectural house. */
export class OutdoorEstateSystem {
  private readonly world: RAPIER.World;
  private readonly root = new THREE.Group();
  private readonly scheduler: AssetStreamingScheduler;
  private readonly loader = new ModelLoader();
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly modelCache = new Map<string, Promise<THREE.Group>>();
  private readonly materials: {
    readonly asphalt: THREE.MeshStandardMaterial;
    readonly grass: THREE.MeshStandardMaterial;
    readonly concrete: THREE.MeshStandardMaterial;
    readonly fence: THREE.MeshStandardMaterial;
    readonly roadLine: THREE.MeshStandardMaterial;
    readonly soil: THREE.MeshStandardMaterial;
    readonly flowerLeaf: THREE.MeshStandardMaterial;
    readonly flowerPetal: THREE.MeshStandardMaterial;
    readonly playground: THREE.MeshStandardMaterial;
    readonly water: THREE.MeshPhysicalMaterial;
    readonly treeTrunk: THREE.MeshStandardMaterial;
    readonly treeLeaf: THREE.MeshStandardMaterial;
    readonly proxy: THREE.MeshStandardMaterial;
    readonly carPaints: readonly THREE.MeshStandardMaterial[];
    readonly carGlass: THREE.MeshPhysicalMaterial;
    readonly tire: THREE.MeshStandardMaterial;
    readonly rim: THREE.MeshStandardMaterial;
    readonly tailLight: THREE.MeshStandardMaterial;
  };

  private readonly rigidBodies: RAPIER.RigidBody[] = [];
  private readonly estateLights: EstateLight[] = [];
  private readonly movingCars: MovingCar[] = [];
  private trafficInitialized = false;
  private elapsed = 0;

  /**
   * @param world - Active Rapier world used for coarse exterior colliders.
   * @param sceneRoot - House-local root that receives the estate.
   * @param materialFactory - Shared material factory for consistent PBR tuning.
   */
  constructor(
    world: RAPIER.World,
    sceneRoot: THREE.Group,
    materialFactory: HouseMaterialFactory,
    scheduler: AssetStreamingScheduler,
  ) {
    this.world = world;
    this.scheduler = scheduler;
    this.root.name = 'OutdoorEstate';
    sceneRoot.add(this.root);

    this.materials = {
      asphalt: this.createTerrainMaterial(
        'EstateAsphalt',
        '/textures/terrain/asphalt_02_diff_1k.jpg',
        '/textures/terrain/asphalt_02_normal_1k.jpg',
        '/textures/terrain/asphalt_02_arm_1k.jpg',
        [18, 1.8],
        0x4c4b48,
        0.86,
      ),
      grass: this.createTerrainMaterial(
        'EstateLeafyGrass',
        '/textures/terrain/leafy_grass_diff_1k.jpg',
        '/textures/terrain/leafy_grass_normal_1k.jpg',
        '/textures/terrain/leafy_grass_arm_1k.jpg',
        [18, 18],
        0x6a7650,
        0.93,
      ),
      concrete: materialFactory.createSurfaceMaterial('exteriorConcrete', 'EstateConcrete'),
      fence: materialFactory.createSurfaceMaterial('oak', 'WarmFenceOak'),
      roadLine: materialFactory.createSolidMaterial('RoadPaint', 0xd8d1bd, 0.76),
      soil: materialFactory.createSolidMaterial('FlowerbedSoil', 0x2f241b, 0.96),
      flowerLeaf: materialFactory.createSolidMaterial('FlowerLeaves', 0x46663b, 0.9),
      flowerPetal: materialFactory.createSolidMaterial('FlowerPetals', 0xd9917a, 0.78),
      playground: materialFactory.createSolidMaterial('PlaygroundPaintedMetal', 0x8d3f32, 0.58, 0.08),
      water: new THREE.MeshPhysicalMaterial({
        name: 'EstatePondWater',
        color: 0x87aead,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.28,
        thickness: 0.18,
        transparent: true,
        opacity: 0.58,
        envMapIntensity: 1.2,
      }),
      treeTrunk: materialFactory.createSolidMaterial('InstancedTreeBark', 0x4c3728, 0.86),
      treeLeaf: materialFactory.createSolidMaterial('InstancedTreeLeaves', 0x5d7a4f, 0.82),
      proxy: materialFactory.createSolidMaterial('VegetationLODProxy', 0x4f6644, 0.92),
      carPaints: [
        materialFactory.createSolidMaterial('TrafficCarPearlWhite', 0xd9d5cc, 0.38, 0.18),
        materialFactory.createSolidMaterial('TrafficCarGraphite', 0x23272b, 0.34, 0.24),
        materialFactory.createSolidMaterial('TrafficCarDeepBlue', 0x1e3044, 0.32, 0.2),
      ],
      carGlass: new THREE.MeshPhysicalMaterial({
        name: 'TrafficCarGlass',
        color: 0x8392a2,
        roughness: 0.05,
        metalness: 0,
        transmission: 0.25,
        thickness: 0.06,
        transparent: true,
        opacity: 0.46,
        envMapIntensity: 1.15,
      }),
      tire: materialFactory.createSolidMaterial('TrafficTireRubber', 0x090909, 0.82),
      rim: materialFactory.createSolidMaterial('TrafficWheelRim', 0xb4b4ac, 0.34, 0.42),
      tailLight: materialFactory.createSolidMaterial('TrafficTailLight', 0xa42016, 0.28),
    };
    this.buildHardscape();
    this.buildFenceColliders();
    this.buildGardenDetails();
    this.registerTreeColliders();
    this.buildFlowerbeds();
  }

  /** Loads imported exterior props that are worth the extra geometry. */
  async load(): Promise<void> {
    if (USE_IMPORTED_TRAFFIC_CARS) {
      await this.loadMovingCars();
    } else {
      this.createProceduralMovingCars();
    }

    try {
      await this.scheduler.enqueue('estate:road-lamps', 'background', () => this.loadRoadLamps());
    } catch (error) {
      console.warn('[OutdoorEstateSystem] Road lamps failed.', error);
    }

    await this.loadVegetationAccents();
    await this.loadSketchfabTrees();
    await this.loadSketchfabPlayground();
    await this.loadImportedFlowerbeds();

    try {
      await this.scheduler.enqueue('estate:custom-fence', 'background', () => this.loadCustomFence());
    } catch (error) {
      console.warn('[OutdoorEstateSystem] Custom fence failed to load.', error);
    }
  }

  /**
   * Advances day/night reactive lighting and lightweight car traffic.
   *
   * @param delta - Frame delta in seconds.
   * @param timeOfDay - Current simulated hour in [0, 24).
   */
  update(delta: number, timeOfDay: number): void {
    this.elapsed += delta;
    const nightFactor = this.resolveNightFactor(timeOfDay);

    for (const entry of this.estateLights) {
      entry.light.intensity = entry.baseIntensity * nightFactor;
      if (entry.bulbMaterial) {
        entry.bulbMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.04, 1.85, nightFactor);
      }
    }

    this.updateCars(delta, nightFactor);
  }

  /** Removes exterior colliders and GPU resources owned by this system. */
  dispose(): void {
    for (const body of this.rigidBodies) {
      this.world.removeRigidBody(body);
    }
    this.rigidBodies.length = 0;

    this.root.removeFromParent();
    disposeObjectTree(this.root);
    this.root.clear();

    for (const value of Object.values(this.materials)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          this.disposeMaterialTextures(item);
          item.dispose();
        }
        continue;
      }

      const material = value as THREE.Material;
      this.disposeMaterialTextures(material);
      material.dispose();
    }
  }

  private buildHardscape(): void {
    const estateGround = this.createBox(
      'EstateGroundPlate',
      ESTATE_MAX_X - ESTATE_MIN_X,
      0.05,
      ESTATE_MAX_Z - ESTATE_MIN_Z,
      this.materials.grass,
      [(ESTATE_MIN_X + ESTATE_MAX_X) / 2, -0.035, (ESTATE_MIN_Z + ESTATE_MAX_Z) / 2],
    );
    estateGround.receiveShadow = true;
    this.root.add(estateGround);

    const road = this.createBox('ResidentialRoad', ROAD_LENGTH, 0.06, ROAD_WIDTH, this.materials.asphalt, [0, 0, ROAD_Z]);
    road.receiveShadow = true;
    this.root.add(road);

    const leftCurb = this.createBox('RoadCurbLeft', ROAD_LENGTH, 0.14, 0.26, this.materials.concrete, [0, 0.06, ROAD_Z - ROAD_WIDTH / 2 - 0.18]);
    const rightCurb = this.createBox('RoadCurbRight', ROAD_LENGTH, 0.14, 0.26, this.materials.concrete, [0, 0.06, ROAD_Z + ROAD_WIDTH / 2 + 0.18]);
    const driveway = this.createBox('DrivewayToHouse', 4.0, 0.045, 22.5, this.materials.concrete, [DRIVEWAY_X, 0.025, -25.5]);
    const entryWalk = this.createBox('EntryWalkway', 2.05, 0.04, 13.8, this.materials.concrete, [0, 0.03, -18.4]);

    for (const mesh of [leftCurb, rightCurb, driveway, entryWalk]) {
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    this.buildRoadMarkings();
  }

  private buildFenceColliders(): void {
    this.addFixedCuboid([-15.8, 0.62, ESTATE_MIN_Z], [12.2, 0.62, 0.18]);
    this.addFixedCuboid([20.6, 0.62, ESTATE_MIN_Z], [7.4, 0.62, 0.18]);
    this.addFixedCuboid([0, 0.62, ESTATE_MAX_Z], [28, 0.62, 0.18]);
    this.addFixedCuboid([ESTATE_MIN_X, 0.62, -6], [0.18, 0.62, 28]);
    this.addFixedCuboid([ESTATE_MAX_X, 0.62, -6], [0.18, 0.62, 28]);
  }

  private async loadCustomFence(): Promise<void> {
    const source = await this.getModel('/models/sketchfab/fence.glb');
    let fenceMesh: THREE.Mesh | undefined;
    
    source.traverse((child) => {
      if (child instanceof THREE.Mesh && !fenceMesh) {
        fenceMesh = child as THREE.Mesh;
      }
    });

    if (!fenceMesh) return;

    fenceMesh.updateMatrixWorld(true);
    const geometry = fenceMesh.geometry.clone();
    geometry.applyMatrix4(fenceMesh.matrixWorld);
    
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const isZAligned = size.z > size.x;
    const length = isZAligned ? size.z : size.x;
    
    const targetLength = 4.0; // 2x bigger (4 meters instead of 2)
    const scaleFactor = length > 0.1 ? targetLength / length : 1.0;
    const rotationOffset = isZAligned ? Math.PI * 0.5 : 0;

    let material = fenceMesh.material;
    if (Array.isArray(material)) material = material[0];
    if (material instanceof THREE.MeshStandardMaterial) {
      this.tuneImportedMaterial(material, 'fence', false);
    }

    const instances = new THREE.InstancedMesh(geometry, material, 100);
    instances.name = 'CustomFenceInstanced';
    instances.castShadow = false;
    instances.receiveShadow = true;

    const yPos = (size.y * scaleFactor) / 2;

    const proxyGeometry = new THREE.BoxGeometry(4.0, size.y * scaleFactor, 0.4);
    const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const shadowProxies = new THREE.InstancedMesh(proxyGeometry, proxyMaterial, 100);
    shadowProxies.name = 'CustomFenceShadowProxies';
    shadowProxies.castShadow = true;
    shadowProxies.receiveShadow = false;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor);
    const position = new THREE.Vector3();
    let panelIndex = 0;

    const addPanel = (x: number, z: number, rotationY = 0): void => {
      position.set(x, yPos, z);
      quaternion.setFromEuler(new THREE.Euler(0, rotationY + rotationOffset, 0));
      matrix.compose(position, quaternion, scale);
      instances.setMatrixAt(panelIndex, matrix);
      
      const proxyScale = new THREE.Vector3(1, 1, 1);
      const proxyMatrix = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)), proxyScale);
      shadowProxies.setMatrixAt(panelIndex, proxyMatrix);
      
      panelIndex += 1;
    };

    const step = 4.0;

    // Horizontal panels
    for (let x = ESTATE_MIN_X; x < ESTATE_MAX_X; x += step) {
      if (x < -4 || x >= 12) {
        addPanel(x + step / 2, ESTATE_MIN_Z);
      }
      addPanel(x + step / 2, ESTATE_MAX_Z);
    }

    // Vertical panels
    for (let z = ESTATE_MIN_Z; z < ESTATE_MAX_Z; z += step) {
      addPanel(ESTATE_MIN_X, z + step / 2, Math.PI * 0.5);
      addPanel(ESTATE_MAX_X, z + step / 2, Math.PI * 0.5);
    }

    instances.count = panelIndex;
    shadowProxies.count = panelIndex;
    
    this.root.add(instances, shadowProxies);
  }

  private buildRoadMarkings(): void {
    const dashGeometry = new THREE.BoxGeometry(2.4, 0.012, 0.12);
    const dashes = new THREE.InstancedMesh(dashGeometry, this.materials.roadLine, 22);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();

    for (let index = 0; index < 22; index += 1) {
      position.set(-ROAD_LENGTH / 2 + 4 + index * 6, 0.075, ROAD_Z);
      matrix.compose(position, quaternion, scale);
      dashes.setMatrixAt(index, matrix);
    }

    dashes.name = 'RoadCenterDashes';
    this.root.add(dashes);

    const leftEdge = this.createBox('RoadEdgeLineLeft', ROAD_LENGTH, 0.012, 0.08, this.materials.roadLine, [0, 0.076, ROAD_Z - ROAD_WIDTH / 2 + 0.5]);
    const rightEdge = this.createBox('RoadEdgeLineRight', ROAD_LENGTH, 0.012, 0.08, this.materials.roadLine, [0, 0.076, ROAD_Z + ROAD_WIDTH / 2 - 0.5]);
    this.root.add(leftEdge, rightEdge);
  }

  private buildGardenDetails(): void {
    this.buildPond();
    this.buildFountain();
    this.buildPlayground();
  }

  private registerTreeColliders(): void {
    for (const tree of TREE_LAYOUT) {
      this.addFixedCuboid([tree.position[0], 1.1, tree.position[2]], [0.55, 1.1, 0.55]);
    }
  }

  private buildPond(): void {
    const bank = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.09, 40),
      this.materials.soil,
    );
    bank.name = 'PondBank';
    bank.position.set(17.1, 0.02, 8.0);
    bank.scale.set(4.9, 1, 3.3);
    bank.receiveShadow = true;
    this.root.add(bank);

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.045, 48),
      this.materials.water,
    );
    water.name = 'PondWater';
    water.position.set(17.1, 0.09, 8.0);
    water.scale.set(4.35, 1, 2.75);
    water.receiveShadow = true;
    this.root.add(water);
  }

  private buildFountain(): void {
    const stone = this.materials.concrete;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.55, 0.32, 36), stone);
    base.name = 'GardenFountainBase';
    base.position.set(-16.2, 0.16, 10.6);
    base.castShadow = true;
    base.receiveShadow = true;

    const basin = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.14, 10, 36), stone);
    basin.name = 'GardenFountainBasin';
    basin.position.set(-16.2, 0.48, 10.6);
    basin.rotation.x = Math.PI * 0.5;
    basin.castShadow = true;
    basin.receiveShadow = true;

    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.035, 36), this.materials.water);
    water.name = 'GardenFountainWater';
    water.position.set(-16.2, 0.5, 10.6);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.85, 18), stone);
    column.name = 'GardenFountainColumn';
    column.position.set(-16.2, 0.9, 10.6);
    column.castShadow = true;
    column.receiveShadow = true;

    this.root.add(base, basin, water, column);
    this.addFixedCuboid([-16.2, 0.32, 10.6], [1.35, 0.32, 1.35]);
  }

  private buildPlayground(): void {
    const rubberBase = new THREE.Mesh(
      new RoundedBoxGeometry(7.0, 0.08, 5.2, 4, 0.08),
      this.materials.asphalt,
    );
    rubberBase.name = 'PlaygroundRubberSafetySurface';
    rubberBase.position.set(-18.8, 0.035, -22.5);
    rubberBase.receiveShadow = true;
    this.root.add(rubberBase);

    this.addFixedCuboid([-18.6, 0.72, -20.1], [0.95, 0.72, 1.45]);
    this.addFixedCuboid([-14.5, 0.22, -23.3], [1.7, 0.22, 1.35]);
    this.addFixedCuboid([-21.2, 1.15, -24.2], [1.85, 1.15, 0.72]);
  }

  private buildOptimizedTrees(): void {
    this.configureTreeMaterials();

    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.48, 1, 10);
    const branchGeometry = new THREE.CylinderGeometry(0.035, 0.085, 1, 7);
    const leafGeometry = new THREE.PlaneGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeometry, this.materials.treeTrunk, TREE_LAYOUT.length);
    const branches = new THREE.InstancedMesh(branchGeometry, this.materials.treeTrunk, TREE_LAYOUT.length * 9);
    const leaves = new THREE.InstancedMesh(leafGeometry, this.materials.treeLeaf, TREE_LAYOUT.length * 150);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const branchDirection = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const source = new THREE.Vector3();
    const target = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const leafColor = new THREE.Color();
    let branchIndex = 0;
    let leafIndex = 0;

    TREE_LAYOUT.forEach((tree, index) => {
      const height = tree.height;
      position.set(tree.position[0], height / 2, tree.position[2]);
      quaternion.setFromEuler(new THREE.Euler(0, index * 0.42, 0));
      scale.set(0.72 + (index % 3) * 0.08, height, 0.72 + (index % 2) * 0.08);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(index, matrix);

      for (let branch = 0; branch < 9; branch += 1) {
        const normalized = branch / 9;
        const angle = normalized * Math.PI * 2 + index * 0.73;
        const branchHeight = height * (0.48 + (branch % 4) * 0.09);
        const branchLength = tree.canopy * (0.52 + (branch % 3) * 0.14);
        source.set(tree.position[0], branchHeight, tree.position[2]);
        target.set(
          tree.position[0] + Math.cos(angle) * branchLength,
          branchHeight + 0.45 + Math.sin(branch * 1.7) * 0.16,
          tree.position[2] + Math.sin(angle) * branchLength,
        );
        midpoint.addVectors(source, target).multiplyScalar(0.5);
        branchDirection.subVectors(target, source);
        const resolvedBranchLength = branchDirection.length();
        branchDirection.normalize();
        quaternion.setFromUnitVectors(yAxis, branchDirection);
        scale.set(1, resolvedBranchLength, 1);
        matrix.compose(midpoint, quaternion, scale);
        branches.setMatrixAt(branchIndex, matrix);
        branchIndex += 1;

        for (let leaf = 0; leaf < 16; leaf += 1) {
          const leafT = 0.45 + leaf * 0.035;
          const scatterAngle = angle + leaf * 2.17;
          const scatterRadius = tree.canopy * (0.18 + (leaf % 5) * 0.045);
          position.lerpVectors(source, target, leafT);
          position.x += Math.cos(scatterAngle) * scatterRadius;
          position.y += Math.sin(leaf * 1.31) * 0.32;
          position.z += Math.sin(scatterAngle) * scatterRadius;
          quaternion.setFromEuler(new THREE.Euler(
            Math.sin(leaf + index) * 0.9,
            scatterAngle,
            Math.cos(leaf * 0.7) * 0.55,
          ));
          const leafScale = 0.58 + ((leaf + branch + index) % 5) * 0.08;
          scale.set(leafScale * 1.18, leafScale * 0.74, leafScale);
          matrix.compose(position, quaternion, scale);
          leaves.setMatrixAt(leafIndex, matrix);
          leafColor.setHex(tree.color).offsetHSL(0, 0.02, ((leaf % 7) - 3) * 0.018);
          leaves.setColorAt(
            leafIndex,
            leafColor,
          );
          leafIndex += 1;
        }
      }
    });

    trunks.name = 'OptimizedTreeTrunks';
    branches.name = 'OptimizedTreeBranches';
    leaves.name = 'OptimizedTreeLeafClusters';
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    branches.castShadow = true;
    branches.receiveShadow = true;
    leaves.castShadow = false;
    leaves.receiveShadow = true;
    branches.count = branchIndex;
    leaves.count = leafIndex;
    if (leaves.instanceColor) {
      leaves.instanceColor.needsUpdate = true;
    }
    this.root.add(trunks, branches, leaves);
  }

  private buildFlowerbeds(): void {
    const bedA = this.createBox('FlowerbedFrontLeft', 5.4, 0.18, 1.2, this.materials.soil, [-6.5, 0.09, -14.2]);
    const bedB = this.createBox('FlowerbedFrontRight', 5.4, 0.18, 1.2, this.materials.soil, [6.5, 0.09, -14.2]);
    bedA.receiveShadow = true;
    bedB.receiveShadow = true;
    this.root.add(bedA, bedB);
  }

  private async loadRoadLamps(): Promise<void> {
    const source = await this.getModel('/models/exterior/outdoor_lamp.gltf');

    for (const item of LAMP_LAYOUT) {
      const model = source.clone(true);
      this.prepareImportedModel(model, true);

      const container = new THREE.Group();
      container.name = `RoadLamp_${item.x}`;
      container.position.set(item.x, 0, ROAD_Z + item.side * (ROAD_WIDTH / 2 + 1.55));
      container.rotation.y = item.side > 0 ? Math.PI : 0;
      container.add(model);
      this.root.add(container);

      const bulbMaterial = new THREE.MeshStandardMaterial({
        name: 'RoadLampBulb',
        color: 0xffd39b,
        emissive: 0xffb36c,
        emissiveIntensity: 0.05,
        roughness: 0.24,
      });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), bulbMaterial);
      bulb.position.set(0, 3.25, 0);
      container.add(bulb);

      const light = new THREE.PointLight(0xffc58b, 0, 9.5, 2.1);
      light.position.set(0, 3.25, 0);
      light.castShadow = false;
      container.add(light);
      this.estateLights.push({ light, baseIntensity: 30, bulbMaterial });
      this.addFixedCuboid([container.position.x, 1.35, container.position.z], [0.22, 1.35, 0.22]);
    }
  }

  private async loadMovingCars(): Promise<void> {
    const sources: TrafficCarSource[] = [];

    for (const config of TRAFFIC_CAR_MODELS) {
      try {
        sources.push(await this.scheduler.enqueue(
          `estate:traffic-source:${config.path}`,
          'background',
          async () => ({
            config,
            model: await this.getModel(config.path),
          }),
        ));
      } catch (error) {
        console.warn('[OutdoorEstateSystem] Traffic car model load failed.', error);
      }
    }

    if (sources.length > 0) {
      await this.createImportedMovingCars(sources);
      return;
    }

    this.createProceduralMovingCars();
  }

  private async createImportedMovingCars(sources: readonly TrafficCarSource[]): Promise<void> {
    if (this.trafficInitialized) return;
    this.trafficInitialized = true;

    const carConfigs = [
      { direction: 1 as const, laneZ: ROAD_Z - 1.05, offset: 4, speed: 6.2 },
      { direction: -1 as const, laneZ: ROAD_Z + 1.05, offset: 38, speed: 5.3 },
      { direction: 1 as const, laneZ: ROAD_Z - 1.05, offset: 82, speed: 4.8 },
      { direction: -1 as const, laneZ: ROAD_Z + 1.05, offset: 110, speed: 5.8 },
    ];

    for (const [index, config] of carConfigs.entries()) {
      await this.scheduler.enqueue(`estate:traffic-instance:${index}`, 'background', async () => {
        const source = sources[index % sources.length];
        const root = new THREE.Group();
        root.name = `MovingRoadCar_${index}`;
        root.rotation.y = config.direction > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

        const model = source.model.clone(true);
        model.name = `TrafficCarModel_${index}`;
        model.rotation.y = source.config.modelRotationY ?? 0;
        model.updateMatrixWorld(true);
        this.prepareImportedModel(model, false);
        this.normalizeModel(model, source.config.fit);
        root.add(model);

        const headlights = this.createCarHeadlights(root, source.config);
        const body = this.createMovingCarBody(config.laneZ);
        this.root.add(root);
        this.movingCars.push({
          root,
          body,
          bodyTranslation: { x: 0, y: 0, z: 0 },
          wheels: this.collectTrafficWheels(model, source.config),
          headlights,
          direction: config.direction,
          laneZ: config.laneZ,
          offset: config.offset,
          speed: config.speed,
        });
      });
    }
  }

  private createProceduralMovingCars(): void {
    if (this.trafficInitialized) return;
    this.trafficInitialized = true;

    const carConfigs = [
      { direction: 1 as const, laneZ: ROAD_Z - 1.05, offset: 4, speed: 6.2 },
      { direction: -1 as const, laneZ: ROAD_Z + 1.05, offset: 38, speed: 5.3 },
      { direction: 1 as const, laneZ: ROAD_Z - 1.05, offset: 82, speed: 4.8 },
      { direction: -1 as const, laneZ: ROAD_Z + 1.05, offset: 110, speed: 5.8 },
    ];

    for (const [index, config] of carConfigs.entries()) {
      const root = new THREE.Group();
      root.name = `MovingRoadCar_${index}`;
      root.rotation.y = config.direction > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const { wheels } = this.createProceduralTrafficCar(root, this.materials.carPaints[index % this.materials.carPaints.length]);

      const headlights = this.createCarHeadlights(root);
      const body = this.createMovingCarBody(config.laneZ);
      this.root.add(root);
      this.movingCars.push({
        root,
        body,
        bodyTranslation: { x: 0, y: 0, z: 0 },
        wheels,
        headlights,
        direction: config.direction,
        laneZ: config.laneZ,
        offset: config.offset,
        speed: config.speed,
      });
    }
  }

  private createProceduralTrafficCar(
    root: THREE.Group,
    paintMaterial: THREE.MeshStandardMaterial,
  ): { wheels: readonly THREE.Object3D[] } {
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(1.9, 0.58, 4.25, 5, 0.16),
      paintMaterial,
    );
    body.name = 'TrafficCarBody';
    body.position.set(0, 0.56, 0);
    body.castShadow = true;
    body.receiveShadow = true;

    const lowerBody = new THREE.Mesh(
      new RoundedBoxGeometry(1.96, 0.28, 3.9, 4, 0.08),
      paintMaterial,
    );
    lowerBody.name = 'TrafficCarLowerBody';
    lowerBody.position.set(0, 0.33, 0.08);
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;

    const cabin = new THREE.Mesh(
      new RoundedBoxGeometry(1.42, 0.72, 1.55, 5, 0.11),
      this.materials.carGlass,
    );
    cabin.name = 'TrafficCarCabinGlass';
    cabin.position.set(0, 1.02, -0.1);
    cabin.castShadow = true;
    cabin.receiveShadow = true;

    const roof = new THREE.Mesh(
      new RoundedBoxGeometry(1.34, 0.16, 1.42, 4, 0.08),
      paintMaterial,
    );
    roof.name = 'TrafficCarRoof';
    roof.position.set(0, 1.42, -0.1);
    roof.castShadow = true;
    roof.receiveShadow = true;

    const grille = new THREE.Mesh(
      new RoundedBoxGeometry(1.2, 0.18, 0.08, 3, 0.025),
      this.materials.rim,
    );
    grille.name = 'TrafficCarFrontGrille';
    grille.position.set(0, 0.54, 2.16);

    const rearLights = new THREE.Group();
    rearLights.name = 'TrafficCarTailLights';
    for (const x of [-0.58, 0.58]) {
      const tail = new THREE.Mesh(
        new RoundedBoxGeometry(0.28, 0.12, 0.04, 2, 0.015),
        this.materials.tailLight,
      );
      tail.position.set(x, 0.62, -2.15);
      rearLights.add(tail);
    }

    root.add(body, lowerBody, cabin, roof, grille, rearLights);

    const wheels: THREE.Object3D[] = [];
    for (const x of [-1.02, 1.02]) {
      for (const z of [-1.35, 1.35]) {
        const wheel = this.createWheel();
        wheel.position.set(x, 0.33, z);
        root.add(wheel);
        wheels.push(wheel);
      }
    }

    const mirrorGeometry = new RoundedBoxGeometry(0.16, 0.08, 0.26, 3, 0.025);
    for (const x of [-1.02, 1.02]) {
      const mirror = new THREE.Mesh(mirrorGeometry, paintMaterial);
      mirror.name = 'TrafficCarSideMirror';
      mirror.position.set(x, 1.02, 0.72);
      mirror.castShadow = true;
      root.add(mirror);
    }

    return { wheels };
  }

  private createWheel(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'TrafficCarWheel';

    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.25, 24),
      this.materials.tire,
    );
    tire.rotation.z = Math.PI * 0.5;
    tire.castShadow = true;
    tire.receiveShadow = true;

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.27, 18),
      this.materials.rim,
    );
    rim.rotation.z = Math.PI * 0.5;
    rim.castShadow = true;
    rim.receiveShadow = true;

    group.add(tire, rim);
    return group;
  }

  private async loadVegetationAccents(): Promise<void> {
    for (const placement of VEGETATION_PLACEMENTS) {
      try {
        await this.scheduler.enqueue(`estate:vegetation:${placement.name}`, 'idle', async () => {
          const sourcePromise = this.getModel(placement.path);
          const source = await sourcePromise;
          const model = source.clone(true);
          this.prepareImportedModel(model, false, true);
          this.normalizeModel(model, placement.fit);

          const lod = this.createImportedLod(model, placement.lodDistance);
          lod.name = `${placement.name}LOD`;

          const container = new THREE.Group();
          container.name = placement.name;
          container.position.set(...placement.position);
          container.rotation.y = placement.rotationY;
          container.add(lod);
          this.root.add(container);
        });
      } catch (error) {
        console.warn(`[OutdoorEstateSystem] Vegetation failed: ${placement.name}`, error);
      }
    }
  }

  private async loadSketchfabTrees(): Promise<void> {
    const sources: TreeModelSource[] = [];

    for (const config of TREE_MODEL_CONFIGS) {
      try {
        const source = await this.scheduler.enqueue(
          `estate:tree-source:${config.name}`,
          'idle',
          async () => {
            const model = await this.getModel(config.path);
            this.prepareImportedModel(model, false, true);
            this.normalizeModel(model, { height: 1 });
            return { model, config };
          },
        );
        sources.push(source);
      } catch (error) {
        console.warn('[OutdoorEstateSystem] Sketchfab tree model load failed.', error);
      }
    }

    if (sources.length === 0) {
      this.buildOptimizedTrees();
      return;
    }

    for (const [index, tree] of TREE_LAYOUT.entries()) {
      try {
        await this.scheduler.enqueue(`estate:tree-instance:${index}`, 'idle', async () => {
          const source = sources[index % sources.length];
          const model = source.model.clone(true);
          model.name = `${source.config.name}Model_${index}`;

          const container = new THREE.Group();
          container.name = `${source.config.name}_${index}`;
          container.position.set(tree.position[0], 0.02, tree.position[2]);
          container.rotation.y = index * 0.42;
          container.scale.setScalar(tree.height * source.config.scaleMultiplier);
          container.add(model);
          this.root.add(container);
        });
      } catch (error) {
        console.warn(`[OutdoorEstateSystem] Tree instance failed: ${index}`, error);
      }
    }
  }

  private async loadSketchfabPlayground(): Promise<void> {
    try {
      await this.scheduler.enqueue('estate:playground:primary', 'idle', async () => {
        await this.loadPlaygroundModel(SKETCHFAB_PLAYGROUND_MODEL_PATH, 'SketchfabSlidePlayground', {
          width: 6.4,
          depth: 4.8,
          height: 2.85,
        });
      });
    } catch (primaryError) {
      console.warn('[OutdoorEstateSystem] Primary Sketchfab playground failed, trying fallback.', primaryError);
      try {
        await this.scheduler.enqueue('estate:playground:fallback', 'idle', async () => {
          await this.loadPlaygroundModel(SKETCHFAB_PLAYGROUND_FALLBACK_MODEL_PATH, 'SketchfabKidsPlayground', {
            width: 6.8,
            depth: 5.0,
            height: 2.65,
          });
        });
      } catch (fallbackError) {
        console.warn('[OutdoorEstateSystem] Sketchfab playground fallback failed.', fallbackError);
      }
    }
  }

  private async loadPlaygroundModel(
    path: string,
    name: string,
    fit: VegetationPlacement['fit'],
  ): Promise<void> {
    const model = await this.getModel(path);
    this.prepareImportedModel(model, true);
    this.normalizeModel(model, fit);

    const container = new THREE.Group();
    container.name = name;
    container.position.set(-18.8, 0.08, -22.5);
    container.rotation.y = Math.PI * 0.5;
    container.add(model);
    this.root.add(container);
  }

  private async loadImportedFlowerbeds(): Promise<void> {
    for (const placement of FLOWER_CLUSTER_PLACEMENTS) {
      await this.scheduler.enqueue(`estate:flowerbed:${placement.name}`, 'idle', async () => {
        try {
          const sourcePromise = this.getModel(placement.path).then((source) => {
            if (!source.userData['estatePrepared']) {
              this.prepareImportedModel(source, false, true);
              this.normalizeModel(source, { height: 1 });
              source.userData['estatePrepared'] = true;
            }
            return source;
          });

          const source = await sourcePromise;
          const model = source.clone(true);
          model.name = `${placement.name}Model`;

          const container = new THREE.Group();
          container.name = placement.name;
          container.position.set(...placement.position);
          container.rotation.y = placement.rotationY;
          container.scale.setScalar(placement.scale);
          container.add(model);
          this.root.add(container);
        } catch (error) {
          console.warn(`[OutdoorEstateSystem] Flower cluster load failed: ${placement.path}`, error);
        }
      });
    }
  }

  private updateCars(_delta: number, nightFactor: number): void {
    const trackStart = -ROAD_LENGTH / 2 - 7;
    const trackSpan = ROAD_LENGTH + 14;

    for (const car of this.movingCars) {
      const travelled = (this.elapsed * car.speed + car.offset) % trackSpan;
      const x = car.direction > 0
        ? trackStart + travelled
        : -trackStart - travelled;
      car.root.position.set(x, 0.03, car.laneZ);
      const sceneRoot = HOUSE_CONFIG.ROOT_POSITION;
      car.bodyTranslation.x = sceneRoot[0] + x;
      car.bodyTranslation.y = sceneRoot[1] + 0.72;
      car.bodyTranslation.z = sceneRoot[2] + car.laneZ;
      car.body.setNextKinematicTranslation(car.bodyTranslation);

      for (const headlight of car.headlights) {
        headlight.light.intensity = headlight.baseIntensity * nightFactor;
        if (headlight.bulbMaterial) {
          headlight.bulbMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.03, 2.2, nightFactor);
        }
      }
    }
  }

  private createCarHeadlights(carRoot: THREE.Group, config?: TrafficCarModelConfig): EstateLight[] {
    const lights: EstateLight[] = [];

    const offsetX = config?.headlightsOffset?.x ?? 0.46;
    const offsetY = config?.headlightsOffset?.y ?? 0.58;
    const offsetZ = config?.headlightsOffset?.z ?? 2.1;

    for (const x of [-offsetX, offsetX]) {
      const bulbMaterial = new THREE.MeshStandardMaterial({
        name: 'CarHeadlightBulb',
        color: 0xf4f0df,
        emissive: 0xfff1c0,
        emissiveIntensity: 0.03,
        roughness: 0.16,
      });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), bulbMaterial);
      bulb.position.set(x, offsetY, offsetZ);
      carRoot.add(bulb);

      const target = new THREE.Object3D();
      target.position.set(x, offsetY - 0.16, offsetZ + 5.9);
      carRoot.add(target);

      const light = new THREE.SpotLight(0xfff0cf, 0, 15, Math.PI * 0.12, 0.45, 1.8);
      light.position.set(x, offsetY, offsetZ);
      light.target = target;
      light.castShadow = false;
      carRoot.add(light);
      lights.push({ light, baseIntensity: 18, bulbMaterial });
    }

    return lights;
  }

  private createMovingCarBody(laneZ: number): RAPIER.RigidBody {
    const sceneRoot = HOUSE_CONFIG.ROOT_POSITION;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        sceneRoot[0],
        sceneRoot[1] + 0.72,
        sceneRoot[2] + laneZ,
      ),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(2.25, 0.72, 1.05),
      body,
    );
    this.rigidBodies.push(body);
    return body;
  }

  private collectTrafficWheels(
    model: THREE.Group,
    config?: TrafficCarModelConfig,
  ): readonly THREE.Object3D[] {
    const candidates: THREE.Object3D[] = [];
    model.traverse((object) => {
      if (this.isWheelCandidate(object, config)) {
        const root = this.resolveWheelRoot(object);
        if (root) candidates.push(root);
      }
    });

    return candidates.filter((candidate) => (
      !candidates.some((other) => other !== candidate && this.isDescendantOf(candidate, other))
    ));
  }

  private isWheelCandidate(
    object: THREE.Object3D,
    config?: TrafficCarModelConfig,
  ): boolean {
    if (config?.wheelNamePatterns?.some((pattern) => pattern.test(object.name))) {
      return true;
    }

    const materialName = object instanceof THREE.Mesh
      ? this.resolveMaterialName(object.material)
      : '';
    const name = `${object.name} ${materialName}`;

    return /^Wheel(?:Front|Rear)[LR]$/.test(name)
      || /(^|[_\s.-])(wheel|tire|tyre)([_\s.-]|$)/i.test(name)
      || /^(FL|FR|BL|BR)(?:_|$)/i.test(name)
      || /^SHC MC Free Promotion Car\.00[4-7]$/.test(name);
  }

  private resolveWheelRoot(object: THREE.Object3D): THREE.Object3D | null {
    if (object instanceof THREE.Mesh) {
      object.geometry.computeBoundingBox();
      const size = object.geometry.boundingBox.getSize(new THREE.Vector3());
      
      // If the bounding box is huge, it means multiple wheels are merged into one mesh.
      // Rotating them would make them orbit the car, so we reject this wheel candidate.
      if (size.x > 1.5 || size.z > 2.0) {
        return null;
      }

      const center = object.geometry.boundingBox.getCenter(new THREE.Vector3());
      if (center.lengthSq() > 0.001) {
        object.geometry.translate(-center.x, -center.y, -center.z);
        object.position.add(center);
      }
    }

    return object;
  }

  private resolveMaterialName(material: THREE.Material | THREE.Material[]): string {
    if (Array.isArray(material)) {
      return material.map((item) => item.name).join(' ');
    }

    return material.name;
  }

  private isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
    let current = object.parent;

    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }

    return false;
  }

  private createImportedLod(model: THREE.Group, distance: number): THREE.LOD {
    const lod = new THREE.LOD();
    lod.addLevel(model, 0);

    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), this.materials.proxy);
    proxy.name = 'VegetationProxy';
    proxy.position.copy(center);
    proxy.scale.set(Math.max(size.x, 0.12), Math.max(size.y, 0.12), Math.max(size.z, 0.12));
    proxy.castShadow = false;
    proxy.receiveShadow = true;
    lod.addLevel(proxy, distance);
    return lod;
  }

  private prepareImportedModel(
    model: THREE.Group,
    castShadow: boolean,
    alphaCutout = false,
  ): void {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      object.castShadow = castShadow;
      object.receiveShadow = true;
      object.frustumCulled = true;

      forEachMaterial(object.material, (material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          this.tuneImportedMaterial(material, `${object.name} ${material.name}`, alphaCutout);
          if (alphaCutout) {
            material.side = THREE.DoubleSide;
            material.alphaTest = Math.max(material.alphaTest, 0.36);
            material.transparent = false;
            material.depthWrite = true;
          }
          material.needsUpdate = true;
        }
      });
    });
  }

  private tuneImportedMaterial(
    material: THREE.MeshStandardMaterial,
    semanticName: string,
    alphaCutout: boolean,
  ): void {
    const name = semanticName.toLowerCase();
    material.envMapIntensity = Math.max(material.envMapIntensity, 0.62);
    material.roughness = Math.max(material.roughness, 0.38);

    if (/glass|window|windscreen|windshield/.test(name)) {
      material.transparent = true;
      material.opacity = Math.min(material.opacity, 0.58);
      material.depthWrite = false;
      material.roughness = Math.min(material.roughness, 0.12);
      material.metalness = Math.max(material.metalness, 0.02);
      material.envMapIntensity = Math.max(material.envMapIntensity, 1.18);
    }

    if (/paint|body|carpaint/.test(name)) {
      material.roughness = THREE.MathUtils.clamp(material.roughness, 0.28, 0.62);
      material.metalness = Math.max(material.metalness, 0.08);
      material.envMapIntensity = Math.max(material.envMapIntensity, 0.95);
    }

    if (/tyre|tire|rubber|black/.test(name)) {
      material.roughness = Math.max(material.roughness, 0.82);
      material.metalness = 0;
      material.envMapIntensity = Math.min(material.envMapIntensity, 0.38);
    }

    if (/light|lite|headlamp|tail|red/.test(name) && !alphaCutout) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.18);
      material.envMapIntensity = Math.max(material.envMapIntensity, 0.82);
    }
  }

  private getModel(path: string): Promise<THREE.Group> {
    const cached = this.modelCache.get(path);
    if (cached) return cached;

    const promise = this.loader.loadModel(path);
    this.modelCache.set(path, promise);
    return promise;
  }

  private normalizeModel(model: THREE.Group, fit: VegetationPlacement['fit']): void {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const candidates = [
      fit.width ? fit.width / size.x : Number.POSITIVE_INFINITY,
      fit.height ? fit.height / size.y : Number.POSITIVE_INFINITY,
      fit.depth ? fit.depth / size.z : Number.POSITIVE_INFINITY,
    ];
    const scale = Math.min(...candidates.filter(Number.isFinite));
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

    model.scale.setScalar(safeScale);
    model.position.set(
      -center.x * safeScale,
      -bounds.min.y * safeScale,
      -center.z * safeScale,
    );
    model.updateMatrixWorld(true);
  }

  private createBox(
    name: string,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    position: Vector3Tuple,
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const uv = geometry.getAttribute('uv');
    geometry.setAttribute('uv2', uv.clone());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    return mesh;
  }

  private createTerrainMaterial(
    name: string,
    colorPath: string,
    normalPath: string,
    armPath: string,
    repeat: readonly [number, number],
    fallbackColor: THREE.ColorRepresentation,
    roughness: number,
  ): THREE.MeshStandardMaterial {
    const colorMap = this.textureLoader.load(colorPath);
    const normalMap = this.textureLoader.load(normalPath);
    const armMap = this.textureLoader.load(armPath);

    for (const texture of [colorMap, normalMap, armMap]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat[0], repeat[1]);
      texture.anisotropy = 4;
    }
    colorMap.colorSpace = THREE.SRGBColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
    armMap.colorSpace = THREE.NoColorSpace;

    return new THREE.MeshStandardMaterial({
      name,
      color: fallbackColor,
      map: colorMap,
      normalMap,
      roughnessMap: armMap,
      aoMap: armMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness,
      metalness: 0,
      envMapIntensity: 0.28,
    });
  }

  private configureTreeMaterials(): void {
    const leafMap = this.textureLoader.load('/textures/vegetation/tree_small_02_leaves_diff_1k.jpg');
    const leafAlphaMap = this.textureLoader.load('/textures/vegetation/tree_small_02_leaves_alpha_1k.jpg');
    const barkMap = this.textureLoader.load('/textures/vegetation/tree_small_02_branch_diff_1k.jpg');

    for (const texture of [leafMap, leafAlphaMap, barkMap]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
    }

    leafMap.colorSpace = THREE.SRGBColorSpace;
    leafAlphaMap.colorSpace = THREE.NoColorSpace;
    barkMap.colorSpace = THREE.SRGBColorSpace;
    barkMap.repeat.set(1.6, 3.8);

    this.materials.treeLeaf.map = leafMap;
    this.materials.treeLeaf.alphaMap = leafAlphaMap;
    this.materials.treeLeaf.side = THREE.DoubleSide;
    this.materials.treeLeaf.alphaTest = 0.42;
    this.materials.treeLeaf.transparent = false;
    this.materials.treeLeaf.vertexColors = true;
    this.materials.treeLeaf.envMapIntensity = 0.18;
    this.materials.treeLeaf.needsUpdate = true;

    this.materials.treeTrunk.map = barkMap;
    this.materials.treeTrunk.color.set(0x7a5a3b);
    this.materials.treeTrunk.roughness = 0.92;
    this.materials.treeTrunk.needsUpdate = true;
  }

  private disposeMaterialTextures(material: THREE.Material): void {
    const textured = material as THREE.MeshStandardMaterial;
    const textures = new Set([
      textured.map,
      textured.normalMap,
      textured.roughnessMap,
      textured.aoMap,
      textured.bumpMap,
      textured.alphaMap,
    ]);

    for (const texture of textures) {
      texture?.dispose();
    }
  }

  private addFixedCuboid(localCenter: Vector3Tuple, halfExtents: Vector3Tuple): void {
    const root = HOUSE_CONFIG.ROOT_POSITION;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        root[0] + localCenter[0],
        root[1] + localCenter[1],
        root[2] + localCenter[2],
      ),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2]),
      body,
    );
    this.rigidBodies.push(body);
  }

  // UNUSED: This function is not called anywhere
  private resolveNightFactor(timeOfDay: number): number {
    if (timeOfDay >= NIGHT_START || timeOfDay <= NIGHT_END) return 1;

    const morningFade = THREE.MathUtils.smoothstep(timeOfDay, NIGHT_END, NIGHT_END + 2.2);
    const eveningFade = THREE.MathUtils.smoothstep(timeOfDay, NIGHT_START - 2.2, NIGHT_START);
    return Math.max(1 - morningFade, eveningFade);
  }
}
