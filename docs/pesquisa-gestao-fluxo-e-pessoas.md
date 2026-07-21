# Gestão de fluxo & de pessoas para agência criativa — estado-da-arte + roadmap do workos

> Pesquisa multi-fonte com verificação adversarial (deep-research, 2026-07-21).
> 6 ângulos → 25 fontes → 121 afirmações extraídas → 25 verificadas por 3 votos cada
> → **24 confirmadas, 1 refutada**. Fontes primárias: Siemens/Actionable Agile (coautoria
> Dan Vacanti), DeGrandis _Making Work Visible_ (IT Revolution), tocinstitute.org, Gallup.
>
> **Escopo honesto:** os eixos de **fluxo/entrega** e **gestão de pessoas (Gallup)** têm
> âncora primária forte. O **benchmark formal de ferramentas** (Jira/Linear/Asana/Monday/
> ClickUp) e as **metas quantitativas de utilização/billability de agência** apareceram nas
> buscas mas **não sobreviveram à verificação adversarial** com fonte citável — entram como
> indicativos, não como fatos verificados (ver §"Lacunas da pesquisa").

---

## 1. Estado-da-arte (o que a literatura sustenta)

### 1.1 As quatro métricas canônicas de fluxo + Lei de Little

WIP (itens ativos), **cycle time** (início→fim), **throughput** (concluídos por período) e
**work item age** (tempo decorrido desde o início) são o núcleo canônico (Vacanti / Kanban
Guide). A **Lei de Little** as liga: `Cycle Time = WIP / Throughput`. Consequência acionável:
**reduzir o WIP médio reduz o cycle time médio** — a alavanca central de um sistema por etapas.
A meta é cycle time **curto e consistente** (consistência = previsibilidade).
Caveat: a identidade vale em regime estacionário (estabilidade, throughput ~constante).

> Fontes: Siemens/Actionable Agile (primária), Atlassian, _Making Work Visible_. Voto 3-0 (maioria).

### 1.2 WIP excessivo é a restrição primária — limitar a ~80% da capacidade

Pelo formato de **Kingman** (fila G/G/1, 1961), o tempo de espera cresce **hiperbolicamente**
quando a utilização se aproxima de 100% — por isso **não se opera a 100% de capacidade**.
Instituir **WIP limits estabiliza o cycle time imediatamente** (sem limite, cresce sem parar);
os limites inserem tensão intencional e dão à equipe permissão para dizer não.
Regra prática de DeGrandis: **~80% da capacidade**.

> Fontes: Siemens (primária), DeGrandis _Making Work Visible_ (primária). Voto 3-0.

### 1.3 Previsibilidade é probabilística, não determinística (Monte Carlo)

Simulação de **Monte Carlo** amostra repetidamente o histórico de throughput/cycle time e
produz uma **distribuição** de resultados ("85% de chance de concluir 20 itens até X").
Comprometa-se com a data no **percentil 85**, não com estimativa por velocity. Basta o
histórico — **poucas semanas de dados já bastam** para começar.

> Fontes: Siemens (primária), 55degrees, Leading EDJE. Voto 3-0.

### 1.4 Flow efficiency (tempo tocado vs. em espera/bloqueado)

Mensurável como **% do tempo em que o item é ativamente trabalhado** vs. esperando/bloqueado.
Mapeia **quase direto** aos estados `ACTIVE` vs `BLOCKED` do workos.
Caveat de mapeamento: o "espera" canônico inclui **fila** além de `BLOCKED`, então
ACTIVE-vs-BLOCKED é aproximação parcial (subestima a espera).

> Fonte: Siemens/Actionable Agile (primária). Voto 3-0.

### 1.5 Cumulative Flow Diagram (CFD)

Uma **visão única das três métricas** (throughput, WIP, cycle time) ao longo do tempo. Um CFD
saudável é suave da esquerda→direita; **banda alargando = acúmulo/gargalo**, **banda achatando
= escassez** naquela etapa. Requer **snapshots diários** de contagem por etapa.

> Fontes: Vacanti (primária, via ThoughtWorks), Atlassian. Voto 3-0.

### 1.6 Teoria das Restrições (Goldratt)

