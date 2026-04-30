import { useState } from "react";
import type { ProjectRecord, SecretsShape } from "@shared/project";
import { RunTab } from "../components/RunTab";
import { TestTab } from "../components/TestTab";
import { DeployTab } from "../components/DeployTab";
import { ProjectFormModal } from "../components/ProjectFormModal";

interface Props {
  project: ProjectRecord;
  secrets: SecretsShape;
  onUpdate: (p: ProjectRecord) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBack: () => void;
}

type Tab = "run" | "test" | "deploy";

export function ProjectView({ project, secrets, onUpdate, onDelete, onBack }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>("run");
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="ghost" onClick={onBack}>← Back</button>
        <h2 style={{ margin: 0, marginLeft: 8 }}>{project.name}</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditing(true)}>Edit</button>
      </div>

      <div className="tabs">
        <button className={tab === "run" ? "active" : ""} onClick={() => setTab("run")}>
          Run
        </button>
        <button className={tab === "test" ? "active" : ""} onClick={() => setTab("test")}>
          Test
        </button>
        <button className={tab === "deploy" ? "active" : ""} onClick={() => setTab("deploy")}>
          Deploy
        </button>
      </div>

      {tab === "run" && <RunTab project={project} secrets={secrets} />}
      {tab === "test" && <TestTab project={project} />}
      {tab === "deploy" && <DeployTab project={project} secrets={secrets} onUpdate={onUpdate} />}

      {editing && (
        <ProjectFormModal
          initial={project}
          onCancel={() => setEditing(false)}
          onSave={async (p) => {
            await onUpdate(p);
            setEditing(false);
          }}
          onDelete={async () => {
            await onDelete(project.id);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
