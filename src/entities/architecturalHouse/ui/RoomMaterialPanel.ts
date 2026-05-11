import type {
  RoomDefinition,
  WallpaperId,
  WallpaperOption,
} from '../types.ts';

type MaterialPanelOptions = {
  readonly onSelect: (wallpaperId: WallpaperId) => void;
};

/** DOM material picker opened by raycast wall selection. */
export class RoomMaterialPanel {
  private readonly element: HTMLElement;
  private readonly titleElement: HTMLElement;
  private readonly swatchGrid: HTMLElement;
  private readonly onSelect: (wallpaperId: WallpaperId) => void;
  private activeRoom: RoomDefinition | null = null;

  /**
   * @param options - Selection callback invoked by swatch clicks.
   */
  constructor(options: MaterialPanelOptions) {
    this.onSelect = options.onSelect;
    this.element = document.createElement('aside');
    this.element.className = 'material-panel';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="material-panel__top">
        <div>
          <div class="material-panel__eyebrow">MATERIALS</div>
          <h2 class="material-panel__title" data-room-title>Room</h2>
        </div>
        <button class="material-panel__close" data-close type="button" aria-label="Close material panel">&times;</button>
      </div>
      <div class="material-panel__swatches" data-swatches></div>
    `;

    this.titleElement = this.requireElement('[data-room-title]');
    this.swatchGrid = this.requireElement('[data-swatches]');
    this.element.addEventListener('pointerdown', this.stopEvent);
    this.element.addEventListener('click', this.stopEvent);
    this.requireElement<HTMLButtonElement>('[data-close]').addEventListener('click', this.handleCloseClick);
    document.body.appendChild(this.element);
  }

  /**
   * Opens the panel for a selected room.
   *
   * @param room - Selected architectural room.
   * @param options - Wallpaper swatches available in this room.
   * @param activeId - Currently active wallpaper id.
   */
  show(
    room: RoomDefinition,
    options: readonly WallpaperOption[],
    activeId: WallpaperId,
  ): void {
    this.activeRoom = room;
    this.titleElement.textContent = room.label;
    this.swatchGrid.replaceChildren();

    for (const option of options) {
      const button = document.createElement('button');
      button.className = 'material-panel__swatch';
      button.type = 'button';
      button.style.backgroundImage = `url("${option.previewUrl}")`;
      button.dataset['wallpaperId'] = option.id;
      button.setAttribute('aria-label', option.label);
      button.title = option.label;
      button.classList.toggle('material-panel__swatch--active', option.id === activeId);
      button.addEventListener('click', this.handleSwatchClick);
      this.swatchGrid.appendChild(button);
    }

    this.element.classList.add('material-panel--open');
    this.element.setAttribute('aria-hidden', 'false');

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /** Closes the panel without changing room state. */
  hide(): void {
    this.activeRoom = null;
    this.element.classList.remove('material-panel--open');
    this.element.setAttribute('aria-hidden', 'true');
  }

  /** Removes the panel and owned listeners. */
  dispose(): void {
    this.element.removeEventListener('pointerdown', this.stopEvent);
    this.element.removeEventListener('click', this.stopEvent);
    this.requireElement<HTMLButtonElement>('[data-close]').removeEventListener('click', this.handleCloseClick);

    for (const swatch of this.swatchGrid.querySelectorAll('.material-panel__swatch')) {
      swatch.removeEventListener('click', this.handleSwatchClick);
    }

    this.element.remove();
  }

  private requireElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) throw new Error(`RoomMaterialPanel missing element: ${selector}`);
    return element;
  }

  private readonly handleSwatchClick = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLButtonElement)) return;

    const wallpaperId = target.dataset['wallpaperId'];
    if (!wallpaperId || !this.activeRoom) return;

    this.onSelect(wallpaperId);

    for (const swatch of this.swatchGrid.querySelectorAll('.material-panel__swatch')) {
      swatch.classList.toggle('material-panel__swatch--active', swatch === target);
    }
  };

  private readonly handleCloseClick = (): void => {
    this.hide();
  };

  private readonly stopEvent = (event: Event): void => {
    event.stopPropagation();
  };
}