Todo sistema tem **uma restrição/gargalo** que limita a saída; melhorar em qualquer outro
lugar **não aumenta o throughput**. Gerencie o fluxo do sistema inteiro, não recursos isolados.
Base natural no workos: o cockpit já tem lead-time médio/mediano por etapa → dá para
**destacar a etapa-restrição**.

> Fonte: tocinstitute.org (Goldratt, _The Goal_). Voto 3-0.

### 1.7 Dependências compõem risco

Cada dependência **~dobra a chance de atraso** (heurística de Magennis: 8 dependências → 87%
de chance de NÃO chegar no prazo). Por isso **visibilizar dependências no board importa**.
DeGrandis nomeia os **Cinco Ladrões do Tempo** (excesso de WIP, dependências desconhecidas,
prioridades conflitantes, trabalho não planejado, trabalho negligenciado) e um sistema
operacional de 5 pontos: **tornar visível → limitar WIP → medir/gerir fluxo → priorizar →
ajustar por feedback**.

> Fonte: DeGrandis _Making Work Visible_ (primária). Voto 3-0 / 2-1. "Dobra" é heurística pedagógica.

### 1.8 Gestão de pessoas é alavanca crítica (Gallup)

Gestores respondem por **70% da variância** no engajamento das equipes → qualidade do gestor
e **cadências (1:1s)** são a principal alavanca. **41% dos colaboradores** relatam estresse
diário significativo e só **34% estão "thriving"** → risco de burnout disseminado.
Caveat: "1:1s" é extrapolação razoável, não medida direta pela Gallup; números são de 2025
(relatório 2026 já mostra ~40%).

> Fonte: Gallup _State of the Global Workplace_ (primária). Voto 3-0.

---

## 2. Roadmap priorizado para o workos (impacto ÷ esforço)

Ordenado por **maior valor com os dados que já existem**. Legenda de esforço: **S** ≤1 dia,
**M** ~2–4 dias, **L** ≥1 semana.

### P0 — Alto impacto, baixo esforço, dados JÁ existem

| #   | Item                                                                                                               | Tipo    | Esforço | Por quê / base                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Flow efficiency por etapa e por tarefa** (% ACTIVE vs BLOCKED usando `activatedAt`/`blockedAt`/`completedAt`)    | Métrica | **S–M** | §1.4 — maior relação impacto/esforço; dados de estado e timestamps já existem. Expõe onde o tempo é _desperdiçado esperando_, não trabalhando. |
| 2   | **Scatterplot de cycle time com percentis (50/85/95)** por etapa e workflow, a partir de `createdAt`/`completedAt` | Métrica | **M**   | §1.1/§1.3 — pré-requisito visual do forecasting; já responde "qual é meu prazo confiável (p85)?".                                              |
| 3   | **Destaque da etapa-restrição** no cockpit admin (a etapa com maior lead-time/aging = o gargalo do sistema)        | Feature | **S**   | §1.6 — o cockpit já calcula lead-time por etapa; falta _nomear o gargalo_ e orientar foco.                                                     |
| 4   | **Visibilizar risco composto de dependências** na fila de bloqueados (nº de dependências → sinal de risco)         | Feature | **S**   | §1.7 — já modela dependências; falta traduzir em risco.                                                                                        |

### P1 — Alto impacto, esforço médio (precisa de séries temporais)

| #   | Item                                                                                                  | Tipo    | Esforço | Por quê / base                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 5   | **Throughput ao longo do tempo + CFD** (snapshot diário de contagem por etapa)                        | Métrica | **M–L** | §1.5 — precisa de um job diário que grave contagem por etapa; destrava tendência e detecção visual de gargalo/escassez. |
| 6   | **Forecasting Monte Carlo** ("quando N itens ficam prontos? / quantos até a data X?", entregando p85) | Feature | **M**   | §1.3 — o histórico de cycle time/throughput já existe; começa com poucas semanas de dados.                              |

### P2 — Alto impacto, mais esforço (novos dados/modelo)

| #   | Item                                                                                         | Tipo    | Esforço | Por quê / base                                                                                      |
| --- | -------------------------------------------------------------------------------------------- | ------- | ------- | --------------------------------------------------------------------------------------------------- |
| 7   | **WIP limits configuráveis + enforcement** (por time/etapa; alerta ou bloqueio ao exceder)   | Feature | **M**   | §1.2 — hoje não há limite nem meta; é a alavanca #1 de estabilização de cycle time.                 |
| 8   | **Capacidade em horas (meta por pessoa/semana) → utilização** (`horas TimeLog ÷ capacidade`) | Feature | **M–L** | §1.2/§2.8 — hoje só há horas _usadas_, sem denominador. Base para carga real e sinal de sobrecarga. |

