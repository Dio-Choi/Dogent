import { useState } from "react";
import type { ProjectRecord, DeployTarget } from "@shared/project";

interface Props {
  initial?: ProjectRecord;
  onSave: (p: ProjectRecord) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}

export function ProjectFormModal({ initial, onSave, onCancel, onDelete }: Props): JSX.Element {
  const [name, setName] = useState(initial?.name ?? "");
  const [vaultId, setVaultId] = useState(initial?.vaultId ?? "");
  const [rootPath, setRootPath] = useState(initial?.rootPath ?? "");
  const [deployTarget, setDeployTarget] = useState<DeployTarget>(initial?.deploy.target ?? "none");
  const [vercelProject, setVercelProject] = useState(initial?.deploy.vercelProject ?? "");
  const [awsBucket, setAwsBucket] = useState(initial?.deploy.awsBucket ?? "");
  const [awsRegion, setAwsRegion] = useState(initial?.deploy.awsRegion ?? "us-east-1");

  const pickRoot = async (): Promise<void> => {
    const dir = await window.dogent.dialog.pickDirectory();
    if (!dir) return;
    setRootPath(dir);
    await tryDetectVaultId(dir);
  };

  const tryDetectVaultId = async (root: string): Promise<void> => {
    const candidate = `${root}/vault/.obsidian/plugins/dogent-vault/data.json`;
    const raw = await window.dogent.fs.readFile(candidate);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { vaultId?: string };
      if (parsed.vaultId) setVaultId(parsed.vaultId);
    } catch {
      // ignore
    }
  };

  const save = async (): Promise<void> => {
    if (!name.trim() || !rootPath.trim()) return;

    // Ensure <root>/vault and <root>/code exist
    await window.dogent.project.scaffold(rootPath.trim());

    // Re-detect vault ID after scaffold (Obsidian plugin may write data.json after first launch)
    if (!vaultId) await tryDetectVaultId(rootPath.trim());

    const record: ProjectRecord = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      vaultId: vaultId.trim(),
      rootPath: rootPath.trim(),
      deploy: {
        target: deployTarget,
        vercelProject: vercelProject.trim() || undefined,
        awsBucket: awsBucket.trim() || undefined,
        awsRegion: awsRegion.trim() || undefined,
      },
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    await onSave(record);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "Edit project" : "New project"}</h2>

        <div className="field">
          <div className="label">Project name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My App" />
        </div>

        <div className="field">
          <div className="label">Project folder</div>
          <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "0 0 6px" }}>
            A <code>vault/</code> and <code>code/</code> subfolder will be created here. Open <code>vault/</code> as your Obsidian vault.
          </p>
          <div className="row">
            <input value={rootPath} onChange={(e) => setRootPath(e.target.value)} placeholder="/path/to/project-root" />
            <button onClick={pickRoot}>Pick</button>
          </div>
        </div>

        {vaultId && (
          <div className="field">
            <div className="label">Detected Vault ID</div>
            <input value={vaultId} readOnly style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.7 }} />
          </div>
        )}

        <h3 style={{ marginTop: 18 }}>Deploy</h3>
        <div className="field">
          <div className="label">Target</div>
          <select value={deployTarget} onChange={(e) => setDeployTarget(e.target.value as DeployTarget)}>
            <option value="none">None</option>
            <option value="vercel">Vercel</option>
            <option value="aws-s3">AWS S3 (static site)</option>
          </select>
        </div>

        {deployTarget === "vercel" && (
          <div className="field">
            <div className="label">Vercel project name (optional)</div>
            <input value={vercelProject} onChange={(e) => setVercelProject(e.target.value)} />
          </div>
        )}

        {deployTarget === "aws-s3" && (
          <>
            <div className="field">
              <div className="label">S3 bucket</div>
              <input value={awsBucket} onChange={(e) => setAwsBucket(e.target.value)} />
            </div>
            <div className="field">
              <div className="label">Region</div>
              <input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} />
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          {onDelete && (
            <button className="danger" onClick={onDelete}>Delete</button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
