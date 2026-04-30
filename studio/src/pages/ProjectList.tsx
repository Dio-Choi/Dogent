import { useState } from "react";
import type { ProjectRecord } from "@shared/project";
import { ProjectFormModal } from "../components/ProjectFormModal";

interface Props {
  projects: ProjectRecord[];
  onOpen: (id: string) => void;
  onUpsert: (p: ProjectRecord) => Promise<void>;
}

export function ProjectList({ projects, onOpen, onUpsert }: Props): JSX.Element {
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="row" style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>Projects</h2>
        <div style={{ flex: 1 }} />
        <button className="primary" onClick={() => setCreating(true)}>New project</button>
      </div>

      {projects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>
          No projects yet. Click <strong>New project</strong> to connect a vault.
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <div key={p.id} className="project-tile" onClick={() => onOpen(p.id)}>
              <h3>{p.name}</h3>
              <div className="meta">
                <span className="tag">{p.backend.kind}</span>
                {p.lastPulledAt && (
                  <span style={{ marginLeft: 8 }}>
                    pulled {new Date(p.lastPulledAt).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="meta" style={{ marginTop: 6, fontFamily: "monospace", fontSize: 11 }}>
                {p.localPath}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <ProjectFormModal
          onCancel={() => setCreating(false)}
          onSave={async (p) => {
            await onUpsert(p);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
