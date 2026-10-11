import { readFile } from 'node:fs/promises';
import { createMemorySupportStore } from '../src/services/supportStore.js';
import { createSupportService } from '../src/services/supportService.js';

const cases = JSON.parse(await readFile(new URL('../evaluation/cases.json', import.meta.url), 'utf8'));
const store = createMemorySupportStore();
const service = createSupportService({ store });
let passed = 0;
for (const testCase of cases) {
  const result = await service.chat({ conversationId: testCase.id, customerId: 'customer-demo', message: testCase.question, channel: 'evaluation' });
  const state = await store.conversation(testCase.id);
  const ok = result.status === testCase.status && (!testCase.includes || result.message?.content.includes(testCase.includes)) &&
    (!testCase.reason || result.escalation?.reason === testCase.reason) && (!testCase.tool || state.traces.some((trace) => trace.name === testCase.tool));
  if (ok) passed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.id}`);
}
const question = 'Comment fonctionne la garantie atelier ?';
await service.action('unknown-policy', 'claim', { agentName: 'Evaluation' });
await service.action('unknown-policy', 'reply', { agentName: 'Evaluation', content: 'La garantie atelier dure deux ans.' });
await service.action('unknown-policy', 'resolve', { agentName: 'Evaluation' });
const [entry] = await store.listLearnedKnowledge();
await service.approveKnowledge(entry.id, { reviewedBy: 'Evaluation' });
const learned = await service.chat({ conversationId: 'after-learning', customerId: 'customer-demo', message: question, channel: 'evaluation' });
const learningPassed = learned.status === 'ai' && learned.message.content.includes('deux ans') && learned.message.metadata.sources[0].source.startsWith('learned/');
console.log(`${learningPassed ? 'PASS' : 'FAIL'} before/after: unknown policy -> human review -> grounded answer`);
console.log(`\nDemo regression: ${passed}/${cases.length} passed. Learning loop: ${learningPassed ? 'passed' : 'failed'}. No OpenAI calls.`);
await store.close();
if (passed !== cases.length || !learningPassed) process.exitCode = 1;
