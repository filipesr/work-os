# Importar o quadro do Trello (AtlanticoShop) para o WorkOS

**Data:** 2026-09-10 · **Estado:** desenho conversado, aguardando revisão da spec
**Fonte:** `INm0k5De - atlantico-shop.json` (2,7 MB, export do quadro "Atlantico Shop")
**Não confundir com:** a importação de link para o NAS (2026-09-03). Esta entrega **não a usa** — ver "Por que os anexos ficam como link".

## O problema

O trabalho do cliente AtlanticoShop viveu 19 meses num quadro do Trello. Migrar só o que está em
aberto joga fora o histórico — e com ele o calendário povoado e qualquer linha de base de medição.
O export em JSON tem o acervo; a questão é o que dele é verdade, o que é suposição, e o que não
existe.

## O que o export contém, medido

|             |                                                                  |
| ----------- | ---------------------------------------------------------------- |
| Cards       | 303 (146 abertos, 157 arquivados)                                |
| Listas      | 31                                                               |
| Anexos      | 455 · **3,47 GB** · maior: `.MOV` de 201 MB                      |
| Membros     | 17                                                               |
| Ações       | **1000 — o teto do export**, cobrindo só 2026-08-12 → 2026-09-09 |
| Comentários | 33 (dentro do teto acima)                                        |

### A natureza dos cards não é uniforme

Classificando por título, rótulo e anexos:

| Natureza                                                                      |   Cards | Destino                     |
| ----------------------------------------------------------------------------- | ------: | --------------------------- |
| **Demanda**                                                                   | **204** | importar                    |
| Separador visual (`PRIORIDAD 👆`, `EN PROCESO ⬆️`, `☝ ALTERACIÓN ☝`, `-----`) |      38 | descartar                   |
| Ausência / evento (`FERIADO 14/05`, `FÉRIAS 09 A 16/06`, `REUNIÓN`)           |      25 | descartar                   |
| Instrução / referência (`TAMAÑO - Banners Web`, `ACCESSOS`, `MODELO -`)       |      10 | **ignorar**, listar em nota |
| Sem etapa mapeável                                                            |      26 | descartar                   |

Os 38 separadores e os 25 registros de ausência são mobília de quadro, não trabalho. Importá-los
encheria o histórico de demandas que nunca existiram. As 26 demandas sem etapa mapeável — sem
movimentação, sem anexo com data e fora das listas reconhecidas — não têm evidência de por onde
passaram no processo e seriam etapa inventada.

Os 10 cards de instrução **não têm anexo nenhum** — o conteúdo está no título e na descrição, não em
arquivo. Não há artefato a extrair. Ficam de fora, com a lista nominal na nota final desta spec,
para revisão individual.

### O que as 204 demandas carregam

| Evidência                           | Demandas |
| ----------------------------------- | -------: |
| Descrição                           |      176 |
| Prazo (`due`)                       |      122 |
| Responsável declarado (`idMembers`) |      116 |
| Anexo com autor e data              |      109 |
| **Só o título**                     |   **11** |

As 11 entram assim mesmo. São demanda pelo critério acordado, e deixá-las fora criaria uma segunda
lista de exceções para alguém revisar depois — custo maior que o de importá-las pobres.

## O fluxo real, extraído das movimentações

As 166 ações de movimentação entre listas (49 cards, um mês) revelam o processo praticado:

```
DISEÑO - <pessoa>  →  REVISIÓN  →  LIBERADO  →  Concluido
        ↑                  │
        └── 21 devoluções ──┘
```

Três leituras que decidem o mapeamento:

**`DISEÑO - MARTIN`, `- HENRIQUE`, `- MATHIAS` não são três etapas.** São uma etapa com três
responsáveis — exatamente `stage` + `assignee` no modelo do WorkOS.

**`AUDIOVISUAL` é produção alternativa, não fase posterior.** Ele também desemboca em `REVISIÓN`.

**A revisão é um portão que reprova 37%** (21 de 57 saídas voltam para produção). Isso é retrabalho
**interno**, pego antes do cliente — a distinção que o P5 da biblioteca exige e que raramente se
consegue medir com dado real.

Tempo mediano parado, dos 49 cards com histórico: `REVISIÓN` 5,1 h · `LIBERADO` 23,6 h (máx. 288 h) ·
`DISEÑO - MARTIN` 0,6 h · `AUDIOVISUAL` 54,4 h. A fila do `LIBERADO` — quase um dia depois de
aprovado — é o achado mais interessante, e só aparece medindo etapa a etapa.

