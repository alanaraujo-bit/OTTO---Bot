'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Botao, Campo } from '@otto/ui';

import { acaoEntrar, type EstadoEntrada } from './acoes.ts';

/**
 * Formulário de acesso.
 *
 * O botão lê `useFormStatus`, e não um estado próprio: assim ele acompanha o
 * envio real da server action em vez de um cronômetro que pode dessincronizar.
 */

function BotaoEntrar() {
  const { pending } = useFormStatus();

  // Sem `disabled`: um botão apagado na tela de entrada parece quebrado. A
  // validação acontece na server action e volta como mensagem amigável.
  return (
    <Botao type="submit" variante="primaria" larguraTotal carregando={pending} className="mt-1">
      {pending ? 'Entrando…' : 'Entrar'}
    </Botao>
  );
}

export function FormularioEntrada({ proximo }: { proximo?: string }) {
  const [estado, agir] = useActionState<EstadoEntrada, FormData>(acaoEntrar, {});
  const [email, setEmail] = useState(estado.email ?? '');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);

  return (
    <form action={agir} noValidate className="grid gap-4">
      {proximo && <input type="hidden" name="proximo" value={proximo} />}

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
            // No celular ocupa quase a altura inteira do campo: um alvo de 36 px
            // dentro de um campo de 44 px erra com o polegar.
            className="size-7 px-0 max-md:h-10 max-md:w-10"
            icone={verSenha ? <EyeOff strokeWidth={1.5} /> : <Eye strokeWidth={1.5} />}
          />
        }
      />

      {estado.erro && (
        <p
          role="alert"
          className="rounded-sm border border-falha/25 bg-falha-suave px-3 py-2 text-xs text-falha"
        >
          {estado.erro}
        </p>
      )}

      <BotaoEntrar />
    </form>
  );
}
