# Medição de desempenho & previsibilidade em trabalho criativo — estado-da-arte

> 2ª rodada de deep-research (2026-07-22). 5 ângulos → 24 fontes → 107 afirmações
> → 25 verificadas por 3 votos → **25 confirmadas, 0 refutadas**.
> Fontes primárias fortes: **Flyvbjerg/Kahneman** (reference-class forecasting,
> arXiv + peer-reviewed), **Austin** (Measuring and Managing Performance),
> **Reinertsen** (Lean Kanban India 2016), **Vacanti** (Actionable Agile).
>
> ⚠️ **Cobertura honesta:** os eixos **variabilidade/filas (1)**, **previsão
> probabilística/classe de referência (2)** e **disfunção de medição via Austin
> (3 parcial)** têm âncora primária forte. **NÃO** sobreviveram à verificação:
> Deming (94% common cause / Red Bead / contra ranking), Goodhart, stack-ranking,
> Lean/Jidoka & defeito-na-origem (eixo 4), medição de qualidade/approval (eixo 5),
> capacidade/utilização/ócio (eixo 6). Esses pontos ficam como **questões em
> aberto** — o design abaixo os trata por raciocínio, não por fonte verificada.

---

## 1. Estado-da-arte (verificado)

### 1.1 A variabilidade criativa é irredutível e NÃO se autocorrige

Sistemas de fila com variabilidade, a alta utilização, **derivam aleatoriamente
para estados de fila altos, persistentes**, que atrasam muitos itens de uma vez.
Modelados como cadeias de Markov / passeios aleatórios, **não regridem à média** —
difundem-se da origem e as variâncias se somam (`Var = t·σ²`), então a variância
total cresce. Consequência: **estimativa determinística em horas falha por
matemática, não por má gestão**; a resposta é **limitar WIP** e **prever
probabilisticamente**. (Reinertsen, voto 3-0.)

### 1.2 Variabilidade é para se operar bem, não eliminar

A 2ª geração do lean para desenvolvimento trata a variabilidade como algo em que
se funciona bem via inovação (a 1ª geração tentava eliminá-la). Filas não medidas,
por alta utilização de recursos, são a **principal causa de cycle times longos**.
(Reinertsen; os números "98%/85% não conhecem suas filas/custo de atraso" são
estimativas anedóticas do autor — ilustrativas, não survey.)

### 1.3 Previsibilidade = probabilidade sobre histórico, não estimativa

As três métricas fundamentais (Cycle Time, Throughput, WIP, unidas pela Lei de
Little) alimentam **percentis + Monte Carlo** sobre histórico — não estimativa
bottom-up. **Valida o que o workos já tem** (p50/p85/p95 + Monte Carlo). (Vacanti, 3-0.)

### 1.4 Reference-class forecasting (RCF) — a "outside view"

A previsão madura abandona a "inside view" (focar nas especificidades da tarefa —
**sistematicamente otimista**, planning fallacy) pela **"outside view"**: colocar
a tarefa na **distribuição empírica de trabalhos comparáveis passados**, regredir
o palpite à média da classe e **alargar o intervalo** ao da classe. Três passos:
(1) identificar a classe de referência — ampla o bastante para significância,
estreita o bastante para comparabilidade; (2) montar a distribuição a partir de
dados; (3) posicionar a tarefa na distribuição. (Flyvbjerg/Kahneman, 3-0.)

### 1.5 A previsão deve ser SEGMENTADA por tipo de trabalho

Os "uplifts" empíricos para uma dada tolerância a risco **diferem drasticamente
por categoria** (ex.: rodovia exige 32% de uplift onde ferrovia exige 57%, para o
mesmo risco). A vantagem do RCF é **condicional**: só supera outros métodos quando
a tarefa é suficientemente similar à classe. → **arte, LP e vídeo precisam de
classes/distribuições separadas.** (Flyvbjerg, N=172+, 3-0.)

### 1.6 Experiência do executor = largura da banda, nunca nota

Textual de Flyvbjerg: uplifts **menores** só se justificam com **evidência de que
a pessoa é significativamente melhor que os pares** na classe; **maiores** se pior.
O percentil escolhido (p50 vs p80–90) codifica a **tolerância a risco**. →
**A experiência entra ajustando a LARGURA do intervalo de previsão — não como
score pessoal.** (Responde diretamente à pergunta "experiência deve entrar?".) (3-0.)

