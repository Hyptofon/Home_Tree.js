/**
 * Singleton class responsible for tracking keyboard state.
 * Abstracts raw DOM keyboard events into semantic game actions.
 */
export class InputManager {
  private static _instance: InputManager | null = null;

  /**
   * Retrieves the global singleton instance.
   * @returns The InputManager instance.
   */
  static get instance(): InputManager {
    if (!InputManager._instance) {
      InputManager._instance = new InputManager();
    }
    return InputManager._instance;
  }

  /**
   * Internal set storing the KeyboardEvent.code of currently pressed keys.
   */
  private readonly _keys: Set<string> = new Set();

  /**
   * Private constructor to enforce Singleton pattern.
   * Sets up window event listeners for keydown, keyup, and blur (to clear stuck keys).
   */
  private constructor() {
    window.addEventListener('keydown', (e) => {
      this._keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur',  () => this._keys.clear());
  }

  /**
   * Checks if a specific key is currently pressed.
   * @param code The KeyboardEvent.code (e.g., 'KeyW', 'Space').
   * @returns true if pressed, false otherwise.
   */
  isDown(code: string): boolean {
    return this._keys.has(code);
  }

  /** Moves the character forward relative to the camera. */
  get forward():  boolean { return this.isDown('KeyW'); }
  
  /** Moves the character backward relative to the camera. */
  get backward(): boolean { return this.isDown('KeyS'); }
  
  /** Strafes the character to the left. */
  get left():     boolean { return this.isDown('KeyA'); }
  
  /** Strafes the character to the right. */
  get right():    boolean { return this.isDown('KeyD'); }
  
  /** Activates sprinting when combined with forward movement. */
  get sprint():   boolean { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }
  
  /** Triggers a jump. */
  get jump():     boolean { return this.isDown('Space'); }
}
