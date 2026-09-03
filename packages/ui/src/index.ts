export { cn } from './cn.ts';
export { formatarTelefone } from './formato.ts';
export { marca, type Marca } from './brand.ts';
export { Botao, type BotaoProps } from './botao.tsx';
export { Campo, type CampoProps } from './campo.tsx';
export { Cartao, type CartaoProps } from './cartao.tsx';
export { Etiqueta, type EtiquetaProps } from './etiqueta.tsx';
export { Esqueleto } from './esqueleto.tsx';
export { Anel } from './anel.tsx';
export { Vazio, type VazioProps } from './vazio.tsx';
export { ProvedorTema, SeletorTema, useTema, scriptTema, type Tema } from './tema.tsx';

// Reexportado para que componentes de interface não importem @otto/shared direto:
// a camada visual fala com uma dependência só.
export { tempoRelativo, minutosParaHora } from '@otto/shared';
