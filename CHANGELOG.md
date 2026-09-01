# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não lançado]

### 🚀 Adicionado

#### Fluxo de trabalho

- **Etapa coringa (roteamento na criação):** uma etapa de template **sem time padrão** deixa de
  nascer órfã. `TaskActiveStage` ganhou `teamId` e `instructions` (ambos anuláveis, sem backfill):
  na criação da demanda o gestor escolhe o **time**, opcionalmente o **responsável** (validado
  contra os membros do time escolhido) e escreve **o que precisa ser feito**. A instrução aparece
  na fila do time, no modal de conclusão de etapa e no detalhe da demanda. Override numa etapa que
  já tem time no template é **ignorado** — quem manda no fluxo é o template.
- **Correção de demanda ainda não iniciada** (`/admin/tasks/[taskId]` → "Configuração das etapas"):
  enquanto a demanda é **virgem**, o gestor pode reconfigurar quais etapas opcionais entram, para
  qual time vai cada etapa coringa, quem responde e a instrução. Fecha o buraco em que uma etapa
  roteada errado — ou não roteada — ficava presa para sempre. Virgem = `Task.startedAt` nulo,
  nenhuma etapa com responsável e status `BACKLOG` (`lib/task-virgin.ts`); o carimbo write-once já
  existente é a âncora, em vez de um predicado novo de "teve interação". A janela fecha porque
  depois disso mudar o time de uma etapa **reescreveria medição** já produzida (throughput,
  on-time, flow efficiency por time), e não corrigiria erro de planejamento. Etapa **não-opcional
  entra sempre**: a correção não pode virar reescrita do fluxo. A lista de etapas é o mesmo
  componente do formulário de criação (`StageSetupRows`) — é a mesma decisão, tomada depois.
- **Descrição do projeto visível na demanda de admin** (`/admin/tasks/[taskId]`): o contexto que
  explica para que a demanda existe já aparecia na visão do executor (`/tasks/[taskId]`), mas não
  na de admin — as duas telas contavam histórias diferentes sobre a mesma demanda. O bloco virou
  componente único (`ProjectContextNote`, sem hooks, servindo Server e Client Component).
- **Duplicar carrega o desenho das etapas coringa:** `duplicateTask` já recriava as MESMAS etapas
  incluídas, mas perdia o time roteado e a instrução. Agora viajam junto. Duplicar é o caminho de
  conserto de uma demanda que travou (obsoleta → duplica → corrige), e redecidir cada coringa do
  zero para consertar uma transformaria o conserto em retrabalho. O **responsável** continua
  deliberadamente fora: é a ausência dele que faz a cópia nascer virgem e, portanto, corrigível.
- **Time efetivo como regra única** (`lib/stage-team.ts`): roteamento da tarefa, senão o time
  padrão do template. Aplicado em fila do time, etapas bloqueadas, cockpit de saúde, calendário,
  carga, "minhas etapas", filtros da lista de tarefas e relatórios (produtividade, desempenho,
  flow efficiency, CFD, retrabalho, lead time, throughput e on-time por time). Para as tabelas
  históricas — que guardam `(taskId, stageId)` mas não o roteamento — `routedStageTerms` agrupa por
  etapa, gerando um termo por etapa coringa em vez de um por demanda.

#### Acesso e login

- **Cadastro de pessoas e login por convite:** o acesso deixou de ser aberto. Antes, **qualquer conta
  Google do mundo** que abrisse a URL virava um usuário MEMBER criado pelo adapter — e desativar
  alguém seria inócuo, porque bastaria entrar de novo. Agora um callback `signIn` só deixa passar
  quem já tem cadastro e não está desativado. Como consequência obrigatória, veio a ação
  **"Cadastrar pessoa"** em `/admin/users`: sem um jeito de criar o usuário ANTES do primeiro login,
  o convite trancaria a porta com a chave do lado de fora.
- **Desativar / reativar acesso** (`User.disabledAt`): a pessoa deixa de entrar e **as sessões
  abertas caem na hora** — sem isso, "desativado" só valeria quando o cookie expirasse. O histórico
  é preservado: comentários, horas e etapas continuam atribuídos a ela. Um admin não consegue
  desativar a si mesmo (seria irreversível pela interface).
- **"Renovar acesso Google"**: remove o vínculo `Account` para que o próximo login o refaça do zero.
  Serve para vínculo errado ou obsoleto — não para "perdemos o banco", caso em que o próprio login
  já reconstrói.
- **A tela de login explica o erro.** Ela ignorava `?error=` por completo: a pessoa via
  `?error=OAuthAccountNotLinked` na barra de endereços e uma tela idêntica à normal. Agora há
  mensagem por código, incluindo os nossos (`NotInvited`, `AccountDisabled`), e o botão só oferece
  "tentar de novo" onde insistir pode resolver.

#### NAS

