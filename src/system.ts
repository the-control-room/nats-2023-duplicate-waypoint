// A small model of what surrounded the bug: a primary and a backup server running
// the same software, fed by a queue that resends a message until it is acknowledged.
//
// The behaviour follows pages 12, 28-29 and 69-70 of the NATS final report.
// Class names and message shapes are a reconstruction.

import type { FlightPlan } from './flight-plan.ts';
import { CriticalException, extractUkPortion } from './uk-portion.ts';
import type { Build, Log } from './uk-portion.ts';

export class FprsaServer {
  readonly name: string;
  readonly build: Build;
  mode: 'online' | 'maintenance' = 'online';

  constructor(name: string, build: Build) {
    this.name = name;
    this.build = build;
  }

  /** Returns true when the plan was handled, which is the acknowledgement the queue waits for. */
  process(plan: FlightPlan, log: Log): boolean {
    try {
      const outcome = extractUkPortion(plan, this.build);
      log(`${this.name}: ${plan.callsign} ${outcome.kind === 'processed' ? 'processed' : 'sent to manual processing'}`);
      return true;
    } catch (error) {
      if (!(error instanceof CriticalException)) throw error;
      // Fail safe: stop rather than pass possibly wrong data to controllers.
      // The real log entry did not say which flight plan caused it either.
      this.mode = 'maintenance';
      log(`${this.name}: CRITICAL EXCEPTION, entering maintenance mode`);
      return false;
    }
  }

  restart(): void {
    this.mode = 'online';
  }
}

export interface RunResult {
  processed: string[];
  quarantined: string[];
  restarts: number;
}

/**
 * Feeds a queue of flight plans to a primary and a backup server.
 * A plan leaves the queue only when a server acknowledges it.
 */
export function runSystem(queue: FlightPlan[], build: Build, restartAttempts: number, log: Log): RunResult {
  const servers = [new FprsaServer('primary', build), new FprsaServer('backup', build)];
  const pending = [...queue];
  const result: RunResult = { processed: [], quarantined: [], restarts: 0 };

  while (pending.length > 0) {
    const plan = pending[0];
    const active = servers.find((server) => server.mode === 'online');

    if (active) {
      if (active.process(plan, log)) {
        result.processed.push(pending.shift()!.callsign);
      }
      continue; // no acknowledgement: the same plan stays at the head of the queue
    }

    log('both servers are in maintenance mode: automatic processing has stopped');
    if (result.restarts < restartAttempts) {
      result.restarts++;
      log(`restart attempt ${result.restarts}: the queue resends the same unacknowledged plan`);
      servers.forEach((server) => server.restart());
      continue;
    }

    // What finally worked on the day: move the pending message out of the way.
    log(`operator moves ${plan.callsign} to a separate queue`);
    result.quarantined.push(pending.shift()!.callsign);
    servers.forEach((server) => server.restart());
  }
  return result;
}
