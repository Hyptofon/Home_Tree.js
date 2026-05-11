import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Vector3Tuple } from 'three';

import {
  HOUSE_CONFIG,
  HOUSE_ROOMS,
  HOUSE_TEXTURES,
} from '../architecturalHouseConfig.ts';
import { HouseMaterialFactory } from '../materials/HouseMaterialFactory.ts';
import type {
  DoorInteraction,
  RoomDefinition,
  RoomId,
  SegmentAxis,
  WallSurface,
} from '../types.ts';

type WallGap = {
  readonly min: number;
  readonly max: number;
};

type StructureBuildResult = {
  readonly root: THREE.Group;
  readonly firstFloorRoot: THREE.Group;
  readonly secondFloorRoot: THREE.Group;
  readonly wallSurfaces: readonly WallSurface[];
  readonly doors: readonly DoorInteraction[];
  readonly rigidBodies: readonly RAPIER.RigidBody[];
};

type WallSegmentOptions = {
  readonly floor: 0 | 1;
  readonly axis: SegmentAxis;
  readonly center: Vector3Tuple;
  readonly length: number;
  readonly roomId: RoomId;
  readonly collider?: boolean;
};

type SurfaceMaterialId = keyof typeof HOUSE_TEXTURES.surfaces;

const ROOM_FLOOR_MATERIALS: Record<string, SurfaceMaterialId> = {
  foyer: 'terrazzo',
  hall: 'woodFloor',
  living: 'parquet',
  kitchen: 'kitchenTile',
  powder: 'bathTile',
  master: 'woodFloor',
  bedroomEast: 'woodFloor',
  bedroomWest: 'woodFloor',
  bathWardrobe: 'bathTile',
  balcony: 'exteriorConcrete',
};

/** Builds authored architectural geometry and matching static Rapier proxies. */
export class HouseStructureBuilder {
  private readonly world: RAPIER.World;
  private readonly materials: HouseMaterialFactory;
  private readonly root = new THREE.Group();
  private readonly firstFloorRoot = new THREE.Group();
  private readonly secondFloorRoot = new THREE.Group();
  private readonly rigidBodies: RAPIER.RigidBody[] = [];
  private readonly wallSurfaces: WallSurface[] = [];
  private readonly doors: DoorInteraction[] = [];
  private readonly geometryCache = new Map<string, THREE.BoxGeometry>();

  private readonly structuralMaterial: THREE.MeshStandardMaterial;
  private readonly trimMaterial: THREE.MeshStandardMaterial;
  private readonly darkMetalMaterial: THREE.MeshStandardMaterial;
  private readonly glassMaterial: THREE.MeshPhysicalMaterial;
  private readonly grassMaterial: THREE.MeshStandardMaterial;
  private readonly facadeStuccoMaterial: THREE.MeshStandardMaterial;
  private readonly facadeStoneMaterial: THREE.MeshStandardMaterial;
  private readonly facadeWoodMaterial: THREE.MeshStandardMaterial;
  private readonly roofMaterial: THREE.MeshStandardMaterial;

  /**
   * @param world - Active Rapier world used for static colliders.
   * @param materials - PBR material factory.
   */
  constructor(world: RAPIER.World, materials: HouseMaterialFactory) {
    this.world = world;
    this.materials = materials;
    this.root.name = 'ArchitecturalHouseStructure';
    this.root.position.set(...HOUSE_CONFIG.ROOT_POSITION);
    this.firstFloorRoot.name = 'FirstFloor';
    this.secondFloorRoot.name = 'SecondFloor';
    this.root.add(this.firstFloorRoot, this.secondFloorRoot);

    this.structuralMaterial = materials.createSurfaceMaterial('exteriorConcrete', 'ExteriorConcreteShell');
    this.trimMaterial = materials.createTrimMaterial();
    this.darkMetalMaterial = materials.createSolidMaterial('DarkMetalFrames', 0x161a1c, 0.38, 0.18);
    this.glassMaterial = materials.createGlassMaterial();
    this.grassMaterial = materials.createSolidMaterial('QuietGardenGrass', 0x334333, 0.96);
    this.facadeStuccoMaterial = materials.createSurfaceMaterial('exteriorConcrete', 'ExteriorWarmStucco');
    this.facadeStoneMaterial = materials.createSolidMaterial('ExteriorLimestoneBase', 0xb5aa95, 0.82);
    this.facadeWoodMaterial = materials.createSurfaceMaterial('oak', 'ExteriorWoodSoffit');
    this.roofMaterial = materials.createSolidMaterial('StandingSeamRoof', 0x2a2b2a, 0.5, 0.18);
  }

  /** Builds all static architectural layers in deterministic order. */
  build(): StructureBuildResult {
    this.buildLandscape();
    this.buildFloors();
    this.buildExteriorShell();
    this.buildInteriorPartitions();
    this.buildStaircase();
    this.buildBalcony();
    this.buildRoofAndParapet();
    this.buildWindows();
    this.buildDoors();
    this.buildExteriorFacadeDetails();

    return {
      root: this.root,
      firstFloorRoot: this.firstFloorRoot,
      secondFloorRoot: this.secondFloorRoot,
      wallSurfaces: this.wallSurfaces,
      doors: this.doors,
      rigidBodies: this.rigidBodies,
    };
  }

