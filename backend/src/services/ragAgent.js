export function createRagAgent({ knowledgeStore, provider, minSimilarity = 0.35 }) {
  return async function generateResponse(question, { history = [] } = {}) {
    const [embedding] = await provider.embed([question]);
    const sources = await knowledgeStore.search(embedding, {
      model: provider.embeddingModel, minSimilarity, limit: 4
    });
    if (!sources.length) {
      return {
        content: "Je n'ai pas trouve d'information pertinente dans la base de connaissances. Pouvez-vous preciser votre demande ?",
        source: 'knowledge-base', category: 'no-knowledge', sources: []
      };
    }
    return {
      content: await provider.answer({ question, history, sources }),
      source: 'rag', category: 'knowledge-answer',
      retrievalSimilarity: sources[0].similarity,
      sources: sources.map(({ id, source, chunkIndex, content, similarity }, index) => ({
        id, source, chunkIndex, excerpt: content, similarity, citation: index + 1
      }))
    };
  };
}
