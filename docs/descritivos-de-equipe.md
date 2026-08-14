# Descritivos de Equipe

> Referência de função para o colaborador, para a coordenação e para o RH.
> Fonte da verdade do conteúdo renderizado em `/help/equipes` e do atalho em `/account`.
> Companheiro de `docs/biblioteca-de-conhecimento.md` — os princípios de lá **restringem** o que pode ser escrito aqui.

---

## 1. Por que descritivos existem aqui

O Work OS já sabe **quem** está em qual equipe (`Team` N:N `User`) e **o que** cada equipe executa no fluxo (`TemplateStage.defaultTeamId`). O que faltava era a resposta para uma pergunta que nenhum dado responde:

> "O que se espera de mim nesta função?"

Este documento responde. Cada descritivo serve a **quatro decisões concretas**, e nenhuma outra:

| Decisão                                           | Quem toma             | Seções que servem                                        |
| ------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| **Onboarding** — o que faço na primeira semana    | o próprio colaborador | missão, entregáveis, interfaces, ferramentas, obrigações |
| **Contratação** — quem procurar e o que perguntar | RH + coordenação      | competências, contratação                                |
| **1:1 e coaching** — sobre o que conversar        | gestor/supervisor     | obrigações, relatórios, avaliação                        |
| **Staffing** — quem consegue pegar esta demanda   | gestor                | entregáveis, competências                                |

O descritivo **informa**. Ele não pontua, não ordena e não vira nota. Isso não é preferência de estilo: é a consequência direta do **P1** da biblioteca de conhecimento, e a §2 abaixo é o contrato que torna a regra verificável.

### O que este documento não é

- **Não é contrato de trabalho.** Não define salário, jornada, vínculo, subordinação formal nem enquadramento sindical. As referências à CBO existem para dar vocabulário formal ao RH, não para substituir o registro em carteira.
- **Não é organograma.** `Team` é a _função exercida_, não o nível hierárquico. Quem manda em quem é `UserRole` (papel de acesso).
- **Não é lista de tarefas.** As obrigações descrevem o _padrão esperado da função_; a fila de trabalho real vive em `/tasks`.

### Vocabulário (resolve uma ambiguidade do produto)

O app chamava `UserRole` de "Função" e `Team` de "Equipe" — duas coisas diferentes com nomes que se confundem. Fica assim:

- **Equipe** = a função exercida (Designers, Tráfego, Revisão). **É o que ganha descritivo.**
- **Papel de acesso** = `UserRole` (Administrador · Gestor · Supervisor · Executor). Define o que a pessoa **vê e pode fazer no sistema**, não o que ela faz na agência.

Uma pessoa pode ser Executor(a) no papel de acesso e Coordenação na equipe. São eixos independentes, de propósito.

---

## 2. As salvaguardas de RH

**Esta é a seção que o RH lê antes de usar qualquer descritivo deste documento.**

Um descritivo de cargo com seção de avaliação é exatamente o artefato que costuma quebrar os dois princípios mais caros do Work OS. A tentação é sempre a mesma: transformar "o que se espera" em "quanto a pessoa entregou do que se esperava", e daí em nota, ranking e bônus. Escrevemos contra isso.

### O que a seção `avaliacao` de cada descritivo pode conter

**Pode:** sinais separados, lidos por exceção, sempre com o contexto do sistema ao lado; perguntas para o 1:1; o que caracteriza uma conversa de coaching sobre aquela função.

**Não pode, nunca:**

| Proibido                                            | Princípio | Por quê                                                                                                               |
| --------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Score composto (um número que resume a pessoa)      | P1        | Nada num dado é inerentemente informacional ou motivacional — só o uso decide; um número único só serve para comparar |
| Ranking, leaderboard, "melhor/pior do mês"          | P1, P2    | Ranquear por output ou defeito é informacionalmente inútil: reflete o sistema, não a pessoa                           |
| Vínculo a remuneração, bônus ou promoção automática | P1        | Medir para premiar degrada o indicador                                                                                |
| Meta numérica individual de volume                  | P3, P7    | Trabalho criativo tem variabilidade irredutível; meta de volume vira gaming ou queda de qualidade                     |
| Atribuir defeito à pessoa como fato isolado         | P2, P5    | O defeito é da **etapa que o injetou**; a pessoa é a leitura de coaching, com o motivo à vista                        |
| Descontar volume da nota de qualidade               | P7        | Suja o sinal e esconde o problema real                                                                                |

### Por que a evidência sustenta isso

- **Deming / SPC:** ~94% da variação de desempenho é _common-cause_ — vem do sistema (processo, cliente, dependências), não do indivíduo. Reagir a variação comum como se fosse causa especial **aumenta** a variação.
- **Austin:** disfunção de medição "é a regra, não a exceção", sobretudo com trabalhadores do conhecimento. Quem projeta a métrica é impotente para impedir que ela vire punição — a única defesa é manter os sinais separados.
- **Google (Project Aristotle) e SHRM:** notas individuais não predizem efetividade de time; stack-ranking se aproxima do aleatório sob ruído. A Microsoft o abandonou em 2013.

### A única exceção registrada

O **FTR (first-time-right) por pessoa** existe no produto e continua existindo — é decisão informada do dono do produto, cercada por seis salvaguardas (auto-referencial e nunca comparativo; defeito só via reclassificação humana; motivo sempre à vista; reclassificação só do gestor; acesso fail-closed; zero pay/rank). Ver a exceção 3b em `docs/biblioteca-de-conhecimento.md` §1/P2.

**Nenhum descritivo deste documento pode criar uma segunda exceção.** Se uma função parece precisar de uma, isso vira discussão de produto na biblioteca — não um parágrafo escrito aqui.

### Uso na contratação

A seção `contratacao` lista **requisitos** (o que a pessoa precisa saber para executar) e **diferenciais** (o que amplia o alcance). Ela não lista idade, gênero, aparência, estado civil, filhos, religião, origem nem "boa aparência" — critérios que não predizem desempenho e cuja exigência é discriminatória. As perguntas de entrevista sugeridas são **comportamentais e situacionais** (peça um exemplo real do passado), não testes de personalidade.

---

## 3. O formato

Todo descritivo tem as mesmas dez seções, na mesma ordem. A ordem é o roteiro de leitura de quem chega novo: _por que existo → o que entrego → com quem → com o quê → quando → o que mostro → o que preciso saber → como se entra → como se conversa sobre isso → de onde veio_.

| #   | Seção          | Regra de preenchimento                                                                                                                                                                                  |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `missao`       | **Uma frase.** Por que a função existe do ponto de vista do cliente da agência. Se precisar de duas frases, a função está mal recortada                                                                 |
| 2   | `entregaveis`  | O que sai das mãos da equipe. Quando a função é dona de uma etapa de template, o entregável **é** o artefato daquela etapa — não uma reescrita genérica                                                 |
| 3   | `interfaces`   | `De quem recebe` / `Para quem entrega`, na ordem real das `StageDependency`. Torna visível a dependência que atrasa                                                                                     |
| 4   | `ferramentas`  | Links de trabalho **fora do Work OS**, em três grupos: obrigatórias · apoio · referências internas. Cada item é `{ nome, para que serve, url? }`                                                        |
| 5   | `obrigacoes`   | O que se espera por cadência: `diarias` · `semanais` · `mensais` · `anuais`. Frases no infinitivo, verificáveis. "Ser proativo" não é obrigação; "publicar o calendário do mês seguinte até o dia 25" é |
| 6   | `relatorios`   | Artefatos que a função **produz** para demonstrar o trabalho: `{ nome, conteudo, quando, destino, ondeEntregar }`. Funções sem relatório próprio **declaram isso** em vez de inventar um                |
| 7   | `competencias` | `tecnicas` (o que sabe fazer) e `comportamentais` (como trabalha com os outros)                                                                                                                         |
| 8   | `contratacao`  | `requisitos` · `diferenciais` · `perguntasDeEntrevista`. Sujeito às regras da §2                                                                                                                        |
| 9   | `avaliacao`    | `oQueOlhamos` · `comoLemos` · `oQueNuncaFazemos`. Sujeito às regras da §2 — a última lista nunca fica vazia                                                                                             |
| 10  | `fontes`       | Referência ocupacional (CBO, O\*NET) e o que mais sustentou aquele descritivo                                                                                                                           |

### Três regras que separam isto de um descritivo genérico

**1. Ferramenta é link, e vive fora do Work OS.** Figma, Meta Business Suite, Premiere, Metricool, Search Console — mais as referências internas (pasta do NAS, manual de marca, modelos). O Work OS não se lista como ferramenta da função: ele é onde o trabalho é registrado, não como o trabalho é feito.

**2. Relatório é artefato produzido pela pessoa.** O demonstrativo mensal de crescimento de perfis do Social Media é um relatório; a tela `/reports/performance` não é — ela é o que a _gestão_ lê. Cada relatório declara:

- **`destino`** — `cliente` · `gestao` · `documentacao`
- **`ondeEntregar`** — normalmente **anexado à demanda concluída** pelo formulário de artefatos da tarefa, com a sensibilidade correta:

| destino      | sensibilidade | consequência                                                       |
| ------------ | ------------- | ------------------------------------------------------------------ |
| Cliente      | `CLIENTE`     | único nível compartilhável para fora, e só por SUPERVISOR ou acima |
| Gestão       | `INTERNO`     | fica na rede local, nunca sai por link                             |
| Documentação | `INTERNO`     | idem; vira histórico da conta                                      |

Nada que contenha dado pessoal, contrato ou credencial vai como `CLIENTE` — isso é `CONFIDENCIAL`, e `CONFIDENCIAL` nunca é compartilhável.

**3. Entregáveis e interfaces saem do fluxo real.** Os templates que existem hoje no seed:

| Template                | Etapas (equipe dona)                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Vídeo Curto             | Roteiro (Social Media) → Edição (Video-makers) → Revisão QC (Revisão)                                                  |
| Post Carrossel Estático | Copy & Briefing (Social Media) → Design Carrossel (Designers) → Revisão Final (Revisão)                                |
| Landing Page            | Briefing & Copy (Comunicação) → Design (Designers) → Development (Eng. de Software) → Revisão QC (Revisão) ∥ SEO (SEO) |
| Campanha de Tráfego     | Setup de Campanha → Acompanhamento → Relatório Mensal (todas Tráfego)                                                  |