  private buildLandscape(): void {
    const lawn = this.createBox(
      'LawnPlate',
      58,
      0.08,
      70,
      this.grassMaterial,
      [0, -0.18, -10],
    );
    lawn.receiveShadow = true;
    this.root.add(lawn);
  }

  private buildFloors(): void {
    for (const room of HOUSE_ROOMS) {
      const materialKey = ROOM_FLOOR_MATERIALS[room.id] ?? 'woodFloor';
      const material = this.materials.createSurfaceMaterial(materialKey, `Floor_${room.id}`);
      const { minX, maxX, minZ, maxZ } = room.bounds;
      const width = maxX - minX;
      const depth = maxZ - minZ;
      const floorY = room.floor * HOUSE_CONFIG.FLOOR_HEIGHT;
      const floor = this.createBox(
        `Floor_${room.id}`,
        width,
        HOUSE_CONFIG.SLAB_THICKNESS,
        depth,
        material,
        [(minX + maxX) / 2, floorY - HOUSE_CONFIG.SLAB_THICKNESS / 2 + 0.02, (minZ + maxZ) / 2],
      );
      floor.receiveShadow = true;
      this.floorRoot(room.floor).add(floor);
    }

    this.addFixedCuboid([0, HOUSE_CONFIG.FLOOR_HEIGHT - 0.09, 0], [12.4, 0.09, 11.4]);
    this.addFixedCuboid([0, HOUSE_CONFIG.FLOOR_HEIGHT * 2 - 0.09, 0], [12.5, 0.09, 11.5]);
  }

  private buildExteriorShell(): void {
    const bounds = HOUSE_CONFIG.HOUSE_BOUNDS;
    this.addWallX(0, bounds.MIN_Z, bounds.MIN_X, -3, 'living');
    this.addWallX(0, bounds.MIN_Z, -3, 3, 'foyer', [{ min: -0.82, max: 0.82 }]);
    this.addWallX(0, bounds.MIN_Z, 3, bounds.MAX_X, 'kitchen');
    this.addWallX(0, bounds.MAX_Z, bounds.MIN_X, -3, 'living');
    this.addWallX(0, bounds.MAX_Z, -3, 3, 'hall');
    this.addWallX(0, bounds.MAX_Z, 3, bounds.MAX_X, 'powder');
    this.addWallZ(0, bounds.MIN_X, bounds.MIN_Z, bounds.MAX_Z, 'living');
    this.addWallZ(0, bounds.MAX_X, bounds.MIN_Z, 1, 'kitchen');
    this.addWallZ(0, bounds.MAX_X, 1, bounds.MAX_Z, 'powder');

    this.addWallX(1, bounds.MIN_Z, bounds.MIN_X, -3, 'master');
    this.addWallX(1, bounds.MIN_Z, -3, 3, 'hall');
    this.addWallX(1, bounds.MIN_Z, 3, bounds.MAX_X, 'bedroomEast');
    this.addWallX(1, bounds.MAX_Z, bounds.MIN_X, -3, 'bedroomWest');
    this.addWallX(1, bounds.MAX_Z, -3, 3, 'hall', [{ min: -1.05, max: 1.05 }]);
    this.addWallX(1, bounds.MAX_Z, 3, bounds.MAX_X, 'bathWardrobe');
    this.addWallZ(1, bounds.MIN_X, bounds.MIN_Z, 0, 'master');
    this.addWallZ(1, bounds.MIN_X, 0, bounds.MAX_Z, 'bedroomWest');
    this.addWallZ(1, bounds.MAX_X, bounds.MIN_Z, 0, 'bedroomEast');
    this.addWallZ(1, bounds.MAX_X, 0, bounds.MAX_Z, 'bathWardrobe');
  }

  private buildInteriorPartitions(): void {
    this.addWallZ(0, -3, -11, -6, 'foyer', [{ min: -8.4, max: -7.0 }]);
    this.addWallZ(0, -3, -6, 11, 'living', [{ min: -1.2, max: 0.35 }, { min: 6.8, max: 8.4 }]);
    this.addWallZ(0, 3, -11, 1, 'kitchen', [{ min: -4.6, max: -3.1 }]);
    this.addWallZ(0, 3, 1, 11, 'powder', [{ min: 2.8, max: 4.2 }]);
    this.addWallX(0, -6, -3, 3, 'foyer', [{ min: -0.85, max: 0.85 }]);
    this.addWallX(0, 1, 3, 12, 'kitchen', [{ min: 5.2, max: 6.7 }]);

    this.addWallZ(1, -3, -11, 0, 'master', [{ min: -4.4, max: -2.7 }]);
    this.addWallZ(1, -3, 0, 11, 'bedroomWest', [{ min: 2.2, max: 3.8 }]);
    this.addWallZ(1, 3, -11, 0, 'bedroomEast', [{ min: -4.0, max: -2.4 }]);
    this.addWallZ(1, 3, 0, 11, 'bathWardrobe', [{ min: 2.0, max: 3.6 }]);
    this.addWallX(1, 0, -12, -3, 'master', [{ min: -8.4, max: -6.8 }]);
    this.addWallX(1, 0, 3, 12, 'bedroomEast', [{ min: 6.9, max: 8.5 }]);
  }

