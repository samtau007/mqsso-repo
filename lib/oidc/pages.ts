// Server-rendered pages for id.muslimquotient.com: email, code, permission screen, errors.
// Plain HTML forms. The only script is the passkey one, inline with a per-response nonce.
// Solid colours only.
// The permission screen follows docs/design/Consent.html. The canvas has no screen for the
// email and code steps, so they use the same layout and parts.

import { NEVER_SEES, type ScopeInfo } from "../scopes";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const CSS = `
@font-face{font-family:Outfit;font-style:normal;font-weight:300 800;font-display:swap;src:url(/fonts/outfit-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:Outfit;font-style:normal;font-weight:300 800;font-display:swap;src:url(/fonts/outfit-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
:root{--bg:#0c121d;--card:#18212f;--ink:#2c3a52;--navy:#3a4c6b;--tile:#24314a;--plum:#8a6ca6;--lilac:#c9b6dc;--muted:#9dadc6;--soft:#dfe6f0;--gold:#d9b46a;--fg:#ffffff;--field:#0f1622;--err:#e6a3a3;color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--fg);font-family:Outfit,system-ui,sans-serif;font-size:16px;line-height:1.5;-webkit-text-size-adjust:100%}
a{color:var(--lilac)}a:hover{color:var(--fg)}
:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
.page{min-height:100vh;max-width:440px;margin:0 auto;padding:52px 24px 28px;display:flex;flex-direction:column;gap:14px}
.logos{display:flex;align-items:center;justify-content:center;gap:14px}
.tile{width:44px;height:44px;border-radius:12px;background:var(--tile);border:1px solid var(--navy);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;color:var(--fg)}
.head{display:flex;flex-direction:column;gap:6px;text-align:center}
h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.2}
.sub{margin:0;font-size:14px;color:var(--muted)}
.sub b{color:var(--fg);font-weight:600}
.card{background:var(--card);border:1px solid var(--ink);border-radius:22px;padding:20px;display:flex;flex-direction:column;gap:14px}
.card.choice{border-color:var(--plum);padding:16px 18px;gap:10px}
.label{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:500}
.choice .label{color:var(--lilac)}
.row{display:flex;gap:12px;align-items:flex-start;font-size:15px;line-height:1.4}
.row svg{flex:none}
.never .row span{color:var(--soft)}
.perm{position:relative;cursor:pointer}
.perm input{position:absolute;opacity:0;width:20px;height:20px;margin:0}
.tick{flex:none;width:20px;height:20px;border-radius:6px;border:1.5px solid var(--navy);display:flex;align-items:center;justify-content:center}
.tick svg{visibility:hidden}
.perm input:checked+.tick{border-color:transparent}
.perm input:checked+.tick svg{visibility:visible}
.perm input:focus-visible+.tick{outline:2px solid var(--gold);outline-offset:2px}
.perm input:disabled+.tick{cursor:default}
.radio{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.4;cursor:pointer}
.radio input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--plum);flex:none}
.radio small{display:block;font-size:12px;color:var(--muted)}
label.field{font-size:13px;color:var(--muted)}
.input{width:100%;background:var(--field);border:1px solid var(--ink);border-radius:14px;padding:14px 16px;color:var(--fg);font:inherit;font-size:16px}
.input:focus{outline:none;border-color:var(--lilac)}
.input.code{letter-spacing:.4em;text-align:center;font-size:22px;font-variant-numeric:tabular-nums}
.grow{flex:1}
.actions{display:flex;flex-direction:column;gap:10px}
.btn{display:flex;width:100%;align-items:center;justify-content:center;height:56px;border:0;border-radius:999px;background:var(--fg);color:var(--ink);font:inherit;font-weight:600;font-size:16px;cursor:pointer;text-decoration:none}
.btn.quiet{height:52px;background:transparent;color:var(--muted);font-weight:500;font-size:15px}
.btn.quiet:hover{color:var(--fg)}
.links{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}
.link{background:none;border:0;color:var(--muted);font:inherit;font-size:14px;cursor:pointer;padding:0;text-decoration:underline}
.link:hover{color:var(--fg)}
.err{color:var(--err);font-size:14px;margin:0}
.note{margin:0;font-size:12px;color:var(--muted);text-align:center}
.status{margin:0;font-size:14px;color:var(--lilac)}
.codes{margin:0;padding-left:24px;display:grid;gap:6px;font-size:17px;letter-spacing:.06em;font-variant-numeric:tabular-nums}
.test{margin:0;align-self:center;font-size:12px;color:var(--gold);border:1px solid var(--gold);border-radius:999px;padding:4px 12px}
`;

