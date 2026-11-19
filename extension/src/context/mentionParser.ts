import type { ContextSignal } from '../../../shared/types';

export function parseMentions(text: string): { term: string; path?: string; signal: ContextSignal }[] {
  return [...text.matchAll(/@(?:file:|symbol:)?([^\s]+)/g)].map(match => {
    const raw = match[1];
    const isFile = match[0].includes('@file:');
    return { term: raw, path: isFile ? raw : undefined, signal: isFile ? 'explicit_mention' : 'symbol_match' };
  });
}
