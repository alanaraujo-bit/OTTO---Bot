import type { ReactNode } from 'react';

/**
 * Layout da Inbox.
 *
 * O painel dividido do desktop e a pilha de telas do celular são resolvidos nas
 * próprias páginas, com `md:`. Este layout existe para tirar a rolagem da página
 * e dar às colunas altura própria — sem isso, a lista e a conversa rolariam
 * juntas como um site, em vez de cada região rolar sozinha como em um aplicativo.
 */
export default function LayoutConversas({ children }: { children: ReactNode }) {
  return <div className="h-[100dvh] md:h-dvh">{children}</div>;
}
