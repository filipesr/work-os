# Apontamento obrigatório para concluir etapa, com justificativa nos extremos

**Data:** 2026-09-01 · **Estado:** desenho aprovado em conversa, aguardando revisão da spec
**Depende de / habilita:** [projeção da carga por cliente](2026-09-01-carga-cliente-projecao-design.md)

## O problema

O apontamento de horas existe e é **voluntário**: nasce só quando alguém para o cronômetro. Concluir
uma etapa não pede nada. O resultado é que o `TimeLog` — a fonte da referência de duração, do
relatório de utilização e, agora, do "realizado" da carga por cliente — depende de disciplina.

E a disciplina falha de dois jeitos, que contam histórias opostas:

- **Ninguém ligou o cronômetro.** A etapa fecha com zero hora. O p50 daquela etapa aprende com o
  zero e a referência despenca — a estimativa que o sistema oferece a todo mundo fica errada por
  causa de quem não apontou.
- **Ninguém desligou o cronômetro.** A etapa fecha com trinta horas porque o chefe chegou, mandou
  resolver outra coisa que nem está no sistema, e o relógio continuou correndo. O mesmo p50 sobe.

Nos dois casos o dado mente, e nos dois casos o motivo é **do sistema**, não da pessoa: um processo
que pede um gesto voluntário no fim de cada trabalho vai perder o gesto.

## A decisão

**Concluir etapa passa a exigir o apontamento**, e os dois extremos passam a exigir também um
**motivo**.

Isso não é controle de quem trabalha: é a única forma de o número existir. Sem apontamento, a
metade "realizado" de todas as telas de tempo é um campo em branco com cara de zero.

## O que a tela de concluir pede

1. **Horas nesta etapa** — o campo vem preenchido com o que o cronômetro já registrou, e é
   editável. **Só é obrigatório quando não há apontamento nenhum.** Quem usou o cronômetro já
   apontou: pedir de novo seria cobrar duas vezes o mesmo gesto, e é assim que um campo obrigatório
   vira um número digitado no automático.
2. **Motivo**, só quando o número cai num dos extremos (abaixo). Dentro da faixa, concluir é um
   clique — como sempre foi.

O atrito é proporcional ao que falta: quem trabalhou com o cronômetro ligado e ficou dentro da
referência não vê nada de novo.

### O cronômetro aberto fecha junto

Se a pessoa está com o cronômetro rodando naquela etapa, concluir fecha o período antes de somar —
senão ela digitaria um total que o próprio sistema contradiria um segundo depois.

### Não dá para reduzir hora já apontada

Se o número digitado for **menor** que o já registrado, a conclusão é recusada com a explicação. O
cronômetro gravou períodos reais, com início e fim; apagá-los por um campo de texto seria destruir
medição em silêncio. Corrigir apontamento errado é outro ato, e precisa ser deliberado.

A diferença para mais vira um `TimeLog` complementar, com data de hoje.

### De quem são as horas

Do **responsável pela etapa** — o trabalho foi dele, mesmo quando quem clica em concluir é o gestor.
Sem responsável, de quem concluiu.

## O gatilho do motivo

Pede motivo quando o apontado **passa da referência** ou é **10% dela ou menos**.

Os dois extremos são as duas falhas descritas acima, e por isso a pergunta é uma só com respostas
diferentes. Sem o limite de baixo, o caso que mais envenena a referência — fechar com cinco minutos
porque esqueceu o cronômetro — passaria batido.

**Faixa de ±10% foi rejeitada:** a referência é um p50, então metade das execuções fica naturalmente
acima dele. Uma justificativa que aparece toda vez deixa de ser lida, e ensina a apontar o número
que não pede justificativa.

### Qual referência

A mesma que as telas mostram: o p50 observado quando há amostra, o SLA declarado do modelo quando
não há (`resolveStageReference`). **Decisão a conferir** — a conversa dizia "SLA", e usar o
declarado seria uma régua estável, posta por gente. Escolhi a referência exibida por um motivo
prático: se o número que dispara a pergunta for diferente do número que a pessoa está vendo na
tela, a pergunta parece arbitrária.

**Sem referência nenhuma** — etapa sem amostra e sem SLA cadastrado — **não pede motivo**. Não há
contra o que comparar, e inventar uma régua para justificar seria pior que não perguntar.

## O motivo

Uma lista, mais texto livre opcional:

