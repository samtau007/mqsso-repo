"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QUESTIONS, QUESTION_LIST_VERSION } from "@/lib/questions";
import { isAnswer } from "@/lib/scale";

export async function saveAnswers(answers: number[]) {
  if (answers.length !== QUESTIONS.length || !answers.every(isAnswer)) {
    throw new Error("Each question needs an answer from 1 to 7.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  let source: Record<string, string> | null = null;
  try {
    const raw = cookies().get("mq_src")?.value;
    source = raw ? JSON.parse(raw) : null;
  } catch {
    source = null;
  }

  const payload = Object.fromEntries(QUESTIONS.map((q, i) => [q.id, answers[i]]));
  const { error } = await supabase.from("mq_entries").insert({
    user_id: user.id,
    list_version: QUESTION_LIST_VERSION,
    answers: payload,
    source,
  });
  if (error) throw new Error("Your answers could not be saved. Please try again.");

  redirect("/result");
}
