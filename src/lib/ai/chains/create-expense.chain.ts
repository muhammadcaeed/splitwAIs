import { ChatAnthropic } from '@langchain/anthropic'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { Runnable } from '@langchain/core/runnables'
import { env } from '@/lib/env'
import {
  createExpenseOutputSchema,
  CreateExpenseOutput,
} from '../schemas/create-expense.schema'

const SYSTEM_PROMPT = `You are an expense parser for a shared expense app called Spliit.
Extract structured expense information from the user's message.

Today's date: {today}
Group currency: {currency}
Current user participant ID (resolves "I", "me", "myself"): {currentUserId}

Available participants (JSON array):
{participants}

Available categories (JSON array):
{categories}

Rules:
- Match participant names case-insensitively; use their ID in the output
- "everyone" or "all" means include all participants in paidFor
- If a field cannot be determined, return null for that field
- amount must be a number in major currency units (e.g. 45.50 for $45.50)
- expenseDate must be ISO format YYYY-MM-DD; resolve relative dates using today's date
- Default splitMode is EVENLY unless the user specifies shares, percentages, or exact amounts

Respond with JSON matching this structure:
{
  "title": string,
  "amount": number,
  "paidById": string or null,
  "paidFor": [{"participantId": string, "shares": number}],
  "splitMode": "EVENLY" | "BY_SHARES" | "BY_PERCENTAGE" | "BY_AMOUNT",
  "categoryId": number,
  "expenseDate": string (YYYY-MM-DD) or null,
  "notes": string or null,
  "groupId": string or null
}`

export type ExpenseExtractionInput = {
  text: string
  participants: { id: string; name: string }[]
  categories: { id: number; name: string }[]
  currency: string
  today: string
  currentUserId: string
  groupId?: string
}

export async function extractExpense(
  input: ExpenseExtractionInput,
  model?: Runnable,
): Promise<CreateExpenseOutput> {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    ['human', '{text}'],
  ])

  const chatModel =
    model ??
    new ChatAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 512,
    })

  const chain = prompt.pipe(chatModel)

  const response = await chain.invoke({
    text: input.text,
    today: input.today,
    currency: input.currency,
    currentUserId: input.currentUserId,
    participants: JSON.stringify(input.participants),
    categories: JSON.stringify(input.categories),
  })

  const content = typeof response === 'string' ? response : response.content
  const parsed = JSON.parse(content as string)

  return createExpenseOutputSchema.parse(parsed)
}
