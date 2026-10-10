// Time source for the mock backend. Two flavours:
// - RealClock: wall-clock timers, optionally sped up (`speed: 4` = 4x faster simulated downloads).
//   Works with `vi.useFakeTimers()` too, since it delegates to the global setTimeout.
// - ManualClock: nothing happens until a test calls `advance(ms)`; fully deterministic.

export type TimerId = number;

export interface MockClock {
  readonly kind: "real" | "manual";
  /** Epoch milliseconds in simulated time. */
  now(): number;
  /** Schedule `fn` after `ms` of simulated time. */
  setTimeout(fn: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
  /** Cancel every pending timer. */
  dispose(): void;
}

export class RealClock implements MockClock {
  readonly kind = "real" as const;
  private readonly startReal: number;
  private readonly startSim: number;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly speed = 1,
    startTime?: number,
  ) {
    if (!(speed > 0)) throw new Error("speed must be > 0");
    this.startReal = Date.now();
    this.startSim = startTime ?? this.startReal;
  }

  now(): number {
    return this.startSim + (Date.now() - this.startReal) * this.speed;
  }

  setTimeout(fn: () => void, ms: number): TimerId {
    const handle: ReturnType<typeof setTimeout> = globalThis.setTimeout(
      () => {
        this.timers.delete(handle);
        fn();
      },
      Math.max(0, ms / this.speed),
    );
    this.timers.add(handle);
    return handle as unknown as TimerId;
  }

  clearTimeout(id: TimerId): void {
    const handle = id as unknown as ReturnType<typeof setTimeout>;
    globalThis.clearTimeout(handle);
    this.timers.delete(handle);
  }

  dispose(): void {
    for (const t of this.timers) globalThis.clearTimeout(t);
    this.timers.clear();
  }
}

interface Task {
  id: TimerId;
  at: number;
  order: number;
  fn: () => void;
}

export class ManualClock implements MockClock {
  readonly kind = "manual" as const;
  private time: number;
  private tasks: Task[] = [];
  private nextId = 1;
  private order = 0;

  constructor(startTime = Date.UTC(2026, 9, 8, 15, 0, 0)) {
    this.time = startTime;
  }

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): TimerId {
    const id = this.nextId++;
    this.tasks.push({ id, at: this.time + Math.max(0, ms), order: this.order++, fn });
    return id;
  }

  clearTimeout(id: TimerId): void {
    this.tasks = this.tasks.filter((t) => t.id !== id);
  }

  /** Number of timers waiting to fire. */
  get pending(): number {
    return this.tasks.length;
  }

  /**
   * Move simulated time forward by `ms`, firing every timer that falls due (including timers
   * scheduled by those timers) in chronological order.
   */
  advance(ms: number): void {
    const target = this.time + Math.max(0, ms);
    for (;;) {
      const next = this.peek();
      if (!next || next.at > target) break;
      this.tasks = this.tasks.filter((t) => t !== next);
      this.time = next.at;
      next.fn();
    }
    this.time = target;
  }

  /**
   * Like `advance`, but in `step`-sized slices with microtask flushes in between, so promise
   * continuations (e.g. a resolved `invoke`) can run and schedule follow-up timers.
   */
  async advanceAsync(ms: number, step = 50): Promise<void> {
    let left = Math.max(0, ms);
    while (left > 0) {
      const d = Math.min(step, left);
      this.advance(d);
      left -= d;
      await flushMicrotasks();
    }
    await flushMicrotasks();
  }

  /** Fire timers until none remain (guarded against infinite schedules). */
  runAll(maxSteps = 100_000): void {
    for (let i = 0; i < maxSteps; i++) {
      const next = this.peek();
      if (!next) return;
      this.advance(next.at - this.time);
    }
    throw new Error("ManualClock.runAll: too many timers (infinite loop?)");
  }

  dispose(): void {
    this.tasks = [];
  }

  private peek(): Task | undefined {
    let best: Task | undefined;
    for (const t of this.tasks) {
      if (!best || t.at < best.at || (t.at === best.at && t.order < best.order)) best = t;
    }
    return best;
  }
}

/** Resolve after `ms` of simulated time. */
export function sleep(clock: MockClock, ms: number): Promise<void> {
  return new Promise((resolve) => clock.setTimeout(resolve, ms));
}

/** Let pending promise callbacks run (a few rounds, for chained `.then`s). */
export async function flushMicrotasks(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
