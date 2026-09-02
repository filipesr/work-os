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

## Limitações conhecidas, registradas em outro lugar

Não são pendências desta lista, mas quem lê aqui costuma precisar delas:

- **Demanda não se edita** — decisão explícita. Título, prazo e prioridade só são escritos na
  criação. Por isso toda porta de criação precisa da mesma trava de prazo (formulário, criação em
  lote do calendário, duplicar).
- **Upload de artefato é LAN-only** — fora da rede, só o registro de link. Ver a spec da tarefa
  rápida, seção "Problema em aberto — foto do artefato fora da rede".
- **Marcar demanda como obsoleta não apaga as horas apontadas nela.**
