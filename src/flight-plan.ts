// Parsers for the two parts of the ADEXP message that matter in this incident.
// Both data files are copied from the appendices of the NATS final report (pages 80-81).

import { readFileSync } from 'node:fs';

/** One line of the ADEXP waypoint list that IFPS adds to the flight plan. */
export interface RoutePoint {
  id: string;
  flightLevel: string;
  eto: string;
}

export interface FlightPlan {
  callsign: string;
  /** The route exactly as the airline filed it (ICAO4444), split into tokens. */
  icaoRoute: string[];
  /** The fuller waypoint list that IFPS derived from that route (ADEXP). */
  adexpPoints: RoutePoint[];
}

/** "-PT -PTID DVL -FL F390 -ETO 230828053820" becomes { id: 'DVL', ... } */
export function parseAdexpPoints(text: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /-PT\s+-PTID\s+(\S+)\s+-FL\s+(\S+)\s+-ETO\s+(\S+)/.exec(line);
    if (match) points.push({ id: match[1], flightLevel: match[2], eto: match[3] });
  }
  return points;
}

/** Splits the filed route into tokens and drops speed / level changes such as "DIK/N0495F390". */
export function parseIcaoRoute(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => token.split('/')[0]);
}

export function loadFbu37m(): FlightPlan {
  const read = (name: string) => readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8');
  return {
    callsign: 'FBU37M',
    icaoRoute: parseIcaoRoute(read('fbu37m.icao4444-route.txt')),
    adexpPoints: parseAdexpPoints(read('fbu37m.adexp-rtepts.txt')),
  };
}
