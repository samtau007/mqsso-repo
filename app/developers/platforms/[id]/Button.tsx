// The official button, from docs/design/Main.html ("The button partners add").
// White on dark screens, night blue on light screens. Platforms use it unchanged.

const MARK_DARK_SCREEN = '<svg width="24" height="24" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#3a4c6b" stroke-width="16"/><path d="M50 16 A34 34 0 0 0 50 84" fill="none" stroke="#8a6ca6" stroke-width="16"/></svg>';
const MARK_LIGHT_SCREEN = '<svg width="24" height="24" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#3a4c6b" stroke-width="16"/><path d="M50 16 A34 34 0 0 0 50 84" fill="none" stroke="#c9b6dc" stroke-width="16"/></svg>';

const base = "display:flex;align-items:center;justify-content:center;gap:12px;height:56px;border-radius:999px;text-decoration:none;font-family:Outfit,system-ui,sans-serif;font-weight:600;font-size:16px";

function snippet(href: string, dark: boolean) {
  const colours = dark ? "background:#ffffff;color:#2c3a52" : "background:#0c121d;color:#ffffff";
  return `<a href="${href}" style="${base};${colours}">${dark ? MARK_DARK_SCREEN : MARK_LIGHT_SCREEN}Sign in with Muslim Quotient</a>`;
}

export default function OfficialButton() {
  const href = "YOUR_SIGN_IN_ROUTE";
  const variants = [
    { title: "On a dark screen", dark: true, frame: "#0c121d" },
    { title: "On a light screen", dark: false, frame: "#f4f6f8" },
  ];
  return (
    <>
      <p className="p-lede" style={{ marginTop: 0 }}>Use the button unchanged. Point it at the route on your platform that starts sign-in.</p>
      {variants.map((v) => (
        <div className="p-field" key={v.title}>
          <label>{v.title}</label>
          <div style={{ background: v.frame, border: "1px solid #2c3a52", borderRadius: 18, padding: 18 }} dangerouslySetInnerHTML={{ __html: snippet("#", v.dark) }} />
          <code className="p-code">{snippet(href, v.dark)}</code>
        </div>
      ))}
    </>
  );
}
