# Pendências abertas

Coisas encontradas em uso, com decisão já tomada e execução adiada. Cada item traz o que está
errado (ou o que falta), a evidência, e por que importa — para quem pegar não precisar redescobrir.

Item resolvido sai daqui e vira commit; item que virar feature grande vira spec própria.

---

## 1. `/planning/my-week` — visão lado a lado no computador

**O que é:** a tela da pessoa foi construída como **lista vertical de dias**, decisão registrada no
plano da fatia 2: ela é a que mais será aberta do celular, e uma grade de seis colunas some numa
tela estreita.

**O que se quer:** no computador, o padrão da mesa do gestor — semana à esquerda, disponíveis à
direita. **A prioridade é o PC**, mas sem regredir no celular.

**Direção provável:** grade a partir de uma largura mínima, lista abaixo dela. Não é trocar uma
pela outra: é a mesma leitura em duas formas, escolhida pelo tamanho da tela.

**Não é defeito** — é troca de desenho.

---

## 2. `/planning/coverage` mostra "sem responsável" para toda demanda — **defeito**

**O que acontece:** o diálogo de resumo da demanda mostra "sem responsável" mesmo quando a etapa
atual tem responsável definido.

**Causa:** `lib/actions/weekly-coverage.ts` lê **`Task.assignee`** — o responsável no nível da
DEMANDA. Neste sistema a atribuição é **por etapa** (`TaskActiveStage.assigneeId`); o campo da
demanda não é escrito por caminho nenhum do fluxo. Conferido no banco: zero demandas com esse
campo preenchido.

**Efeito:** o campo mostra "sem responsável" **sempre**, para qualquer demanda. É informação que
nunca esteve certa, não um caso de borda.

**Direção:** ler o responsável da etapa em curso (a `TaskActiveStage` ACTIVE da demanda). Decidir
o que mostrar quando há mais de uma etapa ativa — provavelmente todas, porque a demanda é de
todas elas.

**Pergunta aberta:** `Task.assigneeId` continua no schema sem ser escrito por ninguém. Vale
remover, ou existe intenção de usá-lo?

---

## 3. `/planning/week` atribui sem validar equipe — **defeito**

**O que acontece:** o diálogo de programar lista todas as pessoas ativas, sem dizer de que equipe
a etapa é. Dá para programar trabalho de vídeo para alguém de tráfego, e nada reclama.

**Causa:** `scheduleStage` (`lib/actions/week-planning.ts`) valida três coisas — etapa existe, não
está concluída, não tem outro dono — e **não valida time**. O resto do sistema valida: o
roteamento por time efetivo (`teamId ?? stage.defaultTeamId`, ver `lib/stage-team.ts`) e
`isValidStageAssignee` no caminho de conclusão. A mesa é a única porta que não valida.

**Histórico:** apareceu como achado _Important_ na revisão final da fatia 1. Metade foi corrigida
na época (contas de cliente e usuários desativados saíram da lista); a validação de time ficou
registrada e adiada. Este é o registro.

**Direção:** validar no servidor contra o time efetivo da etapa, e mostrar o time no diálogo — a
tela explica, o servidor garante. Decidir se o gestor pode furar a regra deliberadamente (com
aviso) ou se a recusa é dura.

---

## 4. `/planning/client-load` — falta a demanda que ninguém pegou nem marcou

**Já resolvido:** a tela conta as etapas concluídas, o realizado vem do apontamento por dia, e o
pendente é projetado pela cadeia de etapas até a véspera do vencimento. A célula fecha a demanda
inteira, com quem faria cada etapa.

**O que continua faltando:** demanda que não tem dono **nem** dia não aparece em lugar nenhum desta
tela. Saber que um cliente tem cinco demandas paradas, sem ninguém e sem data, é justamente o que a
tela deveria gritar — e hoje ela cala.

**Perguntas a resolver no desenho:**

- Coluna própria ("sem dia") ao lado dos seis dias, ou faixa separada abaixo da grade?
- Vale distinguir "sem prazo" de "sem equipe"? São dois problemas diferentes, e o segundo tem dono
  óbvio (o gestor roteia); o primeiro agora é uma escolha declarada na criação.

---

## Limitações conhecidas, registradas em outro lugar

Não são pendências desta lista, mas quem lê aqui costuma precisar delas:

- **Demanda não se edita** — decisão explícita. Título, prazo e prioridade só são escritos na
  criação. Por isso toda porta de criação precisa da mesma trava de prazo (formulário, criação em
  lote do calendário, duplicar).
- **Upload de artefato é LAN-only** — fora da rede, só o registro de link. Ver a spec da tarefa
  rápida, seção "Problema em aberto — foto do artefato fora da rede".
- **Marcar demanda como obsoleta não apaga as horas apontadas nela.**
- **Janela fixa de agendamento** (`scheduledStart`/`scheduledEnd`) não tem tela: só existe no
  banco. Sem ela, o bloco de conflitos da programação semanal nunca acende em uso real.
