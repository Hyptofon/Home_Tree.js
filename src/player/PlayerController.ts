import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { InputManager } from '../core/InputManager.ts';
import type { AnimationName } from '../types/animations.ts';
import { PLAYER_CONTROLLER_CONFIG } from './playerConfig.ts';

/** High-level movement state resolved by the controller for animation systems. */
export type ControllerState = {
  /** Logical animation that best matches the current movement state. */
  readonly desiredAnimation: AnimationName;
};

/**
 * Converts gameplay input into Rapier-backed kinematic character movement.
 *
 * The controller owns collision bodies and movement state only. Visual loading,
 * animation blending, and camera behavior are handled by sibling player
 * subsystems through composition.
 */
export class PlayerController {
  /** Current smoothed horizontal velocity in world units per second. */
  private readonly velocity = new THREE.Vector3();

  /** Local input direction reused every frame to avoid hot-path allocations. */
  private readonly localDirection = new THREE.Vector3();

  /** Target horizontal velocity reused every frame. */
  private readonly targetVelocity = new THREE.Vector3();

  /** Camera forward vector projected onto the ground plane. */
  private readonly cameraForward = new THREE.Vector3();

  /** Camera right vector projected onto the ground plane. */
  private readonly cameraRight = new THREE.Vector3();

  /** Rapier translation object reused for kinematic movement queries. */
  private readonly translationOffset: RAPIER.Vector = { x: 0, y: 0, z: 0 };

  /** Input source shared by the game systems. */
  private readonly input = InputManager.instance;

  /** Rapier world used for teardown of owned physics objects. */
  private readonly world: RAPIER.World;

  /** Kinematic body that represents the character in physics space. */
  private readonly rigidBody: RAPIER.RigidBody;

  /** Capsule collider attached to the character body. */
  private readonly collider: RAPIER.Collider;

  /** Rapier controller that computes collision-aware kinematic motion. */
  private readonly characterController: RAPIER.KinematicCharacterController;

  /** Current vertical velocity used by jump and gravity integration. */
  private jumpVelocity = 0;

  /** True while the controller is airborne. */
  private isJumping = false;

  /** Prevents holding Space from continuously retriggering jumps. */
  private jumpConsumed = false;

