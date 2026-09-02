"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { CalendarPlus } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  scheduleStage,
  setStageWindow,
  listWindowCandidates,
  type WindowOverlap,
} from "@/lib/actions/week-planning";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { formatDisplayTime } from "@/lib/dates";

/**
 * Programar uma etapa: para quem, em que dia e — quando o dia é futuro — a que horas.
 *
 * Programar por diálogo, não arrastando: não há biblioteca de drag no projeto, e arrastar é a parte
 * que os testes menos alcançam. Numa grade larga de pessoas × dias, escolher de uma lista é mais
 * preciso que mirar uma célula.
 *
 * As três coisas moram JUNTAS porque são um pensamento só — "a gravação é da Ana, quinta, às 14h".
 * Antes a hora era um segundo gesto, num segundo botão, numa segunda tela.
 *
 * **Hoje é fila, não horário.** Escolher o dia de hoje desabilita a hora: o que entra no dia de
 * alguém agora se faz na vez, e um compromisso marcado para hoje nasceria vencido metade das vezes.
 * Compromisso é coisa de dia futuro — e essa regra, além de ser a verdade do negócio, elimina por
 * construção a hora no passado que a tela teria de validar contra o relógio a cada minuto.
 */
export function ScheduleDialog({
  activeStageId,
  label,
  teamName,
  people,
  todayISO,
}: {
  activeStageId: string;
  label: string;
  /** A equipe efetiva da etapa; nula na coringa que ninguém roteou. */
  teamName: string | null;
  /** Quem pode receber a etapa — já recortado pela equipe. A tela explica, o servidor garante:
   *  `scheduleStage` recusa de novo, porque uma lista de opções não é uma regra. */
  people: { id: string; name: string }[];
  /** Hoje no fuso de SÃO PAULO, vindo do servidor. O relógio do navegador é o do visitante: usá-lo
   *  faria a trava de data mudar de significado conforme o fuso de quem abre a tela. */
  todayISO: string;
}) {
  const t = useTranslations("planning.week");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [dateISO, setDateISO] = useState(todayISO);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // Quando `setStageWindow` recusa gravar, o painel de saídas (adiar/remarcar/trocar/cancelar) mora
  // aqui — não é erro, então `useServerAction` chama `onSuccess` do mesmo jeito, e é o componente
  // que precisa reconhecer a forma `{ overlap }` e desviar da UI de sucesso.
  const [overlap, setOverlap] = useState<WindowOverlap | null>(null);
  // A escolha de pessoa das duas trocas de colaborador (mover a OCUPANTE, ou mover a NOVA). Só uma
  // por vez — abrir a segunda descarta a primeira, que é rascunho da mesma forma que `overlap`.
  const [picker, setPicker] = useState<{
    /** A etapa que vai mudar de dono: a da ocupante escolhida, ou a própria `activeStageId`. */
    activeStageId: string;
    /** Só a NOVA precisa reenviar `setStageWindow` depois — a ocupante já tem hora própria, que
     *  `scheduleStage` preserva ao trocar de dono no mesmo dia. */
    isNew: boolean;
    candidates: { id: string; name: string; busy: boolean }[];
    userId: string;
  } | null>(null);

  const paraHoje = dateISO === todayISO;

  // O estado é rascunho: reabrir recomeça do zero, e o painel de conflito de uma tentativa anterior
  // não pode ficar pendurado na próxima abertura.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDateISO(todayISO);
      setStart("");
      setEnd("");
    }
    setOverlap(null);
    setPicker(null);
    setOpen(next);
  };

  const fecharEAtualizar = () => {
    setOpen(false);
    router.refresh();
  };

  const escolherDia = (novo: string) => {
    setDateISO(novo);
    // Hoje não tem hora. Limpar em vez de só desabilitar evita mandar ao servidor uma hora que o
    // gestor digitou antes de trocar a data e não vê mais na tela.
    if (novo === todayISO) {
      setStart("");
      setEnd("");
    }
  };

  const marcarHora = useServerAction(setStageWindow, {
    onSuccess: (result) => {
      // `useServerAction` só enxerga `{ error }` como falha — um `{ overlap }` chega aqui como
      // "sucesso" porque o servidor não quebrou, só se recusou a escrever por cima de outro
      // compromisso. Por isso o toast fica condicional: mostrá-lo junto do painel de conflito
      // diria que algo foi marcado quando nada foi.
      if (result && typeof result === "object" && "overlap" in result) {
        setOverlap((result as { overlap: WindowOverlap }).overlap);
        return;
      }
      toast.success(t("scheduled_toast"));
      fecharEAtualizar();
    },
  });

  // A etapa é programada PRIMEIRO e ganha hora depois: `setStageWindow` ancora o horário no dia da
  // própria linha, então ele só existe depois que a linha tem dia. Se a hora colidir, a etapa
  // continua programada e o painel oferece as saídas — o dia foi decidido, só a hora não.
  const programar = useServerAction(scheduleStage, {
    onSuccess: () => {
      if (!start) {
        toast.success(t("scheduled_toast"));
        fecharEAtualizar();
        return;
      }
      marcarHora.run({ activeStageId, startTime: start, endTime: end || null });
    },
  });

  // Reenvia a MESMA ocupante (índice fixo — só existe quando `occupants.length === 1`) com o
  // horário que o servidor já calculou; ao terminar, reenvia a hora pedida. O reenvio não checa se
  // ESTE resultado também veio com `{ overlap }` porque o servidor recalcula o horário livre contra
  // TODAS as outras faixas do dia antes de responder, e `setStageWindow` nunca grava por cima de uma
  // colisão: o pior caso é um novo painel, nunca um horário incorreto persistido.
  const adiarOcupante = useServerAction(setStageWindow, {
    onSuccess: () => marcarHora.run({ activeStageId, startTime: start, endTime: end || null }),
  });
  // Move a OCUPANTE para outra pessoa, no mesmo dia — a hora combinada viaja junto porque
  // `scheduleStage` preserva a janela quando só o dono muda.
  const moverOcupante = useServerAction(scheduleStage, {
    onSuccess: () => {
      setPicker(null);
      fecharEAtualizar();
    },
  });
  // Move a NOVA para outra pessoa e só então reenvia a hora — agora contra a agenda do novo dono.
  const moverNova = useServerAction(scheduleStage, {
    onSuccess: () => {
      setPicker(null);
      marcarHora.run({ activeStageId, startTime: start, endTime: end || null });
    },
  });
  // `useServerAction` não serve aqui — `listWindowCandidates` devolve a lista, não `{ error } |
  // { success }`. Mas é o mesmo trabalho assíncrono disparado por clique, e entra no `isPending`
  // geral pelo mesmo motivo: desabilitar os botões enquanto a busca está em voo.
  const [isChoosingPending, startChoosing] = useTransition();
  const isPending =
    programar.isPending ||
    marcarHora.isPending ||
    adiarOcupante.isPending ||
    moverOcupante.isPending ||
    moverNova.isPending ||
    isChoosingPending;

  // Adiar e mover-a-ocupante trocam um compromisso ALHEIO de lugar — decisão que o gestor toma UMA
  // por vez. Com dois ou mais no caminho, "a ocupante" fica ambíguo (`firstFreeStartISO` também é
  // dimensionado só para o caso de uma), e oferecer os botões empurraria uma decisão em cadeia sem
  // o gestor escolher cada uma. Mover a NOVA não tem essa restrição: não toca em ninguém.
  const umaOcupanteAutorizada =
    overlap !== null && overlap.canOverride && overlap.occupants.length === 1;

  const escolherPessoa = (alvoActiveStageId: string, isNew: boolean) => {
    startChoosing(async () => {
      // A NOVA manda a faixa DO FORMULÁRIO, explícita: a escrita dela acabou de ser recusada pela
      // colisão, então pedir ao servidor que a infira do banco devolveria "etapa não encontrada".
      // A OCUPANTE não manda faixa — viaja com a hora que já tem, e é contra ELA que o servidor
      // checa a agenda do destino; mandar a hora do formulário (de outra demanda) listaria como
      // livre alguém que `scheduleStage` recusaria logo depois.
      const result = isNew
        ? await listWindowCandidates(alvoActiveStageId, { startTime: start, endTime: end || null })
        : await listWindowCandidates(alvoActiveStageId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      // Pré-seleciona a primeira pessoa livre — nunca uma ocupada, que a lista mostra desabilitada
      // mas não pode ser o valor inicial de um `<select>` que o gestor ainda não tocou.
      const livre = result.candidates.find((c) => !c.busy);
      setPicker({
        activeStageId: alvoActiveStageId,
        isNew,
        candidates: result.candidates,
        userId: livre?.id ?? "",
      });
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <CalendarPlus className="h-3.5 w-3.5" />
          {t("schedule")}
        </Button>
      }
      title={overlap ? t("overlapTitle") : t("dialogTitle")}
      description={label}
      formId="schedule-stage-form"
      submitLabel={t("dialogSubmit")}
      isPending={isPending}
      footer={
        overlap ? (
          <DialogFooter>
            {/* Fecha ATUALIZANDO: a etapa já foi programada — só a hora não entrou —, e sair sem
                refresh deixaria a grade sem o item que acabou de ganhar dia. */}
            <Button type="button" variant="outline" disabled={isPending} onClick={fecharEAtualizar}>
              {t("overlapCancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setOverlap(null);
                setPicker(null);
              }}
            >
              {t("overlapRetime")}
            </Button>
            {umaOcupanteAutorizada && (
              <Button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const [occupant] = overlap.occupants;
                  const novoInicio = new Date(overlap.firstFreeStartISO);
                  // A duração DECLARADA viaja junto: 14h–18h adiado para as 17h termina às 21h, não
                  // em "17h + referência da etapa". Quem NÃO declarou fim continua sem fim — ali
                  // `endISO` é só a borda derivada da referência, e reenviá-la inventaria um
                  // combinado que ninguém fez.
                  const duracaoMs = occupant.endDeclared
                    ? new Date(occupant.endISO).getTime() - new Date(occupant.startISO).getTime()
                    : null;
                  adiarOcupante.run({
                    activeStageId: occupant.activeStageId,
                    startTime: formatDisplayTime(novoInicio),
                    endTime:
                      duracaoMs === null
                        ? null
                        : formatDisplayTime(new Date(novoInicio.getTime() + duracaoMs)),
                  });
                }}
              >
                {t("overlapPostpone")}
              </Button>
            )}
            {umaOcupanteAutorizada && (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => escolherPessoa(overlap.occupants[0].activeStageId, false)}
              >
                {t("overlapMoveOccupant")}
              </Button>
            )}
            {/* Sempre disponível — mover a NOVA não pede autoridade sobre a ocupante. */}
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => escolherPessoa(activeStageId, true)}
            >
              {t("overlapMoveNew")}
            </Button>
          </DialogFooter>
        ) : undefined
      }
    >
      {overlap ? (
        <div className="space-y-3 text-sm">
          <ul className="space-y-1">
            {overlap.occupants.map((occupant) => (
              <li key={occupant.activeStageId}>
                {t("overlapOccupant", {
                  task: occupant.taskTitle,
                  stage: occupant.stageName,
                  from: formatDisplayTime(new Date(occupant.startISO)),
                  to: formatDisplayTime(new Date(occupant.endISO)),
                })}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            {t(overlap.canOverride ? "overlapAllowed" : "overlapBlocked")}
          </p>
          {/* Duas ocupantes ou mais: nenhuma saída automática serve, e o que resta é reorganizar a
              semana — então o diálogo entrega a mesa já recortada pelo dia escolhido e pela equipe
              efetiva da etapa. */}
          {overlap.occupants.length > 1 && (
            <p className="text-muted-foreground">
              {t("overlapFreeSpace")}{" "}
              <Link
                href={`/planning/week?week=${dateISO}${overlap.teamId ? `&team=${overlap.teamId}` : ""}`}
                onClick={() => setOpen(false)}
                className="font-medium text-primary hover:underline"
              >
                {t("overlapFreeSpaceLink")}
              </Link>
            </p>
          )}
          {picker && (
            <div className="space-y-2 border-t border-border pt-3">
              {/* Um `<select>` só com opções desabilitadas é um beco sem aviso: o botão fica preso
                  em `disabled` para sempre e nada explica por quê. */}
              {picker.candidates.length > 0 && picker.candidates.every((c) => c.busy) && (
                <p className="text-xs text-danger">{t("overlapNoOneFree")}</p>
              )}
              <select
                aria-label={t("overlapPickPerson")}
                value={picker.userId}
                onChange={(e) => setPicker({ ...picker, userId: e.target.value })}
                className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
              >
                {picker.candidates.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.busy}>
                    {c.busy ? t("overlapBusyPerson", { name: c.name }) : c.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={isPending || !picker.userId}
                onClick={() => {
                  const runner = picker.isNew ? moverNova : moverOcupante;
                  runner.run({
                    activeStageId: picker.activeStageId,
                    userId: picker.userId,
                    dateISO,
                  });
                }}
              >
                {t("overlapPickPersonSubmit")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <form
          id="schedule-stage-form"
          data-testid="schedule-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            programar.run({ activeStageId, userId, dateISO });
          }}
        >
          <div>
            <FieldLabel htmlFor="sd-person" required>
              {t("dialogPerson")}
            </FieldLabel>
            {/* De quem é o trabalho, dito antes de perguntar para quem vai. Sem isto, a lista curta
                parecia arbitrária: o gestor não via POR QUE aquelas pessoas e não as outras. */}
            {teamName && (
              <p className="mb-1 text-xs text-muted-foreground">
                {t("dialogTeam", { team: teamName })}
              </p>
            )}
            {people.length === 0 && (
              <p className="mb-1 text-xs text-danger">{t("dialogNoOneInTeam")}</p>
            )}
            <select
              id="sd-person"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="sd-day" required>
              {t("dialogDay")}
            </FieldLabel>
            {/* Campo de data livre, e não os seis dias da semana em tela: uma gravação combinada
                para outubro não deveria exigir navegar até outubro primeiro. `min` corta o passado
                na tela; `scheduleStage` recusa de novo, porque atributo de input não é regra. */}
            <input
              id="sd-day"
              type="date"
              required
              min={todayISO}
              value={dateISO}
              onChange={(e) => escolherDia(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
            />
          </div>
          <div>
            <FieldLabel htmlFor="sd-start">{t("windowStart")}</FieldLabel>
            <input
              id="sd-start"
              type="time"
              disabled={paraHoje}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground disabled:opacity-50"
            />
          </div>
          <div>
            <FieldLabel htmlFor="sd-end">{t("windowEnd")}</FieldLabel>
            <input
              id="sd-end"
              type="time"
              disabled={paraHoje}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground disabled:opacity-50"
            />
            {/* Duas explicações diferentes, e a distinção importa: hoje NÃO TEM hora (é fila), e num
                dia futuro sem fim declarado o servidor fecha a janela pela referência da etapa. */}
            <p className="mt-1 text-xs text-muted-foreground">
              {paraHoje ? t("windowTodayHint") : t("windowEndHint")}
            </p>
          </div>
        </form>
      )}
    </FormDialog>
  );
}
