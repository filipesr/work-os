/**
 * Layout do wallboard: tela cheia, **sem navegação**, tema escuro forçado.
 *
 * A classe `dark` é fixa em vez de seguir a preferência do usuário: um monitor
 * de parede não tem usuário para preferir nada, e um mural claro num corredor
 * escuro ofusca. Fixar aqui também faz os tokens semânticos (`bg-card`,
 * `text-foreground`) resolverem para os valores escuros, então o `PresenceCard`
 * compartilhado funciona nas duas telas sem estilo condicional.
 */
export default function TVLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark min-h-screen bg-background text-foreground">{children}</div>;
}