- **Falha do agente NAS passou a dizer QUAL é a falha** (`lib/nas/endpoint.ts`): `probeLanAgentDetailed`
  devolve um motivo discriminado — `not-configured`, `timeout`, `unreachable`, `blocked`,
  `http-error`, `unhealthy` — em vez do `null` que colapsava tudo em "agente não encontrado".
  O desempate entre `blocked` e `unreachable` usa uma segunda tentativa com `mode: "no-cors"`: o
  navegador nunca revela se um `fetch` falhou por TLS, DNS ou CORS (é sempre um `TypeError` opaco),
  mas uma requisição no-cors **não** falha por CORS e ainda falha por TLS/DNS — se ela passa, quem
  barrou foi o navegador; se estoura também, não houve conexão. A mensagem de `unreachable` cita
  **certificado vencido** junto de DNS/LAN e repete a URL do agente, porque abri-la mostra o erro de
  certificado em segundos. Texto compartilhado pelas duas telas em `lib/nas/failure-message.ts`.

#### Tarefa rápida

- **Registro de trabalho de etapa única que já aconteceu** (`/tasks/quick`): data, tempo e link, do
  celular, sem abrir demanda. Existe para o trabalho que hoje **não é registrado** — o fluxo normal
  custa mais que a própria execução, e o resultado é resistência ao sistema.
- **A classe é o template:** só fluxos marcados como rápidos aparecem no formulário. Uma tarefa
  rápida nasce e morre no mesmo instante (lead time ≈ 0) e, misturada às demandas normais, puxaria o
  p50/p85 do tipo para baixo — os mesmos percentis que alimentam a checagem de viabilidade. Como a
  previsão já é por classe (P4), separar o template resolve.
- **Trava recíproca no editor de fluxo:** 2+ etapas desabilita a marca "rápido"; a marca ativa
  desabilita "adicionar etapa" — com o motivo escrito ao lado, não como erro depois do envio.
- **Corrigido:** era possível apagar a **última** etapa de um fluxo e deixá-lo com zero. A falha só
  aparecia depois, na criação de uma demanda, longe de quem apagou.

#### Programação semanal (fatia 1)

- **Mesa semanal do gestor** (`/planning/week`): pessoa × dia, com o espaço livre de cada um e o
  poço de etapas disponíveis. O mapa de vagos é a própria mesa — a célula já mostra o quanto o dia
  pegou.
- **O dia é guardado, a rolagem é leitura.** A fila de hoje é "não concluído com data <= hoje", então
  o que não foi feito ontem aparece hoje sem job nenhum; e quem termina o dia puxa o próximo. A folga
  se acumula no fim da semana, que é o objetivo: o ganho de eficiência é de quem trabalhou.
- **Agendamento que não vai acontecer aparece no topo.** Etapa com hora marcada e ainda não liberada
  não é reordenada em silêncio — vira conflito em destaque, porque quem descobre no dia já perdeu a
  locação.
- **Não existe nota de aderência**, e o modelo a torna impossível: sem histórico de plano, não há o
  que comparar. O envelhecimento POR ETAPA continua sendo o sinal, e é sobre o trabalho, não sobre
  quem o fez.

#### Programação semanal (fatias 2 e 3)

- **Minha semana** (`/planning/my-week`): a pessoa vê os próprios seis dias, reordena, assume etapa
  livre do time dela e muda de dia o que já é seu. A leitura é escopada na sessão e **não aceita um
  `userId`** — sem esse parâmetro, ler a semana de outra pessoa é impossível, não só proibido.
- **Terminar o dia puxa o próximo**, como convite e não cobrança: quem quiser adiantar, adianta;
  quem não quiser, fechou o dia e o tempo que sobrou é dele.
- **Reconhecimento do próprio ritmo** — decisão explícita da gestão, e a única exceção ao princípio
  de "informar, não motivar". Compara a pessoa com o histórico dela (mediana das oito semanas
  anteriores), existe só no lado positivo, e o número não é gravado em lugar nenhum.
- **Carga por cliente** (`/planning/client-load`): a mesma semana pelo eixo do cliente, leitura
  pura. As horas saem do mesmo cálculo da mesa — etapa não liberada aparece sem somar —, senão o
  mesmo cliente teria dois números diferentes na mesma semana.

#### Apontamento obrigatório para concluir etapa

- **Concluir etapa passa a exigir horas.** Quem usou o cronômetro não digita nada: o campo já vem
  preenchido com o que foi registrado. O atrito é proporcional ao que falta.
- **Motivo nos dois extremos:** acima da referência, ou 10% dela ou menos. São as duas formas de o
  apontamento voluntário falhar — ninguém ligou o cronômetro, ou ninguém desligou — e as duas
  envenenam o p50 que o sistema oferece a todo mundo.
- **Não dá para reduzir hora já apontada** pelo campo de conclusão: o cronômetro gravou períodos
  reais, e apagá-los ali seria destruir medição em silêncio.
- **A justificativa é causa declarada, não penalidade.** Não bloqueia nada além da própria
  conclusão, não pontua, não entra em indicador, e nenhuma leitura a agrega por pessoa.

#### Carga por cliente: passado medido, futuro projetado

- **O realizado vem do apontamento**, por dia. "Trabalhei 2h ontem e não terminei" aparece como 2h
  em ontem, e o que falta segue adiante — até a etapa fechar.
