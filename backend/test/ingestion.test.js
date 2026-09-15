import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ingestKnowledge } from '../src/services/documentIngestion.js';

let directory;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe('knowledge ingestion', () => {
  it('indexes text, skips unchanged files, and replaces changed content', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'supportloop-ingestion-'));
    await writeFile(path.join(directory, 'returns.md'), 'Retour sous 14 jours.');
    await writeFile(path.join(directory, 'unsupported.pdf'), 'ignored');
    let stored;
    const knowledgeStore = {
      getDocument: vi.fn(async () => stored),
      replaceDocument: vi.fn(async (document) => {
        stored = { content_hash: document.hash, embedding_model: document.model };
      })
    };
    const provider = { embeddingModel: 'test-model', embed: vi.fn(async (texts) => texts.map(() => [1])) };
    const deps = { knowledgeStore, provider };
    expect(await ingestKnowledge(directory, deps)).toEqual([{ source: 'returns.md', status: 'indexed', chunks: 1 }]);
    expect(await ingestKnowledge(directory, deps)).toEqual([{ source: 'returns.md', status: 'unchanged' }]);
    expect(provider.embed).toHaveBeenCalledTimes(1);
    await writeFile(path.join(directory, 'returns.md'), 'Retour sous 30 jours.');
    await ingestKnowledge(directory, deps);
    expect(knowledgeStore.replaceDocument).toHaveBeenCalledTimes(2);
    expect(knowledgeStore.replaceDocument.mock.calls[1][0].chunks).toEqual(['Retour sous 30 jours.']);
    provider.embeddingModel = 'another-model';
    await ingestKnowledge(directory, deps);
    expect(knowledgeStore.replaceDocument).toHaveBeenCalledTimes(3);
  });

  it('preserves the previous document if embedding fails', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'supportloop-ingestion-'));
    await writeFile(path.join(directory, 'returns.txt'), 'Retour sous 14 jours.');
    const knowledgeStore = { getDocument: vi.fn().mockResolvedValue(undefined), replaceDocument: vi.fn() };
    const provider = { embeddingModel: 'test', embed: vi.fn().mockRejectedValue(new Error('offline')) };
    await expect(ingestKnowledge(directory, { knowledgeStore, provider })).rejects.toThrow('offline');
    expect(knowledgeStore.replaceDocument).not.toHaveBeenCalled();
  });
});
