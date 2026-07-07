// Persistência file-backed do agente (single-process, baixo volume). Sobrevive a restart sem dep
// nativa: jti (sync, é controle de segurança), fila de finalize e auditoria (async). Escrita atômica
// (tmp + rename); escritas async serializadas por arquivo.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { appendFile, rename, writeFile } from "node:fs/promises";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------- jti (persistente, síncrono) ----------

/** Rastreia jti de uso único, persistido a cada claim (sync — replay é uma janela crítica). */
export class PersistentJtiStore {
  private readonly seen = new Map<string, number>(); // jti -> exp (epoch s)

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, number>;
        for (const [j, e] of Object.entries(raw)) this.seen.set(j, e);
      } catch {
        /* arquivo corrompido — começa vazio */
      }
    }
  }

  /** Retorna false se o jti já foi reivindicado (replay). */
  claim(jti: string, exp?: number): boolean {
    this.sweep();
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, exp ?? nowSeconds() + 3600);
    this.persist();
    return true;
  }

  private sweep(): void {
    const n = nowSeconds();
    for (const [j, e] of this.seen) if (e < n) this.seen.delete(j);
  }

  private persist(): void {
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.seen)));
    renameSync(tmp, this.file);
  }

  get size(): number {
    return this.seen.size;
  }
}

// ---------- fila de finalize (persistente, async) ----------

export interface FinalizeJob {
  artifactId: string;
  checksum: string | null;
  sizeBytes: number;
  attempts: number;
  nextAttemptAt: number; // epoch ms
  createdAt: number;
}

export class FinalizeQueue {
  private jobs: FinalizeJob[] = [];
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      try {
        this.jobs = JSON.parse(readFileSync(file, "utf8")) as FinalizeJob[];
      } catch {
        this.jobs = [];
      }
    }
  }

  enqueue(job: { artifactId: string; checksum: string | null; sizeBytes: number }): Promise<void> {
    const now = Date.now();
    this.jobs.push({ ...job, attempts: 0, nextAttemptAt: now, createdAt: now });
    return this.persist();
  }

  /** Jobs cujo nextAttemptAt já venceu. */
  due(now: number = Date.now()): FinalizeJob[] {
    return this.jobs.filter((j) => j.nextAttemptAt <= now);
  }

  pending(): number {
    return this.jobs.length;
  }

  reschedule(artifactId: string, attempts: number, nextAttemptAt: number): Promise<void> {
    const j = this.jobs.find((x) => x.artifactId === artifactId);
    if (j) {
      j.attempts = attempts;
      j.nextAttemptAt = nextAttemptAt;
    }
    return this.persist();
  }

  remove(artifactId: string): Promise<void> {
    this.jobs = this.jobs.filter((x) => x.artifactId !== artifactId);
    return this.persist();
  }

  private persist(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    const tmp = `${file}.tmp`;
    const data = JSON.stringify(this.jobs);
    this.writing = this.writing.then(async () => {
      await writeFile(tmp, data);
      await rename(tmp, file);
    });
    return this.writing;
  }
}

// ---------- auditoria (append JSONL) ----------

export class AuditLog {
  constructor(private readonly file?: string) {}

  async append(event: Record<string, unknown>): Promise<void> {
    if (!this.file) return;
    try {
      await appendFile(
        this.file,
        JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n"
      );
    } catch {
      /* auditoria nunca quebra a ação principal */
    }
  }
}
