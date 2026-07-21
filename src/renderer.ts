import type { SequenceDef, ArrowType, ArrowStyle } from './types'
import { iconSVGEmbedded } from './icons'

// Layout constants
const BOX_W = 112
const BOX_H = 54
const ICON_SIZE = 18
const STEP_GAP = 72
const PAD_TOP = 20
const PAD_SIDE = 70
const PAD_BOTTOM = 48
const SELF_LOOP_W = 44
const SELF_LOOP_H = 28

const COLOR_ACTIVE = '#3b82f6'
const COLOR_ACTIVE_DIM = '#93c5fd'
const COLOR_INACTIVE_LINE = '#374151'
const COLOR_INACTIVE_TEXT = '#4b5563'
const COLOR_LIFELINE = '#1f2937'
const COLOR_BOX_BG = '#161b22'
const COLOR_BOX_STROKE = '#30363d'
const COLOR_BOX_ACTIVE = '#1e3a5f'
const COLOR_BOX_STROKE_ACTIVE = '#3b82f6'
const COLOR_TEXT_ACTIVE = '#e2e8f0'
const COLOR_TEXT_INACTIVE = '#6b7280'

function arrowStyle(arrow: ArrowType): ArrowStyle {
  switch (arrow) {
    case '->':   return { dashed: false, head: 'open' }
    case '-->':  return { dashed: true,  head: 'open' }
    case '->>':  return { dashed: false, head: 'filled' }
    case '->>': return { dashed: true,  head: 'filled' }
    case '-->>': return { dashed: true,  head: 'filled' }
    case '-x':   return { dashed: false, head: 'cross' }
    case '--x':  return { dashed: true,  head: 'cross' }
    case '-)':   return { dashed: false, head: 'async' }
    case '--)':  return { dashed: true,  head: 'async' }
    default:     return { dashed: false, head: 'filled' }
  }
}

function markerDefs(): string {
  const variants: Array<{ id: string; color: string; head: ArrowStyle['head'] }> = [
    { id: 'a-filled',   color: COLOR_ACTIVE,        head: 'filled' },
    { id: 'i-filled',   color: COLOR_INACTIVE_LINE, head: 'filled' },
    { id: 'a-open',     color: COLOR_ACTIVE,        head: 'open' },
    { id: 'i-open',     color: COLOR_INACTIVE_LINE, head: 'open' },
    { id: 'a-cross',    color: COLOR_ACTIVE,        head: 'cross' },
    { id: 'i-cross',    color: COLOR_INACTIVE_LINE, head: 'cross' },
    { id: 'a-async',    color: COLOR_ACTIVE,        head: 'async' },
    { id: 'i-async',    color: COLOR_INACTIVE_LINE, head: 'async' },
  ]

  return variants.map(({ id, color, head }) => {
    let inner = ''
    if (head === 'filled') {
      inner = `<polygon points="0 0, 10 4, 0 8" fill="${color}"/>`
      return `<marker id="${id}" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">${inner}</marker>`
    } else if (head === 'open') {
      inner = `<polyline points="1 1, 9 4, 1 7" fill="none" stroke="${color}" stroke-width="1.5"/>`
      return `<marker id="${id}" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">${inner}</marker>`
    } else if (head === 'cross') {
      inner = `<line x1="1" y1="1" x2="7" y2="7" stroke="${color}" stroke-width="1.5"/><line x1="7" y1="1" x2="1" y2="7" stroke="${color}" stroke-width="1.5"/>`
      return `<marker id="${id}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">${inner}</marker>`
    } else {
      // async: only top half
      inner = `<path d="M1 4 L9 1" fill="none" stroke="${color}" stroke-width="1.5"/>`
      return `<marker id="${id}" markerWidth="10" markerHeight="6" refX="8" refY="3" orient="auto">${inner}</marker>`
    }
  }).join('\n')
}

function markerId(active: boolean, head: ArrowStyle['head']): string {
  return `${active ? 'a' : 'i'}-${head}`
}

export interface RenderOptions {
  width: number
  currentStep: number  // 0-indexed; -1 = show participants only
  prevStep?: number
}