- **O pendente é projetado pela cadeia de etapas.** A segunda etapa não aparece junto da primeira:
  aparece depois dela. Onde o gestor decidiu o dia, a decisão dele manda.
- **O vencimento é a parede.** Tudo que a projeção jogaria para depois dele empilha na véspera, e o
  bloco mostra a data — sem isso, quatro etapas na terça é um amontoado sem causa visível.
- **Etapa concluída sem apontamento conta zero.** Preencher o passado com estimativa seria fabricar
  histórico.

#### Linha do tempo do projeto (substitui o kanban)

- **O tempo entrou na tela do projeto.** Dia no eixo vertical — futuro projetado em cima, hoje no
  meio, passado abaixo — e demandas no horizontal. O kanban respondia uma pergunta só, "onde cada
  demanda está agora", e jogava fora quanto tempo cada uma ficou parada.
- **Os vãos são comprimidos**, e é aí que está a informação: "12 dias sem movimento" no meio de um
  projeto é o que ninguém via, e costuma ser a explicação do atraso.
- **A gramática é a mesma da carga por cliente** (✓ feito, ▶ em curso, · não liberada, ~
  referência), e o futuro sai da mesma projeção — nenhuma segunda implementação para divergir.
- **A célula vazia usa `—` e nunca `·`**, porque `·` já significa "etapa não liberada" nesta
  gramática — um glyfo com dois significados é como um vocabulário compartilhado deixa de ser
  compartilhado.
- **Demanda descartada aparece riscada — e só se alguém a trabalhou.** Obsoleta ou cancelada que
  ninguém chegou a apontar some da tela: uma coluna inteira mostrando só o dia em que a demanda
  nasceu é ruído num eixo horizontal escasso, e a criação dela ainda partiria uma faixa de vão ao
  meio, fazendo a tela dizer que houve trabalho num dia em que não houve. Com apontamento, ela fica:
  as horas foram gastas de verdade, e apagá-las seria reescrever o passado.
- **Corrigido de passagem:** os filtros "minhas demandas" e "por responsável" do kanban filtravam
  por `Task.assigneeId`, campo que nenhum caminho do fluxo escreve — devolviam sempre vazio. Agora
  filtram pelo responsável da etapa.

### 🐛 Corrigido

#### As duas telas de semana escondiam o que já tinha sido feito

- **Concluir uma etapa a apagava do dia.** A mesa (`/planning/week`) e a semana da pessoa
  (`/planning/my-week`) filtravam `status: not COMPLETED`, então a carga ENCOLHIA conforme a pessoa
  entregava: quem terminou tudo na segunda aparecia com a segunda vazia — e virava o candidato
  óbvio a receber mais. Era o mesmo defeito que a carga por cliente já tinha corrigido, justamente
  nas duas telas onde a distribuição acontece.
- **A regra de qual dia é a mesma das outras telas:** a hora cai no dia em que foi apontada, e o `✓`
  no dia em que a etapa fechou. Etapa programada para segunda e concluída na quarta some da segunda
  — e é isso mesmo: a segunda passa a mostrar "previsto 6h" sem nenhum feito, que denuncia o atraso
  melhor do que arrastar o cartão de lugar.
- **Feito e previsto nunca se somam.** Um é medição (apontamento), o outro é estimativa
  (referência); um número só esconderia qual metade é chute. E a célula mostra só o que ela tem:
  dia futuro não exibe "feito 0h", dia entregue não exibe "previsto 0h".
- **A leitura é uma só** (`lib/planning/week-done.ts`), usada pelas duas telas: a pessoa não pode
  ver da própria semana um número diferente do que o gestor vê dela.

#### A mesa semanal programava trabalho para fora da equipe

- **Era a única porta do sistema que não validava.** Dava para programar trabalho de vídeo para
  alguém de tráfego, e nada reclamava — enquanto o roteamento por equipe e o caminho de conclusão já
  validavam. Agora o servidor recusa, dizendo de qual equipe a etapa é.
- **A tela explica antes de o servidor recusar:** o diálogo mostra a equipe da etapa e lista só quem
  pertence a ela. Uma lista de opções não é uma regra — por isso as duas coisas, e não só a lista.
- **A equipe que vale é a EFETIVA:** o roteamento da demanda substitui o padrão do modelo, então uma
  etapa coringa roteada para outra equipe aceita quem é dela. Etapa coringa que ninguém roteou não
  tem regra a violar e continua aceitando qualquer pessoa.

#### `/planning/coverage` mostrava "sem responsável" para toda demanda

- **Não era caso de borda: era sempre.** A cobertura semanal lia `Task.assignee` — o responsável no
  nível da DEMANDA, campo que nenhum caminho do fluxo escreve. Passa a ler quem responde pelas
  etapas **em curso**, com a mesma cadeia das telas vizinhas (pessoa, equipe da etapa, equipe padrão
  do modelo).
- **Duas etapas ativas, dois nomes.** A demanda é das duas, e escolher uma esconderia metade do
  trabalho. A mesma pessoa em duas etapas aparece uma vez só, e "sem responsável" agora quer dizer
  isso de verdade.

