"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decideImport } from "@/lib/record";
import { currentPersonId } from "@/lib/site/session";

/** The person approves or declines a platform's history import, as a whole. */
export async function decide(form: FormData) {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const id = String(form.get("import") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await decideImport(personId, id, form.get("choice") === "approve");
  revalidatePath("/dashboard");
}
