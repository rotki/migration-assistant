/** How a value map edits a field: `type` picks a rotki event type per value; `rename` replaces values with free text. */
export const ValueMapMode = {
  type: 'type',
  rename: 'rename',
} as const;

export type ValueMapMode = (typeof ValueMapMode)[keyof typeof ValueMapMode];

/** A sample value next to how the converter reads it. */
export interface SampleReading {
  /** The value as the file writes it. */
  raw: string;
  /** What the converter makes of it; `undefined` when it cannot read it. */
  read: string | undefined;
}
