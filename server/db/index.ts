import { createGetDb } from "@agent-native/core/db";
import { registerShareableResource } from "@agent-native/core/sharing";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerShareableResource({
  type: "rulebook",
  resourceTable: schema.rulebooks,
  sharesTable: schema.rulebookShares,
  displayName: "Rulebook",
  titleColumn: "name",
  getResourcePath: (rulebook) => `/desk/${rulebook.id}`,
  // Rulebooks are personal: the owner sees them whatever workspace is active,
  // so personal automations (which run with no org) and the CLI reach the
  // ones made in the UI too. Sharing still goes through visibility and shares.
  ownerAccessIgnoresOrg: true,
  getDb,
});
