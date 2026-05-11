import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import type { AssetStreamingScheduler } from '../../core/AssetStreamingScheduler.ts';
import type { Player } from '../../player/Player.ts';
import { yieldToBrowser } from '../../shared/async.ts';
import { disposeObjectTree } from '../../shared/three/dispose.ts';
import type { DayNightCycle } from '../../systems/dayNight/index.ts';
import type { Disposable, Updatable } from '../../types/interfaces.ts';
import { FurnishingSystem } from './assets/FurnishingSystem.ts';
import { HouseMaterialFactory } from './materials/HouseMaterialFactory.ts';
import { ZoneMaterialController } from './materials/ZoneMaterialController.ts';
import { CinematicTourSystem } from './systems/CinematicTourSystem.ts';
import { DebugGuiSystem } from './systems/DebugGuiSystem.ts';
import { DoorAnimationSystem } from './systems/DoorAnimationSystem.ts';
import { DustParticleSystem } from './systems/DustParticleSystem.ts';
import { HouseLightingSystem } from './systems/HouseLightingSystem.ts';
import { ImportedHouseSystem } from './systems/ImportedHouseSystem.ts';
import { OutdoorEstateSystem } from './systems/OutdoorEstateSystem.ts';
import { SignageSystem } from './systems/SignageSystem.ts';
import { SurfaceInteractionSystem } from './systems/SurfaceInteractionSystem.ts';
import type {
  HouseDebugApi,
} from './types.ts';
import { HOUSE_CONFIG } from './architecturalHouseConfig.ts';

type ArchitecturalHouseOptions = {
  readonly canvas: HTMLCanvasElement;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly world: RAPIER.World;
  readonly dayNight: DayNightCycle;
  readonly player: Player;
  readonly assetScheduler: AssetStreamingScheduler;
};

/** Composition root for the cinematic interactive architectural house feature. */
export class ArchitecturalHouse implements Updatable, Disposable {
  /** Scene root owned by this feature. */
  readonly root = new THREE.Group();

  private readonly options: ArchitecturalHouseOptions;
  private readonly materials: HouseMaterialFactory;
  private materialController!: ZoneMaterialController;
  private furnishingSystem!: FurnishingSystem;
  private lightingSystem!: HouseLightingSystem;
  private dustSystem!: DustParticleSystem;
  private outdoorEstateSystem!: OutdoorEstateSystem;
  private importedHouseSystem!: ImportedHouseSystem;
  private doorSystem!: DoorAnimationSystem;
  private interactionSystem!: SurfaceInteractionSystem;
  private signageSystem!: SignageSystem;
  private debugGui!: DebugGuiSystem;
  private tourSystem!: CinematicTourSystem;
  private structureRigidBodies: readonly RAPIER.RigidBody[] = [];
  private firstFloorRoot!: THREE.Group;
  private secondFloorRoot!: THREE.Group;
  private importedAssetsStarted = false;
  private loaded = false;
  private disposed = false;

  /**
   * @param options - Engine systems required by the house feature.
   */
  constructor(options: ArchitecturalHouseOptions) {
    this.options = options;
    this.materials = new HouseMaterialFactory(options.renderer);
    this.root.name = 'ArchitecturalHouse';
  }

  /**
   * Adds the feature root to the scene.
   *
   * @param scene - Scene that should render the house.
   */
  addTo(scene: THREE.Scene): void {
    scene.add(this.root);
  }

