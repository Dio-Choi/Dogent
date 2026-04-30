import git from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";
import { FileEntry, GitConfig, StorageBackend } from "../types";
import { obsidianGitHttp as http } from "./git-http";

export class GitBackend implements StorageBackend {
  readonly kind = "git" as const;
  private fs: LightningFS;
  private dir = "/repo";

  constructor(private config: GitConfig) {
    const safeName = "dogent-vault-" + hashString(config.repoUrl + ":" + config.branch);
    this.fs = new LightningFS(safeName);
  }

  async push(files: FileEntry[]): Promise<void> {
    await this.ensureRepo();

    const subdir = this.normalizedSubdir();
    const trackedRoot = this.dir + (subdir ? "/" + subdir : "");

    await this.removeTrackedUnder(trackedRoot, new Set(files.map((f) => f.path)));

    for (const f of files) {
      const full = trackedRoot + "/" + f.path;
      await this.mkdirp(parentOf(full));
      await this.fs.promises.writeFile(full, new Uint8Array(f.data));
      const gitPath = (subdir ? subdir + "/" : "") + f.path;
      await git.add({ fs: this.fs, dir: this.dir, filepath: gitPath });
    }

    const status = await git.statusMatrix({ fs: this.fs, dir: this.dir });
    for (const [filepath, head, workdir, stage] of status) {
      if (workdir === 0 && head !== 0) {
        await git.remove({ fs: this.fs, dir: this.dir, filepath });
      }
    }

    const message = `Sync ${formatTimestamp(new Date())}`;
    await git.commit({
      fs: this.fs,
      dir: this.dir,
      message,
      author: { name: this.config.authorName, email: this.config.authorEmail },
    });

    await git.push({
      fs: this.fs,
      http,
      dir: this.dir,
      remote: "origin",
      ref: this.config.branch,
      onAuth: () => ({ username: this.config.token, password: "x-oauth-basic" }),
      force: false,
    });
  }

  async pull(): Promise<FileEntry[]> {
    await this.ensureRepo();
    await git.fetch({
      fs: this.fs,
      http,
      dir: this.dir,
      remote: "origin",
      ref: this.config.branch,
      singleBranch: true,
      onAuth: () => ({ username: this.config.token, password: "x-oauth-basic" }),
    });
    await git.checkout({
      fs: this.fs,
      dir: this.dir,
      ref: this.config.branch,
      force: true,
    });

    const subdir = this.normalizedSubdir();
    const trackedRoot = this.dir + (subdir ? "/" + subdir : "");
    return await this.readAll(trackedRoot, "");
  }

  private async ensureRepo(): Promise<void> {
    let exists = false;
    try {
      await this.fs.promises.stat(this.dir + "/.git");
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      try {
        await this.fs.promises.mkdir(this.dir);
      } catch {}
      await git.clone({
        fs: this.fs,
        http,
        dir: this.dir,
        url: this.config.repoUrl,
        ref: this.config.branch,
        singleBranch: true,
        depth: 1,
        onAuth: () => ({ username: this.config.token, password: "x-oauth-basic" }),
      });
    }
  }

  private async readAll(absRoot: string, rel: string): Promise<FileEntry[]> {
    const out: FileEntry[] = [];
    const here = rel ? absRoot + "/" + rel : absRoot;

    let names: string[] = [];
    try {
      names = await this.fs.promises.readdir(here);
    } catch {
      return out;
    }

    for (const name of names) {
      if (name === ".git") continue;
      const childRel = rel ? rel + "/" + name : name;
      const childAbs = here + "/" + name;
      const stat = await this.fs.promises.stat(childAbs);
      if (stat.isDirectory()) {
        out.push(...(await this.readAll(absRoot, childRel)));
      } else {
        const data = (await this.fs.promises.readFile(childAbs)) as Uint8Array;
        out.push({ path: childRel, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
      }
    }
    return out;
  }

  private async removeTrackedUnder(absRoot: string, keep: Set<string>): Promise<void> {
    const walk = async (rel: string): Promise<void> => {
      const here = rel ? absRoot + "/" + rel : absRoot;
      let names: string[] = [];
      try {
        names = await this.fs.promises.readdir(here);
      } catch {
        return;
      }
      for (const name of names) {
        if (name === ".git") continue;
        const childRel = rel ? rel + "/" + name : name;
        const childAbs = here + "/" + name;
        const stat = await this.fs.promises.stat(childAbs);
        if (stat.isDirectory()) {
          await walk(childRel);
          try {
            const remaining = await this.fs.promises.readdir(childAbs);
            if (remaining.length === 0) await this.fs.promises.rmdir(childAbs);
          } catch {}
        } else if (!keep.has(childRel)) {
          await this.fs.promises.unlink(childAbs);
        }
      }
    };
    await walk("");
  }

  private async mkdirp(path: string): Promise<void> {
    if (!path || path === "/" || path === this.dir) return;
    const parts = path.split("/").filter(Boolean);
    let cur = "";
    for (const p of parts) {
      cur += "/" + p;
      try {
        await this.fs.promises.mkdir(cur);
      } catch {}
    }
  }

  private normalizedSubdir(): string {
    let p = this.config.pathInRepo.trim();
    if (p === "" || p === "/") return "";
    if (p.startsWith("/")) p = p.slice(1);
    if (p.endsWith("/")) p = p.slice(0, -1);
    return p;
  }
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

function formatTimestamp(d: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