- **Preview de avanço divergia da execução:** `previewNextStages` olhava apenas as etapas que
  dependem **diretamente** da etapa concluída. Com uma **etapa opcional excluída no meio do fluxo**,
  ele anunciava a própria etapa excluída como "próxima" e escondia a que de fato abre. Passou a
  rodar o **mesmo motor** da ativação (`computeStageReadiness`) sobre o grafo inteiro do template —
  pré-requisito sem linha na tarefa conta como satisfeito, então quem libera a seguinte é a etapa
  **anterior** à opcional. O motor de ativação já se comportava assim; era o preview que mentia.
- **Reversão para etapa fora da tarefa:** `revertTaskStage` validava a ordem da etapa-alvo, mas não
  se ela **faz parte** da tarefa. Uma etapa opcional excluída na criação (ou de outro template)
  passava pela validação e falhava depois, no `update`, com erro genérico. Agora é recusada antes
  de qualquer escrita — sem `ReworkEvent` fantasma. Inalcançável pela UI (a lista de retorno só
  oferece etapas percorridas); é defesa de borda da server action.
- **Atribuição da próxima etapa em etapa coringa:** a validação do responsável usava só o
  `defaultTeam` (nulo numa coringa) e recusava qualquer atribuição, deixando a etapa
  permanentemente sem responsável. Agora valida contra o time efetivo.

#### i18n das mensagens de erro

- **113 mensagens de erro deixaram de ser texto fixo** e passaram a vir do dicionário, em 13 arquivos
  de `lib/actions/`. Elas chegam ao usuário por toast: para quem usa o app em espanhol, **todo erro
  aparecia em português** — e parte deles nem isso, aparecia em **inglês** (`activity.ts`,
  `stage.ts`, `dependency.ts`, `template.ts`), coisa que a primeira auditoria não pegou porque
  filtrava por acento e palavra portuguesa.
- Efeito colateral bom: variações da mesma mensagem convergiram para uma chave só. Conviviam
  `"Tarefa não encontrada"` e `"Tarefa não encontrada."`, `"Etapa de destino não encontrada"` e a
  versão com ponto.
- **Sobraram 6, de propósito:** 2 são mensagens de schema Zod definidas no topo do módulo, onde
  `getTranslations` não roda (precisa de outra abordagem, com código de erro traduzido na borda); 3
  são avisos de função depreciada que citam o nome da função substituta — migalha para quem
  desenvolve, não texto de usuário; 1 vive dentro de `advanceTaskStage`, que **não tem chamador
  nenhum** no repositório e ficou marcada como candidata a remoção.

#### Conta e perfil

- **Nome de exibição editável** em `/account`, com validação compartilhada entre tela e servidor
  (`lib/display-name.ts`). Aceita letras acentuadas, espaço, **apóstrofo e hífen** — "Ana Luísa
  D'Ávila" e "Anne-Marie" são nomes reais, e a regra literal "só letras e espaço" os recusaria.
  Bloqueia números, símbolos e emojis, que era a intenção.
- **Foto sincronizada com o Google a cada login.** O adapter só gravava `image` na criação: quem
  trocasse a foto no Google ficava com a antiga para sempre. Um botão "ressincronizar" não seria
  confiável — o `access_token` expira em ~1h e o `refresh_token` só vem no primeiro consentimento.
  O **nome** ficou de fora dessa sincronização de propósito: sobrescrevê-lo desfaria a edição da
  pessoa a cada entrada.

#### i18n

- **Redirecionamento para o login perdia o idioma.** Quem navegava em `/es-ES/...` sem sessão caía
  num login em **português** — o middleware montava `/auth/signin` sem o prefixo. Justo a primeira
  tela do app, no momento em que a pessoa ainda não tem sessão nem preferência salva para corrigir.
- **Todo Server Component renderizava em pt-BR, qualquer que fosse a URL.** O `i18n.ts` usava a
  assinatura da v3 do next-intl (`getRequestConfig(({ locale }) => …)`) com a biblioteca já na v4,
  onde o parâmetro é `{ requestLocale }`. O argumento chegava `undefined`, a validação reprovava e
  tudo caía no idioma padrão. Passava despercebido porque os **Client** Components continuavam
  certos — o layout do `[locale]` alimenta o `NextIntlClientProvider` a partir de `params.locale` —,
  então metade do app traduzia e metade não. Na prática, a versão em espanhol estava quebrada em
  toda tela renderizada no servidor. O teste de paridade não pegava e nunca pegaria: ele garante que
  a chave EXISTE nos dois idiomas, não que a certa foi escolhida. Há teste novo para essa pergunta.

#### Acesso e login

- **`OAuthAccountNotLinked` travava quem existia antes da perda do banco.** As linhas de `User`
  voltaram, as de `Account` (o vínculo Google) não — e o Auth.js recusa vincular por e-mail para
  impedir sequestro de conta. Eram **31 de 34 usuários**. Resolvido ligando
  `allowDangerousEmailAccountLinking` no provedor Google: o "dangerous" do nome vale para app com
  vários provedores ou com provedor que não verifica e-mail, e aqui só existe Google, que verifica.
  Todos revinculam sozinhos no próximo login, sem intervenção por pessoa.

