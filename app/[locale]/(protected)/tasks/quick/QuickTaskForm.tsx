"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Check, Repeat } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { createQuickTask } from "@/lib/actions/quick-task";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { formatISODate, todayInSaoPaulo } from "@/lib/dates";
import { QUICK_TASK_MAX_BACKDATE_DAYS } from "@/lib/quick-task";

type Template = { id: string; name: string };
type Project = { id: string; name: string; client: { name: string } };

/** Formulário de registro rápido, pensado para o celular: poucos campos, um polegar.
 *
 *  "Salvar e repetir" existe para o caso real de cinco stories do mesmo cliente no mesmo dia —
 *  mantém tipo, cliente/projeto, data, tempo e descrição, e limpa só o que é individual de cada
 *  registro (título e link). Sem isso, a quinta vez teria a mesma fricção da primeira, que é o que
 *  esta tela existe para eliminar. */
export function QuickTaskForm({
  templates,
  projects,
}: {
  templates: Template[];
  projects: Project[];
}) {
  const t = useTranslations("tasks.quick");
  const router = useRouter();

  // Não usar `toISOString()` (UTC puro): o app opera em horário de São Paulo, e das 21h às
  // 23h59 de SP o relógio UTC já virou o dia seguinte — justo no fim do expediente, quando
  // mais se registra o dia. `todayInSaoPaulo` é a mesma fonte que a Server Action usa para
  // validar `date`, então cliente e servidor nunca discordam sobre o que é "hoje".
  const hoje = formatISODate(todayInSaoPaulo());
  // Mesma janela que `validateQuickTaskDate` (lib/quick-task.ts) aplica no servidor: hoje e mais
  // sete dias-calendário anteriores. Sem o `min`, o calendário deixa escolher qualquer data antiga
  // e a pessoa só descobre a regra depois de preencher tudo e enviar — o erro que a spec proíbe.
  const minData = formatISODate(
    new Date(todayInSaoPaulo().getTime() - QUICK_TASK_MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000)
  );
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(hoje);
  const [minutes, setMinutes] = useState("");
  const [description, setDescription] = useState("");
  // Individuais de cada registro: limpos pelo "salvar e repetir".
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  // Ref, não state: o clique no botão precisa marcar a intenção ANTES de o submit do form disparar,
  // e um setState não teria efeito a tempo dentro do mesmo ciclo de evento.
  const repetirRef = useRef(false);

  const tipo = templates.find((x) => x.id === templateId)?.name ?? "";
  const projeto = projects.find((p) => p.id === projectId);
  // Título sugerido: ninguém precisa inventar nome para o quinto story do dia.
  const tituloSugerido =
    tipo && projeto
      ? `${tipo} · ${projeto.client.name} · ${date.slice(8, 10)}/${date.slice(5, 7)}`
      : "";

  // A mensagem depende de qual botão foi clicado, então o toast sai aqui e não pelo
  // `successMessage` do hook — que é lido na renderização e não enxergaria a ref.
  const { run, isPending } = useServerAction(createQuickTask, {
    onSuccess: () => {
      if (repetirRef.current) {
        toast.success(t("savedKeepGoing"));
        // Limpa só o que é individual de cada registro; tipo, projeto, data, tempo e descrição
        // ficam, que é o ponto do "salvar e repetir".
        setTitle("");
        setLink("");
      } else {
        toast.success(t("saved"));
        router.push("/dashboard");
      }
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("title", title || tituloSugerido);
    run(fd);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <FieldLabel htmlFor="templateId" required>
          {t("type")}
        </FieldLabel>
        <select
          id="templateId"
          name="templateId"
          required
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="h-11 w-full rounded-md border border-input-border bg-input px-3 text-base text-foreground"
        >
          <option value="">{t("typePlaceholder")}</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel htmlFor="projectId" required>
          {t("project")}
        </FieldLabel>
        <select
          id="projectId"
          name="projectId"
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-11 w-full rounded-md border border-input-border bg-input px-3 text-base text-foreground"
        >
          <option value="">{t("projectPlaceholder")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.client.name} — {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="date" required>
            {t("date")}
          </FieldLabel>
          <Input
            id="date"
            name="date"
            type="date"
            required
            value={date}
            max={hoje}
            min={minData}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="minutes" required>
            {t("minutes")}
          </FieldLabel>
          <Input
            id="minutes"
            name="minutes"
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="title">{t("titleField")}</FieldLabel>
        <Input
          id="title"
          name="title"
          value={title}
          placeholder={tituloSugerido}
          onChange={(e) => setTitle(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("titleHint")}</p>
      </div>

      <div>
        <FieldLabel htmlFor="link">{t("link")}</FieldLabel>
        <Input
          id="link"
          name="link"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("linkHint")}</p>
      </div>

      <div>
        <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
        <Textarea
          id="description"
          name="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Os DOIS botões de submit são `type="submit"` do MESMO form. O onClick só marca a intenção
          antes de o submit disparar — assim o `e.currentTarget` do onSubmit é sempre o form, e a
          validação nativa do navegador vale para os dois caminhos. */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="submit"
          disabled={isPending}
          onClick={() => (repetirRef.current = false)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("save")}
        </button>
        <button
          type="submit"
          disabled={isPending}
          onClick={() => (repetirRef.current = true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 font-semibold text-foreground disabled:opacity-50"
        >
          <Repeat className="h-4 w-4" />
          {t("saveAndRepeat")}
        </button>
      </div>
      {/* Saída, não ação principal: por isso `type="button"` (fora do fluxo de submit dos outros
          dois) e visualmente mais discreto, sem fundo nem borda. */}
      <button
        type="button"
        disabled={isPending}
        onClick={() => router.push("/dashboard")}
        className="w-full py-2 text-center text-sm font-medium text-muted-foreground disabled:opacity-50"
      >
        {t("cancel")}
      </button>
    </form>
  );
}