## O que NÃO é recuperável, e não vamos fingir que é

**A jornada da maioria.** Só 49 dos 303 cards têm movimentação registrada. Para os outros 254 não há
evidência de por onde passaram — 26 deles estão entre as 204 demandas importadas e ficam sem etapa.
O export corta em 1000 ações **no total** do quadro.

**"Arquivado" não é "concluído".** 83 dos 157 arquivados pararam em `AUDIOVISUAL`, 17 em
`DISEÑO - MARTIN`. As pessoas arquivaram o card de onde ele estava. `dateCompleted` está preenchido
em **4 de 157**. Importar "arquivado = concluído na etapa em que parou" produziria a métrica falsa de
que 83 demandas foram concluídas em audiovisual.

**O histórico de conversa.** 33 comentários, todos do último mês.

Isto vale a regra mestra: a etapa de uma demanda importada é **observada ou não-incluída**, nunca
inferida. Ninguém que olhar um gráfico daqui a seis meses vai lembrar que aquela etapa foi um chute
da importação (P1 — nada num dado é inerentemente informacional; só o uso decide).

## O destino no WorkOS

**Cliente:** `AtlanticoShop`, que já existe (pasta `AtlanticoShop`, 1 projeto).

**Projetos:** um por mês, **17 no total** (2025-05 → 2026-09), nomeados `AtlanticoShop YYYY-MM`. O mês
sai do `due` quando existe, senão de `dateLastActivity`. O mês de 2025-04 tinha uma única demanda sem
etapa mapeável, que caiu nos descartados. A distribuição é desigual (julho e agosto de
2026 concentram 89 das 204), mas isso é o histórico, não distorção da importação.

**Template:** `Demanda GoOn`, com as etapas:

```
1. Briefing        [opcional]
2. Desenho         [opcional]  ─┐
2. Audio Visual    [opcional]  ─┤→ 3. Quality Control → 4. Aprovação
                                │      (requer as duas)
5. Gráfica / Trafego Pago / Imprensa  [opcionais, requerem Aprovação]
6. Relatório       [opcional]
```

O `Quality Control` requer **`Desenho` + `Audio Visual`**: como etapa opcional excluída passa direto
(semântica confirmada em `preview-next-stages`), uma demanda só de vídeo faz o `Desenho` passar
direto e o QC esperar o `Audio Visual`; uma só de arte faz o inverso; usando as duas, o QC espera as
duas — o join pretendido.

### O mapeamento, campo a campo

| Trello                                     | WorkOS                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `name`                                     | `Task.title`                                                                 |
| `desc`                                     | `Task.description` (o campo existe, `@db.Text`)                              |
| `due`                                      | `Task.dueDate`                                                               |
| `idMembers`                                | `assignee` da etapa sem dono por evidência (ver "As pessoas")                |
| lista `DISEÑO - <pessoa>`                  | etapa `Desenho`, responsável = a pessoa da lista                             |
| lista `AUDIOVISUAL`                        | etapa `Audio Visual`                                                         |
| lista `REVISIÓN`                           | etapa `Quality Control`                                                      |
| lista `LIBERADO`                           | etapa `Aprovação`                                                            |
| rótulos `URGENTE`/`PRIORIDAD`/`IMPORTANTE` | `Task.priority` — ver a tabela de prioridade abaixo                          |
| rótulos `STORIES`/`SOCIAL MEDIA`/`REELS`   | prefixo do título: `[STORIES] <nome do card>`                                |
| `shortUrl` do card                         | **artefato de link**: "card original no Trello"                              |
| cada anexo                                 | **artefato de link** com a URL do Trello, `mediaType` derivado do `mimeType` |
| checklists (7)                             | anexadas à descrição                                                         |

### O estado e a prioridade da demanda

`Task.status` não sai de "arquivado" (que não significa concluído). Sai da lista onde o card parou:

| Lista onde parou               | `Task.status`                                                |
| ------------------------------ | ------------------------------------------------------------ |
| `Concluido`                    | `COMPLETED`                                                  |
| qualquer outra, card arquivado | `OBSOLETE` — descartada, fora de pendentes e dos percentuais |
| qualquer outra, card aberto    | `IN_PROGRESS`                                                |

O `OBSOLETE` é a escolha honesta para os 157 arquivados que não estão em `Concluido`: eles não foram
concluídos nem seguem pendentes, e o próprio schema descreve esse estado como "arquival, fora de
pendentes/%". Marcá-los `COMPLETED` inventaria 83 conclusões em audiovisual; deixá-los
`IN_PROGRESS` encheria a fila de trabalho que ninguém vai fazer.

