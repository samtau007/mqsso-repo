// The five entry questions, one per pillar, from the Five Pillars question bank.
// Stored as verb phrases. Render as: "How consistently do I… " + stem + "?"

export const QUESTION_FRAME = "How consistently do I…";

export const QUESTIONS = [
  { id: "shahadah-muraqabah", pillar: "Shahādah", arabic: "الشهادة", stem: "live aware that Allah sees me, wherever I am" },
  { id: "salah-on-time", pillar: "Ṣalāh", arabic: "الصلاة", stem: "pray the five daily prayers within their appointed times" },
  { id: "zakah-sadaqah", pillar: "Zakāh", arabic: "الزكاة", stem: "give voluntary charity regularly, even a little" },
  { id: "sawm-guard", pillar: "Ṣawm", arabic: "الصوم", stem: "guard my tongue, eyes and limbs while fasting" },
  { id: "hajj-longing", pillar: "Ḥajj", arabic: "الحج", stem: "keep alive my intention and longing to perform Ḥajj" },
] as const;

export const QUESTION_LIST_VERSION = "mq-entry-v1";
