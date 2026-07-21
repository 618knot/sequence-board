import type { SequenceDef } from './types'
import { parseYAML } from './parser'
import { renderSVG } from './renderer'
import { marked } from 'marked'

const DEFAULT_YAML = `title: "ユーザー認証フロー"
description: "ブラウザからのログインリクエストがAPIサーバーを経由してDBに至るフロー"

participants:
  - id: browser
    label: "Browser"
    icon: browser
  - id: api
    label: "API Server"
    icon: server
  - id: db
    label: "Database"
    icon: database

steps:
  - from: browser
    to: api
    arrow: "->>"
    label: "POST /login"
    title: "ログインリクエスト"
    note:
      text: "HTTPS通信で暗号化"
      actor: browser
      align: left
    description: |
      ブラウザがAPIサーバーにHTTPS経由でPOSTリクエストを送ります。
      リクエストボディにはメールアドレスとパスワードが含まれます。

  - from: api
    to: db
    arrow: "->>"
    label: "SELECT user WHERE email=?"
    title: "DBクエリ"
    description: |
      APIサーバーがデータベースにユーザー情報を問い合わせます。
      
      - **セキュリティ**: プリペアドステートメントを使用しSQLインジェクションを防ぎます。
      - **クエリ例**:
        \`\`\`sql
        SELECT * FROM users WHERE email = ?;
        \`\`\`

  - note:
      text: |
        パスワードハッシュの
        検証処理を行います
      actor: api
      align: over
    title: "パスワード検証"
    important: true
    description: |
      DBから取得したハッシュ化パスワードと入力されたパスワードを照合します。

  - from: db
    to: api
    arrow: "-->>"
    label: "user record"
    title: "レコード返却"
    description: |
      データベースがユーザーレコードを返します。
      パスワードハッシュを含む全フィールドが返されます。

  - from: api
    to: browser
    arrow: "-->>"
    label: "200 OK + JWT"
    title: "認証成功"
    description: |
      APIサーバーがJWTトークンを生成し、レスポンスに含めて返します。
      ブラウザはこのトークンをLocalStorageまたはCookieに保存します。
---
title: "注文決済フロー"
description: "ユーザーがカートから決済完了に至る注文フロー"

participants:
  - id: browser
    label: "Browser"
    icon: browser
  - id: api
    label: "API Server"
    icon: server
  - id: payment
    label: "Payment Gateway"
    icon: cloud
  - id: db
    label: "Database"
    icon: database

steps:
  - from: browser
    to: api
    arrow: "->>"
    label: "POST /orders"
    title: "注文作成要求"
    description: "カート情報をもとに注文を作成します。"
  - from: api
    to: db
    arrow: "->>"
    label: "Create pending order"
    title: "注文保留データ保存"
    description: "ステータスを「保留中」にして注文レコードをDBに作成します。"
  - from: api
    to: payment
    arrow: "->>"
    label: "Charge request"
    title: "課金要求"
    important: true
    description: "決済サービスへ課金リクエストを送ります。"
  - from: payment
    to: api
    arrow: "-->>"
    label: "Charge success"
    title: "課金結果受領"
    description: "決済成功のレスポンスを受け取ります。"
  - from: api
    to: db
    arrow: "->>"
    label: "Update order status to paid"
    title: "ステータス更新"
    description: "注文ステータスを「決済完了」に更新します。"
  - from: api
    to: browser
    arrow: "-->>"
    label: "Order confirmation"
    title: "注文完了レスポンス"
    description: "注文完了画面を表示します。"
`;

export interface AppState {
  yaml: string
  seqs: SequenceDef[]
  currentSeqIndex: number
  parseError: string | null
  currentStep: number  // -1 = before any step
  activeTab: 'description' | 'editor'
  autoPlaying: boolean
}

export class App {
  private state: AppState = {
    yaml: DEFAULT_YAML,
    seqs: [],
    currentSeqIndex: 0,
    parseError: null,
    currentStep: -1,
    activeTab: 'description',
    autoPlaying: false,
  }

