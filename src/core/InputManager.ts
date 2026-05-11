import { isEditableElement } from '../shared/dom.ts';

const BLOCKED_BROWSER_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

/**
 * Tracks low-level gameplay input and pointer-lock mouse deltas.
 *
 * InputManager is a singleton because gameplay systems need one canonical view
 * of current keyboard state. Pointer lock is bound explicitly to the WebGL
 * canvas by bootstrap code, keeping UI clicks from unexpectedly locking the
 * pointer.
 */
export class InputManager {
  private static _instance: InputManager | null = null;

  /** Retrieves the global input instance. */
  static get instance(): InputManager {
    if (!InputManager._instance) {
      InputManager._instance = new InputManager();
    }

    return InputManager._instance;
  }

  /** KeyboardEvent.code values currently held down. */
  private readonly keys: Set<string> = new Set();

  /** Element that is allowed to request pointer lock. */
  private pointerLockTarget: HTMLElement | null = null;

  /** Accumulated locked-pointer X movement since the last frame. */
  public movementX = 0;

  /** Accumulated locked-pointer Y movement since the last frame. */
  public movementY = 0;

  /** Reused mouse delta object returned by consumeMouseDelta. */
  private readonly consumedMouseDelta = { x: 0, y: 0 };

  /** True when the configured pointer-lock target currently owns the pointer. */
  public get isLocked(): boolean {
    return document.pointerLockElement === this.pointerLockTarget;
  }

  /** Sets up global keyboard and mouse listeners. */
  private constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  /**
   * Binds pointer lock acquisition to a specific interactive surface.
   *
   * @param target - Element, normally the WebGL canvas, that should lock mouse input.
   */
  bindPointerLockTarget(target: HTMLElement): void {
    if (this.pointerLockTarget === target) return;

    this.pointerLockTarget?.removeEventListener('click', this.handlePointerLockClick);
    this.pointerLockTarget = target;
    this.pointerLockTarget.addEventListener('click', this.handlePointerLockClick);
  }

  /** Removes the current pointer-lock click binding, if any. */
  unbindPointerLockTarget(): void {
    this.pointerLockTarget?.removeEventListener('click', this.handlePointerLockClick);
    this.pointerLockTarget = null;
  }

  /**
   * Returns accumulated mouse movement and resets it for the next frame.
   *
   * @returns Pointer delta in CSS pixels.
   */
  consumeMouseDelta(): { x: number; y: number } {
    this.consumedMouseDelta.x = this.movementX;
    this.consumedMouseDelta.y = this.movementY;
    this.movementX = 0;
    this.movementY = 0;
    return this.consumedMouseDelta;
  }

  /**
   * Checks whether a specific physical key is currently pressed.
   *
   * @param code - `KeyboardEvent.code`, for example `KeyW` or `Space`.
   */
  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Removes all listeners owned by the singleton. Mainly used in teardown/tests. */
  dispose(): void {
    this.unbindPointerLockTarget();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.keys.clear();
    InputManager._instance = null;
  }

  /** Moves the character forward relative to the camera. */
  get forward(): boolean { return this.isDown('KeyW'); }

  /** Moves the character backward relative to the camera. */
  get backward(): boolean { return this.isDown('KeyS'); }

  /** Strafes the character left. */
  get left(): boolean { return this.isDown('KeyA'); }

  /** Strafes the character right. */
  get right(): boolean { return this.isDown('KeyD'); }

  /** Activates sprinting while held. */
  get sprint(): boolean { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }

  /** Triggers a jump. */
  get jump(): boolean { return this.isDown('Space'); }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableElement(event.target)) return;

    this.keys.add(event.code);
    if (BLOCKED_BROWSER_KEYS.has(event.code)) {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handleWindowBlur = (): void => {
    this.keys.clear();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.isLocked) return;

    this.movementX += event.movementX;
    this.movementY += event.movementY;
  };

  private readonly handlePointerLockClick = (event: MouseEvent): void => {
    if (isEditableElement(event.target) || this.isLocked) return;

    this.pointerLockTarget?.requestPointerLock();
  };

  private readonly handlePointerLockChange = (): void => {
    if (!this.isLocked) {
      this.keys.clear();
      this.movementX = 0;
      this.movementY = 0;
    }
  };
}
