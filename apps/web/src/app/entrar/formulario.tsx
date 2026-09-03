'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Botao, Campo } from '@otto/ui';

/**
 * Formulário de acesso.
 *
 * A autenticação de verdade é a próxima fase. Aqui o formulário já é real —
 * validação, estados, acessibilidade — e o envio ainda não tem para onde ir;
 * por isso ele diz exatamente isso em vez de fingir que entrou. Nada neste
 * produto pode fingir funcionar.
 */
export function FormularioEntrada() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    // Sem endpoint ainda. Assim que a sessão existir, esta chamada substitui a
    // espera — o resto do formulário permanece como está.
    await new Promise((r) => setTimeout(r, 600));

    setEnviando(false);
    setErro('A autenticação ainda não está disponível. Esta tela é a próxima etapa da construção.');
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-4">
      <Campo
        rotulo="E-mail"
        type="email"
        name="email"
        required
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        inputMode="email"
        placeholder="voce@empresa.com.br"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <Campo
        rotulo="Senha"
        type={verSenha ? 'text' : 'password'}
        name="senha"
        required
        autoComplete="current-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        acessorio={
          <Botao
            variante="sutil"
            tamanho="sm"
            aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
            onClick={() => setVerSenha((v) => !v)}
            // No celular ocupa a altura inteira do campo: um alvo de 36 px dentro
            // de um campo de 44 px erra com o polegar.
            className="size-7 px-0 max-md:h-10 max-md:w-10"
            icone={verSenha ? <EyeOff strokeWidth={1.5} /> : <Eye strokeWidth={1.5} />}
          />
        }
      />

      {erro && (
        <p
          role="alert"
          className="rounded-sm border border-linha-firme bg-atencao-suave px-3 py-2 text-xs text-atencao"
        >
          {erro}
        </p>
      )}

      <Botao
        type="submit"
        variante="primaria"
        larguraTotal
        carregando={enviando}
        disabled={!email || !senha}
        className="mt-1"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </Botao>
    </form>
  );
}
