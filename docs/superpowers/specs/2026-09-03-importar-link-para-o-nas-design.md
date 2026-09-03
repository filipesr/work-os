# Importar para o NAS um artefato registrado por link

**Data:** 2026-09-03 · **Estado:** desenho conversado, aguardando revisão da spec
**Atenua:** a limitação "upload de artefato é LAN-only" de [`docs/pendencias.md`](../../pendencias.md)
**Exige:** publicar uma versão nova do agente no NAS — o app sozinho não entrega isto

## O problema

Quem está fora da rede não consegue subir arquivo para o NAS. A saída que existe hoje é registrar um
**link**: o colaborador externo salva a imagem no Drive dele, gera um link de compartilhamento e o
anexa à demanda. O arquivo continua morando na conta de outra pessoa — some quando ela apagar, muda
quando ela editar, e não entra na árvore do cliente que o NAS organiza.

Na migração do Trello isso deixa de ser inconveniente e vira volume: o acervo inteiro chega como
link para lugares que não são nossos.

## A decisão: o app enfileira, o agente puxa

A Vercel **não alcança** o agente. O host dele resolve para um IP privado, e é exatamente por isso
que upload é LAN-only: quem fala com o agente hoje é o NAVEGADOR, por `PUT` direto
(`lib/nas/upload-client.ts`), e só de dentro da rede.

O tráfego que já funciona é o inverso: o **agente sai** para a Vercel, com HMAC e timestamp, quando
fecha um upload (`app/api/artifacts/finalize`). A importação anda nesse mesmo sentido — o app marca
o que falta baixar, e o agente pergunta e processa.

Isso não é preferência de arquitetura, é a única forma que serve ao caso que motivou o pedido: se o
navegador tivesse que disparar o download, quem registrou o link precisaria estar na LAN, e o
colaborador externo não está. As duas alternativas foram consideradas e recusadas: o navegador
buscar a URL e reenviar pelo `PUT` esbarra em CORS justamente no Drive e no Trello; e o app mandar o
agente baixar exigiria um caminho de entrada para dentro da rede que hoje não existe e que a spec do
NAS evitou de propósito.

## A fila já está no modelo

Nenhuma coluna nova. Um artefato esperando importação é:

```
storageKind: NAS_UPLOAD   uploadStatus: PENDING   url: <a origem>
```

Essa combinação não existe hoje, porque upload pelo navegador nasce **sem** `url`. A fila estava no
modelo e ninguém a tinha lido assim.

O que muda é o significado documentado de `TaskArtifact.url`. O comentário atual diz "só para
storageKind = LINK"; passa a dizer **"o link (LINK), ou a origem de onde os bytes vieram
(NAS_UPLOAD importado)"**. É procedência, e ela continua útil depois de READY: dá para responder "de
onde veio este arquivo?" seis meses depois.

## O que a esteira existente já garante

O `PUT /v1/uploads/:artifactId` do agente recebe bytes em fluxo, conta o tamanho **enquanto** grava,
e passa por um sniffing de bytes mágicos que recusa executável e recusa arquivo cuja assinatura não
bate com a extensão declarada. As extensões e o teto de tamanho vêm de uma lista por tipo de mídia
(`ALLOWLIST` em `nas-path.ts`: FOTOS 150 MB, LOGOS 200 MB, VIDEOS 5 GB…).

**A importação não escreve trava nenhuma: ela herda todas.** É uma entrada nova na esteira que já
existe — em vez de os bytes virem do navegador, vêm de uma URL. Um link do Drive que devolva a
página HTML em vez do arquivo morre ali, em `MAGIC_MISMATCH`, com motivo. A falha é barulhenta, e
essa foi a razão de aceitarmos **só link direto**: sem código específico de fornecedor, nada quebra
quando o Google mudar de endpoint, e o caso que não funciona avisa em vez de gravar lixo.

## O risco que a importação cria, e que não existia

O agente vive **dentro** da rede. Fazê-lo buscar uma URL que um usuário digitou é abrir uma porta
para varrer a LAN a partir de fora — pedir `http://192.168.200.1/` e ler a resposta pelo que o
sistema gravar ou reportar. É o único código genuinamente novo de segurança desta entrega:

- só `http` e `https`;
- resolver o DNS e **recusar IP privado, loopback e link-local** — reconferindo **a cada
  redirecionamento**, porque o primeiro salto pode ser público e o segundo apontar para dentro;
- limite de saltos de redirecionamento;
- timeout de conexão e de leitura;
- o corte por tamanho aplicado **durante** o fluxo, não depois de baixar.

O último item merece nome próprio: baixar 5 GB para então descobrir que o limite era 150 MB é como
se derruba o NAS pelo caminho de quem estava tentando protegê-lo.

## A aba de link ganha a forma da aba de upload

O formulário de link hoje coleta título, URL e `type` — o campo **legado**, que o schema já marca
como _"removido na fase 2 da migração (usar mediaType)"_. O NAS não usa `type`: ele decide pasta,
extensões e teto de tamanho por `mediaType`, e exige sensibilidade.

Em vez de "Importar" revelar campos que "Adicionar" não pede, **as duas abas passam a ter a mesma
forma**: nome na primeira linha, tipo de mídia e sensibilidade na segunda, ações na terceira, com os
mesmos rótulos da aba de upload. Uma tela só para aprender, e o import não cobra um segundo
formulário de quem já preencheu o primeiro.

Duas consequências, ambas deliberadas:

