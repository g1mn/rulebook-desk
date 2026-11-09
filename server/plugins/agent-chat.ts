import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import { agentLanguageContext } from "../lib/agent-language.js";
import { AGENT_SYSTEM_PROMPT } from "../lib/agent-prompt.js";
import { deadlineClockContext } from "../lib/rulebook/clock.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-rulebooks",
  "get-rulebook",
  "create-rulebook",
  "read-source",
  "save-facts",
  "update-fact",
  "check-sources",
  "add-source",
  "list-archive-copies",
  "deadline-clock",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "agent-native-2026",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references }) => {
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  // Replies follow the screen language; quotes stay verbatim. The deadline
  // clock gives the agent code-computed time left, so it never does time math.
  extraContext: async (event, owner) =>
    (
      await Promise.all([
        agentLanguageContext(event, owner),
        deadlineClockContext(event, owner),
      ])
    )
      .filter(Boolean)
      .join("\n\n"),
  systemPrompt: AGENT_SYSTEM_PROMPT,
});
