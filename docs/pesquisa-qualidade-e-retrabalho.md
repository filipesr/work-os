# Medir qualidade & atribuir retrabalho em trabalho criativo — estado-da-arte

> 3ª rodada de deep-research (2026-07-22), **cirúrgica** nos eixos que a 2ª rodada
> não cobriu. **20 afirmações verificadas** por 3 votos (19 em 3-0, 1 em 2-1),
> 0 refutadas, 5 sem verificação.
>
> ⚠️ **Estado parcial (honestidade):** o workflow **bateu o limite de gasto mensal**
> no meio — a etapa de **síntese automática falhou** e ~15 agentes de verificação
> não rodaram. A síntese abaixo foi feita **manualmente** sobre os claims crus
> verificados. Fontes primárias/fortes: Toyota (TPS oficial), Deming/SPC (Red Bead,
> common vs special cause), Google re:Work (Project Aristotle), SHRM (Microsoft
> stack-ranking), COPQ (pressbooks OpEx), arXiv 2512.06583.
>
> ⚠️ **Lacuna remanescente:** o **eixo de medição de qualidade CRIATIVA
> especificamente** (first-time-right rate, nº de rounds de revisão, viés do
> "cliente exigente infla revisão") **não produziu claims verificados** — os
> princípios sistêmicos abaixo cobrem o _como não errar_, mas os _proxies
> concretos de qualidade criativa_ seguem sem fonte citável.

---

## 1. Estado-da-arte (verificado)

### 1.1 Defeito-na-origem / Jidoka (Lean/TPS)

Jidoka é um dos dois pilares do TPS: **"automação com toque humano"** — parar
imediatamente ao detectar anormalidade (inclusive de qualidade) para **impedir
que defeitos sejam produzidos/passem adiante**. Ao parar (máquina ou operador
puxa o cordão), elimina-se a saída de defeitos e **constrói-se qualidade no
processo** (Toyota, 3-0). Lean prescreve **"inspecionar na fonte"** — checagens
durante o processo pegam o defeito na origem, superior à inspeção final reativa,
que ocorre depois que defeito e recursos já foram gastos (OpEx, 3-0).

### 1.2 Custo da má qualidade: interno vs externo (COPQ)

COPQ divide-se em quatro categorias — **Prevenção, Avaliação, Falha Interna,
Falha Externa**. **Falha interna** ocorre _antes_ de chegar ao cliente; **falha
externa** ocorre _após a entrega e é mais danosa_ (OpEx, 3-0). → Valida
diretamente distinguir **retrabalho interno** (pego dentro do processo — o gate
funcionando) de **rejeição do cliente** (escapou — custosa). Corolário clássico:
quanto mais a jusante o defeito é pego, mais caro corrigir.

### 1.3 Variação sistêmica vs individual (Deming)

- Deming: **~94% da variação é common-cause** (o sistema, responsabilidade da
  gestão), só ~6% special-cause (fator local/específico). Ensino SPC amplia a
  faixa: **85–94% sistema, 6–15% indivíduo** — então culpar o indivíduo é
  equivocado ~85% das vezes (SPC, 3-0).
- **Red Bead Experiment:** defeitos são **erroneamente atribuídos aos
  trabalhadores** quando na verdade são produzidos pelo sistema — o trabalhador
  não controla quantas contas vermelhas tira; **toda a variação veio do processo**,
  sem evidência de que algum fosse melhor/pior (SPC, 3-0).
- **Ranquear trabalhadores por nº de defeitos é informacionalmente inútil** —
  o ranking só reflete o efeito do sistema sobre as pessoas, não o desempenho
  individual (SPC, 3-0).
- **Common vs special cause** (Shewhart/Deming): common = ruído previsível do
  sistema; special = sinal novo/emergente. **Reagir a common-cause como se fosse
  special (individual) aumenta a variação e piora o sistema.** O **control chart**
  é a ferramenta para distinguir sinal de ruído _antes de agir_ (Wikipedia/SPC, 3-0).
- Sob common-cause, melhorar exige **mudar o processo**, não exortar/ranquear;
  ranking, merit-pay e slogans não produzem melhoria contra um sistema falho (SPC, 3-0).
- Defeitos devem ser **atribuídos ao processo/sistema**, não ao indivíduo, porque
  as pessoas operam dentro das restrições de sistemas/ferramentas/fluxos falhos —
  o alvo correto é a melhoria sistêmica, não a culpa (OpEx, 3-0).

