import * as THREE from 'three';
import { InputManager } from '../core/InputManager.ts';
import type { AnimationName } from '../types/animations.ts';
import RAPIER from '@dimforge/rapier3d-compat';

export type ControllerState = {
  desiredAnimation: AnimationName;
};

/**
 * Manages the physical movement, jumping, collisions, and state resolution of the Player.
 * Uses `@dimforge/rapier3d-compat` for robust collision detection.
 * 

 * - Translates input intents (W, A, S, D, Space) into physical velocity.
 * - Manages Rapier's KinematicCharacterController to prevent walking through walls.
 * - Computes the correct AnimationName based on current movement state.
 */
export class PlayerController {
  /** Walk movement speed in m/s. */
  readonly moveSpeed = 4.0;
  
  /** Sprint movement speed in m/s. */
  readonly runSpeed = 8.0;
  
  /** Turning speed in radians per second. */
  readonly rotateSpeed = Math.PI * 1.6;
  
  /** Upward velocity applied when jumping. */
  readonly jumpForce = 8.0;
  
  /** Downward gravity acceleration applied to the character (should match world gravity). */
  readonly gravity = -20.0;
  
  /** Current vertical velocity. */
  private jumpVelocity = 0;
  
  /** Whether the character is currently in the air. */
  private isJumping = false;
  
  /** Tracks if the jump key has been consumed to prevent hold-to-jump spam. */
  private jumpConsumed = false;
  
  /** Current velocity vector of the character. */
  private readonly velocity = new THREE.Vector3();

  /** Reference to the InputManager singleton. */
  private readonly input = InputManager.instance;
  
  /** The Rapier RigidBody driving the character collisions. */
  private rigidBody: RAPIER.RigidBody;
  
  /** The Rapier Capsule collider shape for the character. */
  private collider: RAPIER.Collider;
  
  /** The Rapier character controller for resolving kinematic movements against solid bodies. */
  private characterController: RAPIER.KinematicCharacterController;

  /**
   * Initializes the PlayerController physics bodies.
   * @param world The active Rapier physics world.
   */
  constructor(world: RAPIER.World) {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.9, 0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.4);
    this.collider = world.createCollider(colliderDesc, this.rigidBody);

    const offset = 0.01;
    this.characterController = world.createCharacterController(offset);
    this.characterController.enableAutostep(0.5, 0.2, true);
    this.characterController.enableSnapToGround(0.5);
  }

  /**
   * Processes input, updates physics state, applies movement to the rigid body,
   * syncs the visual root position, and determines which animation should play.
   * 
   * @param root The visual Three.js Group representing the player model.
   * @param delta Time passed since the last frame in seconds.
   * @returns The resolved ControllerState containing the desired animation name.
   */
  update(root: THREE.Group, delta: number): ControllerState {
    const { input } = this;
    const wantsForward = input.forward;
    const wantsBackward = input.backward;
    const wantsLeft = input.left;
    const wantsRight = input.right;
    const wantsSprint = input.sprint;
    const wantsJump = input.jump;

    const movingForwardBack = wantsForward || wantsBackward;
    const onlyStrafe = (wantsLeft || wantsRight) && !movingForwardBack;

    if (!onlyStrafe) {
      if (wantsLeft) root.rotation.y += this.rotateSpeed * delta;
      if (wantsRight) root.rotation.y -= this.rotateSpeed * delta;
    }
    const targetSpeed = wantsSprint ? this.runSpeed : this.moveSpeed;
    const localDir = new THREE.Vector3();

    if (wantsForward) localDir.z -= 1;
    if (wantsBackward) localDir.z += 1;
    if (onlyStrafe) {
      if (wantsLeft) localDir.x -= 1;
      if (wantsRight) localDir.x += 1;
    }

    if (localDir.lengthSq() > 0) {
      localDir.normalize();
    }

    const targetVelocity = localDir.applyEuler(new THREE.Euler(0, root.rotation.y, 0));
    targetVelocity.multiplyScalar(localDir.lengthSq() > 0 ? targetSpeed : 0);

    const friction = 10.0;
    this.velocity.lerp(targetVelocity, friction * delta);

    const translationOffset = new RAPIER.Vector3(
      this.velocity.x * delta,
      this.jumpVelocity * delta,
      this.velocity.z * delta
    );

    this.characterController.computeColliderMovement(this.collider, translationOffset);
    const computedMovement = this.characterController.computedMovement();

    const newPos = this.rigidBody.translation();
    newPos.x += computedMovement.x;
    newPos.y += computedMovement.y;
    newPos.z += computedMovement.z;
    this.rigidBody.setNextKinematicTranslation(newPos);
    root.position.set(newPos.x, newPos.y - 0.9, newPos.z);

    const isGrounded = this.characterController.computedGrounded();
    if (isGrounded && this.jumpVelocity <= 0) {
      this.isJumping = false;
      this.jumpVelocity = 0;
    } else if (!isGrounded) {
      this.isJumping = true;
      this.jumpVelocity += this.gravity * delta;
    }

    if (wantsJump && isGrounded && !this.jumpConsumed) {
      this.isJumping = true;
      this.jumpVelocity = this.jumpForce;
      this.jumpConsumed = true;
    }
    if (!wantsJump) {
      this.jumpConsumed = false;
    }

    const desiredAnimation = this.resolveAnimation(
      wantsForward, wantsBackward,
      wantsLeft, wantsRight,
      wantsSprint, onlyStrafe,
    );

    return { desiredAnimation };
  }

  /**
   * Determines the logical animation state based on current movement flags.
   * 
   * @param forward True if moving forward.
   * @param backward True if moving backward.
   * @param left True if strafing/turning left.
   * @param right True if strafing/turning right.
   * @param sprint True if sprint key is held.
   * @param strafe True if purely strafing (no forward/backward input).
   * @returns The AnimationName to be passed to the Animator.
   */
  private resolveAnimation(
    forward: boolean,
    backward: boolean,
    left: boolean,
    right: boolean,
    sprint: boolean,
    strafe: boolean,
  ): AnimationName {
    if (this.isJumping) return 'jump';
    if (strafe && left) return 'strafeLeft';
    if (strafe && right) return 'strafeRight';
    if (forward && sprint) return 'run';
    if (forward) return 'walk';
    if (backward) return 'walkBack';
    if (!forward && !backward && left) return 'walk';
    if (!forward && !backward && right) return 'walk';
    return 'idle';
  }
}
