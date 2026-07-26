import { parse } from 'yaml'
import type { ParseResult, SequenceDef, Participant, Step, ArrowType, HighlightColor } from './types'

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
    const from = s.from !== undefined ? String(s.from) : undefined
    const to = s.to !== undefined ? String(s.to) : undefined

    if (from !== undefined && !participantIds.has(from)) {
      throw new Error(`Step ${i + 1}: 未定義の参加者 "${from}"`)
    }
    if (to !== undefined && !participantIds.has(to)) {
      throw new Error(`Step ${i + 1}: 未定義の参加者 "${to}"`)
    }

    if ((from !== undefined && to === undefined) || (from === undefined && to !== undefined)) {
      throw new Error(`Step ${i + 1}: "from" と "to" は両方定義するか、両方省略する必要があります`)
    }

    const arrow: ArrowType | undefined = s.arrow !== undefined
      ? (VALID_ARROWS.includes(s.arrow as ArrowType) ? (s.arrow as ArrowType) : '->>')
      : (from !== undefined ? '->>' : undefined)

    const oldFormat = s.message !== undefined
    const label = oldFormat
      ? (s.message != null ? String(s.message) : '')
      : (s.label != null ? String(s.label) : (from !== undefined ? '' : undefined))

    const title = oldFormat
      ? (s.label != null ? String(s.label) : undefined)
      : (s.title != null ? String(s.title) : undefined)

    let note: Step['note'] = undefined
    if (s.note !== undefined && s.note !== null) {
      if (typeof s.note === 'object') {
        const n = s.note as Record<string, unknown>
        if (!n.text) {
          throw new Error(`Step ${i + 1}: note.text は必須です`)
        }
        const actor = n.actor ? String(n.actor) : (from || '')
        if (!actor) {
          throw new Error(`Step ${i + 1}: note.actor または step.from は必須です`)
        }
        if (!participantIds.has(actor)) {
          throw new Error(`Step ${i + 1}: note.actor で指定された参加者 "${actor}" は未定義です`)
        }
        const toActor = n.toActor ? String(n.toActor) : undefined
        if (toActor && !participantIds.has(toActor)) {
          throw new Error(`Step ${i + 1}: note.toActor で指定された参加者 "${toActor}" は未定義です`)
        }
        const align = n.align ? (String(n.align) as 'over' | 'left' | 'right') : 'over'
        note = {
          text: String(n.text),
          actor,
          toActor,
          align,
        }
      } else if (typeof s.note === 'string') {
        const actor = from || (participants[0]?.id ?? '')
        if (!actor) {
          throw new Error(`Step ${i + 1}: note を文字列で指定する場合、アクターが特定できませんでした`)
        }
        note = {
          text: String(s.note),
          actor,
          align: 'over'
        }
      }
    }

    if (from === undefined && note === undefined) {
      throw new Error(`Step ${i + 1}: "from/to" または "note" を定義する必要があります`)
    }

    return {
      from,
      to,
      arrow,
      label,
      title,
      description: s.description != null ? String(s.description) : undefined,
      note,
      important: s.important === true,
      highlight: (typeof s.highlight === 'string' && ['red','green','yellow','purple','cyan','pink'].includes(s.highlight) ? s.highlight : undefined) as HighlightColor | undefined,
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
