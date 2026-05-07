/**
 * DOM helper utilities used by UI and bootstrap code.
 *
 * Keeping these tiny helpers centralized avoids repeated unsafe casts and keeps
 * input systems from coupling themselves to individual UI components.
 */

/**
 * Retrieves a required DOM element by id and fails loudly during bootstrap when
 * the HTML contract is broken.
 *
 * @param id - Element id without the leading `#`.
 * @returns The resolved element typed by the caller.
 */
export function requireElementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: #${id}`);
  }

  return element as T;
}

/**
 * Detects native editable targets so global gameplay shortcuts can avoid
 * stealing keystrokes from text inputs, selects, and contenteditable regions.
 *
 * @param target - Event target from a keyboard or pointer event.
 */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
}
