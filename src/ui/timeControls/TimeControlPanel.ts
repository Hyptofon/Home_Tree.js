import type { Disposable, Updatable } from '../../types/interfaces.ts';
import { isEditableElement } from '../../shared/dom.ts';
import {
  PHASE_LABELS,
  TIME_CONTROL_CONFIG,
} from './timeControlConfig.ts';
import type {
  TimeController,
  TimeControlPanelOptions,
} from './types.ts';

/**
 * DOM HUD for reading and setting the simulation time.
 *
 * The component owns only UI state and delegates world-time mutation to the
 * injected controller. DOM refresh is throttled to avoid needless work.
 */
export class TimeControlPanel implements Updatable, Disposable {
  /** Abstract controller used to read and mutate world time. */
  private readonly controller: TimeController;

  /** DOM parent that receives the panel element. */
  private readonly root: HTMLElement;

  /** Minimum seconds between passive DOM refreshes. */
  private readonly updateIntervalSeconds: number;

  /** Root section element for the panel. */
  private readonly element: HTMLElement;

  /** Clock text node showing formatted HH:mm time. */
  private readonly timeReadout: HTMLSpanElement;

  /** Text node showing the current day/night phase. */
  private readonly phaseReadout: HTMLSpanElement;

  /** Native time input used for direct time entry. */
  private readonly timeInput: HTMLInputElement;

  /** Range input used for timeline scrubbing. */
  private readonly timeSlider: HTMLInputElement;

  private elapsedSinceRender = 0;
  private isDraggingSlider = false;
  private isQuickScrubbing = false;

  /**
   * Creates and mounts the world-time HUD panel.
   *
   * @param controller - Time controller contract used to read/write world time.
   * @param options - Mounting and refresh configuration.
   */
  constructor(controller: TimeController, options: TimeControlPanelOptions) {
    this.controller = controller;
    this.root = options.root ?? document.body;
    this.updateIntervalSeconds = options.updateIntervalSeconds
      ?? TIME_CONTROL_CONFIG.DEFAULT_UPDATE_INTERVAL_SECONDS;

    this.element = document.createElement('section');
    this.element.id = 'time-controls';
    this.element.className = 'time-panel';
    this.element.setAttribute('aria-label', 'World time controls');
    this.element.innerHTML = this.buildMarkup(options.cycleDurationSeconds);

    this.timeReadout = this.requireElement<HTMLSpanElement>('[data-time-readout]');
    this.phaseReadout = this.requireElement<HTMLSpanElement>('[data-phase-readout]');
    this.timeInput = this.requireElement<HTMLInputElement>('[data-time-input]');
    this.timeSlider = this.requireElement<HTMLInputElement>('[data-time-slider]');

    this.bindEvents();
    this.root.appendChild(this.element);
    this.render(true);
  }

  /**
   * Refreshes the HUD on a throttled cadence.
   *
   * @param delta - Frame delta in seconds.
   */
  update(delta: number): void {
    this.elapsedSinceRender += delta;
    if (this.elapsedSinceRender < this.updateIntervalSeconds) return;

    this.elapsedSinceRender = 0;
    this.render(false);
  }

  /** Removes DOM nodes and every event listener owned by this panel. */
  dispose(): void {
    this.element.removeEventListener('pointerdown', this.stopEvent);
    this.element.removeEventListener('click', this.stopEvent);
    this.element.removeEventListener('keydown', this.stopEvent);
    this.timeSlider.removeEventListener('pointerdown', this.handleSliderPointerDown);
    window.removeEventListener('pointerup', this.handleSliderPointerUp);
    this.timeSlider.removeEventListener('input', this.handleSliderInput);
    this.timeInput.removeEventListener('change', this.handleTimeInputChange);
    this.element.querySelector('[data-time-apply]')?.removeEventListener('click', this.handleApplyClick);
    window.removeEventListener('keydown', this.handleWindowKeyDown);
    window.removeEventListener('keyup', this.handleWindowKeyUp);
    window.removeEventListener('wheel', this.handleWindowWheel);
    this.element.remove();
  }

