import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
for (const file of ['index.html', 'account.html', 'account.js', 'account.css', 'watches.js']) {
  await copyFile(file, `public/${file}`);
}
console.log('Built public website assets.');
