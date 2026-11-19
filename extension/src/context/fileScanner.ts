import * as path from 'node:path';
import fg from 'fast-glob';

export async function scanFiles(root: string): Promise<string[]> {
  return (await fg(['**/*'], {
    cwd: root,
    onlyFiles: true,
    dot: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/out/**'],
  })).map(file => path.resolve(root, file));
}
