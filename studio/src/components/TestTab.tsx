import { useEffect, useRef, useState } from "react";
import type { ProjectRecord } from "@shared/project";
import { codePath } from "@shared/project";

interface Props {
  project: ProjectRecord;
}

const DEFAULT_PRESETS: { label: string; cmd: string; args: string[] }[] = [
  { label: "npm test", cmd: "npm", args: ["test"] },
  { label: "npm run lint", cmd: "npm", args: ["run", "lint"] },
  { label: "npm run typecheck", cmd: "npm", args: ["run", "typecheck"] },
  { label: "npm run e2e", cmd: "npm", args: ["run", "e2e"] },
];

export function TestTab({ project }: Props): JSX.Element {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const outRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [output]);

  const run = async (cmd: string, args: string[]): Promise<void> => {
    setRunning(true);
    setOutput(`$ ${cmd} ${args.join(" ")}\n`);
    setExitCode(null);

    const cleanup = window.dogent.shell.onLine((line) => {
      setOutput((prev) => prev + line + "\n");
    });

    try {
      const res = await window.dogent.shell.run({ cwd: codePath(project), command: cmd, args });
      setExitCode(res.exitCode);
    } catch (e) {
      setOutput((prev) => prev + `\n[ERROR] ${(e as Error).message}\n`);
    } finally {
      cleanup();
      setRunning(false);
    }
  };

  const runCustom = (): void => {
    const parts = custom.trim().split(/\s+/);
    if (parts.length === 0) return;
    void run(parts[0], parts.slice(1));
  };

  return (
    <div className="col">
      <div className="card col">
        <div className="label">Quick run</div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {DEFAULT_PRESETS.map((p) => (
            <button key={p.label} disabled={running} onClick={() => run(p.cmd, p.args)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="label" style={{ marginTop: 12 }}>Custom command</div>
        <div className="row">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. pnpm test --watch"
            onKeyDown={(e) => {
              if (e.key === "Enter") runCustom();
            }}
          />
          <button onClick={runCustom} disabled={running || !custom.trim()}>Run</button>
        </div>
      </div>

      <div className="terminal" ref={outRef} style={{ flex: 1, minHeight: 320 }}>
        {output || "Output will appear here."}
      </div>

      {exitCode !== null && (
        <div className="card" style={{ borderColor: exitCode === 0 ? "var(--ok)" : "var(--danger)" }}>
          Exit code: <strong>{exitCode}</strong> {exitCode === 0 ? "✓ passed" : "✗ failed"}
        </div>
      )}
    </div>
  );
}
