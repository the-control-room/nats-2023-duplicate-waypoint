# The duplicate waypoint that stopped UK flight planning

On 28 August 2023 a single, perfectly valid flight plan stopped the automatic
flight plan processing of NATS, the UK's air traffic service. The primary system
and its backup both went into maintenance mode in under 20 seconds.

This repository reproduces the bug with the real flight plan data that NATS
published in its investigation report.

The video that walks through the search step by step:
https://www.youtube.com/watch?v=j2lSP_9h4Is

## Run it

Needs Node.js 23.6 or newer. There are no dependencies.

```bash
node src/main.ts
```

```bash
node --test test/repro.test.ts
```

## What you will see

1. The flight plan of flight FBU37M, Los Angeles to Paris Orly. The waypoint
   list contains the name `DVL` twice: Devil's Lake in North Dakota and
   Deauville in France.
2. The 2021 build looks for the point where the flight leaves UK airspace. It
   tries `SITET`, then `ETRAT`, then `DVL`, and matches the wrong `DVL`: the one
   the aircraft passed hours before it reached the UK. The exit now lies before
   the entry, no UK portion can be cut out, and the software raises a critical
   exception.
3. The backup runs the same software on the same plan and fails the same way.
   The queue in front of them resends the unacknowledged plan after every
   restart, so restarting does not help.
4. The 2018 build sends the same plan to manual processing instead.
5. The fixed build never searches back beyond the UK entry point and processes
   the plan.

## How this maps to the report

| Step in the code | Source |
| --- | --- |
| Route and waypoint data in `data/` | NATS final report, appendices 1 and 2, pages 80-81 |
| Search order in `src/uk-portion.ts` | NATS final report, page 69 |
| Fail-safe stop and the uninformative log entry | NATS final report, pages 12 and 69 |
| Backup failing on the same plan | NATS final report, pages 69-70 |
| Queue resending the unacknowledged plan | NATS final report, pages 28-29 |
| The 2018 logic test lost in the 2021 rewrite | NATS final report, appendix 4, pages 83-84 |
| The fix: no search beyond the UK entry point | NATS final report, page 77 |

## What is real and what is reconstructed

Real, copied from the report:

- the filed route and the 53-line waypoint list of flight FBU37M
- the order in which the software searched, and the points it tried

Reconstructed, because the real source code is not public:

- every name, type and function in `src/`
- how the software knows which points are UK entry and exit points; here it is
  a fixed set containing `APSOV` and `SITET`
- the exact statement that raised the exception; the report says only that no
  valid UK portion could be extracted
- the result of the fixed build; the report describes the fix but not what the
  software selects afterwards
- the two `TEST` flight plans and the number of restart attempts in the system
  run

## What this does not claim

- UK airspace did not close. Automatic flight plan processing stopped, plans
  were entered by hand, and traffic was restricted.
- The flight plan was not faulty and the airline did nothing wrong.
- A duplicate name alone is not enough. The report lists several conditions
  that had to occur together.

## Sources

- NATS, Major Incident Investigation Final Report, FPRSA-R Sub-system Incident
  28th August 2023: https://www.caa.co.uk/publication/download/23340
- CAA, CAP2993, Independent Review of NATS (En Route) Plc's Flight Planning
  System Failure on 28 August 2023, Final report:
  https://www.caa.co.uk/publication/download/23337

## Corrections

If a step looks wrong, open an issue and point to the page of the report.

## License

The code in `src/` and `test/` is released under the MIT License, see
`LICENSE`. The two files in `data/` are copied from the appendices of the NATS
report and are not covered by that license; they remain the work of their
publisher and are included here so that the reproduction runs on the published
flight plan.
