---
name: diagnostico-latencia
description: Use quando o usuário disser que a aplicação está lenta, que os cliques demoram, que as telas carregam devagar, ou pedir para investigar/otimizar performance de uma aplicação web hospedada (Vercel, Netlify, Render, Fly, Railway) com banco gerenciado (Neon, Supabase, PlanetScale, RDS). Também quando pedirem para "reduzir consultas", "otimizar queries" ou "paralelizar chamadas ao banco" — porque a causa costuma ser outra e este procedimento descarta o suspeito certo antes de reescrever código.
user-invocable: true
---

# Diagnóstico de latência: meça antes de consertar

Lentidão percebida em aplicação hospedada quase nunca é o que parece. A causa mais cara e mais
invisível é **geográfica**: a função executa numa região e o banco está em outra, então cada
consulta atravessa o planeta. O conserto costuma ser uma linha de configuração — e a parte difícil
é provar que é isso antes de reescrever código que não tem culpa.

**Regra que governa esta skill: nenhuma otimização antes de um número.** Se o usuário pedir para
paralelizar consultas ou enxugar `select`, execute este procedimento primeiro. Num caso real, as
três frentes de reescrita propostas valiam ~73 ms somadas; a causa real custava 134 ms por
requisição e se resolvia sem tocar no código.

---

## Passo 1 — Onde a função executa?

Primeiro sempre, porque responde em segundos e resolve a maioria dos casos.

```bash
# Vercel — formato: edge::função::id
curl -sI https://DOMINIO/ | grep -i x-vercel-id
#   gru1::iad1::…  → recebe em São Paulo, EXECUTA em Washington  ⚠
#   gru1::gru1::…  → mesma região, ok

# Outras plataformas
curl -sI https://DOMINIO/ | grep -iE "x-(vercel|amz|render|fly)|cf-ray|fly-region|server"
```

Compare com a região do banco, que está na string de conexão (`…sa-east-1.aws…`, `…us-east-1…`).
Leia do `.env` **sem imprimir credencial** — extraia só o host:

```bash
grep -o "@[^/]*" .env | head -3
```

**Regiões diferentes = achou.** Vá ao passo 3 para dimensionar e provar. Regiões iguais: siga para
descartar os outros suspeitos (passo 6).

---

## Passo 2 — Separe o aperto de mão da consulta

A medição que mais engana. A **primeira** consulta de um processo paga TLS + autenticação; as
seguintes, não. Num caso real a diferença foi **265 ms contra 26 ms** — 10×, e as duas medições são
verdadeiras sobre coisas diferentes.

```js
// Rode da RAIZ do projeto (precisa resolver o client do banco).
const t = [];
await db.query("select 1"); // fria — descarte
await Promise.all(Array.from({ length: 8 }, () => db.query("select 1"))); // aquece o pool
for (let i = 0; i < 5; i++) {
  const t0 = performance.now();
  await db.query("select 1");
  t.push(Math.round(performance.now() - t0));
}
console.log("regime:", t);
```

Guarde os dois números: o frio reaparece no passo 6 (função fria).

**Não some consultas paralelas.** Com `Promise.all`, 6 consultas simultâneas custaram 30 ms — o
mesmo que uma. O que multiplica custo são **fases em série**, não a quantidade.

---

## Passo 3 — Três rotas, uma delas controle

Uma medição sozinha não distingue "melhorou" de "a rede estava melhor".

```bash
# LC_ALL=C é OBRIGATÓRIO: em locale pt/es o curl imprime decimal com VÍRGULA
# e toda soma em awk devolve zero silenciosamente.
export LC_ALL=C

med() {
  for i in $(seq 12); do
    curl -s -o /dev/null -w "%{time_starttransfer}\n" "$1"
  done | tr ',' '.' | sort -n | awk -v L="$2" '
    {a[NR]=$1*1000}
    END {printf "  %-32s mediana %4d ms | min %4d | max %4d\n", L, a[int((NR+1)/2)], a[1], a[NR]}'
}

med https://DOMINIO/robots.txt      "estático (CONTROLE)"
med https://DOMINIO/api/ROTA-LEVE   "função + 1 consulta"
med https://DOMINIO/PAGINA          "página inteira"
```

**O controle é o que torna isso evidência.** O estático não passa pela função: é a rede entre você e
o provedor. Se ele se mover entre antes e depois, descarte a comparação.

Subtraia o controle das outras duas: o resto é custo de servidor + trajeto.

---

## Passo 4 — O servidor é inocente?

```bash
npm run build && npm start &
sleep 5
curl -sL -o /dev/null http://localhost:3000/PAGINA       # aquece
for i in 1 2 3 4 5; do
  curl -sL -o /dev/null -w "  %{time_starttransfer}s  %{size_download}B\n" http://localhost:3000/PAGINA
done
```

Se local entrega em **milissegundos** o que produção leva **centenas**, não é render, não é payload,
não é consulta. É trajeto. (Caso real: 7 ms local × 262 ms em produção.)

⚠️ **Não meça no servidor de desenvolvimento.** A primeira visita a cada rota compila sob demanda:
2,45 s na primeira, 15 ms nas seguintes. Isso é compilação, não latência — e cai exatamente na faixa
que as pessoas relatam, o que manda a investigação para o lugar errado.

---

## Passo 5 — Conte fases, não consultas

Cada **fase** — um `await` cujo resultado o próximo precisa — paga uma ida e volta.

```js
const times = await db.times(); // fase 1
const pessoas = await db.pessoas(times); // fase 2 — depende da 1
const dados = await db.dados(pessoas); // fase 3 — depende da 2
```

