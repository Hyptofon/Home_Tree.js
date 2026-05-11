import * as THREE from 'three';

import { InputManager } from '../../../core/InputManager.ts';
import type { DoorInteraction, WallSurface } from '../types.ts';

type SurfaceInteractionOptions = {
  readonly canvas: HTMLCanvasElement;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly interactableSurfaces: readonly WallSurface[];
  readonly doors: readonly DoorInteraction[];
  readonly onDoorClick: (object: THREE.Object3D) => boolean;
};

const LOCKED_RAYCAST_INTERVAL_SECONDS = 0.08;

/** Raycaster-backed hover and click interactions for walls and doors. */
export class SurfaceInteractionSystem {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.Camera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly intersectables: THREE.Object3D[];
  private readonly intersections: THREE.Intersection[] = [];
  private readonly input = InputManager.instance;
  private readonly outline: THREE.BoxHelper;
  private readonly onDoorClick: (object: THREE.Object3D) => boolean;

  private hovered: THREE.Object3D | null = null;
  private pointerDirty = true;
  private lockedRaycastElapsed = LOCKED_RAYCAST_INTERVAL_SECONDS;
  private suppressNextCanvasClick = false;

  /**
   * @param options - Raycasting dependencies and callbacks.
   */
  constructor(options: SurfaceInteractionOptions) {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.onDoorClick = options.onDoorClick;
    this.intersectables = [
      ...options.interactableSurfaces.map((surface) => surface.mesh),
      ...options.doors.map((door) => door.mesh),
    ];

    this.outline = new THREE.BoxHelper(new THREE.Object3D(), 0x94ffe3);
    this.outline.name = 'InteractionOutline';
    this.outline.visible = false;
    this.outline.renderOrder = 20;
    this.outline.material.depthTest = false;
    this.outline.material.transparent = true;
    this.outline.material.opacity = 0.92;
    options.scene.add(this.outline);

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('click', this.handleCanvasClick, true);
  }

  /** Dynamically registers additional doors after initialization. */
  registerDoors(newDoors: readonly DoorInteraction[]): void {
    for (const door of newDoors) {
      this.intersectables.push(door.mesh);
    }
  }

  /** Dynamically registers interactable surfaces after initialization. */
  registerSurfaces(newSurfaces: readonly WallSurface[]): void {
    for (const surface of newSurfaces) {
      this.intersectables.push(surface.mesh);
    }
  }

  /**
   * Refreshes center-screen raycast while pointer lock is active.
   *
   * @param _delta - Frame delta, unused by the raycaster.
   */
  update(delta: number): void {
    if (this.input.isLocked) {
      this.lockedRaycastElapsed += delta;
      if (this.lockedRaycastElapsed < LOCKED_RAYCAST_INTERVAL_SECONDS && !this.pointerDirty) {
        return;
      }

      this.lockedRaycastElapsed = 0;
      this.pointer.set(0, 0);
      this.pointerDirty = true;
    } else {
      this.lockedRaycastElapsed = LOCKED_RAYCAST_INTERVAL_SECONDS;
    }

    if (!this.pointerDirty) return;
    this.pointerDirty = false;
    this.updateHover();
  }

  /** Removes DOM listeners and scene helpers. */
  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('click', this.handleCanvasClick, true);
    this.outline.removeFromParent();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
  }

  private updateHover(): void {
    this.intersections.length = 0;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.intersectObjects(this.intersectables, false, this.intersections);

    const object = this.intersections[0]?.object ?? null;
    this.hovered = object;

    if (!object) {
      this.outline.visible = false;
      return;
    }

    this.outline.setFromObject(object);
    this.outline.visible = true;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.input.isLocked || event.target !== this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.pointerDirty = true;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.target !== this.canvas) return;

    if (!this.hovered || this.pointerDirty) {
      this.updateHover();
    }

    if (!this.hovered) return;

    if (this.onDoorClick(this.hovered)) {
      this.suppressCanvasClick(event);
      return;
    }
  };

  private readonly handleCanvasClick = (event: MouseEvent): void => {
    if (!this.suppressNextCanvasClick) return;

    this.suppressNextCanvasClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private suppressCanvasClick(event: PointerEvent): void {
    this.suppressNextCanvasClick = true;
    event.preventDefault();
    event.stopPropagation();
  }
}