const LOGO = `<svg width="44" height="44" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#3a4c6b" stroke-width="14"/><path d="M50 16 A34 34 0 0 0 50 84" fill="none" stroke="#8a6ca6" stroke-width="14"/><rect x="44" y="10" width="12" height="12" rx="2.5" fill="#ffffff" transform="rotate(45 50 16)"/></svg>`;
const ARROW = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9dadc6" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9b6dc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>`;
const CROSS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9dadc6" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

/** Muslim Quotient's logo, an arrow, and the platform's tile. Platforms register no logo yet, so the tile shows an initial. */
function logos(clientName?: string): string {
  if (!clientName) return `<div class="logos">${LOGO}</div>`;
  const initial = esc(Array.from(clientName.trim())[0]?.toUpperCase() ?? "?");
  return `<div class="logos">${LOGO}${ARROW}<div class="tile" aria-hidden="true">${initial}</div></div>`;
}

export function layout(title: string, body: string, script?: { nonce: string; code: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">
<title>${esc(title)} · Muslim Quotient</title><style>${CSS}</style></head>
<body><main class="page">${body}</main>${script ? `<script nonce="${script.nonce}">${script.code}</script>` : ""}</body></html>`;
}

export function errorPage(title: string, html: string): string {
  return layout(title, `${logos()}<div class="head"><h1>${esc(title)}</h1></div><div class="card">${html.replace(/<p>/g, '<p class="sub" style="text-align:left">')}</div>`);
}

const err = (e?: string) => (e ? `<p class="err" role="alert">${esc(e)}</p>` : "");

/**
 * WebAuthn in the browser, without a library: base64url in and out of the shapes the server
 * library (SimpleWebAuthn) speaks. Buttons marked data-passkey="signin" or "add" use it.
 */
function passkeyScript(uid: string): string {
  return `(function(){
var uid=${JSON.stringify(uid)};
if(!window.PublicKeyCredential)return;
var dec=function(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),function(c){return c.charCodeAt(0)}).buffer};
var enc=function(b){var s='',a=new Uint8Array(b);for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')};
var post=function(a,b){return fetch('/interaction/'+uid+'/'+a,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(b||{})}).then(function(r){return r.json()})};
var say=function(t){var e=document.getElementById('pk-status');if(e){e.textContent=t;e.hidden=!t}};
var ids=function(l){return(l||[]).map(function(c){return Object.assign({},c,{id:dec(c.id)})})};
var showCodes=function(codes,next){
  var box=document.getElementById('pk-codes');if(!box)return;
  document.querySelectorAll('[data-hide-on-codes]').forEach(function(e){e.hidden=true});
  var h=document.querySelector('.head h1');if(h)h.textContent='Your ID is made';
  var sub=document.querySelector('.head .sub');if(sub)sub.textContent='One last step: keep your recovery codes.';
  var ol=box.querySelector('ol');codes.forEach(function(c){var li=document.createElement('li');li.textContent=c;ol.appendChild(li)});
  box.querySelector('form').setAttribute('action',next);box.hidden=false;
};
document.querySelectorAll('[data-passkey]').forEach(function(b){
  b.hidden=false;
  b.addEventListener('click',function(){
    say('');b.disabled=true;
    var kind=b.getAttribute('data-passkey'),add=kind!=='signin';
    post(kind==='new'?'pknewopts':add?'pkregopts':'pkopts').then(function(o){
      if(o.error)throw new Error(o.error);
      return add
        ?navigator.credentials.create({publicKey:Object.assign({},o,{challenge:dec(o.challenge),user:Object.assign({},o.user,{id:dec(o.user.id)}),excludeCredentials:ids(o.excludeCredentials)})})
        :navigator.credentials.get({publicKey:Object.assign({},o,{challenge:dec(o.challenge),allowCredentials:ids(o.allowCredentials)})});
    }).then(function(c){
      var r=c.response,body={id:c.id,rawId:enc(c.rawId),type:c.type,clientExtensionResults:c.getClientExtensionResults(),authenticatorAttachment:c.authenticatorAttachment||undefined};
      body.response=add
        ?{clientDataJSON:enc(r.clientDataJSON),attestationObject:enc(r.attestationObject),transports:r.getTransports?r.getTransports():[]}
        :{clientDataJSON:enc(r.clientDataJSON),authenticatorData:enc(r.authenticatorData),signature:enc(r.signature),userHandle:r.userHandle?enc(r.userHandle):undefined};
      return post(kind==='new'?'pknew':add?'pkreg':'pk',body);
    }).then(function(r){
      if(r.codes){showCodes(r.codes,r.next);return}
      if(r.redirect){location.href=r.redirect;return}
      throw new Error(r.error||'');
    }).catch(function(e){
      b.disabled=false;
      say(e&&e.name==='NotAllowedError'?'No passkey was used.':(e&&e.message)||'That did not work. Try again, or use your email.');
    });
  });
});
})();`;
}

export function emailStep(o: { uid: string; clientName: string; nonce: string; testMode?: boolean; email?: string; error?: string }): string {
  return layout("Sign in", `
