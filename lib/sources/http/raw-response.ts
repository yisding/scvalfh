/**
 * One upstream HTTP response as the source clients return it (MaxPrepsClient.raw) and every pipeline
 * Transport hands it to a step (lib/pipeline/contract.ts `Transport.get`). It lives on the sources
 * side so that lib/sources never imports lib/pipeline: the pipeline codes against the sources'
 * shape, not the other way round.
 */
export interface RawResponse {
  url: string;
  httpStatus: number;
  body: string;
  upstreamModifiedOn?: string;
}