| Motivo                      | O que ele costuma revelar                         |
| --------------------------- | ------------------------------------------------- |
| Interrupção externa         | prioridade chegando por fora do sistema           |
| Retrabalho                  | qualidade a montante, briefing ou aprovação       |
| Escopo maior que o previsto | a demanda não era o que o template descreve       |
| Esqueci o cronômetro        | o processo pede um gesto que as pessoas não fazem |
| Outro                       | o que a lista ainda não aprendeu                  |

A lista existe para o **padrão** ficar visível. "Metade das etapas estouradas deste time foi
interrupção externa" é um problema de gestão — e só aparece se for categorizável. Texto livre
sozinho vira caixa de comentário que ninguém lê em conjunto.

## As três travas que separam isto de uma ficha da pessoa

Exigir explicação por passar do tempo esperado encosta no que a
[biblioteca](../../biblioteca-de-conhecimento.md) defende com mais força: **variação é do sistema,
não da pessoa** (P2), e a tela **informa, não policia** (P1). O que põe esta feature do lado certo:

1. **A pergunta é sobre o trabalho**, não sobre quem o fez. "O que aconteceu nesta etapa", nunca
   "por que você demorou". A diferença aparece no texto da tela, e é ela que decide se as pessoas
   respondem a verdade ou aprendem a apontar o número que não pergunta nada.
2. **Nunca agregado por pessoa.** O motivo pode ser lido por etapa, por time e por período —
   nenhuma tela soma justificativas por indivíduo, e nenhuma leitura ordena pessoas por isso.
3. **É contexto da etapa**, visível no histórico dela, junto do trabalho a que se refere.

Uma quarta, estrutural: o motivo é **causa declarada**, não penalidade. Nada no sistema muda de
comportamento por causa dele — não bloqueia, não pontua, não entra em nenhum indicador.

## Modelo de dados

Uma tabela nova. O motivo precisa ser categorizável para o padrão aparecer, e uma etapa pode ser
concluída mais de uma vez (reversão e refazimento), então o registro é por evento, não campo na
linha da etapa.

```prisma
enum StageNoteReason {
  EXTERNAL_INTERRUPTION
  REWORK
  SCOPE_LARGER
  TIMER_FORGOTTEN
  OTHER
}

model StageCompletionNote {
  id             String          @id @default(cuid())
  taskId         String
  stageId        String
  userId         String          // quem concluiu
  reason         StageNoteReason
  note           String?         @db.Text
  hoursLogged    Float           // o que foi apontado
  referenceHours Float           // a régua no momento — o p50 muda com o tempo
  createdAt      DateTime        @default(now())
}
```

`referenceHours` é gravado junto de propósito: a referência é um p50 que se move, e sem o valor da
época ninguém consegue reconstruir por que aquela justificativa foi pedida.

## O que muda em cada caminho de conclusão

| Caminho                                   | Muda?                                                 |
| ----------------------------------------- | ----------------------------------------------------- |
| `completeStageAndAdvance` (tela da etapa) | **sim** — passa a exigir horas, e motivo nos extremos |
| Tarefa rápida (`createQuickTask`)         | não — já exige o tempo, e já grava `TimeLog`          |
| Reverter etapa                            | não — reverter não é concluir                         |
| Marcar demanda obsoleta                   | não — a demanda é descartada, não entregue            |

## Testes

- **Puro, com teste primeiro — o gatilho.** Acima da referência pede motivo; 10% ou menos pede
  motivo; entre os dois não pede; sem referência não pede; exatamente na referência não pede.
- **Recusa concluir sem horas**, e recusa horas menores que o já apontado, cada uma com a sua
  mensagem.
- **Grava a diferença** como `TimeLog` com data de hoje e o responsável como dono das horas.
- **Fecha o cronômetro aberto** antes de somar.
- **Grava a justificativa** com a referência da época.
- **Nenhuma leitura agrega motivo por pessoa** — teste de vocabulário, no molde do que já existe
  para o ranking de pessoas.
- **i18n:** pt-BR e es-ES, com o guarda de paridade.

## Fora desta entrega

- **Editar ou apagar apontamento já gravado.** É ato deliberado e auditável, com regra própria.
- **Tela de leitura dos motivos** — por etapa, por time, por período. Os dados passam a existir
  agora; a leitura vem quando houver o que ler.
- **Bloquear a conclusão por causa do motivo.** Ele documenta, não impede.