  private buildStaircase(): void {
    const stairMaterial = this.materials.createSurfaceMaterial('oak', 'StairOak');
    const stepCount = 13;
    const width = 2.6;
    const depth = 0.48;
    const height = HOUSE_CONFIG.FLOOR_HEIGHT / stepCount;

    for (let index = 0; index < stepCount; index += 1) {
      const step = this.createBox(
        `StairStep_${index}`,
        width,
        height,
        depth,
        stairMaterial,
        [0, index * height + height / 2, 1.1 + index * depth],
      );
      step.castShadow = true;
      step.receiveShadow = true;
      this.firstFloorRoot.add(step);
    }

    const length = stepCount * depth;
    const angle = Math.atan2(HOUSE_CONFIG.FLOOR_HEIGHT, length);
    const halfExtents: Vector3Tuple = [width / 2, 0.16, length / 2];
    const center: Vector3Tuple = [0, HOUSE_CONFIG.FLOOR_HEIGHT / 2, 1.1 + length / 2];
    this.addFixedCuboid(center, halfExtents, -angle);

    const railMaterial = this.darkMetalMaterial;
    this.addDecorativeRail([-1.55, 1.85, 4.2], length + 0.4, -angle, railMaterial);
    this.addDecorativeRail([1.55, 1.85, 4.2], length + 0.4, -angle, railMaterial);
  }

  private buildBalcony(): void {
    const balcony = HOUSE_CONFIG.BALCONY;
    const width = balcony.MAX_X - balcony.MIN_X;
    const depth = balcony.MAX_Z - balcony.MIN_Z;
    const material = this.materials.createSurfaceMaterial('terrazzo', 'BalconyTerrazzo');
    const slab = this.createBox(
      'BalconySlab',
      width,
      HOUSE_CONFIG.SLAB_THICKNESS,
      depth,
      material,
      [0, HOUSE_CONFIG.FLOOR_HEIGHT - HOUSE_CONFIG.SLAB_THICKNESS / 2, (balcony.MIN_Z + balcony.MAX_Z) / 2],
    );
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.secondFloorRoot.add(slab);
    this.addFixedCuboid([0, HOUSE_CONFIG.FLOOR_HEIGHT - 0.09, (balcony.MIN_Z + balcony.MAX_Z) / 2], [width / 2, 0.09, depth / 2]);
  }

  private buildRoofAndParapet(): void {
    const roofY = HOUSE_CONFIG.FLOOR_HEIGHT * 2 + 0.12;
    const roofMaterial = this.materials.createSurfaceMaterial('exteriorConcrete', 'WarmConcreteRoof');
    const roof = this.createBox('FlatRoof', 24.8, 0.24, 22.8, roofMaterial, [0, roofY, 0]);
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.root.add(roof);

    const parapetMaterial = this.structuralMaterial;
    this.root.add(
      this.createBox('ParapetFront', 25.2, 0.72, 0.24, parapetMaterial, [0, roofY + 0.38, -11.35]),
      this.createBox('ParapetBack', 25.2, 0.72, 0.24, parapetMaterial, [0, roofY + 0.38, 11.35]),
      this.createBox('ParapetLeft', 0.24, 0.72, 22.8, parapetMaterial, [-12.35, roofY + 0.38, 0]),
      this.createBox('ParapetRight', 0.24, 0.72, 22.8, parapetMaterial, [12.35, roofY + 0.38, 0]),
    );
  }

  private buildWindows(): void {
    this.addWindow('x', [-8.4, 1.42, -11.08], 2.3, 1.45);
    this.addWindow('x', [7.0, 1.42, -11.08], 2.4, 1.45);
    this.addWindow('z', [-12.08, 1.42, -2.4], 2.4, 1.45);
    this.addWindow('z', [12.08, 1.42, -4.0], 2.0, 1.35);
    this.addWindow('x', [-8.2, HOUSE_CONFIG.FLOOR_HEIGHT + 1.42, -11.08], 2.0, 1.35);
    this.addWindow('x', [7.8, HOUSE_CONFIG.FLOOR_HEIGHT + 1.42, -11.08], 2.0, 1.35);
    this.addWindow('z', [-12.08, HOUSE_CONFIG.FLOOR_HEIGHT + 1.42, 5.5], 2.0, 1.35);
    this.addWindow('z', [12.08, HOUSE_CONFIG.FLOOR_HEIGHT + 1.42, 5.0], 2.0, 1.35);
    this.addWindow('x', [0, HOUSE_CONFIG.FLOOR_HEIGHT + 1.45, 11.08], 1.9, 1.6);
  }

