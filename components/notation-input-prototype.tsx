"use client";

import { useState } from "react";

import type { FunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  type Accidental,
  type Duration,
  type MeasureAnswer,
  type NotationAnswer,
  type NotationEvent,
  type Pitch,
} from "@/lib/notation-types";

type PrototypeStep = "create" | "answer" | "review";

type EditorTool =
  | { kind: "note"; duration: Duration }
  | { kind: "rest"; duration: Duration };

type EditorEvent =
  | {
      id: string;
      measureIndex: number;
      startCell: number;
      duration: Duration;
      kind: "note";
      pitch: Pitch;
      accidental: Accidental;
    }
  | {
      id: string;
      measureIndex: number;
      startCell: number;
      duration: Duration;
      kind: "rest";
      rest: true;
    };

type CheckIssue = {
  kind: "missing" | "incorrect" | "extra";
  measureIndex: number;
  startCell: number;
  expected?: NotationEvent;
  actual?: NotationEvent;
};

type CheckResult = {
  isExact: boolean;
  matched: number;
  expected: number;
  issues: CheckIssue[];
};

type FeedbackDoc = {
  _id: string;
  _creationTime: number;
  author?: string;
  comment: string;
  createdAt: number;
};

type CreateFeedbackArgs = {
  author?: string;
  comment: string;
};

const feedbackApi = api as typeof api & {
  feedback: {
    list: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      FeedbackDoc[]
    >;
    create: FunctionReference<
      "mutation",
      "public",
      CreateFeedbackArgs,
      { id: string }
    >;
  };
};

const MEASURE_COUNT = 2;
const CELLS_PER_MEASURE = 8;
const DURATION_CELLS: Record<Duration, number> = {
  eighth: 1,
  quarter: 2,
  half: 4,
};
const DURATION_LABELS: Record<Duration, string> = {
  eighth: "Eighth",
  quarter: "Quarter",
  half: "Half",
};
const PITCHES: Pitch[] = [
  "C4",
  "D4",
  "E4",
  "F4",
  "G4",
  "A4",
  "B4",
  "C5",
  "D5",
  "E5",
  "F5",
  "G5",
  "A5",
];
const ACCIDENTAL_SYMBOLS: Record<Exclude<Accidental, null>, string> = {
  sharp: "#",
  flat: "b",
  natural: "♮",
};
const svgMetrics = {
  height: 136,
  staffLeft: 78,
  staffTopLineY: 48,
  lineGap: 12,
  stepY: 6,
  rightPadding: 14,
  topPadding: 12,
  clickAreaTop: 14,
  clickAreaHeight: 92,
  cellWidth: 34,
};

const defaultPrompt = "Notate this melody in treble clef, 4/4 time.";

const defaultQuestionAnswer: NotationAnswer = {
  clef: "treble",
  timeSignature: "4/4",
  measures: [
    {
      index: 0,
      events: [
        {
          kind: "note",
          startCell: 0,
          duration: "quarter",
          pitch: "G4",
          accidental: null,
        },
        {
          kind: "note",
          startCell: 2,
          duration: "quarter",
          pitch: "A4",
          accidental: null,
        },
        {
          kind: "note",
          startCell: 4,
          duration: "quarter",
          pitch: "B4",
          accidental: "flat",
        },
        { kind: "rest", startCell: 6, duration: "quarter", rest: true },
      ],
    },
    {
      index: 1,
      events: [
        {
          kind: "note",
          startCell: 0,
          duration: "half",
          pitch: "C5",
          accidental: null,
        },
        {
          kind: "note",
          startCell: 4,
          duration: "quarter",
          pitch: "B4",
          accidental: null,
        },
        {
          kind: "note",
          startCell: 6,
          duration: "quarter",
          pitch: "A4",
          accidental: null,
        },
      ],
    },
  ],
};