  /**
   * Builds static markup for the panel.
   *
   * @param cycleDurationSeconds - Real seconds for the displayed 24-hour cycle.
   */
  private buildMarkup(cycleDurationSeconds: number): string {
    return `
      <div class="time-panel__header">
        <svg class="time-panel__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 7v5l3 2"></path>
        </svg>
        <span>WORLD TIME</span>
        <span class="time-panel__cycle">24H / ${this.formatDuration(cycleDurationSeconds)}</span>
      </div>
      <div class="time-panel__readout">
        <span class="time-panel__clock" data-time-readout>00:00</span>
        <span class="time-panel__phase" data-phase-readout>Day</span>
      </div>
      <div class="time-panel__setter">
        <input class="time-panel__input" data-time-input type="time" step="60" value="11:00" aria-label="Set world time" />
        <button class="time-panel__button" data-time-apply type="button" aria-label="Apply world time">SET</button>
      </div>
      <input class="time-panel__slider" data-time-slider type="range" min="0" max="${TIME_CONTROL_CONFIG.MINUTES_PER_DAY - 1}" step="1" value="660" aria-label="Scrub world time" />
    `;
  }

  /** Registers all DOM and global shortcut handlers. */
  private bindEvents(): void {
    this.element.addEventListener('pointerdown', this.stopEvent);
    this.element.addEventListener('click', this.stopEvent);
    this.element.addEventListener('keydown', this.stopEvent);
    this.timeSlider.addEventListener('pointerdown', this.handleSliderPointerDown);
    window.addEventListener('pointerup', this.handleSliderPointerUp);
    this.timeSlider.addEventListener('input', this.handleSliderInput);
    this.timeInput.addEventListener('change', this.handleTimeInputChange);
    this.element.querySelector('[data-time-apply]')?.addEventListener('click', this.handleApplyClick);
    window.addEventListener('keydown', this.handleWindowKeyDown);
    window.addEventListener('keyup', this.handleWindowKeyUp);
    window.addEventListener('wheel', this.handleWindowWheel, { passive: false });
  }

  /**
   * Renders current time and phase into the DOM.
   *
   * @param forceInputs - Whether inputs should update even if recently interacted with.
   */
  private render(forceInputs: boolean): void {
    const minutes = this.timeToMinutes(this.controller.getTimeOfDay());
    const formattedTime = this.formatTime(minutes);

    this.timeReadout.textContent = formattedTime;
    this.phaseReadout.textContent = PHASE_LABELS[this.controller.getPhase()];

    if (forceInputs || (!this.isDraggingSlider && document.activeElement !== this.timeSlider)) {
      this.timeSlider.value = String(minutes);
    }

    if (forceInputs || document.activeElement !== this.timeInput) {
      this.timeInput.value = formattedTime;
    }
  }

  /**
   * Applies absolute minute-of-day value to the controller.
   *
   * @param minutes - Raw minute value, automatically wrapped into one day.
   */
  private applyMinutes(minutes: number): void {
    const normalizedMinutes = ((Math.round(minutes) % TIME_CONTROL_CONFIG.MINUTES_PER_DAY)
      + TIME_CONTROL_CONFIG.MINUTES_PER_DAY)
      % TIME_CONTROL_CONFIG.MINUTES_PER_DAY;
    this.controller.setTimeOfDay(normalizedMinutes / 60);
    this.render(true);
  }

  /**
   * Applies a relative time change in minutes.
   *
   * @param deltaMinutes - Signed minute delta.
   */
  private applyMinuteDelta(deltaMinutes: number): void {
    this.applyMinutes(this.timeToMinutes(this.controller.getTimeOfDay()) + deltaMinutes);
  }

  /**
   * Toggles keyboard quick-scrub mode and matching visual state.
   *
   * @param active - Whether quick-scrub mode should be active.
   */
  private setQuickScrubbing(active: boolean): void {
    if (this.isQuickScrubbing === active) return;

    this.isQuickScrubbing = active;
    this.element.classList.toggle('time-panel--scrubbing', active);
  }

