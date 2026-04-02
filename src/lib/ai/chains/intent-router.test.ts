import { RunnableLambda } from '@langchain/core/runnables'
import { detectIntent } from './intent-router'

function makeMockModel(responseJson: object) {
  return RunnableLambda.from(async () => ({
    content: JSON.stringify(responseJson),
  }))
}

describe('detectIntent', () => {
  it('returns CREATE_EXPENSE intent for an expense message', async () => {
    const mockModel = makeMockModel({ intent: 'CREATE_EXPENSE', confidence: 0.95 })
    const result = await detectIntent('I paid $45 for dinner with John', mockModel)
    expect(result.intent).toBe('CREATE_EXPENSE')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('returns CREATE_GROUP intent for a group creation message', async () => {
    const mockModel = makeMockModel({ intent: 'CREATE_GROUP', confidence: 0.9 })
    const result = await detectIntent('Create a group called Trip to Paris', mockModel)
    expect(result.intent).toBe('CREATE_GROUP')
  })

  it('returns UNKNOWN for an unrecognised message', async () => {
    const mockModel = makeMockModel({ intent: 'UNKNOWN', confidence: 0.2 })
    const result = await detectIntent('What is the weather today?', mockModel)
    expect(result.intent).toBe('UNKNOWN')
  })
})
