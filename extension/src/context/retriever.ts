import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContextItem, ContextReceipt } from '../../../shared/types';
import { scanFiles } from './fileScanner';
import { parseMentions } from './mentionParser';
import { rankItems } from './ranker';

export async function assembleContext(query: string, workspaceRoot: string, budget: number):
  Promise<{ items: ContextItem[]; receipt: ContextReceipt }> {
  const terms = parseMentions(query).map(item => item.term);
  const words = [...new Set(query.toLowerCase().split(/\W+/).filter(word => word.length > 2))];
  const paths = await scanFiles(workspaceRoot);
  const items: ContextItem[] = [];
  for (const absPath of paths) {
    if (!/\.(ts|tsx|js|jsx|py|json|md|css|html)$/.test(absPath)) continue;
    let content = '';
    try { content = fs.readFileSync(absPath, 'utf8'); } catch { continue; }
    const lower = content.toLowerCase();
    const rel = path.relative(workspaceRoot, absPath);
    const mention = parseMentions(query).find(item => item.path && rel.replace(/\\/g, '/').endsWith(item.path));
    const matches = words.filter(word => lower.includes(word) || rel.toLowerCase().includes(word));
    if (!mention && matches.length === 0) continue;
    const score = Math.min(100, (mention ? 60 : 0) + matches.length * 10);
    const excerpt = content.split(/\r?\n/).slice(0, 200).join('\n');
    items.push({
      path: rel,
      absPath,
      startLine: 0,
      endLine: Math.min(199, excerpt.split('\n').length - 1),
      content: excerpt,
      signals: mention ? ['explicit_mention'] : ['keyword_match'],
      score,
      tokenEstimate: Math.ceil(excerpt.length / 4),
    });
  }
  const selected = rankItems(items, budget);
  return {
    items: selected,
    receipt: {
      items: selected,
      excluded: items.length - selected.length,
      totalTokens: selected.reduce((sum, item) => sum + item.tokenEstimate, 0),
      budget,
      queryTerms: [...terms, ...words],
      assembledAt: Date.now(),
    },
  };
}
