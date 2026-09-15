import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export function chunkText(text, { size = 1200, overlap = 200 } = {}) {
  if (!Number.isInteger(size) || !Number.isInteger(overlap) || size < 1 || overlap < 0 || overlap >= size) {
    throw new Error('Invalid chunk settings.');
  }
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  const chunks = [];
  for (let start = 0; start < cleaned.length;) {
    let end = Math.min(start + size, cleaned.length);
    if (end < cleaned.length) {
      const boundary = cleaned.lastIndexOf(' ', end);
      if (boundary > start + overlap && boundary > start + size / 2) end = boundary;
    }
    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

export async function ingestKnowledge(directory, { knowledgeStore, provider }) {
  const root = path.resolve(directory);
  const results = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) { await walk(filename); continue; }
      if (!entry.isFile() || !['.md', '.txt'].includes(path.extname(filename).toLowerCase())) continue;
      if ((await stat(filename)).size > 1024 * 1024) throw new Error(`Document exceeds 1 MiB: ${entry.name}`);
      const text = await readFile(filename, 'utf8');
      const source = path.relative(root, filename).split(path.sep).join('/');
      // Include chunking version so pipeline changes trigger reindexing.
      const hash = createHash('sha256').update(`chunk-v1\n${text}`).digest('hex');
      const existing = await knowledgeStore.getDocument(source);
      if (existing?.content_hash === hash && existing.embedding_model === provider.embeddingModel) {
        results.push({ source, status: 'unchanged' }); continue;
      }
      const chunks = chunkText(text);
      if (!chunks.length) throw new Error(`Empty document: ${source}`);
      const embeddings = [];
      for (let offset = 0; offset < chunks.length; offset += 32) {
        embeddings.push(...await provider.embed(chunks.slice(offset, offset + 32)));
      }
      await knowledgeStore.replaceDocument({ source, hash, model: provider.embeddingModel, chunks, embeddings });
      results.push({ source, status: 'indexed', chunks: chunks.length });
    }
  }
  await walk(root);
  return results;
}