#### NAS

- **Certificado do agente vencido derrubou o upload (26/ago/2026).** O wildcard `*.goonmarketing.com`
  exportado à mão da cPanel não renovava sozinho. NAS, agente e rede estavam íntegros o tempo todo —
  só o navegador recusava o handshake, e a aplicação traduzia isso como "agente não encontrado".
  Substituído por **ACME DNS-01 com renovação automática** pelo Caddy (§5 do checklist), agora que o
  NS de `goonmarketing.com` está na Cloudflare. Não há mais data de certificado para vigiar.
- **`nas-poc/docker-compose.yml` descrevia a topologia abandonada** — agente publicado em
  `8080:8080` com `LAN_HOST=0.0.0.0` (HTTP puro visível na LAN inteira) + `cloudflared`. Um
  `docker compose up -d` distraído naquele diretório subiria a versão sem TLS. O nome padrão passou a
  ser a pilha em produção; a variante de túnel virou `compose.tunnel.yml`, com o risco no cabeçalho.
- **`scripts/nas-prod-setup.mjs` gerava `agent.env` sem `CF_API_TOKEN`** — obrigatório desde que o
  Caddy passou a emitir o próprio certificado. Quem seguisse o script montaria um NAS incapaz de
  renovar.
- **Download com o agente sem espaço ia para o túnel.** `writable:false` (disco cheio) impede o
  envio, não a leitura, e o túnel só serve artefatos CLIENTE. Agora o corpo de saúde acompanha a
  falha e a tela distingue "não grava" de "fora do ar".

### 📝 Notas de migração

- Migration `20260825120000_add_stage_team_override` — puramente aditiva (duas colunas anuláveis,
  FK `SET NULL` e índice). `teamId` nulo = herda o time padrão da etapa, que é o comportamento de
  todas as linhas existentes.
- **Tarefa rápida:** migration `20260828120000_add_template_quick_entry` (coluna booleana com default
  `false`, sem backfill). **Aplicada em 28/ago/2026.** Sem backfill de propósito: marcar um template
  existente como rápido retroativamente mudaria a CLASSE de demandas já entregues, reescrevendo
  métrica fechada. ⚠️ Ordem do deploy: a migration vem antes do código — o editor de fluxo e a tela
  `/tasks/quick` leem `quickEntry`.
- **Acesso:** migration `20260827140000_add_user_disabled_at` (coluna anulável, sem backfill — null =
  ativo). ⚠️ **Ordem do deploy importa:** aplique a migration ANTES de publicar o código, porque a
  tela de usuários e o login leem `disabledAt`. E, a partir deste deploy, quem **não** tiver cadastro
  não entra mais: confirme a lista de pessoas antes de publicar.
- **NAS:** o `.env` do NAS passa a exigir `CF_API_TOKEN` (token Cloudflare com escopo
  `Zone:DNS:Edit`). O volume `caddy_data` guarda a conta ACME e o certificado — **apagá-lo força
  reemissão** e pode bater no limite semanal da Let's Encrypt. E `resolvers 1.1.1.1 1.0.0.1` no bloco
  `tls` do `Caddyfile` é obrigatório: o host resolve para IP privado na LAN (split-horizon) e, com o
  resolvedor local, o Caddy não veria o TXT de desafio propagar.
- Nenhuma mudança de schema além da migration acima. A correção de demanda virgem apaga linhas de
  etapa, transições e log das etapas removidas: a tarefa nunca as percorreu, então não há história
  a preservar — manter descreveria algo que não aconteceu.

## [2.3.0] - 2026-07-07

### 🚀 Adicionado

#### Fluxo de trabalho

- **Etapas opcionais por tarefa:** flag `optional` em `TemplateStage` (marcável no template,
  destacada em âmbar tracejado + legenda no card de fluxo). Na criação da demanda as etapas
  opcionais vêm **desmarcadas** e as normais marcadas mas desmarcáveis; etapas não incluídas
  **não geram linha** e somem de fluxo/seguimento/retorno/histórico. Motor reescrito
  (`computeStageReadiness`) com _pass-through_ por etapas excluídas.
- **Conclusão automática da tarefa:** ao encerrar a última etapa, `Task.status` vira `COMPLETED`
  (corrige a lacuna em que a tarefa ficava `IN_PROGRESS` com todas as etapas concluídas).
- **Status/% do projeto:** card de **% de conclusão** no detalhe do projeto e filtro
  **Pendentes/Concluídos** na lista de projetos do cliente (`computeProjectCompletion`).
- **Tarefa OBSOLETE + Duplicar:** novo status `OBSOLETE` (sai de pendentes e do %) e ação
  **Duplicar** (copia metadados + recria etapas frescas, sem comentários/artefatos), no
  `TaskLifecycleActions` do `/admin/tasks/{id}`.

#### Artefatos

