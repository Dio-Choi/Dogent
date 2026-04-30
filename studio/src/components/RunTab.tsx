import { useEffect, useRef, useState } from "react";
import type { ProjectRecord, SecretsShape } from "@shared/project";

interface Props {
  project: ProjectRecord;
  secrets: SecretsShape;
}

export function RunTab({ project, secrets }: Props): JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [conventions, setConventions] = useState("");
  const outRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.dogent.fs
      .readFile(`${project.localPath}/.dogent/conventions.md`)
      .then((c) => setConventions(c ?? ""));
  }, [project.localPath]);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [output]);

  const run = async (): Promise<void> => {
    if (!secrets.anthropicApiKey) {
      setOutput("Set your Anthropic API key in Settings first.");
      return;
    }
    if (!prompt.trim()) return;

    setRunning(true);
    setOutput("");

    const cleanup = window.dogent.claude.onChunk((chunk) => {
      setOutput((prev) => prev + chunk);
    });

    try {
      const system = buildSystemPrompt(project, conventions);
      await window.dogent.claude.run({
        apiKey: secrets.anthropicApiKey,
        model: "claude-sonnet-4-6",
        system,
        cwd: project.localPath,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (e) {
      setOutput((prev) => prev + `\n\n[ERROR] ${(e as Error).message}`);
    } finally {
      cleanup();
      setRunning(false);
    }
  };

  return (
    <div className="split">
      <div className="left col">
        <div className="card col">
          <div className="label">Prompt</div>
          <textarea
            rows={8}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what to build, fix, or refactor..."
          />
          <div className="row">
            <button className="primary" onClick={run} disabled={running}>
              {running ? "Running..." : "Run"}
            </button>
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              Working dir: {project.localPath}
            </span>
          </div>
        </div>

        {conventions && (
          <details className="card">
            <summary style={{ cursor: "pointer", color: "var(--text-dim)" }}>
              Loaded conventions ({conventions.length} chars)
            </summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 10 }}>
              {conventions.slice(0, 500)}
              {conventions.length > 500 ? "\n..." : ""}
            </pre>
          </details>
        )}
      </div>

      <div className="right">
        <div className="terminal" ref={outRef} style={{ height: "100%" }}>
          {output || "Output will appear here."}
        </div>
      </div>
    </div>
  );
}

function buildSystemPrompt(project: ProjectRecord, conventions: string): string {
  return [
    `You are an AI engineer working on the project "${project.name}".`,
    `Working directory: ${project.localPath}`,
    `Vault backend: ${project.backend.kind}`,
    `Deploy target: ${project.deploy.target}`,
    "",
    "The project's specs and design notes live in this directory as Obsidian markdown files.",
    "Treat [[wikilinks]] as references to other notes; resolve them by reading the linked file.",
    "When asked to implement, edit files in the working directory and explain what you did.",
    "",
    conventions ? `Project conventions:\n\n${conventions}` : "No project-specific conventions provided.",
  ].join("\n");
}
