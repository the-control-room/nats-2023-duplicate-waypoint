// Run with: node src/main.ts

import { loadFbu37m } from './flight-plan.ts';
import type { FlightPlan } from './flight-plan.ts';
import { runSystem } from './system.ts';
import { CriticalException, extractUkPortion } from './uk-portion.ts';

const print = (line = '') => console.log(line);
const indent = (line: string) => print(`  ${line}`);
const heading = (title: string) => print(`\n=== ${title} ===`);

const fbu37m = loadFbu37m();

heading('The flight plan (NATS final report, appendices 1 and 2)');
indent(`Flight ${fbu37m.callsign}, Los Angeles to Paris Orly`);
indent(`Filed route:  ${fbu37m.icaoRoute.length} tokens, DVL appears ${count(fbu37m.icaoRoute, 'DVL')} time(s)`);
const ids = fbu37m.adexpPoints.map((point) => point.id);
indent(`ADEXP list:   ${ids.length} points, DVL appears ${count(ids, 'DVL')} time(s)`);
indent(`  DVL at point ${ids.indexOf('DVL') + 1}: Devil's Lake, North Dakota`);
indent(`  DVL at point ${ids.lastIndexOf('DVL') + 1}: Deauville, France`);

heading('2021 build: the software that was live on 28 August 2023');
try {
  extractUkPortion(fbu37m, '2021', indent);
} catch (error) {
  if (!(error instanceof CriticalException)) throw error;
  indent(`CRITICAL EXCEPTION: ${error.message}`);
}

heading('The whole system: primary, backup and the queue in front of them');
// RECONSTRUCTION: two ordinary plans around the real one, so the queue has something to hold up.
const ordinary = (callsign: string): FlightPlan => ({
  callsign,
  icaoRoute: ['KESIX', 'DCT', 'APSOV', 'DCT', 'SOSIM', 'L15', 'KEPAD', 'DCT', 'SITET'],
  adexpPoints: ['KESIX', 'APSOV', 'SOSIM', 'KEPAD', 'SITET', 'ETRAT'].map((id) => ({ id, flightLevel: 'F370', eto: '' })),
});
const queue = [ordinary('TEST001'), fbu37m, ordinary('TEST002')];
const result = runSystem(queue, '2021', 2, indent);
indent(`processed: ${result.processed.join(', ')}; set aside: ${result.quarantined.join(', ')}`);

heading('2018 build: the logic test that the 2021 rewrite lost');
const earlier = extractUkPortion(fbu37m, '2018', indent);
indent(earlier.kind === 'manual' ? `Sent to manual processing: ${earlier.reason}` : 'processed');

heading('Fixed build: the search may not go back beyond the UK entry point');
const fixed = extractUkPortion(fbu37m, 'fixed', indent);
if (fixed.kind === 'processed') {
  indent(`UK portion: ${fixed.ukRoute.join(' ')}`);
}

function count(items: string[], id: string): number {
  return items.filter((item) => item === id).length;
}
