// Server-rendered pages for id.muslimquotient.com: email, code, permission screen, errors.
// Plain HTML forms, no scripts. Tokens from CLAUDE.md; solid colours only.
// PROVISIONAL LAYOUT: to be matched to the design canvas (docs/design) once it is in the repo.

import { NEVER_SEES, type ScopeInfo } from "../scopes";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const CSS = `
@font-face{font-family:Outfit;font-style:normal;font-weight:300 800;font-display:swap;src:url(/fonts/outfit-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:Outfit;font-style:normal;font-weight:300 800;font-display:swap;src:url(/fonts/outfit-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
:root{--bg:#0c121d;--card:#18212f;--ink:#2c3a52;--navy:#3a4c6b;--plum:#8a6ca6;--lilac:#c9b6dc;--muted:#9dadc6;--gold:#d9b46a;--fg:#ffffff;--field:#0f1622;--err:#e6a3a3;color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--fg);font-family:Outfit,system-ui,sans-serif;font-size:16px;line-height:1.55;-webkit-text-size-adjust:100%}
a{color:var(--lilac)}
:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
.page{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 40px}
.top{width:100%;max-width:440px;display:flex;align-items:center;gap:10px;margin-bottom:28px;font-weight:700;letter-spacing:-.03em;font-size:17px}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--ink);border-radius:24px;padding:28px 24px}
@media (min-width:480px){.card{padding:32px}}
.kicker{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:500;margin:0}
h1{font-size:26px;line-height:1.2;letter-spacing:-.025em;font-weight:600;margin:12px 0 0}
p{margin:12px 0 0;color:var(--muted)}
p b,p strong{color:var(--fg);font-weight:600}
label{display:block;font-size:13px;color:var(--muted);margin:22px 0 8px}
.input{width:100%;background:var(--field);border:1px solid var(--ink);border-radius:14px;padding:14px 16px;color:var(--fg);font:inherit;font-size:16px}
.input:focus{outline:none;border-color:var(--lilac)}
.input.code{letter-spacing:.4em;text-align:center;font-size:22px;font-variant-numeric:tabular-nums}
.btn{display:flex;width:100%;align-items:center;justify-content:center;margin-top:22px;border:0;border-radius:999px;background:var(--fg);color:var(--bg);font:inherit;font-weight:600;font-size:16px;padding:15px 24px;cursor:pointer;text-decoration:none}
.btn.line{background:transparent;color:var(--fg);border:1px solid var(--navy);margin-top:10px}
.link{background:none;border:0;color:var(--muted);font:inherit;font-size:14px;cursor:pointer;padding:0;text-decoration:underline}
.row{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;margin-top:16px}
.err{color:var(--err);font-size:14px;margin-top:14px}
.note{font-size:13px;margin-top:16px}
.name{margin-top:18px;background:var(--lilac);color:var(--bg);border-radius:18px;padding:16px 18px}
.name span{display:block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
.name b{display:block;font-size:26px;font-weight:800;letter-spacing:-.03em;margin-top:2px}
.name small{display:block;font-size:13px;margin-top:4px}
.who{margin-top:16px;font-size:14px;color:var(--muted)}
.who b{color:var(--fg)}
ul{list-style:none;padding:0;margin:14px 0 0}
.perm li{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--ink)}
.perm li:last-child{border-bottom:1px solid var(--ink)}
.perm input{margin-top:4px;width:18px;height:18px;accent-color:var(--plum);flex:none}
.perm span{color:var(--fg);font-size:15px}
.never li{font-size:14px;color:var(--muted);padding:4px 0 4px 18px;position:relative}
.never li::before{content:"";position:absolute;left:2px;top:12px;width:8px;height:2px;background:var(--navy)}
h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:24px 0 0}
fieldset{border:1px solid var(--ink);border-radius:16px;margin:12px 0 0;padding:6px 14px}
legend{font-size:14px;color:var(--fg);padding:0 6px}
.choice{display:flex;gap:12px;align-items:flex-start;padding:10px 0}
.choice input{margin-top:4px;width:18px;height:18px;accent-color:var(--plum);flex:none}
.choice span{font-size:15px}
.choice small{display:block;color:var(--muted);font-size:13px}
.foot{margin-top:28px;font-size:12px;color:var(--muted);text-align:center;max-width:440px}
`;