  /**
   * Creates the physics body, capsule collider, and kinematic controller.
   *
   * @param world - Active Rapier world.
   */
  constructor(world: RAPIER.World) {
    this.world = world;

    const cfg = PLAYER_CONTROLLER_CONFIG;
    this.rigidBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        cfg.SPAWN_POSITION.x,
        cfg.SPAWN_POSITION.y,
        cfg.SPAWN_POSITION.z,
      ),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(cfg.CAPSULE_HALF_HEIGHT, cfg.CAPSULE_RADIUS),
      this.rigidBody,
    );

    this.characterController = world.createCharacterController(cfg.CHARACTER_CONTROLLER_OFFSET);
    this.characterController.enableAutostep(
      cfg.AUTOSTEP_MAX_HEIGHT,
      cfg.AUTOSTEP_MIN_WIDTH,
      true,
    );
    this.characterController.enableSnapToGround(cfg.SNAP_TO_GROUND_DISTANCE);
  }

  /**
   * Updates movement, collision resolution, root transform, and animation state.
   *
   * @param root - Visual player group synced to the physics body.
   * @param delta - Frame delta in seconds.
   * @param camera - Active camera used for camera-relative movement.
   */
  update(root: THREE.Group, delta: number, camera: THREE.Camera): ControllerState {
    const wantsForward = this.input.forward;
    const wantsBackward = this.input.backward;
    const wantsLeft = this.input.left;
    const wantsRight = this.input.right;
    const wantsSprint = this.input.sprint;
    const wantsJump = this.input.jump;
    const isMoving = wantsForward || wantsBackward || wantsLeft || wantsRight;

    this.resolveHorizontalVelocity(
      root,
      camera,
      delta,
      wantsForward,
      wantsBackward,
      wantsLeft,
      wantsRight,
      wantsSprint,
    );
    this.integrateCharacter(root, delta);
    this.integrateJump(delta, wantsJump);

    return {
      desiredAnimation: this.resolveAnimation(isMoving, wantsSprint),
    };
  }

  /** Removes Rapier objects owned by the controller. */
  dispose(): void {
    this.world.removeCharacterController(this.characterController);
    this.world.removeRigidBody(this.rigidBody);
  }

  /**
   * Resolves smoothed camera-relative horizontal velocity.
   *
   * @param root - Visual root used for character facing.
   * @param camera - Active camera.
   * @param delta - Frame delta in seconds.
   * @param forward - Whether forward input is active.
   * @param backward - Whether backward input is active.
   * @param left - Whether left input is active.
   * @param right - Whether right input is active.
   * @param sprint - Whether sprint input is active.
   */
  private resolveHorizontalVelocity(
    root: THREE.Group,
    camera: THREE.Camera,
    delta: number,
    forward: boolean,
    backward: boolean,
    left: boolean,
    right: boolean,
    sprint: boolean,
  ): void {
    const cfg = PLAYER_CONTROLLER_CONFIG;
    this.localDirection.set(0, 0, 0);
    this.targetVelocity.set(0, 0, 0);

    if (forward) this.localDirection.z -= 1;
    if (backward) this.localDirection.z += 1;
    if (left) this.localDirection.x -= 1;
    if (right) this.localDirection.x += 1;

    if (this.localDirection.lengthSq() > 0) {
      this.localDirection.normalize();

      this.cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      this.cameraForward.y = 0;
      this.cameraForward.normalize();

      this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      this.cameraRight.y = 0;
      this.cameraRight.normalize();

      this.targetVelocity
        .copy(this.cameraForward)
        .multiplyScalar(-this.localDirection.z)
        .addScaledVector(this.cameraRight, this.localDirection.x)
        .multiplyScalar(sprint ? cfg.RUN_SPEED : cfg.MOVE_SPEED);

      this.rotateRootTowardVelocity(root, delta);
    }

    this.velocity.lerp(
      this.targetVelocity,
      Math.min(1, cfg.VELOCITY_FRICTION * delta),
    );
  }

  /**
   * Smoothly rotates the visual root toward the desired movement direction.
   *
   * @param root - Visual player root.
   * @param delta - Frame delta in seconds.
   */
  private rotateRootTowardVelocity(root: THREE.Group, delta: number): void {
    const targetRotation = Math.atan2(this.targetVelocity.x, this.targetVelocity.z) + Math.PI;
    const shortestAngle = THREE.MathUtils.euclideanModulo(
      targetRotation - root.rotation.y + Math.PI,
      Math.PI * 2,
    ) - Math.PI;

    root.rotation.y += shortestAngle * PLAYER_CONTROLLER_CONFIG.ROTATE_SPEED * delta;
  }

  /**
   * Applies computed movement through Rapier and syncs the visual root.
   *
   * @param root - Visual player root.
   * @param delta - Frame delta in seconds.
   */
  private integrateCharacter(root: THREE.Group, delta: number): void {
    this.translationOffset.x = this.velocity.x * delta;
    this.translationOffset.y = this.jumpVelocity * delta;
    this.translationOffset.z = this.velocity.z * delta;

    this.characterController.computeColliderMovement(this.collider, this.translationOffset);
    const computedMovement = this.characterController.computedMovement();
    const newPosition = this.rigidBody.translation();
    newPosition.x += computedMovement.x;
    newPosition.y += computedMovement.y;
    newPosition.z += computedMovement.z;

    this.rigidBody.setNextKinematicTranslation(newPosition);
    root.position.set(
      newPosition.x,
      newPosition.y - PLAYER_CONTROLLER_CONFIG.CHARACTER_GROUND_OFFSET,
      newPosition.z,
    );
  }

  /**
   * Integrates jump and gravity state after collision movement has resolved.
   *
   * @param delta - Frame delta in seconds.
   * @param wantsJump - Whether jump input is active this frame.
   */
  private integrateJump(delta: number, wantsJump: boolean): void {
    const isGrounded = this.characterController.computedGrounded();

    if (isGrounded && this.jumpVelocity <= 0) {
      this.isJumping = false;
      this.jumpVelocity = 0;
    } else if (!isGrounded) {
      this.isJumping = true;
      this.jumpVelocity += PLAYER_CONTROLLER_CONFIG.GRAVITY * delta;
    }

    if (wantsJump && isGrounded && !this.jumpConsumed) {
      this.isJumping = true;
      this.jumpVelocity = PLAYER_CONTROLLER_CONFIG.JUMP_FORCE;
      this.jumpConsumed = true;
    }

    if (!wantsJump) {
      this.jumpConsumed = false;
    }
  }

  /**
   * Determines the logical animation from movement and airborne state.
   *
   * @param isMoving - True if any movement key is pressed.
   * @param sprint - True if sprint is held.
   */
  private resolveAnimation(isMoving: boolean, sprint: boolean): AnimationName {
    if (this.isJumping) return 'jump';
    if (isMoving && sprint) return 'run';
    if (isMoving) return 'walk';
    return 'idle';
  }
}
