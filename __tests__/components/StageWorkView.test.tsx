import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { StageWorkView } from "@/components/tasks/StageWorkView";
import type { StageView } from "@/lib/actions/stage-view";

// next-intl: ecoa a chave (sem namespace) — é assim que o teste verifica QUAL chave
// cada trecho da tela usa, sem depender do texto traduzido.
vi.mock("next-intl", () => ({
  // Ecoa a chave e, quando há parâmetros, também os valores — é assim que estes testes afirmam a
  // NUMERAÇÃO das correções sem depender do texto traduzido.
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key}:${Object.values(vals).join("|")}` : key,
  useLocale: () => "pt-BR",
}));

// AddCommentForm tem dependências pesadas (server action, toast) que nada aqui exercita —
// só a PRESENÇA do wrapper importa para estes testes, não o formulário em si.
vi.mock("@/components/tasks/AddCommentForm", () => ({
  AddCommentForm: () => <div data-testid="add-comment-form-stub" />,
}));

// Painel de artefatos tem sua própria árvore de hooks (useRouter, upload NAS, versionamento) —
// já testada em separado. Aqui só a PRESENÇA do painel na etapa importa (Task 9), não o miolo dele
// — igual ao que `TaskDetailView.test.tsx` já faz.
vi.mock("@/components/artifacts/UnifiedArtifactsPanel", () => ({
  // O stub carrega `canAdd`/`canRemove` para fora: é o PORTÃO que estes testes examinam, e ele
  // vive na chamada do painel, não dentro dele.
  UnifiedArtifactsPanel: ({ canAdd, canRemove }: { canAdd: boolean; canRemove: boolean }) => (
    <div
      data-testid="artifacts-panel-stub"
      data-can-add={String(canAdd)}
      data-can-remove={String(canRemove)}
    />
  ),
}));

// Task 9: os botões de ação (antes só na demanda) passam a morar aqui. As Server Actions por trás
// deles são pesadas (prisma, next-intl/server, auth) e já têm teste próprio — aqui só a
// MONTAGEM dos botões na tela da etapa importa.
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));
vi.mock("@/lib/actions/activity", () => ({
  startWorkOnTask: vi.fn(),
  stopWorkOnTask: vi.fn(),
}));
vi.mock("@/lib/actions/task", () => ({
  logTime: vi.fn(),
  completeStageAndAdvance: vi.fn(),
  getStageCompletionContext: vi.fn().mockResolvedValue({ loggedHours: 0, referenceHours: 0 }),
  revertTaskStage: vi.fn(),
  unassignActiveStage: vi.fn(),
}));
vi.mock("@/lib/actions/stage-assignment", () => ({
  previewNextStages: vi.fn().mockResolvedValue({ activated: [], blocked: [] }),
  getTeamMembers: vi.fn().mockResolvedValue([]),
}));

/**
 * Mesma etapa e mesma demanda usadas em `__tests__/lib/actions/stage-view.test.ts`, para que
 * este teste e o do fetch fiquem falando da mesma etapa (`as2`) no mesmo vocabulário.
 */
const VIEW: StageView = {
  stage: {
    activeStageId: "as2",
    templateStageId: "ts2",
    name: "Gravação",
    order: 2,
    status: "ACTIVE",
    teamName: "Vídeo",
    assignee: { id: "u1", name: "Ana" },
    instruction: "Gravar no estúdio B",
    canPerformActions: true,
  },
  task: {
    id: "t1",
    title: "Reels de setembro",
    dueDate: new Date("2026-09-10T00:00:00Z"),
    projectId: "p1",
    projectName: "Campanha institucional",
    clientId: "c1",
    clientName: "ACME",
  },
  previousStages: [],
  activeLog: null,
  artifactRows: [],
  canManageScoped: false,
  comments: [
    {
      id: "c1",
      content: "oi",
      createdAt: new Date("2026-09-01T09:00:00Z"),
      kind: "USER",
      activeStageId: null,
      author: { id: "u2", name: "Beto" },
    },
    {
      id: "c2",
      content: "Gravar no estúdio B",
      createdAt: new Date("2026-09-01T10:00:00Z"),
      kind: "STAGE_INSTRUCTION",
      activeStageId: "as2",
      author: { id: "gestor1", name: "Gestora" },
    },
    {
      id: "c3",
      content: "combinado, obrigado",
      createdAt: new Date("2026-09-01T11:00:00Z"),
      kind: "USER",
      activeStageId: null,
      author: { id: "u1", name: "Ana" },
    },
  ],
};

/** A mesma etapa, depois de duas reversões: o brief e as duas correções, todos presos a `as2`. */
const VIEW_COM_CORRECOES: StageView = {
  ...VIEW,
  comments: [
    VIEW.comments[0],
    VIEW.comments[1],
    VIEW.comments[2],
    {
      id: "r1",
      content: "Medidas inconsistentes — deveria ser 1080px",
      createdAt: new Date("2026-09-02T14:00:00Z"),
      kind: "STAGE_INSTRUCTION",
      activeStageId: "as2",
      author: { id: "u3", name: "Carla" },
    },
    {
      id: "r2",
      content: "Cores alteradas a pedido do cliente",
      createdAt: new Date("2026-09-03T09:00:00Z"),
      kind: "STAGE_INSTRUCTION",
      activeStageId: "as2",
      author: { id: "u2", name: "Beto" },
    },
    // Instrução de OUTRA etapa: contexto da demanda, não direção do trabalho de agora.
    {
      id: "outra",
      content: "Edição precisa de legenda",
      createdAt: new Date("2026-09-02T16:00:00Z"),
      kind: "STAGE_INSTRUCTION",
      activeStageId: "as9",
      author: { id: "gestor1", name: "Gestora" },
    },
  ],
};

describe("StageWorkView — o bloco acumula as correções", () => {
  it("lista o brief e as correções na ordem, numerando só as correções", () => {
    // Quem vai refazer precisa da direção original E do que voltou, no mesmo lugar. Antes o brief
    // estava no destaque e os motivos de reversão só na conversa, longe — de forma que o bloco em
    // evidência mostrava exatamente o que já estava errado, sem o que explica o retorno.
    render(<StageWorkView view={VIEW_COM_CORRECOES} currentUserId="u1" />);
    const bloco = screen.getByTestId("stage-instruction");

    expect(bloco).toHaveTextContent("Gravar no estúdio B");
    expect(bloco).toHaveTextContent("Medidas inconsistentes");
    expect(bloco).toHaveTextContent("Cores alteradas a pedido do cliente");
    // O brief não é uma correção; a numeração começa na primeira reversão.
    expect(bloco).toHaveTextContent("stageView.revertLabel:1");
    expect(bloco).toHaveTextContent("stageView.revertLabel:2");
    expect(bloco).not.toHaveTextContent("stageView.revertLabel:3");
  });

  it("cada linha diz quem escreveu", () => {
    // É por isso que o texto não é acumulado num campo só: uma string perde o autor, e "quem pediu
    // esta correção" é a primeira pergunta de quem discorda dela.
    render(<StageWorkView view={VIEW_COM_CORRECOES} currentUserId="u1" />);
    const bloco = screen.getByTestId("stage-instruction");
    expect(bloco).toHaveTextContent("Gestora");
    expect(bloco).toHaveTextContent("Carla");
    expect(bloco).toHaveTextContent("Beto");
  });

  it("as instruções DESTA etapa somem da conversa — elas moram no bloco", () => {
    render(<StageWorkView view={VIEW_COM_CORRECOES} currentUserId="u1" />);
    const conversa = screen.getByTestId("comments-section");
    expect(conversa).not.toHaveTextContent("Medidas inconsistentes");
    expect(conversa).not.toHaveTextContent("Gravar no estúdio B");
  });

  it("a instrução de OUTRA etapa continua na conversa", () => {
    // Da tela da Gravação, o que voltou a Edição é contexto da demanda, não direção do trabalho de
    // agora. Some do bloco desta etapa, permanece na história.
    render(<StageWorkView view={VIEW_COM_CORRECOES} currentUserId="u1" />);
    expect(screen.getByTestId("comments-section")).toHaveTextContent("Edição precisa de legenda");
  });

  it("demanda ANTERIOR à feature cai no campo bruto, em vez de perder a instrução", () => {
    // Não houve backfill: essas demandas têm `instructions` preenchido e nenhum comentário de
    // instrução. Trocar a fonte sem esta queda apagaria a instrução da tela delas.
    const legado: StageView = { ...VIEW, comments: [VIEW.comments[0]] };
    render(<StageWorkView view={legado} currentUserId="u1" />);
    expect(screen.getByTestId("stage-instruction")).toHaveTextContent("Gravar no estúdio B");
  });

  it("sem instrução nenhuma, não há bloco", () => {
    const semNada: StageView = {
      ...VIEW,
      stage: { ...VIEW.stage, instruction: null },
      comments: [VIEW.comments[0]],
    };
    render(<StageWorkView view={semNada} currentUserId="u1" />);
    expect(screen.queryByTestId("stage-instruction")).not.toBeInTheDocument();
  });
});

describe("StageWorkView", () => {
  it("mostra a instrução da etapa em destaque, com título próprio", () => {
    render(<StageWorkView view={VIEW} currentUserId="u1" />);
    const destaque = screen.getByTestId("stage-instruction");
    expect(destaque).toHaveTextContent("stageView.instructionTitle");
    expect(destaque).toHaveTextContent("Gravar no estúdio B");
  });

  it("a conversa é a da DEMANDA — só as instruções DESTA etapa saem dela", () => {
    // Realçar, não filtrar: quem opera precisa do contexto inteiro, e um teste que só contasse os
    // comentários da etapa passaria numa implementação que filtra — o oposto da decisão.
    //
    // A ÚNICA saída é deliberada e veio depois: a instrução desta etapa e as correções dela subiram
    // para o bloco em destaque, e repeti-las aqui poria a mesma linha duas vezes na mesma tela.
    // Por isso a asserção mudou de "as três" para "as de conversa mais as instruções de OUTRAS
    // etapas" — o que ela protege continua sendo o mesmo: a conversa não encolhe para esta etapa.
    render(<StageWorkView view={VIEW_COM_CORRECOES} currentUserId="u1" />);
    const conversa = screen.getByTestId("comments-section");

    expect(conversa).toHaveTextContent("oi");
    expect(conversa).toHaveTextContent("combinado, obrigado");
    expect(conversa).toHaveTextContent("Edição precisa de legenda");
    expect(screen.getAllByTestId("comment")).toHaveLength(3);
    expect(screen.getByTestId("comment-c1")).toHaveAttribute("data-this-stage", "false");
  });

  it("etapa concluída AINDA oferece caixa de escrever", () => {
    // Invertido de propósito na revisão final. A regra "etapa concluída é leitura" foi inventada
    // pelo plano — ninguém pediu, e `addComment` só exige MEMBER+. Duas razões para removê-la:
    // uma conversa não deixa de ser útil quando a etapa fecha (é justamente aí que se combina o
    // que ficou faltando); e, numa demanda terminada, TODA etapa está COMPLETED — com /tasks/{id}
    // em leitura e /admin restrito a MANAGER+, esconder a caixa aqui deixava MEMBER e SUPERVISOR
    // sem NENHUM lugar para falar sobre a demanda.
    render(
      <StageWorkView
        view={{ ...VIEW, stage: { ...VIEW.stage, status: "COMPLETED" } }}
        currentUserId="u1"
      />
    );
    expect(screen.getByTestId("add-comment")).toBeInTheDocument();
  });

  it("a etapa ativa oferece as ações dela", () => {
    // Estas ações moravam na tela da demanda, escolhendo sozinhas qual etapa ativa operar. Com
    // fork/join várias etapas podem estar ACTIVE ao mesmo tempo — só a tela DESTA etapa sabe, sem
    // adivinhar, qual delas é.
    render(<StageWorkView view={VIEW} currentUserId="u1" />);
    for (const testid of ["activity-button", "log-time", "advance-stage"]) {
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    }
  });

  // Fix round 1: o portão da tela precisa espelhar o guarda de CADA botão no servidor, não um
  // portão único largo (esconde `revertTaskStage` aceitando BLOCKED) nem um único estreito
  // (esconde `logTime`, que não exige etapa ACTIVE nenhuma).

  it("etapa BLOCKED mostra reverter, mas não avançar/desatribuir — mesma regra de revertTaskStage", () => {
    // `revertTaskStage` aceita a demanda ter etapa ACTIVE OU BLOCKED; `completeStageAndAdvance` e
    // `unassignActiveStage` só aceitam ACTIVE. Exigir ACTIVE para reverter também escondia o botão
    // exatamente na situação em que ele mais serve: uma etapa travada.
    render(
      <StageWorkView
        view={{
          ...VIEW,
          stage: { ...VIEW.stage, status: "BLOCKED" },
          previousStages: [{ id: "ts1", name: "Roteiro", order: 1 }],
        }}
        currentUserId="u1"
      />
    );
    expect(screen.getByRole("button", { name: /triggerButton/ })).toBeInTheDocument();
    expect(screen.queryByTestId("advance-stage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-button")).not.toBeInTheDocument();
  });

  it("reverter NÃO mora no bloco de ações desta etapa — é poder da DEMANDA", () => {
    // `revertTaskStage` reverte a demanda inteira: sob fork/join ela derruba também uma etapa
    // paralela que não está nesta tela. Dentro do card "ações desta etapa" o botão lia-se como
    // "reverter esta etapa" — a mesma leitura falsa que o admin já corrigiu ao tirá-lo da lista
    // por etapa e pô-lo junto do `CompleteTaskButton`. A tela da etapa passa a apresentá-lo do
    // mesmo jeito.
    render(
      <StageWorkView
        view={{ ...VIEW, previousStages: [{ id: "ts1", name: "Roteiro", order: 1 }] }}
        currentUserId="u1"
      />
    );
    const reverter = screen.getByRole("button", { name: /triggerButton/ });
    expect(screen.getByTestId("stage-actions")).not.toContainElement(reverter);
    expect(screen.getByTestId("demand-actions")).toContainElement(reverter);
  });

  it("etapa COMPLETED ainda oferece anexar artefato — prepareArtifactUpload não exige etapa ativa", () => {
    // `prepareArtifactUpload` só checa `requireMemberOrHigher`: nem status de etapa, nem ser o
    // responsável por ela. Prendendo `canAdd` ao ACTIVE, um SUPERVISOR perdia o único caminho que
    // lhe restava para anexar numa demanda sem etapa ativa — /tasks/{id} virou leitura e /admin é
    // MANAGER+. É o mesmo defeito já corrigido para `logTime`.
    render(
      <StageWorkView
        view={{ ...VIEW, stage: { ...VIEW.stage, status: "COMPLETED" } }}
        currentUserId="u1"
      />
    );
    expect(screen.getByTestId("artifacts-panel-stub")).toHaveAttribute("data-can-add", "true");
  });

  it("quem não pode agir na etapa não anexa — o portão é o papel, não o status", () => {
    render(
      <StageWorkView
        view={{ ...VIEW, stage: { ...VIEW.stage, canPerformActions: false } }}
        currentUserId="u9"
      />
    );
    expect(screen.getByTestId("artifacts-panel-stub")).toHaveAttribute("data-can-add", "false");
  });

  it("etapa COMPLETED ainda oferece apontar hora — logTime não exige etapa ativa nenhuma", () => {
    // `logTime` só checa `requireMemberOrHigher`. Prender ao status ACTIVE tirava de um gestor o
    // único caminho de lançar/corrigir hora numa demanda já concluída — perda de função pura.
    render(
      <StageWorkView
        view={{ ...VIEW, stage: { ...VIEW.stage, status: "COMPLETED" } }}
        currentUserId="u1"
      />
    );
    expect(screen.getByTestId("log-time")).toBeInTheDocument();
    expect(screen.queryByTestId("advance-stage")).not.toBeInTheDocument();
  });
});
