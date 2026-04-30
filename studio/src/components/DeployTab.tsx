import { useEffect, useRef, useState } from "react";
import type { ProjectRecord, SecretsShape } from "@shared/project";
import { codePath } from "@shared/project";

interface Props {
  project: ProjectRecord;
  secrets: SecretsShape;
  onUpdate: (p: ProjectRecord) => Promise<void>;
}

export function DeployTab({ project, secrets }: Props): JSX.Element {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const outRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [output]);

  const run = async (cmd: string, args: string[], extraEnv: Record<string, string> = {}): Promise<void> => {
    setRunning(true);
    setOutput(`$ ${cmd} ${args.join(" ")}\n`);
    setExitCode(null);

    const cleanup = window.dogent.shell.onLine((line) => {
      setOutput((prev) => prev + line + "\n");
    });

    try {
      // Note: env vars set on the host shell would need IPC support.
      // For now we pass tokens via well-known env names that the CLI will pick up
      // if the user has them in their shell, or we instruct them to set Settings.
      const _envHint = extraEnv;
      const res = await window.dogent.shell.run({
        cwd: codePath(project),
        command: cmd,
        args,
      });
      setExitCode(res.exitCode);
    } catch (e) {
      setOutput((prev) => prev + `\n[ERROR] ${(e as Error).message}\n`);
    } finally {
      cleanup();
      setRunning(false);
    }
  };

  const deployVercel = async (): Promise<void> => {
    if (!secrets.vercelToken) {
      setOutput("Set your Vercel token in Settings first.");
      return;
    }
    const args = ["--token", secrets.vercelToken, "--yes"];
    if (project.deploy.vercelProject) args.push("--name", project.deploy.vercelProject);
    args.push("--prod");
    await run("vercel", args);
  };

  const deployAwsS3 = async (): Promise<void> => {
    if (!secrets.awsAccessKeyId || !secrets.awsSecretAccessKey) {
      setOutput("Set your AWS credentials in Settings first.");
      return;
    }
    if (!project.deploy.awsBucket) {
      setOutput("Set your S3 bucket in project settings first.");
      return;
    }
    // Expectation: the build output is in `dist/` or `build/`. We sync `dist/` by default.
    await run(
      "aws",
      [
        "s3",
        "sync",
        "dist/",
        `s3://${project.deploy.awsBucket}/`,
        "--delete",
        "--region",
        project.deploy.awsRegion ?? "us-east-1",
      ],
      {
        AWS_ACCESS_KEY_ID: secrets.awsAccessKeyId,
        AWS_SECRET_ACCESS_KEY: secrets.awsSecretAccessKey,
      }
    );
  };

  const target = project.deploy.target;

  return (
    <div className="col">
      <div className="card col">
        <div className="row">
          <div>
            <div className="label">Target</div>
            <div style={{ fontWeight: 600 }}>
              {target === "none" ? "Not configured (set in project settings)" : target}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {target === "vercel" && (
            <button className="primary" onClick={deployVercel} disabled={running}>
              Deploy to Vercel
            </button>
          )}
          {target === "aws-s3" && (
            <button className="primary" onClick={deployAwsS3} disabled={running}>
              Deploy to AWS S3
            </button>
          )}
        </div>

        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 10 }}>
          {target === "vercel" &&
            "Runs `vercel --prod` in your project directory. Make sure the Vercel CLI is installed (`npm i -g vercel`)."}
          {target === "aws-s3" &&
            "Runs `aws s3 sync dist/ s3://bucket/` in your project directory. Build the project first."}
          {target === "none" && "Choose a deploy target by editing the project."}
        </p>
      </div>

      <div className="terminal" ref={outRef} style={{ flex: 1, minHeight: 320 }}>
        {output || "Deploy output will appear here."}
      </div>

      {exitCode !== null && (
        <div className="card" style={{ borderColor: exitCode === 0 ? "var(--ok)" : "var(--danger)" }}>
          Exit code: <strong>{exitCode}</strong> {exitCode === 0 ? "✓ deployed" : "✗ failed"}
        </div>
      )}
    </div>
  );
}