export function renderSVG(seq: SequenceDef, opts: RenderOptions): string {
  const { width, currentStep, prevStep } = opts
  const n = seq.participants.length
  const totalSteps = seq.steps.length

  // x position for each participant
  const available = width - PAD_SIDE * 2
  const colW = n > 1 ? available / (n - 1) : 0
  const pX = (i: number) => n === 1 ? width / 2 : PAD_SIDE + i * colW

  const firstStepY = PAD_TOP + BOX_H + 32
  const svgHeight = firstStepY + totalSteps * STEP_GAP + PAD_BOTTOM

  const lifelineBottom = svgHeight - PAD_BOTTOM

  // ── participants ──────────────────────────────────────────────
  const participantsG = seq.participants.map((p, i) => {
    const cx = pX(i)
    const isActive = currentStep >= 0 &&
      (seq.steps[currentStep].from === p.id || seq.steps[currentStep].to === p.id)
    
    const wasActive = prevStep !== undefined && prevStep >= 0 && prevStep < seq.steps.length &&
      (seq.steps[prevStep].from === p.id || seq.steps[prevStep].to === p.id)

    const activeClass = isActive ? (wasActive ? 'active no-anim' : 'active') : ''

    const boxColor = isActive ? COLOR_BOX_ACTIVE : COLOR_BOX_BG
    const strokeColor = isActive ? COLOR_BOX_STROKE_ACTIVE : COLOR_BOX_STROKE
    const strokeW = isActive ? 1.5 : 1
    const labelColor = isActive ? COLOR_TEXT_ACTIVE : COLOR_TEXT_INACTIVE
    const iconColor = isActive ? COLOR_ACTIVE_DIM : '#4b5563'

    const rx = cx - BOX_W / 2
    const ry = PAD_TOP

    const iconY = PAD_TOP + 12
    const textY = PAD_TOP + BOX_H - 12

    return `
      <rect class="actor-box ${activeClass}" x="${rx}" y="${ry}" width="${BOX_W}" height="${BOX_H}"
        rx="8" fill="${boxColor}" stroke="${strokeColor}" stroke-width="${strokeW}"/>
      ${iconSVGEmbedded(p.icon, cx, iconY + ICON_SIZE / 2, ICON_SIZE, iconColor)}
      <text class="actor-text ${activeClass}" x="${cx}" y="${textY}"
        text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, sans-serif" font-size="11" font-weight="500"
        fill="${labelColor}">${escXML(p.label)}</text>
    `
  }).join('')

  // ── lifelines ─────────────────────────────────────────────────
  const lifelinesG = seq.participants.map((_, i) => {
    const cx = pX(i)
    return `<line x1="${cx}" y1="${PAD_TOP + BOX_H}" x2="${cx}" y2="${lifelineBottom}"
      stroke="${COLOR_LIFELINE}" stroke-width="1" stroke-dasharray="4 4"/>`
  }).join('')

  // ── steps ─────────────────────────────────────────────────────
  const stepsG = seq.steps.map((step, idx) => {
    const active = idx === currentStep
    const fromIdx = step.from !== undefined ? seq.participants.findIndex((p) => p.id === step.from) : -1
    const toIdx = step.to !== undefined ? seq.participants.findIndex((p) => p.id === step.to) : -1
    const y = firstStepY + idx * STEP_GAP
    const hasArrow = fromIdx !== -1 && toIdx !== -1
    const isSelf = hasArrow && fromIdx === toIdx
    const lineColor = active ? COLOR_ACTIVE : COLOR_INACTIVE_LINE
    const textColor = active ? COLOR_ACTIVE_DIM : COLOR_INACTIVE_TEXT
    const numStr = (step.important ? '★ ' : '') + String(idx + 1)
    const badgeW = numStr.length * 6 + (step.important ? 14 : 12)
    const badgeH = 16
    const badgeBg = active ? (step.important ? '#ea580c' : COLOR_ACTIVE) : (step.important ? '#2d1910' : '#262626')
    const badgeStroke = active ? (step.important ? '#fdba74' : COLOR_ACTIVE_DIM) : (step.important ? '#c2410c' : '#404040')
    const badgeTextColor = active ? '#ffffff' : (step.important ? '#f97316' : '#a3a3a3')

    let elementMarkup = ''

    if (hasArrow) {
      const style = arrowStyle(step.arrow ?? '->>')
      const dash = style.dashed ? 'stroke-dasharray="6 3"' : ''
      const mId = markerId(active, style.head)
      const msgEscaped = escXML(step.label ?? '')

      if (isSelf) {
        const cx = pX(fromIdx)
        const x1 = cx
        const x2 = cx + SELF_LOOP_W
        const y1 = y - SELF_LOOP_H / 2
        const y2 = y + SELF_LOOP_H / 2
        const bx = x2 + 8
        const by = y - 16

        elementMarkup = `
          <path class="step-line ${active ? 'active' : ''}" d="M${x1},${y1} H${x2} V${y2} H${x1}"
            fill="none" stroke="${lineColor}" stroke-width="1.5" ${dash}
            marker-end="url(#${mId})"/>
          <!-- Badge -->
          <rect class="step-badge-bg ${active ? 'active' : ''} ${step.important ? 'important' : ''}" x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="4"
            fill="${badgeBg}" stroke="${badgeStroke}" stroke-width="1"/>
          <text class="step-badge-text ${active ? 'active' : ''} ${step.important ? 'important' : ''}" x="${bx + badgeW / 2}" y="${by + badgeH / 2}"
            text-anchor="middle" dominant-baseline="central"
            font-family="Inter, sans-serif" font-size="9" font-weight="600"
            fill="${badgeTextColor}">${numStr}</text>
          <!-- Message -->
          <text class="step-text ${active ? 'active' : ''}" x="${bx}" y="${y + 8}"
            dominant-baseline="central" text-anchor="start"
            font-family="Inter, sans-serif" font-size="11" fill="${textColor}">${msgEscaped}</text>
        `
      } else {
        const fromX = pX(fromIdx)
        const toX = pX(toIdx)
        const goRight = toX > fromX
        const x1 = fromX
        const x2 = goRight ? toX - 2 : toX + 2
        const midX = (fromX + toX) / 2
        const bx = midX - badgeW / 2
        const by = y - 40

        elementMarkup = `
          <line class="step-line ${active ? 'active' : ''}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"
            stroke="${lineColor}" stroke-width="1.5" ${dash}
            marker-end="url(#${mId})"/>
          <!-- Badge -->
          <rect class="step-badge-bg ${active ? 'active' : ''} ${step.important ? 'important' : ''}" x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="4"
            fill="${badgeBg}" stroke="${badgeStroke}" stroke-width="1"/>
          <text class="step-badge-text ${active ? 'active' : ''} ${step.important ? 'important' : ''}" x="${midX}" y="${by + badgeH / 2}"
            text-anchor="middle" dominant-baseline="central"
            font-family="Inter, sans-serif" font-size="9" font-weight="600"
            fill="${badgeTextColor}">${numStr}</text>
          <!-- Message -->
          <text class="step-text ${active ? 'active' : ''}" x="${midX}" y="${y - 8}"
            text-anchor="middle"
            font-family="Inter, sans-serif" font-size="11" fill="${textColor}">${msgEscaped}</text>
        `
      }
    }

    let noteMarkup = ''
    if (step.note) {
      const n = step.note
      const actorIdx = seq.participants.findIndex((p) => p.id === n.actor)
      if (actorIdx !== -1) {
        const cx = pX(actorIdx)
        const lines = n.text.split('\n')
        const maxLen = Math.max(...lines.map(l => l.length))
        const boxW = Math.max(120, maxLen * 7.5 + 24)
        const boxH = lines.length * 15 + 16
        
        let boxX = 0
        const boxY = y - boxH / 2
        let textAnchor = 'middle'
        let textX = 0
        
        if (n.align === 'left') {
          boxX = cx - boxW - 16
          textAnchor = 'start'
          textX = boxX + 12
        } else if (n.align === 'right') {
          boxX = cx + 16
          textAnchor = 'start'
          textX = boxX + 12
        } else if (n.toActor) {
          const toActorIdx = seq.participants.findIndex((p) => p.id === n.toActor)
          if (toActorIdx !== -1) {
            const cx2 = pX(toActorIdx)
            const midX = (cx + cx2) / 2
            boxX = midX - boxW / 2
            textX = midX
            textAnchor = 'middle'
          } else {
            boxX = cx - boxW / 2
            textX = cx
            textAnchor = 'middle'
          }
        } else {
          boxX = cx - boxW / 2
          textX = cx
          textAnchor = 'middle'
        }
        
        const w = boxW
        const h = boxH
        const x = boxX
        const yy = boxY
        
        const noteBg = active ? '#2d2912' : '#222015'
        const noteStroke = active ? '#d4af37' : '#5c542a'
        const noteFold = active ? '#f0c243' : '#7d7039'
        const noteTextColor = active ? '#fef08a' : '#d9ce8f'
        
        let textLinesMarkup = ''
        lines.forEach((line, lineIdx) => {
          const lineY = yy + 13 + lineIdx * 15
          const lineEsc = escXML(line)
          textLinesMarkup += `
            <text x="${textX}" y="${lineY}" text-anchor="${textAnchor}" dominant-baseline="central"
              font-family="Inter, sans-serif" font-size="10.5" fill="${noteTextColor}">${lineEsc}</text>
          `
        })
        
        noteMarkup = `
          <!-- Note Box -->
          <g class="step-note ${active ? 'active' : ''}">
            <path d="M ${x},${yy} H ${x + w - 6} L ${x + w},${yy + 6} V ${yy + h} H ${x} Z" fill="${noteBg}" stroke="${noteStroke}" stroke-width="1"/>
            <path d="M ${x + w - 6},${yy} V ${yy + 6} H ${x + w} Z" fill="${noteFold}"/>
            ${textLinesMarkup}
          </g>
        `
      }
    }

    return `
      <g class="step-group" data-step-idx="${idx}" style="cursor: pointer;">
        <!-- Click target and hover highlight -->
        <rect class="step-click-rect" x="0" y="${y - 42}" width="${width}" height="62" fill="transparent" pointer-events="all"/>
        ${elementMarkup}
        ${noteMarkup}
      </g>
    `
  }).join('')


  // ── active highlight bar ──────────────────────────────────────
  let highlightG = ''
  if (currentStep >= 0 && currentStep < totalSteps) {
    const y = firstStepY + currentStep * STEP_GAP
    highlightG = `<rect class="active-highlight" x="0" y="${y - 42}" width="${width}" height="62"
      fill="${COLOR_ACTIVE}10" rx="4"/>`
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg"
  width="${width}" height="${svgHeight}"
  viewBox="0 0 ${width} ${svgHeight}">
  <defs>${markerDefs()}</defs>
  ${highlightG}
  <g class="lifelines">${lifelinesG}</g>
  <g class="steps">${stepsG}</g>
  <g class="participants">${participantsG}</g>
</svg>`.trim()
}

function escXML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
