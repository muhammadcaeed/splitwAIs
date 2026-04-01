import { createExpenseOutputSchema } from './create-expense.schema'

describe('createExpenseOutputSchema', () => {
  it('accepts a fully populated expense', () => {
    const result = createExpenseOutputSchema.safeParse({
      title: 'Dinner',
      amount: 45,
      paidById: 'participant-1',
      paidFor: [
        { participantId: 'participant-1', shares: 1 },
        { participantId: 'participant-2', shares: 1 },
      ],
      splitMode: 'EVENLY',
      categoryId: 3,
      expenseDate: '2026-04-01',
      notes: 'Anniversary dinner',
      groupId: 'group-abc',
    })
    expect(result.success).toBe(true)
  })

  it('defaults splitMode to EVENLY', () => {
    const result = createExpenseOutputSchema.parse({
      title: 'Coffee',
      amount: 5,
      paidById: 'participant-1',
      paidFor: [{ participantId: 'participant-1', shares: 1 }],
      expenseDate: '2026-04-01',
    })
    expect(result.splitMode).toBe('EVENLY')
  })

  it('defaults categoryId to 0', () => {
    const result = createExpenseOutputSchema.parse({
      title: 'Coffee',
      amount: 5,
      paidById: 'participant-1',
      paidFor: [{ participantId: 'participant-1', shares: 1 }],
      expenseDate: '2026-04-01',
    })
    expect(result.categoryId).toBe(0)
  })

  it('defaults shares to 1 in paidFor', () => {
    const result = createExpenseOutputSchema.parse({
      title: 'Coffee',
      amount: 5,
      paidById: 'participant-1',
      paidFor: [{ participantId: 'participant-1' }],
      expenseDate: '2026-04-01',
    })
    expect(result.paidFor[0].shares).toBe(1)
  })

  it('accepts null for fields the AI could not extract', () => {
    const result = createExpenseOutputSchema.safeParse({
      title: 'Dinner',
      amount: 45,
      paidById: null,
      paidFor: [],
      expenseDate: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid splitMode value', () => {
    const result = createExpenseOutputSchema.safeParse({
      title: 'Dinner',
      amount: 45,
      paidById: 'participant-1',
      paidFor: [],
      splitMode: 'BY_MAGIC',
      expenseDate: '2026-04-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing title', () => {
    const result = createExpenseOutputSchema.safeParse({
      amount: 45,
      paidById: 'participant-1',
      paidFor: [],
      expenseDate: '2026-04-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing amount', () => {
    const result = createExpenseOutputSchema.safeParse({
      title: 'Dinner',
      paidById: 'participant-1',
      paidFor: [],
      expenseDate: '2026-04-01',
    })
    expect(result.success).toBe(false)
  })
})
