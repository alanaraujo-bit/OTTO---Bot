import type { Metadata, Viewport } from 'next';
import { marca, ProvedorTema, scriptTema } from '@otto/ui';

import '@otto/ui/styles.css';

export const metadata: Metadata = {
  title: { default: marca.nome, template: `%s · ${marca.nome}` },
  description: marca.descricao,
  applicationName: marca.nome,
  appleWebApp: { capable: true, title: marca.nomeCurto, statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Sem `maximum-scale`: bloquear zoom para parecer aplicativo custa
  // acessibilidade, e o cliente pediu as duas coisas resolvidas.
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: marca.corTema.claro },
    { media: '(prefers-color-scheme: dark)', color: marca.corTema.escuro },
  ],
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Antes da primeira pintura: sem isto a tela pisca branca no escuro. */}
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="app-shell">
        <ProvedorTema>{children}</ProvedorTema>
      </body>
    </html>
  );
}
