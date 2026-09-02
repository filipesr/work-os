# Pendências abertas

Coisas encontradas em uso, com decisão já tomada e execução adiada. Cada item traz o que está
errado (ou o que falta), a evidência, e por que importa — para quem pegar não precisar redescobrir.

Item resolvido sai daqui e vira commit; item que virar feature grande vira spec própria.

---

## 1. Linha do tempo do projeto — o teto de tamanho da grade

**O que é:** a revisão final da linha do tempo (`/projects/{id}`) levantou quinze pontos. Nove foram
corrigidos na entrega, três na varredura de 02/set/2026 (tooltip, `diasAtras`, chaves mortas) e este
segue aberto, de propósito.

**`stageTransition.findMany` cresce com a história do projeto**, não com a janela desenhada: é
consulta em lote (não é N+1), mas num projeto muito antigo traz uma linha por transição só para
extrair os dias em que houve liberação de etapa. Não dá para estreitar sozinho: `distinct` por
(demanda, etapa) apagaria a reativação de uma etapa que voltou atrás — retrabalho é movimento real,
e a grade ficaria mentindo por omissão. E a janela só se conhece DEPOIS de ler o que teve movimento.

**Direção:** vira problema junto com o **teto de tamanho da grade**, que a spec adiou de propósito —
e é lá que os dois se resolvem de uma vez: com um teto, a consulta ganha um limite de data para
respeitar. Enquanto isso, o `select` já leva só o que o consumidor usa (`taskId`, `at`).

---

## 2. Dois testes da janela fixa não discriminam

**O que é:** a revisão final da janela fixa aprovou o código e apontou dois testes que passariam
igual se ele estivesse errado — o que os torna decoração, não rede.

- Em `week-planning-write.test.ts`, "checagem ancorada no dia de DESTINO" usa o MESMO dia como
  origem e destino, então não distingue as duas coisas que o nome promete distinguir.
- No teste do compromisso fantasma, o laço `expect(args.where.plannedDate).not.toBeNull()` é vazio:
  naquele caminho nenhuma consulta chega a rodar. A outra asserção do mesmo teste (o `data` gravado
  com a janela limpa) é forte e é ela que segura a regra.

**Por que importa:** o código está correto hoje — os dois foram conferidos por rastreio, não por
teste. Mas um teste que não falha quando deveria dá a impressão de cobertura onde não há, e é
exatamente na borda do fantasma (dia nulo virando dia real) que uma regressão futura passaria batido.

**Direção:** dar ao primeiro dias diferentes para origem e destino, e trocar o laço vazio por uma
asserção sobre o que aquele caminho de fato faz.

---

## 3. `prisma migrate dev` está quebrado para todo mundo

**O que é:** rodar `migrate dev` para replicar o histórico de migrações no shadow database falha
com `P3006`: o tipo `ActiveStageStatus` não é criado por nenhum arquivo de migração — um buraco
pré-existente na história, não desta entrega. `migrate deploy` (aplica os arquivos pendentes direto,
sem shadow DB) funciona normalmente e foi o que a tela da etapa usou para gravar
`TaskComment.activeStageId`/`kind` e `Task.createdById`.

**Por que importa:** quem criar a PRÓXIMA migração vai tropeçar no mesmo `P3006` sem entender por
quê, porque `migrate dev` é o comando padrão e o defeito não está na migração nova — está numa
anterior.

**Direção:** achar a migração que deveria ter criado `ActiveStageStatus` e corrigi-la (ou recriar o
tipo numa migração de reparo), depois confirmar que `migrate dev` volta a replicar limpo.

---

## 4. `PresenceCard` não consegue linkar para a etapa

**O que é:** das seis listagens em formato de etapa que passaram a apontar para
`/tasks/{id}/stages/{activeStageId}`, `PresenceCard` é a única que ficou apontando para a demanda.
`ActivityLog.stageId` é chave estrangeira para `TemplateStage`, e o modelo não tem relação nenhuma
com `TaskActiveStage` — chegar à instância exigiria uma busca nova por `(taskId, stageId)`, fora do
que a consulta atual já traz.

**Por que importa:** é a única das seis sem o link, e o motivo é estrutural (schema), não uma
consulta que só faltou um campo — as outras quatro eram exatamente isso (bastou `id: true` a mais
no `select`).

**Direção:** decidir se vale a busca extra por `(taskId, stageId)` para este card, ou se a relação
correta é acrescentar em `ActivityLog` uma referência à instância — o que também serviria de base
para outras leituras que hoje só têm o id do template.

---

## 5. Restos da tela da etapa: um componente morto e duas strings sem `t()`

**O que é:** três achados pequenos, deixados de propósito fora do escopo da entrega que os expôs:

- `components/tasks/TaskActionsMenu.tsx` ficou sem consumidor — seu último uso era em
  `/tasks/{id}`, que virou tela de leitura.
- `app/[locale]/(protected)/tasks/[taskId]/not-found.tsx` tem português cravado, sem
  `getTranslations`, ao contrário dos quatro irmãos conformes do mesmo padrão (o `not-found.tsx` da
  rota nova da etapa foi escrito certo desde o início).
- `LogTimeButton` tem a string "Registrar Tempo" sem passar por `t()`. Pré-existente; o componente
  não foi tocado além de passar a receber a etapa certa.

**Por que importa:** nenhum dos três quebra nada hoje, mas são o tipo de resto que se acumula —
código morto pesando na leitura, e duas strings que a paridade de locales não pega porque não
existe outro locale para comparar contra.

**Direção:** remover `TaskActionsMenu.tsx`; migrar os dois `not-found.tsx` para `getTranslations`
numa passada só; extrair "Registrar Tempo" para o locale.

---

## Limitações conhecidas, registradas em outro lugar

Não são pendências desta lista, mas quem lê aqui costuma precisar delas:

- **Demanda não se edita** — decisão explícita. Título, prazo e prioridade só são escritos na
  criação. Por isso toda porta de criação precisa da mesma trava de prazo (formulário, criação em
  lote do calendário, duplicar).
- **Upload de artefato é LAN-only** — fora da rede, só o registro de link. Ver a spec da tarefa
  rápida, seção "Problema em aberto — foto do artefato fora da rede".
- **Marcar demanda como obsoleta não apaga as horas apontadas nela.**
- **Comentário e demanda de antes da tela da etapa não têm etapa nem criador.** `TaskComment.activeStageId`/`kind`
  e `Task.createdById` nasceram sem backfill, de propósito: inventar o vínculo pelo autor era
  exatamente o defeito que a tela da etapa fechou, e gravar esse chute teria promovido palpite a
  dado. Quem consultar o banco direto — relatório, migração de dados, investigação — precisa saber
  que `activeStageId`/`kind` nulo ou `createdById` nulo em registro antigo não é erro de gravação.
