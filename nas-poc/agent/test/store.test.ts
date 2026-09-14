import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PersistentJtiStore, FinalizeQueue, jobPayload } from "../src/store";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "agent-store-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("PersistentJtiStore", () => {
  it("dedup de jti e persistência entre instâncias (sobrevive a restart)", () => {
    const file = path.join(dir, "jti.json");
    const s1 = new PersistentJtiStore(file);
    expect(s1.claim("abc")).toBe(true);
    expect(s1.claim("abc")).toBe(false); // replay na mesma instância

    // Nova instância recarrega do disco — o replay continua bloqueado.
    const s2 = new PersistentJtiStore(file);
    expect(s2.claim("abc")).toBe(false);
    expect(s2.claim("def")).toBe(true);
  });

  it("expira jti vencido (sweep)", () => {
    const s = new PersistentJtiStore();
    const past = Math.floor(Date.now() / 1000) - 10;
    s.claim("old", past);
    // Como 'old' já venceu, um novo claim do mesmo jti é permitido após o sweep.
    expect(s.claim("old")).toBe(true);
  });
});

describe("FinalizeQueue", () => {
  it("enfileira, lista vencidos e remove; persiste entre instâncias", async () => {
    const file = path.join(dir, "q.json");
    const q1 = new FinalizeQueue(file);
    await q1.enqueue({ artifactId: "a1", checksum: "cs", sizeBytes: 10 });
    await q1.enqueue({ artifactId: "a2", checksum: null, sizeBytes: 20 });
    expect(q1.pending()).toBe(2);
    expect(
      q1
        .due()
        .map((j) => j.artifactId)
        .sort()
    ).toEqual(["a1", "a2"]);

    await q1.remove("a1");
    expect(q1.pending()).toBe(1);

    // Recarrega do disco.
    const q2 = new FinalizeQueue(file);
    expect(q2.pending()).toBe(1);
    expect(q2.due()[0].artifactId).toBe("a2");
  });

  it("[CRÍTICO] o MESMO artefato nunca vira dois jobs — senão o backoff não segura", async () => {
    // Dois relatos do mesmo artefato acontecem de verdade: a importação falha, a nuvem está fora,
    // o item volta para PENDING quando a reserva vence, é tentado de novo e falha de novo.
    //
    // Com dois jobs na fila, o recuo PARA DE FUNCIONAR: `reschedule` acha o primeiro (usa `find`)
    // e só ele recua; o segundo mantém o `nextAttemptAt` vencido e é retentado a cada tick, sem
    // pausa, contra uma nuvem que já está fora do ar. É o oposto do que o backoff existe para
    // fazer.
    const file = path.join(dir, "q-dedupe.json");
    const q = new FinalizeQueue(file);

    await q.enqueue({ artifactId: "a1", checksum: "cs1", sizeBytes: 10 });
    await q.enqueue({ artifactId: "a1", failed: true, reason: "SOURCE_REFUSED" });

    expect(q.pending()).toBe(1);
    // O relato que fica é o MAIS RECENTE: ele descreve o estado atual do artefato.
    const [job] = q.due();
    expect(job.failed).toBe(true);
    expect(job.reason).toBe("SOURCE_REFUSED");
    expect(job.checksum).toBeUndefined();
  });

  it("[CRÍTICO] o re-enfileiramento preserva o AGENDAMENTO, não o reinicia", async () => {
    // O recuo e a idade pertencem ao ARTEFATO, não ao relato. Se cada nova falha zerasse
    // `attempts`, o backoff recomeçaria do zero a cada rodada e o agente martelaria uma nuvem que
    // está fora — exatamente quando ela menos aguenta. E `createdAt` é o que decide a desistência
    // por idade: reiniciá-lo faria um job pendente há dias se dizer novo, para sempre.
    const file = path.join(dir, "q-dedupe2.json");
    const q = new FinalizeQueue(file);

    await q.enqueue({ artifactId: "a1", checksum: "cs1", sizeBytes: 10 });
    const criadoEm = q.due()[0].createdAt;
    await q.reschedule("a1", 5, Date.now() + 60_000);

    await q.enqueue({ artifactId: "a1", failed: true, reason: "TIMEOUT" });

    expect(q.pending()).toBe(1);
    const [job] = q.due(Date.now() + 120_000);
    expect(job.attempts, "o recuo acumulado não pode ser perdido").toBe(5);
    expect(job.createdAt, "a idade do problema é a mesma").toBe(criadoEm);
    expect(job.reason, "mas o relato é o novo").toBe("TIMEOUT");
    // E não voltou a vencer agora: o job segue esperando o recuo que já estava marcado.
    expect(q.due(Date.now())).toHaveLength(0);
  });

  it("reschedule adia o job (backoff)", async () => {
    const file = path.join(dir, "q2.json");
    const q = new FinalizeQueue(file);
    await q.enqueue({ artifactId: "a1", checksum: null, sizeBytes: 1 });
    const future = Date.now() + 60_000;
    await q.reschedule("a1", 2, future);
    expect(q.due(Date.now()).length).toBe(0); // adiado
    expect(q.due(future + 1)[0].attempts).toBe(2);
  });

  it("também enfileira a variante de falha (reason sobrevive à volta do disco)", async () => {
    const file = path.join(dir, "qf.json");
    const q1 = new FinalizeQueue(file);
    await q1.enqueue({
      artifactId: "a1",
      failed: true,
      reason: "PRIVATE_HOST",
      detail: "10.0.0.1",
    });
    expect(q1.pending()).toBe(1);
    expect(jobPayload(q1.due()[0])).toEqual({
      artifactId: "a1",
      failed: true,
      reason: "PRIVATE_HOST",
      detail: "10.0.0.1",
    });

    // Recarrega do disco — a variante de falha persiste como qualquer outro job.
    const q2 = new FinalizeQueue(file);
    expect(jobPayload(q2.due()[0])).toMatchObject({ failed: true, reason: "PRIVATE_HOST" });
  });

  it("um job no formato ANTIGO (gravado antes da variante de falha existir) continua virando payload de sucesso", () => {
    const file = path.join(dir, "qold.json");
    const jobAntigo = {
      artifactId: "a9",
      checksum: "cs9",
      sizeBytes: 99,
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 0,
    };
    writeFileSync(file, JSON.stringify([jobAntigo]));

    const q = new FinalizeQueue(file);
    const job = q.due(Number.MAX_SAFE_INTEGER)[0];
    expect(jobPayload(job)).toEqual({ artifactId: "a9", checksum: "cs9", sizeBytes: 99 });
  });
});
