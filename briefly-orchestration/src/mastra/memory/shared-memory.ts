import { Memory } from "@mastra/memory";
import { userProfileSchema } from "../schema/profile";

export const memory = new Memory({
    options: {
      workingMemory: {
        enabled: true,
        scope: "resource", // persists per user/resourceId across threads
        schema: userProfileSchema,
      },
    },
  });
  