### P3 — Pessoas & rotinas (alto valor de gestão, apoiam-se em P0–P2)

| #   | Item                                                                                                 | Tipo    | Esforço | Por quê / base                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| 9   | **Sinais de burnout** (sobrecarga sustentada, aging alto + WIP alto por pessoa, horas acima da meta) | Feature | **M**   | §1.8 — 41% em estresse diário; TimeLog + carga por pessoa alimentam sinais precoces.                       |
| 10  | **Revisão semanal guiada de WIP/aging** (rotina de _traffic management_: cockpit vira checklist)     | Rotina  | **S–M** | §1.7 — "medir/gerir o fluxo" e "ajustar por feedback" como cadência, não relatório passivo.                |
| 11  | **Cadência de 1:1 guiada + health checks**                                                           | Rotina  | **M**   | §1.8 — 70% da variância de engajamento vem do gestor; a ferramenta pode _lembrar e estruturar_ a cadência. |

---

## 3. O que NÃO existe hoje no workos (checklist de lacunas)

- [ ] Flow efficiency (ativo vs bloqueado/espera) — **P0.1**
- [ ] Scatterplot de cycle time / percentis — **P0.2**
- [ ] Etapa-restrição destacada (ToC) — **P0.3**
- [ ] Risco composto de dependências — **P0.4**
- [ ] Séries temporais / throughput ao longo do tempo / CFD — **P1.5**
- [ ] Forecasting Monte Carlo — **P1.6**
- [ ] WIP limits configuráveis + enforcement — **P2.7**
- [ ] Capacidade/disponibilidade em horas + utilização/billability — **P2.8**
- [ ] Sinais de burnout — **P3.9**
- [ ] Rotinas/cadências guiadas (WIP review, 1:1, health checks) — **P3.10/11**

---

## 4. Lacunas da pesquisa (honestidade metodológica)

- **Benchmark formal de ferramentas (eixo 4)**: nenhum comparativo citável de features de
  gestão (CFD, control charts, forecasting nativos) de Jira/Linear/Asana/Monday/ClickUp
  sobreviveu à verificação. O que a Atlassian publica (métricas de fluxo, CFD) serve de
  referência da categoria, mas o comparativo lado-a-lado ficou sem fonte.
- **Metas de utilização/billable de agência**: apareceram números nas buscas (Harvest ~60–75%;
  outra fonte 80–90%; produção criativa 70–80% sustentável, 85%+ = risco de burnout) mas
  **não passaram pela verificação adversarial** — tratar como indicativo, calibrar com dados reais.
- **1 afirmação refutada** (voto 1-2): que Vacanti define métricas "de segunda geração".
- **PDF de DeGrandis** não pôde ser extraído por fetch; a citação de Kingman apoiou-se em
  fontes secundárias amplas.

### Questões em aberto (valem uma segunda rodada, se quiser)

1. Benchmarks quantitativos de utilização/billable de agência com fonte primária.
2. Que métricas/rotinas Jira/Linear/Asana/Monday/ClickUp expõem nativamente.
3. Limiares operacionais concretos de detecção de burnout (além dos agregados Gallup).
4. Cadências ágeis adaptadas ao contexto de agência criativa (daily/planning/retro/health check).

---

## 5. Fontes (25 fetched; primárias em negrito)

- **Siemens Health Services — Actionable Metrics (Agile Alliance, coautoria Dan Vacanti)** — primária
- **DeGrandis, _Making Work Visible_ (IT Revolution PDF)** — primária
- **tocinstitute.org — Theory of Constraints** — Goldratt
- **Gallup — State of the Global Workplace 2025** (via mo.work)
- Atlassian — _Five agile metrics_; ThoughtWorks — review de _Actionable Agile Metrics_;
  55degrees / Leading EDJE — Monte Carlo & flow forecasting; Float — managing creative teams;
  Harvest / Haus / Noloco / Resource Guru — utilização & burnout de agência;
  Allfred / Workamajig / Productive.io / MTM / Function Point / ManyRequests — traffic & capacity.