Quem escreve um descritivo novo confere esta tabela antes — e a atualiza se um template mudar.

### 3.1 Os modelos de relatório

O descritivo **declara** que o artefato existe. O modelo diz **como ele deve parecer**. São coisas separadas de propósito: um descritivo com a anatomia completa de três relatórios dentro viraria ilegível.

Cada modelo vive em `locales/{pt-BR,es-ES}/reportModels.json`, é registrado em `lib/team-profiles/reports.ts` e aparece em `/help/relatorios`. A entrada de `relatorios` do descritivo aponta para ele pelo campo `modelo`; sem esse campo, a tela diz que o modelo ainda não foi escrito.

**O padrão é por artefato, não da casa.** Um clipping e um relatório de incidente respondem a perguntas diferentes, para leitores diferentes. Forçá-los na mesma anatomia produziria seções vazias nos dois — e seção vazia ensina que a estrutura é decorativa.

Um modelo tem oito partes:

| Parte       | O que é                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------- |
| `paraQue`   | A pergunta que o relatório responde. Se não há pergunta, não há relatório                    |
| `leitor`    | Quem lê e em que condições — o decisor lê no celular em cinco minutos, e isso muda o formato |
| `quando`    | O momento de saída, e a sua relação com outros ritos (antes da reunião, não depois)          |
| `estrutura` | As seções, na ordem, cada uma com o que vai dentro                                           |
| `regras`    | O que faz o relatório funcionar                                                              |
| `erros`     | O que o estraga — mais útil que as regras, porque é o que as pessoas fazem por hábito        |
| `exemplo`   | Preenchido, com dados **fictícios** e marcado como tal na tela                               |
| `esqueleto` | Texto pronto para copiar, com o que preencher entre colchetes                                |

**As três regras que valem para todo modelo:**

1. **Seção sem conteúdo no período não some** — sai com uma linha dizendo que não houve. Sumir muda a estrutura de um mês para o outro e mata a comparação.
2. **O relatório ao cliente é uma peça comercial, e isso não autoriza escolher o número que ficou bonito.** Todo número entra com a leitura do porquê, o que não funcionou aparece, e previsão sai como faixa — nunca como promessa (P3). Relatório que só mostra vitória para de ser lido no terceiro mês.
3. **Destino e sensibilidade não podem divergir** entre o modelo e o descritivo. `destino: cliente` ⟺ `CLIENTE`, porque CLIENTE é o único nível compartilhável para fora. O guard reprova a divergência.

Modelos escritos até aqui: relatório de conta, demonstrativo de perfis, relatório mensal de campanhas, clipping, relatório de crise, relatório de incidente, registro de ocorrência, consolidado de motivos de retorno, relatório de fluxo e checklist de saída. Os demais artefatos declarados nos descritivos aparecem em `/help/relatorios` como pendentes — a ausência fica visível, como a das equipes não documentadas.

---

## 4. Os descritivos

Quatorze funções, em cinco famílias. As demais equipes conhecidas aparecem em `/help/equipes` marcadas como **ainda não documentadas** — a ausência é visível de propósito (§6).

---

### 4.1 Criação

---

#### `design` — Design

