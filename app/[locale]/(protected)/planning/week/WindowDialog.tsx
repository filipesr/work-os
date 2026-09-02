"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Clock } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  setStageWindow,
  listWindowCandidates,
  scheduleStage,
  type WindowOverlap,
} from "@/lib/actions/week-planning";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { formatDisplayTime } from "@/lib/dates";

/** Marca (ou desmarca) o compromisso fixo de uma etapa já programada — o studio às 14h que a
 *  grade não sabe representar como número de horas.
 *
 *  `setStageWindow` é a mesma porta para os dois casos: marcar manda `startTime`, desmarcar manda
 *  `startTime: null`. Dois `useServerAction` sobre a mesma action, não um só, porque cada caminho
 *  fecha com um toast diferente — "marcado" e "desmarcado" não são a mesma frase. */
export function WindowDialog({
  activeStageId,
  label,
  startTime,
  endTime,
  dayISO,
}: {
  activeStageId: string;
  label: string;
  /** "14:00" no relógio de São Paulo, ou nula se a etapa não tem compromisso. */
  startTime: string | null;
  endTime: string | null;
  /** O dia da coluna — `scheduleStage` exige a data, e as duas trocas de colaborador reprogramam
   *  para o MESMO dia (só a pessoa muda; a hora combinada viaja junto ou é reenviada). */
  dayISO: string;
}) {
  const t = useTranslations("planning.week");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startTime ?? "");
  const [end, setEnd] = useState(endTime ?? "");
  // Quando `setStageWindow` recusa gravar, o painel de saídas (adiar/remarcar/cancelar) mora
  // aqui — não é erro, então `useServerAction` chama `onSuccess` do mesmo jeito, e é o
  // componente que precisa reconhecer a forma `{ overlap }` e desviar da UI de sucesso.
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

  // O estado local é rascunho de edição; a verdade é a prop, e reabrir tem de recomeçar dela. O
  // `<li>` da célula é estável entre um "Desmarcar" e o `router.refresh()` que o segue — React
  // reaproveita esta mesma instância, então sem isto o formulário reabriria mostrando um
  // compromisso que o servidor já apagou, e um submit desatento o recriaria. Também cobre quem
  // mexeu na hora com o diálogo fechado. O painel de sobreposição é rascunho da mesma forma:
  // reabrir (ou fechar por "Cancelar") tem de recomeçar limpo, senão a próxima abertura ficaria
  // presa na tela de conflito de uma tentativa anterior.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setStart(startTime ?? "");
      setEnd(endTime ?? "");
    }
    setOverlap(null);
    setPicker(null);
    setOpen(next);
  };

  const fecharEAtualizar = () => {
    setOpen(false);
    router.refresh();
  };

  const marcar = useServerAction(setStageWindow, {
    onSuccess: (result) => {
      // `useServerAction` só enxerga `{ error }` como falha — um `{ overlap }` chega aqui como
      // "sucesso" porque o servidor não quebrou, só se recusou a escrever por cima de outro
      // compromisso. Por isso o toast de "marcado" fica condicional: ele só cabe quando algo de
      // fato foi marcado, e mostrá-lo junto do painel de conflito enganaria o gestor.
      if (result && typeof result === "object" && "overlap" in result) {
        setOverlap((result as { overlap: WindowOverlap }).overlap);
        return;
      }
      toast.success(t("windowSet_toast"));
      fecharEAtualizar();
    },
  });
  const desmarcar = useServerAction(setStageWindow, {
    successMessage: t("windowCleared_toast"),
    onSuccess: fecharEAtualizar,
  });
  // Reenvia a MESMA ocupante (índice fixo — só existe quando `occupants.length === 1`) com o
  // horário que o servidor já calculou; ao terminar, reenvia a janela nova pedida — mesmo
  // caminho de `marcar`, que decide sozinho entre fechar ou mostrar um novo conflito. O reenvio
  // não checa se ESTE resultado também veio com `{ overlap }` porque o servidor recalcula o
  // horário livre contra TODAS as outras faixas ocupadas do dia antes de responder — um novo
  // conflito aqui só aconteceria se outra faixa tivesse mudado entre o adiamento e este envio, e
  // `setStageWindow` nunca grava por cima de uma colisão, então o pior caso é um novo painel de
  // conflito, nunca um horário incorreto persistido.
  const adiarOcupante = useServerAction(setStageWindow, {
    onSuccess: () => marcar.run({ activeStageId, startTime: start, endTime: end || null }),
  });
  // Move a OCUPANTE para outra pessoa, no mesmo dia — a hora combinada viaja junto porque
  // `scheduleStage` preserva a janela quando só o dono muda. Sem reenvio de `setStageWindow`.
  const moverOcupante = useServerAction(scheduleStage, {
    onSuccess: () => {
      setPicker(null);
      fecharEAtualizar();
    },
  });
  // Move a NOVA para outra pessoa primeiro (ela ainda não tem hora — foi por isso que caiu aqui),
  // e só então reenvia a janela pedida — mesmo caminho de `marcar`, que decide sozinho entre
  // fechar ou mostrar um novo conflito (agora contra a agenda do novo dono).
  const moverNova = useServerAction(scheduleStage, {
    onSuccess: () => {
      setPicker(null);
      marcar.run({ activeStageId, startTime: start, endTime: end || null });
    },
  });
  // `useServerAction` não serve aqui — `listWindowCandidates` não devolve `{ error } | { success }`,
  // devolve a lista em si. Mas é o mesmo tipo de trabalho assíncrono disparado por clique que o
  // resto do arquivo passa por `startTransition` (via `useServerAction`), e `isChoosingPending`
  // entra no `isPending` geral pelo mesmo motivo que os outros: desabilitar os botões enquanto a
  // busca está em voo.
  const [isChoosingPending, startChoosing] = useTransition();
  const isPending =
    marcar.isPending ||
    desmarcar.isPending ||
    adiarOcupante.isPending ||
    moverOcupante.isPending ||
    moverNova.isPending ||
    isChoosingPending;

  // Adiar e mover-a-ocupante trocam um compromisso ALHEIO de lugar — decisão que o gestor toma
  // UMA ocupante por vez. Com dois ou mais no caminho, "a ocupante" fica ambíguo (`firstFreeStartISO`
  // também é dimensionado só para o caso de um único ocupante), e oferecer os botões aqui empurraria
  // uma decisão em cadeia sem o gestor escolher cada uma. Mover a NOVA não tem essa restrição: ela
  // não toca em nenhum compromisso de terceiros, só muda de dono antes de pedir hora de novo.
  const umaOcupanteAutorizada =
    overlap !== null && overlap.canOverride && overlap.occupants.length === 1;

  const escolherPessoa = (alvoActiveStageId: string, isNew: boolean) => {
    startChoosing(async () => {
      // A NOVA manda a faixa DO FORMULÁRIO, explícita. Ela não tem janela gravada — a escrita dela
      // acabou de ser recusada pela colisão, que é o motivo de este painel existir —, então pedir
      // ao servidor que a infira do banco devolvia "etapa não encontrada" e matava a saída. E
      // mesmo quando ela TEM hora velha gravada, quem vale é a que o gestor acabou de digitar.
      //
      // A OCUPANTE não manda faixa: ela viaja com a hora que já tem (`scheduleStage` preserva a
      // janela na troca de dono dentro do mesmo dia), e é contra ESSA faixa que o servidor checa a
      // agenda do destino. Mandar a hora do formulário — que é de outra demanda — listaria como
      // livre alguém que `scheduleStage` recusaria logo depois, sem o gestor entender por quê.
      const result = isNew
        ? await listWindowCandidates(alvoActiveStageId, {
            startTime: start,
            endTime: end || null,
          })
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
        <Button type="button" variant="outline" size="sm" aria-label={t("windowOpen")}>
          <Clock className="h-3.5 w-3.5" />
        </Button>
      }
      title={overlap ? t("overlapTitle") : t("windowTitle")}
      description={label}
      formId="window-form"
      submitLabel={t("windowSubmit")}
      isPending={isPending}
      footer={
        overlap ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
            >
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
                  // A duração DECLARADA viaja junto: um compromisso combinado de 14h às 18h adiado
                  // para as 17h termina às 21h, não em "17h + referência da etapa". Mandar
                  // `endTime: null` fazia o servidor refazer o fim pela referência e o sistema
                  // encurtava sozinho uma locação que alguém combinou com o estúdio.
                  //
                  // Quem NÃO declarou fim continua sem fim (`endDeclared: false`): ali `endISO` é
                  // só a borda derivada da referência, e reenviá-la inventaria um combinado que
                  // ninguém fez — a faixa dele deve seguir deslizando com a referência.
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
            {/* Sempre disponível — mover a NOVA não pede autoridade sobre a ocupante, só troca de
                dono e pede a hora de novo. */}
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
          {picker && (
            <div className="space-y-2 border-t border-border pt-3">
              {/* Igual ao `dialogNoOneInTeam` do `ScheduleDialog`: um `<select>` só com opções
                  desabilitadas é um beco sem aviso — o botão fica preso em `disabled` para sempre
                  e nada explica por quê. Mostra a saída real (outro horário, ou adiar) em vez de
                  deixar o gestor decifrar um formulário morto. */}
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
                    dateISO: dayISO,
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
          id="window-form"
          data-testid="window-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            marcar.run({ activeStageId, startTime: start, endTime: end || null });
          }}
        >
          <div>
            <FieldLabel htmlFor="wd-start" required>
              {t("windowStart")}
            </FieldLabel>
            <input
              id="wd-start"
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
            />
          </div>
          <div>
            <FieldLabel htmlFor="wd-end">{t("windowEnd")}</FieldLabel>
            <input
              id="wd-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
            />
            {/* Sem o fim, a etapa não fica sem duração: o servidor fecha a janela pela referência
                dela. Quem olha o formulário precisa saber disso antes de deixar o campo em branco. */}
            <p className="mt-1 text-xs text-muted-foreground">{t("windowEndHint")}</p>
          </div>
          {/* Só existe o que desmarcar quando já há um compromisso — a prop original, não o estado
              do formulário, porque é o servidor que decide se há algo para limpar. */}
          {startTime !== null && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => desmarcar.run({ activeStageId, startTime: null })}
            >
              {t("windowClear")}
            </Button>
          )}
        </form>
      )}
    </FormDialog>
  );
}