### 1.7 Medir desempenho tende a degradá-lo (Austin)

Medir qualquer indicador de desempenho **arrisca piorar o próprio desempenho** —
"dysfunction é a regra, não a exceção", sobretudo com trabalhadores do
conhecimento. Causa: medição **motivacional** (mudar comportamento — bônus/mérito)
e **informacional** (insight de processo, que **não** deve mudar comportamento)
são **incompatíveis**. E **nada num dado é inerentemente motivacional ou
informacional — só o USO decide** — então os projetistas são "impotentes" para
impedir que uma métrica informacional vire punição/prêmio. → **individualizar é
seguro para uso informacional (coaching/staffing/roteamento) e tóxico quando vira
motivacional (score/ranking/pay-link).** (Austin, doutorado premiado CMU, 3-0.)

---

## 2. Princípios de design (o que isto decide para o workos)

| #   | Pergunta                                  | Resposta fundamentada                                                                                                                                         |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| i   | Tempo deve entrar na métrica?             | Sim, mas **contextualizado por classe** (percentil do próprio tipo de trabalho), como **sinal de previsão/exceção**, nunca como nota isolada. §1.3–1.5        |
| ii  | Experiência do executor entra?            | **Sim, como largura da banda de previsão** (menos experiente → banda mais larga), **nunca como nota individual**. §1.6                                        |
| vi  | Quando individualizar é seguro vs tóxico? | Seguro = **informacional** (coaching, staffing, roteamento, previsão). Tóxico = **motivacional** (score composto, ranking público, vínculo a pagamento). §1.7 |

**Consenso central:** previsibilidade vem de **probabilidade + segmentação por
classe + WIP baixo**; individualização é insumo de previsão/coaching, e vira
veneno quando é score/ranking/pay.

### Transferibilidade (ressalva importante)

Toda a base empírica do RCF (uplifts 15–68%) vem de **megaprojetos de
infraestrutura**, não de agência. **O PRINCÍPIO transfere** (segmentar por classe,
outside view, banda por percentil); **os NÚMEROS não** — a agência precisa
construir **suas próprias classes de referência a partir do histórico do workos**.
A dificuldade prática nº 1 do RCF é ter **dados suficientes por classe** — relevante
para uma agência com volume menor por tipo (arte terá mais casos que vídeo).

---

## 3. Questões em aberto (sem base verificada — decidir por raciocínio ou 3ª rodada)

1. **Medir qualidade** (índice de aprovação / first-time-right / revisões por
   entrega) e mitigar o viés do "cliente exigente infla revisão". _(eixo 5)_
2. **Defeito-na-origem / retrabalho** (Lean/Jidoka): atribuir o retorno à
   ETAPA/PROCESSO, distinguir retrabalho interno desejável de rejeição do cliente.
   _(eixo 4)_
3. **Base sistêmica** (Deming ~94% common cause, stack-ranking, Google re:Work)
   para a fronteira individualização legítima vs tóxica. _(eixo 3 — núcleo ausente)_
4. **Ócio remunerado** tratado como capacidade/roteamento/WIP (throughput, não
   horas) sem contaminar a qualidade. _(eixo 6)_

> Austin (§1.7) já dá o princípio geral que cobre boa parte de (3) e (4) por
> transferência: manter os sinais **informacionais** e separados. Mas os
> mecanismos específicos (como capturar aprovação, como atribuir retrabalho)
> são decisões de design a fazer no brainstorming.

---

## 4. Fontes principais

- **Flyvbjerg, _Curbing Optimism Bias…_ / arXiv 1302.3642 / PPC 2025** — RCF (primária).
- **Kahneman & Tversky** — inside vs outside view, planning fallacy.
- **Austin, _Measuring and Managing Performance in Organizations_** — measurement dysfunction (primária).
- **Reinertsen, Lean Kanban India 2016 / _Principles of Product Development Flow_** — variabilidade/filas.
- **Vacanti, _Actionable Agile Metrics for Predictability_** — Monte Carlo/percentis.
- UK Treasury Green Book, APM, PMI — endossos institucionais do RCF.
