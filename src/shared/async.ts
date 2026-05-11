/**
 * Yields control back to the browser before continuing heavy scene work.
 *
 * The helper prefers idle time when available and falls back to the next frame,
 * which keeps startup and streamed asset integration from monopolizing the
 * main thread.
 */
export function yieldToBrowser(timeoutMs = 50): Promise<void> {
  return new Promise((resolve) => {
    const win = globalThis as typeof globalThis & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { readonly timeout: number },
      ) => number;
    };

    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(resolve, { timeout: timeoutMs });
      return;
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

/**
 * Executes async work in small batches with a browser yield between batches.
 *
 * @param items - Work items to process.
 * @param batchSize - Maximum number of concurrent jobs per batch.
 * @param worker - Async operation for one item.
 */
export async function runBatched<T>(
  items: readonly T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(worker));
    await yieldToBrowser();
  }
}
