export {
  receberMensagem,
  type MensagemRecebida,
  type ResultadoIngestao,
} from './ingestao.ts';

export {
  atenderAutomaticamente,
  encaminharParaHumano,
  type MotivoHandoff,
  type ResultadoAtendimento,
} from './atendimento.ts';

export {
  contarConversas,
  detalharConversa,
  listarConversas,
  marcarComoLida,
  type ContagemInbox,
  type DetalheConversa,
  type FiltrosInbox,
  type FiltroStatus,
  type ItemInbox,
  type MensagemDaConversa,
} from './consultas.ts';

export {
  alterarModo,
  assumirConversa,
  devolverParaIA,
  novaChaveDeEnvio,
  resolverConversa,
  responderComoOperador,
} from './acoes.ts';

export { ehViolacaoDeUnicidade } from './conflito.ts';
