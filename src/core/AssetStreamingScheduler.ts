import { yieldToBrowser } from '../shared/async.ts';

export type AssetStreamingPriority = 'near' | 'background' | 'idle';

type QueuedStreamingTask<T> = {
  readonly id: number;
  readonly label: string;
  readonly priority: AssetStreamingPriority;
  readonly run: () => Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
};

const PRIORITIES: readonly AssetStreamingPriority[] = ['near', 'background', 'idle'];

const PRIORITY_IDLE_TIMEOUT: Readonly<Record<AssetStreamingPriority, number>> = {
  near: 80,
  background: 140,
  idle: 240,
};

const PRIORITY_COOLDOWN_FRAMES: Readonly<Record<AssetStreamingPriority, number>> = {
  near: 1,
  background: 2,
  idle: 3,
};

/**
 * Serializes heavyweight asset integration so startup never launches a swarm of
 * GLTF parses, scene traversals, texture uploads, and bounds computations at
 * once.
 */
export class AssetStreamingScheduler {
  private readonly queues = new Map<AssetStreamingPriority, QueuedStreamingTask<unknown>[]>(
    PRIORITIES.map((priority) => [priority, []]),
  );

  private running = false;
  private disposed = false;
  private nextTaskId = 0;

  /**
   * Queues one streaming job and resolves when that job has been integrated.
   *
   * @param label - Debug label for diagnostics.
   * @param priority - Relative urgency of the task.
   * @param run - Async loader/integration callback.
   */
  enqueue<T>(
    label: string,
    priority: AssetStreamingPriority,
    run: () => Promise<T>,
  ): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error(`Asset scheduler is disposed: ${label}`));
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedStreamingTask<T> = {
        id: this.nextTaskId,
        label,
        priority,
        run,
        resolve,
        reject,
      };
      this.nextTaskId += 1;
      this.queues.get(priority)?.push(task as QueuedStreamingTask<unknown>);
      void this.pump();
    });
  }

  /** Drops queued tasks and prevents future scheduling. */
  dispose(): void {
    this.disposed = true;

    for (const queue of this.queues.values()) {
      for (const task of queue) {
        task.reject(new Error(`Asset scheduler disposed before running: ${task.label}`));
      }
      queue.length = 0;
    }
  }

  private async pump(): Promise<void> {
    if (this.running) return;

    this.running = true;
    try {
      while (!this.disposed) {
        const task = this.dequeue();
        if (!task) return;

        await yieldToBrowser(PRIORITY_IDLE_TIMEOUT[task.priority]);
        await this.runTask(task);
        await this.cooldown(task.priority);
      }
    } finally {
      this.running = false;
      if (!this.disposed && this.hasPendingTasks()) {
        void this.pump();
      }
    }
  }

  private async runTask(task: QueuedStreamingTask<unknown>): Promise<void> {
    try {
      task.resolve(await task.run());
    } catch (error) {
      console.warn(`[AssetStreamingScheduler] Task failed: ${task.label}`, error);
      task.reject(error);
    }
  }

  private async cooldown(priority: AssetStreamingPriority): Promise<void> {
    const frames = PRIORITY_COOLDOWN_FRAMES[priority];
    for (let index = 0; index < frames; index += 1) {
      await yieldToBrowser(PRIORITY_IDLE_TIMEOUT[priority]);
    }
  }

  private dequeue(): QueuedStreamingTask<unknown> | null {
    for (const priority of PRIORITIES) {
      const queue = this.queues.get(priority);
      const task = queue?.shift();
      if (task) return task;
    }

    return null;
  }

  private hasPendingTasks(): boolean {
    for (const queue of this.queues.values()) {
      if (queue.length > 0) return true;
    }

    return false;
  }
}
