"use client";

import { useState, useTransition } from "react";
import Shell from "@/components/Shell";
import Orbit from "@/components/Orbit";
import Arrow from "@/components/Arrow";
import { QUESTIONS, QUESTION_FRAME } from "@/lib/questions";
import { RUNGS } from "@/lib/scale";
import { saveAnswers } from "./actions";

export default function Questions() {
  const [answers, setAnswers] = useState<(number | null)[]>(QUESTIONS.map(() => null));
  const [i, setI] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const q = QUESTIONS[i];
  const v = answers[i];
  const last = i === QUESTIONS.length - 1;

  function choose(n: number) {
    setAnswers((a) => a.map((x, k) => (k === i ? n : x)));
  }

  function next() {
    if (!v) return;
    if (!last) return setI(i + 1);
    setError(null);
    start(async () => {
      try {
        await saveAnswers(answers as number[]);
      } catch (e) {
        // redirect() throws a special error that Next handles; only show real failures.
        if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) setError(e.message);
      }
    });
  }

  return (
    <Shell>
      <main className="wrap flow">
        <div className="stage">
          <Orbit />
          <div className="card card-wide">
            <div className="card-in" aria-live="polite">
              <div className="bar">{QUESTIONS.map((_, k) => <i key={k} className={k <= i ? "on" : ""} />)}</div>
              <div className="q-top">
                <b><span className="ar">{q.arabic}</span>{q.pillar}</b>
                <span>{i + 1} of {QUESTIONS.length}</span>
              </div>
              <p className="frame">{QUESTION_FRAME}</p>
              <p className="stem">{q.stem}?</p>

              <div className="scale" role="group" aria-label="Choose from 1 to 7">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button key={n} type="button" className="rung" aria-pressed={v === n} aria-label={`${n}, ${RUNGS[n].word}`} onClick={() => choose(n)}>{n}</button>
                ))}
              </div>
              <div className="ends"><span>Aware</span><span>Consistent</span></div>
              <p className="word">
                {v ? <><b>{RUNGS[v].word}.</b> {RUNGS[v].meaning}</> : "Choose the number that describes you today."}
              </p>

              {error && <p className="err">{error}</p>}
              <div className="q-actions">
                <button type="button" className="link" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
                <button type="button" className="btn btn-glow" disabled={!v || pending} onClick={next}>
                  {pending ? "Saving…" : last ? "See my result" : "Next"} <Arrow />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}
