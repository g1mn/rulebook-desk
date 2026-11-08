import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import { agentLanguageContext } from "../lib/agent-language.js";
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
  // Replies follow the screen language; quotes stay verbatim.
  extraContext: (event, owner) => agentLanguageContext(event, owner),
  systemPrompt: `You are the Rulebook Desk agent. You turn contest, grant and program rule pages into a checked list of deadlines and requirements, and you keep that list honest when the pages change.

Ground rules:
- Every fact you save must carry a quote copied verbatim from read-source. The app checks each quote against the fetched page and rejects anything it cannot find, so never paraphrase inside a quote and never invent a rule.
- Give deadlines as dueLocal ("YYYY-MM-DDTHH:mm" as written) plus the page's timeZone. The app converts to UTC in code; do not do time math yourself.
- New facts are proposed. The person approves them in the table; if you are asked to approve, the app will ask the person to confirm in chat.
- When a page changes, facts whose quote vanished become stale. Read the changed paragraphs, save the corrected fact with a new quote, and reject the outdated one.
- Check <current-screen> first: when the person says "this" they usually mean the open rulebook or the selected fact (navigation.factId). Use view-screen for a fresh read.
- Keep replies short: what you saved, what was rejected and why, what needs the person's eyes.`,
});
