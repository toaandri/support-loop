import { Router } from 'express';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { httpError } from '../services/supportStore.js';

function matches(actual, expected) {
  if (!actual || !expected || typeof actual !== 'string') return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;

export function createSupportRouter(service, { demoMode = true, customerKey, adminKey,
  customerId = 'customer-demo', agentName = 'Support', mode = 'demo', sessionAuth = false, brandName = 'SupportLoop', aiModel } = {}) {
  if (!sessionAuth && !demoMode && (!customerKey || !adminKey || customerKey === adminKey)) {
    throw new Error('Distinct CUSTOMER_API_KEY and SUPPORT_ADMIN_KEY are required outside demo mode.');
  }
  if(customerKey && adminKey && customerKey === adminKey) throw new Error('Client and administrator service keys must differ.');
  const router = Router();
  router.get('/health', (req, res) => res.json({ status: 'ok', service: 'support-loop-backend', mode, demoMode, sessionAuth, brandName, aiModel, version: 9 }));
  router.use('/support', (req, res, next) => {
    if (matches(req.get('x-support-key'),adminKey)) return next();
    if (sessionAuth) return req.user?.role === 'admin' ? next() : res.status(req.user ? 403 : 401).json({error:'Accès administrateur requis.'});
    if (matches(req.get('x-support-key'), adminKey) || (demoMode && !adminKey)) return next();
    return res.status(401).json({ error: 'Support access key required.' });
  });
  router.get('/support/settings', wrap(async (req, res) => res.json({ threshold: await service.store.getThreshold(), agentName: req.user?.name || agentName, mode, aiModel, brandName })));
  router.patch('/support/settings', wrap(async (req, res) => {
    const threshold = req.body?.threshold;
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw httpError(400, 'Threshold must be between 0 and 1.');
    await service.store.setThreshold(threshold); res.json({ threshold });
  }));
  router.get('/support/conversations', wrap(async (req, res) => {
    const states = await service.store.listConversations();
    res.json({ conversations: await Promise.all(states.map(async (state) => ({
      id: state.id, status: state.status, assignedTo: state.assignedTo, escalation: state.escalation,
      updatedAt: state.updatedAt, preview: state.messages.filter((message) => message.role === 'user').at(-1)?.content || state.messages.at(-1)?.content || '',
      customer: await service.store.customer(state.customerId)
    }))) });
  }));
  router.get('/support/conversations/:id', wrap(async (req, res) => {
    const conversation = await service.store.conversation(req.params.id);
    res.json({ ...conversation, customer: await service.store.customer(conversation.customerId),
      orders: await service.store.orders(conversation.customerId), tickets: await service.store.tickets(conversation.customerId) });
  }));
  router.get('/support/stats', wrap(async (req, res) => res.json(await service.store.stats())));
  router.get('/support/customers', wrap(async (req,res) => res.json({customers:await service.store.customers()})));
  router.post('/support/ai/check', wrap(async (req,res) => res.json(await service.checkAI())));
  router.get('/support/products', wrap(async (req,res) => res.json({products:await service.store.products()})));
  router.post('/support/products', wrap(async (req,res) => {
    const {id,name,description,price_cents,stock,image_url=''}=req.body||{};
    if (!text(id,64)||!/^[A-Za-z0-9_-]+$/.test(id)||!text(name,120)||!text(description,2000)||
        !Number.isSafeInteger(price_cents)||price_cents<0||!Number.isSafeInteger(stock)||stock<0||
        typeof image_url!=='string'||image_url.length>500|| (image_url && !/^\/products\/[A-Za-z0-9_-]+\.svg$/.test(image_url)))
      throw httpError(400,'Données produit invalides.');
    if (!service.store.saveProduct) throw httpError(400,'Le catalogue nécessite PostgreSQL.');
    res.json({product:await service.store.saveProduct({id,name:name.trim(),description:description.trim(),price_cents,stock,image_url})});
  }));
  router.get('/support/documents', wrap(async (req,res) => res.json({documents:await service.documents()})));
  router.post('/support/documents', wrap(async (req,res) => {
    const {title,content}=req.body||{};
    if(!text(title,120)||!text(content,20000)) throw httpError(400,'Titre et contenu requis.');
    res.status(201).json(await service.publishDocument({title:title.trim(),content:content.trim()}));
  }));
  const manualSource = (id) => {
    if(!/^[0-9a-f-]{36}\.md$/i.test(id)) throw httpError(400,'Référence d’article invalide.');
    return `manual/${id}`;
  };
  router.put('/support/documents/:id',wrap(async(req,res)=>{
    const {title,content}=req.body||{};
    if(!text(title,120)||!text(content,20000)) throw httpError(400,'Titre et contenu requis.');
    res.json(await service.publishDocument({title:title.trim(),content:content.trim(),source:manualSource(req.params.id)}));
  }));
  router.delete('/support/documents/:id',wrap(async(req,res)=>res.json(await service.removeDocument(manualSource(req.params.id)))));
  router.post('/support/ingest', wrap(async (req, res) => res.json({ documents: await service.ingestDocuments() })));
  router.post('/support/conversations/:id/learn', wrap(async (req, res) => res.json(await service.retryLearning(req.params.id))));

  router.get('/support/knowledge', wrap(async (req, res) => {
    const { status } = req.query;
    const allowed = ['new', 'review', 'approved', 'rejected', 'active'];
    if (status !== undefined && !allowed.includes(status)) throw httpError(400, 'Invalid status filter.');
    res.json({ knowledge: await service.store.listLearnedKnowledge(status ? { status } : {}) });
  }));
  router.get('/support/knowledge/:id', wrap(async (req, res) => {
    res.json(await service.store.getLearnedKnowledge(req.params.id));
  }));
  router.post('/support/knowledge/:id/approve', wrap(async (req, res) => {
    res.json(await service.approveKnowledge(req.params.id, { reviewedBy: req.user?.name || agentName }));
  }));
  router.post('/support/knowledge/:id/review', wrap(async (req, res) => res.json(await service.reviewKnowledge(req.params.id))));
  router.post('/support/knowledge/:id/reject', wrap(async (req, res) => {
    res.json(await service.rejectKnowledge(req.params.id, { reviewedBy: req.user?.name || agentName }));
  }));
  router.post('/support/knowledge/:id/revoke',wrap(async(req,res)=>res.json(await service.revokeKnowledge(req.params.id,{reviewedBy:req.user?.name||agentName}))));
  router.patch('/support/knowledge/:id', wrap(async (req, res) => {
    const { extracted_rule, human_answer } = req.body || {};
    if (human_answer !== undefined && !text(human_answer, 2000)) throw httpError(400, 'human_answer must be a non-empty string (max 2000).');
    if (extracted_rule !== undefined && extracted_rule !== null) {
      if (typeof extracted_rule !== 'object' || Array.isArray(extracted_rule) ||
          !['intent', 'condition', 'resolution'].every((field) => text(extracted_rule[field], 2000)) ||
          Object.keys(extracted_rule).some((field) => !['intent', 'condition', 'resolution', 'notes'].includes(field)) ||
          (extracted_rule.notes != null && !text(extracted_rule.notes, 2000))) throw httpError(400, 'Invalid extracted rule.');
    }
    res.json(await service.editKnowledge(req.params.id, { extracted_rule, human_answer }));
  }));

  router.post('/support/conversations/:id/:action', wrap(async (req, res) => {
    if (req.params.action === 'reply' && !text(req.body?.content, 4000)) throw httpError(400, 'Reply is required (max 4000 characters).');
    res.json(await service.action(req.params.id, req.params.action, { agentName: req.user?.name || agentName, actorId:req.user?.id,
      content: req.params.action === 'reply' ? req.body.content.trim() : undefined }));
  }));
  router.use((req, res, next) => {
    if (req.path.startsWith('/support')) return next();
    if (sessionAuth && req.method==='GET' && ['/products','/articles'].includes(req.path)) return next();
    if (sessionAuth) {
      if(matches(req.get('x-customer-key'),customerKey)){req.customerId=customerId;return next();}
      if (req.user?.role!=='customer') return res.status(req.user ? 403 : 401).json({error:'Connexion client requise.'});
      req.customerId=req.user.customerId; return next();
    }
    if (matches(req.get('x-customer-key'), customerKey) || (demoMode && !customerKey)) return next();
    return res.status(401).json({ error: 'Customer access key required.' });
  });
  router.get('/customer', wrap(async (req, res) => {
    const customer = await service.store.customer(req.customerId || customerId);
    if (!customer) throw httpError(404, 'Customer not found.');
    res.json({ customer });
  }));
  router.get('/conversations', wrap(async (req,res) => res.json({conversations:(await service.store.customerConversations(req.customerId || customerId)).map((row)=>({id:row.id,status:row.status,updatedAt:row.updatedAt,preview:row.messages.find((m)=>m.role==='user')?.content||'Nouvelle demande'}))})));
  router.get('/articles', wrap(async (req,res) => res.json({articles:(await service.documents()).filter((row)=>row.source.startsWith('manual/')).map((row)=>({id:row.id,title:row.content.split('\n')[0].replace(/^#\s*/,''),content:row.content.split('\n').slice(1).join('\n').trim()}))})));
  router.get('/orders', wrap(async (req, res) => res.json({ orders: await service.store.orders(req.customerId || customerId) })));
  router.get('/orders/:id', wrap(async (req, res) => {
    const order = await service.store.order(req.params.id, req.customerId || customerId);
    if (!order) throw httpError(404, 'Order not found.'); res.json({ order });
  }));
  router.get('/products', wrap(async (req, res) => {
    if (req.query.q !== undefined && !text(req.query.q, 100)) throw httpError(400, 'Invalid product query.');
    res.json({ products: await service.store.products(req.query.q || '') });
  }));
  router.get('/tickets', wrap(async (req, res) => res.json({ tickets: await service.store.tickets(req.customerId || customerId) })));
  router.post('/chat', wrap(async (req, res) => {
    const { conversationId = sessionAuth ? randomUUID() : 'local-demo', message, channel = 'web' } = req.body || {};
    if (!text(message, 4000) || !text(conversationId, 128) || !text(channel, 32)) throw httpError(400, 'Invalid chat payload.');
    // Identity always comes from server configuration, never the request or model.
    res.json(await service.chat({ conversationId, customerId: req.customerId || customerId, message: message.trim(), channel }));
  }));
  router.get('/conversations/:id/messages', wrap(async (req, res) => {
    try {
      const state = await service.store.conversation(req.params.id, req.customerId || customerId);
      res.json({ conversationId: state.id, status: state.status, messages: state.messages, escalation: state.escalation });
    } catch (error) {
      if (error.status !== 404) throw error;
      res.json({ conversationId: req.params.id, status: 'ai', messages: [], escalation: null });
    }
  }));
  return router;
}