- **Artefatos com escopo** `TASK`/`PROJECT`/`CLIENT` (um só modelo com `scope` + FKs nuláveis).
  **Tabela única** com chip **Origem** nas 4 telas (tarefa, admin-tarefa, projeto, cliente);
  descrição do projeto em destaque no card da tarefa.
- **Versionamento de artefatos:** cadeia `rootId`/`version`/`isCurrent`. Ação **"Nova versão"**
  (herda título/tipo, só a URL muda; só no próprio escopo); card mostra **Criado/Atualizado** +
  selo `v{N}` + expander **"ver versões"** com o responsável de cada versão.

### 🛠️ Modificado

- **Fluxo NAS simplificado:** pastas `institucional` por escopo
  (`{cliente}/institucional`, `{cliente}/{projeto|tarefa ~id}/institucional`); nome com `AAAA_MM`
  da data do envio. `prepareArtifactUpload`/`buildNasPath` por escopo, RBAC por escopo,
  **sem gate `nasUploadEnabled` nem metadados de campanha** — só exige `Client.folderName`.
  Upload NAS habilitado também em projeto/cliente.
- **Robustez/desempenho:** `getSessionUser`/`getCurrentUser` em `React cache()` (dedup da
  sessão por request); `AbortSignal.timeout` no proxy de imagem e no heartbeat; cache local do
  histórico de versões no painel.
- **N+1 eliminados** em `activateNextStages` e `completeStageAndAdvance` (batch de linhas/times).

### 🗑️ Removido

- Card **"Armazenamento no NAS"** (metadados de campanha + toggle) do detalhe do projeto.
- Campos mortos pós-simplificação NAS: `Project.campaignSlug/Year/Month`, `nasUploadEnabled`,
  `nasMetadataReviewed*`; `TaskArtifact.target` (+ enum `ArtifactTarget`); `TemplateStage.defaultMediaType`.
  Componentes aposentados: `ScopedArtifactsManager`, `ProjectArtifactsTable`, `AddArtifactForm`.

### ✅ Testes

- Novos testes: seleção/prontidão de etapas, `computeProjectCompletion`, auto-conclusão,
  artefatos com escopo + versionamento, ciclo de vida da tarefa, `buildNasPath` por escopo,
  unificação de linhas de artefato. Suíte em **237** testes, verde.

## [2.2.0] - 2026-06-29

### 🚀 Adicionado

#### Produto

- **SLA por etapa:** novo campo `expectedDurationHours` em `TemplateStage` (editável
  nos forms de criação/edição de etapa). O relatório de produtividade por equipe passa
  a sinalizar etapas **No prazo/Acima** do SLA com base na duração média real.
- **Drag-and-drop no calendário:** barras de tarefa no Gantt semanal podem ser
  arrastadas para outro dia, reagendando `dueDate` (ação `rescheduleTask`, via `@dnd-kit/core`).
- **Exportação CSV/PDF** em relatórios (produtividade, performance, produtividade por
  equipe) — geração no cliente com `papaparse` e `jspdf`/`jspdf-autotable`.
- **Relatório individual por colaborador** (`/reports/user/[userId]`): horas totais,
  horas por etapa, etapas concluídas e % no prazo; seletor de colaborador no índice de relatórios.

### 🔒 Isolamento entre projetos + frescor de dados (ambiente dev)

- **Porta dedicada:** `pnpm dev` agora roda em **`localhost:3100`** (era 3000). Vários
  projetos na mesma origem `localhost:3000` compartilhavam cookies, `localStorage` e
  **Service Workers** — um SW de outro projeto (PWA) chegava a "sequestrar" a porta e
  servir o app errado. Origem própria por projeto elimina a colisão.
- **Cookies/armazenamento namespaced:** cookie de sessão `workos.session-token`
  (`auth.config.ts` + `middleware.ts`), cookie de idioma `workos.NEXT_LOCALE` (next-intl)
  e chave `workos:preferred-locale` no `localStorage`. Assim o app ignora estado deixado
  por outros projetos mesmo na mesma origem. **Troca o cookie de sessão → desloga 1 vez.**
- **Limpeza de Service Worker:** `ServiceWorkerCleanup` (layout raiz) desregistra qualquer
  SW e apaga o Cache Storage da origem ao carregar (o app não usa SW).
- **Navegação sempre fresca:** `experimental.staleTimes: { dynamic: 0, static: 0 }` (página
  e layout/menu refazem fetch ao navegar) + `RefreshOnFocus` (revalida ao voltar o foco/aba
  e em restauração de bfcache via `pageshow`). Resolve "tarefas excluídas/menu desatualizado
  até dar hard refresh".

### 🛠️ Modificado / Qualidade

- **Segurança (CSP):** `Content-Security-Policy` agora é gerada por requisição no
  middleware com **nonce** + `strict-dynamic` (sem `unsafe-inline` em scripts).
- **Tempo real:** páginas TV e live-activity migradas de polling para **SSE**
  (`/api/tv/stream`, `/api/live-activity/stream`) com fallback automático a polling.
- **Performance:** corrigido N+1 de `getTranslations()` por linha no dashboard e N+1 de
  leitura em `previewNextStages` (bulk-fetch + predicado `areAllPrerequisitesComplete`
  compartilhado com `activateNextStages`).
