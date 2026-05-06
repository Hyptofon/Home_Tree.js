import './style.css';
import { SceneManager } from './core/SceneManager.ts';
import { GameLoop }     from './core/GameLoop.ts';
import { Environment }  from './entities/Environment.ts';
import { Player }       from './player/Player.ts';
import { PhysicsManager } from './core/PhysicsManager.ts';

/**
 * The main entry point of the application.
 * 

 * - Initializes all core systems (Rendering, Physics, Input, Game Loop).
 * - Wires up dependencies (e.g., passing the physics world to the player and environment).
 * - Manages the loading screen and error boundary.
 * - Starts the game loop.
 */
async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;

  const sceneManager = new SceneManager(canvas);
  const loop         = new GameLoop();
  
  const physics = new PhysicsManager();
  await physics.init();

  const env = new Environment(physics.world);
  env.addTo(sceneManager.scene);

  const player = new Player(sceneManager.camera, physics.world);
  sceneManager.scene.add(player.root);

  const loaderEl      = document.getElementById('loader')       as HTMLElement;
  const loadingTextEl = document.getElementById('loading-text') as HTMLElement;

  try {
    await player.load();
    loaderEl.classList.add('hidden');
  } catch (err) {
    loadingTextEl.textContent = `❌ ${(err as Error).message}`;
    console.error('[bootstrap] Player load failed:', err);
    return; 
  }

  loop.register(physics, player, sceneManager);
  loop.start();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') {
      player.toggleCamera();
    }
  });
}

bootstrap();
