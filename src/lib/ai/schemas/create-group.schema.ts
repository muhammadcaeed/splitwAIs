import { z } from 'zod'

// Phase 2: not yet implemented
export const createGroupOutputSchema = z.object({
  name: z.string(),
  currency: z.string().optional(),
  information: z.string().nullable().optional(),
})

export type CreateGroupOutput = z.infer<typeof createGroupOutputSchema>
