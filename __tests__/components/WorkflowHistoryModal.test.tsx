import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowHistoryModal } from "@/components/tasks/WorkflowHistoryModal";

// O trigger do modal marca o `title` com `t("tooltip")`. O mock abaixo ecoa a chave crua, exceto
// para essa — devolve o literal "history" (em inglês mesmo, é só fixture de teste) pra casar com
// o nome acessível que os testes buscam no botão. Nenhuma outra chave usada aqui precisa de valor
// específico.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "tooltip" ? "history" : key),
  useLocale: () => "pt-BR",
}));

// Três etapas de um mesmo template, cada uma com sua linha `TaskActiveStage` nesta demanda —
// é essa linha (não o `TemplateStage`) que `TaskComment.activeStageId` referencia.
const ETAPA_1 = {
  id: "ts1",
  name: "Roteiro",
  order: 1,
  templateId: "tpl1",
  expectedDurationHours: null,
  wipLimit: null,
  defaultTeamId: null,
  optional: false,
  defaultTeam: null,
};
const ETAPA_2 = { ...ETAPA_1, id: "ts2", name: "Arte", order: 2 };
const ETAPA_3 = { ...ETAPA_1, id: "ts3", name: "Revisão", order: 3 };

const ANA = { id: "u-ana", name: "Ana", email: "ana@x.com", image: null };

// A mesma pessoa passou pelas três etapas — o cenário exato do defeito: atribuir por AUTOR faria
// o comentário dela aparecer nas três, porque ela tem log em todas.
const TRES_LOGS_DA_MESMA_PESSOA = [
  {
    id: "log1",
    enteredAt: new Date("2026-01-01"),
    exitedAt: new Date("2026-01-02"),
    status: "COMPLETED" as const,
    taskId: "t1",
    stageId: "ts1",
    userId: "u-ana",
    stage: ETAPA_1,
    user: ANA,
  },
  {
    id: "log2",
    enteredAt: new Date("2026-01-02"),
    exitedAt: new Date("2026-01-03"),
    status: "COMPLETED" as const,
    taskId: "t1",
    stageId: "ts2",
    userId: "u-ana",
    stage: ETAPA_2,
    user: ANA,
  },
  {
    id: "log3",
    enteredAt: new Date("2026-01-03"),
    exitedAt: new Date("2026-01-04"),
    status: "COMPLETED" as const,
    taskId: "t1",
    stageId: "ts3",
    userId: "u-ana",
    stage: ETAPA_3,
    user: ANA,
  },
];

// O comentário nasceu na etapa 2 (`activeStageId: "as2"`) — é ali, e só ali, que deve aparecer.
const COMENTARIO_DA_ETAPA_2 = {
  id: "c1",
  content: "faltou o off na trilha, precisa regravar",
  createdAt: new Date("2026-01-02T12:00:00Z"),
  taskId: "t1",
  userId: "u-ana",
  activeStageId: "as2",
  kind: "USER" as const,
  user: ANA,
};

const PROPS = {
  allStages: [ETAPA_1, ETAPA_2, ETAPA_3],
  artifacts: [],
  // Mapa etapa de template -> linha da demanda, o que o componente agora exige da página em vez
  // de adivinhar sozinho.
  activeStages: [
    { id: "as1", stageId: "ts1" },
    { id: "as2", stageId: "ts2" },
    { id: "as3", stageId: "ts3" },
  ],
  currentUserId: "u-ana",
  currentStageId: null,
};

describe("WorkflowHistoryModal", () => {
  it("[CRÍTICO] um comentário aparece em UMA etapa, não em todas as que o autor passou", () => {
    // O defeito de hoje: a atribuição é pelo AUTOR (`stageLogs.some(log => log.userId === c.userId)`),
    // então quem trabalhou em três etapas tem todos os comentários repetidos nas três, e comentário
    // de quem nunca teve log não aparece em nenhuma.
    render(
      <WorkflowHistoryModal
        comments={[COMENTARIO_DA_ETAPA_2]}
        stageLogs={TRES_LOGS_DA_MESMA_PESSOA}
        {...PROPS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /history/ }));
    expect(screen.getAllByText(/faltou o off/)).toHaveLength(1);
  });

  it("comentário da DEMANDA (activeStageId nulo) não aparece em etapa nenhuma", () => {
    // O gestor que escreve "o cliente adiou tudo" em /admin não está falando de uma etapa — é
    // conversa da demanda inteira. Repeti-lo sob uma etapa qualquer inventaria um vínculo que não
    // existe, o mesmo problema de origem, só que de outra forma.
    const comentarioDaDemanda = {
      ...COMENTARIO_DA_ETAPA_2,
      id: "c-demanda",
      content: "o cliente adiou tudo, aguardando novo prazo",
      activeStageId: null,
    };
    render(
      <WorkflowHistoryModal
        comments={[comentarioDaDemanda]}
        stageLogs={TRES_LOGS_DA_MESMA_PESSOA}
        {...PROPS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /history/ }));
    // testid, não texto: garante que a checagem não passa "por acaso" (ex.: por diferença de
    // maiúscula) — o vínculo é o que decide, e aqui não há vínculo com etapa nenhuma.
    expect(screen.queryByTestId("comment-c-demanda")).not.toBeInTheDocument();
  });
});
