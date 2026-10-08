import { redirect } from "next/navigation";
import { currentDeveloper } from "@/lib/portal";
import { SCOPES } from "@/lib/scopes";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function NewPlatform() {
  if (!(await currentDeveloper())) redirect("/");
  return (
    <>
      <h1>Register a platform</h1>
      <p className="p-lede">You get a client ID and secrets straight away. The platform can sign people in once Muslim Quotient approves it.</p>
      <RegisterForm scopes={SCOPES.map(({ scope, gives }) => ({ scope, gives }))} />
    </>
  );
}
