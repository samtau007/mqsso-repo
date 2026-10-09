"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addGoal, deleteAccount, disconnectPlatform, GoalError, saveSettings, setEmailChoice, setGoalStatus,
  SettingsError, withdrawPermissions,
} from "@/lib/account";
import { decideImport } from "@/lib/record";
import { siteClient } from "@/lib/site/oidc";
import { currentPersonId, endSession } from "@/lib/site/session";

// Every action reads the person from the website's session, never from the form.

async function me(): Promise<string> {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  return personId;
}

const id = (form: FormData, key: string) => String(form.get(key) ?? "").slice(0, 100);

/** The person approves or declines a platform's history import, as a whole. */
export async function decide(form: FormData) {
  const personId = await me();
  const importId = id(form, "import");
  if (!/^[0-9a-f-]{36}$/.test(importId)) return;
  await decideImport(personId, importId, form.get("choice") === "approve");
  revalidatePath("/dashboard");
}

export async function disconnect(form: FormData) {
  const personId = await me();
  await disconnectPlatform(personId, id(form, "client_id"), form.get("remove") === "yes");
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/platforms?done=disconnected");
}

export async function withdraw(form: FormData) {
  const personId = await me();
  const clientId = id(form, "client_id");
  await withdrawPermissions(personId, clientId, [id(form, "scope")]);
  revalidatePath(`/dashboard/platforms/${clientId}`);
}

export async function emailChoice(form: FormData) {
  const personId = await me();
  const clientId = id(form, "client_id");
  const choice = form.get("choice") === "share" ? "share" : "hide";
  await setEmailChoice(personId, clientId, choice);
  revalidatePath("/dashboard", "layout");
}

export type FormState = { error?: string; saved?: boolean };

const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(v));
const opt = (v: FormDataEntryValue | null) => (v === null || String(v) === "" ? null : String(v));

export async function prayer(_prev: FormState, form: FormData): Promise<FormState> {
  const personId = await me();
  const lat = num(form.get("lat"));
  const lng = num(form.get("lng"));
  if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) return { error: "Latitude and longitude are numbers, like 17.38 and 78.48." };
  try {
    await saveSettings(personId, {
      city: opt(form.get("city")), lat, lng, method: opt(form.get("method")), asr: opt(form.get("asr")),
      hijriAdjust: Number(form.get("hijri_adjust") ?? 0), language: opt(form.get("language")), tz: opt(form.get("tz")),
    });
  } catch (e) {
    if (e instanceof SettingsError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard", "layout");
  return { saved: true };
}

export async function goal(_prev: FormState, form: FormData): Promise<FormState> {
  const personId = await me();
  try {
    await addGoal(personId, { title: String(form.get("title") ?? ""), targetHijri: opt(form.get("by")), continueIn: opt(form.get("where")) });
  } catch (e) {
    if (e instanceof GoalError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard/goals");
  return { saved: true };
}

export async function goalStatus(form: FormData) {
  const personId = await me();
  const status = String(form.get("status"));
  if (status !== "active" && status !== "done" && status !== "set_aside") return;
  await setGoalStatus(personId, id(form, "goal"), status);
  revalidatePath("/dashboard/goals");
}

/** Delete everything. The form asks the person to type their given name first. */
export async function deleteEverything(_prev: FormState, form: FormData): Promise<FormState> {
  const personId = await me();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== String(form.get("expected") ?? "").trim().toLowerCase()) {
    return { error: "Type your given name exactly as shown to confirm." };
  }
  await deleteAccount(personId, siteClient().clientId);
  endSession();
  redirect("/?deleted=1");
}
