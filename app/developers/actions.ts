"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { codeErrorMessage, issueCode, pendingEmail, verifyCode } from "@/lib/codes";
import {
  getPlatform, InputError, registerPlatform, rotateSecrets, setApproved, setSectorGroup,
  type ClientType, type Issued, type SendsFrom,
} from "@/lib/clients";
import { clearFlow, currentDeveloper, endSession, findOrCreateDeveloper, flowId, startSession } from "@/lib/portal";

export type SignInState = { step: "email" | "code"; email?: string; error?: string };

export async function sendCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "");
  const flow = flowId(true)!;
  try {
    await issueCode("portal", flow, email);
  } catch (e) {
    return { step: "email", email, error: codeErrorMessage(e) };
  }
  return { step: "code", email };
}

export async function checkCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const flow = flowId(false);
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!flow) return { step: "email", error: "Your sign-in expired. Ask for a new code." };
  let email: string;
  try {
    email = await verifyCode("portal", flow, code);
  } catch (e) {
    return { step: "code", email: await pendingEmail("portal", flow), error: codeErrorMessage(e) };
  }
  startSession(await findOrCreateDeveloper(email));
  redirect("/");
}

export async function restartSignIn(): Promise<SignInState> {
  clearFlow();
  return { step: "email" };
}

export async function signOut() {
  endSession();
  redirect("/");
}

export type RegisterState = { problems?: string[]; issued?: Issued };

export async function register(_prev: RegisterState, form: FormData): Promise<RegisterState> {
  const dev = await currentDeveloper();
  if (!dev) redirect("/");
  try {
    const issued = await registerPlatform({
      name: String(form.get("name") ?? ""),
      website: String(form.get("website") ?? ""),
      description: String(form.get("description") ?? ""),
      redirectUris: String(form.get("redirect_uris") ?? "").split(/\s+/),
      noticeUri: String(form.get("notice_uri") ?? ""),
      clientType: String(form.get("client_type") ?? "") as ClientType,
      sendsFrom: String(form.get("sends_from") ?? "") as SendsFrom,
      scopes: ["openid", ...form.getAll("scope").map(String)],
    }, dev.id);
    return { issued };
  } catch (e) {
    if (e instanceof InputError) return { problems: e.problems };
    throw e;
  }
}

async function mayManage(clientId: string) {
  const dev = await currentDeveloper();
  if (!dev) redirect("/");
  const p = await getPlatform(clientId);
  if (!p || (p.ownerId !== dev.id && !dev.isAdmin)) throw new Error("Not your platform");
  return dev;
}

export type RotateState = { issued?: Issued };

export async function rotate(_prev: RotateState, form: FormData): Promise<RotateState> {
  const clientId = String(form.get("client_id"));
  const dev = await mayManage(clientId);
  return { issued: await rotateSecrets(clientId, `developer:${dev.id}`) };
}

export async function approve(form: FormData) {
  const dev = await currentDeveloper();
  if (!dev?.isAdmin) throw new Error("Only Muslim Quotient can approve platforms");
  const clientId = String(form.get("client_id"));
  await setApproved(clientId, form.get("approved") === "yes", `developer:${dev.id}`);
  revalidatePath("/developers/platforms/[id]", "page");
}

export type SectorState = { error?: string; saved?: boolean };

export async function sector(_prev: SectorState, form: FormData): Promise<SectorState> {
  const dev = await currentDeveloper();
  if (!dev?.isAdmin) return { error: "Only Muslim Quotient can set sector groups." };
  try {
    await setSectorGroup(String(form.get("client_id")), String(form.get("group") ?? ""), `developer:${dev.id}`);
  } catch (e) {
    if (e instanceof InputError) return { error: e.problems.join(" ") };
    throw e;
  }
  revalidatePath("/developers/platforms/[id]", "page");
  return { saved: true };
}
