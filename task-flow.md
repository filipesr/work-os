

---

### Apresentando o Fluxo: A Jornada da "Landing Page"

**Público-alvo (Gestão/Colaboradores):** "Vamos simular a criação de uma 'Landing Page', algo que hoje gera dezenas de e-mails, mensagens no WhatsApp e links perdidos no Trello. Vamos ver como isso funciona no novo sistema."

#### 1. Concepção (O Pedido)

* **Quem:** O `Manager` (Gestor) ou `Supervisor`.
* **O que ele faz:** Ele clica em "Nova Demanda". Em vez de um card em branco, ele vê um dropdown: **"Qual fluxo de trabalho você quer iniciar?"**
* **Ação:** Ele seleciona o template: **"Landing Page"**.
* **O que o sistema faz:** O sistema *instantaneamente* mostra o "caminho" que essa tarefa vai percorrer, baseado no script que definimos (Briefing & Copy -> Design -> Dev -> QC -> SEO).
* **O Gestor preenche:**
    1.  Título: "LP Lançamento Produto X"
    2.  Cliente: "Cliente Y"
    3.  Data de Entrega: "30/11"
    4.  Anexa o `Artefato (Link)`: "Briefing da Reunião (Google Doc)"
* Ele clica em "Criar".

#### 2. Etapa 1: Briefing & Copy

* **O que acontece:** O sistema cria a Demanda e automaticamente a define para a primeira etapa: "Briefing & Copy".
* **O "Pulo do Gato":** A tarefa aparece *apenas* no dashboard da equipe de `Copywriting`.
* **Foco no Colaborador:** O `Designer` e o `Dev` **não veem** este card. O dashboard deles continua limpo.
* **Quem:** O `Copywriter`.
* **Ação:** Ele abre a tarefa. Ele não precisa perguntar "cadê o briefing?". O link está ali, no histórico.
* **Ele clica em "Iniciar Tarefa"**. (Nesse momento, o `Manager` vê no Dashboard "Ao Vivo" que o `Copywriter` está trabalhando ativamente nisso).
* **Finalização:** O `Copywriter` escreve o texto em um novo Google Doc, anexa o link ("Textos Finais (Google Doc)") e clica no botão: **"Avançar Etapa"**.

#### 3. Etapa 2: Design (O Handoff Automático)

* **O que acontece:** O sistema é a "Máquina de Estados".
    1.  Ele vê que "Briefing & Copy" (Etapa 1) está concluída.
    2.  Ele verifica a dependência da Etapa 2 ("Design"). A dependência (Etapa 1) está OK.
    3.  Ele *automaticamente* muda a `etapa_atual` para "Design".
* **Foco no Colaborador:** A tarefa *desaparece* do dashboard do `Copywriter` e *aparece magicamente* no dashboard da equipe de `Designers`.
* **Quem:** O `Designer`.
* **Ação:** Ele abre a tarefa. Ele vê o histórico completo: o "Briefing" original e os "Textos Finais". Ele tem 100% do contexto.
* **Ele clica em "Iniciar Tarefa"** e começa a desenhar no Figma.

#### 4. O Loop de Revisão (A Realidade do Dia a Dia)

* **O que acontece:** O `Designer` finaliza a "v1" e anexa o link do Figma. Ele clica em "Avançar Etapa" (que, no nosso fluxo, vai para o "Dev").
* **O "Bloqueio" (QC/Gestor):** O `Supervisor` (ou `QC`) vê a tarefa na nova etapa e... **não gosta**.
* **Ação (Rejeição):** O `Supervisor` clica no botão **"Reverter Etapa"**.
* **O que o sistema faz:**
    1.  Obriga o `Supervisor` a escrever um comentário (ex: "O botão 'Comprar' está muito pequeno. Ajustar a cor.").
    2.  Muda a `etapa_atual` de volta para "Design".
* **Foco no Colaborador:** A tarefa *volta* para a fila do `Designer`, agora sinalizada como "Em Revisão". O `Designer` lê o comentário, faz o ajuste, anexa o "v2" do Figma e clica em "Avançar Etapa" novamente.
* **Ponto Chave (Para a Gestão):** "Todo esse 'vai e vem', que hoje se perde, fica 100% registrado no histórico da tarefa. E o nosso **Relatório de Gargalos** (Parte 4) acabou de registrar que a etapa de 'Design' teve retrabalho."

#### 5. Etapa 3: Desenvolvimento (Dev)

* **O que acontece:** O `Supervisor` finalmente aprova o Design. A tarefa agora avança de verdade para a etapa "Dev".
* **Foco no Colaborador:** O `Desenvolvedor` vê a tarefa em seu dashboard.
* **Ação:** Ele abre a tarefa. Ele vê o Histórico: Briefing (link), Textos Finais (link) e, o mais importante, o **"v2" do Figma Aprovado (link)**.
* **Ponto Chave:** "O Dev não corre o risco de programar em cima de uma versão antiga. Ele tem a fonte única da verdade."
* **Finalização:** O Dev clica em "Iniciar Tarefa", constrói a página, e anexa o `Artefato (Link)` final: "Link de Staging (Vercel)". Ele clica em **"Avançar Etapa"**.

#### 6. Etapa 4 & 5: QC e SEO (Trabalho Paralelo)

* **O que acontece:** O "Dev" (Etapa 3) era a dependência para *duas* etapas: "QC" e "SEO".
* **A "Mágica" do Sistema:** O sistema avança a tarefa e ela aparece *simultaneamente* na fila da equipe de `Quality Control` **E** na fila da equipe de `SEO`.
* **Ponto Chave:** "Não precisamos esperar o QC testar os links para o SEO otimizar as meta tags. As duas equipes trabalham em paralelo, economizando dias de projeto."
* **Finalização:** A equipe de `QC` testa tudo e clica em "Concluir Etapa". A equipe de `SEO` otimiza tudo e clica em "Concluir Etapa".

#### 7. Conclusão

* **O que acontece:** O sistema vê que todas as etapas do fluxo de trabalho ("Landing Page") foram concluídas.
* **Ação:** Ele move a Demanda principal para o status final: **"Concluído"**.
* **Ponto Chave (Para a Gestão):**
    1.  A tarefa é "fechada" e sai dos dashboards.
    2.  O **Relatório de Produtividade (Timesheet)** foi 100% preenchido por todos os cliques de "Iniciar/Parar Tarefa". Agora podemos ver o custo *real* dessa LP: (Copy: 2h, Design: 6h, Dev: 8h, QC: 1.5h, SEO: 2h).
    3.  O **Relatório de Gargalos** mostra exatamente quantos dias ela ficou parada em cada etapa (especialmente na revisão de design).

**Resumo da Apresentação:** "Em 5 minutos, a tarefa navegou por 5 equipes diferentes, teve uma revisão (rejeição) e duas equipes trabalharam em paralelo, sem que *ninguém* precisasse enviar um e-mail, uma mensagem no WhatsApp ou 'cutucar' o colega perguntando 'E aí, já terminou?'"