import { UserRound } from 'lucide-react';

import { cn } from './cn.ts';

/**
 * O rosto de quem está do outro lado.
 *
 * ## Por que não é a foto do WhatsApp
 *
 * A Cloud API não entrega a foto de perfil do cliente. O webhook da Meta traz
 * `profile.name` e `wa_id`, e mais nada; os endpoints de imagem do Graph são do
 * perfil **da empresa**, não de quem escreve. Serviços que prometem a foto por
 * número operam por engenharia reversa do WhatsApp Web, fora dos termos — o
 * preço de usar um deles é o número ser banido.
 *
 * Então a foto entra por `foto`, quando existir uma que alguém tenha enviado
 * aqui dentro. Enquanto não existe, o avatar é de iniciais — e é feito para
 * parecer escolhido, não para parecer um espaço vazio esperando imagem.
 *
 * ## Por que a cor vem do identificador, e não do nome
 *
 * `contacts.nameSource` existe justamente porque um operador pode corrigir o
 * nome que veio do canal. Se a cor saísse do nome, corrigir "Jose" para "José
 * Carlos" trocaria a cor da pessoa — e cor é justamente o que faz reconhecer a
 * conversa de longe na lista. O identificador não muda nunca.
 *
 * A variação é de matiz apenas: claridade e croma vêm do tema, então todo
 * avatar tem o mesmo peso visual e o mesmo contraste, em claro e em escuro.
 * Seis matizes, e não um gerador contínuo, porque duas pessoas com cores quase
 * iguais é pior que duas pessoas com a mesma cor.
 */

export type TamanhoAvatar = 'sm' | 'md' | 'lg';

const TAMANHOS: Record<TamanhoAvatar, { caixa: string; texto: string; icone: string }> = {
  sm: { caixa: 'size-8', texto: 'text-xs', icone: 'size-4' },
  md: { caixa: 'size-9', texto: 'text-sm', icone: 'size-4' },
  lg: { caixa: 'size-11', texto: 'text-md', icone: 'size-5' },
};

/**
 * Matizes escolhidos à mão, afinados com o verde da marca e o neutro quente do
 * sistema. Nenhum deles cai no vermelho de falha nem no âmbar de atenção: cor
 * de avatar não pode ser lida como estado da conversa.
 */
const MATIZES = [172, 145, 95, 250, 300, 25];

/** Hash estável e curto. O valor não precisa ser criptográfico, só determinístico. */
function matizDe(semente: string): number {
  let h = 0;
  for (let i = 0; i < semente.length; i += 1) h = (h * 31 + semente.charCodeAt(i)) | 0;
  return MATIZES[Math.abs(h) % MATIZES.length]!;
}

/**
 * Iniciais como um humano leria: primeiro e último nome.
 *
 * Partículas ("de", "da", "dos") não contam — "Maria da Silva" é MS, não MD.
 * Um nome que é só número, que é o que sobra quando o cliente não tem nome de
 * perfil, não vira inicial nenhuma: dois dígitos não identificam ninguém.
 */
function iniciaisDe(nome: string | null | undefined): string | null {
  const limpo = nome?.trim();
  if (!limpo) return null;
  if (/^[\d\s()+-]+$/.test(limpo)) return null;

  const partes = limpo
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^(d[aeio]s?|e|von|van)$/i.test(p));

  const primeira = partes[0]?.[0];
  if (!primeira) return null;
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0] : null;

  return (primeira + (ultima ?? '')).toLocaleUpperCase('pt-BR');
}

export interface AvatarProps {
  /** Identificador estável do contato. É dele que sai a cor. */
  semente: string;
  nome?: string | null;
  /** Foto enviada por alguém da equipe. Nunca vem do WhatsApp. */
  foto?: string | null;
  tamanho?: TamanhoAvatar;
  /**
   * Destaca o avatar quando a conversa espera uma pessoa. Sobrepõe a cor
   * individual de propósito: nesse momento o estado importa mais que a
   * identidade, e é o mesmo âmbar do resto do produto.
   */
  aguardando?: boolean;
  className?: string;
}

export function Avatar({
  semente,
  nome,
  foto,
  tamanho = 'sm',
  aguardando = false,
  className,
}: AvatarProps) {
  const medidas = TAMANHOS[tamanho];
  const iniciais = iniciaisDe(nome);
  const matiz = matizDe(semente);

  const base = cn(
    'flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium',
    medidas.caixa,
    medidas.texto,
    className,
  );

  // O nome já está escrito ao lado em toda tela onde este avatar aparece; um
  // `alt` ou `aria-label` aqui faria o leitor de tela dizer a mesma coisa duas
  // vezes seguidas.
  if (foto) {
    return (
      <span aria-hidden className={cn(base, 'bg-superficie-3')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} alt="" className="size-full object-cover" />
      </span>
    );
  }

  if (aguardando) {
    return (
      <span aria-hidden className={cn(base, 'bg-atencao-suave text-atencao')}>
        {iniciais ?? <UserRound strokeWidth={1.5} className={medidas.icone} />}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={base}
      style={{
        backgroundColor: `oklch(var(--avatar-fundo) ${matiz})`,
        color: `oklch(var(--avatar-tinta) ${matiz})`,
      }}
    >
      {iniciais ?? <UserRound strokeWidth={1.5} className={medidas.icone} />}
    </span>
  );
}
