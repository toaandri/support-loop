import { readdir, readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const directory = new URL('../../n8n/workflows/', import.meta.url);
const workflows = await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.json')).map(async (filename) =>
  ({ filename, ...JSON.parse(await readFile(new URL(filename, directory), 'utf8')) })));

describe('n8n workflow contracts', () => {
  it('contains acyclic reachable graphs, authenticated webhooks and no shell commands', () => {
    expect(workflows).toHaveLength(12);
    for (const workflow of workflows) {
      const names = new Set(workflow.nodes.map((node) => node.name));
      const adjacency = new Map();
      for (const node of workflow.nodes) {
        expect(node.type).not.toBe('n8n-nodes-base.executeCommand');
        if (node.type === 'n8n-nodes-base.webhook') expect(node.parameters.authentication).toBe('headerAuth');
        if (node.parameters.jsCode) expect(() => new vm.Script(`(function(){${node.parameters.jsCode}\n})`)).not.toThrow();
      }
      for (const [source, outputs] of Object.entries(workflow.connections)) {
        expect(names.has(source), `${workflow.filename}: ${source}`).toBe(true);
        const targets = Object.values(outputs).flat(2).map((edge) => edge.node);
        for (const target of targets) expect(names.has(target)).toBe(true);
        adjacency.set(source, targets);
      }
      const visited = new Set();
      function visit(name, stack = new Set()) {
        expect(stack.has(name), `${workflow.filename}: cycle at ${name}`).toBe(false);
        if (visited.has(name)) return;
        visited.add(name);
        for (const target of adjacency.get(name) || []) visit(target, new Set([...stack, name]));
      }
      for (const trigger of workflow.nodes.filter((node) => /webhook|scheduleTrigger|errorTrigger/.test(node.type))) visit(trigger.name);
      expect(visited.size, `${workflow.filename}: unreachable nodes`).toBe(names.size);
    }
  });

  it('creates JSON bodies as expressions with bound customer messages', () => {
    const context = { $json: { body: { conversationId: 'fixture', message: 'Stock PRD-001 ?', query: 'retour' },
      conversationId: 'fixture', message: 'Stock PRD-001 ?', channel: 'n8n' }, $now: { toMillis: () => 1234 } };
    for (const workflow of workflows) for (const node of workflow.nodes.filter((node) => node.parameters.jsonBody)) {
      const expression = node.parameters.jsonBody;
      expect(expression.startsWith('={{')).toBe(true);
      expect(expression.endsWith('}}')).toBe(true);
      const result = vm.runInNewContext(`(${expression.slice(3, -2)})`, context, { timeout: 100 });
      expect(typeof result.conversationId).toBe('string');
      expect(typeof result.message).toBe('string');
      expect(typeof result.channel).toBe('string');
      expect(result.message).not.toContain('$json');
    }
  });
});