**A sensibilidade é inerte para link puro, e o rótulo precisa dizer isso.** Ela governa canais de
download do arquivo NO NAS (`lib/nas/sensitivity.ts`: LAN, túnel, share). Um link não tem arquivo
nosso — "baixar" é abrir a URL de outra pessoa. Perguntar mesmo assim se justifica porque o campo
vale no instante em que o arquivo entra no NAS, e perguntar duas vezes seria pior; o que não se pode
é apresentá-la como se já governasse alguma coisa. O texto de apoio diz que ela vale quando o
arquivo estiver no NAS.

**`ArtifactRow` precisa mudar junto.** Ele mostra `mediaType` para NAS e `type` para LINK
(`ArtifactRow.tsx:95`). Se o formulário parar de gravar `type`, todo link novo apareceria com "—" na
coluna de tipo. A regra passa a ser **`mediaType` quando houver, senão `type`**: link novo mostra o
campo novo, link antigo continua mostrando o dele, e ninguém precisa de backfill.

`addLinkArtifact` passa a receber `mediaType` e `sensitivity` no lugar de `type`. Artefatos de link
já existentes não são tocados.

## A falha guarda o motivo, e a reedição

Hoje o `finalize` reporta sucesso. Ele passa a poder reportar **falha com motivo**, e o motivo é
gravado no artefato para aparecer na tela em texto útil: "maior que o limite de FOTOS (150 MB)", "o
link devolveu uma página, não um arquivo", "a origem não respondeu".

Sem isso a reedição vira tentativa e erro — a pessoa troca o link quando o problema era o tipo
declarado, tenta de novo, falha igual, e conclui que a funcionalidade não presta.

**Editar só é oferecido em FAILED.** Um artefato READY tem bytes gravados; trocar a origem depois
faria a procedência mentir sobre um arquivo que existe. Um import que falhou nunca virou arquivo —
não há histórico a reescrever.

**A reedição reabre todos os campos**, não só a URL. A falha nem sempre é do link: quem declarou
FOTOS para um vídeo de 300 MB é recusado pelo TAMANHO DO TIPO declarado, e corrigir só o link não
resolveria. Submeter devolve o artefato para `PENDING`, e o agente o pega na passada seguinte — o
que também cobre a falha passageira de rede, em que se reenvia sem mudar nada.

## As peças novas

| Onde   | O quê                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App    | A aba de link com a forma da de upload (`AddArtifactForm`) e o botão de importar; a ação que cria o artefato `NAS_UPLOAD`/`PENDING` com a origem; um endpoint que o agente consulta para receber o que está pendente; `finalize` aceitando falha com motivo; a ação de reeditar em FAILED |
| Agente | Um laço que pergunta ao app o que há pendente; o download com as travas de rede acima; a entrega dos bytes à esteira que já existe; o relato de falha com motivo                                                                                                                          |
| Tela   | O estado do artefato na lista (PENDING → UPLOADING → READY/FAILED) — o painel já mostra isso para upload — e, em FAILED, o motivo e o botão de reeditar                                                                                                                                   |

O endpoint que o agente consulta usa **o mesmo HMAC com timestamp** do `finalize`. Nenhuma
autenticação nova: o canal agente→app já existe, está assinado e está em produção.

Como só existe um agente, reservar trabalho é simples: ele marca o que pegou como `UPLOADING` com
carimbo de tempo, e um item preso em `UPLOADING` por tempo demais volta para a fila — a mesma
recuperação que o reconcile já faz para upload travado.

## Testes

O agente tem suíte própria (`nas-poc/agent/test/`, com `sniff`, `nas-path`, `finalize` e
`reconcile`), então o código novo dele é testado lá, no mesmo estilo — não é território sem rede.

- **Puros, e é onde o erro é silencioso:** a recusa de destino privado, incluindo o caso do
  redirecionamento que sai público e volta para dentro; o corte de tamanho durante o fluxo; a lista
  de esquemas aceitos.
- **Da fila:** artefato pendente aparece para o agente uma vez só; item preso em `UPLOADING` volta;
  artefato de outra demanda não vaza na resposta.
- **Do `finalize`:** falha grava o motivo e deixa o artefato em FAILED; sucesso continua como hoje.
- **Da reedição:** só existe em FAILED; devolve para PENDING; recusada em READY pelo SERVIDOR, não
  só escondida na tela.
- **Do formulário:** as duas ações exigem `mediaType` e sensibilidade, e `addLinkArtifact` grava os
  dois; um link antigo (sem `mediaType`) continua mostrando o `type` dele na lista, e um novo mostra
  o `mediaType` — é a regra que impede a coluna de virar "—" para todo link criado daqui em diante.

## Fora desta entrega

- **Botão retroativo em link já existente.** A decisão fica mais fácil depois de ver o fluxo rodando
  — e abrir para todo link antigo de uma vez é o tipo de porta que se abre sem saber o volume atrás.
- **Traduzir link do Drive** para a forma de download direto. Código específico de fornecedor, que o
  fornecedor muda sem avisar; entra se a migração mostrar que a maioria dos links falha por isso.
- **Tela de mutirão** para importar muitos de uma vez.
- **Nada.** Sobre PROJECT e CLIENT, conferido em vez de suposto: `AddArtifactForm` já recebe `scope`
  e `ownerIds` e serve os três escopos, então o botão nasce nos três pelo mesmo caminho. Não é
  esforço extra — mas os testes miram TASK, que é o caso da migração, e os outros dois seguem o
  mesmo código sem cobertura própria.
