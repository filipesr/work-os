# Pendências abertas

Coisas encontradas em uso, com decisão já tomada e execução adiada. Cada item traz o que está
errado (ou o que falta), a evidência, e por que importa — para quem pegar não precisar redescobrir.

Item resolvido sai daqui e vira commit; item que virar feature grande vira spec própria.

---

## 1. Linha do tempo do projeto — arestas deixadas de propósito

**O que é:** a revisão final da linha do tempo (`/projects/{id}`) levantou quinze pontos. Os nove que
mudavam comportamento foram corrigidos na entrega; estes quatro ficaram, cada um com o motivo.

- **Tooltip vazio na linha "sem etapa".** Quando alguém aponta hora fora de qualquer etapa, a célula
  mostra a hora com o rótulo certo, mas o `title` do item vira `" · "`. Cosmético.
- **O helper `diasAtras` dos testes ancora no dia UTC**, não no dia de São Paulo: entre 00h e 03h UTC
  ele desloca um dia. Nenhuma asserção existente inverte com isso — foram conferidas uma a uma —, mas
  um teste novo escrito em cima dele pode piscar.
- **O dicionário `projects` guarda chaves mortas** herdadas do kanban (`filters.*`, `priority.*`,
  `noTasks`, `noStages`, `unassigned`, `team`…). As sete que a entrega criou ou deixou órfãs foram
  apagadas; a limpeza do resto é varredura própria, e o guarda de paridade não pega chave sem
  consumidor.
- **`stageTransition.findMany` cresce com a história do projeto**, não com a janela desenhada: é
  consulta em lote (não é N+1), mas num projeto muito antigo traz uma linha por transição só para
  extrair o dia em que cada etapa foi liberada. Vira problema junto com o teto de tamanho da grade,
  que a spec adiou de propósito.

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
