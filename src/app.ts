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
    highlight: green
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
  compareMode: boolean
  compareSeqIndex: number  // second sequence index for compare
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
    compareMode: false,
    compareSeqIndex: 1,
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
  private compareBtnEl!: HTMLButtonElement
  private prevStepB = -1

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
      <button class="btn btn-ghost" id="btn-compare" title="フローを比較">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>
        Compare
      </button>
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
    <!-- Left: SVG diagram(s) -->
    <div class="diagram-panel" id="diagram-panel">
      <div class="diagram-tabs-row hidden" id="diagram-tabs"></div>
      <div class="diagram-scroll" id="diagram-scroll">
        <div id="diagram-svg-container"></div>
      </div>
      <!-- Compare mode: side-by-side -->
      <div class="compare-container hidden" id="compare-container">
        <div class="compare-pane compare-pane-a">
          <div class="compare-pane-header" id="compare-header-a"></div>
          <div class="compare-scroll" id="compare-scroll-a">
            <div id="compare-svg-a"></div>
          </div>
        </div>
        <div class="compare-divider"></div>
        <div class="compare-pane compare-pane-b">
          <div class="compare-pane-header" id="compare-header-b"></div>
          <div class="compare-scroll" id="compare-scroll-b">
            <div id="compare-svg-b"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Resizer -->
    <div class="resizer" id="panel-resizer">
      <button class="collapse-btn" id="btn-collapse-panel" title="パネルを折りたたむ">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

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
    this.compareBtnEl = root.querySelector('#btn-compare')!
  }

  private bindEvents(): void {
    this.prevBtnEl.addEventListener('click', () => this.navigate(-1))
    this.nextBtnEl.addEventListener('click', () => this.navigate(1))
    this.playBtnEl.addEventListener('click', () => this.toggleAutoPlay())
    this.tabDescEl.addEventListener('click', () => this.switchTab('description'))
    this.tabEditorEl.addEventListener('click', () => this.switchTab('editor'))

    // Compare toggle
    this.compareBtnEl.addEventListener('click', () => this.toggleCompareMode())

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

    // YAML editor – keyboard enhancements
    this.yamlTextareaEl.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return  // IME入力中はスキップ
      const ta = this.yamlTextareaEl
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const val = ta.value

      if (e.key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) {
          // Shift+Tab: dedent selected lines
          const lineStart = val.lastIndexOf('\n', start - 1) + 1
          const lineEnd = end
          const block = val.substring(lineStart, lineEnd)
          const dedented = block.replace(/^( {1,2})/gm, '')
          const removed = block.length - dedented.length
          ta.value = val.substring(0, lineStart) + dedented + val.substring(lineEnd)
          ta.selectionStart = Math.max(lineStart, start - (block.substring(0, start - lineStart).length - block.substring(0, start - lineStart).replace(/^( {1,2})/, '').length))
          ta.selectionEnd = end - removed
        } else {
          // Tab: insert 2 spaces
          ta.value = val.substring(0, start) + '  ' + val.substring(end)
          ta.selectionStart = ta.selectionEnd = start + 2
        }
        ta.dispatchEvent(new Event('input'))
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        // Get indentation of the current line
        const lineStart = val.lastIndexOf('\n', start - 1) + 1
        const line = val.substring(lineStart, start)
        const indent = line.match(/^(\s*)/)?.[1] ?? ''
        // If line ends with ':', add extra 2 spaces
        const trimmed = line.trimEnd()
        const extra = trimmed.endsWith(':') ? '  ' : ''
        const insert = '\n' + indent + extra
        ta.value = val.substring(0, start) + insert + val.substring(end)
        ta.selectionStart = ta.selectionEnd = start + insert.length
        ta.dispatchEvent(new Event('input'))
      }
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

    // Click on compare diagram elements
    document.querySelector('#compare-svg-a')!.addEventListener('click', (e) => {
      const stepGroup = (e.target as Element).closest('.step-group')
      if (stepGroup) {
        const stepIdx = stepGroup.getAttribute('data-step-idx')
        if (stepIdx !== null) {
          const idx = Number(stepIdx)
          this.state.currentStep = this.state.currentStep === idx ? -1 : idx
          this.stopAutoPlay()
          this.renderAll()
        }
      }
    })
    document.querySelector('#compare-svg-b')!.addEventListener('click', (e) => {
      const stepGroup = (e.target as Element).closest('.step-group')
      if (stepGroup) {
        const stepIdx = stepGroup.getAttribute('data-step-idx')
        if (stepIdx !== null) {
          const idx = Number(stepIdx)
          this.state.currentStep = this.state.currentStep === idx ? -1 : idx
          this.stopAutoPlay()
          this.renderAll()
        }
      }
    })

    // Sync scroll between compare panes
    const scrollA = document.querySelector('#compare-scroll-a') as HTMLElement
    const scrollB = document.querySelector('#compare-scroll-b') as HTMLElement
    let syncingScroll = false
    scrollA.addEventListener('scroll', () => {
      if (syncingScroll) return
      syncingScroll = true
      scrollB.scrollTop = scrollA.scrollTop
      syncingScroll = false
    })
    scrollB.addEventListener('scroll', () => {
      if (syncingScroll) return
      syncingScroll = true
      scrollA.scrollTop = scrollB.scrollTop
      syncingScroll = false
    })

    // Click on diagram elements
    this.diagramEl.addEventListener('click', (e) => {
      const stepGroup = (e.target as Element).closest('.step-group')
      if (stepGroup) {
        const stepIdx = stepGroup.getAttribute('data-step-idx')
        if (stepIdx !== null) {
          const idx = Number(stepIdx)
          this.state.currentStep = this.state.currentStep === idx ? -1 : idx
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

    // Collapse panel toggle
    document.querySelector('#btn-collapse-panel')!.addEventListener('click', () => {
      const rp = this.rightPanelEl
      const resizer = document.querySelector('#panel-resizer') as HTMLElement
      const collapseBtn = document.querySelector('#btn-collapse-panel') as HTMLElement
      const isCollapsed = rp.classList.toggle('collapsed')
      resizer.classList.toggle('collapsed', isCollapsed)
      collapseBtn.innerHTML = isCollapsed
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
      // Re-render SVG to fill new space
      setTimeout(() => this.renderDiagram(), 300)
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
    const { currentStep, compareMode, compareSeqIndex } = this.state
    if (!seq) return
    let maxSteps = seq.steps.length
    if (compareMode) {
      const seqB = this.state.seqs[compareSeqIndex]
      if (seqB) maxSteps = Math.max(maxSteps, seqB.steps.length)
    }
    const next = currentStep + delta
    if (next < -1 || next >= maxSteps) return
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

    const seqB = this.state.compareMode ? this.state.seqs[this.state.compareSeqIndex] : null
    const maxSteps = this.state.compareMode
      ? Math.max(seq.steps.length, seqB?.steps.length ?? 0)
      : seq.steps.length

    this.autoTimer = setInterval(() => {
      if (this.state.currentStep >= maxSteps - 1) {
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
  private toggleCompareMode(): void {
    if (this.state.seqs.length < 2) return
    this.state.compareMode = !this.state.compareMode
    this.state.currentStep = -1
    this.prevStep = -1
    this.prevStepB = -1
    this.stopAutoPlay()

    const normalScroll = document.querySelector('#diagram-scroll') as HTMLElement
    const compareCtn = document.querySelector('#compare-container') as HTMLElement

    if (this.state.compareMode) {
      this.compareBtnEl.classList.add('btn-active')
      normalScroll.classList.add('hidden')
      compareCtn.classList.remove('hidden')
      // Default: first two sequences
      if (this.state.currentSeqIndex === this.state.compareSeqIndex) {
        this.state.compareSeqIndex = this.state.currentSeqIndex === 0 ? 1 : 0
      }
    } else {
      this.compareBtnEl.classList.remove('btn-active')
      normalScroll.classList.remove('hidden')
      compareCtn.classList.add('hidden')
    }
    this.renderAll()
  }

  private renderAll(): void {
    this.renderDiagramTabs()
    if (this.state.compareMode) {
      this.renderCompareDiagrams()
    } else {
      this.renderDiagram()
    }
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

  private renderCompareDiagrams(): void {
    const seqA = this.state.seqs[this.state.currentSeqIndex]
    const seqB = this.state.seqs[this.state.compareSeqIndex]
    const { currentStep } = this.state

    const svgA = document.querySelector('#compare-svg-a') as HTMLElement
    const svgB = document.querySelector('#compare-svg-b') as HTMLElement
    const headerA = document.querySelector('#compare-header-a') as HTMLElement
    const headerB = document.querySelector('#compare-header-b') as HTMLElement

    // Build selectors for A/B pane headers
    const buildSelector = (selectedIdx: number, side: 'a' | 'b') => {
      return this.state.seqs.map((s, i) => {
        const active = i === selectedIdx
        return `<button class="compare-select-btn ${active ? 'compare-select-active' : ''}" data-compare-side="${side}" data-compare-idx="${i}">${esc(s.title)}</button>`
      }).join('')
    }

    headerA.innerHTML = `<div class="compare-select-row">${buildSelector(this.state.currentSeqIndex, 'a')}</div>`
    headerB.innerHTML = `<div class="compare-select-row">${buildSelector(this.state.compareSeqIndex, 'b')}</div>`

    // Bind selector click events
    document.querySelectorAll('[data-compare-side]').forEach(el => {
      el.addEventListener('click', () => {
        const side = (el as HTMLElement).dataset.compareSide
        const idx = Number((el as HTMLElement).dataset.compareIdx)
        if (side === 'a') {
          this.state.currentSeqIndex = idx
        } else {
          this.state.compareSeqIndex = idx
        }
        this.state.currentStep = -1
        this.prevStep = -1
        this.prevStepB = -1
        this.renderAll()
      })
    })

    if (seqA) {
      const wA = svgA.parentElement?.clientWidth ?? 400
      const stepA = currentStep < seqA.steps.length ? currentStep : -2
      svgA.innerHTML = renderSVG(seqA, { width: wA, currentStep: stepA, prevStep: this.prevStep })
    } else {
      svgA.innerHTML = ''
    }

    if (seqB) {
      const wB = svgB.parentElement?.clientWidth ?? 400
      const stepB = currentStep < seqB.steps.length ? currentStep : -2
      svgB.innerHTML = renderSVG(seqB, { width: wB, currentStep: stepB, prevStep: this.prevStepB })
    } else {
      svgB.innerHTML = ''
    }

    this.prevStep = currentStep
    this.prevStepB = currentStep
  }

  private renderHeader(): void {
    const seq = this.state.seqs[this.state.currentSeqIndex]
    const { currentStep, compareMode, compareSeqIndex } = this.state
    if (!seq) { this.titleEl.textContent = '—'; return }

    if (compareMode) {
      const seqB = this.state.seqs[compareSeqIndex]
      this.titleEl.textContent = `${seq.title}  vs  ${seqB?.title ?? '—'}`
      const maxSteps = Math.max(seq.steps.length, seqB?.steps.length ?? 0)
      this.stepCounterEl.textContent = currentStep >= 0
        ? `Step ${currentStep + 1} / ${maxSteps}`
        : `${maxSteps} steps (max)`
    } else {
      this.titleEl.textContent = seq.title
      const step = currentStep >= 0 ? seq.steps[currentStep] : null
      // Noteのみステップは番号をスキップ
      if (step) {
        let arrowNum = 0
        for (let i = 0; i <= currentStep; i++) {
          const s = seq.steps[i]
          if (s.from !== undefined || s.to !== undefined || s.note === undefined) arrowNum++
        }
        const isNoteOnly = step.from === undefined && step.to === undefined && step.note !== undefined
        this.stepCounterEl.textContent = isNoteOnly
          ? `Note / ${seq.steps.length} steps`
          : `Step ${arrowNum} / ${seq.steps.length} steps`
      } else {
        this.stepCounterEl.textContent = `${seq.steps.length} steps`
      }
    }

    // Update compare button visibility
    this.compareBtnEl.style.display = this.state.seqs.length >= 2 ? '' : 'none'
  }

  private renderNavbar(): void {
    const seq = this.state.seqs[this.state.currentSeqIndex]
    const { currentStep, compareMode, compareSeqIndex } = this.state
    const seqB = compareMode ? this.state.seqs[compareSeqIndex] : null
    const total = compareMode ? Math.max(seq?.steps.length ?? 0, seqB?.steps.length ?? 0) : (seq?.steps.length ?? 0)

    // Dots — Noteのみステップは番号をスキップ
    let dotArrowNum = 0
    this.stepDotsEl.innerHTML = Array.from({ length: total }, (_, i) => {
      const s = seq.steps[i]
      const isNoteOnly = (s?.from === undefined && s?.to === undefined && s?.note !== undefined)
      if (!isNoteOnly) dotArrowNum++
      const active = i === currentStep
      const visited = i < currentStep
      const important = s?.important ? 'dot-important' : ''
      const noteOnlyCls = isNoteOnly ? 'dot-note-only' : ''
      const highlightCls = s?.highlight ? `dot-hl-${s.highlight}` : ''
      const hasDesc = Boolean(s?.description && s.description.trim())
      const descCls = hasDesc ? 'dot-has-desc' : ''
      const cls = `${active ? 'dot dot-active' : visited ? 'dot dot-visited' : 'dot dot-idle'} ${important} ${noteOnlyCls} ${highlightCls} ${descCls}`
      const label = (isNoteOnly ? 'Note' : `Step ${dotArrowNum}`) + (hasDesc ? ' (説明あり)' : '')
      return `<button class="${cls}" data-step="${i}" title="${label}"></button>`
    }).join('')

    this.stepDotsEl.querySelectorAll('[data-step]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number((el as HTMLElement).dataset.step)
        this.state.currentStep = this.state.currentStep === idx ? -1 : idx
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
    const { currentStep, compareMode } = this.state
    const seq = this.state.seqs[this.state.currentSeqIndex]
    const descEl = this.descPanelEl.querySelector('#desc-content')!

    if (!seq) {
      descEl.innerHTML = '<p class="desc-placeholder">YAMLを読み込んでください</p>'
      return
    }

    if (compareMode) {
      this.renderCompareDescription()
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

    const highlightColors: Record<string, {bg: string; color: string; border: string; label: string}> = {
      red: {bg: '#ef444420', color: '#fca5a5', border: '#ef444440', label: '差分'},
      green: {bg: '#22c55e20', color: '#86efac', border: '#22c55e40', label: '追加'},
      yellow: {bg: '#eab30820', color: '#fde047', border: '#eab30840', label: '注目'},
      purple: {bg: '#a855f720', color: '#d8b4fe', border: '#a855f740', label: '変更'},
      cyan: {bg: '#06b6d420', color: '#67e8f9', border: '#06b6d440', label: '参考'},
      pink: {bg: '#ec489920', color: '#f9a8d4', border: '#ec489940', label: '注意'},
    }
    const importantBadge = step.important
      ? `<span style="background: #ea580c20; color: #ff9b50; border: 1px solid #ea580c40; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 8px; display: inline-flex; align-items: center; gap: 3px;">★</span>`
      : ''
    const hlInfo = step.highlight ? highlightColors[step.highlight] : null
    const highlightBadge = hlInfo
      ? `<span style="background: ${hlInfo.bg}; color: ${hlInfo.color}; border: 1px solid ${hlInfo.border}; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 4px;">${hlInfo.label}</span>`
      : ''

    descEl.innerHTML = `
      <div class="desc-animate">
        <div class="desc-step-header" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span class="desc-step-badge">${(() => {
            const s = seq.steps[currentStep];
            const isNoteOnly = s.from === undefined && s.to === undefined && s.note !== undefined;
            if (isNoteOnly) return 'Note';
            let num = 0;
            for (let i = 0; i <= currentStep; i++) {
              const ss = seq.steps[i];
              if (ss.from !== undefined || ss.to !== undefined || ss.note === undefined) num++;
            }
            return `Step ${num}`;
          })()}</span>
          <span class="desc-step-title">${esc(step.title ?? step.label ?? '')}</span>
          ${importantBadge}
          ${highlightBadge}
        </div>
        ${arrowRow}
        ${step.description
          ? `<div class="desc-text prose">${marked.parse(step.description) as string}</div>`
          : `<p class="desc-text desc-no-desc">このステップの説明はありません。</p>`
        }
      </div>
    `
  }

  private renderCompareDescription(): void {
    const descEl = this.descPanelEl.querySelector('#desc-content')!
    const seqA = this.state.seqs[this.state.currentSeqIndex]
    const seqB = this.state.seqs[this.state.compareSeqIndex]
    const { currentStep } = this.state

    if (currentStep < 0) {
      descEl.innerHTML = `
        <div class="desc-animate">
          <div class="compare-desc-intro">
            <div class="desc-start-icon">⇔</div>
            <p class="desc-start-title">フロー比較モード</p>
            <div class="compare-desc-titles">
              <div class="compare-desc-title-item">
                <span class="compare-label-a">A</span>
                <span>${esc(seqA?.title ?? '—')}</span>
              </div>
              <div class="compare-desc-title-item">
                <span class="compare-label-b">B</span>
                <span>${esc(seqB?.title ?? '—')}</span>
              </div>
            </div>
            <p class="desc-start-hint">「Next」で比較を開始</p>
          </div>
        </div>
      `
      return
    }

    const stepA = seqA && currentStep < seqA.steps.length ? seqA.steps[currentStep] : null
    const stepB = seqB && currentStep < seqB.steps.length ? seqB.steps[currentStep] : null

    const renderSide = (step: typeof stepA, seq: SequenceDef | undefined, label: string, colorClass: string) => {
      if (!step || !seq) {
        return `<div class="compare-desc-side ${colorClass}">
          <div class="compare-desc-side-label">${label}</div>
          <p class="desc-text desc-no-desc" style="font-style: italic; opacity: 0.5;">— このステップはありません —</p>
        </div>`
      }
      const hasArrow = step.from !== undefined && step.to !== undefined
      let arrowInfo = ''
      if (hasArrow) {
        const fromP = seq.participants.find(p => p.id === step.from)
        const toP = seq.participants.find(p => p.id === step.to)
        arrowInfo = `<div class="compare-desc-arrow">${esc(fromP?.label ?? step.from ?? '')} → ${esc(toP?.label ?? step.to ?? '')}</div>`
      } else if (step.note) {
        const actorP = seq.participants.find(p => p.id === step.note!.actor)
        arrowInfo = `<div class="compare-desc-arrow"><span style="color: #fef08a;">Note</span> ${esc(actorP?.label ?? step.note.actor)}</div>`
      }
      const importantBadge = step.important ? '<span class="desc-important-badge" style="background: #ea580c20; color: #ff9b50; border: 1px solid #ea580c40; padding: 2px 4px; border-radius: 3px; font-size: 9px; font-weight: bold; margin-left: 4px;">★</span>' : ''
      const desc = step.description
        ? `<div class="desc-text prose" style="font-size: 12px;">${marked.parse(step.description) as string}</div>`
        : '<p class="desc-text desc-no-desc" style="font-size: 12px;">説明なし</p>'
      return `<div class="compare-desc-side ${colorClass}">
        <div class="compare-desc-side-label">${label}</div>
        <div class="compare-desc-side-title">${esc(step.title ?? step.label ?? '')}${importantBadge}</div>
        ${arrowInfo}
        <div class="compare-desc-divider"></div>
        ${desc}
      </div>`
    }

    descEl.innerHTML = `
      <div class="desc-animate">
        <div class="desc-step-header">
          <span class="desc-step-badge">Step ${currentStep + 1}</span>
        </div>
        <div class="compare-desc-grid">
          ${renderSide(stepA, seqA, 'A', 'compare-side-a')}
          ${renderSide(stepB, seqB, 'B', 'compare-side-b')}
        </div>
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