  private autoTimer: ReturnType<typeof setInterval> | null = null
  private prevStep = -1
  private diagramEl!: HTMLElement
  private diagramTabsEl!: HTMLElement
  private yamlHighlightEl!: HTMLElement
  private titleEl!: HTMLElement
  private stepCounterEl!: HTMLElement
  private descPanelEl!: HTMLElement
  private editorPanelEl!: HTMLElement
  private rightPanelEl!: HTMLElement
  private yamlTextareaEl!: HTMLTextAreaElement
  private errorBannerEl!: HTMLElement
  private stepDotsEl!: HTMLElement
  private stepLabelEl!: HTMLElement
  private prevBtnEl!: HTMLButtonElement
  private nextBtnEl!: HTMLButtonElement
  private playBtnEl!: HTMLButtonElement
  private tabDescEl!: HTMLElement
  private tabEditorEl!: HTMLElement

  mount(root: HTMLElement): void {
    root.innerHTML = this.buildHTML()
    this.bindElements(root)
    this.bindEvents()
    this.loadYAML(this.state.yaml)
  }

  private buildHTML(): string {
    return `
<div class="app-shell">
  <!-- Header -->
  <header class="app-header" id="app-header">
    <div class="header-left">
    </div>
    <div class="header-center" id="diagram-title-row">
      <span class="header-diagram-title" id="diagram-title">—</span>
    </div>
    <div class="header-right">
      <span class="header-step-counter" id="step-counter"></span>
      <label class="btn btn-ghost" id="btn-open-yaml" title="YAMLファイルを開く">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        Open YAML
        <input type="file" id="file-input" accept=".yaml,.yml" class="sr-only" />
      </label>
      <button class="btn btn-primary" id="btn-toggle-editor">Editor</button>
    </div>
  </header>

  <!-- Error banner -->
  <div class="error-banner hidden" id="error-banner">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span id="error-text"></span>
  </div>

  <!-- Body -->
  <div class="app-body">
    <!-- Left: SVG diagram -->
    <div class="diagram-panel" id="diagram-panel">
      <div class="diagram-tabs-row hidden" id="diagram-tabs"></div>
      <div class="diagram-scroll" id="diagram-scroll">
        <div id="diagram-svg-container"></div>
      </div>
    </div>

    <!-- Resizer -->
    <div class="resizer" id="panel-resizer"></div>

    <!-- Right: tabs panel -->
    <div class="right-panel" id="right-panel">
      <div class="tabs-row">
        <button class="tab-btn tab-active" id="tab-desc">Description</button>
        <button class="tab-btn" id="tab-editor">YAML Editor</button>
      </div>

      <!-- Description -->
      <div class="tab-content tab-fade-in" id="desc-panel">
        <div id="desc-content" class="desc-content"></div>
      </div>

      <!-- YAML Editor -->
      <div class="tab-content hidden tab-fade-in" id="editor-panel">
        <div class="editor-toolbar">
          <span class="editor-lang-badge">YAML</span>
          <div class="editor-toolbar-right">
            <button class="btn btn-ghost btn-sm" id="btn-export-yaml">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
          </div>
        </div>
        <div class="code-editor-container">
          <pre class="code-editor-highlight" id="yaml-highlight" aria-hidden="true"><code></code></pre>
          <textarea class="code-editor-textarea" id="yaml-editor" spellcheck="false"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom navbar (fixed) -->
  <nav class="bottom-nav" id="bottom-nav">
    <button class="btn btn-ghost" id="btn-prev" disabled>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      Prev
    </button>

    <div class="step-dots" id="step-dots"></div>

    <span class="step-label" id="step-label"></span>

    <button class="btn btn-primary" id="btn-next">
      Next
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <button class="btn btn-ghost" id="btn-play">
      <svg class="icon-play" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <svg class="icon-pause hidden" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      <span class="play-label">Auto Play</span>
    </button>
  </nav>
</div>`
  }

