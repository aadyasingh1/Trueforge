import type { ContextItem } from '../../../shared/types';
import { rankItems } from '../../src/context/ranker';

test('honors token budget', () => {
  const item = (score: number, tokenEstimate: number): ContextItem =>
    ({ path: '', absPath: '', startLine: 0, endLine: 0, content: '', signals: ['keyword_match'], score, tokenEstimate });
  expect(rankItems([item(10, 600), item(90, 300)], 500).map(value => value.score)).toEqual([90]);
});
