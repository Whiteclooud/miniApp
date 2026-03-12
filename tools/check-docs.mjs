import { access } from 'node:fs/promises';

const required = [
  'docs/PRD.md',
  'docs/ARCHITECTURE.md',
  'docs/API.md',
  'docs/TASKS.md',
  'docs/ENV.md',
  'docs/WORKFLOW.md'
];

for (const file of required) {
  try {
    await access(new URL(`../${file}`, import.meta.url));
    console.log(`ok ${file}`);
  } catch (error) {
    console.error(`missing ${file}`);
    process.exitCode = 1;
  }
}
