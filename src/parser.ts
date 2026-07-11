import { parse } from 'yaml'
import type { ParseResult, SequenceDef, Participant, Step, ArrowType } from './types'

const VALID_ARROWS: ArrowType[] = ['->', '-->', '->>', '-->>', '-x', '--x', '-)', '--)']

function validateAndParseSingle(raw: unknown): SequenceDef {
  if (!raw || typeof raw !== 'object') {
    throw new Error('YAMLはオブジェクトである必要があります')
  }
  const obj = raw as Record<string, unknown>

  const title = obj.title != null ? String(obj.title) : 'Untitled'
  const description = obj.description != null ? String(obj.description) : undefined

  if (!Array.isArray(obj.participants)) {
    throw new Error('"participants" は配列である必要があります')
  }

  const participants: Participant[] = (obj.participants as Record<string, unknown>[]).map(
    (p, i) => ({
      id: p.id != null ? String(p.id) : `p${i}`,
      label: p.label != null ? String(p.label) : p.id != null ? String(p.id) : `P${i}`,
      icon: p.icon != null ? (p.icon as Participant['icon']) : undefined,
    })
  )

  if (!Array.isArray(obj.steps)) {
    throw new Error('"steps" は配列である必要があります')
  }

  const participantIds = new Set(participants.map((p) => p.id))

  const steps: Step[] = (obj.steps as Record<string, unknown>[]).map((s, i) => {
    const from = String(s.from ?? '')
    const to = String(s.to ?? '')
    const arrow: ArrowType = VALID_ARROWS.includes(s.arrow as ArrowType)
      ? (s.arrow as ArrowType)
      : '->>'

    if (!participantIds.has(from)) {
      throw new Error(`Step ${i + 1}: 未定義の参加者 "${from}"`)
    }
    if (!participantIds.has(to)) {
      throw new Error(`Step ${i + 1}: 未定義の参加者 "${to}"`)
    }

    const oldFormat = s.message !== undefined
    const label = oldFormat
      ? (s.message != null ? String(s.message) : '')
      : (s.label != null ? String(s.label) : '')

    const title = oldFormat
      ? (s.label != null ? String(s.label) : undefined)
      : (s.title != null ? String(s.title) : undefined)

    return {
      from,
      to,
      arrow,
      label,
      title,
      description: s.description != null ? String(s.description) : undefined,
    }
  })

  return { title, description, participants, steps }
}

export function parseYAML(text: string): ParseResult {
  try {
    // Split by multi-document separator: "---"
    const docs = text.split(/(?:^|\r?\n)---\r?\n/)
    const results: SequenceDef[] = []

    for (const doc of docs) {
      const trimmed = doc.trim()
      if (!trimmed) continue

      const parsed = parse(trimmed)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          results.push(validateAndParseSingle(item))
        }
      } else if (parsed && typeof parsed === 'object') {
        results.push(validateAndParseSingle(parsed))
      }
    }

    if (results.length === 0) {
      return { ok: false, error: { message: '有効なシーケンス定義が見つかりませんでした' } }
    }

    return { ok: true, value: results }
  } catch (e: unknown) {
    return {
      ok: false,
      error: { message: e instanceof Error ? e.message : 'パースエラー' },
    }
  }
}