- **Hardening:** validação Zod em todas as funções de `reporting.ts`; metadata/título em
  8 páginas (`account`, `reports`, `admin/*`); `dynamic = "force-dynamic"` explícito nas rotas protegidas.
- **i18n:** mensagens de erro de `createTasksBatch` e toasts de `AdvanceStageButton`
  movidos para os catálogos (`errors`, `toasts`).
- **Cloudinary removido** por completo (pacote, envs obrigatórias, hosts e `addFileArtifact` morto).
- **Testes:** novos testes de componente para `KanbanBoard` e `TaskDetailView` (Vitest).

## [2.1.0] - 2026-06-26

### 🚀 Adicionado

#### Pré-criação de etapas + atribuição de responsável

- **Pré-criação:** ao criar uma demanda, **todas** as etapas já nascem como
  `TaskActiveStage` — a de menor ordem como `ACTIVE`, as demais com o novo status
  `INACTIVE`. A criação de etapas passou a existir num único lugar (`createTaskStages`).
- **Atribuição de responsável por etapa** usando o `assigneeId` já existente, validado
  no servidor contra a equipe (`defaultTeam`) da etapa:
  - **Na criação:** card de pré-visualização com seletor de responsável por etapa.
  - **Na conclusão:** modal de avanço permite atribuir as próximas etapas (e
    pré-preenche quem já foi definido na criação).
- **Tela `/admin/tasks/{id}`:** seção "Todas as etapas" (status + responsável de cada
  etapa) e card "Tempos Registrados" (lançamentos + atividades **em andamento**).
- **Relatório `/reports/productivity`:** filtros de **mês** (select dos meses com
  registro, padrão mês atual), **equipe**, **cliente** e **projeto**; cards de Projeto/
  Cliente ocultados quando o respectivo filtro está ativo.
- **Relatório `/reports/performance`:** mesmos filtros de produtividade (mês + equipe +
  cliente + projeto), com idêntico padrão de UX.
- **Tela `/admin/projects/{id}`:** card "Artefatos" com o total ao lado de "Concluída" e
  **tabela de artefatos pesquisável** (título/link, tipo, tarefa, autor, data).
- Documentação: plano em `docs/superpowers/plans/2026-06-26-stage-precreation-and-assignment.md`
  e auditoria em `docs/nextjs-best-practices-audit.md`.

### 🛠️ Modificado

- `activateNextStages` deixou de **criar** etapas e passou a **transicionar**
  (`INACTIVE`→`ACTIVE`/`BLOCKED`) preservando o `assigneeId`.
- Reversão de etapa reseta as etapas posteriores para `INACTIVE`.
- Coluna "Projeto" da lista de etapas e do backlog da equipe virou **"Cliente/Projeto"**.
- Streaming (Suspense) por widget nos relatórios de produtividade e performance.

### 🐛 Corrigido

- Link "voltar" da tarefa retorna ao **projeto** (`/admin/projects/{id}`).
- Avatares de comentários/artefatos/tempos passam pelo proxy de imagem (corrige imagem
  quebrada de fotos do Google).
- Status da demanda nos modais do dia do calendário mensal agora é **traduzido** (antes
  mostrava o enum cru, ex.: `IN_PROGRESS`).
- Type-safety: removidos os `any` das Server Actions; validação Zod em stage/template/
  dependency; correção do módulo `"use server"` (helpers síncronos movidos para fora).

## [2.0.0] - 2024-11-06

### 🚀 Adicionado (Breaking Changes)

#### Sistema de Workflow Paralelo (Fork/Join)

- **TaskActiveStage Model:** Novo modelo many-to-many entre Task e TemplateStage
  - Status: ACTIVE, BLOCKED, COMPLETED
  - Suporta múltiplas etapas ativas simultaneamente
  - Atribuição (assigneeId) por etapa individual

- **Fork Pattern:** Ativação automática de múltiplas etapas dependentes
  - Função `activateNextStages(taskId, completedStageId)`
  - Quando uma etapa é completada, todas as etapas dependentes ativam simultaneamente

- **Join Pattern:** Sincronização automática de dependências
  - Função `checkAllDependenciesComplete(taskId, stageId)`
  - Etapas aguardam TODAS as dependências antes de ativar
  - Status BLOCKED para etapas aguardando dependências

- **Atribuição por Etapa:**
  - `claimActiveStage(taskId, stageId)` - Pegar etapa específica
  - `unassignActiveStage(taskId, stageId)` - Liberar etapa específica
  - Validação automática de team do usuário

- **Dashboard Refatorado:**
  - Uma entrada por etapa ativa (não por tarefa)
  - `getMyActiveStages()` - Buscar etapas atribuídas ao usuário
  - `getTeamBacklog(teamId)` - Buscar etapas não atribuídas do time
  - Filtros avançados (por time, por assignee, por prioridade)

- **Novos Componentes UI:**
  - `ClaimActiveStageButton` - Pegar etapa
  - `UnassignActiveStageButton` - Liberar etapa
  - `AdvanceStageButton` (refatorado) - Preview de fork/join
  - `StageWorkflowVisualization` - Visualização de progresso

