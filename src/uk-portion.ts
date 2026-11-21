// The logic that finds the UK portion of a flight plan, in three builds.
//
// The search steps follow page 69 of the NATS final report. Names, types and the
// coordination-point set are a reconstruction: the real source code is not public.

import type { FlightPlan } from './flight-plan.ts';

/** Raised when the software cannot find a safe way to continue. */
export class CriticalException extends Error {}

export type Build = '2018' | '2021' | 'fixed';

export type Outcome =
  | { kind: 'processed'; entry: string; exit: string; ukRoute: string[] }
  | { kind: 'manual'; reason: string };

export type Log = (line: string) => void;

// RECONSTRUCTION: the real system looks up coordination points in its own database.
// For this flight the report names APSOV as the UK entry point and SITET as the exit.
const UK_COORDINATION_POINTS = new Set(['APSOV', 'SITET']);

const NOT_FOUND = -1;

/** Searches the filed route from its start. */
function findForward(route: string[], id: string): number {
  return route.indexOf(id);
}

/** Searches the filed route from its end, stopping after `stopAfter`. */
function findBackward(route: string[], id: string, stopAfter: number): number {
  for (let i = route.length - 1; i > stopAfter; i--) {
    if (route[i] === id) return i;
  }
  return NOT_FOUND;
}

export function extractUkPortion(plan: FlightPlan, build: Build, log: Log = () => {}): Outcome {
  const { icaoRoute, adexpPoints } = plan;

  // Step 1: find the UK entry and exit points in the ADEXP waypoint list.
  const ukPoints = adexpPoints.filter((point) => UK_COORDINATION_POINTS.has(point.id));
  const entry = ukPoints[0].id;
  const exit = ukPoints[ukPoints.length - 1].id;
  log(`ADEXP list:  UK entry is ${entry}, UK exit is ${exit}`);

  // Step 2: find the entry point in the route the airline filed, searching forwards.
  const entryPos = findForward(icaoRoute, entry);
  log(`Filed route: ${entry} found at position ${entryPos}`);

  // The fix of September 2023: never search back beyond the UK entry point.
  const stopAfter = build === 'fixed' ? entryPos : NOT_FOUND;

  // Step 3: find the exit point in the filed route, searching backwards from the end.
  let matched = exit;
  let exitPos = findBackward(icaoRoute, exit, stopAfter);
  log(`Filed route: ${exit} ${exitPos === NOT_FOUND ? 'not found' : `found at position ${exitPos}`}`);

  // Step 4: a filed route does not have to name the exit point. If it is missing,
  // try the next points beyond the UK exit, in the order of the ADEXP list.
  if (exitPos === NOT_FOUND) {
    const exitIndex = adexpPoints.findIndex((point) => point.id === exit);
    for (const candidate of adexpPoints.slice(exitIndex + 1)) {
      exitPos = findBackward(icaoRoute, candidate.id, stopAfter);
      log(`Filed route: ${candidate.id} ${exitPos === NOT_FOUND ? 'not found' : `found at position ${exitPos}`}`);
      if (exitPos !== NOT_FOUND) {
        matched = candidate.id;
        break;
      }
    }
  }

  if (exitPos === NOT_FOUND) {
    if (build === '2018') {
      return { kind: 'manual', reason: `no exit point after ${entry} found in filed route` };
    }
    throw new CriticalException(`no exit point after ${entry} found in filed route`);
  }

  // The 2018 build had a logic test here. It was lost in the 2021 rewrite.
  if (build === '2018' && exitPos < entryPos) {
    return { kind: 'manual', reason: `exit ${matched} lies before entry ${entry}` };
  }

  // Step 5: cut the UK portion out of the filed route.
  const ukRoute = icaoRoute.slice(entryPos, exitPos + 1);
  if (ukRoute.length === 0) {
    throw new CriticalException(
      `no valid UK portion between ${entry} (position ${entryPos}) and ${matched} (position ${exitPos})`,
    );
  }
  return { kind: 'processed', entry, exit: matched, ukRoute };
}
