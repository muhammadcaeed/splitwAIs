import { intentRouterOutputSchema } from './intent-router.schema'

describe('intentRouterOutputSchema', () => {
  it('accepts a valid CREATE_EXPENSE intent', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_EXPENSE',
      confidence: 0.95,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid CREATE_GROUP intent', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_GROUP',
      confidence: 0.8,
    })
    expect(result.success).toBe(true)
  })

  it('accepts UNKNOWN intent', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'UNKNOWN',
      confidence: 0.3,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unrecognised intent value', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'DELETE_EXPENSE',
      confidence: 0.9,
    })
    expect(result.success).toBe(false)
  })

  it('rejects confidence above 1', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_EXPENSE',
      confidence: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects confidence below 0', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_EXPENSE',
      confidence: -0.1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing confidence', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_EXPENSE',
    })
    expect(result.success).toBe(false)
  })
})
