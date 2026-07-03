import Link from "next/link";
import {
  listDeliverablePurposes,
  createDeliverablePurpose,
  toggleDeliverablePurpose,
} from "@/lib/actions/deliverable-purpose";

export default async function DeliverablePurposesPage() {
  const purposes = await listDeliverablePurposes();

  return (
    <div className="container mx-auto p-8">
      <Link
        href="/admin"
        className="inline-flex items-center text-primary hover:text-primary/80 mb-6 font-semibold transition-colors"
      >
        <svg
          className="w-5 h-5 mr-2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="M15 19l-7-7 7-7" />
        </svg>
        Admin
      </Link>

      <h1 className="text-3xl font-bold text-foreground mb-2">Propósitos de entregável</h1>
      <p className="text-muted-foreground mb-6">
        Tags que compõem o nome do arquivo no NAS (ex.: Banner Web, Vídeo, Painel LED). Desativar
        mantém o histórico, mas remove das opções de novos uploads.
      </p>

      {/* Create */}
      <form
        action={createDeliverablePurpose}
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <input
          type="text"
          name="label"
          required
          placeholder="Novo propósito (ex.: Banner Web)"
          className="h-11 flex-1 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all"
        />
        <button
          type="submit"
          className="h-11 rounded-lg bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
        >
          Adicionar
        </button>
      </form>

      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Rótulo
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Slug
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {purposes.map((p) => (
              <tr
                key={p.id}
                className={`hover:bg-accent transition-colors ${p.active ? "" : "opacity-60"}`}
              >
                <td className="px-6 py-4 text-sm font-semibold text-foreground">{p.label}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{p.slug}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                      p.active
                        ? "bg-green-100 text-green-800 border-green-200"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {p.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <form action={toggleDeliverablePurpose} className="inline">
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {p.active ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {purposes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  Nenhum propósito cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
