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
