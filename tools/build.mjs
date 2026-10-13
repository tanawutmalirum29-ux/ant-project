import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');

try {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(join(root, 'index.html'), join(output, 'index.html'));
  await cp(join(root, 'src'), join(output, 'src'), { recursive: true });
  await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true });

  const html = await readFile(join(output, 'index.html'), 'utf8');
  const assetUrls = [...html.matchAll(/\b(?:src|href)=["'](\.\/[^"'?#]+)(?:[?#][^"']*)?["']/g)]
    .map((match) => match[1]);

  for (const asset of ['src/main.js', 'src/styles.css', ...assetUrls]) {
    const path = join(output, asset);
    if (!(await stat(path)).isFile()) {
      throw new Error('Not a file: ' + asset);
    }
  }

  const entries = (await readdir(output)).sort();
  if (entries.join(',') !== 'assets,index.html,src') {
    throw new Error('Unexpected deploy entries: ' + entries.join(', '));
  }

  console.log('Built static website in dist/ (' + new Set(assetUrls).size + ' referenced assets verified).');
} catch (error) {
  console.error('Static build failed:', error);
  process.exitCode = 1;
}
