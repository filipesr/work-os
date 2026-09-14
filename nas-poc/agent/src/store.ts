// Persistência file-backed do agente (single-process, baixo volume). Sobrevive a restart sem dep
// nativa: jti (sync, é controle de segurança), fila de finalize e auditoria (async). Escrita atômica
// (tmp + rename); escritas async serializadas por arquivo.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { appendFile, rename, writeFile } from "node:fs/promises";
import type { FinalizePayload } from "./finalize.js";

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

// O job na fila é o MESMO payload que vai para callFinalize (sucesso OU falha — a variante com
// `failed: true` é a que faz a promessa "a falha guarda o motivo" sobreviver a uma nuvem fora do
// ar), mais os três campos de agendamento do worker que já drenava a fila. Um job gravado antes
// desta variante existir não tem `failed` — ele cai por construção na variante de sucesso quando
// lido de volta, então o formato novo não invalida o arquivo de fila existente.
export type FinalizeJob = FinalizePayload & {
  attempts: number;
  nextAttemptAt: number; // epoch ms
  createdAt: number;
};

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

  /**
   * Põe (ou ATUALIZA) o relato pendente de um artefato. No máximo UM job por artefato.
   *
   * O mesmo artefato relatado duas vezes é situação normal — a importação falha, a nuvem está
   * fora, a reserva vence, o item volta para PENDING e é tentado de novo. Empilhando, o recuo
   * PARAVA DE FUNCIONAR: `reschedule` encontra o primeiro job (usa `find`) e só ele recua; o
   * segundo mantém o `nextAttemptAt` já vencido e é retentado a cada tick, sem pausa, contra uma
   * nuvem que já está fora do ar. O oposto do que o backoff existe para fazer.
   *
   * O PAYLOAD que fica é o novo — ele descreve o estado atual do artefato. O AGENDAMENTO é o
   * antigo, porque recuo e idade pertencem ao artefato, não ao relato: zerar `attempts` a cada
   * falha faria o backoff recomeçar do zero toda rodada, e reiniciar `createdAt` faria um job
   * pendente há dias se dizer novo para sempre, escapando da desistência por idade.
   */
  enqueue(job: FinalizePayload): Promise<void> {
    const now = Date.now();
    const i = this.jobs.findIndex((x) => x.artifactId === job.artifactId);
    if (i >= 0) {
      const { attempts, nextAttemptAt, createdAt } = this.jobs[i];
      this.jobs[i] = { ...job, attempts, nextAttemptAt, createdAt } as FinalizeJob;
    } else {
      this.jobs.push({ ...job, attempts: 0, nextAttemptAt: now, createdAt: now } as FinalizeJob);
    }
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

/**
 * Despe os campos de agendamento (attempts/nextAttemptAt/createdAt) de um job da fila,
 * devolvendo exatamente o payload que callFinalize espera. Um job antigo — gravado antes da
 * variante de falha existir, sem o campo `failed` — sobra com {artifactId, checksum, sizeBytes}
 * e cai naturalmente na variante de sucesso: nenhum código extra de migração é necessário.
 */
export function jobPayload(job: FinalizeJob): FinalizePayload {
  const {
    attempts: _attempts,
    nextAttemptAt: _nextAttemptAt,
    createdAt: _createdAt,
    ...payload
  } = job;
  return payload;
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