Conte as fases das 2–3 telas mais usadas. Multiplicado pelo custo do desvio, esse número diz quanto
a correção vale **antes** de aplicá-la.

Atenção ao padrão "valida antes de consultar": buscar uma lista só para validar um parâmetro da URL
e então fazer a consulta principal são duas fases onde poderia haver uma — valide contra o
resultado, não antes dele.

---

## Passo 6 — Aplique o conserto

**Regiões diferentes:** mova a função para junto do banco. Função não tem estado; banco tem.

```json
// vercel.json
{ "regions": ["gru1"] }
```

- **Confirme o plano.** Escolher região de função costuma ser recurso pago; no gratuito a chave é
  ignorada em silêncio.
- **Cron e workers** têm região própria — verifique separadamente.
- **Se o banco é que está na região errada** e a operação é local, mover o banco é o certo, mas é
  migração com janela e cópia de dados.

**Regiões iguais — os outros suspeitos, em ordem:**

| sintoma                                                  | causa provável                             |
| -------------------------------------------------------- | ------------------------------------------ |
| mediana boa, p90 ruim; rota leve estável e pesada oscila | função fria pagando o handshake do passo 2 |
| muitas fases em série (passo 5)                          | aí sim vale reescrever                     |
| `size_download` grande e tempo local alto                | payload                                    |
| cada clique refaz tudo                                   | cache de navegação desligado no framework  |

---

## O que foi medido e NÃO valeu

Registro do caso real, com os números. Serve para não refazer o caminho — e porque **quatro destas
cinco coisas são o que se propõe por reflexo** quando alguém diz que a aplicação está lenta.

| proposta                       | medido                                        | veredito                                                                                             |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Paralelizar consultas em série | 186 ms → 113 ms = **73 ms**                   | Com a função ao lado do banco, cai para ~20 ms. Deixa de pagar o risco.                              |
| Enxugar `select` gordo         | —                                             | É higiene, não latência: com 26 ms de ida e volta, pesa o trabalho no banco, não o tamanho da linha. |
| Cachear listas de referência   | 1 cliente, 6 projetos, 17 equipes, 33 pessoas | Economiza ~10 ms e compra um problema de invalidação. Acervo pequeno demais para valer.              |
| Cortar payload de i18n         | 176 KB → 114 KB = **62 KB**                   | Economia de BYTES, não de relógio: a mesma página sai em 7 ms local. Importa em rede ruim, não aqui. |
| Mudar a região do banco        | —                                             | Possível, mas é migração com janela e cópia. Mover a função é mais barato: ela não tem estado.       |

**A regra por trás da tabela:** uma otimização de código só vale depois que o trajeto está curto.
Com a função longe do banco, cada fase em série custava ~120 ms e paralelizar parecia valer meio
segundo; com ela ao lado, a mesma mudança vale 20 ms e o risco de mexer na semântica passa a ser
caro demais. **A ordem importa: consertar a geografia primeiro muda o veredito de tudo o mais.**

Duas armadilhas específicas dessas propostas, se alguém insistir:

- **Validar antes de consultar tem razão de ser.** Telas que buscam uma lista para validar um
  parâmetro da URL e só então fazem a consulta principal parecem desperdício, mas existem para que
  um link com id apagado caia num estado utilizável em vez de mostrar tela vazia com filtro que não
  dá para desmarcar. Paralelizar isso exige validar contra o resultado, não antes — e é mudança de
  semântica, não de forma.
- **Payload de i18n tem dependência invisível.** Cortar namespaces por varredura estática quebra
  quem recebe o namespace por _prop_ em runtime. Só faça com um guard que acompanhe.

**E o item que não estava na lista e era a causa:** a região. Ninguém propôs, porque não se olha o
cabeçalho da resposta quando se acredita que o problema está no código.

---

## Passo 7 — Meça de novo, igual

Confira o cabeçalho **primeiro**: se a região não mudou, a configuração não pegou e não há o que
comparar. Depois repita o passo 3 sem alterar nada no método.

```bash
curl -sI https://DOMINIO/ | grep -i x-vercel-id   # esperado: mesma região duas vezes
```

**Como saber que o ganho é real:** o controle parado e as outras duas linhas caindo. Se as três
caírem juntas, a rede melhorou e você não mediu nada.

---

## Ao relatar ao usuário

- Dê **medianas com o controle ao lado**, sempre. Número sem controle é opinião com casas decimais.
- Diga o que a medição **desmentiu**, inclusive se desmentir algo que você mesmo propôs. Num caso
  real, três diagnósticos anteriores estavam errados — um deles recomendado na mesma sessão.
- Se o ganho for menor que o esperado, **diga o número**, não a expectativa.
- Registre a medição num documento do projeto com a data e o método, para a próxima pessoa não
  refazer o caminho — e para que um número velho não seja lido como verdade atual.

## Armadilhas que já custaram tempo

1. **`curl -w` com locale pt/es** imprime decimal com vírgula; `awk` devolve zero e as medianas saem
   todas `0 ms`. Sempre `LC_ALL=C` e `tr ',' '.'`.
2. **Script de medição fora da raiz do projeto** não resolve o client do banco. Rode da raiz e apague
   o arquivo depois.
3. **Loop longo contra domínio externo** pode ser barrado por proteção de abuso. 12 requisições por
   rota bastam para uma mediana estável.
4. **Comparar contra número antigo do documento** sem remedir. Remeça sempre os dois lados.