${o.testMode ? `<p class="test" role="note">Test mode. Only this platform's testers can sign in.</p>` : ""}
${logos(o.clientName)}
<div class="head">
  <h1>Continue to ${esc(o.clientName)} with Muslim Quotient</h1>
  <p class="sub">Sign in, or create your MQ ID with the same code</p>
</div>
<form method="post" action="/interaction/${esc(o.uid)}/email" class="card" data-hide-on-codes>
  <label class="field" for="email">Your email</label>
  <input class="input" id="email" name="email" type="email" required autocomplete="email" autofocus value="${esc(o.email ?? "")}" placeholder="you@example.com">
  ${err(o.error)}
  <button class="btn" type="submit">Send me a code</button>
  <button class="btn quiet" type="button" data-passkey="signin" hidden style="border:1px solid var(--ink)">Sign in with a passkey</button>
  <p class="err" id="pk-status" role="alert" hidden></p>
</form>
<div class="card" data-hide-on-codes>
  <p class="sub" style="text-align:left">No email, or would rather not give one? Make your ID with a passkey: your fingerprint, face or screen lock. Platforms that want an email get a private address whose mail waits in your Muslim Quotient inbox.</p>
  <button class="btn quiet" type="button" data-passkey="new" hidden style="border:1px solid var(--ink)">Create my ID with a passkey, no email</button>
</div>
<div class="card" id="pk-codes" hidden>
  <span class="label">Your recovery codes</span>
  <p class="sub" style="text-align:left">Without an email, these are the only way back in if you lose your device. Print them or write them down and keep them somewhere safe. Each works once. They will not be shown again.</p>
  <ol class="codes"></ol>
  <form method="post"><button class="btn" type="submit">I have saved them. Continue</button></form>
</div>
<p class="note" data-hide-on-codes>We send a 6-digit code. No password, no name, no phone number.</p>
<p class="note" data-hide-on-codes><a href="/interaction/${esc(o.uid)}?step=recover">Cannot get to your email or device? Use a recovery code</a></p>
<div class="grow"></div>
<form method="post" action="/interaction/${esc(o.uid)}/abort" data-hide-on-codes><button class="btn quiet" type="submit">Not now</button></form>`, { nonce: o.nonce, code: passkeyScript(o.uid) });
}

export function recoverStep(o: { uid: string; clientName: string; email?: string; error?: string }): string {
  return layout("Use a recovery code", `
${logos(o.clientName)}
<div class="head">
  <h1>Use a recovery code</h1>
  <p class="sub">One of the ten codes you printed or saved. Each works once.</p>
</div>
<form method="post" action="/interaction/${esc(o.uid)}/recover" class="card">
  <label class="field" for="email">The email you signed up with, if you gave one</label>
  <input class="input" id="email" name="email" type="email" autocomplete="email" value="${esc(o.email ?? "")}">
  <label class="field" for="recovery">Recovery code</label>
  <input class="input" id="recovery" name="recovery" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE-FGHJK">
  ${err(o.error)}
  <button class="btn" type="submit">Sign in</button>
</form>
<div class="links"><a class="link" href="/interaction/${esc(o.uid)}?step=email">Back to email</a></div>`);
}

/** After the codes were shown, if the page is opened again: they are not shown twice. */
export function savedStep(o: { uid: string; clientName: string }): string {
  return layout("Your ID is ready", `
${logos(o.clientName)}
<div class="head">
  <h1>Your ID is ready</h1>
  <p class="sub">Your recovery codes were shown once. If you did not keep them, make new ones under Privacy on your dashboard.</p>
</div>
<form method="post" action="/interaction/${esc(o.uid)}/saved" class="card"><button class="btn" type="submit">Continue</button></form>`);
}

export function offerStep(o: { uid: string; clientName: string; nonce: string }): string {
  return layout("Sign in faster next time", `
${logos(o.clientName)}
<div class="head">
  <h1>Sign in faster next time</h1>
  <p class="sub">Add a passkey: your fingerprint, face or screen lock signs you in, with no code to wait for. It stays on your device.</p>
