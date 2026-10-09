"use server";

import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { codeErrorMessage, issueCode, verifyCode } from "@/lib/codes";
import { decrypt, encrypt, token } from "@/lib/crypto";
import { env } from "@/lib/env";
import { mergeAccounts, mergePreview, personByEmail } from "@/lib/merge";
import { finishRegistration, registrationOptions, removePasskey } from "@/lib/passkeys";
import { inboxDelete } from "@/lib/inbox";
import { makeRecoveryCodes } from "@/lib/recovery";
import { setRelayOff } from "@/lib/relay";
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

// Signing in: passkeys and recovery codes ------------------------------------------------------

export async function passkeyOptions() {
  const personId = await me();
  return registrationOptions(`dash:${personId}`, personId);
}

export async function passkeyFinish(response: RegistrationResponseJSON): Promise<{ ok: boolean }> {
  const personId = await me();
  const who = await finishRegistration(`dash:${personId}`, response, headers().get("user-agent") ?? undefined);
  revalidatePath("/dashboard/privacy");
  return { ok: who === personId };
}

export async function removeKey(form: FormData) {
  const personId = await me();
  await removePasskey(personId, id(form, "passkey").slice(0, 600));
  revalidatePath("/dashboard/privacy");
}

export async function makeCodes(): Promise<string[]> {
  const personId = await me();
  const codes = await makeRecoveryCodes(personId);
  revalidatePath("/dashboard/privacy");
  return codes;
}

// Merging another account into this one ---------------------------------------------------------

const MERGE = "mq_merge";
type MergeFlow = { flow: string; other?: string; exp: number };

function readMerge(): MergeFlow | null {
  const raw = cookies().get(MERGE)?.value;
  if (!raw) return null;
  try {
    const m = JSON.parse(decrypt(raw, env.sessionKey)) as MergeFlow;
    return m.exp > Date.now() ? m : null;
  } catch {
    return null;
  }
}

function writeMerge(m: Omit<MergeFlow, "exp">) {
  cookies().set(MERGE, encrypt(JSON.stringify({ ...m, exp: Date.now() + 10 * 60_000 }), env.sessionKey), {
    httpOnly: true, sameSite: "lax", secure: env.siteOrigin.startsWith("https:"), path: "/dashboard", maxAge: 600,
  });
}

export type MergeState = {
  step: "email" | "code" | "confirm";
  email?: string;
  error?: string;
  preview?: { givenName: string; platforms: number; entries: number; goals: number };
};

/** One form, three steps: the other account's email, its code, then confirm. */
export async function mergeStep(prev: MergeState, form: FormData): Promise<MergeState> {
  const personId = await me();

  if (prev.step === "email") {
    const email = String(form.get("email") ?? "").trim();
    if ((await personByEmail(email)) === personId) return { step: "email", email, error: "That is the email of this account. Enter the other one." };
    const flow = token(16);
    try {
      await issueCode("merge", flow, email);
    } catch (e) {
      return { step: "email", email, error: codeErrorMessage(e) };
    }
    writeMerge({ flow });
    return { step: "code", email };
  }

  const m = readMerge();
  if (!m) return { step: "email", error: "That took too long. Start again." };

  if (prev.step === "code") {
    let email: string;
    try {
      email = await verifyCode("merge", m.flow, String(form.get("code") ?? "").replace(/\D/g, ""));
    } catch (e) {
      return { ...prev, error: codeErrorMessage(e) };
    }
    const other = await personByEmail(email);
    if (!other) return { step: "email", error: "No Muslim Quotient account uses that email. There is nothing to merge." };
    if (other === personId) return { step: "email", error: "That is this account." };
    writeMerge({ flow: m.flow, other });
    return { step: "confirm", email, preview: (await mergePreview(other)) ?? undefined };
  }

  if (!m.other) return { step: "email", error: "That took too long. Start again." };
  await mergeAccounts(personId, m.other);
  cookies().delete({ name: MERGE, path: "/dashboard" });
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard?merged=1");
}

export async function relaySwitch(form: FormData) {
  const personId = await me();
  await setRelayOff(personId, id(form, "client_id"), form.get("off") === "yes");
  revalidatePath("/dashboard/privacy");
}

export async function removeMessage(form: FormData) {
  const personId = await me();
  await inboxDelete(personId, id(form, "message"));
  revalidatePath("/dashboard/inbox");
  redirect("/dashboard/inbox");
}
