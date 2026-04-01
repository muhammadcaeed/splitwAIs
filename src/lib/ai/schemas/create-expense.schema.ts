import { z } from 'zod'

export const createExpenseOutputSchema = z.object({
  title: z.string(),
  amount: z.number(),
  paidById: z.string().nullable(),
  paidFor: z.array(
    z.object({
      participantId: z.string(),
      shares: z.number().positive().default(1),
    }),
  ),
  splitMode: z
    .enum(['EVENLY', 'BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT'])
    .default('EVENLY'),
  categoryId: z.number().int().default(0),
  expenseDate: z.string().nullable(),
  notes: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
})

export type CreateExpenseOutput = z.infer<typeof createExpenseOutputSchema>