`Task.completedAt` só existe quando o status for `COMPLETED` — é o que alimenta lead time, e
datá-lo com o arquivamento de um card abandonado corromperia a medida. A data vem, nesta ordem, da
**movimentação registrada para `Concluido`** (o evento, datado: 41 dos 52 cards da lista) ou de
`dateCompleted` (38); juntas cobrem 48 das 51 demandas concluídas, e as 3 restantes ficam sem data
em vez de ganharem uma inventada. `dateClosed` **não** serve aqui: ele só é preenchido em card
arquivado, e card arquivado fora de `Concluido` é `OBSOLETE` — nos 52 da lista `Concluido` ele está
nulo em 52.

A prioridade sai dos rótulos, e só deles: `URGENTE` → `URGENT`; `PRIORIDAD` ou `IMPORTANTE` → `HIGH`;
sem rótulo → o padrão `MEDIUM`. São 26 cards com algum desses rótulos; os outros 203 ficam no padrão.

### As pessoas

17 membros no Trello, 34 usuários no WorkOS. O casamento tem três chaves, nesta ordem: **prefixo de
e-mail** (o padrão `<apelido>goonmkt@gmail.com` casa com `martingoonmkt`, `gabygoonmkt`,
`merygoonmkt`), **nome completo** (`Adonias Henrique Dias Nery` é idêntico dos dois lados) e **nome +
sobrenome parciais** (`Mathias Gonzalez` ↔ `Benicio Mathias Gonzalez Delgado`).

O que não casar entra numa lista de repescagem manual — inclusive **dois autores de anexo que já
saíram do quadro** e não estão em `members`.

**O responsável declarado no card.** `idMembers` dá dono à etapa que a evidência de execução — o
nome na lista (`DISEÑO - MARTIN`), o autor do anexo — deixou sem responsável. Nunca sobrescreve
essa evidência: quem fez o trabalho é quem aparece nela. Mas 80 dos 127 cards com membro declaram
de duas a quatro pessoas, e os nomes mais frequentes são de quem supervisiona (Pedro Villalba em
72 cards, Samuel Goon em 66), não de quem executa. A escada de desempate: um membro casado só, é
ele; vários, é o que também anexou arquivo no card; vários sem desempate, é o **primeiro** da
lista do card — e isso é uma escolha do dono do projeto, não uma medição, porque a ordem em que o
Trello guarda os membros não significa nada. 37 demandas caem nesse último caso. Resultado: 180
das 276 etapas nascem com dono (eram 87) e as demandas sem ninguém caem de 117 para 46.

## Por que os anexos ficam como link

454 dos 455 anexos são `isUpload: true`, hospedados em `trello.com/1/cards/.../download/...`.
Medimos, do caminho de rede do próprio NAS:

```
curl -A "" 'URL'  →  401        curl 'URL'  →  401
```

Igual com e sem `User-Agent`: é autenticação, não bloqueio de CDN. **A importação para o NAS
publicada em 2026-09-03 não serve para eles** — ela recusaria os 455 com `SOURCE_REFUSED`, e estaria
certa. Baixá-los exigiria credencial do Trello, que é máquina permanente para um evento único.

Então cada anexo entra como **artefato de link**, com nome, tipo de mídia derivado do `mimeType` e a
URL original. Quem tiver sessão no Trello abre; quem não tiver, vê o registro de que o arquivo
existiu. É menos do que gostaríamos e é honesto — e preserva a referência, que era o pedido.

Cada demanda ganha também um artefato apontando para o **card original**, o que mantém a rastreabilidade
para o Trello enquanto ele existir.

## As etapas de cada demanda: três níveis de evidência

**Nível 1 — 49 demandas.** Jornada real, com data e duração por etapa, incluindo as devoluções da
revisão. São as únicas em que `Quality Control` pode ser marcada como percorrida com data.

**Nível 2 — 109 demandas com anexo.** Autor e data do anexo dizem **quem produziu e quando**. Isso
sustenta marcar a etapa de produção (`Desenho` ou `Audio Visual`) como percorrida, com responsável e
data — sem dizer nada sobre revisão ou aprovação.

**Nível 3 — o resto.** Lista onde parou, prazo, rótulos, descrição. A etapa de produção entra pela
lista de origem quando ela for `DISEÑO -*` ou `AUDIOVISUAL`; nada mais é afirmado.

