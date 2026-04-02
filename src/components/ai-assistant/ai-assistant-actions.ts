'use server'

import { detectIntent } from '@/lib/ai/chains/intent-router'
import { extractExpense } from '@/lib/ai/chains/create-expense.chain'
import { CreateExpenseOutput } from '@/lib/ai/schemas/create-expense.schema'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { headers } from 'next/headers'

export type ParseResult =
  | { type: 'expense'; data: CreateExpenseOutput }
  | { type: 'unknown_intent' }
  | { type: 'rate_limited' }
  | { type: 'error'; message: string }

export type ParseNaturalLanguageInputArgs = {
  text: string
  groupId?: string
  groups: { id: string; name: string }[]
  participants: { id: string; name: string }[]
  categories: { id: number; name: string }[]
  currency: string
  today: string
  currentUserId: string
}

export async function parseNaturalLanguageInput(
  args: ParseNaturalLanguageInputArgs,
): Promise<ParseResult> {
  const { text, participants, categories, currency, today, currentUserId } = args

  // Input validation
  if (!text || text.trim().length === 0) {
    return { type: 'error', message: 'Input is empty' }
  }
  if (text.length > 500) {
    return { type: 'error', message: 'Input is too long (max 500 characters)' }
  }

  // Rate limiting by IP
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for') ??
    headersList.get('x-real-ip') ??
    'unknown'

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const requestCount = await prisma.aiRequestLog.count({
    where: { userId: ip, createdAt: { gte: dayAgo } },
  })

  if (requestCount >= env.AI_RATE_LIMIT_PER_USER_PER_DAY) {
    return { type: 'rate_limited' }
  }

  // Log request before calling the AI (prevents retries from bypassing the limit)
  await prisma.aiRequestLog.create({ data: { userId: ip } })

  // Stage 1: detect intent
  const { intent, confidence } = await detectIntent(
    text.trim().replace(/[\x00-\x1F\x7F]/g, ''),
  )

  if (intent === 'UNKNOWN' || confidence < 0.7) {
    return { type: 'unknown_intent' }
  }

  // Stage 2: extract structured data
  if (intent === 'CREATE_EXPENSE') {
    const data = await extractExpense({
      text,
      participants,
      categories,
      currency,
      today,
      currentUserId,
    })
    return { type: 'expense', data }
  }

  return { type: 'unknown_intent' }
}
