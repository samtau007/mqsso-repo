import { randomInt } from "node:crypto";

// Given names: a quiet word and a thing from the natural world, for example "Quiet Cedar".
// Chosen so that no pair reads as a judgement, a level or a comparison.

export const FIRST = [
  "Quiet", "Gentle", "Steady", "Patient", "Calm", "Still", "Bright", "Clear", "Early", "Evening",
  "Morning", "Silver", "Amber", "Olive", "Soft", "Open", "Kind", "Humble", "Hidden", "Distant",
  "Rising", "Hopeful", "Thankful", "Mindful", "Rooted", "Wandering", "Simple", "Warm", "Cool", "Green",
  "Golden", "Deep", "Wide", "Light", "Northern", "Southern", "Eastern", "Western", "Winter", "Summer",
] as const;

export const SECOND = [
  "Cedar", "Olive", "Palm", "Willow", "River", "Stream", "Spring", "Valley", "Meadow", "Garden",
  "Harbour", "Lantern", "Feather", "Pebble", "Cloud", "Rain", "Dune", "Oasis", "Orchard", "Field",
  "Brook", "Grove", "Hill", "Shore", "Reed", "Fig", "Date", "Pomegranate", "Juniper", "Acacia",
  "Lotus", "Jasmine", "Sparrow", "Dove", "Falcon", "Heron", "Moon", "Dawn", "Dusk", "Breeze",
] as const;

export const NAME_DAYS = 30;

/** A new given name, never the same as `avoid` (the person's previous name). */
export function newGivenName(avoid?: string): string {
  for (;;) {
    const a = FIRST[randomInt(0, FIRST.length)];
    const b = SECOND[randomInt(0, SECOND.length)];
    if (a === b) continue;
    const name = `${a} ${b}`;
    if (name !== avoid) return name;
  }
}

export function nextChange(from: Date = new Date()): Date {
  return new Date(from.getTime() + NAME_DAYS * 24 * 60 * 60 * 1000);
}
