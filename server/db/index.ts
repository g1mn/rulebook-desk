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
  getDb,
});
