import type { SourceAdapter } from "./base";
import { createGenericSourceAdapter } from "./generic";
import { createXiaoyuzhouSourceAdapter } from "./xiaoyuzhou";

export type { ResolvedEpisode, SourceAdapter } from "./base";

export function createDefaultSourceAdapters(
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch
): SourceAdapter[] {
  return [createXiaoyuzhouSourceAdapter(fetchImpl), createGenericSourceAdapter(fetchImpl)];
}