Em todos os níveis, **etapa sem evidência é etapa não-incluída** — o mesmo mecanismo que o produto já
usa para etapa opcional excluída na criação. `Briefing`, `Gráfica`, `Trafego Pago` e `Imprensa` ficam
fora de toda demanda importada, porque nenhuma delas foi observada no quadro.

**A demanda ABERTA é a exceção, e não contradiz a regra.** Numa demanda fechada, a etapa é registro
do que aconteceu, e registrar o que não se observou é fabricar histórico. Numa demanda ainda aberta,
a etapa que falta é outra coisa: é o trabalho que vai acontecer. Sem ela, concluir o `Desenho` de uma
demanda importada não teria `Quality Control` nem `Aprovação` para ativar, e a demanda terminaria
pulando o portão que reprova 37% das peças. Então as 52 abertas recebem o resto da sequência do
template — `Quality Control`, `Aprovação` e `Relatório` —, cada uma só quando vier DEPOIS da etapa
mais avançada com evidência: 45 recebem as três, 2 recebem aprovação e relatório, 5 só o relatório.
Elas entram **sem data, sem dono e sem histórico**: existem para que o fluxo continue, não para
afirmar que algo aconteceu. Nenhuma demanda concluída ou obsoleta ganha etapa pendente.

## Como isso é construído

**Script descartável**, em `scripts/import-trello/`, fora dos caminhos de runtime do app. Uma
migração que acontece uma vez não vira funcionalidade: nem tela, nem credencial guardada, nem
endpoint.

### Reusar o fluxo do produto: até onde vai, e por quê

**`createTask` não é chamável de um script.** Ela termina em `redirect()` — que no Next **lança por
design** —, exige sessão (`requireMemberOrHigher`) e chama `revalidatePath`, que só existe dentro de
uma requisição. O que se reusa é o **miolo transacional**: `task.create` + `createTaskStages` +
`markTaskStarted`.

**Extração:** esse miolo sai de `createTask` para uma função que recebe a transação e os dados já
validados, chamada pela action e pelo script. É extração pura; a suíte de criação de demanda que já
existe é a rede que prova que o comportamento não mudou.

**O obstáculo maior é o tempo.** `recordStageTransition`, `markTaskStarted` e `createTaskStages`
gravam `new Date()` — nenhum aceita data. Criar as demandas pelo caminho vivo e depois avançá-las
produziria um histórico **datado de hoje**, o que anula o motivo inteiro da importação.

**Decisão:** as três funções ganham um **parâmetro de data opcional**, com o padrão continuando
`new Date()`. O produto não muda de comportamento; o script passa a data histórica e escreve pelo
mesmo caminho testado. Cada uma ganha um teste a mais — o da data explícita. A alternativa recusada
era o script implementar o fechamento de etapa por conta própria: mais código, sem rede, e a versão
paralela envelheceria em silêncio.

Com isso, os invariantes (etapa inicial `ACTIVE`, demais `INACTIVE`, transição registrada, ao menos
uma etapa incluída) valem por construção, não por reimplementação.

### As linhas que o histórico precisa escrever