  private bindElements(root: HTMLElement): void {
    this.diagramEl = root.querySelector('#diagram-svg-container')!
    this.titleEl = root.querySelector('#diagram-title')!
    this.stepCounterEl = root.querySelector('#step-counter')!
    this.descPanelEl = root.querySelector('#desc-panel')!
    this.editorPanelEl = root.querySelector('#editor-panel')!
    this.yamlTextareaEl = root.querySelector('#yaml-editor')!
    this.errorBannerEl = root.querySelector('#error-banner')!
    this.stepDotsEl = root.querySelector('#step-dots')!
    this.stepLabelEl = root.querySelector('#step-label')!
    this.prevBtnEl = root.querySelector('#btn-prev')!
    this.nextBtnEl = root.querySelector('#btn-next')!
    this.playBtnEl = root.querySelector('#btn-play')!
    this.tabDescEl = root.querySelector('#tab-desc')!
    this.tabEditorEl = root.querySelector('#tab-editor')!
    this.rightPanelEl = root.querySelector('#right-panel')!
    this.diagramTabsEl = root.querySelector('#diagram-tabs')!
    this.yamlHighlightEl = root.querySelector('#yaml-highlight')!
  }

  private bindEvents(): void {
    this.prevBtnEl.addEventListener('click', () => this.navigate(-1))
    this.nextBtnEl.addEventListener('click', () => this.navigate(1))
    this.playBtnEl.addEventListener('click', () => this.toggleAutoPlay())
    this.tabDescEl.addEventListener('click', () => this.switchTab('description'))
    this.tabEditorEl.addEventListener('click', () => this.switchTab('editor'))

    // File open
    const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        this.loadYAML(text)
        this.yamlTextareaEl.value = text
      }
      reader.readAsText(file)
    })

    // Editor toggle
    document.querySelector('#btn-toggle-editor')!.addEventListener('click', () => {
      this.switchTab(this.state.activeTab === 'editor' ? 'description' : 'editor')
    })

    // YAML editor – debounced
    let debounce: ReturnType<typeof setTimeout>
    this.yamlTextareaEl.addEventListener('input', () => {
      this.updateHighlight()
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        this.loadYAML(this.yamlTextareaEl.value)
      }, 600)
    })

    // Sync scroll
    this.yamlTextareaEl.addEventListener('scroll', () => {
      this.yamlHighlightEl.scrollTop = this.yamlTextareaEl.scrollTop
      this.yamlHighlightEl.scrollLeft = this.yamlTextareaEl.scrollLeft
    })

    // Export
    document.querySelector('#btn-export-yaml')!.addEventListener('click', () => {
      const blob = new Blob([this.state.yaml], { type: 'text/yaml' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = (this.state.seqs[this.state.currentSeqIndex]?.title ?? 'sequence') + '.yaml'
      a.click()
    })

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.target === this.yamlTextareaEl) return
      if (e.key === 'ArrowRight' || e.key === 'l') this.navigate(1)
      if (e.key === 'ArrowLeft' || e.key === 'h') this.navigate(-1)
      if (e.key === ' ') { e.preventDefault(); this.toggleAutoPlay() }
    })

    // Click on diagram elements
    this.diagramEl.addEventListener('click', (e) => {
      const stepGroup = (e.target as Element).closest('.step-group')
      if (stepGroup) {
        const stepIdx = stepGroup.getAttribute('data-step-idx')
        if (stepIdx !== null) {
          this.state.currentStep = Number(stepIdx)
          this.stopAutoPlay()
          this.renderAll()
        }
      }
    })

    // Panel Resizing Logic
    const resizer = document.querySelector('#panel-resizer')!
    let isResizing = false

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true
      document.body.style.cursor = 'col-resize'
      resizer.classList.add('resizing')
      e.preventDefault()
    })

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return
      const width = window.innerWidth - e.clientX
      if (width >= 320 && width <= 800) {
        this.rightPanelEl.style.width = `${width}px`
        this.renderDiagram()
      }
    })

    document.addEventListener('mouseup', () => {
      if (!isResizing) return
      isResizing = false
      document.body.style.cursor = ''
      resizer.classList.remove('resizing')
    })

    // Resize → re-render SVG
    window.addEventListener('resize', () => this.renderDiagram())
  }

  private loadYAML(text: string): void {
    this.state.yaml = text
    this.yamlTextareaEl.value = text

    const result = parseYAML(text)
    if (!result.ok) {
      this.state.parseError = result.error.message
      this.state.seqs = []
      this.showError(result.error.message)
      return
    }

    this.state.parseError = null
    this.state.seqs = result.value
    this.state.currentSeqIndex = 0
    this.state.currentStep = -1
    this.prevStep = -1
    this.stopAutoPlay()
    this.hideError()
    this.updateHighlight()
    this.renderAll()
  }

  private navigate(delta: number): void {
    const seq = this.state.seqs[this.state.currentSeqIndex]
    const { currentStep } = this.state
    if (!seq) return
    const next = currentStep + delta
    if (next < -1 || next >= seq.steps.length) return
    this.state.currentStep = next
    this.renderAll()
  }

  private toggleAutoPlay(): void {
    if (this.state.autoPlaying) {
      this.stopAutoPlay()
    } else {
      this.startAutoPlay()
    }
  }

  private startAutoPlay(): void {
    const seq = this.state.seqs[this.state.currentSeqIndex]
    if (!seq) return
    this.state.autoPlaying = true
    this.updatePlayButton()

    this.autoTimer = setInterval(() => {
      if (this.state.currentStep >= (seq?.steps.length ?? 0) - 1) {
        this.stopAutoPlay()
        return
      }
      this.navigate(1)
    }, 1800)
  }

  private stopAutoPlay(): void {
    this.state.autoPlaying = false
    if (this.autoTimer !== null) {
      clearInterval(this.autoTimer)
      this.autoTimer = null
    }
    this.updatePlayButton()
  }

  private updatePlayButton(): void {
    const iconPlay = this.playBtnEl.querySelector('.icon-play')!
    const iconPause = this.playBtnEl.querySelector('.icon-pause')!
    const label = this.playBtnEl.querySelector('.play-label')!
    if (this.state.autoPlaying) {
      iconPlay.classList.add('hidden')
      iconPause.classList.remove('hidden')
      label.textContent = 'Pause'
      this.playBtnEl.classList.add('btn-active')
    } else {
      iconPlay.classList.remove('hidden')
      iconPause.classList.add('hidden')
      label.textContent = 'Auto Play'
      this.playBtnEl.classList.remove('btn-active')
    }
  }

  private switchTab(tab: 'description' | 'editor'): void {
    this.state.activeTab = tab
    if (tab === 'description') {
      this.descPanelEl.classList.remove('hidden')
      this.editorPanelEl.classList.add('hidden')
      this.tabDescEl.classList.add('tab-active')
      this.tabEditorEl.classList.remove('tab-active')
    } else {
      this.descPanelEl.classList.add('hidden')
      this.editorPanelEl.classList.remove('hidden')
      this.tabDescEl.classList.remove('tab-active')
      this.tabEditorEl.classList.add('tab-active')
    }
  }
  private renderAll(): void {
    this.renderDiagramTabs()
    this.renderDiagram()
    this.renderHeader()
    this.renderNavbar()
    this.renderDescription()
  }

  private renderDiagramTabs(): void {
    const seqs = this.state.seqs
    if (seqs.length <= 1) {
      this.diagramTabsEl.classList.add('hidden')
      return
    }

    this.diagramTabsEl.classList.remove('hidden')
    this.diagramTabsEl.innerHTML = seqs.map((seq, i) => {
      const active = i === this.state.currentSeqIndex
      const cls = active ? 'diagram-tab diagram-tab-active' : 'diagram-tab'
      return `<button class="${cls}" data-seq-idx="${i}">${esc(seq.title)}</button>`
    }).join('')

    this.diagramTabsEl.querySelectorAll('[data-seq-idx]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number((el as HTMLElement).dataset.seqIdx)
        this.state.currentSeqIndex = idx
        this.state.currentStep = -1
        this.prevStep = -1
        this.stopAutoPlay()
        this.renderAll()
      })
    })
  }

  private renderDiagram(): void {
    const seq = this.state.seqs[this.state.currentSeqIndex]
    const { currentStep } = this.state
    if (!seq) { this.diagramEl.innerHTML = ''; return }

    const w = this.diagramEl.parentElement?.clientWidth ?? 800
    this.diagramEl.innerHTML = renderSVG(seq, { width: w, currentStep, prevStep: this.prevStep })
    this.prevStep = currentStep
  }

  private renderHeader(): void {
    const seq = this.state.seqs[this.state.currentSeqIndex]
    const { currentStep } = this.state
    if (!seq) { this.titleEl.textContent = '—'; return }
    this.titleEl.textContent = seq.title
    const step = currentStep >= 0 ? seq.steps[currentStep] : null
    this.stepCounterEl.textContent = step
      ? `Step ${currentStep + 1} / ${seq.steps.length}`
      : `${seq.steps.length} steps`
  }

  private renderNavbar(): void {
    const seq = this.state.seqs[this.state.currentSeqIndex]
    const { currentStep } = this.state
    const total = seq?.steps.length ?? 0

    // Dots
    this.stepDotsEl.innerHTML = Array.from({ length: total }, (_, i) => {
      const active = i === currentStep
      const visited = i < currentStep
      const important = seq.steps[i]?.important ? 'dot-important' : ''
      const cls = `${active ? 'dot dot-active' : visited ? 'dot dot-visited' : 'dot dot-idle'} ${important}`
      return `<button class="${cls}" data-step="${i}" title="Step ${i + 1}"></button>`
    }).join('')

    this.stepDotsEl.querySelectorAll('[data-step]').forEach((el) => {
      el.addEventListener('click', () => {
        this.state.currentStep = Number((el as HTMLElement).dataset.step)
        this.stopAutoPlay()
        this.renderAll()
      })
    })

    // Label
    if (currentStep >= 0 && seq) {
      const step = seq.steps[currentStep]
      this.stepLabelEl.textContent = step.title ?? step.label ?? ''
    } else {
      this.stepLabelEl.textContent = seq ? 'スタート前' : ''
    }

    // Buttons
    this.prevBtnEl.disabled = currentStep <= -1
    this.nextBtnEl.disabled = !seq || currentStep >= total - 1
  }

  private renderDescription(): void {
    const seq = this.state.seqs[this.state.currentSeqIndex]
    const { currentStep } = this.state
    const descEl = this.descPanelEl.querySelector('#desc-content')!

    if (!seq) {
      descEl.innerHTML = '<p class="desc-placeholder">YAMLを読み込んでください</p>'
      return
    }

    if (currentStep < 0) {
      const desc = seq.description
        ? `<div class="desc-seq-desc prose">${marked.parse(seq.description) as string}</div>` : ''
      descEl.innerHTML = `
        <div class="desc-animate">
          <div class="desc-start">
            <div class="desc-start-icon">▶</div>
            <p class="desc-start-title">${esc(seq.title)}</p>
            ${desc}
            <p class="desc-start-hint">「Next」でシーケンスを開始</p>
          </div>
        </div>`
      return
    }

    const step = seq.steps[currentStep]
    const hasArrow = step.from !== undefined && step.to !== undefined
    let arrowRow = ''

    if (hasArrow) {
      const fromP = seq.participants.find((p) => p.id === step.from)
      const toP = seq.participants.find((p) => p.id === step.to)
      const arrowSymbol: Record<string, string> = {
        '->': '→', '-->': '--→', '->>': '→▶', '-->>': '--→▶',
        '-x': '→✕', '--x': '--→✕', '-)': '→)', '---)': '--→)',
      };
      const arrow = step.arrow ?? '->>'
      arrowRow = `
        <div class="desc-arrow-row">
          <span class="desc-participant">${esc(fromP?.label ?? step.from ?? '')}</span>
          <span class="desc-arrow-symbol">${arrowSymbol[arrow] ?? '→'}</span>
          <span class="desc-participant">${esc(toP?.label ?? step.to ?? '')}</span>
          <code class="desc-arrow-code">${esc(arrow)}</code>
        </div>
        <div class="desc-divider"></div>
      `;
    } else if (step.note) {
      const n = step.note
      const actorP = seq.participants.find((p) => p.id === n.actor)
      const alignLabel = n.align === 'left' ? 'の左側' : n.align === 'right' ? 'の右側' : 'のライフライン上'
      arrowRow = `
        <div class="desc-arrow-row" style="display: flex; align-items: center;">
          <span class="desc-note-badge" style="background: #eab30820; color: #fef08a; border: 1px solid #d4af3740; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-right: 8px;">Note</span>
          <span class="desc-participant">${esc(actorP?.label ?? n.actor)}</span>
          <span class="desc-arrow-symbol" style="margin-left: 6px; font-size: 12px; color: var(--color-text-dim);">${alignLabel}</span>
        </div>
        <div class="desc-divider"></div>
      `;
    }

    const importantBadge = step.important
      ? `<span class="desc-important-badge" style="background: #ea580c20; color: #ff9b50; border: 1px solid #ea580c40; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 8px; display: inline-flex; align-items: center; gap: 3px;">★</span>`
      : ''

    descEl.innerHTML = `
      <div class="desc-animate">
        <div class="desc-step-header" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span class="desc-step-badge">Step ${currentStep + 1}</span>
          <span class="desc-step-title">${esc(step.title ?? step.label ?? '')}</span>
          ${importantBadge}
        </div>
        ${arrowRow}
        ${step.description
          ? `<div class="desc-text prose">${marked.parse(step.description) as string}</div>`
          : `<p class="desc-text desc-no-desc">このステップの説明はありません。</p>`
        }
      </div>
    `
  }

  private showError(msg: string): void {
    this.errorBannerEl.classList.remove('hidden')
    this.errorBannerEl.querySelector('#error-text')!.textContent = msg
  }

  private hideError(): void {
    this.errorBannerEl.classList.add('hidden')
  }

  private updateHighlight(): void {
    const text = this.yamlTextareaEl.value
    this.yamlHighlightEl.querySelector('code')!.innerHTML = highlightYAML(text)
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightYAML(code: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped.split('\n').map(line => {
    if (line.trim().startsWith('#')) {
      return `<span class="hl-comment">${line}</span>`
    }
    
    // Check key Match
    const keyMatch = line.match(/^(\s*-?\s*)([a-zA-Z0-9_-]+)(:)(.*)$/)
    if (keyMatch) {
      const indent = keyMatch[1]
      const key = keyMatch[2]
      const colon = keyMatch[3]
      let value = keyMatch[4]
      
      // Inline comments
      let comment = ''
      const hashIdx = value.indexOf('#')
      if (hashIdx !== -1) {
        comment = `<span class="hl-comment">${value.substring(hashIdx)}</span>`
        value = value.substring(0, hashIdx)
      }
      
      // Value highlighting
      let highlightedValue = value
      const trimmedVal = value.trim()
      if (trimmedVal.startsWith('"') && trimmedVal.endsWith('"')) {
        highlightedValue = value.replace(trimmedVal, `<span class="hl-string">${trimmedVal}</span>`)
      } else if (trimmedVal.startsWith("'") && trimmedVal.endsWith("'")) {
        highlightedValue = value.replace(trimmedVal, `<span class="hl-string">${trimmedVal}</span>`)
      } else if (trimmedVal === 'true' || trimmedVal === 'false') {
        highlightedValue = value.replace(trimmedVal, `<span class="hl-boolean">${trimmedVal}</span>`)
      } else if (!isNaN(Number(trimmedVal)) && trimmedVal !== '') {
        highlightedValue = value.replace(trimmedVal, `<span class="hl-number">${trimmedVal}</span>`)
      }
      
      return `${indent}<span class="hl-key">${key}</span>${colon}${highlightedValue}${comment}`
    }
    
    if (line.trim() === '---') {
      return `<span class="hl-separator">${line}</span>`
    }
    
    return line
  }).join('\n')
}
