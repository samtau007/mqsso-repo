import type { Issued } from "@/lib/clients";

/** Shown once, straight after registering or rotating. Never stored in plain text after this. */
export default function Secrets({ issued }: { issued: Issued }) {
  return (
    <div className="p-secret" role="status">
      <p><b>Copy these now.</b> The secrets are shown only once. If you lose them, rotate them.</p>
      <div className="p-field"><label>Client ID</label><code className="p-code" data-testid="client-id">{issued.clientId}</code></div>
      {issued.clientSecret && (
        <div className="p-field"><label>Client secret</label><code className="p-code" data-testid="client-secret">{issued.clientSecret}</code></div>
      )}
      {issued.signingSecret && (
        <div className="p-field"><label>Notice signing secret (checks the MQ-Signature header)</label><code className="p-code" data-testid="signing-secret">{issued.signingSecret}</code></div>
      )}
    </div>
  );
}
