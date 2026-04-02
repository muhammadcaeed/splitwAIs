import { ChatAnthropic } from '@langchain/anthropic'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { Runnable, RunnablePassthrough } from '@langchain/core/runnables'
import { env } from '@/lib/env'
import {
  intentRouterOutputSchema,
  IntentRouterOutput,
} from '../schemas/intent-router.schema'

const SYSTEM_PROMPT = `You are an intent classifier for an expense-sharing app called Spliit.
Classify the user's message into exactly one of these intents:
- CREATE_EXPENSE: The user wants to log a shared expense (e.g. "I paid $45 for dinner with John")
- CREATE_GROUP: The user wants to create a new expense group (e.g. "Create a group called Rome Trip")
- UNKNOWN: The message does not match any supported action

Respond with JSON in this format: {"intent": "CREATE_EXPENSE" | "CREATE_GROUP" | "UNKNOWN", "confidence": 0.0 to 1.0}`

export async function detectIntent(
  input: string,
  model?: Runnable,
): Promise<IntentRouterOutput> {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    ['human', '{input}'],
  ])

  const chatModel =
    model ??
    new ChatAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 512,
    })

  const chain = prompt.pipe(chatModel)

  const response = await chain.invoke({ input })
  const content = typeof response === 'string' ? response : response.content
  const parsed = JSON.parse(content as string)

  return intentRouterOutputSchema.parse(parsed)
}
