import { useState, useEffect } from "react";
import type { SecretsShape } from "@shared/project";

interface Props {
  secrets: SecretsShape;
  onSave: (s: SecretsShape) => Promise<void>;
}

export function Settings({ secrets, onSave }: Props): JSX.Element {
  const [draft, setDraft] = useState<SecretsShape>(secrets);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(secrets), [secrets]);

  const update = (k: keyof SecretsShape, v: string): void => {
    setDraft({ ...draft, [k]: v });
    setSaved(false);
  };

  const save = async (): Promise<void> => {
    await onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <p style={{ color: "var(--text-dim)" }}>
        Stored locally and encrypted with the system keychain when available.
      </p>

      <section className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Anthropic</h3>
        <div className="field">
          <div className="label">API key</div>
          <input
            type="password"
            value={draft.anthropicApiKey ?? ""}
            onChange={(e) => update("anthropicApiKey", e.target.value)}
            placeholder="sk-ant-..."
          />
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Vercel</h3>
        <div className="field">
          <div className="label">Token</div>
          <input
            type="password"
            value={draft.vercelToken ?? ""}
            onChange={(e) => update("vercelToken", e.target.value)}
            placeholder="From vercel.com/account/tokens"
          />
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>AWS</h3>
        <div className="field">
          <div className="label">Access Key ID</div>
          <input
            value={draft.awsAccessKeyId ?? ""}
            onChange={(e) => update("awsAccessKeyId", e.target.value)}
          />
        </div>
        <div className="field">
          <div className="label">Secret Access Key</div>
          <input
            type="password"
            value={draft.awsSecretAccessKey ?? ""}
            onChange={(e) => update("awsSecretAccessKey", e.target.value)}
          />
        </div>
      </section>

      <div className="row">
        <button className="primary" onClick={save}>Save</button>
        {saved && <span style={{ color: "var(--ok)" }}>Saved</span>}
      </div>
    </div>
  );
}