- **ActiveStageStatus Enum:** ACTIVE, BLOCKED, COMPLETED

### 🔄 Modificado

- **Task Model:**
  - Removido: `currentStageId` (breaking)
  - Adicionado: `activeStages` (relação com TaskActiveStage)
  - Computed properties para backward compatibility: `currentStage`, `currentStageId`

- **TemplateStage Model:**
  - Adicionado: `activeTasks` (relação com TaskActiveStage)

- **User Model:**
  - Adicionado: `assignedActiveStages` (relação com TaskActiveStage)

- **completeStageAndAdvance():** Refatorado para usar fork/join
  - Valida contribuições (artefatos/comentários)
  - Valida permissões (admin/manager/assignee)
  - Retorna preview de etapas ativadas e bloqueadas

- **createTask():** Atualizado para criar TaskActiveStage inicial
  - Remove atribuição de currentStageId
  - Cria primeira etapa como ACTIVE no TaskActiveStage

- **Queries do Dashboard:**
  - Refatoradas para usar TaskActiveStage ao invés de Task
  - Stats agora contam etapas ativas, não tarefas

- **KanbanBoard:** Atualizado para carregar activeStages
  - Computed properties para backward compatibility

- **TaskDetailView:** Atualizado para mostrar múltiplas etapas ativas
  - Props atualizadas para incluir activeStages

### ⚠️ Depreciado

As seguintes funções foram depreciadas e retornam mensagens de erro:

- `advanceTaskStage()` → Use `completeStageAndAdvance()`
- `getAvailableNextStages()` → Lógica integrada em `completeStageAndAdvance()`
- `claimTask()` → Use `claimActiveStage()`
- `assignTask()` → Use `claimActiveStage()`
- `revertTaskStage()` → Em revisão para nova implementação

### 🗑️ Removido (Breaking Changes)

- **currentStageId field:** Removido do modelo Task
- **currentStage relation:** Removida do modelo Task (agora é computed property)

### 🔒 Segurança

- Validação de team adicionada em `claimActiveStage()`
- Verificação de permissões aprimorada em `completeStageAndAdvance()`
- Validação de contribuições antes de avançar etapa

### 📊 Performance

- Índices otimizados em TaskActiveStage:
  - `@@index([taskId])`
  - `@@index([stageId])`
  - `@@index([assigneeId])`
  - `@@index([status])`
  - `@@unique([taskId, stageId])`

- Queries otimizadas com select seletivo
- Uso de transações para operações críticas

### 📖 Documentação

- Adicionado: `PARALLEL_WORKFLOW.md` - Documentação completa do sistema
- Atualizado: `README.md` - Novo sistema destacado
- Atualizado: `task-flow.md` - Fluxo de trabalho paralelo
- Adicionado: Este `CHANGELOG.md`

### 🔧 Migração

⚠️ **ATENÇÃO: Breaking Changes - Requer reset do banco de dados**

```bash
# 1. Backup (se necessário)
pg_dump $DATABASE_URL > backup_v1.sql

# 2. Reset do banco
npx prisma migrate reset --force

# 3. Gerar Prisma Client
npx prisma generate

# 4. Build
npm run build

# 5. Seed (opcional)
npx prisma db seed
```

### 🧪 Testes Recomendados

Após a migração, teste os seguintes cenários:

1. **Fork Simples:**
   - Criar tarefa com workflow A → (B, C)
   - Completar A
   - Verificar que B e C estão ambos ACTIVE

2. **Join Simples:**
   - Criar tarefa com workflow (A, B) → C
   - Completar A
   - Verificar que C está BLOCKED
   - Completar B
   - Verificar que C mudou para ACTIVE

3. **Atribuição:**
   - Pegar etapa do próprio time
   - Tentar pegar etapa de outro time (deve falhar)
   - Liberar etapa atribuída

4. **Dashboard:**
   - Verificar que aparecem múltiplas entradas para tarefa com múltiplas etapas ativas
   - Verificar filtros (My Tasks, By Team, By Assignee, By Priority)

## [1.0.0] - 2024-10-XX

### Adicionado

- Setup inicial do Next.js 15 com App Router
- Schema Prisma completo com todos os modelos
- NextAuth.js configurado com Google Provider
- Sistema de autenticação e autorização (RBAC)
- Modelos de User, Team, Client, Project, Task
- WorkflowTemplate e TemplateStage
- StageDependency para dependências entre etapas
- TimeLog e TaskStageLog para relatórios
- TaskComment e TaskArtifact para colaboração
- Dashboard básico
- Kanban board
- Visualização de tarefas
- Activity tracking (start/stop)
- Time logging manual
- Comentários e artefatos

---

## Tipos de Mudanças

- **Adicionado** - para novas funcionalidades
- **Modificado** - para mudanças em funcionalidades existentes
- **Depreciado** - para funcionalidades que serão removidas
- **Removido** - para funcionalidades removidas
- **Corrigido** - para correção de bugs
- **Segurança** - para correções de vulnerabilidades
