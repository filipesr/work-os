/** Descrição do projeto em destaque dentro da demanda.
 *
 *  Quem executa uma etapa vê a tarefa, não o projeto: sem este bloco, o contexto
 *  que explica PARA QUE a demanda existe fica a dois cliques de distância, numa
 *  tela (/admin/projects/[id]) que o executor muitas vezes nem abre. Repetir o
 *  texto aqui é deliberado — é mais barato que a decisão tomada sem ele.
 *
 *  Sem hooks de propósito: assim serve tanto à página de admin (Server
 *  Component) quanto ao TaskDetailView (Client), sem duas versões do mesmo
 *  bloco. Os rótulos chegam já traduzidos por quem renderiza.
 */
export function ProjectContextNote({
  label,
  projectName,
  description,
}: {
  label: string;
  projectName: string;
  description: string | null;
}) {
  if (!description) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p className="mb-1 text-xs font-semibold text-primary">
        {label} · {projectName}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{description}</p>
    </div>
  );
}
