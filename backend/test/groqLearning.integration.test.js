import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, it, expect } from "vitest";
import { createGroqProvider } from "../src/services/groqProvider.js";
import { createKnowledgeStore } from "../src/services/knowledgeStore.js";
import { createPostgresSupportStore } from "../src/services/supportStore.js";
import { createSupportService } from "../src/services/supportService.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Groq learning with persistent text retrieval",
  () => {
    it("learns only after review, excludes private corrections, retrieves without embeddings and retracts a rule", async () => {
      const db = process.env.TEST_DATABASE_URL,
        suffix = randomUUID(),
        customerId = `learning-${suffix}`;
      const ids = [
        `before-${suffix}`,
        `after-${suffix}`,
        `retracted-${suffix}`,
      ];
      const pool = new pg.Pool({ connectionString: db }),
        store = createPostgresSupportStore(db),
        knowledgeStore = createKnowledgeStore(db);
      let entry;
      try {
        await knowledgeStore.initialize(
          await readFile(
            new URL("../../database/schema.sql", import.meta.url),
            "utf8",
          ),
        );
        await knowledgeStore.initialize(
          await readFile(
            new URL("../../database/support-schema.sql", import.meta.url),
            "utf8",
          ),
        );
        await pool.query(
          "INSERT INTO customers(id,name,email) VALUES($1,$2,$3)",
          [customerId, "Test", `${suffix}@example.test`],
        );
        const topic = `protocole${suffix.replaceAll("-", "")}`;
        const rule = {
          intent: topic,
          condition: `Une demande sur ${topic}`,
          resolution: `La formation ${topic} dure trois séances.`,
          notes: null,
        };
        // Only the external generation is mocked. HTTP payload, retrieval, review and storage are real.
        const provider = createGroqProvider({
          apiKey: "fixture",
          fetchImpl: async (url, options) => {
            const payload = JSON.parse(options.body),
              data = JSON.parse(payload.messages[1].content);
            const value =
              payload.response_format.json_schema.name === "support_rule"
                ? rule
                : {
                    content: data.facts.knowledge.length
                      ? `Trois séances [1].`
                      : "Je transmets votre demande.",
                    confidence: data.facts.knowledge.length ? 0.94 : 0.2,
                    needsHuman: !data.facts.knowledge.length,
                    reason: "missing-knowledge",
                  };
            return {
              ok: true,
              json: async () => ({
                choices: [
                  {
                    finish_reason: "stop",
                    message: { content: JSON.stringify(value) },
                  },
                ],
              }),
            };
          },
        });
        const service = createSupportService({
          store,
          provider,
          knowledgeStore,
        });
        const first = await service.chat({
          conversationId: ids[0],
          customerId,
          message: `Comment fonctionne ${topic} ?`,
          channel: "test",
        });
        expect(first.status).toBe("waiting");
        await service.action(ids[0], "claim", {
          agentName: "Support",
          actorId: "admin-one",
        });
        await expect(
          service.action(ids[0], "reply", {
            agentName: "Support",
            actorId: "admin-two",
            content: "Wrong actor",
          }),
        ).rejects.toMatchObject({ status: 409 });
        await service.action(ids[0], "reply", {
          agentName: "Support",
          actorId: "admin-one",
          content: `Bonjour Alice, votre dossier privé ABC-123 concerne ${topic}, une formation de trois séances.`,
        });
        await service.action(ids[0], "resolve", {
          agentName: "Support",
          actorId: "admin-one",
        });
        entry = (await store.listLearnedKnowledge()).find(
          (row) => row.conversation_id === ids[0],
        );
        expect(entry.status).toBe("new");
        expect(
          (await knowledgeStore.searchText(topic)).some(
            (row) => row.source === `learned/${entry.id}.md`,
          ),
        ).toBe(false);
        await service.reviewKnowledge(entry.id);
        await service.approveKnowledge(entry.id, { reviewedBy: "Support" });
        const indexed = (await knowledgeStore.searchText(topic)).find(
          (row) => row.source === `learned/${entry.id}.md`,
        );
        expect(indexed.content).toContain("trois séances");
        expect(indexed.content).not.toMatch(/Alice|ABC-123|privé/);
        const vector = (
          await pool.query(
            "SELECT embedding FROM knowledge_chunks WHERE id=$1",
            [indexed.id],
          )
        ).rows[0];
        expect(vector.embedding).toBeNull();
        const second = await service.chat({
          conversationId: ids[1],
          customerId,
          message: `Comment fonctionne ${topic} ?`,
          channel: "test",
        });
        expect(second.status).toBe("ai");
        expect(second.message.metadata.sources[0].source).toBe(
          `learned/${entry.id}.md`,
        );
        await service.revokeKnowledge(entry.id, { reviewedBy: "Support" });
        expect(
          (await knowledgeStore.searchText(topic)).some(
            (row) => row.source === `learned/${entry.id}.md`,
          ),
        ).toBe(false);
        expect(
          (
            await service.chat({
              conversationId: ids[2],
              customerId,
              message: `Comment fonctionne ${topic} ?`,
              channel: "test",
            })
          ).status,
        ).toBe("waiting");
      } finally {
        if (entry)
          await knowledgeStore.deleteDocument(`learned/${entry.id}.md`);
        await pool.query(
          "DELETE FROM learned_knowledge WHERE conversation_id=ANY($1)",
          [ids],
        );
        await pool.query("DELETE FROM tickets WHERE conversation_id=ANY($1)", [
          ids,
        ]);
        await pool.query("DELETE FROM support_conversations WHERE id=ANY($1)", [
          ids,
        ]);
        await pool.query("DELETE FROM customers WHERE id=$1", [customerId]);
        await Promise.all([pool.end(), store.close(), knowledgeStore.close()]);
      }
    });
  },
);
