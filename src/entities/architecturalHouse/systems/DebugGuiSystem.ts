import * as THREE from 'three';
import GUI from 'lil-gui';

import type { DayNightCycle } from '../../../systems/dayNight/index.ts';
import { HOUSE_EDITABLE_ZONES } from '../architecturalHouseConfig.ts';
import { ZoneMaterialController } from '../materials/ZoneMaterialController.ts';
import type { HouseDebugApi } from '../types.ts';

type DebugGuiOptions = {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly dayNight: DayNightCycle;
  readonly materialController: ZoneMaterialController;
  readonly houseApi: HouseDebugApi;
};

/** lil-gui based debug UI for rendering, time, materials, and house systems. */
export class DebugGuiSystem {
  private readonly gui: GUI;
  private readonly params: {
    exposure: number;
    environmentIntensity: number;
    fogDensity: number;
    timeOfDay: number;
    interiorLights: number;
    dust: boolean;
    firstFloor: boolean;
    secondFloor: boolean;
  };
  private readonly zoneParams: Record<string, string> = {};

  /**
   * @param options - Runtime systems controlled by the debug panel.
   */
  constructor(options: DebugGuiOptions) {
    this.gui = new GUI({ title: 'Architecture Debug' });
    this.gui.domElement.classList.add('architecture-debug-gui');
    this.params = {
      exposure: options.renderer.toneMappingExposure,
      environmentIntensity: options.scene.environmentIntensity,
      fogDensity: options.scene.fog instanceof THREE.FogExp2 ? options.scene.fog.density : 0.0008,
      timeOfDay: options.dayNight.getTimeOfDay(),
      interiorLights: 1,
      dust: true,
      firstFloor: true,
      secondFloor: true,
    };

    this.buildRenderingFolder(options);
    this.buildTimeFolder(options.dayNight);
    this.buildHouseFolder(options.houseApi);
    this.buildMaterialFolder(options.materialController);
  }

  /** Keeps time slider synchronized with the simulation clock. */
  update(): void {
    this.params.timeOfDay = this.params.timeOfDay;
  }

  /** Removes the GUI DOM and listeners. */
  dispose(): void {
    this.gui.destroy();
  }

  private buildRenderingFolder(options: DebugGuiOptions): void {
    const folder = this.gui.addFolder('Rendering');
    folder
      .add(this.params, 'exposure', 0.15, 1.45, 0.01)
      .name('Tone exposure')
      .onChange((value: number) => {
        options.renderer.toneMappingExposure = value;
      });
    folder
      .add(this.params, 'environmentIntensity', 0, 2.2, 0.01)
      .name('HDRI intensity')
      .onChange((value: number) => {
        options.scene.environmentIntensity = value;
      });
    folder
      .add(this.params, 'fogDensity', 0, 0.004, 0.00005)
      .name('Fog density')
      .onChange((value: number) => {
        if (options.scene.fog instanceof THREE.FogExp2) {
          options.scene.fog.density = value;
        }
      });
  }

  private buildTimeFolder(dayNight: DayNightCycle): void {
    const folder = this.gui.addFolder('Time');
    folder
      .add(this.params, 'timeOfDay', 0, 23.99, 0.01)
      .name('Hour')
      .onChange((value: number) => {
        dayNight.setTimeOfDay(value);
      });
    folder.add({ Day: () => dayNight.setTimeOfDay(12.5) }, 'Day');
    folder.add({ GoldenHour: () => dayNight.setTimeOfDay(18.2) }, 'GoldenHour').name('Golden hour');
    folder.add({ Night: () => dayNight.setTimeOfDay(22.4) }, 'Night');
  }

  private buildHouseFolder(houseApi: HouseDebugApi): void {
    const folder = this.gui.addFolder('House');
    folder
      .add(this.params, 'interiorLights', 0, 2.4, 0.01)
      .name('Interior lights')
      .onChange((value: number) => {
        houseApi.setInteriorLightIntensity(value);
      });

    folder
      .add(this.params, 'firstFloor')
      .name('First floor')
      .onChange((value: boolean) => {
        houseApi.setFirstFloorVisible(value);
      });
    folder
      .add(this.params, 'secondFloor')
      .name('Second floor')
      .onChange((value: boolean) => {
        houseApi.setSecondFloorVisible(value);
      });
    folder.add({ PlayIntro: () => houseApi.playIntroTour() }, 'PlayIntro').name('Play intro');
  }

  private buildMaterialFolder(materialController: ZoneMaterialController): void {
    const folder = this.gui.addFolder('Materials');
    
    for (const zone of HOUSE_EDITABLE_ZONES) {
      const options = materialController.getMaterialOptions(zone.id);
      
      // Create an object map { "Label": "id" } for lil-gui dropdown
      const dropdownMap: Record<string, string> = {};
      for (const opt of options) {
        dropdownMap[opt.label] = opt.id;
      }
      
      // Initialize parameter with the active material
      this.zoneParams[zone.id] = materialController.getActiveMaterial(zone.id);
      
      folder
        .add(this.zoneParams, zone.id, dropdownMap)
        .name(zone.label)
        .onChange((value: string) => {
          materialController.applyMaterial(zone.id, value);
        });
    }
  }

}
