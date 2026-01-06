import { z } from "zod";

export const userProfileSchema = z.object({
  name: z.string().optional(),
  timezone: z.string().optional(),

  // Stable preferences
  podcast: z.object({
    lengthMinutes: z.number().min(5).max(90).optional(),
    tone: z.enum(["calm", "energetic", "analytical", "playful"]).optional(),
    format: z.enum(["solo", "interview", "two-host"]).optional(),
    voice: z.object({
      ttsProvider: z.string().optional(),
      voiceId: z.string().optional(),
    }).optional(),
  }).default({}),

  // What to do more/less of
  likes: z.array(z.string()).default([]),
  dislikes: z.array(z.string()).default([]),

  // Long-term goals & constraints
  goals: z.array(z.string()).default([]),
  constraints: z.object({
    avoidTopics: z.array(z.string()).default([]),
    contentWarnings: z.array(z.string()).default([]),
  }).default({ avoidTopics: [], contentWarnings: [] }),
});