### 1.4 Individual vs time (evidência empírica)

- **Google Project Aristotle:** _como_ o time trabalha junto importa mais para a
  efetividade do que _quem_ está nele; atributos individuais (senioridade,
  extroversão, **notas de desempenho individual**) **não** tiveram correlação
  significativa com a efetividade do time (Google re:Work, 3-0).
- **Forced/stack ranking** aproxima-se de **alocação aleatória** (não
  diferenciação por mérito) quando a variação individual é pequena frente ao
  ruído do sistema; causa **má-atribuição de resultados ao mérito** porque as
  organizações não checam se a diferença observada excede a variação natural
  (arXiv, 2-1 / 3-0 invocando Deming).
- **Microsoft abandonou o stack ranking** (forced distribution) em nov/2013 —
  que obrigava marcar um % predeterminado como "abaixo do esperado"
  independentemente do desempenho real (SHRM, 3-0).

---

## 2. Princípios de design (para o subsistema 2 do workos)

Respondendo diretamente às perguntas do entregável:

**(i) Capturar o evento de aprovação/qualidade por etapa — informacional.**
Jidoka + inspeção-na-fonte fundamentam registrar um sinal explícito de qualidade
**por etapa** (aprovado-de-primeira / revisado / rejeitado; interno vs cliente).
O **evento é dado legítimo**; o que não pode é virar ranking de pessoa. Capturar
no momento da conclusão/aprovação da etapa constrói qualidade no processo em vez
de inspeção final reativa (§1.1).

**(ii) Atribuir retrabalho à etapa-origem, nunca à pessoa como nota.**
"Inspecionar na fonte" + "defeitos são do processo" (§1.1, §1.3) → atribua o
retorno à **etapa que injetou o defeito** (ex.: briefing), como sinal de
**processo**. Ranquear por defeitos é inútil (Red Bead) — então nível de
etapa/processo, indivíduo só para coaching com contexto.

**(iii) Distinguir retrabalho interno (bom) de rejeição do cliente (custosa).**
COPQ interno vs externo (§1.2) → o modelo precisa marcar **quem barrou**: pego
internamente = gate funcionando (desejável, barato); rejeitado pelo cliente =
escapou (custoso). Contá-los juntos (como o `revert` genérico de hoje) apaga
essa distinção crítica.

**(iv) Vieses a vigiar.**
Pela lente common/special-cause (§1.3): boa parte da "variação de qualidade" é
**ruído do sistema** (cliente exigente, iteração normal do criativo), não sinal
sobre a pessoa. Antes de agir sobre um número, pergunte se ele **excede a
variação natural** (raciocínio de control chart). _Nota: o viés específico
"cliente exigente infla revisão" não teve fonte verificada nesta rodada, mas é
um caso direto de common-cause mal-interpretado como special-cause._

**(v) Fronteira processo (seguro) vs indivíduo (perigoso).**
Notas individuais não predizem efetividade (Aristotle); ranking ≈ aleatório sob
ruído; Microsoft abandonou stack-ranking (§1.4). → **Processo sempre; indivíduo
só para coaching**, nunca ranking/pay, e só depois de confirmar que o sinal
excede o ruído do sistema.

---

## 3. Lacunas remanescentes (sem fonte verificada)

1. **Proxies concretos de qualidade criativa** — first-time-right rate, nº de
   rounds de revisão por entrega, rejection rate, e sua confiabilidade. (eixo 2)
2. **Viés do cliente exigente** especificamente — coberto por princípio
   (common-cause), não por fonte direta.
3. **1-10-100 / escalonamento de custo** — o princípio COPQ interno/externo veio,
   o multiplicador numérico específico não foi verificado.

> Como a 2ª rodada já cravou o princípio de Austin (informacional vs
> motivacional) e esta cravou o sistêmico (Deming/Jidoka/COPQ), há base sólida
> para desenhar o **evento de aprovação como sinal de processo, informacional,
> interno-vs-cliente, atribuído à etapa-origem**. Os proxies criativos finos
> (item 1) são decisão de design, não de fonte.

## 4. Fontes principais

- Toyota — TPS oficial (jidoka) · OpEx/pressbooks — COPQ, inspect-at-source, defeitos-do-processo
- Deming/SPC (spcforexcel) — Red Bead, common vs special cause, 94/6 · Wikipedia — common/special cause + control chart
- Google re:Work — Project Aristotle · SHRM — Microsoft stack-ranking (2013) · arXiv 2512.06583 — forced ranking ≈ aleatório
