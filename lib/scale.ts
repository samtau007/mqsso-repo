// The Mohasaba ruler. 0 is Ghaflah (resting, never selected). 1–7 are the only answers. 8–10 are the horizon.

export type Answer = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const RUNGS: { n: number; word: string; meaning: string }[] = [
  { n: 0, word: "Ghaflah", meaning: "Heedless. This is not on my radar yet." },
  { n: 1, word: "Aware", meaning: "Awake to it now, but not yet acting." },
  { n: 2, word: "Rarely", meaning: "I manage it only seldom." },
  { n: 3, word: "Occasionally", meaning: "On and off, with no steady pattern yet." },
  { n: 4, word: "Striving", meaning: "Actively working at it, though it is not natural yet." },
  { n: 5, word: "Frequently", meaning: "Often. It is becoming a regular part of me." },
  { n: 6, word: "Mostly", meaning: "My default now. Slips are the exception." },
  { n: 7, word: "Consistent", meaning: "Steadfast and settled, without struggle." },
];

export const RULER_MAX = 10;
export const ANSWER_MIN = 1;
export const ANSWER_MAX = 7;

export function isAnswer(v: unknown): v is Answer {
  return Number.isInteger(v) && (v as number) >= ANSWER_MIN && (v as number) <= ANSWER_MAX;
}

/** Overall Muslim Quotient as a range. Never a single number, never a rank. */
export function muslimQuotientRange(answers: Answer[]): { low: number; high: number } {
  const avg = answers.reduce((s, a) => s + a, 0) / answers.length;
  let low = Math.floor(avg);
  let high = Math.ceil(avg);
  if (low === high) {
    if (high < ANSWER_MAX) high += 1;
    else low -= 1;
  }
  return { low, high };
}
