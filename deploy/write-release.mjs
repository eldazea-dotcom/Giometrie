import { writeFileSync } from 'node:fs';
if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('GITHUB_SHA must identify the release commit.');
writeFileSync('dist/release.json', JSON.stringify({ commit: process.env.GITHUB_SHA, repository: process.env.GITHUB_REPOSITORY, builtAt: new Date().toISOString() }) + '\n');
