// Run with: node --test test/repro.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadFbu37m } from '../src/flight-plan.ts';
import { runSystem } from '../src/system.ts';
import { CriticalException, extractUkPortion } from '../src/uk-portion.ts';

const plan = loadFbu37m();
const ids = plan.adexpPoints.map((point) => point.id);

test('the data matches the appendices of the report', () => {
  assert.equal(ids.length, 53);
  assert.equal(ids[0], 'KLAX');
  assert.equal(ids.at(-1), 'LFPO');
  // DVL twice in the ADEXP list: Devil's Lake early, Deauville near the end.
  assert.deepEqual([ids.indexOf('DVL'), ids.lastIndexOf('DVL')], [9, 49]);
  // The filed route names DVL once and names neither SITET nor ETRAT.
  assert.equal(plan.icaoRoute.filter((token) => token === 'DVL').length, 1);
  assert.equal(plan.icaoRoute.includes('SITET'), false);
  assert.equal(plan.icaoRoute.includes('ETRAT'), false);
  assert.ok(plan.icaoRoute.indexOf('DVL') < plan.icaoRoute.indexOf('APSOV'));
});

test('2021 build: the duplicate name ends in a critical exception', () => {
  const steps: string[] = [];
  assert.throws(() => extractUkPortion(plan, '2021', (line) => steps.push(line)), CriticalException);
  // The search tried SITET, then ETRAT, then matched DVL.
  assert.match(steps.join('\n'), /SITET not found[\s\S]*ETRAT not found[\s\S]*DVL found/);
});

test('2018 build: the same plan goes to manual processing instead', () => {
  assert.equal(extractUkPortion(plan, '2018').kind, 'manual');
});

test('fixed build: the search stays beyond the entry point and the plan is processed', () => {
  const outcome = extractUkPortion(plan, 'fixed');
  assert.equal(outcome.kind, 'processed');
  if (outcome.kind === 'processed') {
    assert.equal(outcome.entry, 'APSOV');
    assert.equal(outcome.ukRoute[0], 'APSOV');
    assert.equal(outcome.ukRoute.includes('DVL'), false);
  }
});

test('the backup fails on the same plan, and restarts do not help', () => {
  const log: string[] = [];
  const result = runSystem([plan], '2021', 3, (line) => log.push(line));
  assert.equal(result.restarts, 3);
  assert.deepEqual(result.processed, []);
  assert.deepEqual(result.quarantined, ['FBU37M']);
  // Primary and backup each fail once per attempt: the first run plus three restarts.
  assert.equal(log.filter((line) => line.startsWith('primary: CRITICAL')).length, 4);
  assert.equal(log.filter((line) => line.startsWith('backup: CRITICAL')).length, 4);
});

test('with the fixed build the same queue runs through untouched', () => {
  const result = runSystem([plan], 'fixed', 0, () => {});
  assert.deepEqual(result.processed, ['FBU37M']);
  assert.deepEqual(result.quarantined, []);
});

test('missing exit point is reported explicitly instead of as position -1', () => {
  const noExitPlan = {
    callsign: 'NOEXIT1',
    icaoRoute: ['KESIX', 'DCT', 'APSOV', 'DCT', 'SOSIM'],
    adexpPoints: ['KESIX', 'APSOV', 'SOSIM', 'SITET', 'ETRAT'].map((id) => ({ id, flightLevel: 'F370', eto: '' })),
  };

  const legacy = extractUkPortion(noExitPlan, '2018');
  assert.equal(legacy.kind, 'manual');
  if (legacy.kind === 'manual') {
    assert.match(legacy.reason, /no exit point after APSOV/);
  }

  assert.throws(() => extractUkPortion(noExitPlan, '2021'), /no exit point after APSOV/);
  assert.throws(() => extractUkPortion(noExitPlan, 'fixed'), /no exit point after APSOV/);
});