</div>
<div class="card">
  <button class="btn" type="button" data-passkey="add" hidden>Add a passkey</button>
  <p class="err" id="pk-status" role="alert" hidden></p>
  <form method="post" action="/interaction/${esc(o.uid)}/skip"><button class="btn quiet" type="submit">Not now</button></form>
</div>
<p class="note">You can add or remove passkeys any time under Privacy on your dashboard.</p>`, { nonce: o.nonce, code: passkeyScript(o.uid) });
}

export function codeStep(o: { uid: string; email: string; clientName?: string; error?: string; sent?: boolean }): string {
  return layout("Enter your code", `
${logos(o.clientName)}
<div class="head">
  <h1>Enter the code we sent</h1>
  <p class="sub">to <b>${esc(o.email)}</b></p>
</div>
<form method="post" action="/interaction/${esc(o.uid)}/code" class="card">
  <label class="field" for="code">6-digit code</label>
  <input class="input code" id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" autofocus>
  ${err(o.error)}
  ${o.sent ? `<p class="status" role="status">A new code is on its way.</p>` : ""}
  <button class="btn" type="submit">Continue</button>
</form>
<div class="links">
  <form method="post" action="/interaction/${esc(o.uid)}/resend"><button class="link" type="submit">Send a new code</button></form>
  <a class="link" href="/interaction/${esc(o.uid)}?step=email">Use a different email</a>
</div>`);
}

export function consentStep(o: {
  uid: string;
  clientName: string;
  givenName: string;
  isNew: boolean;
  scopes: ScopeInfo[];
  emailRequested: boolean;
  emailChoice: "share" | "hide" | null;
  relayAddress: string | null;
  /** False for someone who joined with a passkey and no email: there is nothing to share. */
  hasEmail?: boolean;
  error?: string;
}): string {
  const perms = o.scopes.map((s) => s.always
    ? `<div class="row">${CHECK}<span>${esc(s.sees)}</span></div>`
    : `<label class="row perm"><input type="checkbox" name="scope" value="${esc(s.scope)}" checked><span class="tick">${CHECK}</span><span>${esc(s.sees)}</span></label>`).join("");
  // Hide my email is chosen unless the person shared it with this platform before (as in the design).
  const hide = o.emailChoice !== "share";
  const relay = o.relayAddress
    ? `Sends ${esc(o.relayAddress)}, forwarded to you`
    : "Sends a private address, forwarded to you";
  const emailChoice = o.emailRequested && o.hasEmail === false ? `
  <div class="card choice">
    <span class="label">Your email for this platform</span>
    <input type="hidden" name="email_choice" value="hide">
    <p class="sub" style="text-align:left">You joined without an email. This platform gets a private address${o.relayAddress ? `, ${esc(o.relayAddress)},` : ""} and its mail waits in your Muslim Quotient inbox.</p>
  </div>` : o.emailRequested ? `
  <div class="card choice" role="radiogroup" aria-label="Your email for this platform">
    <span class="label">Your email for this platform</span>
    <label class="radio"><input type="radio" name="email_choice" value="hide" required${hide ? " checked" : ""}><span>Hide my email<small>${relay}</small></span></label>
    <label class="radio"><input type="radio" name="email_choice" value="share" required${hide ? "" : " checked"}><span>Share my email</span></label>
  </div>` : "";
  const who = o.isNew
    ? `Your given name is <b class="given">${esc(o.givenName)}</b> · it changes every 30 days`
    : `Signed in as <b class="given">${esc(o.givenName)}</b> · a name that changes every 30 days`;

  return layout(`Allow ${o.clientName}`, `
${logos(o.clientName)}
<div class="head">
  <h1>${esc(o.clientName)} would like to connect to your Muslim Quotient</h1>
  <p class="sub">${who}</p>
</div>
<form method="post" action="/interaction/${esc(o.uid)}/confirm" id="allow" style="display:contents">
  <div class="card">
    <span class="label">It will be able to</span>
    ${perms}
  </div>
  <div class="card never">
    <span class="label">It will never see</span>
    ${NEVER_SEES.map((n) => `<div class="row">${CROSS}<span>${esc(n)}</span></div>`).join("")}
  </div>
  ${emailChoice}
  ${err(o.error)}
</form>
<div class="grow"></div>
<div class="actions">
  <button class="btn" type="submit" form="allow">Allow</button>
  <form method="post" action="/interaction/${esc(o.uid)}/abort"><button class="btn quiet" type="submit">Not now</button></form>
</div>
<p class="note">You can switch this off any time in your dashboard.</p>`);
}