  /** Parses the native time input into minute-of-day form. */
  private parseTimeInput(): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(this.timeInput.value);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
  }

  /**
   * Queries required child elements from the panel root.
   *
   * @param selector - CSS selector inside the panel element.
   */
  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) throw new Error(`TimeControlPanel missing element: ${selector}`);
    return element;
  }

  /**
   * Converts floating-point game hours to wrapped whole minutes.
   *
   * @param time - Time in hours.
   */
  private timeToMinutes(time: number): number {
    return ((Math.round(time * 60) % TIME_CONTROL_CONFIG.MINUTES_PER_DAY)
      + TIME_CONTROL_CONFIG.MINUTES_PER_DAY)
      % TIME_CONTROL_CONFIG.MINUTES_PER_DAY;
  }

  /**
   * Formats minutes after midnight as `HH:mm`.
   *
   * @param totalMinutes - Minute-of-day value.
   */
  private formatTime(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Formats seconds as `mm:ss` for compact cycle duration display.
   *
   * @param seconds - Duration in seconds.
   */
  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  }

  private readonly stopEvent = (event: Event): void => {
    event.stopPropagation();
  };

  private readonly handleSliderPointerDown = (): void => {
    this.isDraggingSlider = true;
  };

  private readonly handleSliderPointerUp = (): void => {
    this.isDraggingSlider = false;
  };

  private readonly handleSliderInput = (): void => {
    this.applyMinutes(Number(this.timeSlider.value));
  };

  private readonly handleTimeInputChange = (): void => {
    const minutes = this.parseTimeInput();
    if (minutes !== null) this.applyMinutes(minutes);
  };

  private readonly handleApplyClick = (): void => {
    const minutes = this.parseTimeInput();
    if (minutes !== null) this.applyMinutes(minutes);
  };

  private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (isEditableElement(event.target)) return;

    if (event.code === 'KeyT') {
      this.setQuickScrubbing(true);
      event.preventDefault();
      return;
    }

    if (!this.isQuickScrubbing) return;

    if (event.code === 'Escape' || event.code === 'Enter') {
      this.setQuickScrubbing(false);
      event.preventDefault();
      return;
    }

    if (event.code === 'ArrowLeft') {
      this.applyMinuteDelta(-TIME_CONTROL_CONFIG.QUICK_SCRUB_STEP_MINUTES);
      event.preventDefault();
      return;
    }

    if (event.code === 'ArrowRight') {
      this.applyMinuteDelta(TIME_CONTROL_CONFIG.QUICK_SCRUB_STEP_MINUTES);
      event.preventDefault();
      return;
    }

    if (event.code === 'ArrowDown' || event.code === 'PageDown') {
      this.applyMinuteDelta(-TIME_CONTROL_CONFIG.QUICK_SCRUB_LARGE_STEP_MINUTES);
      event.preventDefault();
      return;
    }

    if (event.code === 'ArrowUp' || event.code === 'PageUp') {
      this.applyMinuteDelta(TIME_CONTROL_CONFIG.QUICK_SCRUB_LARGE_STEP_MINUTES);
      event.preventDefault();
    }
  };

  private readonly handleWindowKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyT') return;

    this.setQuickScrubbing(false);
    event.preventDefault();
  };

  private readonly handleWindowWheel = (event: WheelEvent): void => {
    if (!this.isQuickScrubbing) return;

    const wheelMagnitude = Math.max(
      1,
      Math.min(
        4,
        Math.round(Math.abs(event.deltaY) / TIME_CONTROL_CONFIG.QUICK_SCRUB_WHEEL_UNIT),
      ),
    );
    const wheelDirection = event.deltaY > 0 ? 1 : -1;
    this.applyMinuteDelta(
      wheelDirection * wheelMagnitude * TIME_CONTROL_CONFIG.QUICK_SCRUB_STEP_MINUTES,
    );
    event.preventDefault();
    event.stopPropagation();
  };
}
