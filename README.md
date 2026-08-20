# Notation Input

A browser prototype for answering music questions directly on a staff instead of typing note names into a text box.

[Open the prototype](https://notation.experiments.kigo.ke)

## The experiment

The prototype has three steps. First, an author builds a two-measure answer in treble clef and 4/4 time. A learner then places notes or rests on the staff. The review compares both versions and marks missing, incorrect, and extra events.

The editor currently supports:

- eighth, quarter, and half notes or rests
- pitches from C4 through A5
- sharps, flats, and naturals
- drag and click placement on an SVG staff
- exact checking by measure, start position, duration, pitch, and accidental
- a small Convex-backed feedback panel for comments on the interaction

This is deliberately narrow. It does not handle other clefs, time signatures, tuplets, ties, playback, or MusicXML.

## Run it locally

You need Bun and a Convex deployment.

```bash
bun install
bunx convex dev
bun run dev
```

Convex writes `NEXT_PUBLIC_CONVEX_URL` to the local environment file during setup.

## Checks

```bash
bun run lint
bun run typecheck
```

The package still has a `test` script, but the test files it points at are missing from the current repository. Fix that stale script before treating `bun run check` as a working validation command.
