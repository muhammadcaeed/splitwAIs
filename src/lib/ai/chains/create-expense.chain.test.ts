import { extractExpense, ExpenseExtractionInput } from './create-expense.chain'

// Type check: ensure exports exist
describe('extractExpense', () => {
  it('exports the extractExpense function', () => {
    expect(typeof extractExpense).toBe('function')
  })

  it('accepts ExpenseExtractionInput type', () => {
    const input: ExpenseExtractionInput = {
      text: 'I paid $45 for dinner',
      participants: [{ id: 'p1', name: 'John' }],
      categories: [{ id: 1, name: 'Food' }],
      currency: 'USD',
      today: '2026-04-01',
      currentUserId: 'p1',
    }
    expect(input).toBeDefined()
  })
})
