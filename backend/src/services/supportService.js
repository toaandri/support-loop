import { randomUUID } from 'node:crypto';
import { appendMessage, httpError } from './supportStore.js';
import { createToolExecutor } from './agentTools.js';
import { createSupportAgent, escalationReason } from './supportAgent.js';

export function createSupportService({ store, provider, knowledgeStore, minSimilarity, agent = createSupportAgent(provider) }) {
  async function escalate(state, repo, reason, confidence, sources = []) {
    const ticket = await repo.createTicket(state.messages.filter((item) => item.role === 'user').at(-1).content.slice(0, 200));
    state.status = 'waiting';
    state.escalation = { reason, confidence, sources, ticketId: ticket.id, createdAt: new Date().toISOString() };
    return appendMessage(state, 'assistant', 'Votre demande a ete transmise a un conseiller. Vous pouvez ajouter des precisions ici.',
      { source: 'handoff', category: reason, confidence, sources });
  }
  return {
    store,
    async chat({ conversationId, customerId, message, channel }) {
      const threshold = await store.getThreshold();
      return store.withConversation(conversationId, customerId, async (state, repo) => {
        const history = structuredClone(state.messages);
        appendMessage(state, 'user', message, { channel });
        if (state.status === 'waiting' || state.status === 'human') {
          return { conversationId, status: state.status, message: null, history: state.messages, escalation: state.escalation };
        }
        if (state.status === 'resolved') { state.status = 'ai'; state.escalation = null; state.assignedTo = null; }
        const reason = escalationReason(message);
        let assistantMessage;
        if (reason) assistantMessage = await escalate(state, repo, reason, null);
        else {
          const executor = createToolExecutor({ state, repo, provider, knowledgeStore, minSimilarity });
          try {
            const answer = await agent(message, { history, execute: executor.execute });
            state.traces.push(...executor.traces);
            const sources = executor.traces.filter((trace) => trace.name === 'search_knowledge_base' && trace.status === 'success')
              .flatMap((trace) => trace.result).map((row) => ({ ...row, excerpt: row.content }));
            const missingEvidence = provider && !executor.traces.some((trace) => trace.status === 'success' &&
              (Array.isArray(trace.result) ? trace.result.length > 0 : !!trace.result));
            const mustHandoff = answer.needsHuman || answer.confidence < threshold || missingEvidence;
            if (mustHandoff) {
              const handoffReason = missingEvidence ? 'missing-evidence' : answer.confidence < threshold ? 'low-confidence' : answer.reason || 'agent-request';
              assistantMessage = await escalate(state, repo, handoffReason, answer.confidence, sources);
            } else assistantMessage = appendMessage(state, 'assistant', answer.content,
              { source: provider ? 'tool-agent' : 'demo-agent', confidence: answer.confidence,
                category: 'support-answer', sources, tools: executor.traces.map(({ name, status }) => ({ name, status })) });
          } catch (error) {
            state.traces.push(...executor.traces);
            assistantMessage = await escalate(state, repo, 'tool-or-provider-error', null);
          }
        }
        return { conversationId, status: state.status, message: assistantMessage, history: state.messages, escalation: state.escalation };
      });
    },
    async action(id, action, { agentName, content }) {
      return store.withConversation(id, null, async (state) => {
        if (action === 'claim') {
          if (state.status !== 'waiting') throw httpError(409, 'Conversation is not waiting.');
          state.status = 'human'; state.assignedTo = agentName;
        } else {
          if (state.status !== 'human' || state.assignedTo !== agentName) throw httpError(409, 'Claim this conversation first.');
          if (action === 'reply') appendMessage(state, 'human', content, { agentName, source: 'human' });
          else if (action === 'resolve') {
            state.status = 'resolved';
            appendMessage(state, 'system', 'Conversation resolue par le conseiller.', { agentName });
            // V6 : déclencher l'extraction de connaissance en arrière-plan
            setImmediate(() => this._extractAndStore(id, state).catch(() => {}));
          } else if (action === 'resume') {
            state.status = 'ai'; state.assignedTo = null; state.escalation = null;
            appendMessage(state, 'system', 'Le support automatique reprend la conversation.', { agentName });
          } else throw httpError(400, 'Invalid action.');
        }
        state.updatedAt = new Date().toISOString();
        return state;
      }, { existingOnly: true });
    },

    // V6 : extrait une connaissance depuis une conversation resolue et la stocke en statut 'new'
    async _extractAndStore(conversationId, state) {
      if (!provider?.extractKnowledge) return;
      const userMessages = state.messages.filter((m) => m.role === 'user');
      const humanMessages = state.messages.filter((m) => m.role === 'human');
      if (!userMessages.length || !humanMessages.length) return;
      const question = userMessages[0].content;
      const aiAnswerMsg = state.messages.find((m) => m.role === 'assistant' && m.metadata?.source !== 'handoff');
      const humanAnswer = humanMessages.map((m) => m.content).join('\n');
      const extractedRule = await provider.extractKnowledge({
        question, aiAnswer: aiAnswerMsg?.content || null, humanAnswer
      });
      await store.createLearnedKnowledge({
        id: randomUUID(), conversation_id: conversationId,
        question: question.slice(0, 1000),
        ai_answer: aiAnswerMsg?.content?.slice(0, 2000) || null,
        human_answer: humanAnswer.slice(0, 2000),
        extracted_rule: extractedRule,
        status: 'new',
        created_at: new Date().toISOString()
      });
    },

    // V6 : approuve une connaissance et l'indexe dans la knowledge base si possible
    async approveKnowledge(id, { reviewedBy, knowledgeStoreRef = knowledgeStore, providerRef = provider } = {}) {
      const entry = await store.getLearnedKnowledge(id);
      if (!['new', 'review'].includes(entry.status)) throw httpError(409, 'Only new or review entries can be approved.');
      const now = new Date().toISOString();
      await store.updateLearnedKnowledge(id, { status: 'approved', reviewed_at: now, reviewed_by: reviewedBy || null });
      // Indexation vectorielle si le provider et le knowledgeStore sont disponibles
      if (providerRef && knowledgeStoreRef) {
        const source = `learned/${id}.md`;
        const rule = entry.extracted_rule;
        const text = rule
          ? `# ${rule.intent}\n\nCondition: ${rule.condition}\n\nResolution: ${rule.resolution}${rule.notes ? `\n\nNotes: ${rule.notes}` : ''}\n\nHuman answer: ${entry.human_answer}`
          : `Question: ${entry.question}\n\nAnswer: ${entry.human_answer}`;
        const [embedding] = await providerRef.embed([text]);
        const { createHash } = await import('node:crypto');
        const hash = createHash('sha256').update(`chunk-v1\n${text}`).digest('hex');
        await knowledgeStoreRef.replaceDocument({
          source, hash, model: providerRef.embeddingModel,
          chunks: [text], embeddings: [embedding]
        });
        await store.updateLearnedKnowledge(id, { status: 'active' });
      }
      return store.getLearnedKnowledge(id);
    },

    async rejectKnowledge(id, { reviewedBy } = {}) {
      const entry = await store.getLearnedKnowledge(id);
      if (!['new', 'review'].includes(entry.status)) throw httpError(409, 'Only new or review entries can be rejected.');
      await store.updateLearnedKnowledge(id, {
        status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy || null
      });
      return store.getLearnedKnowledge(id);
    },

    async editKnowledge(id, { extracted_rule, human_answer }) {
      await store.getLearnedKnowledge(id); // vérifie existence
      const patch = {};
      if (extracted_rule !== undefined) patch.extracted_rule = extracted_rule;
      if (human_answer !== undefined) patch.human_answer = human_answer.slice(0, 2000);
      if (!Object.keys(patch).length) throw httpError(400, 'Nothing to update.');
      await store.updateLearnedKnowledge(id, patch);
      return store.getLearnedKnowledge(id);
    }
  };
}
