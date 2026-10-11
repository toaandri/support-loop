// Derive metrics from stored events, never from generated sample numbers.
export function conversationAnalytics(conversations, now = new Date()) {
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    return { date: date.toISOString().slice(0, 10), conversations: 0, escalations: 0, resolutions: 0 };
  });
  const reasons = {};
  const channels = {};
  const responseTimes = [];
  let escalated = 0;
  let aiResponses = 0;
  let humanResponses = 0;
  for (const state of conversations) {
    const day = daily.find((row) => row.date === state.createdAt?.slice(0, 10));
    if (day) day.conversations++;
    const handoffs = state.messages.filter((message) => message.metadata?.source === 'handoff');
    if (handoffs.length || state.escalation) escalated++;
    for (const handoff of handoffs) {
      const reason = handoff.metadata.category || 'agent-request';
      reasons[reason] = (reasons[reason] || 0) + 1;
      const handoffDay = daily.find((row) => row.date === handoff.createdAt?.slice(0, 10));
      if (handoffDay) handoffDay.escalations++;
    }
    const channel = state.messages.find((message) => message.role === 'user')?.metadata?.channel || 'web';
    channels[channel] = (channels[channel] || 0) + 1;
    for (let index = 0; index < state.messages.length; index++) {
      const message = state.messages[index];
      if (message.role === 'assistant' && message.metadata?.source !== 'handoff') aiResponses++;
      if (message.role === 'human') humanResponses++;
      if (message.role === 'system' && (message.metadata?.action === 'resolve' || message.content.startsWith('Conversation resolue'))) {
        const resolutionDay = daily.find((row) => row.date === message.createdAt?.slice(0, 10));
        if (resolutionDay) resolutionDay.resolutions++;
      }
      if (['assistant', 'human'].includes(message.role) && state.messages[index - 1]?.role === 'user') {
        const duration = new Date(message.createdAt) - new Date(state.messages[index - 1].createdAt);
        if (Number.isFinite(duration) && duration >= 0) responseTimes.push(duration);
      }
    }
  }
  return { conversations_today: daily.at(-1).conversations, conversations_escalated: escalated,
    ai_responses: aiResponses, human_responses: humanResponses,
    average_response_ms: responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null,
    daily, escalation_reasons: reasons, channels };
}
