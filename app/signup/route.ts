import { startSignIn } from "@/lib/site/start";

export const dynamic = "force-dynamic";

// "Create your ID" goes straight to Muslim Quotient sign-up. Sign-up and sign-in are one flow:
// the email code creates the ID the first time.
export const GET = startSignIn;
