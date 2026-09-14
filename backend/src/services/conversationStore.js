export function createConversationStore() {
  const conversations = new Map();

  function getMessages(conversationId) {
    return conversations.get(conversationId) || [];
  }

  function addMessage(conversationId, message) {
    const existingMessages = getMessages(conversationId);
    const nextMessage = {
      ...message,
      id: message.id || crypto.randomUUID(),
      createdAt: message.createdAt || new Date().toISOString()
    };

    conversations.set(conversationId, [...existingMessages, nextMessage]);
    return nextMessage;
  }

  function clear() {
    conversations.clear();
  }

  return {
    addMessage,
    getMessages,
    clear
  };
}