const LOGO = `<svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#3a4c6b" stroke-width="14"/><path d="M50 16 A34 34 0 0 0 50 84" fill="none" stroke="#8a6ca6" stroke-width="14"/><rect x="44" y="10" width="12" height="12" rx="2.5" fill="#ffffff" transform="rotate(45 50 16)"/></svg>`;

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">
<title>${esc(title)} · Muslim Quotient</title><style>${CSS}</style></head>
<body><div class="page"><div class="top">${LOGO}<span>Muslim Quotient</span></div>
<main class="card">${body}</main>
<p class="foot">One private ID across Muslim platforms. No one is ranked.</p></div></body></html>`;
}

export function errorPage(title: string, html: string): string {
  return layout(title, `<h1>${esc(title)}</h1>${html}`);
}

const err = (e?: string) => (e ? `<p class="err" role="alert">${esc(e)}</p>` : "");

export function emailStep(o: { uid: string; clientName: string; email?: string; error?: string }): string {
  return layout("Sign in", `
<p class="kicker">Sign in or create your ID</p>
<h1>Continue to ${esc(o.clientName)} with Muslim Quotient</h1>
<form method="post" action="/interaction/${esc(o.uid)}/email">
  <label for="email">Your email</label>
  <input class="input" id="email" name="email" type="email" required autocomplete="email" autofocus value="${esc(o.email ?? "")}" placeholder="you@example.com">
  ${err(o.error)}
  <button class="btn" type="submit">Send me a code</button>
</form>
<p class="note">We send a 6-digit code to your email. No password. New here? The same code creates your ID.</p>
<form method="post" action="/interaction/${esc(o.uid)}/abort"><div class="row"><button class="link" type="submit">Cancel and go back to ${esc(o.clientName)}</button></div></form>`);
}

export function codeStep(o: { uid: string; email: string; error?: string; sent?: boolean }): string {
  return layout("Enter your code", `
<p class="kicker">Check your email</p>
<h1>Enter the code we sent to ${esc(o.email)}</h1>
<form method="post" action="/interaction/${esc(o.uid)}/code">
  <label for="code">6-digit code</label>
  <input class="input code" id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" autofocus>
  ${err(o.error)}
  ${o.sent ? `<p class="note" role="status">A new code is on its way.</p>` : ""}
  <button class="btn" type="submit">Continue</button>
</form>
<div class="row">
  <form method="post" action="/interaction/${esc(o.uid)}/resend"><button class="link" type="submit">Send a new code</button></form>
  <a class="link" href="/interaction/${esc(o.uid)}?step=email">Use a different email</a>
</div>`);
}

export function consentStep(o: {
  uid: string;
  clientName: string;
  clientWebsite: string;
  givenName: string;
  isNew: boolean;
  scopes: ScopeInfo[];
  emailRequested: boolean;
  emailChoice: "share" | "hide" | null;
  error?: string;
}): string {
  const host = (() => { try { return new URL(o.clientWebsite).host; } catch { return o.clientWebsite; } })();
  const perms = o.scopes.map((s) => `
    <li><input type="checkbox" id="s-${esc(s.scope)}" name="scope" value="${esc(s.scope)}" checked${s.always ? " disabled" : ""}>
    <label for="s-${esc(s.scope)}" style="margin:0"><span>${esc(s.sees)}</span></label></li>`).join("");
  const emailChoice = o.emailRequested ? `
  <fieldset>
    <legend>Which email should ${esc(o.clientName)} get?</legend>
    <label class="choice" style="margin:0"><input type="radio" name="email_choice" value="hide" required${o.emailChoice === "hide" ? " checked" : ""}>
      <span>Hide my email<small>${esc(o.clientName)} gets a private address that forwards to you.</small></span></label>
    <label class="choice" style="margin:0"><input type="radio" name="email_choice" value="share" required${o.emailChoice === "share" ? " checked" : ""}>
      <span>Share my email<small>${esc(o.clientName)} gets your real email address.</small></span></label>
  </fieldset>` : "";
  const who = o.isNew
    ? `<div class="name"><span>Your given name</span><b>${esc(o.givenName)}</b><small>It changes every 30 days. Platforms never see your real name.</small></div>`
    : `<p class="who">Signed in as <b>${esc(o.givenName)}</b></p>`;

  return layout(`Allow ${o.clientName}`, `
<p class="kicker">${esc(host)}</p>
<h1>${esc(o.clientName)} would like to</h1>
${who}
<form method="post" action="/interaction/${esc(o.uid)}/confirm">
  <ul class="perm">${perms}</ul>
  ${emailChoice}
  <h2>${esc(o.clientName)} never sees</h2>
  <ul class="never">${NEVER_SEES.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
  ${err(o.error)}
  <button class="btn" type="submit">Allow</button>
</form>
<form method="post" action="/interaction/${esc(o.uid)}/abort"><button class="btn line" type="submit">Cancel</button></form>
<p class="note">You can disconnect ${esc(o.clientName)} at any time from Muslim Quotient.</p>`);
}
