export type ArrowType = '->' | '-->' | '->>' | '-->>' | '-x' | '--x' | '-)' | '--)'
export type IconType = 'browser' | 'person' | 'server' | 'database' | 'cloud' | 'mobile' | 'service' | 'queue'

export interface Participant {
  id: string
  label: string
  icon?: IconType
}

export interface NoteDef {
  text: string
  actor: string
  toActor?: string
  align?: 'over' | 'left' | 'right'
}

export type HighlightColor = 'red' | 'green' | 'yellow' | 'purple' | 'cyan' | 'pink'

export interface Step {
  from?: string
  to?: string
  arrow?: ArrowType
  label?: string
  title?: string
  description?: string
  note?: NoteDef
  important?: boolean
  highlight?: HighlightColor
}

export interface SequenceDef {
  title: string
  description?: string
  participants: Participant[]
  steps: Step[]
}

export interface ParseError {
  message: string
}

export type ParseResult =
  | { ok: true; value: SequenceDef[] }
  | { ok: false; error: ParseError }

export interface ArrowStyle {
  dashed: boolean
  head: 'filled' | 'open' | 'cross' | 'async'
}
