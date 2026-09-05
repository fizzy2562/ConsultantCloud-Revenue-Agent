#!/usr/bin/env node
/**
 * Delegate a build task to a local model on the AI box.
 *
 *   node scripts/qwen.mjs --task tasks/foo.md --out path/to/file --model qwen3.8:27b
 *
 * Reads a task brief (markdown), sends it to Ollama, writes the returned file
 * verbatim. Keeps generation on local hardware; verification stays with the caller.
 */
import { readFile, writeFile } from 'node:fs/promises';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const url = (process.env.ORG_ADVISOR_LLM_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const model = arg('model', 'qwen3.8:27b');
const taskPath = arg('task');
const outPath = arg('out');
const numPredict = Number(arg('tokens', '4096'));

if (!taskPath) {
  console.error('Usage: node scripts/qwen.mjs --task <brief.md> [--out <file>] [--model m] [--tokens n]');
  process.exit(1);
}

const brief = await readFile(taskPath, 'utf8');

const system = `You are a senior engineer contributing to an existing codebase.

Output ONLY the file contents requested. No prose, no explanation, no markdown code fences.
Match the conventions, naming, and formatting shown in the brief exactly.
Do not invent APIs, class names, CSS variables, or files that the brief does not mention.
If the brief gives existing code to extend, preserve it byte-for-byte and add to it.`;

const started = Date.now();
process.stderr.write(`→ ${model} working on ${taskPath}\n`);

const response = await fetch(`${url}/api/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model,
    stream: false,
    think: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: brief }
    ],
    options: { temperature: 0.15, top_p: 0.9, num_predict: numPredict }
  }),
  signal: AbortSignal.timeout(20 * 60 * 1000)
});

if (!response.ok) {
  console.error(`Ollama ${response.status}: ${(await response.text()).slice(0, 300)}`);
  process.exit(1);
}

const body = await response.json();
let content = (body.message?.content ?? '')
  .replace(/<think>[\s\S]*?<\/think>/gi, '')
  .trim()
  .replace(/^```[a-z]*\s*\n?/i, '')
  .replace(/\n?```\s*$/i, '')
  .trim();

const secs = ((Date.now() - started) / 1000).toFixed(1);
process.stderr.write(`← ${body.eval_count ?? '?'} tokens in ${secs}s\n`);

if (outPath) {
  await writeFile(outPath, content + '\n', 'utf8');
  process.stderr.write(`✓ wrote ${outPath} (${content.length} chars)\n`);
} else {
  process.stdout.write(content + '\n');
}
