import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import Orbit from "@/components/Orbit";
import Arrow from "@/components/Arrow";
import { createClient } from "@/lib/supabase/server";
import { QUESTIONS } from "@/lib/questions";
import { RUNGS, RULER_MAX, muslimQuotientRange, isAnswer, type Answer } from "@/lib/scale";

export const dynamic = "force-dynamic";

const MOHASABA = process.env.NEXT_PUBLIC_MOHASABA_URL || "https://mohasaba.io";

export default async function Result() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const { data: entry } = await supabase
    .from("mq_entries")
    .select("answers, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!entry) redirect("/questions");

  const values = QUESTIONS.map((q) => (entry.answers as Record<string, number>)[q.id]);
  if (!values.every(isAnswer)) redirect("/questions");
  const answers = values as Answer[];
  const { low, high } = muslimQuotientRange(answers);

  return (
    <Shell>
      <main className="wrap flow">
        <div className="stage">
          <Orbit />
          <div className="card card-wide">
            <div className="card-in">
              <div className="c-top"><span>Your Muslim Quotient</span><span>Today</span></div>
              <p className="mq">{low}–{high}<small>of {RULER_MAX}</small></p>
              <p className="mq-word">Between {RUNGS[low].word} and {RUNGS[high].word}</p>

              <div className="rows">
                {QUESTIONS.map((q, k) => {
                  const pos = (answers[k] / RULER_MAX) * 100;
                  return (
                    <div className="row" key={q.id}>
                      <span>{q.pillar}</span>
                      <div className="track10" title={RUNGS[answers[k]].word}>
                        <span className="hz" />
                        <span className="fill" style={{ width: `${pos}%` }} />
                        <b style={{ left: `${pos}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="axis"><span>0</span><span>7</span><span>10</span></div>

              <div className="locked">
                <span>How you pray · not available yet</span>
                <span>Speech &amp; dealings · not available yet</span>
                <span>Niyyah · not available yet</span>
              </div>

              <p className="small">You get a range. No one is ranked. Five questions give a small result. Your full Mohasaba asks more and shows how you practise, not only whether you do.</p>

              <div className="cta">
                <a className="btn btn-glow" href={MOHASABA}>Take your full Mohasaba, free <Arrow /></a>
              </div>
              <p className="fine"><Link className="link" href="/">Back to the start</Link></p>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}
