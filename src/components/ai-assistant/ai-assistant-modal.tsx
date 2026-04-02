'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { parseNaturalLanguageInput } from './ai-assistant-actions'
import { ExpenseConfirmationCard } from './confirmation-cards/expense-confirmation-card'
import { trpc } from '@/trpc/client'
import type { ParseResult } from './ai-assistant-actions'

type Props = {
  open: boolean
  onClose: () => void
  groupId?: string
}

// Type for Web Speech API
type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList
}

type SpeechRecognitionResultList = {
  [index: number]: SpeechRecognitionResult
  length: number
}

type SpeechRecognitionResult = {
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
  length: number
}

type SpeechRecognitionAlternative = {
  transcript: string
  confidence: number
}

export function AiAssistantModal({ open, onClose, groupId }: Props) {
  const [text, setText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef<any>(null)

  // Fetch data needed for confirmation card
  // Note: groups should be passed from parent component or fetched differently
  // For now, we'll fetch categories and the current group if in group context
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const { data: groupData } = trpc.groups.get.useQuery(
    { groupId: groupId! },
    { enabled: !!groupId },
  )

  const groups: Array<{ id: string; name: string }> = []
  const participants = groupData?.group?.participants ?? []
  const categories = categoriesData?.categories ?? []

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSpeechSupported(
        'SpeechRecognition' in (window as any) || 'webkitSpeechRecognition' in (window as any),
      )
    }
  }, [])

  function handleReset() {
    setText('')
    setResult(null)
  }

  function handleClose() {
    handleReset()
    onClose()
  }

  function startRecording() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = navigator.language
    recognition.interimResults = false
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      setText((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    recognition.onend = () => setIsRecording(false)
    recognition.start()
    recognitionRef.current = recognition
    setIsRecording(true)
  }

  function stopRecording() {
    recognitionRef.current?.stop()
    setIsRecording(false)
  }

  async function handleParse() {
    if (!text.trim()) return
    setIsParsing(true)
    setResult(null)
    try {
      const res = await parseNaturalLanguageInput({
        text,
        groupId,
        groups,
        participants,
        categories,
        currency: groupData?.group?.currency ?? 'USD',
        today: new Date().toISOString().split('T')[0],
        currentUserId: '',
      })
      setResult(res)
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader>
          <DrawerTitle>AI Assistant</DrawerTitle>
        </DrawerHeader>

        {result?.type === 'expense' ? (
          <ExpenseConfirmationCard
            parsed={result.data}
            groups={groups}
            participants={participants}
            categories={categories}
            defaultGroupId={groupId}
            onSuccess={handleClose}
            onRetry={handleReset}
          />
        ) : (
          <div className="space-y-3">
            <Textarea
              autoFocus
              placeholder='Try: "I paid $45 for dinner, split with John and Sara"'
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
            />

            {result?.type === 'error' && (
              <p className="text-sm text-destructive">{result.message}</p>
            )}
            {result?.type === 'unknown_intent' && (
              <p className="text-sm text-muted-foreground">
                I didn&apos;t understand that. Try: &quot;I paid $45 for dinner, split with John and Sara.&quot;
              </p>
            )}
            {result?.type === 'rate_limited' && (
              <p className="text-sm text-destructive">
                You&apos;ve reached your daily AI limit. Try again tomorrow.
              </p>
            )}

            <div className="flex gap-2">
              {speechSupported && (
                <Button
                  variant="outline"
                  size="sm"
                  onPointerDown={startRecording}
                  onPointerUp={stopRecording}
                  onPointerLeave={stopRecording}
                >
                  {isRecording ? (
                    <MicOff className="h-4 w-4 text-destructive" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  <span className="ml-2">{isRecording ? 'Recording…' : 'Hold to speak'}</span>
                </Button>
              )}
              <Button
                className="ml-auto"
                size="sm"
                onClick={handleParse}
                disabled={!text.trim() || isParsing}
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Parsing…
                  </>
                ) : (
                  'Parse →'
                )}
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