  private buildDoors(): void {
    this.addDoor('MainDoor', 'x', [0, 0, -11.06], 1.55, 2.35, 0, -Math.PI * 0.62);
    this.addDoor('KitchenDoor', 'z', [3.06, 0, -3.85], 1.42, 2.22, Math.PI * 0.5, Math.PI * 1.08);
    this.addDoor('PowderDoor', 'z', [3.06, 0, 3.5], 1.32, 2.22, Math.PI * 0.5, Math.PI * 1.04);
    this.addDoor('MasterDoor', 'z', [-3.06, HOUSE_CONFIG.FLOOR_HEIGHT, -3.55], 1.42, 2.22, -Math.PI * 0.5, -Math.PI * 1.04);
    this.addDoor('BalconyDoor', 'x', [0, HOUSE_CONFIG.FLOOR_HEIGHT, 11.06], 1.75, 2.32, Math.PI, Math.PI * 1.58);
  }

  private buildExteriorFacadeDetails(): void {
    this.buildFacadeCladding();
    this.buildPitchedRoofSkin();
    this.buildEntryPorch();
    this.buildExteriorWindowDressings();
    this.buildRoofSeamsAndDrainage();
    this.buildFacadeReliefLines();
  }

  private buildFacadeCladding(): void {
    const frontZ = HOUSE_CONFIG.HOUSE_BOUNDS.MIN_Z - 0.13;
    const backZ = HOUSE_CONFIG.HOUSE_BOUNDS.MAX_Z + 0.13;
    const leftX = HOUSE_CONFIG.HOUSE_BOUNDS.MIN_X - 0.13;
    const rightX = HOUSE_CONFIG.HOUSE_BOUNDS.MAX_X + 0.13;
    const upperY = HOUSE_CONFIG.FLOOR_HEIGHT + HOUSE_CONFIG.WALL_HEIGHT / 2;

    const frontPanels = [
      this.createBox('FacadeFrontLowerLeft', 9.1, 2.55, 0.08, this.facadeStoneMaterial, [-7.45, 1.35, frontZ]),
      this.createBox('FacadeFrontLowerRight', 9.1, 2.55, 0.08, this.facadeStoneMaterial, [7.45, 1.35, frontZ]),
      this.createBox('FacadeFrontUpperLeft', 9.1, 2.45, 0.08, this.facadeStuccoMaterial, [-7.45, upperY, frontZ]),
      this.createBox('FacadeFrontUpperRight', 9.1, 2.45, 0.08, this.facadeStuccoMaterial, [7.45, upperY, frontZ]),
      this.createBox('FacadeFrontUpperCenter', 3.2, 2.45, 0.08, this.facadeWoodMaterial, [0, upperY, frontZ - 0.015]),
    ];

    const sidePanels = [
      this.createBox('FacadeLeftLower', 0.08, 2.55, 21.8, this.facadeStuccoMaterial, [leftX, 1.35, 0]),
      this.createBox('FacadeRightLower', 0.08, 2.55, 21.8, this.facadeStuccoMaterial, [rightX, 1.35, 0]),
      this.createBox('FacadeLeftUpper', 0.08, 2.45, 21.8, this.facadeStuccoMaterial, [leftX, upperY, 0]),
      this.createBox('FacadeRightUpper', 0.08, 2.45, 21.8, this.facadeStuccoMaterial, [rightX, upperY, 0]),
      this.createBox('FacadeBackLower', 23.8, 2.55, 0.08, this.facadeStuccoMaterial, [0, 1.35, backZ]),
      this.createBox('FacadeBackUpper', 23.8, 2.45, 0.08, this.facadeStuccoMaterial, [0, upperY, backZ]),
    ];

    for (const panel of [...frontPanels, ...sidePanels]) {
      panel.castShadow = true;
      panel.receiveShadow = true;
      this.root.add(panel);
    }

    const horizontalTrim = [
      this.createBox('FacadeBeltCourseFront', 24.4, 0.16, 0.16, this.facadeWoodMaterial, [0, HOUSE_CONFIG.FLOOR_HEIGHT - 0.18, frontZ - 0.04]),
      this.createBox('FacadeBeltCourseBack', 24.4, 0.16, 0.16, this.facadeWoodMaterial, [0, HOUSE_CONFIG.FLOOR_HEIGHT - 0.18, backZ + 0.04]),
      this.createBox('FacadeBeltCourseLeft', 0.16, 0.16, 22.3, this.facadeWoodMaterial, [leftX - 0.04, HOUSE_CONFIG.FLOOR_HEIGHT - 0.18, 0]),
      this.createBox('FacadeBeltCourseRight', 0.16, 0.16, 22.3, this.facadeWoodMaterial, [rightX + 0.04, HOUSE_CONFIG.FLOOR_HEIGHT - 0.18, 0]),
    ];

    for (const trim of horizontalTrim) {
      trim.castShadow = true;
      trim.receiveShadow = true;
      this.root.add(trim);
    }
  }

