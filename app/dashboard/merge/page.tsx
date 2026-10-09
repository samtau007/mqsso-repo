import { MergeFlow } from "../Safety";

/** Merge accounts (PRD 9): someone who made two Muslim Quotient accounts, with two emails, folds one into the other. */
export default function Merge() {
  return (
    <>
      <a className="d-link" href="/dashboard/privacy" style={{ textDecoration: "none" }}>‹ Privacy</a>
      <div>
        <h1 className="d-title">Merge another account</h1>
        <p className="d-sub">If you made a second Muslim Quotient account with another email, bring it into this one. Platforms connected to it keep knowing you by the same private ID.</p>
      </div>
      <MergeFlow />
    </>
  );
}
