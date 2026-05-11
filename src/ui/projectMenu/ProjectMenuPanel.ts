import type { Disposable } from '../../types/interfaces.ts';
import type { ProjectMenuPanelOptions } from './types.ts';

/**
 * Tab-driven project menu for controls and lightweight runtime settings.
 *
 * The menu is intentionally DOM-only and decoupled from rendering systems. It
 * also captures keyboard events while open so gameplay input does not leak into
 * the player controller.
 */
export class ProjectMenuPanel implements Disposable {
  /** HUD elements controlled by the menu visibility toggle. */
  private readonly hudTargets: readonly HTMLElement[];

  /** Overlay root element containing the project menu dialog. */
  private readonly element: HTMLElement;

  /** Fixed icon button that opens and closes the menu. */
  private readonly launcher: HTMLButtonElement;

  /** Checkbox backing the HUD visibility setting. */
  private readonly hudToggle: HTMLInputElement;

  /** Current open/closed state for idempotent menu transitions. */
  private isOpen = false;

  /**
   * Creates and mounts the project menu and its launcher button.
   *
   * @param options - HUD targets affected by the menu's UI settings.
   */
  constructor(options: ProjectMenuPanelOptions) {
    this.hudTargets = options.hudTargets;
    this.element = document.createElement('aside');
    this.element.id = 'project-menu';
    this.element.className = 'project-menu';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = this.buildMarkup();
    this.launcher = this.buildLauncher();

    this.hudToggle = this.requireElement<HTMLInputElement>('[data-hud-toggle]');
    this.bindEvents();
    document.body.appendChild(this.launcher);
    document.body.appendChild(this.element);
  }

  /** Removes menu DOM nodes and all event listeners owned by the panel. */
  dispose(): void {
    window.removeEventListener('keydown', this.handleWindowKeyDown, true);
    this.element.removeEventListener('pointerdown', this.stopEvent);
    this.element.removeEventListener('click', this.stopEvent);
    this.launcher.removeEventListener('pointerdown', this.stopEvent);
    this.launcher.removeEventListener('click', this.handleLauncherClick);
    this.hudToggle.removeEventListener('change', this.handleHudToggleChange);
    this.element.querySelector('[data-menu-close]')?.removeEventListener('click', this.handleCloseClick);
    this.launcher.remove();
    this.element.remove();
  }

  /** Builds the static menu dialog markup. */
  private buildMarkup(): string {
    return `
      <div class="project-menu__panel" role="dialog" aria-modal="true" aria-label="Project menu">
        <div class="project-menu__topbar">
          <div>
            <div class="project-menu__eyebrow">PROJECT MENU</div>
            <h2 class="project-menu__title">Runtime Settings</h2>
          </div>
          <button class="project-menu__close" data-menu-close type="button" aria-label="Close menu">&times;</button>
        </div>

        <div class="project-menu__grid">
          <section class="project-menu__section">
            <h3>What is enabled</h3>
            <ul class="project-menu__list">
              <li>Two-floor architectural house with 10 interactive zones.</li>
              <li>PBR floors, walls, glass, wood trim, imported GLTF furniture, and HDRI reflections.</li>
              <li>Landscaped estate with road lamps, moving cars, fence, pond, fountain, and playground.</li>
              <li>Cinematic arrival camera, day/night cycle, fog, sky grading, bloom, and tone mapping.</li>
              <li>Wall hover/click material picker, animated doors, dust motes, and shadowed lamps.</li>
              <li>Third-person camera, first-person toggle, character movement, sprint, and jump.</li>
            </ul>
          </section>

          <section class="project-menu__section">
            <h3>Pointer-lock time control</h3>
            <ul class="project-menu__list">
              <li>Hold <kbd>T</kbd> while the camera is locked.</li>
              <li>Mouse wheel changes time by 15 minutes per step.</li>
              <li><kbd>Left</kbd> / <kbd>Right</kbd> changes time by 15 minutes.</li>
              <li><kbd>Up</kbd> / <kbd>Down</kbd> or <kbd>PageUp</kbd> / <kbd>PageDown</kbd> changes time by 1 hour.</li>
              <li>Release <kbd>T</kbd> and continue moving the camera immediately.</li>
            </ul>
          </section>

          <section class="project-menu__section">
            <h3>Controls</h3>
            <div class="project-menu__controls">
              <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Movement</span>
              <span><kbd>Shift</kbd> + <kbd>W</kbd></span><span>Sprint</span>
              <span><kbd>Space</kbd></span><span>Jump</span>
              <span><kbd>C</kbd></span><span>Camera view</span>
              <span><kbd>Click</kbd></span><span>Select walls and doors</span>
              <span><kbd>Tab</kbd></span><span>Open or close this menu</span>
            </div>
          </section>

          <section class="project-menu__section">
            <h3>Interface</h3>
            <label class="project-menu__switch">
              <input data-hud-toggle type="checkbox" checked />
              <span class="project-menu__switch-track" aria-hidden="true"></span>
              <span>Show HUD overlays</span>
            </label>
          </section>
        </div>
      </div>
    `;
  }

