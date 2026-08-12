import { describe, it, expect } from "vitest";
import {
  taskStatusTone,
  priorityTone,
  projectStatusTone,
  projectCompletionTone,
} from "@/lib/status-tone";

describe("projectStatusTone — status persistido do projeto", () => {
  it("ativo é success, inativo é neutral", () => {
    // Inativo NÃO é danger: arquivar um projeto é decisão normal de gestão,
    // não um problema a ser corrigido. Vermelho ali pediria uma ação que não
    // existe.
    expect(projectStatusTone("ACTIVE")).toBe("success");
    expect(projectStatusTone("INACTIVE")).toBe("neutral");
  });

  it("valor desconhecido cai em neutral (nunca alarme)", () => {
    expect(projectStatusTone("QUALQUER_COISA")).toBe("neutral");
  });
});

describe("projectCompletionTone — estado derivado de conclusão", () => {
  it("concluído é success", () => {
    expect(projectCompletionTone("completed")).toBe("success");
  });

  it("em andamento é NEUTRAL, não alerta", () => {
    // Um projeto pendente é o estado normal da maioria; pintá-lo de âmbar
    // deixaria o painel inteiro amarelo e o aviso perderia significado.
    expect(projectCompletionTone("pending")).toBe("neutral");
  });

  it("sem nenhuma tarefa ativa é warning (provável esquecimento)", () => {
    expect(projectCompletionTone("empty")).toBe("warning");
  });
});

describe("consistência dos tons já existentes", () => {
  it("status de tarefa mapeia para os tons esperados", () => {
    expect(taskStatusTone("IN_PROGRESS")).toBe("info");
    expect(taskStatusTone("COMPLETED")).toBe("success");
    expect(taskStatusTone("PAUSED")).toBe("warning");
    expect(taskStatusTone("CANCELLED")).toBe("danger");
    expect(taskStatusTone("OBSOLETE")).toBe("danger");
    expect(taskStatusTone("BACKLOG")).toBe("neutral");
  });

  it("todo tom devolvido pertence à paleta semântica", () => {
    // Guarda de P8/consistência: um tom fora da paleta viraria cor solta,
    // exatamente o que a migração para tokens eliminou.
    const palette = ["neutral", "info", "success", "warning", "danger"];
    const all = [
      ...["ACTIVE", "INACTIVE", "?"].map(projectStatusTone),
      ...["completed", "pending", "empty", "?"].map(projectCompletionTone),
      ...["IN_PROGRESS", "COMPLETED", "PAUSED", "CANCELLED", "OBSOLETE", "BACKLOG"].map(
        taskStatusTone
      ),
      ...["LOW", "MEDIUM", "HIGH", "URGENT", "?"].map(priorityTone),
    ];
    for (const tone of all) expect(palette).toContain(tone);
  });
});