| Linha             | O que a importação grava                                                                                                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Task`            | título com prefixo de rótulo, descrição, prazo, prioridade, status, `completedAt` quando `COMPLETED`, `startedAt` quando há data medida (111 das 204), e `createdAt` decodificado do id do card — o id do Trello é um ObjectId, cujos 4 primeiros bytes são o instante da criação: cobre 202 das 204, e é o que faz a fila deixar de ser zero |
| `TaskActiveStage` | uma por etapa incluída, com responsável quando conhecido. Etapa não concluída de demanda `COMPLETED` ou `OBSOLETE` nasce `INACTIVE`, não `ACTIVE`: o trabalho parou, e deixá-la ativa a jogaria na carga atual do time                                                                                                                        |
| `TaskStageLog`    | `enteredAt` / `exitedAt` **históricos** — é daqui que sai o tempo por etapa. Só para segmento com **entrada medida** (187 dos 326): sem entrada, não há permanência a medir                                                                                                                                                                   |
| `StageTransition` | a sequência observada, datada. Segmento sem entrada medida grava só a saída                                                                                                                                                                                                                                                                   |
| `ReworkEvent`     | as devoluções da revisão — ver abaixo                                                                                                                                                                                                                                                                                                         |

**As 21 devoluções viram `ReworkEvent` de tipo `INTERNAL`** (pego dentro do processo, antes do
cliente). A `sourceStage` é a etapa que **injetou** o defeito — `Desenho` ou `Audio Visual` —, não a
revisão que o encontrou. Inverter isso inverteria a métrica: mediria quem acha defeito em vez de onde
ele nasce, que é exatamente o que o P5 proíbe.

**Duas passadas obrigatórias:**

1. **Ensaio (padrão).** Lê o JSON, resolve o mapeamento, e escreve um relatório: quantas demandas por
   mês, quem casou com quem, o que não casou, quais cards foram descartados e por quê. **Não grava
   nada.**
2. **Execução** (`--commit`), só depois de o relatório ser conferido.

**Idempotência sem coluna nova.** O artefato "card original no Trello" carrega a `shortUrl`, que é
única por card. Antes de criar uma demanda, o script procura um artefato com aquela URL; se existir,
pula. A procedência que já íamos gravar vira a chave de repetição — sem campo novo no schema, sem
dívida permanente para uma migração de uma vez.

> Rodar duas vezes por engano é o estrago mais provável e o mais caro de desfazer: 230 demandas e 18
> projetos duplicados, cada um com etapas e artefatos. O ensaio por padrão e a chave de repetição
> atacam o mesmo risco por dois lados.

**Transação por projeto mensal**, não uma para tudo: se um mês falhar, os outros 17 ficam de pé e a
correção é reexecutar aquele mês.

## Testes

O script tem suíte própria; nada aqui depende de rodar contra o banco de produção.

- **Da classificação:** separador, ausência, instrução e demanda são separados como esperado, com os
  títulos reais do export como casos (`PRIORIDAD 👆`, `FERIADO 14/05`, `TAMAÑO - Banners Web`,
  `Identidad Albirroa ATL`).
- **Do mapa de pessoas:** casa por prefixo de e-mail, por nome completo e por nome+sobrenome; quem não
  casa vai para a repescagem em vez de ser atribuído a alguém parecido.
- **Da escolha de etapas:** card de `AUDIOVISUAL` inclui `Audio Visual` e exclui `Desenho`; card de
  `DISEÑO - MARTIN` faz o inverso, com Martin como responsável; card sem evidência não inclui nenhuma
  etapa além da mínima exigida.
- **Da idempotência:** rodar duas vezes sobre o mesmo JSON cria as demandas uma vez só. É o teste que
  protege o estrago mais caro.
- **Do agrupamento mensal:** o mês sai de `due` quando existe e de `dateLastActivity` quando não; um
  card sem os dois vai para a repescagem, não para um mês inventado.
- **Do ensaio:** o modo padrão não escreve nada — verificado contando as escritas no cliente de
  banco, não confiando na ausência de erro.

## Fora desta entrega

- **Baixar os anexos.** Exige credencial do Trello; o caminho, se um dia valer, é um segundo script
  com token, rodado de dentro da rede, alimentando o upload que já existe.
- **Traduzir link de fornecedor.** Para o Trello não resolve (o obstáculo é permissão, não formato).
  Para o Drive resolveria, e passa a valer se o acervo migrar para lá — registrado em
  `docs/pendencias.md`.
- **Importar comentários.** São 33, todos do último mês. O custo de mapeá-los não se paga.
- **Ausências e eventos** (26 cards) não viram registro de ausência no WorkOS. Se um dia valer, o
  dado está no export.

## Notas finais para revisão individual

Os **10 cards de instrução** ficam fora da importação e merecem decisão humana, um a um — seis têm
descrição, quatro não têm nada além do título:

`MODELO - Checklist materiais campanhas` (×2) · `ACCESSOS` · `TAMAÑO - Banners Web` ·
`TAMAÑO OOH - Tienda` · `TAMAÑO DOOH` · `MODELO - SOLICITAÇÃO Tráfego` ·
`TAMAÑO - Contenido de Tráfego` · `Modelo - Pedido Tráfego` · `MODELO - SOLICITAÇÃO Briefing`

E duas coisas que a importação vai expor e que são decisão de processo, não de código:

**O projeto que já existe** no cliente AtlanticoShop convive com os 17 mensais, ou é absorvido?

**Decidido:** os rótulos de tipo entram como **prefixo do título** (`[STORIES] Carrusel de
carnaval`). O WorkOS não tem rótulo livre de demanda, e o título é o único lugar onde a informação
sobrevive à busca e à listagem. Não há mais linha em aberto na tabela de mapeamento.