function createEventId(prefix: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function serializeEditorEvent(event: EditorEvent): NotationEvent {
  if (event.kind === "rest") {
    return {
      kind: "rest",
      startCell: event.startCell,
      duration: event.duration,
      rest: true,
    };
  }

  return {
    kind: "note",
    startCell: event.startCell,
    duration: event.duration,
    pitch: event.pitch,
    accidental: event.accidental,
  };
}

function buildAnswer(events: EditorEvent[]): NotationAnswer {
  const measures: MeasureAnswer[] = Array.from(
    { length: MEASURE_COUNT },
    (_, index) => ({
      index,
      events: events
        .filter((event) => event.measureIndex === index)
        .sort((left, right) => left.startCell - right.startCell)
        .map(serializeEditorEvent),
    }),
  );

  return {
    clef: "treble",
    timeSignature: "4/4",
    measures,
  };
}

function hydrateAnswer(answer: NotationAnswer, prefix: string) {
  return answer.measures.flatMap((measure) =>
    measure.events.map((event, eventIndex) => {
      const id = `${prefix}-${measure.index}-${event.startCell}-${eventIndex}`;

      if (event.kind === "rest") {
        return {
          id,
          measureIndex: measure.index,
          startCell: event.startCell,
          duration: event.duration,
          kind: "rest" as const,
          rest: true as const,
        };
      }

      return {
        id,
        measureIndex: measure.index,
        startCell: event.startCell,
        duration: event.duration,
        kind: "note" as const,
        pitch: event.pitch,
        accidental: event.accidental,
      };
    }),
  );
}

function getPitchY(pitch: Pitch) {
  const index = PITCHES.indexOf(pitch);
  const bottomLinePitchIndex = 2;
  const bottomLineY = svgMetrics.staffTopLineY + svgMetrics.lineGap * 4;

  return bottomLineY - (index - bottomLinePitchIndex) * svgMetrics.stepY;
}

function getClosestPitch(y: number) {
  let closestPitch = PITCHES[0];
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const pitch of PITCHES) {
    const distance = Math.abs(getPitchY(pitch) - y);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestPitch = pitch;
    }
  }

  return closestPitch;
}

function getLedgerLineYs(pitch: Pitch) {
  const index = PITCHES.indexOf(pitch);
  const ledgerLineYs: number[] = [];

  if (index < 2) {
    for (let current = 0; current <= index; current += 2) {
      ledgerLineYs.push(getPitchY(PITCHES[current]));
    }
  }

  if (index > 10) {
    for (let current = 12; current <= index; current += 2) {
      ledgerLineYs.push(getPitchY(PITCHES[current]));
    }
  }

  return ledgerLineYs;
}

function isOverlapping(
  events: EditorEvent[],
  measureIndex: number,
  startCell: number,
  duration: Duration,
) {
  const nextEnd = startCell + DURATION_CELLS[duration];

  return events.some((event) => {
    if (event.measureIndex !== measureIndex) {
      return false;
    }

    const eventEnd = event.startCell + DURATION_CELLS[event.duration];
    return startCell < eventEnd && nextEnd > event.startCell;
  });
}

function getEventX(event: EditorEvent) {
  const measureStart =
    svgMetrics.staffLeft +
    event.measureIndex * CELLS_PER_MEASURE * svgMetrics.cellWidth;
  const occupiedWidth = DURATION_CELLS[event.duration] * svgMetrics.cellWidth;

  return (
    measureStart + event.startCell * svgMetrics.cellWidth + occupiedWidth / 2
  );
}

function getToolLabel(tool: EditorTool) {
  return `${DURATION_LABELS[tool.duration]} ${tool.kind}`;
}

function describeEvent(event: NotationEvent) {
  if (event.kind === "rest") {
    return `${DURATION_LABELS[event.duration]} rest`;
  }

  const accidental = event.accidental
    ? ` ${ACCIDENTAL_SYMBOLS[event.accidental]}`
    : "";
  return `${DURATION_LABELS[event.duration]} ${event.pitch}${accidental}`;
}

function describeEditorEvent(event?: EditorEvent) {
  if (!event) {
    return "Nothing selected";
  }

  return describeEvent(serializeEditorEvent(event));
}

function summarizeAnswer(answer: NotationAnswer) {
  return answer.measures
    .map((measure) => {
      const content = measure.events.map(describeEvent).join(", ") || "empty";
      return `M${measure.index + 1}: ${content}`;
    })
    .join(" | ");
}

function areEventsEqual(left: NotationEvent, right: NotationEvent) {
  if (
    left.kind !== right.kind ||
    left.startCell !== right.startCell ||
    left.duration !== right.duration
  ) {
    return false;
  }

  if (left.kind === "rest" && right.kind === "rest") {
    return true;
  }

  if (left.kind === "note" && right.kind === "note") {
    return left.pitch === right.pitch && left.accidental === right.accidental;
  }

  return false;
}

