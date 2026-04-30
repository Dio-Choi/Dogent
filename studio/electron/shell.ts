import { spawn } from "child_process";

export interface ShellOptions {
  cwd: string;
  command: string;
  args: string[];
}

export async function runShell(
  opts: ShellOptions,
  onLine: (line: string) => void
): Promise<{ exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: { ...process.env, FORCE_COLOR: "1" },
    });

    let buf = "";
    const handle = (data: Buffer): void => {
      buf += data.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        onLine(line);
      }
    };

    proc.stdout.on("data", handle);
    proc.stderr.on("data", handle);

    proc.on("close", (code) => {
      if (buf.length > 0) onLine(buf);
      resolve({ exitCode: code ?? 0 });
    });
  });
}
