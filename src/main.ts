import './style.css';
import * as THREE from 'three';

import { APP_CONFIG } from './config/appConfig.ts';
import { AssetStreamingScheduler } from './core/AssetStreamingScheduler.ts';
import { GameLoop } from './core/GameLoop.ts';
import { InputManager } from './core/InputManager.ts';
import { PhysicsManager } from './core/PhysicsManager.ts';
import { SceneManager } from './core/SceneManager.ts';

import { Environment } from './entities/environment/index.ts';
import { ArchitecturalHouse } from './entities/architecturalHouse/index.ts';
import { Player } from './player/Player.ts';
import { yieldToBrowser } from './shared/async.ts';
import { requireElementById } from './shared/dom.ts';
import {
  DayNightCycle,
  PostProcessingController,
} from './systems/dayNight/index.ts';
import {
  AdaptiveQualitySystem,
  EnvironmentMapSystem,
} from './systems/rendering/index.ts';
import { ProjectMenuPanel } from './ui/projectMenu/ProjectMenuPanel.ts';
import { TimeControlPanel } from './ui/timeControls/TimeControlPanel.ts';

/**
 * Application composition root.
 *
 * This file wires independently owned systems in startup order:
 * core engine services, static environment, player feature, architectural
 * scene, rendering pipeline, environment simulation, DOM UI, then the loop.
 */
async function bootstrap(): Promise<void> {
  const canvas = requireElementById<HTMLCanvasElement>('webgl-canvas');
  const loaderElement = requireElementById<HTMLElement>('loader');
  const loadingTextElement = requireElementById<HTMLElement>('loading-text');

  const input = InputManager.instance;
  input.bindPointerLockTarget(canvas);

  const sceneManager = new SceneManager(canvas);
  const loop = new GameLoop();

  const physics = new PhysicsManager();
  await physics.init();
  const assetScheduler = new AssetStreamingScheduler();

  const environmentMap = new EnvironmentMapSystem(
    sceneManager.renderer,
    sceneManager.scene,
  );

  const environment = new Environment(physics.world);
  environment.addTo(sceneManager.scene);

  const player = new Player(sceneManager.camera, physics.world);
  sceneManager.scene.add(player.root);

  const postFx = new PostProcessingController(
    sceneManager.renderer,
    sceneManager.scene,
    sceneManager.camera,
  );
  const adaptiveQuality = new AdaptiveQualitySystem(sceneManager.renderer, postFx);

  const dayNight = new DayNightCycle(
    sceneManager.scene,
    sceneManager.camera,
    sceneManager.renderer,
    postFx,
    new THREE.TextureLoader(),
    {
      cycleDurationSeconds: APP_CONFIG.DAY_NIGHT_CYCLE_SECONDS,
      startTime: APP_CONFIG.START_TIME_OF_DAY,
      timeScale: APP_CONFIG.DAY_NIGHT_TIME_SCALE,
    },
  );

  const architecturalHouse = new ArchitecturalHouse({
    canvas,
    scene: sceneManager.scene,
    camera: sceneManager.camera,
    renderer: sceneManager.renderer,
    world: physics.world,
    dayNight,
    player,
    assetScheduler,
  });
  architecturalHouse.addTo(sceneManager.scene);

  try {
    await Promise.all([
      player.load(),
      architecturalHouse.load(),
      dayNight.init(),
    ]);

    sceneManager.delegateRendering = true;
    loaderElement.classList.add('hidden');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown loading error';
    loadingTextElement.textContent = `Load failed: ${message}`;
    console.error('[bootstrap] Load failed:', error);
    return;
  }

  const timeControls = new TimeControlPanel(dayNight, {
    cycleDurationSeconds: APP_CONFIG.DAY_NIGHT_CYCLE_SECONDS,
  });
  new ProjectMenuPanel({
    hudTargets: [
      requireElementById<HTMLElement>('hud'),
      requireElementById<HTMLElement>('time-controls'),
    ],
  });

  loop.register(
    physics,
    player,
    architecturalHouse,
    sceneManager,
    adaptiveQuality,
    dayNight,
    timeControls,
  );
  loop.start();
  void streamEnvironmentMap(environmentMap);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC') {
      player.toggleCamera();
    }
  });
}

async function streamEnvironmentMap(environmentMap: EnvironmentMapSystem): Promise<void> {
  try {
    await yieldToBrowser(150);
    await environmentMap.init();
  } catch (error) {
    console.warn('[bootstrap] Deferred environment map failed.', error);
  }
}

bootstrap();