  private buildPitchedRoofSkin(): void {
    const roofY = HOUSE_CONFIG.FLOOR_HEIGHT * 2 + 0.62;
    const front = this.createBox('PitchedRoofFrontPlane', 26.2, 0.18, 12.8, this.roofMaterial, [0, roofY, -3.25]);
    const back = this.createBox('PitchedRoofBackPlane', 26.2, 0.18, 12.8, this.roofMaterial, [0, roofY, 3.25]);
    front.rotation.x = -0.23;
    back.rotation.x = 0.23;
    front.castShadow = true;
    back.castShadow = true;
    front.receiveShadow = true;
    back.receiveShadow = true;

    const ridge = this.createBox('RoofRidgeCap', 26.4, 0.18, 0.22, this.darkMetalMaterial, [0, roofY + 1.48, 0]);
    const fasciaFront = this.createBox('RoofFasciaFront', 26.6, 0.38, 0.22, this.facadeWoodMaterial, [0, roofY - 1.42, -9.95]);
    const fasciaBack = this.createBox('RoofFasciaBack', 26.6, 0.38, 0.22, this.facadeWoodMaterial, [0, roofY - 1.42, 9.95]);
    ridge.castShadow = true;
    fasciaFront.castShadow = true;
    fasciaBack.castShadow = true;
    this.root.add(front, back, ridge, fasciaFront, fasciaBack);
  }