  /** Creates the fixed launcher icon button. */
  private buildLauncher(): HTMLButtonElement {
    const launcher = document.createElement('button');
    launcher.className = 'menu-launcher';
    launcher.type = 'button';
    launcher.title = 'Open project menu';
    launcher.setAttribute('aria-label', 'Open project menu');
    launcher.setAttribute('aria-controls', 'project-menu');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.innerHTML = `
      <svg class="menu-launcher__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <path d="M4 7h16"></path>
        <path d="M4 12h16"></path>
        <path d="M4 17h16"></path>
      </svg>
    `;
    return launcher;
  }

  /** Registers global and local DOM event handlers. */
  private bindEvents(): void {
    window.addEventListener('keydown', this.handleWindowKeyDown, true);
    this.element.addEventListener('pointerdown', this.stopEvent);
    this.element.addEventListener('click', this.stopEvent);
    this.launcher.addEventListener('pointerdown', this.stopEvent);
    this.launcher.addEventListener('click', this.handleLauncherClick);
    this.hudToggle.addEventListener('change', this.handleHudToggleChange);
    this.element.querySelector('[data-menu-close]')?.addEventListener('click', this.handleCloseClick);
  }

  /** Opens the menu and exits pointer lock so the cursor is available. */
  private open(): void {
    if (this.isOpen) return;

    this.isOpen = true;
    this.element.classList.add('project-menu--open');
    this.element.setAttribute('aria-hidden', 'false');
    this.launcher.classList.add('menu-launcher--active');
    this.launcher.setAttribute('aria-expanded', 'true');
    this.launcher.setAttribute('aria-label', 'Close project menu');
    this.launcher.title = 'Close project menu';

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /** Closes the menu without changing HUD visibility settings. */
  private close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.element.classList.remove('project-menu--open');
    this.element.setAttribute('aria-hidden', 'true');
    this.launcher.classList.remove('menu-launcher--active');
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.setAttribute('aria-label', 'Open project menu');
    this.launcher.title = 'Open project menu';
  }

  /** Toggles the menu between open and closed states. */
  private toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /**
   * Applies HUD overlay visibility to every configured target.
   *
   * @param visible - Whether overlays should be visible.
   */
  private setHudVisible(visible: boolean): void {
    this.hudToggle.checked = visible;

    for (const target of this.hudTargets) {
      target.classList.toggle('hud-hidden', !visible);
    }
  }

  /**
   * Queries a required child element from the menu root.
   *
   * @param selector - CSS selector inside the menu element.
   */
  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) throw new Error(`ProjectMenuPanel missing element: ${selector}`);
    return element;
  }

  private readonly stopEvent = (event: Event): void => {
    event.stopPropagation();
  };

  private readonly handleCloseClick = (): void => {
    this.close();
  };

  private readonly handleLauncherClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.toggle();
  };

  private readonly handleHudToggleChange = (): void => {
    this.setHudVisible(this.hudToggle.checked);
  };

  private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
      return;
    }

    if (!this.isOpen) return;

    if (event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }

    event.stopPropagation();
  };
}
