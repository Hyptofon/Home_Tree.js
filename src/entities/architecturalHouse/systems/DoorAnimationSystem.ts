import * as THREE from 'three';

import type { DoorInteraction } from '../types.ts';

const DOOR_LERP_SPEED = 7.5;
const ANGLE_EPSILON = 0.002;

/** Updates interactive architectural doors without per-frame allocations. */
export class DoorAnimationSystem {
  private readonly doorsByMesh = new Map<THREE.Object3D, DoorInteraction>();
  private readonly doors: readonly DoorInteraction[];

  /**
   * @param doors - Door records created by the structure builder.
   */
  constructor(doors: readonly DoorInteraction[]) {
    this.doors = doors;
    this.registerDoors(doors);
  }

  /** Dynamically registers additional doors after initialization. */
  registerDoors(newDoors: readonly DoorInteraction[]): void {
    for (const door of newDoors) {
      this.doorsByMesh.set(door.mesh, door);
      if (!this.doors.includes(door)) {
        (this.doors as DoorInteraction[]).push(door);
      }
    }
  }

  /**
   * Animates all doors toward their target state.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void {
    const t = Math.min(1, delta * DOOR_LERP_SPEED);

    for (const door of this.doors) {
      if (Math.abs(door.currentAngle - door.targetAngle) < ANGLE_EPSILON) continue;

      door.currentAngle = THREE.MathUtils.lerp(door.currentAngle, door.targetAngle, t);
      door.pivot.rotation.y = door.currentAngle;

      if (door.rigidBody) {
        // Since we are changing rotation, sync the kinematic body
        const worldQuat = new THREE.Quaternion();
        door.pivot.getWorldQuaternion(worldQuat);
        door.rigidBody.setNextKinematicRotation(worldQuat);
      }
    }
  }

  /**
   * Toggles a door when a raycast target belongs to it.
   *
   * @param object - Intersected object.
   * @returns True when a door was toggled.
   */
  toggleFromObject(object: THREE.Object3D): boolean {
    const door = this.findDoor(object);
    if (!door) return false;

    const isOpen = Math.abs(door.targetAngle - door.openAngle) < ANGLE_EPSILON;
    door.targetAngle = isOpen ? door.closedAngle : door.openAngle;
    return true;
  }

  private findDoor(object: THREE.Object3D): DoorInteraction | null {
    let current: THREE.Object3D | null = object;

    while (current) {
      const door = this.doorsByMesh.get(current);
      if (door) return door;
      current = current.parent;
    }

    return null;
  }
}
