'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Mantém a tela em dia sem ninguém apertar F5.
 *
 * O desenho tem uma decisão central: quando chega um aviso, este componente
 * **relê do servidor** (`router.refresh()`) em vez de aplicar a mudança no
 * cliente.
 *
 * Aplicar no cliente exigiria reimplementar, em JavaScript, cada regra que a
 * página já resolve no servidor — o contador por status, a ordem da lista, o
 * texto de prévia, quem está atribuído, o rótulo de tempo. Duas implementações
 * da mesma regra divergem, e a que o operador vê seria a errada. Relendo, a
 * fonte de verdade continua sendo o banco, e **tudo** que a página mostra se
 * atualiza junto: lista, prévia, contadores, estados, horários, ticks de
 * entrega, modo IA/humano e atribuição.
 *
 * `router.refresh()` refaz os Server Components e reconcilia o DOM sem perder
 * estado local — o que estiver digitado na caixa de resposta continua lá, e a
 * rolagem não salta.
 *
 * Também **não** é polling: nada é pedido enquanto nada acontece. O pedido sai
 * porque o servidor avisou.
 */

/** Junta avisos próximos numa releitura só. */
const AGRUPAMENTO_MS = 250;

export function AoVivo({ empresaSlug }: { empresaSlug: string }) {
  const router = useRouter();
  const agendado = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fonte = new EventSource(`/api/stream/${encodeURIComponent(empresaSlug)}`);

    // Uma rajada — mensagem recebida, resposta gravada, status de envio — chega
    // como vários avisos em poucos milissegundos. Sem agrupar, seriam três
    // releituras para mostrar o mesmo resultado final.
    const relerEmBreve = () => {
      if (agendado.current) clearTimeout(agendado.current);
      agendado.current = setTimeout(() => router.refresh(), AGRUPAMENTO_MS);
    };

    fonte.addEventListener('message', relerEmBreve);

    // Reconexão: o navegador refaz o EventSource sozinho, respeitando o `retry`
    // que o servidor mandou. O que ele **não** faz é recuperar o que passou
    // enquanto esteve fora — e é por isso que reler ao (re)conectar importa:
    // uma releitura devolve o estado atual inteiro, sem precisar de histórico
    // de eventos nem de F5.
    fonte.addEventListener('conectado', relerEmBreve);

    fonte.addEventListener('error', () => {
      // `EventSource` já reconecta sozinho; registrar aqui só faria ruído numa
      // troca de rede. Quando voltar, o evento `conectado` dispara a releitura.
    });

    return () => {
      if (agendado.current) clearTimeout(agendado.current);
      fonte.close();
    };
  }, [empresaSlug, router]);

  return null;
}