function compareAnswers(
  expected: NotationAnswer,
  actual: NotationAnswer,
): CheckResult {
  const expectedEvents = expected.measures.flatMap((measure) =>
    measure.events.map((event) => ({ event, measureIndex: measure.index })),
  );
  const actualEvents = actual.measures.flatMap((measure) =>
    measure.events.map((event) => ({ event, measureIndex: measure.index })),
  );

  const issues: CheckIssue[] = [];
  const actualMap = new Map<string, NotationEvent>(
    actualEvents.map(
      ({ event, measureIndex }) =>
        [`${measureIndex}-${event.startCell}`, event] as const,
    ),
  );
  let matched = 0;

  for (const { event, measureIndex } of expectedEvents) {
    const key = `${measureIndex}-${event.startCell}`;
    const actualEvent = actualMap.get(key);

    if (!actualEvent) {
      issues.push({
        kind: "missing",
        measureIndex,
        startCell: event.startCell,
        expected: event,
      });
      continue;
    }

    if (areEventsEqual(event, actualEvent)) {
      matched += 1;
    } else {
      issues.push({
        kind: "incorrect",
        measureIndex,
        startCell: event.startCell,
        expected: event,
        actual: actualEvent,
      });
    }
  }

  for (const { event, measureIndex } of actualEvents) {
    const expectedEvent = expected.measures[measureIndex]?.events.find(
      (candidate) => candidate.startCell === event.startCell,
    );

    if (!expectedEvent) {
      issues.push({
        kind: "extra",
        measureIndex,
        startCell: event.startCell,
        actual: event,
      });
    }
  }

  return {
    isExact: issues.length === 0 && matched === expectedEvents.length,
    matched,
    expected: expectedEvents.length,
    issues,
  };
}

