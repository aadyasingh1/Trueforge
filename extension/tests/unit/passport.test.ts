import { assessFile, definedSymbols, passportToMarkdown } from '../../src/review/passport';
import type { PendingChange } from '../../../shared/types';

function change(path: string, original: string, proposed: string, hunkLines: Array<['add' | 'remove' | 'context', string]>): PendingChange {
  return {
    id: 'c1', path, absPath: '/ws/' + path, originalExists: original !== '', originalContent: original, originalHash: 'x',
    proposedContent: proposed, reason: 'test', fileDecision: null,
    hunks: [{ id: 'h1', changeId: 'c1', header: '@@', originalStart: 1, originalCount: 1, proposedStart: 1, proposedCount: 1, accepted: null,
      lines: hunkLines.map(([type, content]) => ({ type, content })) }],
  };
}

describe('Change Passport', () => {
  it('flags a mass deletion of a changelog as high risk', () => {
    const original = Array.from({ length: 1600 }, (_, i) => `line ${i}`).join('\n');
    const removed = Array.from({ length: 1590 }, (_, i) => ['remove', `line ${i}`] as ['remove', string]);
    const file = assessFile(change('CHANGES.rst', original, 'short', removed));
    expect(file.risk).toBe('high');
    expect(file.flags.map(flag => flag.code)).toEqual(expect.arrayContaining(['mass-deletion', 'changelog']));
  });

  it('flags hard-coded secrets', () => {
    const file = assessFile(change('app.py', 'x = 1\n', 'x = 1\nAPI_KEY = "abcd1234efgh5678"\n', [['add', 'API_KEY = "abcd1234efgh5678"']]));
    expect(file.flags.some(flag => flag.code === 'possible-secret')).toBe(true);
  });

  it('keeps a normal feature change low risk and lists new symbols', () => {
    const file = assessFile(change('src/flask/cli.py', 'a\nb\n', 'a\nb\ndef config_command():\n', [['add', '@click.command("config")'], ['add', 'def config_command() -> None:']]));
    expect(file.risk).toBe('low');
    expect(file.symbols).toEqual(['config_command']);
  });

  it('recognises test files and renders Markdown', () => {
    const file = assessFile(change('tests/test_cli.py', 'a\n', 'a\nb\n', [['add', 'def test_config_command(app):']]));
    expect(file.isTest).toBe(true);
    const md = passportToMarkdown({ createdAt: 0, files: [file], totals: { files: 1, added: 1, removed: 0, dependents: 0, flags: 0 }, testsTouched: true, risk: 'low',
      verification: { passed: true, command: 'python -m pytest -q', summary: '60 passed', fixRounds: 1 } });
    expect(md).toContain('Change Passport');
    expect(md).toContain('after 1 automatic fix round');
  });

  it('finds defined symbols', () => {
    expect(definedSymbols(['def a():', 'class B:', 'export const c = (x) => x', 'x = 1'])).toEqual(['a', 'B', 'c']);
  });
});
