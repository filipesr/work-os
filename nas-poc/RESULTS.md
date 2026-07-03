# NAS PoC — resultados da metrificação

**Data:** 2026-07-02 · **Hardware:** Asustor AS3304T v2 (ADM 4.x, porta 2,5 GbE, CPU ARM Realtek quad-A53,
~2 GB RAM) · **Agente:** nas-poc-agent em Docker, `POC_HASH_MODE=inline`.

## Metas (do plano)

- Upload LAN (5 GB) **≥ 85 MB/s**
- Download por túnel **≥ 10 MB/s** _(pendente — Fase A4/A5)_

## Medições

### Rede (upload via load-test, do Mac → agente na LAN)

| Caminho                 | Single-stream (16 MB)  | Agregado (c=2 / c=4)   | Teto efetivo                  |
| ----------------------- | ---------------------- | ---------------------- | ----------------------------- |
| **Cabo (switch atual)** | ~11,2 MB/s             | ~12 / ~11 MB/s (plano) | **~100 Mbps → switch 10/100** |
| **Wi-Fi**               | ~11–21 MB/s (instável) | ~16–19 MB/s            | ~160 Mbps, variável           |

O agregado **não escala** com concorrência no cabo → gargalo de **link compartilhado saturado**, clássico
de Fast Ethernet. Confirmado pela inversão Wi-Fi > cabo.

> **Contexto de rede (importante):** o switch 10/100 é **só na sala de dev**. O NAS e as equipes estão em
> rede **Gigabit (1000)**. Logo a medição de ~11 MB/s **não representa os usuários** — numa porta Gigabit
> o teto é ~110 MB/s e a meta de 85 é atingível. **Ação:** re-medir de uma porta Gigabit.
>
> **Internet do NAS = 100/100 Mbps full duplex.** Isso **não** afeta o upload LAN, mas **limita o
> download externo pelo túnel**: os bytes saem pelo upload de 100 Mbps → teto ~10–11 MB/s por download, e
> **downloads externos simultâneos dividem** esses 100 Mbps. A meta de ≥10 MB/s no túnel fica no limite do
> link — não do NAS/Cloudflare.

### Teto real do NAS (isolado da rede, via SSH)

| Recurso                            | Método                          | Resultado                                           |
| ---------------------------------- | ------------------------------- | --------------------------------------------------- |
| **Disco (escrita seq.)**           | `dd 4 GB bs=1M` + `sync`        | 3,9 GB em 16,6 s → **~240 MB/s**                    |
| **sha256 — BusyBox**               | `dd 1 GB \| sha256sum`          | 1 GB em 151 s → ~6,6 MB/s ⚠️ **NÃO representativo** |
| **sha256 — agente (Node/OpenSSL)** | `docker exec … node createHash` | **~715 MB/s**                                       |

> O `sha256sum` do BusyBox é C puro não-otimizado — mede a si mesmo, não o agente. O agente usa
> Node→OpenSSL (assembly, aceleração ARM), ~100× mais rápido. Prova cruzada: o upload no Wi-Fi já fez
> 20 MB/s **com hash inline** — impossível se o hash real fosse 6,6 MB/s.

## Veredito

- **NAS aprovado no hardware.** Pipeline no lado do NAS tem teto ~240 MB/s (disco); hash (715 MB/s) e CPU
  não limitam. `POC_HASH_MODE=inline` pode permanecer na produção — **não precisa de hash deferido**.
- **Gargalo único = rede.** O switch **10/100** trava tudo em ~11 MB/s.

## Ações para atingir a meta

1. **LAN:** re-medir de uma **porta Gigabit** (rede dos times) — não da mesa de dev 10/100.
   `PROFILE=full CONCURRENCY=1,2,4`, confirmar ≥ 85 MB/s. 1 GbE já basta; 2,5GbE só p/ folga/futuro.
2. **Cliente** de teste cabeado ≥1 GbE (Mac: adaptador USB-C). Wi-Fi/100M não sustentam 85.
3. **Túnel:** a meta ≥10 MB/s é limitada pelo **upload de internet de 100 Mbps** do NAS (~10–11 MB/s teto,
   dividido entre downloads simultâneos). Para downloads externos rápidos → aumentar o upload da internet.
4. _(Produção)_ mapear os pontos de upload dos usuários — quem estiver em Wi-Fi/100M terá menos.

## Pendências do PoC (não dependem do switch)

- Fase A4/A5 — Cloudflare Tunnel (só `GET /v1/download`) + smoke de segurança + throughput do túnel.
- Fase D — Windows/macOS: link local por SO (helper `link-format`), montagem read-only, nomes acentuados.