**Equipes cobertas:** `Designers`
**Referência ocupacional:** [CBO 2624-10](https://cbo.mte.gov.br/cbosite/pages/home.jsf) (desenhista industrial gráfico / designer gráfico) · [O\*NET 27-1024.00](https://www.onetonline.org/link/summary/27-1024.00) (Graphic Designers)

**Missão.** Traduzir a mensagem do cliente em peça visual que comunica de primeira, dentro da identidade da marca.

**Entregáveis.**

- Peça final aprovada nos formatos e proporções pedidos, com arquivo aberto e arquivo de exportação
- Etapa **Design Carrossel** (Post Carrossel Estático) e etapa **Design** (Landing Page)
- Variações de adaptação (feed, story, impresso) quando a demanda pedir
- Arquivo-fonte arquivado na pasta da conta, nomeado no padrão

**Interfaces.** Recebe de Comunicação/Copy e Social Media (texto e briefing aprovados). Entrega para Revisão e, na Landing Page, para Engenharia de Software.

**Ferramentas.**

- _Obrigatórias:_ [Figma](https://figma.com) — layout, protótipo e entrega de specs · Adobe Illustrator — vetor e identidade · Adobe Photoshop — tratamento de imagem · Adobe InDesign — peça editorial e impressa
- _Apoio:_ [Canva](https://canva.com) — adaptação rápida e peças de baixa complexidade · [Adobe Color](https://color.adobe.com) — paleta e contraste · banco de imagens contratado
- _Referências internas:_ manual de marca por cliente (pasta da conta no NAS) · pasta de aprovados do cliente · modelos de formato e proporção

**Obrigações.**

- _Diárias:_ revisar a fila e assumir a próxima etapa de Design; conferir se o briefing e o texto estão aprovados **antes** de começar; registrar o tempo na etapa; devolver com motivo quando o insumo não permitir executar
- _Semanais:_ arquivar os fontes das peças concluídas na pasta da conta; conferir com Revisão os retornos da semana e o que os causou
- _Mensais:_ revisar o manual de marca de cada conta ativa contra o que foi produzido; propor à Coordenação os ajustes de padrão que se repetiram
- _Anuais:_ revisar o kit de identidade das contas recorrentes; atualizar portfólio e biblioteca de modelos

**Relatórios.**

| Artefato                 | Conteúdo                                              | Quando                                   | Destino | Onde entregar                 |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------- | ------- | ----------------------------- |
| Apresentação de conceito | Rota criativa, referências e justificativa da escolha | No início de campanha ou identidade nova | Cliente | Anexado à demanda · `CLIENTE` |
| Pacote de entrega        | Peças finais + fontes + guia de aplicação             | Ao concluir a demanda                    | Cliente | Anexado à demanda · `CLIENTE` |

**Competências.**

- _Técnicas:_ tipografia, grid e hierarquia visual; teoria da cor e contraste; preparação de arquivo para impressão e para tela; adaptação entre formatos sem perder a leitura; noção de acessibilidade visual
- _Comportamentais:_ recebe crítica sobre a peça sem levar para o pessoal; explica a decisão de design em palavras que o cliente entende; pede o briefing que falta em vez de adivinhar

**Contratação.**

- _Requisitos:_ portfólio com peças reais e o problema que resolviam; domínio de Figma **ou** da suíte Adobe; capacidade de trabalhar dentro de um manual de marca alheio
- _Diferenciais:_ motion básico (After Effects); ilustração própria; experiência em agência com múltiplas contas simultâneas
- _Perguntas de entrevista:_ "Mostre uma peça sua e conte o briefing que a originou." · "Conte de uma vez em que o cliente rejeitou seu conceito — o que você fez?" · "Como você adapta uma peça de feed para impresso sem refazer tudo?"

**Avaliação.**

- _O que olhamos:_ quantos retornos de Revisão a peça acumulou e **por qual motivo** (o motivo é o material da conversa, não a contagem); idade das etapas de Design paradas; se os fontes estão arquivados
- _Como lemos:_ retorno repetido pelo mesmo motivo é sinal de briefing ruim antes de ser sinal de execução ruim — a primeira pergunta é sobre o insumo, não sobre a pessoa
- _O que nunca fazemos:_ comparar designers por número de peças; usar contagem de retorno como nota; tratar tempo de conceito como desperdício

**Fontes.** [O\*NET 27-1024.00](https://www.onetonline.org/link/summary/27-1024.00) (tarefas e _technology skills_) · [CBO 2624-10](https://cbo.mte.gov.br/cbosite/pages/home.jsf) · templates Post Carrossel e Landing Page (`prisma/seed.ts`).

---

#### `video` — Vídeo

**Equipes cobertas:** `Video-makers`
**Referência ocupacional:** [O\*NET 27-4032.00](https://www.onetonline.org/link/summary/27-4032.00) (Film and Video Editors)

**Missão.** Transformar roteiro e material bruto em vídeo que prende nos primeiros segundos e entrega a mensagem no formato de cada canal.

**Entregáveis.**

- Etapa **Edição** (Vídeo Curto): corte final exportado nos formatos e proporções pedidos
- Legenda embutida ou arquivo de legenda, conforme o canal
- Trilha e efeitos licenciados, com a licença registrada
- Projeto e brutos arquivados na pasta da conta

**Interfaces.** Recebe de Social Media (roteiro aprovado e material bruto). Entrega para Revisão.

**Ferramentas.**

- _Obrigatórias:_ Adobe Premiere Pro — edição · Adobe After Effects — motion e legendagem animada · [CapCut](https://www.capcut.com) — corte rápido para formato vertical · [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve) — cor
- _Apoio:_ biblioteca de trilha licenciada · Adobe Media Encoder — exportação em lote
- _Referências internas:_ pasta de brutos da conta no NAS · padrão de abertura/encerramento por cliente · tabela de proporções e durações por canal

**Obrigações.**

- _Diárias:_ assumir a próxima etapa de Edição; conferir se o roteiro está aprovado e o bruto completo antes de abrir a timeline; registrar tempo; devolver com motivo quando faltar material
- _Semanais:_ arquivar projetos e brutos das entregas concluídas; limpar o armazenamento de trabalho
- _Mensais:_ revisar o padrão de abertura/encerramento das contas recorrentes; conferir vigência das licenças de trilha usadas
- _Anuais:_ revisar o inventário de equipamento e o fluxo de captação; atualizar reel

**Relatórios.**

| Artefato             | Conteúdo                                                                | Quando                  | Destino      | Onde entregar                 |
| -------------------- | ----------------------------------------------------------------------- | ----------------------- | ------------ | ----------------------------- |
| Pacote de entrega    | Corte final nos formatos + legenda + licenças usadas                    | Ao concluir a demanda   | Cliente      | Anexado à demanda · `CLIENTE` |
| Registro de captação | O que foi filmado, onde, com quem, e o que sobrou de bruto aproveitável | Após diária de gravação | Documentação | Anexado à demanda · `INTERNO` |

**Competências.**

- _Técnicas:_ ritmo e corte narrativo; sincronia de áudio e correção de nível; correção de cor; legendagem; exportação correta por canal; organização de mídia
- _Comportamentais:_ trabalha com o roteiro de outra pessoa sem reescrevê-lo por conta própria; avisa cedo quando o bruto não sustenta o roteiro

**Contratação.**

- _Requisitos:_ reel com trabalhos reais; domínio de Premiere **ou** Resolve; entendimento de formato vertical e das durações de cada rede
- _Diferenciais:_ captação (câmera, luz, áudio); motion em After Effects; correção de cor avançada
- _Perguntas de entrevista:_ "Mostre um corte seu e explique por que ele começa assim." · "O bruto chegou incompleto e o prazo é hoje — o que você faz?" · "Como você organiza mídia de um projeto com três dias de captação?"

**Avaliação.**

- _O que olhamos:_ retornos de Revisão e seus motivos; idade das etapas de Edição; se projeto e brutos foram arquivados
- _Como lemos:_ edição longa costuma ser sinal de roteiro ou bruto insuficiente — investiga-se a etapa anterior antes da pessoa
- _O que nunca fazemos:_ ranquear por quantidade de vídeos; usar duração de edição como medida de esforço

**Fontes.** [O\*NET 27-4032.00](https://www.onetonline.org/link/summary/27-4032.00) · template Vídeo Curto (`prisma/seed.ts`).

---

#### `revisao` — Revisão e Controle de Qualidade

**Equipes cobertas:** `Proofreading`, `Quality Control`
**Referência ocupacional:** [O\*NET 43-9081.00](https://www.onetonline.org/link/summary/43-9081.00) (Proofreaders and Copy Markers)

> As duas equipes existem por herança — `Proofreading` veio do roster real (_corrección_) e `Quality Control` do seed. Na prática exercem a mesma função: **ser o último gate antes de a peça sair**. Um descritivo cobre as duas.

**Missão.** Impedir que erro evitável chegue ao cliente — e devolver com motivo claro o que precisa voltar.

**Entregáveis.**

- Etapas **Revisão QC** (Vídeo Curto, Landing Page) e **Revisão Final** (Post Carrossel)
- Aprovação registrada, ou devolução com **motivo escrito** e o ponto exato a corrigir
- Checklist de saída preenchido: texto, marca, formato, dados do cliente, links

**Interfaces.** Recebe de Design, Vídeo e Engenharia de Software (peça pronta). Entrega para Atendimento / Coordenação (peça liberada para o cliente).

**Ferramentas.**

- _Obrigatórias:_ [LanguageTool](https://languagetool.org) — ortografia e gramática pt/es · Adobe Acrobat — marcação em PDF · [VOLP](https://www.academia.org.br/nossa-lingua/busca-no-vocabulario) — norma do português · [RAE / DPD](https://www.rae.es) — norma do espanhol
- _Apoio:_ Google Docs (modo sugestão) · verificador de links
- _Referências internas:_ manual de marca do cliente · glossário de termos e nomes próprios por conta · checklist de saída por tipo de peça

**Obrigações.**

- _Diárias:_ assumir as etapas de revisão na ordem da fila; devolver **sempre com motivo**, nunca só "reprovado"; registrar tempo
- _Semanais:_ consolidar os motivos de devolução da semana e levá-los à Coordenação — o padrão que se repete é problema de processo, não de pessoa
- _Mensais:_ atualizar glossário e checklist com o que apareceu no mês; revisar os termos e nomes próprios das contas ativas
- _Anuais:_ revisar os checklists de saída por tipo de peça contra os erros que efetivamente escaparam no ano

**Relatórios.**

| Artefato                          | Conteúdo                                                  | Quando                            | Destino      | Onde entregar                               |
| --------------------------------- | --------------------------------------------------------- | --------------------------------- | ------------ | ------------------------------------------- |
| Consolidado de motivos de retorno | Motivos agrupados por etapa de origem, sem nome de pessoa | Mensal                            | Gestão       | Anexado à demanda de fechamento · `INTERNO` |
| Checklist de saída assinado       | Itens conferidos na liberação                             | Por demanda, quando o tipo exigir | Documentação | Anexado à demanda · `INTERNO`               |

**Competências.**

- _Técnicas:_ norma culta em português **e** espanhol; leitura de prova e marcação; atenção a dado sensível (nome, preço, data, telefone, link); conhecimento das exigências legais de peça publicitária
- _Comportamentais:_ devolve com clareza e sem julgamento da pessoa; distingue erro de preferência pessoal e não devolve por gosto

**Contratação.**

- _Requisitos:_ domínio comprovado das duas línguas; experiência com leitura de prova; capacidade de justificar cada devolução por escrito
- _Diferenciais:_ formação em Letras, Comunicação ou Jornalismo; experiência com peça publicitária regulada
- _Perguntas de entrevista:_ "Devolva este texto e escreva o motivo." (teste prático) · "Como você separa 'está errado' de 'eu faria diferente'?" · "Um erro escapou e chegou ao cliente — o que você faz depois?"

**Avaliação.**

- _O que olhamos:_ o que **escapou** para o cliente (falha externa) separado do que foi pego internamente (gate funcionando, desejável); idade das etapas de revisão — gate que vira fila é gargalo
- _Como lemos:_ volume alto de devolução interna é o gate **fazendo o trabalho**, não um problema. O que se investiga é a falha externa, e a investigação começa na etapa que injetou o defeito
- _O que nunca fazemos:_ medir a Revisão por quantidade de aprovações; tratar devolução interna como custo a reduzir; nomear pessoa no consolidado de motivos

**Fontes.** [O\*NET 43-9081.00](https://www.onetonline.org/link/summary/43-9081.00) · [biblioteca de conhecimento §1/P5](./biblioteca-de-conhecimento.md) (qualidade na fonte, interno ≠ externo) · templates Vídeo Curto, Post Carrossel e Landing Page.

---

### 4.2 Conteúdo

---

#### `social-media` — Social Media

**Equipes cobertas:** `Social Media`
**Referência ocupacional:** [O\*NET 13-1161.00](https://www.onetonline.org/link/summary/13-1161.00) (Market Research Analysts and Marketing Specialists) · [O\*NET 27-3031.00](https://www.onetonline.org/link/summary/27-3031.00) (parcial)

**Missão.** Manter os perfis do cliente vivos e coerentes: planejar o que se publica, escrever o que sustenta a peça e acompanhar o que o conteúdo devolveu.

**Entregáveis.**

- **Calendário de publicação do mês**, aprovado pelo cliente antes de virar demanda
- Etapa **Roteiro** (Vídeo Curto) e etapa **Copy & Briefing** (Post Carrossel): texto e briefing aprovados que alimentam Design e Vídeo
- Publicação agendada ou publicada nos canais, no horário planejado
- Demonstrativo mensal de desempenho dos perfis

**Interfaces.** Recebe de Estratégia e Atendimento (direção da conta, insumo do cliente). Entrega para Design (briefing de carrossel) e Vídeo (roteiro).

**Ferramentas.**

- _Obrigatórias:_ [Meta Business Suite](https://business.facebook.com) — publicação e métricas Instagram/Facebook · [Metricool](https://metricool.com) — agendamento e relatório multicanal · apps nativos (Instagram, TikTok, LinkedIn) — publicação e recursos que só existem no app
- _Apoio:_ [Google Trends](https://trends.google.com) — pauta e sazonalidade · Canva — ajuste rápido de peça · Google Sheets — calendário e aprovação
- _Referências internas:_ manual de marca e tom de voz por cliente · pasta de aprovados · histórico de publicações da conta

**Obrigações.**

- _Diárias:_ publicar ou conferir o agendado do dia; monitorar o desempenho das últimas 48h; encaminhar à Community o que chegou de comentário e mensagem; registrar tempo nas etapas
- _Semanais:_ escrever os roteiros e briefings da semana seguinte e enviá-los para aprovação **antes** de abrir demanda de Design ou Vídeo; revisar o que rendeu e o que não rendeu
- _Mensais:_ **entregar o calendário de publicação do mês seguinte até o dia 25**, aprovado pelo cliente; produzir o demonstrativo mensal dos perfis
- _Anuais:_ montar o calendário de datas comemorativas e sazonalidades da conta; revisar o posicionamento dos perfis com Estratégia

**Relatórios.**

| Artefato                  | Conteúdo                                                                                                                         | Quando                               | Destino | Onde entregar                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------- | --------------------------------------------- |
| Calendário de publicação  | Peças previstas, canal, data, formato e responsável                                                                              | Mensal, até o dia 25 do mês anterior | Cliente | Anexado à demanda de planejamento · `CLIENTE` |
| Demonstrativo de perfis   | Crescimento de seguidores, alcance, impressões, engajamento e as publicações de maior e menor desempenho — com leitura do porquê | Mensal                               | Cliente | Anexado à demanda de fechamento · `CLIENTE`   |
| Retrospectiva de campanha | Alcance e engajamento da campanha contra o planejado, e o que se leva para a próxima                                             | Ao fim de cada campanha              | Cliente | Anexado à demanda · `CLIENTE`                 |

**Competências.**

- _Técnicas:_ redação para cada rede e cada formato; roteiro de vídeo curto; leitura de métrica de alcance e engajamento; planejamento de calendário; noção de direção de arte para briefar bem
- _Comportamentais:_ escreve no tom de voz do cliente, não no próprio; entrega briefing completo em vez de "faz um post bonito"; assume quando uma publicação não funcionou e diz o que aprendeu

**Contratação.**

- _Requisitos:_ portfólio de perfis geridos com resultado descrito; domínio do Meta Business Suite; redação limpa em português **e** espanhol
- _Diferenciais:_ roteiro e edição básica de vídeo vertical; experiência com múltiplas contas simultâneas; tráfego pago básico
- _Perguntas de entrevista:_ "Mostre um calendário mensal que você montou e explique a lógica." · "Uma publicação teve alcance muito abaixo do normal — como você investiga?" · "Escreva o briefing de um carrossel para esta marca." (teste prático)

**Avaliação.**

- _O que olhamos:_ o calendário saiu no prazo; roteiros e briefings chegaram aprovados às equipes seguintes (briefing incompleto trava Design e Vídeo); retornos de Revisão nas etapas de texto
- _Como lemos:_ alcance e engajamento são do **conteúdo e do algoritmo**, não da pessoa — entram na conversa como leitura de contexto, jamais como nota. Atraso repetido de calendário é sinal de sobrecarga ou de insumo que não chega do cliente
- _O que nunca fazemos:_ meta individual de seguidores ou de engajamento; comparar social medias entre contas com verbas e históricos diferentes

**Fontes.** [O\*NET 13-1161.00](https://www.onetonline.org/link/summary/13-1161.00) · templates Vídeo Curto e Post Carrossel (`prisma/seed.ts`) · biblioteca §1/P7.

---

#### `community` — Community

**Equipes cobertas:** `Community`
**Referência ocupacional:** [O\*NET 43-4051.00](https://www.onetonline.org/link/summary/43-4051.00) (Customer Service Representatives) · [O\*NET 27-3031.00](https://www.onetonline.org/link/summary/27-3031.00) (parcial)

**Missão.** Ser a voz da marca na conversa: responder quem chega pelos perfis, no tom certo e no tempo certo, e levar para dentro o que a audiência está dizendo.

**Entregáveis.**

- Respostas a comentários e mensagens diretas dentro do tempo acordado com a conta
- Triagem: o que é dúvida (responde), o que é venda (encaminha ao Comercial/Atendimento), o que é crise (escala imediatamente)
- Registro do que a audiência perguntou e reclamou, consolidado para Social Media e Estratégia

**Interfaces.** Recebe de Social Media (o que foi publicado e o tom da conta) e do público. Entrega para Atendimento, Comercial e Estratégia (o que a audiência devolveu).

**Ferramentas.**

- _Obrigatórias:_ [Meta Business Suite — Caixa de Entrada](https://business.facebook.com/latest/inbox) — comentários e DMs · [WhatsApp Business](https://business.whatsapp.com) — atendimento por mensagem · apps nativos das redes
- _Apoio:_ Google Sheets — registro de dúvidas recorrentes · Google Alerts — menções fora das redes
- _Referências internas:_ manual de tom de voz e respostas-padrão por cliente · protocolo de crise · lista do que **não** se responde sem autorização (preço, prazo, jurídico)

**Obrigações.**

- _Diárias:_ varrer comentários e mensagens de todos os perfis sob responsabilidade, pelo menos duas vezes; responder dentro do tempo acordado; escalar imediatamente o que for crise ou jurídico; registrar tempo
- _Semanais:_ consolidar as dúvidas e reclamações recorrentes e passá-las a Social Media e Atendimento; atualizar as respostas-padrão
- _Mensais:_ produzir o resumo do que a audiência disse — pauta para o conteúdo do mês seguinte
- _Anuais:_ revisar o protocolo de crise e o manual de respostas de cada conta

**Relatórios.**

| Artefato               | Conteúdo                                                           | Quando                           | Destino | Onde entregar                               |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------- | ------- | ------------------------------------------- |
| Resumo da audiência    | Dúvidas e reclamações recorrentes, temas em alta, sentimento geral | Mensal                           | Cliente | Anexado à demanda de fechamento · `CLIENTE` |
| Registro de ocorrência | O que aconteceu, quando, o que foi respondido e o desfecho         | A cada crise ou reclamação grave | Gestão  | Anexado à demanda · `INTERNO`               |

**Competências.**

- _Técnicas:_ escrita rápida e correta nas duas línguas; triagem por urgência; noção de quando **não** responder publicamente; leitura de sentimento
- _Comportamentais:_ mantém a compostura sob provocação; sabe a fronteira do que pode prometer em nome do cliente; escala cedo em vez de improvisar

**Contratação.**

- _Requisitos:_ português e espanhol fluentes na escrita; experiência com atendimento em canal público; disponibilidade para o horário de cobertura acordado
- _Diferenciais:_ experiência com gestão de crise; conhecimento do setor do cliente
- _Perguntas de entrevista:_ "Um cliente reclama publicamente e tem razão — escreva a resposta." · "Como você decide entre responder no público e chamar no privado?" · "Conte de uma conversa que você escalou — por que escalou?"

**Avaliação.**

- _O que olhamos:_ tempo até a primeira resposta contra o acordado com a conta; o que foi escalado e se foi escalado a tempo; ocorrências registradas
- _Como lemos:_ tempo de resposta ruim costuma ser cobertura insuficiente ou volume acima do dimensionado — a conversa é sobre escala do time antes de ser sobre a pessoa
- _O que nunca fazemos:_ meta de número de respostas por hora; medir por sentimento do público, que não está sob controle de quem responde

**Fontes.** [O\*NET 43-4051.00](https://www.onetonline.org/link/summary/43-4051.00) · [O\*NET 27-3031.00](https://www.onetonline.org/link/summary/27-3031.00).

---

#### `comunicacao` — Comunicação e Copy

**Equipes cobertas:** `Communicators`, `Copywriting`
**Referência ocupacional:** [CBO 2611](https://cbo.mte.gov.br/cbosite/pages/home.jsf) (profissionais do jornalismo) · [O\*NET 27-3031.00](https://www.onetonline.org/link/summary/27-3031.00) (Public Relations Specialists)

**Missão.** Escrever o que a marca diz — do texto que vende ao texto que explica — de forma que a pessoa certa entenda e aja.

**Entregáveis.**

- Etapa **Briefing & Copy** (Landing Page): texto completo da página, com hierarquia e chamadas
- Textos longos: e-mail, artigo, roteiro institucional, apresentação comercial
- Manual de tom de voz por cliente
- Revisão de coerência de mensagem entre as peças da mesma campanha

**Interfaces.** Recebe de Estratégia e Atendimento (posicionamento e briefing do cliente). Entrega para Design (texto aprovado que vira layout) e para Revisão.

**Ferramentas.**

- _Obrigatórias:_ Google Docs — escrita e ciclos de aprovação com controle de sugestões · [LanguageTool](https://languagetool.org) — checagem nas duas línguas
- _Apoio:_ [Google Trends](https://trends.google.com) e [Search Console](https://search.google.com/search-console) — vocabulário que o público usa · dicionários e bancos de sinônimos
- _Referências internas:_ manual de tom de voz por cliente · biblioteca de textos aprovados · glossário de termos técnicos da conta

**Obrigações.**

- _Diárias:_ assumir as etapas de copy na fila; conferir se o briefing está completo antes de escrever e devolver com motivo quando não estiver; registrar tempo
- _Semanais:_ entregar os textos da semana com folga para Revisão; conferir coerência entre as peças da mesma campanha
- _Mensais:_ revisar o manual de tom de voz das contas ativas contra o que foi produzido; atualizar a biblioteca de textos aprovados
- _Anuais:_ revisar posicionamento e mensagem-mãe de cada conta recorrente junto com Estratégia

**Relatórios.**

| Artefato                          | Conteúdo                                                  | Quando                                 | Destino | Onde entregar                 |
| --------------------------------- | --------------------------------------------------------- | -------------------------------------- | ------- | ----------------------------- |
| Manual de tom de voz              | Como a marca fala, o que evita, exemplos certos e errados | Na entrada da conta e na revisão anual | Cliente | Anexado à demanda · `CLIENTE` |
| Documento de mensagem de campanha | Mensagem-mãe, promessa, provas e desdobramento por canal  | No início de cada campanha             | Cliente | Anexado à demanda · `CLIENTE` |

**Competências.**

- _Técnicas:_ redação persuasiva e informativa; estrutura de página de conversão; adequação de registro por público e canal; escrita nas duas línguas com naturalidade; apuração e checagem de fato
- _Comportamentais:_ escreve para o objetivo, não para o próprio gosto; aceita corte; entrega no formato que o Design consegue usar

**Contratação.**

- _Requisitos:_ portfólio de textos com o objetivo de cada um descrito; português e espanhol de escrita profissional; capacidade de trabalhar a partir de briefing alheio
- _Diferenciais:_ formação em Jornalismo, Publicidade ou Letras; experiência com página de conversão; noção de SEO
- _Perguntas de entrevista:_ "Reescreva este parágrafo para outro público." (teste prático) · "Como você decide o tamanho de um texto?" · "O cliente quer um texto que você acha que não vai funcionar — o que você faz?"

**Avaliação.**

- _O que olhamos:_ retornos de Revisão e seus motivos; se o texto chegou ao Design no formato utilizável; idade das etapas de copy
- _Como lemos:_ reescrita repetida costuma indicar briefing ou posicionamento indefinido — a conversa começa em Estratégia e Atendimento
- _O que nunca fazemos:_ medir por volume de palavras ou de textos; ranquear redatores por número de aprovações de primeira

**Fontes.** [CBO 2611](https://cbo.mte.gov.br/cbosite/pages/home.jsf) · [O\*NET 27-3031.00](https://www.onetonline.org/link/summary/27-3031.00) · template Landing Page (`prisma/seed.ts`).

---

#### `imprensa` — Assessoria de Imprensa

**Equipes cobertas:** `Press Office`
**Referência ocupacional:** [CBO 2611-10](https://cbo.mte.gov.br/cbosite/pages/home.jsf) (assessor de imprensa) · [CBO 2611-25](https://cbo.mte.gov.br/cbosite/pages/home.jsf) (jornalista) · [O\*NET 27-3031.00](https://www.onetonline.org/link/summary/27-3031.00) (Public Relations Specialists)

**Missão.** Construir e proteger a reputação do cliente na mídia — conseguir a pauta certa no veículo certo, e responder bem quando a mídia procura.

**Entregáveis.**

- Release e sugestão de pauta enviados ao mailing segmentado
- Mailing de veículos e jornalistas por conta, atualizado
- Clipping das menções do período
- Preparação de porta-voz para entrevista e posicionamento oficial em crise

**Interfaces.** Recebe de Estratégia e Atendimento (fatos, marcos e posicionamento). Entrega para o cliente e para a mídia; alinha com Community o que é dito em público.

**Ferramentas.**

- _Obrigatórias:_ [Google Alerts](https://www.google.com/alerts) — monitoramento de menções · Gmail — envio segmentado ao mailing · Google Sheets — mailing e controle de envios
- _Apoio:_ [Muck Rack](https://muckrack.com) — busca de jornalistas · redes dos próprios veículos
- _Referências internas:_ mailing por conta e por editoria · histórico de clipping · protocolo de crise e lista de porta-vozes autorizados

**Obrigações.**

- _Diárias:_ monitorar menções do cliente e dos concorrentes; responder demanda de jornalista dentro do dia ou dizer quando responderá; escalar imediatamente menção negativa relevante
- _Semanais:_ propor pauta a partir do que a conta produziu; atualizar o mailing com retornos e devoluções
- _Mensais:_ entregar o clipping do mês com leitura do que rendeu e por quê
- _Anuais:_ revisar o plano de relacionamento com a imprensa da conta; revisar e testar o protocolo de crise com o cliente

**Relatórios.**

| Artefato               | Conteúdo                                                                   | Quando                   | Destino | Onde entregar                               |
| ---------------------- | -------------------------------------------------------------------------- | ------------------------ | ------- | ------------------------------------------- |
| Clipping               | Menções do período, veículo, alcance estimado, teor e leitura do resultado | Mensal                   | Cliente | Anexado à demanda de fechamento · `CLIENTE` |
| Relatório de crise     | Cronologia, o que foi dito, por quem, e o desfecho                         | Ao encerrar cada crise   | Gestão  | Anexado à demanda · `CONFIDENCIAL`          |
| Posicionamento oficial | Texto aprovado para uso público                                            | Quando a situação exigir | Cliente | Anexado à demanda · `CLIENTE`               |

**Competências.**

- _Técnicas:_ redação jornalística e de release; relacionamento com redação; leitura de agenda de mídia; gestão de crise; preparação de porta-voz
- _Comportamentais:_ discrição com informação sensível; não promete cobertura que não controla; distingue o que é fato do que é desejo do cliente

**Contratação.**

- _Requisitos:_ formação em Jornalismo ou Comunicação; rede de contatos em veículos relevantes; redação de release comprovada
- _Diferenciais:_ experiência prévia em redação; especialização no setor dos clientes; experiência real com gestão de crise
- _Perguntas de entrevista:_ "Escreva a sugestão de pauta para este fato." (teste prático) · "Um jornalista publicou algo errado sobre o cliente — o que você faz nas primeiras duas horas?" · "Como você monta um mailing do zero para um setor que não conhece?"

**Avaliação.**

- _O que olhamos:_ pautas propostas e enviadas; tempo de resposta a demanda de jornalista; se a crise foi escalada a tempo e conduzida pelo protocolo
- _Como lemos:_ **cobertura conquistada não é métrica de desempenho individual** — depende de agenda de mídia, notícia concorrente e do fato que o cliente forneceu. Entra como contexto, nunca como meta
- _O que nunca fazemos:_ meta de número de matérias publicadas; medir por centimetragem ou por "valor equivalente de mídia"

**Fontes.** [CBO 2611-10](https://cbo.mte.gov.br/cbosite/pages/home.jsf) e 2611-25 · [O\*NET 27-3031.00](https://www.onetonline.org/link/summary/27-3031.00).

---

### 4.3 Mídia e performance

---

#### `trafego` — Tráfego Pago

**Equipes cobertas:** `Traffic Manager`
**Referência ocupacional:** [O\*NET 11-2011.00](https://www.onetonline.org/link/summary/11-2011.00) (Advertising and Promotions Managers) · [O\*NET 13-1161.01](https://www.onetonline.org/link/summary/13-1161.01) (Search Marketing Strategists)

**Missão.** Fazer a verba do cliente comprar o resultado combinado — e provar, com dado, o que ela comprou.

**Entregáveis.**

- Etapa **Setup de Campanha**: estrutura de campanha, públicos, criativos e rastreamento configurados
- Etapa **Acompanhamento**: otimização durante a veiculação, com registro do que foi alterado e por quê
- Etapa **Relatório Mensal**: demonstrativo de investimento e resultado
- Plano de mídia com verba distribuída por canal e objetivo

**Interfaces.** Recebe de Estratégia (objetivo e verba) e de Design/Vídeo (criativos aprovados). Entrega para Atendimento e para o cliente.

**Ferramentas.**

- _Obrigatórias:_ [Meta Ads Manager](https://adsmanager.facebook.com) · [Google Ads](https://ads.google.com) · [Google Analytics 4](https://analytics.google.com) · [Google Tag Manager](https://tagmanager.google.com) — rastreamento e conversão
- _Apoio:_ [Looker Studio](https://lookerstudio.google.com) — painel de relatório · [TikTok Ads Manager](https://ads.tiktok.com) · Google Sheets — plano de mídia e conciliação de verba
- _Referências internas:_ histórico de campanhas e custos por conta · padrão de nomenclatura de campanha · acessos e permissões por cliente

**Obrigações.**

- _Diárias:_ conferir veiculação, entrega e ritmo de gasto de todas as campanhas ativas; agir sobre anúncio reprovado ou campanha parada; registrar cada alteração relevante com o motivo; registrar tempo
- _Semanais:_ otimizar públicos e criativos com base no dado da semana; alertar Atendimento quando o resultado divergir do combinado; pedir criativo novo com antecedência quando houver desgaste
- _Mensais:_ **entregar o relatório mensal de campanhas** e conciliar o investimento com o financeiro; revisar o plano de mídia do mês seguinte com Estratégia
- _Anuais:_ revisar sazonalidade e custos históricos da conta; revisar a estrutura de rastreamento e conversão de ponta a ponta

**Relatórios.**

| Artefato                      | Conteúdo                                                                                                         | Quando                              | Destino | Onde entregar                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------- | ---------------------------------- |
| Relatório mensal de campanhas | Investido por canal, alcance, cliques, conversões, custo por resultado, o que foi otimizado e o que se recomenda | Mensal (etapa Relatório Mensal)     | Cliente | Anexado à demanda · `CLIENTE`      |
| Plano de mídia                | Verba por canal e objetivo, públicos, período e resultado esperado                                               | No início de cada campanha ou ciclo | Cliente | Anexado à demanda · `CLIENTE`      |
| Conciliação de investimento   | Gasto real por conta de anúncio contra o previsto                                                                | Mensal                              | Gestão  | Anexado à demanda · `CONFIDENCIAL` |

**Competências.**

- _Técnicas:_ estruturação de campanha e segmentação; leitura de custo por resultado e de funil; configuração de rastreamento e eventos de conversão; teste de criativo; gestão de verba
- _Comportamentais:_ comunica resultado ruim cedo, sem maquiar; explica número para quem não é da área; documenta a alteração que fez

**Contratação.**

- _Requisitos:_ gestão comprovada de verba real em Meta Ads **e** Google Ads; entendimento de rastreamento e conversão; leitura crítica de métrica
- _Diferenciais:_ GTM e GA4 avançados; e-commerce; certificações Meta/Google
- _Perguntas de entrevista:_ "O custo por resultado dobrou de uma semana para outra — como você investiga?" · "Como você divide uma verba mensal entre prospecção e remarketing, e por quê?" · "Explique um resultado ruim para um cliente que só olha o total gasto."

**Avaliação.**

- _O que olhamos:_ o relatório mensal saiu no prazo; alterações relevantes documentadas com motivo; rastreamento íntegro; avisos dados a tempo quando o resultado divergiu
- _Como lemos:_ **resultado de campanha é do sistema** — verba, criativo, oferta, concorrência e sazonalidade. Não vira nota individual. O que se avalia é o _ofício_: leitura correta do dado, decisão documentada, aviso a tempo
- _O que nunca fazemos:_ meta individual de custo por resultado; comparar gestores de tráfego entre contas com verbas e mercados diferentes; comissão sobre desempenho de campanha

**Fontes.** [O\*NET 11-2011.00](https://www.onetonline.org/link/summary/11-2011.00) · [O\*NET 13-1161.01](https://www.onetonline.org/link/summary/13-1161.01) · template Campanha de Tráfego (`prisma/seed.ts`) · biblioteca §1/P1 e P2.

---

#### `seo` — SEO

**Equipes cobertas:** `SEO`
**Referência ocupacional:** [O\*NET 13-1161.01](https://www.onetonline.org/link/summary/13-1161.01) (Search Marketing Strategists)

**Missão.** Fazer o cliente ser encontrado por quem procura o que ele vende, sem pagar por cada clique.

**Entregáveis.**

- Etapa **SEO** (Landing Page): título, descrição, estrutura de cabeçalhos, URLs, imagens e dados estruturados conferidos antes da publicação
- Pesquisa de palavras-chave e mapa de intenção por página
- Auditoria técnica: rastreabilidade, indexação, velocidade, links quebrados
- Acompanhamento de posição e tráfego orgânico

**Interfaces.** Recebe de Engenharia de Software (página construída) e de Comunicação (texto). Roda em paralelo com Revisão. Entrega para o cliente.

**Ferramentas.**

- _Obrigatórias:_ [Google Search Console](https://search.google.com/search-console) — indexação e desempenho de busca · [Google Analytics 4](https://analytics.google.com) — comportamento e conversão · [PageSpeed Insights](https://pagespeed.web.dev) — desempenho
- _Apoio:_ [Screaming Frog](https://www.screamingfrog.co.uk/seo-spider/) — auditoria técnica · Semrush ou Ahrefs — palavras-chave e concorrência · [Rich Results Test](https://search.google.com/test/rich-results) — dados estruturados
- _Referências internas:_ mapa de palavras-chave por conta · histórico de auditorias · padrão de título e descrição por tipo de página

**Obrigações.**

- _Diárias:_ conferir erros novos de indexação e cobertura nas contas ativas; registrar tempo nas etapas
- _Semanais:_ acompanhar posição das palavras-chave prioritárias; revisar as páginas publicadas na semana antes de irem ao ar
- _Mensais:_ entregar o relatório de desempenho orgânico; revisar a lista de palavras-chave contra o que efetivamente traz tráfego
- _Anuais:_ auditoria técnica completa do site de cada conta recorrente; revisão da arquitetura de informação e da estratégia de conteúdo

**Relatórios.**

| Artefato                         | Conteúdo                                                                                         | Quando                        | Destino | Onde entregar                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- | ------- | ------------------------------------------- |
| Relatório de desempenho orgânico | Tráfego, impressões, cliques, posição média, páginas que subiram e caíram, e a leitura do porquê | Mensal                        | Cliente | Anexado à demanda de fechamento · `CLIENTE` |
| Auditoria técnica                | Erros encontrados, gravidade, correção recomendada e responsável                                 | Anual, ou na entrada da conta | Cliente | Anexado à demanda · `CLIENTE`               |

**Competências.**

- _Técnicas:_ pesquisa de palavra-chave e intenção de busca; SEO técnico (rastreio, indexação, dados estruturados, velocidade); SEO de conteúdo; leitura de Search Console e GA4; noção de HTML e de como o site é construído
- _Comportamentais:_ traduz recomendação técnica em tarefa executável pelo Dev; é honesto sobre o prazo do orgânico, que não é o do pago

**Contratação.**

- _Requisitos:_ casos com evolução de tráfego orgânico descrita e explicada; domínio de Search Console; entendimento de HTML e estrutura de página
- _Diferenciais:_ SEO técnico avançado; SEO local; experiência com e-commerce
- _Perguntas de entrevista:_ "O tráfego orgânico caiu 30% num mês — quais são suas três primeiras hipóteses e como você as testa?" · "Como você prioriza entre cem recomendações de auditoria?" · "Explique dados estruturados para um cliente."

**Avaliação.**

- _O que olhamos:_ etapas de SEO concluídas antes da publicação (SEO depois do ar é retrabalho); recomendações entregues em formato executável; relatório no prazo
- _Como lemos:_ **posição e tráfego orgânico dependem do algoritmo e da concorrência** — são contexto, não nota. O ofício avaliável é o diagnóstico e a priorização
- _O que nunca fazemos:_ meta individual de posição ou de tráfego; comparar profissionais entre sites com autoridade e histórico diferentes

**Fontes.** [O\*NET 13-1161.01](https://www.onetonline.org/link/summary/13-1161.01) · template Landing Page (`prisma/seed.ts`).

---

### 4.4 Cliente

---

#### `atendimento` — Atendimento

**Equipes cobertas:** `Customer Service`
**Referência ocupacional:** [O\*NET 43-4051.00](https://www.onetonline.org/link/summary/43-4051.00) (Customer Service Representatives) · [O\*NET 11-2011.00](https://www.onetonline.org/link/summary/11-2011.00) (parcial)

**Missão.** Ser a ponte entre o cliente e a agência: traduzir o que o cliente quer em briefing que a equipe consegue executar, e traduzir o que a equipe entregou em algo que o cliente entende.

**Entregáveis.**

- Briefing completo e aprovado, que dá origem à demanda
- Aprovação do cliente registrada, com o que foi pedido de alteração
- Ata de reunião com decisões e responsáveis
- Relatório de conta consolidado para o cliente

**Interfaces.** Recebe do cliente. Entrega para Coordenação, Social Media, Comunicação e Tráfego (briefing e insumos). Recebe de Revisão a peça liberada e a leva ao cliente.

**Ferramentas.**

- _Obrigatórias:_ [WhatsApp Business](https://business.whatsapp.com) — canal principal com o cliente · Gmail — registro formal · [Google Meet](https://meet.google.com) — reunião · Google Drive — troca de arquivo com o cliente
- _Apoio:_ Google Calendar — reuniões e prazos do cliente · Google Docs — ata e briefing
- _Referências internas:_ contrato e escopo por cliente · histórico da conta · modelo de briefing por tipo de demanda · lista de aprovadores de cada cliente

**Obrigações.**

- _Diárias:_ responder o cliente dentro do prazo acordado; abrir demanda **só com briefing completo**; levar aprovação e alteração para dentro no mesmo dia; registrar tempo
- _Semanais:_ revisar com a Coordenação o que está em curso em cada conta; antecipar ao cliente o que vai atrasar, **antes** de atrasar; conferir o que está esperando insumo do cliente
- _Mensais:_ reunião de resultado com cada conta; consolidar o relatório de conta; revisar escopo consumido contra contratado
- _Anuais:_ revisão de contrato e escopo com o cliente; plano da conta para o ano seguinte com Estratégia

**Relatórios.**

| Artefato           | Conteúdo                                                                            | Quando                       | Destino      | Onde entregar                               |
| ------------------ | ----------------------------------------------------------------------------------- | ---------------------------- | ------------ | ------------------------------------------- |
| Relatório de conta | O que foi entregue, o que está em curso, resultados do período e o que vem a seguir | Mensal                       | Cliente      | Anexado à demanda de fechamento · `CLIENTE` |
| Ata de reunião     | Decisões, responsáveis e prazos                                                     | A cada reunião com o cliente | Documentação | Anexado à demanda · `INTERNO`               |
| Controle de escopo | Consumido contra contratado, e o que passou do escopo                               | Mensal                       | Gestão       | Anexado à demanda · `CONFIDENCIAL`          |

**Competências.**

- _Técnicas:_ levantamento e escrita de briefing; leitura de contrato e escopo; noção suficiente de cada disciplina para saber o que é viável; apresentação de resultado
- _Comportamentais:_ diz "não" ao cliente quando o pedido está fora do escopo ou do prazo; não promete o que a equipe não confirmou; leva o problema para dentro cedo

**Contratação.**

- _Requisitos:_ experiência com carteira de clientes; escrita e fala profissionais em português e espanhol; capacidade de escrever briefing que a equipe consegue executar
- _Diferenciais:_ vivência em agência; conhecimento do setor dos clientes; negociação
- _Perguntas de entrevista:_ "O cliente pede algo fora do escopo, para ontem — o que você faz?" · "Transforme este pedido vago em briefing." (teste prático) · "Como você comunica um atraso que é culpa da agência?"

**Avaliação.**

- _O que olhamos:_ briefings que voltaram por estarem incompletos; atrasos que o cliente descobriu antes de ser avisado; escopo consumido contra contratado; demandas paradas esperando insumo do cliente
- _Como lemos:_ briefing incompleto é o defeito mais caro da agência — ele para Design, Vídeo e Copy ao mesmo tempo. A conversa é sobre o padrão de briefing, com o motivo à vista
- _O que nunca fazemos:_ meta individual de faturamento por conta; medir por satisfação declarada do cliente, que depende de fatores fora do controle de quem atende

**Fontes.** [O\*NET 43-4051.00](https://www.onetonline.org/link/summary/43-4051.00) · [O\*NET 11-2011.00](https://www.onetonline.org/link/summary/11-2011.00).

---

#### `estrategia` — Estratégia

**Equipes cobertas:** `Strategy`
**Referência ocupacional:** [O\*NET 13-1161.00](https://www.onetonline.org/link/summary/13-1161.00) (Market Research Analysts and Marketing Specialists) · [CBO 1423](https://cbo.mte.gov.br/cbosite/pages/home.jsf) (gerentes de comercialização, marketing e comunicação)

**Missão.** Decidir **o que** a agência deve fazer para a conta atingir o objetivo — e garantir que todas as disciplinas estejam remando para o mesmo lugar.

**Entregáveis.**

- Plano estratégico da conta: objetivo, público, posicionamento, canais e como se mede
- Conceito de campanha, que orienta Comunicação, Design, Vídeo e Tráfego
- Análise de concorrência e de mercado
- Leitura consolidada de resultado: o que funcionou, o que não funcionou e o que muda

**Interfaces.** Recebe de Atendimento (objetivo e contexto do cliente) e de Tráfego, Social Media e SEO (resultado). Entrega para todas as disciplinas de execução.

**Ferramentas.**

- _Obrigatórias:_ [Google Analytics 4](https://analytics.google.com) · [Looker Studio](https://lookerstudio.google.com) — consolidação multicanal · [Meta Business Suite](https://business.facebook.com) · Google Sheets — modelo de plano e de verba
- _Apoio:_ [Google Trends](https://trends.google.com) · Search Console · pesquisas setoriais e relatórios de mercado
- _Referências internas:_ histórico de campanhas e resultados por conta · plano do ano vigente · biblioteca de casos da agência

**Obrigações.**

- _Diárias:_ acompanhar os sinais das contas em campanha ativa; responder dúvida de direção que trave execução
- _Semanais:_ revisar com Tráfego e Social Media o que o dado da semana está dizendo; ajustar direção quando o sinal for claro
- _Mensais:_ consolidar o resultado do mês por conta e recomendar o próximo ciclo; revisar plano de mídia com Tráfego
- _Anuais:_ construir o plano estratégico do ano de cada conta recorrente; revisar posicionamento e concorrência

**Relatórios.**

| Artefato                         | Conteúdo                                                                   | Quando                     | Destino | Onde entregar                               |
| -------------------------------- | -------------------------------------------------------------------------- | -------------------------- | ------- | ------------------------------------------- |
| Plano estratégico da conta       | Objetivo, público, posicionamento, canais, calendário macro e como se mede | Anual, revisado por ciclo  | Cliente | Anexado à demanda · `CLIENTE`               |
| Leitura consolidada de resultado | Resultado por canal, o que explica, e a recomendação para o próximo ciclo  | Mensal                     | Cliente | Anexado à demanda de fechamento · `CLIENTE` |
| Conceito de campanha             | Ideia central, promessa, desdobramento por canal e critérios de sucesso    | No início de cada campanha | Cliente | Anexado à demanda · `CLIENTE`               |

**Competências.**

- _Técnicas:_ diagnóstico de negócio e de mercado; definição de público e posicionamento; leitura integrada de dado multicanal; desenho de funil; construção de plano com métrica declarada
- _Comportamentais:_ sustenta a recomendação com evidência e muda de ideia quando o dado contraria; escreve de forma que a execução consiga seguir

**Contratação.**

- _Requisitos:_ casos com objetivo, decisão e resultado descritos; leitura de dado multicanal; capacidade de escrever plano executável
- _Diferenciais:_ pesquisa de mercado; experiência com múltiplos setores; formação em Publicidade, Marketing ou Administração
- _Perguntas de entrevista:_ "Este cliente quer dobrar as vendas em seis meses — o que você pergunta antes de responder?" · "Conte de uma estratégia sua que não funcionou. O que o dado mostrou e o que você mudou?" · "Como você decide entre investir em orgânico e em pago?"

**Avaliação.**

- _O que olhamos:_ planos entregues no prazo do ciclo; recomendação acompanhada de critério de sucesso declarado **antes** do resultado; execução alinhada ao conceito
- _Como lemos:_ resultado de negócio do cliente tem dezenas de causas fora da agência — é contexto. O ofício avaliável é a qualidade do diagnóstico e a honestidade da leitura
- _O que nunca fazemos:_ vincular avaliação ao faturamento do cliente; medir por número de planos produzidos

**Fontes.** [O\*NET 13-1161.00](https://www.onetonline.org/link/summary/13-1161.00) · [CBO 1423](https://cbo.mte.gov.br/cbosite/pages/home.jsf) · biblioteca §1/P4 (previsão pela classe, não pela tarefa).

---

#### `coordenacao` — Coordenação

**Equipes cobertas:** `Coordination`
**Referência ocupacional:** [CBO 1423](https://cbo.mte.gov.br/cbosite/pages/home.jsf) (gerentes de comercialização, marketing e comunicação) · [O\*NET 11-2021.00](https://www.onetonline.org/link/summary/11-2021.00) (Marketing Managers)

> Coordenação é a função que **opera o fluxo**. É a única deste documento cujas obrigações se apoiam diretamente nas telas de gestão do Work OS — e por isso é também a que mais precisa das salvaguardas da §2.

**Missão.** Fazer o trabalho fluir: garantir que cada demanda tenha insumo, responsável e prazo viável, e agir onde o fluxo trava.

**Entregáveis.**

- Demandas abertas com template, prazo e responsável corretos
- Fila distribuída de forma que ninguém esteja travado nem ocioso
- Escalonamento do que travou, com decisão registrada
- Ritual de equipe: reunião de fila, 1:1 e retrospectiva acontecendo

**Interfaces.** Recebe de Atendimento e Estratégia (o que precisa ser feito e quando). Entrega para todas as equipes de execução. Reporta à Gestão.

**Ferramentas.**

- _Obrigatórias:_ Google Calendar — reuniões, prazos e rituais · Google Sheets — capacidade e planejamento macro · [Google Meet](https://meet.google.com) — rituais
- _Apoio:_ Google Docs — atas, retrospectivas e registro de decisão
- _Referências internas:_ calendário de férias e ausências · capacidade semanal acordada por pessoa · rituais e seus horários fixos

**Obrigações.**

- _Diárias:_ percorrer a rotina de gestão do fluxo — restrição do sistema, demandas envelhecidas, quem está sobrecarregado, o que está bloqueado — e **agir na exceção**; abrir as demandas do dia com briefing completo
- _Semanais:_ reunião de fila com as equipes; redistribuir o que ficou parado; conferir prazos da semana seguinte contra a capacidade real; conduzir os 1:1 devidos
- _Mensais:_ revisar cobertura e datas do mês seguinte; retrospectiva com as equipes sobre o que travou e por quê; consolidar o relatório de fluxo para a Gestão
- _Anuais:_ revisar templates de fluxo contra como o trabalho é realmente feito; planejar férias e picos de sazonalidade; revisar a capacidade acordada de cada pessoa

**Relatórios.**

| Artefato             | Conteúdo                                                                           | Quando | Destino      | Onde entregar                               |
| -------------------- | ---------------------------------------------------------------------------------- | ------ | ------------ | ------------------------------------------- |
| Relatório de fluxo   | Entregue no período, o que atrasou e por quê, restrição do sistema e a ação tomada | Mensal | Gestão       | Anexado à demanda de fechamento · `INTERNO` |
| Ata de retrospectiva | O que travou, a causa e a mudança de processo acordada                             | Mensal | Documentação | Anexado à demanda · `INTERNO`               |

**Competências.**

- _Técnicas:_ leitura de fila e de gargalo; distribuição de carga; negociação de prazo com base em histórico, não em otimismo; condução de ritual; leitura das métricas de fluxo do Work OS
- _Comportamentais:_ age na exceção em vez de cobrar todo mundo; protege a equipe de mudança de prioridade constante; conduz 1:1 sobre o trabalho, não sobre a pessoa

**Contratação.**

- _Requisitos:_ experiência coordenando equipe multidisciplinar; conforto com dado de fluxo; capacidade de dizer "não cabe" com argumento
- _Diferenciais:_ formação ou prática em gestão de fluxo (Kanban, ToC); vivência prévia em execução numa das disciplinas
- _Perguntas de entrevista:_ "Três contas pedem urgência no mesmo dia e a equipe está cheia — como você decide?" · "Como você descobre qual etapa está segurando a agência?" · "Conte de um 1:1 difícil que você conduziu."

**Avaliação.**

- _O que olhamos:_ demandas abertas com briefing completo; cadência de 1:1 em dia; prazos negociados com base no histórico do tipo de trabalho; se a restrição identificada virou ação
- _Como lemos:_ atraso e sobrecarga são propriedades do **sistema** — entram como diagnóstico do fluxo, não como falha de quem coordena. O ofício avaliável é ter visto a exceção e agido
- _O que nunca fazemos:_ usar as métricas de carga da equipe como ranking de pessoas; cobrar utilização como meta (a faixa 60–90% é indicativa, nunca alarme); premiar por volume entregue

**Fontes.** [CBO 1423](https://cbo.mte.gov.br/cbosite/pages/home.jsf) · [O\*NET 11-2021.00](https://www.onetonline.org/link/summary/11-2021.00) · biblioteca §1/P2, P3, P6 e P7 · `docs/admin-team-health-cockpit.md`.

---

### 4.5 Tecnologia

---

#### `engenharia-de-software` — Engenharia de Software

**Equipes cobertas:** `Software Engineer`
**Referência ocupacional:** [CBO 2124](https://cbo.mte.gov.br/cbosite/pages/home.jsf) (analistas de sistemas computacionais) · [O\*NET 15-1252.00](https://www.onetonline.org/link/summary/15-1252.00) (Software Developers) · [O\*NET 15-1254.00](https://www.onetonline.org/link/summary/15-1254.00) (Web Developers)

**Missão.** Construir e manter o que a agência entrega em código — sites, páginas e as ferramentas internas de que a operação depende.

**Entregáveis.**

- Etapa **Development** (Landing Page): página construída, responsiva, com rastreamento instalado e publicada
- Correções e melhorias em sites sob manutenção
- Ferramentas internas, incluindo o próprio Work OS
- Documentação técnica de acesso, dependências e como publicar

**Interfaces.** Recebe de Design (layout aprovado) e de Comunicação (texto). Entrega para Revisão e SEO. Trabalha junto de TI em tudo que envolva infraestrutura.

**Ferramentas.**

- _Obrigatórias:_ [GitHub](https://github.com) — código e revisão · [VS Code](https://code.visualstudio.com) — desenvolvimento · [Vercel](https://vercel.com) — publicação e ambientes de pré-visualização · [Google Tag Manager](https://tagmanager.google.com) — rastreamento
- _Apoio:_ [PageSpeed Insights](https://pagespeed.web.dev) — desempenho · [Figma](https://figma.com) — leitura de specs do layout · [WordPress](https://wordpress.org) — sites legados sob manutenção
- _Referências internas:_ repositórios e seus README · convenções de código do projeto · inventário de domínios, hospedagens e acessos (com TI)

**Obrigações.**

- _Diárias:_ assumir as etapas de desenvolvimento na fila; conferir que o layout está aprovado e completo antes de começar; registrar tempo; responder a incidente em site publicado
- _Semanais:_ revisar o que foi publicado; conferir dependências e alertas de segurança dos projetos ativos
- _Mensais:_ atualizar dependências e revisar desempenho dos sites sob manutenção; revisar backup e recuperação com TI
- _Anuais:_ revisar arquitetura e custos das ferramentas internas; revisar a documentação técnica das contas

**Relatórios.**

| Artefato                | Conteúdo                                                                         | Quando                         | Destino | Onde entregar                 |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------ | ------- | ----------------------------- |
| Documentação de entrega | Onde está publicado, como se altera, acessos, dependências e o que fazer se cair | Ao concluir um site ou sistema | Cliente | Anexado à demanda · `CLIENTE` |
| Relatório de incidente  | O que caiu, por quanto tempo, a causa e o que impede a repetição                 | A cada incidente               | Gestão  | Anexado à demanda · `INTERNO` |

**Competências.**

- _Técnicas:_ HTML, CSS e JavaScript/TypeScript; um framework de aplicação web; versionamento com Git; publicação e ambientes; banco de dados relacional; noção de desempenho e de acessibilidade
- _Comportamentais:_ estima com faixa, não com número único; avisa cedo quando o escopo cresceu; escreve código que outra pessoa consegue manter

**Contratação.**

- _Requisitos:_ repositório público ou código demonstrável; domínio de Git; capacidade de implementar um layout com fidelidade
- _Diferenciais:_ Next.js/React; banco de dados e modelagem; integrações e automação; noção de SEO técnico
- _Perguntas de entrevista:_ "Implemente esta seção do layout." (teste prático curto) · "Um site do cliente caiu — quais são seus primeiros passos?" · "Como você estima uma página que nunca fez antes?"

**Avaliação.**

- _O que olhamos:_ retornos de Revisão e SEO e seus motivos; idade das etapas de desenvolvimento; incidentes em produção e se a causa foi tratada; documentação entregue
- _Como lemos:_ estouro de prazo em trabalho técnico é frequentemente escopo mal definido a montante — investiga-se o briefing e o layout antes da pessoa. **Prazo é faixa (p85), nunca promessa determinística**
- _O que nunca fazemos:_ medir por linhas de código, commits ou demandas fechadas; usar estimativa em horas como compromisso de prazo

**Fontes.** [CBO 2124](https://cbo.mte.gov.br/cbosite/pages/home.jsf) · [O\*NET 15-1252.00](https://www.onetonline.org/link/summary/15-1252.00) e 15-1254.00 · template Landing Page (`prisma/seed.ts`) · biblioteca §1/P3.

---

#### `ti` — TI e Infraestrutura

**Equipes cobertas:** `IT`
**Referência ocupacional:** [CBO 2124](https://cbo.mte.gov.br/cbosite/pages/home.jsf) (analistas de sistemas computacionais — suporte e redes) · [O\*NET 15-1244.00](https://www.onetonline.org/link/summary/15-1244.00) (Network and Computer Systems Administrators)

**Missão.** Manter a agência funcionando: rede, equipamentos, contas, armazenamento e backup — e garantir que arquivo de cliente não se perca nem vaze.

**Entregáveis.**

- Rede, NAS e estações operando, com backup verificado
- Contas e acessos provisionados na entrada e **revogados na saída** de cada pessoa
- Chamados de suporte resolvidos e registrados
- Inventário de equipamentos, licenças e domínios atualizado

**Interfaces.** Atende todas as equipes. Trabalha junto de Engenharia de Software em infraestrutura e publicação; junto de RH na entrada e saída de pessoas.

**Ferramentas.**

- _Obrigatórias:_ [Synology DSM](https://www.synology.com/dsm) — NAS, compartilhamentos e backup · [Google Workspace Admin](https://admin.google.com) — contas, grupos e segurança · [Cloudflare](https://dash.cloudflare.com) — DNS, certificados e proteção · console de antivírus/endpoint
- _Apoio:_ Google Sheets — inventário e controle de licenças · ferramenta de acesso remoto para suporte
- _Referências internas:_ mapa de rede e de compartilhamentos · política de sensibilidade de arquivos (`INTERNO` · `CLIENTE` · `CONFIDENCIAL`) · procedimento de entrada e saída de colaborador

**Obrigações.**

- _Diárias:_ verificar se o backup da noite rodou; atender os chamados abertos por prioridade; monitorar espaço e saúde do NAS; registrar o que foi feito
- _Semanais:_ aplicar atualizações de segurança; revisar acessos concedidos na semana; conferir alertas de rede e de endpoint
- _Mensais:_ **testar a restauração de um backup** — backup não testado não é backup; revisar inventário e licenças; revisar contas ativas contra o quadro real de pessoas
- _Anuais:_ revisar a política de acessos e sensibilidade com a Gestão; planejar renovação de equipamentos; revisar plano de continuidade e testá-lo

**Relatórios.**

| Artefato                    | Conteúdo                                                                                                       | Quando           | Destino | Onde entregar                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- | ------- | ------------------------------------------- |
| Relatório de infraestrutura | Disponibilidade, chamados por tipo, espaço e saúde do armazenamento, backups verificados e restauração testada | Mensal           | Gestão  | Anexado à demanda de fechamento · `INTERNO` |
| Registro de incidente       | O que ocorreu, impacto, causa e a medida que impede a repetição                                                | A cada incidente | Gestão  | Anexado à demanda · `CONFIDENCIAL`          |
| Inventário e acessos        | Equipamentos, licenças, domínios e quem tem acesso a quê                                                       | Anual            | Gestão  | Anexado à demanda · `CONFIDENCIAL`          |

**Competências.**

- _Técnicas:_ redes (DNS, roteamento, VPN, Wi-Fi); administração de NAS e armazenamento; backup e restauração; administração do Google Workspace; segurança básica (endpoint, senhas, MFA); suporte a estações Windows e macOS
- _Comportamentais:_ documenta o que fez; comunica indisponibilidade antes que perguntem; trata dado de cliente como confidencial por padrão

**Contratação.**

- _Requisitos:_ experiência com rede e suporte em ambiente com dezenas de estações; administração de NAS **ou** servidor de arquivos; rotina real de backup e restauração
- _Diferenciais:_ Synology; Cloudflare e DNS; automação e scripts; segurança da informação
- _Perguntas de entrevista:_ "O NAS parou às 9h e a agência inteira depende dele — o que você faz, na ordem?" · "Como você comprova que o backup funciona?" · "Uma pessoa saiu ontem — o que precisa acontecer hoje?"

**Avaliação.**

- _O que olhamos:_ backup verificado e **restauração testada no mês**; tempo até a primeira resposta nos chamados; acessos revogados no prazo após desligamento; incidentes com causa tratada
- _Como lemos:_ incidente é evento de sistema — a leitura é sobre a causa e a prevenção, não sobre culpa. Volume alto de chamados aponta para problema de equipamento ou processo antes de apontar para a pessoa
- _O que nunca fazemos:_ medir por número de chamados fechados; ranquear por tempo médio de atendimento, que depende do que chega

**Fontes.** [CBO 2124](https://cbo.mte.gov.br/cbosite/pages/home.jsf) · [O\*NET 15-1244.00](https://www.onetonline.org/link/summary/15-1244.00) · `docs/nas-rollout-checklist.md` · política de sensibilidade em `lib/nas/sensitivity.ts`.

---

## 5. Fontes

**Ocupacionais**

- **O\*NET OnLine** (U.S. Department of Labor) — tarefas, _technology skills_ e competências por ocupação. Códigos usados: 27-1024.00, 27-4032.00, 43-9081.00, 27-3031.00, 13-1161.00, 13-1161.01, 11-2011.00, 11-2021.00, 43-4051.00, 15-1252.00, 15-1254.00, 15-1244.00. https://www.onetonline.org
- **CBO — Classificação Brasileira de Ocupações** (Ministério do Trabalho e Emprego). Códigos verificados: **2624-10** desenhista industrial gráfico (designer gráfico) · **2611-10** assessor de imprensa · **2611-25** jornalista · **1423** gerentes de comercialização, marketing e comunicação · **2124** analistas de sistemas computacionais. Os demais descritivos citam a **família** da CBO, não um código específico — quando o RH precisar do código exato para registro, consultar a tabela oficial do MTE: https://cbo.mte.gov.br/cbosite/pages/home.jsf (o site oficial busca por palavra-chave; não aceita link direto por código, então todas as citações de CBO neste documento apontam para a busca).

**Prática de RH**

- **SHRM — Body of Applied Skills and Knowledge (BASK), 2025** — estrutura de descritivo de cargo e modelo de competências, construído segundo as boas práticas da SIOP para modelagem de competências e análise de cargo. https://www.shrm.org
- **SHRM / Microsoft (2013)** — abandono do _stack ranking_; evidência contra ranking forçado.
- **Google re:Work — Project Aristotle** — notas individuais não predizem efetividade de time; o que separa times efetivos é a dinâmica (segurança psicológica à frente), não a composição. https://rework.withgoogle.com/intl/en/guides/understand-team-effectiveness

**Fundamentos que restringem este documento**

- `docs/biblioteca-de-conhecimento.md` §1 (os oito princípios), §5 (anti-features).
- Austin, _Measuring and Managing Performance in Organizations_ — P1.
- Deming / SPC — P2. Reinertsen e Vacanti — P3 e P7. Flyvbjerg e Kahneman — P4. Toyota/TPS e COPQ — P5. Goldratt/ToC e DeGrandis — P6.

**Internas**

- `prisma/seed.ts` — templates e etapas por equipe. · `scripts/import-roster.mjs` — o mapa cargo→equipe do roster real.
- `docs/pesquisa-gestao-fluxo-e-pessoas.md` · `docs/pesquisa-medicao-desempenho-criativo.md` · `docs/pesquisa-qualidade-e-retrabalho.md` · `docs/admin-team-health-cockpit.md` · `docs/arquitetura-de-informacao.md`.

---

## 6. Como documentar uma função nova

### Equipes ainda não documentadas

Estas existem no seed ou no roster real e **aparecem em `/help/equipes` marcadas como não documentadas**. A ausência é visível de propósito: função invisível é função sem expectativa escrita.

`Call Center` · `Commercial` · `Events` · `Finance` · `General Services` · `HR` · `Interns` · `Management` · `Manager` · `POS` · `Receptive Guides` · `Reception` · `Supervisor` · `Supervisor Receptive Guides`

Duas observações sobre essa lista:

- **`Manager`, `Supervisor` e `Management` não são funções** — são níveis, que já vivem em `UserRole`. Existem como equipe por herança do seed e do roster. Antes de escrever descritivo para elas, a decisão certa é discutir se devem continuar existindo como `Team`.
- **`Receptive Guides`, `Supervisor Receptive Guides`, `POS` e `Call Center`** pertencem à operação de receptivo/turismo, não à agência de marketing. Merecem um bloco próprio de pesquisa, com referências ocupacionais distintas.

### O procedimento

1. **Confirme que é função, não nível.** Se o nome descreve hierarquia, pare — a discussão é outra.
2. **Levante a referência ocupacional, com link.** Um código CBO e uma ocupação O\*NET. É o que dá vocabulário formal e evita descritivo inventado — e o link é o que permite conferir. O guard reprova referência ocupacional citada sem endereço; fonte interna sem endereço próprio (um template do fluxo, uma política) pode ficar sem link.
3. **Leia o fluxo real.** Se a função é dona de alguma `TemplateStage`, os entregáveis e as interfaces saem dali. Se não é dona de nenhuma, diga isso no descritivo em vez de forçar.
4. **Escreva as dez seções da §3**, nesta ordem, respeitando as três regras de conteúdo.
5. **Passe a seção `avaliacao` pelo crivo da §2.** `oQueNuncaFazemos` nunca fica vazio. Se você não consegue preencher essa lista, você ainda não entendeu o risco daquela função.
6. **Registre no catálogo:** adicione a entrada em `lib/team-profiles/catalog.ts` (slug, `teamNames`, família, ícone) e **remova o nome de `UNDOCUMENTED_TEAM_NAMES`**.
7. **Escreva os textos nos dois locales**, em `locales/pt-BR/teamProfiles.json` e `locales/es-ES/teamProfiles.json`. O es-ES é espanhol real — o guard de paridade reprova ortografia portuguesa.
8. **Rode `npm test`.** `__tests__/content/team-profiles.test.ts` reprova seção faltando, equipe não coberta, `destino` inválido e vocabulário proibido em `avaliacao`.

### Manutenção

Para escrever o **modelo** de um relatório (a §3.1): registre a entrada em `lib/team-profiles/reports.ts` com destino e sensibilidade, escreva as oito partes nos dois locales em `reportModels.json`, e aponte o campo `modelo` da entrada correspondente em `teamProfiles.json`. O guard reprova modelo órfão, `modelo` apontando para slug inexistente, divergência de destino ou sensibilidade entre modelo e descritivo, e esqueleto que não cobre a anatomia.

Este documento e `locales/{pt-BR,es-ES}/teamProfiles.json` são **acoplados**: o JSON é a versão in-app deste conteúdo. O guard de paridade cobre chaves, não texto — ao alterar um descritivo aqui, atualize o JSON nos dois locales, e vice-versa. É a mesma regra que já vale entre `docs/biblioteca-de-conhecimento.md` e `locales/*/help.json`.

Quando um template de fluxo mudar em `prisma/seed.ts`, revise a tabela da §3 e os `entregaveis`/`interfaces` das equipes afetadas.
