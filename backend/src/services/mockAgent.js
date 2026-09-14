const rules = [
  {
    category: 'order-status',
    confidence: 0.82,
    keywords: ['commande', 'livraison', 'suivi', 'colis'],
    content:
      'Je peux vous aider avec le suivi de votre commande. Dans cette version de demo, je n\'ai pas encore acces aux donnees reelles, mais le futur agent pourra verifier le statut et le suivi du colis.'
  },
  {
    category: 'policy',
    confidence: 0.78,
    keywords: ['retour', 'remboursement', 'annulation'],
    content:
      'Pour les demandes de retour, remboursement ou annulation, cette version de demo fournit une reponse indicative. La prochaine etape connectera une base de connaissances pour utiliser les vraies politiques.'
  },
  {
    category: 'product',
    confidence: 0.74,
    keywords: ['produit', 'stock', 'disponible'],
    content:
      'Je peux vous renseigner sur un produit. Dans cette V1, je n\'ai pas encore acces au stock reel, mais le futur agent pourra interroger les donnees produit.'
  }
];

export function generateMockResponse(message, context = {}) {
  void context;

  const normalizedMessage = String(message || '').toLowerCase();
  const matchedRule = rules.find((rule) =>
    rule.keywords.some((keyword) => normalizedMessage.includes(keyword))
  );

  if (matchedRule) {
    return {
      content: matchedRule.content,
      confidence: matchedRule.confidence,
      source: 'mock-agent',
      category: matchedRule.category
    };
  }

  return {
    content:
      'Bonjour, je suis l\'agent de support demo de SupportLoop. Je peux deja simuler une reponse de support, et les prochaines versions ajouteront la connaissance, les outils et l\'escalade humaine.',
    confidence: 0.62,
    source: 'mock-agent',
    category: 'generic'
  };
}
