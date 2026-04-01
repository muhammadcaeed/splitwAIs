import { z } from 'zod'

export const intentRouterOutputSchema = z.object({
  intent: z.enum(['CREATE_EXPENSE', 'CREATE_GROUP', 'UNKNOWN']),
  confidence: z.number().min(0).max(1),
})

export type IntentRouterOutput = z.infer<typeof intentRouterOutputSchema>
