import { useEffect, useState } from "react";
import type { ProjectRecord, ProjectStore, SecretsShape } from "@shared/project";
import { ProjectList } from "./pages/ProjectList";
import { ProjectView } from "./pages/ProjectView";
import { Settings } from "./pages/Settings";
import "./types";

type Page = { kind: "list" } | { kind: "project"; id: string } | { kind: "settings" };

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>({ kind: "list" });
  const [store, setStore] = useState<ProjectStore>({ projects: [] });
  const [secrets, setSecrets] = useState<SecretsShape>({});

  useEffect(() => {
    void window.dogent.projects.list().then(setStore);
    void window.dogent.secrets.get().then((s) => setSecrets(s as SecretsShape));
  }, []);

  const onUpsertProject = async (p: ProjectRecord): Promise<void> => {
    const next = await window.dogent.projects.upsert(p);
    setStore(next);
  };

  const onDeleteProject = async (id: string): Promise<void> => {
    const next = await window.dogent.projects.delete(id);
    setStore(next);
    setPage({ kind: "list" });
  };

  const onSaveSecrets = async (s: SecretsShape): Promise<void> => {
    const next = await window.dogent.secrets.set(s as Record<string, string>);
    setSecrets(next as SecretsShape);
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setPage({ kind: "list" })}>
          Dogent Studio
        </button>
        <div className="topbar-spacer" />
        <button className="ghost" onClick={() => setPage({ kind: "settings" })}>
          Settings
        </button>
      </header>

      <main className="content">
        {page.kind === "list" && (
          <ProjectList
            projects={store.projects}
            onOpen={(id) => setPage({ kind: "project", id })}
            onUpsert={onUpsertProject}
          />
        )}
        {page.kind === "project" && (
          <ProjectView
            project={store.projects.find((p) => p.id === page.id)!}
            secrets={secrets}
            onUpdate={onUpsertProject}
            onDelete={onDeleteProject}
            onBack={() => setPage({ kind: "list" })}
          />
        )}
        {page.kind === "settings" && <Settings secrets={secrets} onSave={onSaveSecrets} />}
      </main>
    </div>
  );
}
