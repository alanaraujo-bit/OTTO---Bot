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

export {
  interpretarEventoMeta,
  lerEventoWebhook,
  type PayloadMeta,
  type ResultadoEntrada,
} from './entrada-meta.ts';

export { ehViolacaoDeUnicidade } from './conflito.ts';

export {
  marcarContatoComoEnsaio,
  marcarConversaComoEnsaio,
  type ReclassificacaoDoHistorico,
} from './ensaio.ts';