function getIssueMessage(issue: CheckIssue) {
  if (issue.kind === "missing" && issue.expected) {
    return `Measure ${issue.measureIndex + 1}, slot ${issue.startCell + 1}: missing ${describeEvent(issue.expected)}.`;
  }

  if (issue.kind === "incorrect" && issue.expected && issue.actual) {
    return `Measure ${issue.measureIndex + 1}, slot ${issue.startCell + 1}: expected ${describeEvent(issue.expected)}, got ${describeEvent(issue.actual)}.`;
  }

  if (issue.kind === "extra" && issue.actual) {
    return `Measure ${issue.measureIndex + 1}, slot ${issue.startCell + 1}: extra ${describeEvent(issue.actual)}.`;
  }

  return "Difference detected.";
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function NoteGlyph({
  event,
  selected,
}: {
  event: Extract<EditorEvent, { kind: "note" }>;
  selected: boolean;
}) {
  const x = getEventX(event);
  const y = getPitchY(event.pitch);
  const durationCells = DURATION_CELLS[event.duration];
  const occupiedWidth = durationCells * svgMetrics.cellWidth;
  const stemUp = PITCHES.indexOf(event.pitch) < 6;
  const stemX = stemUp ? x + 6 : x - 6;
  const stemTopY = stemUp ? y - 26 : y + 4;
  const stemBottomY = stemUp ? y - 4 : y + 26;

  return (
    <g>
      {selected ? (
        <rect
          x={x - occupiedWidth / 2 + 4}
          y={y - 18}
          width={occupiedWidth - 8}
          height={36}
          rx={12}
          fill="rgba(15, 23, 42, 0.08)"
          stroke="rgba(15, 23, 42, 0.12)"
        />
      ) : null}
      {getLedgerLineYs(event.pitch).map((ledgerY) => (
        <line
          key={`${event.id}-${ledgerY}`}
          x1={x - 12}
          y1={ledgerY}
          x2={x + 12}
          y2={ledgerY}
          stroke="#172033"
          strokeWidth="1.3"
        />
      ))}
      {event.accidental ? (
        <text
          x={x - 17}
          y={y + 4}
          fontSize="16"
          fill="#172033"
          textAnchor="middle"
        >
          {ACCIDENTAL_SYMBOLS[event.accidental]}
        </text>
      ) : null}
      <ellipse
        cx={x}
        cy={y}
        rx="7.2"
        ry="5.2"
        fill={event.duration === "half" ? "#f8fafc" : "#172033"}
        stroke="#172033"
        strokeWidth="1.6"
        transform={`rotate(-18 ${x} ${y})`}
      />
      <line
        x1={stemX}
        y1={y}
        x2={stemX}
        y2={stemUp ? stemTopY : stemBottomY}
        stroke="#172033"
        strokeWidth="1.6"
      />
      {event.duration === "eighth" ? (
        <path
          d={
            stemUp
              ? `M ${stemX} ${stemTopY} C ${stemX + 12} ${stemTopY + 2}, ${stemX + 12} ${stemTopY + 12}, ${stemX + 4} ${stemTopY + 16}`
              : `M ${stemX} ${stemBottomY} C ${stemX - 12} ${stemBottomY - 2}, ${stemX - 12} ${stemBottomY - 12}, ${stemX - 4} ${stemBottomY - 16}`
          }
          fill="none"
          stroke="#172033"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : null}
    </g>
  );
}

function RestGlyph({
  event,
  selected,
}: {
  event: Extract<EditorEvent, { kind: "rest" }>;
  selected: boolean;
}) {
  const x = getEventX(event);
  const durationCells = DURATION_CELLS[event.duration];
  const occupiedWidth = durationCells * svgMetrics.cellWidth;
  const middleLineY = svgMetrics.staffTopLineY + svgMetrics.lineGap * 2;

  return (
    <g>
      {selected ? (
        <rect
          x={x - occupiedWidth / 2 + 4}
          y={middleLineY - 20}
          width={occupiedWidth - 8}
          height={40}
          rx={12}
          fill="rgba(15, 23, 42, 0.08)"
          stroke="rgba(15, 23, 42, 0.12)"
        />
      ) : null}
      {event.duration === "half" ? (
        <rect
          x={x - 10}
          y={middleLineY}
          width={20}
          height={5}
          rx={2}
          fill="#172033"
        />
      ) : null}
      {event.duration === "quarter" ? (
        <path
          d={`M ${x - 3} ${middleLineY - 17} L ${x + 6} ${middleLineY - 6} L ${x - 1} ${middleLineY + 2} L ${x + 7} ${middleLineY + 11}`}
          fill="none"
          stroke="#172033"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {event.duration === "eighth" ? (
        <>
          <path
            d={`M ${x - 1} ${middleLineY - 15} C ${x + 9} ${middleLineY - 11}, ${x + 5} ${middleLineY + 1}, ${x - 2} ${middleLineY + 7}`}
            fill="none"
            stroke="#172033"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx={x + 4} cy={middleLineY - 5} r="3" fill="#172033" />
        </>
      ) : null}
    </g>
  );
}

function NotationEditor({
  title,
  description,
  events,
  onChange,
  idPrefix,
}: {
  title: string;
  description: string;
  events: EditorEvent[];
  onChange: (nextEvents: EditorEvent[]) => void;
  idPrefix: string;
}) {
  const [tool, setTool] = useState<EditorTool>({
    kind: "note",
    duration: "quarter",
  });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "Select a duration, then click into the staff.",
  );
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const staffWidth =
    svgMetrics.staffLeft +
    MEASURE_COUNT * CELLS_PER_MEASURE * svgMetrics.cellWidth +
    svgMetrics.rightPadding;

  function placeEvent(measureIndex: number, startCell: number, y: number) {
    if (startCell + DURATION_CELLS[tool.duration] > CELLS_PER_MEASURE) {
      setStatusMessage("That event would run past the end of the measure.");
      return;
    }

    if (isOverlapping(events, measureIndex, startCell, tool.duration)) {
      setStatusMessage("That rhythmic space is already occupied.");
      return;
    }

    const nextId = createEventId(idPrefix);
    const nextEvent: EditorEvent =
      tool.kind === "rest"
        ? {
            id: nextId,
            measureIndex,
            startCell,
            duration: tool.duration,
            kind: "rest",
            rest: true,
          }
        : {
            id: nextId,
            measureIndex,
            startCell,
            duration: tool.duration,
            kind: "note",
            pitch: getClosestPitch(y),
            accidental: null,
          };

    onChange(
      [...events, nextEvent].sort((left, right) => {
        if (left.measureIndex !== right.measureIndex) {
          return left.measureIndex - right.measureIndex;
        }

        return left.startCell - right.startCell;
      }),
    );
    setSelectedEventId(nextId);
    setStatusMessage(
      tool.kind === "rest"
        ? `${DURATION_LABELS[tool.duration]} rest placed.`
        : `${DURATION_LABELS[tool.duration]} note placed.`,
    );
  }

  function applyAccidental(accidental: Exclude<Accidental, null>) {
    if (!selectedEvent || selectedEvent.kind !== "note") {
      setStatusMessage("Select a note before applying an accidental.");
      return;
    }

    onChange(
      events.map((event) => {
        if (event.id !== selectedEventId || event.kind !== "note") {
          return event;
        }

        return {
          ...event,
          accidental,
        };
      }),
    );
    setStatusMessage(`${ACCIDENTAL_SYMBOLS[accidental]} applied.`);
  }

  function clearSelectedAccidental() {
    if (!selectedEvent || selectedEvent.kind !== "note") {
      setStatusMessage("Select a note before clearing an accidental.");
      return;
    }

    onChange(
      events.map((event) => {
        if (event.id !== selectedEventId || event.kind !== "note") {
          return event;
        }

        return {
          ...event,
          accidental: null,
        };
      }),
    );
    setStatusMessage("Accidental cleared.");
  }

  function deleteSelectedEvent() {
    if (!selectedEventId) {
      setStatusMessage("Select a note or rest before deleting.");
      return;
    }

    onChange(events.filter((event) => event.id !== selectedEventId));
    setSelectedEventId(null);
    setStatusMessage("Selected event deleted.");
  }

  function clearAll() {
    onChange([]);
    setSelectedEventId(null);
    setStatusMessage("Notation cleared.");
  }

  return (
    <Card
      className="prototype-editor flex min-h-0 flex-1 border border-slate-200 bg-white shadow-none"
      size="sm"
    >
      <CardHeader className="gap-1.5 border-b border-slate-200">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Badge variant="outline">{events.length} events</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="prototype-toolbar flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap gap-2">
            {(["note", "rest"] as const).map((kind) => (
              <Button
                key={kind}
                variant={tool.kind === kind ? "default" : "outline"}
                size="sm"
                onClick={() => setTool({ kind, duration: tool.duration })}
              >
                {kind === "note" ? "Note" : "Rest"}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(["eighth", "quarter", "half"] as const).map((duration) => (
              <Button
                key={duration}
                variant={tool.duration === duration ? "default" : "outline"}
                size="sm"
                onClick={() => setTool({ kind: tool.kind, duration })}
              >
                {DURATION_LABELS[duration]}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(["sharp", "flat", "natural"] as const).map((accidental) => (
              <Button
                key={accidental}
                variant="outline"
                size="sm"
                disabled={!selectedEvent || selectedEvent.kind !== "note"}
                onClick={() => applyAccidental(accidental)}
              >
                {ACCIDENTAL_SYMBOLS[accidental]}
              </Button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedEvent || selectedEvent.kind !== "note"}
              onClick={clearSelectedAccidental}
            >
              Clear accidental
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedEvent}
              onClick={deleteSelectedEvent}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={events.length === 0}
              onClick={clearAll}
            >
              Clear
            </Button>
          </div>
        </div>

          <svg
            viewBox={`0 0 ${staffWidth} ${svgMetrics.height}`}
            className="h-auto w-full"
            role="img"
            aria-label={title}
          >
            <rect
              x="0"
              y={svgMetrics.topPadding}
              width={staffWidth}
              height={svgMetrics.height - svgMetrics.topPadding - 20}
              rx="20"
              fill="#ffffff"
              stroke="#dbe3ef"
            />

            <text x="24" y="76" fontSize="40" fill="#172033">
              &#119070;
            </text>
            <text x="58" y="64" fontSize="16" fill="#172033" fontWeight="600">
              4
            </text>
            <text x="58" y="86" fontSize="16" fill="#172033" fontWeight="600">
              4
            </text>

            {Array.from({ length: 5 }, (_, lineIndex) => {
              const y =
                svgMetrics.staffTopLineY + lineIndex * svgMetrics.lineGap;
              return (
                <line
                  key={`staff-line-${lineIndex}`}
                  x1={svgMetrics.staffLeft}
                  y1={y}
                  x2={staffWidth - svgMetrics.rightPadding}
                  y2={y}
                  stroke="#172033"
                  strokeWidth="1.4"
                />
              );
            })}

            {Array.from({ length: MEASURE_COUNT + 1 }, (_, measureBoundary) => {
              const x =
                svgMetrics.staffLeft +
                measureBoundary * CELLS_PER_MEASURE * svgMetrics.cellWidth;
              return (
                <line
                  key={`barline-${measureBoundary}`}
                  x1={x}
                  y1={svgMetrics.staffTopLineY}
                  x2={x}
                  y2={svgMetrics.staffTopLineY + svgMetrics.lineGap * 4}
                  stroke="#172033"
                  strokeWidth={
                    measureBoundary === MEASURE_COUNT ? "2.2" : "1.8"
                  }
                />
              );
            })}

            {Array.from({ length: MEASURE_COUNT }, (_, measureIndex) =>
              Array.from({ length: CELLS_PER_MEASURE }, (_, cellIndex) => {
                const x =
                  svgMetrics.staffLeft +
                  measureIndex * CELLS_PER_MEASURE * svgMetrics.cellWidth +
                  cellIndex * svgMetrics.cellWidth;
                const isDownbeat = cellIndex % 2 === 0;

                return (
                  <g key={`cell-${measureIndex}-${cellIndex}`}>
                    <line
                      x1={x}
                      y1={svgMetrics.staffTopLineY - 10}
                      x2={x}
                      y2={
                        svgMetrics.staffTopLineY + svgMetrics.lineGap * 4 + 10
                      }
                      stroke={
                        isDownbeat
                          ? "rgba(71,85,105,0.11)"
                          : "rgba(71,85,105,0.05)"
                      }
                      strokeWidth="1"
                      strokeDasharray={isDownbeat ? undefined : "3 4"}
                    />
                    <rect
                      x={x}
                      y={svgMetrics.clickAreaTop}
                      width={svgMetrics.cellWidth}
                      height={svgMetrics.clickAreaHeight}
                      fill="transparent"
                      className="cursor-crosshair"
                      onClick={(clickEvent) => {
                        const svg = clickEvent.currentTarget.ownerSVGElement;
                        if (!svg) {
                          return;
                        }

                        const bounds = svg.getBoundingClientRect();
                        const scaleY =
                          svg.viewBox.baseVal.height / bounds.height;
                        const clickY =
                          (clickEvent.clientY - bounds.top) * scaleY;

                        placeEvent(measureIndex, cellIndex, clickY);
                      }}
                    />
                  </g>
                );
              }),
            )}

            {events.map((event) => (
              <g
                key={event.id}
                className="cursor-pointer"
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  setSelectedEventId(event.id);
                  setStatusMessage(
                    event.kind === "note"
                      ? `${DURATION_LABELS[event.duration]} note selected.`
                      : `${DURATION_LABELS[event.duration]} rest selected.`,
                  );
                }}
              >
                {event.kind === "note" ? (
                  <NoteGlyph
                    event={event}
                    selected={selectedEventId === event.id}
                  />
                ) : (
                  <RestGlyph
                    event={event}
                    selected={selectedEventId === event.id}
                  />
                )}
              </g>
            ))}
          </svg>
      </CardContent>

      <CardFooter className="border-t border-slate-200 text-xs text-slate-600">
        <div className="prototype-status flex w-full flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium text-slate-900">
            Active: {getToolLabel(tool)}
          </span>
          <span>Selected: {describeEditorEvent(selectedEvent)}</span>
          <span className="text-slate-500">{statusMessage}</span>
        </div>
      </CardFooter>
    </Card>
  );
}

function FeedbackSheetOnline({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const entries = useQuery(feedbackApi.feedback.list, {}) ?? [];
  const createFeedback = useMutation(feedbackApi.feedback.create);
  const [activeTab, setActiveTab] = useState("leave");
  const [author, setAuthor] = useState("");
  const [comment, setComment] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!comment.trim()) {
      setStatusMessage("Add a short note before saving.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("");

    try {
      await createFeedback({
        author: author.trim() || undefined,
        comment: comment.trim(),
      });
      setComment("");
      setAuthor("");
      setStatusMessage("Feedback saved.");
      setActiveTab("view");
    } catch {
      setStatusMessage("Saving feedback failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-[calc(100dvh-1rem)] w-[min(400px,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_22px_80px_-40px_rgba(15,23,42,0.45)] sm:max-w-[400px]"
      >
        <SheetHeader className="gap-1 border-b border-slate-200 px-5 py-4">
          <SheetTitle>Feedback</SheetTitle>
          <SheetDescription>
            Leave a quick note without extra fields.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="min-h-0 flex-1 gap-3"
          >
            <TabsList>
              <TabsTrigger value="leave">Leave feedback</TabsTrigger>
              <TabsTrigger value="view">View feedback</TabsTrigger>
            </TabsList>

            <TabsContent value="leave" className="mt-0 min-h-0 flex-1">
              <Card
                size="sm"
                className="flex h-full border border-slate-200 bg-slate-50/70 shadow-none"
              >
                <CardContent className="flex flex-1 flex-col justify-center gap-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="feedback-author">Name</Label>
                    <Input
                      id="feedback-author"
                      value={author}
                      onChange={(event) => setAuthor(event.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="feedback-comment">Feedback</Label>
                    <Textarea
                      id="feedback-comment"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="What should change?"
                      className="min-h-28 resize-none bg-white"
                    />
                  </div>

                  <p className="min-h-5 text-sm text-slate-600">
                    {statusMessage}
                  </p>
                </CardContent>
                <CardFooter className="border-t border-slate-200">
                  <Button
                    size="sm"
                    disabled={isSubmitting}
                    onClick={handleSubmit}
                  >
                    {isSubmitting ? "Saving..." : "Save feedback"}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="view" className="mt-0 min-h-0 flex-1">
              <Card
                size="sm"
                className="flex h-full border border-slate-200 shadow-none"
              >
                <CardHeader className="gap-1.5 border-b border-slate-200">
                  <CardTitle>Saved feedback</CardTitle>
                  <CardDescription>
                    {entries.length} entries from this deployment
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 pt-4">
                  <ScrollArea className="h-full rounded-xl border border-slate-200 bg-slate-50">
                    <div className="space-y-3 p-3">
                      {entries.length ? (
                        entries.map((entry) => (
                          <Card
                            key={entry._id}
                            size="sm"
                            className="border border-slate-200 bg-white shadow-none"
                          >
                            <CardHeader>
                              <CardTitle className="text-sm">
                                {entry.author || "Anonymous tester"}
                              </CardTitle>
                              <CardDescription>
                                {formatTimestamp(
                                  entry.createdAt || entry._creationTime,
                                )}
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm leading-6 text-slate-700">
                                {entry.comment}
                              </p>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <div className="rounded-xl bg-white p-4 text-sm text-slate-600">
                          No feedback yet.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FeedbackSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <FeedbackSheetOnline open={open} onOpenChange={onOpenChange} />;
}

export function NotationInputPrototype() {
  const [step, setStep] = useState<PrototypeStep>("create");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [questionPrompt, setQuestionPrompt] = useState(defaultPrompt);
  const [questionEvents, setQuestionEvents] = useState<EditorEvent[]>(() =>
    hydrateAnswer(defaultQuestionAnswer, "question"),
  );
  const [learnerEvents, setLearnerEvents] = useState<EditorEvent[]>([]);
  const [reviewResult, setReviewResult] = useState<CheckResult | null>(null);

  const questionAnswer = buildAnswer(questionEvents);
  const learnerAnswer = buildAnswer(learnerEvents);
  function runCheck() {
    const result = compareAnswers(questionAnswer, learnerAnswer);
    setReviewResult(result);
    setStep("review");
  }

  function restoreDemoQuestion() {
    setQuestionPrompt(defaultPrompt);
    setQuestionEvents(hydrateAnswer(defaultQuestionAnswer, "question"));
    setLearnerEvents([]);
    setReviewResult(null);
    setStep("create");
  }

  return (
    <>
      <section className="prototype-shell flex h-[min(calc(100dvh-1.5rem),48rem)] flex-col gap-3 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/95 p-4 shadow-[0_30px_120px_-58px_rgba(15,23,42,0.5)] backdrop-blur sm:gap-4 sm:p-5">
        <header className="prototype-shell-header flex flex-wrap items-start justify-between gap-2.5">
          <div className="space-y-1">
            <h1 className="prototype-shell-title text-2xl font-semibold tracking-tight text-slate-950">
              Notation input prototype
            </h1>
            <p className="text-sm text-slate-600">
              Create a question, answer it, check it, then leave feedback.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setFeedbackOpen(true)}
          >
            Feedback
          </Button>
        </header>

        <Tabs
          value={step}
          onValueChange={(value) => setStep(value as PrototypeStep)}
          className="min-h-0 flex-1 gap-3"
        >
          <TabsList>
            <TabsTrigger value="create">1. Create Question</TabsTrigger>
            <TabsTrigger value="answer">2. Answer Question</TabsTrigger>
            <TabsTrigger value="review">3. Check Answer</TabsTrigger>
          </TabsList>

          <TabsContent
            value="create"
            className="prototype-workspace mt-0 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden"
          >
            <Card
              size="sm"
              className="prototype-brief border border-slate-200 bg-slate-50/80 shadow-none"
            >
              <CardHeader className="gap-1.5">
                <CardTitle>Question prompt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label htmlFor="question-prompt" className="sr-only">
                  Question prompt
                </Label>
                <Textarea
                  id="question-prompt"
                  value={questionPrompt}
                  onChange={(event) => setQuestionPrompt(event.target.value)}
                  className="min-h-16 bg-white"
                />
                <p className="text-sm text-slate-600">
                  Build the correct answer below, then continue.
                </p>
              </CardContent>
              <CardFooter className="border-t border-slate-200">
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={restoreDemoQuestion}
                  >
                    Restore demo
                  </Button>
                  <Button size="sm" onClick={() => setStep("answer")}>
                    Continue
                  </Button>
                </div>
              </CardFooter>
            </Card>

            <NotationEditor
              title="Correct answer"
              description="Place the notation the learner should reproduce."
              events={questionEvents}
              onChange={setQuestionEvents}
              idPrefix="question"
            />
          </TabsContent>

          <TabsContent
            value="answer"
            className="prototype-workspace mt-0 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden"
          >
            <Card
              size="sm"
              className="prototype-brief flex border border-slate-200 bg-slate-50/80 shadow-none"
            >
              <CardHeader className="gap-1.5">
                <CardTitle>{questionPrompt}</CardTitle>
                <CardDescription>
                  Answer it the way a learner would.
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto border-t border-slate-200">
                <div className="flex w-full flex-wrap justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("create")}
                  >
                    Back
                  </Button>
                  <Button size="sm" onClick={runCheck}>
                    Check answer
                  </Button>
                </div>
              </CardFooter>
            </Card>

            <NotationEditor
              title="Learner answer"
              description="Enter the response on the staff."
              events={learnerEvents}
              onChange={setLearnerEvents}
              idPrefix="learner"
            />
          </TabsContent>

          <TabsContent
            value="review"
            className="mt-0 min-h-0 flex-1 overflow-hidden"
          >
            <Card
              className="flex h-full min-h-0 border border-slate-200 shadow-none"
              size="sm"
            >
              <CardHeader className="gap-1.5 border-b border-slate-200">
                <CardTitle>
                  {reviewResult?.isExact
                    ? "The answer matches."
                    : "Review the result."}
                </CardTitle>
                <CardDescription>
                  {reviewResult
                    ? `${reviewResult.matched} of ${reviewResult.expected} expected events matched.`
                    : "Run Check answer from the previous step."}
                </CardDescription>
              </CardHeader>

              <CardContent className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <p className="text-sm font-medium text-slate-900">
                      Question key
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {summarizeAnswer(questionAnswer)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <p className="text-sm font-medium text-slate-900">
                      Learner answer
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {summarizeAnswer(learnerAnswer)}
                    </p>
                  </div>
                </div>

                <ScrollArea className="rounded-xl border border-slate-200 bg-slate-50">
                  <div className="space-y-3 p-3">
                    {reviewResult?.issues.length ? (
                      reviewResult.issues.map((issue, index) => (
                        <div
                          key={`${issue.kind}-${index}`}
                          className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700"
                        >
                          {getIssueMessage(issue)}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
                        No issues found. The learner answer matches the correct
                        answer.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>

              <CardFooter className="border-t border-slate-200">
                <div className="flex w-full flex-wrap justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("answer")}
                  >
                    Back to answer
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFeedbackOpen(true)}
                    >
                      Leave feedback
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={restoreDemoQuestion}
                    >
                      Reset demo
                    </Button>
                  </div>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      <FeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