  private buildEntryPorch(): void {
    const porchFloor = this.createBox('EntryPorchStoneLanding', 4.4, 0.24, 2.35, this.facadeStoneMaterial, [0, 0.12, -12.35]);
    const stepA = this.createBox('EntryStepLower', 4.8, 0.14, 0.75, this.facadeStoneMaterial, [0, 0.07, -13.82]);
    const canopy = this.createBox('EntryPorchCanopy', 4.9, 0.22, 2.15, this.roofMaterial, [0, 2.72, -12.35]);
    const soffit = this.createBox('EntryPorchSoffit', 4.75, 0.08, 2.0, this.facadeWoodMaterial, [0, 2.54, -12.35]);

    for (const mesh of [porchFloor, stepA, canopy, soffit]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    for (const x of [-1.95, 1.95]) {
      const column = this.createBox('EntryPorchColumn', 0.22, 2.42, 0.22, this.facadeWoodMaterial, [x, 1.32, -13.1]);
      column.castShadow = true;
      column.receiveShadow = true;
      this.root.add(column);
    }

    this.addFixedCuboid([0, 0.14, -12.55], [2.4, 0.14, 1.25]);
  }

  private buildExteriorWindowDressings(): void {
    this.addFacadeWindow('FrontLivingWindow', 'x', [-7.4, 1.42, -11.36], 2.35, 1.28);
    this.addFacadeWindow('FrontKitchenWindow', 'x', [7.4, 1.42, -11.36], 2.35, 1.28);
    this.addFacadeWindow('FrontMasterWindow', 'x', [-7.4, HOUSE_CONFIG.FLOOR_HEIGHT + 1.42, -11.36], 2.2, 1.25);
    this.addFacadeWindow('FrontBedroomWindow', 'x', [7.4, HOUSE_CONFIG.FLOOR_HEIGHT + 1.42, -11.36], 2.2, 1.25);
    this.addFacadeWindow('LeftLivingWindow', 'z', [-12.36, 1.42, -2.3], 2.35, 1.25);
    this.addFacadeWindow('RightKitchenWindow', 'z', [12.36, 1.42, -4.0], 2.05, 1.2);
  }

  private buildRoofSeamsAndDrainage(): void {
    const roofY = HOUSE_CONFIG.FLOOR_HEIGHT * 2 + 0.62;
    const seamGeometry = new THREE.BoxGeometry(0.045, 0.035, 12.0);
    const seamCountPerSide = 13;
    const seams = new THREE.InstancedMesh(seamGeometry, this.darkMetalMaterial, seamCountPerSide * 2);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    let index = 0;

    for (let side = 0; side < 2; side += 1) {
      const isFront = side === 0;
      quaternion.setFromEuler(new THREE.Euler(isFront ? -0.23 : 0.23, 0, 0));

      for (let seam = 0; seam < seamCountPerSide; seam += 1) {
        position.set(-11.4 + seam * 1.9, roofY + 0.13, isFront ? -3.25 : 3.25);
        matrix.compose(position, quaternion, scale);
        seams.setMatrixAt(index, matrix);
        index += 1;
      }
    }

    seams.name = 'StandingSeamRoofRibs';
    seams.castShadow = true;
    seams.receiveShadow = true;
    this.root.add(seams);

    const gutterY = roofY - 1.16;
    const drainageParts = [
      this.createBox('FrontRoofGutter', 26.8, 0.11, 0.16, this.darkMetalMaterial, [0, gutterY, -10.12]),
      this.createBox('BackRoofGutter', 26.8, 0.11, 0.16, this.darkMetalMaterial, [0, gutterY, 10.12]),
      this.createBox('LeftFrontDownspout', 0.11, 3.9, 0.11, this.darkMetalMaterial, [-12.15, 2.42, -11.28]),
      this.createBox('RightFrontDownspout', 0.11, 3.9, 0.11, this.darkMetalMaterial, [12.15, 2.42, -11.28]),
      this.createBox('LeftBackDownspout', 0.11, 3.9, 0.11, this.darkMetalMaterial, [-12.15, 2.42, 11.28]),
      this.createBox('RightBackDownspout', 0.11, 3.9, 0.11, this.darkMetalMaterial, [12.15, 2.42, 11.28]),
    ];

    for (const part of drainageParts) {
      part.castShadow = true;
      part.receiveShadow = true;
      this.root.add(part);
    }
  }

  private buildFacadeReliefLines(): void {
    const geometry = new THREE.BoxGeometry(1, 0.018, 0.035);
    const lines = new THREE.InstancedMesh(geometry, this.trimMaterial, 46);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    let index = 0;

    const addFrontBand = (centerX: number, width: number, y: number, z: number): void => {
      position.set(centerX, y, z);
      scale.set(width, 1, 1);
      matrix.compose(position, quaternion, scale);
      lines.setMatrixAt(index, matrix);
      index += 1;
    };

    for (let row = 0; row < 13; row += 1) {
      const y = HOUSE_CONFIG.FLOOR_HEIGHT + 0.98 + row * 0.17;
      addFrontBand(-7.45, 8.7, y, HOUSE_CONFIG.HOUSE_BOUNDS.MIN_Z - 0.185);
      addFrontBand(7.45, 8.7, y, HOUSE_CONFIG.HOUSE_BOUNDS.MIN_Z - 0.185);
    }

    for (let row = 0; row < 10; row += 1) {
      const y = 0.68 + row * 0.21;
      addFrontBand(-7.45, 8.5, y, HOUSE_CONFIG.HOUSE_BOUNDS.MIN_Z - 0.19);
      addFrontBand(7.45, 8.5, y, HOUSE_CONFIG.HOUSE_BOUNDS.MIN_Z - 0.19);
    }

    lines.count = index;
    lines.name = 'FacadeReliefShadowLines';
    lines.castShadow = false;
    lines.receiveShadow = true;
    this.root.add(lines);
  }

  private addFacadeWindow(
    name: string,
    axis: SegmentAxis,
    center: Vector3Tuple,
    width: number,
    height: number,
  ): void {
    const pane = this.createBox(
      `${name}ExteriorPane`,
      axis === 'x' ? width : 0.06,
      height,
      axis === 'x' ? 0.06 : width,
      this.glassMaterial,
      center,
    );
    pane.castShadow = false;
    pane.receiveShadow = false;
    this.root.add(pane);

    const frameDepth = 0.12;
    const frameThickness = 0.11;
    const sill = this.createBox(
      `${name}StoneSill`,
      axis === 'x' ? width + 0.34 : 0.26,
      0.13,
      axis === 'x' ? 0.32 : width + 0.34,
      this.facadeStoneMaterial,
      axis === 'x'
        ? [center[0], center[1] - height / 2 - 0.13, center[2] - 0.04]
        : [center[0] + Math.sign(center[0]) * 0.04, center[1] - height / 2 - 0.13, center[2]],
    );
    const top = this.createBox(
      `${name}TopFrame`,
      axis === 'x' ? width + 0.22 : frameDepth,
      frameThickness,
      axis === 'x' ? frameDepth : width + 0.22,
      this.darkMetalMaterial,
      [center[0], center[1] + height / 2 + frameThickness / 2, center[2]],
    );
    const bottom = this.createBox(
      `${name}BottomFrame`,
      axis === 'x' ? width + 0.22 : frameDepth,
      frameThickness,
      axis === 'x' ? frameDepth : width + 0.22,
      this.darkMetalMaterial,
      [center[0], center[1] - height / 2 - frameThickness / 2, center[2]],
    );
    const sideOffset = width / 2 + frameThickness / 2;
    const left = this.createBox(
      `${name}LeftFrame`,
      axis === 'x' ? frameThickness : frameDepth,
      height + frameThickness * 2,
      axis === 'x' ? frameDepth : frameThickness,
      this.darkMetalMaterial,
      axis === 'x' ? [center[0] - sideOffset, center[1], center[2]] : [center[0], center[1], center[2] - sideOffset],
    );
    const right = this.createBox(
      `${name}RightFrame`,
      axis === 'x' ? frameThickness : frameDepth,
      height + frameThickness * 2,
      axis === 'x' ? frameDepth : frameThickness,
      this.darkMetalMaterial,
      axis === 'x' ? [center[0] + sideOffset, center[1], center[2]] : [center[0], center[1], center[2] + sideOffset],
    );

    for (const part of [sill, top, bottom, left, right]) {
      part.castShadow = true;
      part.receiveShadow = true;
      this.root.add(part);
    }
  }

  private addWallX(
    floor: 0 | 1,
    z: number,
    x1: number,
    x2: number,
    roomId: RoomId,
    gaps: readonly WallGap[] = [],
  ): void {
    this.addSplitWall({
      floor,
      axis: 'x',
      fixedCoordinate: z,
      start: x1,
      end: x2,
      roomId,
      gaps,
    });
  }

  private addWallZ(
    floor: 0 | 1,
    x: number,
    z1: number,
    z2: number,
    roomId: RoomId,
    gaps: readonly WallGap[] = [],
  ): void {
    this.addSplitWall({
      floor,
      axis: 'z',
      fixedCoordinate: x,
      start: z1,
      end: z2,
      roomId,
      gaps,
    });
  }

  private addSplitWall(options: {
    readonly floor: 0 | 1;
    readonly axis: SegmentAxis;
    readonly fixedCoordinate: number;
    readonly start: number;
    readonly end: number;
    readonly roomId: RoomId;
    readonly gaps: readonly WallGap[];
  }): void {
    const sortedGaps = [...options.gaps].sort((a, b) => a.min - b.min);
    let cursor = options.start;

    for (const gap of sortedGaps) {
      if (gap.min > cursor) {
        this.addWallRange(options, cursor, gap.min);
      }
      cursor = Math.max(cursor, gap.max);
    }

    if (cursor < options.end) {
      this.addWallRange(options, cursor, options.end);
    }
  }

  private addWallRange(
    options: {
      readonly floor: 0 | 1;
      readonly axis: SegmentAxis;
      readonly fixedCoordinate: number;
      readonly roomId: RoomId;
    },
    start: number,
    end: number,
  ): void {
    const length = Math.abs(end - start);
    if (length < 0.08) return;

    const centerVariable = (start + end) / 2;
    const floorY = options.floor * HOUSE_CONFIG.FLOOR_HEIGHT;
    const center: Vector3Tuple = options.axis === 'x'
      ? [centerVariable, floorY + HOUSE_CONFIG.WALL_HEIGHT / 2, options.fixedCoordinate]
      : [options.fixedCoordinate, floorY + HOUSE_CONFIG.WALL_HEIGHT / 2, centerVariable];

    this.addWallSegment({
      floor: options.floor,
      axis: options.axis,
      center,
      length,
      roomId: options.roomId,
      collider: true,
    });
  }

  private addWallSegment(options: WallSegmentOptions): void {
    const width = options.axis === 'x' ? options.length : HOUSE_CONFIG.WALL_THICKNESS;
    const depth = options.axis === 'x' ? HOUSE_CONFIG.WALL_THICKNESS : options.length;
    const room = this.getRoom(options.roomId);
    const material = this.materials.createWallpaperMaterial(
      room.defaultWallpaper,
      `Wall_${options.roomId}`,
    );
    const wall = this.createBox(
      `Wall_${options.roomId}`,
      width,
      HOUSE_CONFIG.WALL_HEIGHT,
      depth,
      material,
      options.center,
    );
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData['kind'] = 'wall';
    wall.userData['roomId'] = options.roomId;
    this.wallSurfaces.push({ mesh: wall, roomId: options.roomId });
    this.floorRoot(options.floor).add(wall);

    this.addBaseboard(options.floor, options.axis, options.center, options.length);

    if (options.collider) {
      this.addFixedCuboid(options.center, [width / 2, HOUSE_CONFIG.WALL_HEIGHT / 2, depth / 2]);
    }
  }

  private addBaseboard(
    floor: 0 | 1,
    axis: SegmentAxis,
    wallCenter: Vector3Tuple,
    length: number,
  ): void {
    const width = axis === 'x' ? length : HOUSE_CONFIG.BASEBOARD_DEPTH;
    const depth = axis === 'x' ? HOUSE_CONFIG.BASEBOARD_DEPTH : length;
    const y = floor * HOUSE_CONFIG.FLOOR_HEIGHT + HOUSE_CONFIG.BASEBOARD_HEIGHT / 2;
    const trim = this.createBox(
      'Baseboard',
      width,
      HOUSE_CONFIG.BASEBOARD_HEIGHT,
      depth,
      this.trimMaterial,
      [wallCenter[0], y, wallCenter[2]],
    );
    trim.castShadow = true;
    trim.receiveShadow = true;
    this.floorRoot(floor).add(trim);
  }

  private addWindow(
    axis: SegmentAxis,
    center: Vector3Tuple,
    width: number,
    height: number,
  ): void {
    const frameDepth = 0.09;
    const pane = this.createBox(
      'WindowPane',
      axis === 'x' ? width : frameDepth,
      height,
      axis === 'x' ? frameDepth : width,
      this.glassMaterial,
      center,
    );
    pane.castShadow = false;
    pane.receiveShadow = false;
    this.root.add(pane);

    const frameThickness = 0.08;
    const horizontalWidth = axis === 'x' ? width + frameThickness * 2 : frameThickness;
    const horizontalDepth = axis === 'x' ? frameThickness : width + frameThickness * 2;
    const verticalWidth = axis === 'x' ? frameThickness : frameThickness;
    const verticalDepth = axis === 'x' ? frameThickness : frameThickness;
    const topBottomOffset = height / 2 + frameThickness / 2;
    const sideOffset = width / 2 + frameThickness / 2;
    const frameParts = [
      this.createBox('WindowFrameTop', horizontalWidth, frameThickness, horizontalDepth, this.darkMetalMaterial, [center[0], center[1] + topBottomOffset, center[2]]),
      this.createBox('WindowFrameBottom', horizontalWidth, frameThickness, horizontalDepth, this.darkMetalMaterial, [center[0], center[1] - topBottomOffset, center[2]]),
      this.createBox('WindowFrameLeft', verticalWidth, height + frameThickness * 2, verticalDepth, this.darkMetalMaterial, axis === 'x' ? [center[0] - sideOffset, center[1], center[2]] : [center[0], center[1], center[2] - sideOffset]),
      this.createBox('WindowFrameRight', verticalWidth, height + frameThickness * 2, verticalDepth, this.darkMetalMaterial, axis === 'x' ? [center[0] + sideOffset, center[1], center[2]] : [center[0], center[1], center[2] + sideOffset]),
    ];

    for (const frame of frameParts) {
      frame.castShadow = true;
      frame.receiveShadow = true;
      this.root.add(frame);
    }
  }

  private addDoor(
    label: string,
    axis: SegmentAxis,
    position: Vector3Tuple,
    width: number,
    height: number,
    closedAngle: number,
    openAngle: number,
  ): void {
    const floorRoot = position[1] >= HOUSE_CONFIG.FLOOR_HEIGHT ? this.secondFloorRoot : this.firstFloorRoot;
    const pivot = new THREE.Group();
    pivot.name = `${label}Pivot`;
    pivot.position.set(position[0] - width / 2, position[1], position[2]);
    pivot.rotation.y = closedAngle;

    const doorMaterial = this.materials.createSurfaceMaterial('oak', `${label}OakDoor`);
    const mesh = this.createBox(
      label,
      width,
      height,
      0.085,
      doorMaterial,
      [width / 2, height / 2, 0],
    );
    mesh.userData['kind'] = 'door';
    mesh.userData['label'] = label;

    if (axis === 'z') {
      mesh.rotation.y = Math.PI * 0.5;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    floorRoot.add(pivot);
    this.doors.push({
      pivot,
      mesh,
      label,
      closedAngle,
      openAngle,
      currentAngle: closedAngle,
      targetAngle: closedAngle,
    });
  }

  private addDecorativeRail(
    center: Vector3Tuple,
    length: number,
    angle: number,
    material: THREE.Material,
  ): void {
    const rail = this.createBox('StairRail', 0.07, 0.07, length, material, center);
    rail.rotation.x = angle;
    rail.castShadow = true;
    this.firstFloorRoot.add(rail);
  }

  private createBox(
    name: string,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    position: Vector3Tuple,
  ): THREE.Mesh {
    const geometry = this.getBoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.frustumCulled = true;
    return mesh;
  }

  private getBoxGeometry(width: number, height: number, depth: number): THREE.BoxGeometry {
    const key = `${width.toFixed(3)}:${height.toFixed(3)}:${depth.toFixed(3)}`;
    const cached = this.geometryCache.get(key);
    if (cached) return cached;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const uv = geometry.getAttribute('uv');
    geometry.setAttribute('uv2', uv.clone());
    this.geometryCache.set(key, geometry);
    return geometry;
  }

  private addFixedCuboid(
    localCenter: Vector3Tuple,
    halfExtents: Vector3Tuple,
    rotationX = 0,
  ): void {
    const root = HOUSE_CONFIG.ROOT_POSITION;
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      root[0] + localCenter[0],
      root[1] + localCenter[1],
      root[2] + localCenter[2],
    );

    if (rotationX !== 0) {
      const halfAngle = rotationX / 2;
      desc.setRotation({
        x: Math.sin(halfAngle),
        y: 0,
        z: 0,
        w: Math.cos(halfAngle),
      });
    }

    const body = this.world.createRigidBody(desc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2]),
      body,
    );
    this.rigidBodies.push(body);
  }

  private floorRoot(floor: 0 | 1): THREE.Group {
    return floor === 0 ? this.firstFloorRoot : this.secondFloorRoot;
  }

  private getRoom(roomId: RoomId): RoomDefinition {
    const room = HOUSE_ROOMS.find((item) => item.id === roomId);
    if (!room) throw new Error(`Unknown house room: ${roomId}`);
    return room;
  }
}