  /** Loads materials, geometry, imported house model, and all estate systems. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.disposed = false;

    await this.materials.preload();

    // ── Stub structure roots so downstream systems that reference them don't crash ──
    const structureRoot = new THREE.Group();
    structureRoot.name = 'ArchitecturalHouseStructure';
    structureRoot.position.fromArray(HOUSE_CONFIG.ROOT_POSITION);
    this.root.add(structureRoot);
    this.firstFloorRoot = new THREE.Group();
    this.firstFloorRoot.name = 'FirstFloor';
    this.secondFloorRoot = new THREE.Group();
    this.secondFloorRoot.name = 'SecondFloor';
    structureRoot.add(this.firstFloorRoot, this.secondFloorRoot);

    // ── Imported house model ──────────────────────────────────────────────────
    this.importedHouseSystem = new ImportedHouseSystem({
      world: this.options.world,
      sceneRoot: structureRoot,
      scheduler: this.options.assetScheduler,
    });

    // ── Outdoor estate (roads, traffic, trees, fence…) ────────────────────────
    this.outdoorEstateSystem = new OutdoorEstateSystem(
      this.options.world,
      structureRoot,
      this.materials,
      this.options.assetScheduler,
    );

    // ── Furnishing, signage, lighting, dust ───────────────────────────────────
    this.furnishingSystem = new FurnishingSystem(
      this.options.world,
      structureRoot,
      this.options.assetScheduler,
    );
    this.signageSystem = new SignageSystem(this.materials, this.options.assetScheduler);
    this.lightingSystem = new HouseLightingSystem(structureRoot);
    this.dustSystem = new DustParticleSystem(structureRoot);

    // ── Door & wall interaction ───────────────────────────────────────────────
    this.doorSystem = new DoorAnimationSystem([]);
    this.materialController = new ZoneMaterialController(this.materials, []);
    this.interactionSystem = new SurfaceInteractionSystem({
      canvas: this.options.canvas,
      scene: this.options.scene,
      camera: this.options.camera,
      interactableSurfaces: [],
      doors: [],
      onDoorClick: this.doorSystem.toggleFromObject.bind(this.doorSystem),
    });

    // ── Debug GUI ─────────────────────────────────────────────────────────────
    this.debugGui = new DebugGuiSystem({
      renderer: this.options.renderer,
      scene: this.options.scene,
      dayNight: this.options.dayNight,
      materialController: this.materialController,
      houseApi: this.createDebugApi(),
    });

    // ── Cinematic intro tour ──────────────────────────────────────────────────
    this.tourSystem = new CinematicTourSystem(this.options.camera, this.options.player, {
      onFinish: () => {},
    });

    // CRITICAL: Force update matrix world of the entire scene before loading assets.
    // Since GameLoop is not running yet, structureRoot's matrixWorld is identity.
    // If we don't update it, the physics colliders for the house will be baked at the wrong position.
    this.options.scene.updateMatrixWorld(true);
    await this.loadImportedAssets();

    this.loaded = true;
    this.tourSystem.playIntro();
  }

  /**
   * Advances interactive and atmospheric house systems.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void {
    if (!this.loaded) return;

    this.doorSystem.update(delta);
    this.interactionSystem.update(delta);
    this.lightingSystem.update(this.options.dayNight.getTimeOfDay());
    this.outdoorEstateSystem.update(delta, this.options.dayNight.getTimeOfDay());
    this.dustSystem.update(delta);
    this.tourSystem.update(delta);
  }

  /** Releases DOM, GPU, and Rapier resources owned by the feature. */
  dispose(): void {
    this.disposed = true;
    this.importedAssetsStarted = false;
    this.debugGui?.dispose();
    this.interactionSystem?.dispose();
    this.furnishingSystem?.dispose();
    this.signageSystem?.dispose();
    this.outdoorEstateSystem?.dispose();
    this.importedHouseSystem?.dispose();
    this.dustSystem?.dispose();
    this.lightingSystem?.dispose();
    this.materialController?.dispose();

    for (const body of this.structureRigidBodies) {
      this.options.world.removeRigidBody(body);
    }

    this.root.removeFromParent();
    disposeObjectTree(this.root);
    this.root.clear();
    this.materials.dispose();
    this.loaded = false;
  }

  private createDebugApi(): HouseDebugApi {
    return {
      setInteriorLightIntensity: (value: number) => {
        this.lightingSystem.setIntensityMultiplier(value);
      },
      setDustVisible: (value: boolean) => {
        this.dustSystem.setVisible(value);
      },
      setFirstFloorVisible: (value: boolean) => {
        this.firstFloorRoot.visible = value;
      },
      setSecondFloorVisible: (value: boolean) => {
        this.secondFloorRoot.visible = value;
      },
      playIntroTour: () => {
        this.tourSystem.playIntro();
      },
    };
  }

  private async loadImportedAssets(): Promise<void> {
    if (this.importedAssetsStarted) return;

    this.importedAssetsStarted = true;

    try {
      await yieldToBrowser(300);
      const streams = await Promise.allSettled([
        this.importedHouseSystem.load().then(() => {
          const doors = this.importedHouseSystem.doors;
          const surfaces = this.importedHouseSystem.editableSurfaces;
          this.doorSystem.registerDoors(doors);
          this.interactionSystem.registerDoors(doors);
          // We intentionally do NOT register surfaces for hover interaction
          // as material swapping is now handled by the lil-gui menu.
          this.materialController.registerSurfaces(surfaces);
        }),
        this.outdoorEstateSystem.load(),
        // FurnishingSystem and SignageSystem are scoped to the old procedural
        // house layout — disabled until re-targeted to the new model.
        // this.signageSystem.load(root),
        // this.furnishingSystem.load(),
      ]);

      for (const stream of streams) {
        if (stream.status === 'rejected') {
          console.warn('[ArchitecturalHouse] Asset stream failed.', stream.reason);
        }
      }
    } catch (error) {
      if (!this.disposed) {
        console.error('[ArchitecturalHouse] Imported asset streaming failed.', error);
      }
    }
  }

}
