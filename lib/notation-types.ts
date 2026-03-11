export type Duration = "eighth" | "quarter" | "half";

export type Accidental = "sharp" | "flat" | "natural" | null;

export type Pitch =
  | "C4"
  | "D4"
  | "E4"
  | "F4"
  | "G4"
  | "A4"
  | "B4"
  | "C5"
  | "D5"
  | "E5"
  | "F5"
  | "G5"
  | "A5";

export interface NoteEvent {
  kind: "note";
  startCell: number;
  duration: Duration;
  pitch: Pitch;
  accidental: Accidental;
}

export interface RestEvent {
  kind: "rest";
  startCell: number;
  duration: Duration;
  rest: true;
}

export type NotationEvent = NoteEvent | RestEvent;

export interface MeasureAnswer {
  index: number;
  events: NotationEvent[];
}

export interface NotationAnswer {
  clef: "treble";
  timeSignature: "4/4";
  measures: MeasureAnswer[];
}
