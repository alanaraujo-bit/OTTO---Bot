import { redirect } from 'next/navigation';

export default function Raiz() {
  // A autenticação decide para onde ir. Enquanto ela não existe, a entrada é a
  // própria tela de acesso.
  redirect('/entrar');
}
