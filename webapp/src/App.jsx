import { useEffect, useMemo, useRef, useState } from 'react'
import logo from './assets/docdoc-logo.svg'
import deckMateLogo from './assets/deck-mate-logo.svg'
import doc2DeckLogo from './assets/doc2deck-logo.svg'
import { APP_SETTINGS } from './config/appSettings'
import { DECK_MATE_SETTINGS } from './config/deckMateSettings'

const APP_VIEWS = {
  SUITE_HOME: 'suite_home',
  DOCUMENT_DOCTOR: 'document_doctor',
  DECK_MATE: 'deck_mate',
  DOC2DECK: 'doc2deck'
}

const MODES = {
  DOC_DEFINE: 'doc_define_mode',
  INVOKE: 'invoke_model_mode',
  RESULT_SAVED: 'llm_result_saved_mode',
  CRITIQUE_REVIEW: 'critique_review_mode',
  VIEW_CHANGED: 'view_changed_document_mode'
}

const MODE_LABELS = {
  [MODES.DOC_DEFINE]: 'Document Definition',
  [MODES.INVOKE]: 'Invoking Model',
  [MODES.CRITIQUE_REVIEW]: 'Review Critique',
  [MODES.RESULT_SAVED]: 'Model Result Saved',
  [MODES.VIEW_CHANGED]: 'Review Changed Document'
}

const OPERATIONS = {
  CRITIQUE_PRIMARY: 'critique_primary_document',
  APPLY_CHANGE_ITEMS: 'apply_change_items',
  CRITIQUE_CHANGED: 'critique_changed_document'
}

const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const API_BASE_URL =
  typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? RAW_API_BASE_URL.replace(/^http:\/\//, 'https://')
    : RAW_API_BASE_URL

const API_ENDPOINTS = {
  [OPERATIONS.CRITIQUE_PRIMARY]: `${API_BASE_URL}/api/critique/`,
  [OPERATIONS.APPLY_CHANGE_ITEMS]: `${API_BASE_URL}/api/apply-change-items/`,
  [OPERATIONS.CRITIQUE_CHANGED]: `${API_BASE_URL}/api/critique-changed-document/`
}

const AUTH_ENDPOINTS = {
  SESSION: `${API_BASE_URL}/api/auth/session/`,
  REGISTER: `${API_BASE_URL}/api/auth/register/`,
  VERIFY_EMAIL: `${API_BASE_URL}/api/auth/verify-email/`,
  LOGIN: `${API_BASE_URL}/api/auth/login/`,
  LOGOUT: `${API_BASE_URL}/api/auth/logout/`,
  PROFILE: `${API_BASE_URL}/api/auth/profile/`,
  FORGOT_PASSWORD: `${API_BASE_URL}/api/auth/forgot-password/`,
  RESET_PASSWORD: `${API_BASE_URL}/api/auth/reset-password/`
}

const defaults = {
  supportInstructions: '',
  priorInstructions: ''
}

const operationLabels = {
  [OPERATIONS.CRITIQUE_PRIMARY]: 'primary document critique',
  [OPERATIONS.APPLY_CHANGE_ITEMS]: 'change-item application',
  [OPERATIONS.CRITIQUE_CHANGED]: 'changed-document critique'
}

const REVIEW_TEXTAREA_ROWS = 34

function emptyChangeDraft() {
  return {
    id: '',
    instruction: 'make the change as recommended'
  }
}

function formatChangeItems(changeItems) {
  if (!changeItems.length) {
    return 'No change items were supplied.'
  }

  return changeItems.map((item) => `- ${item.id}: ${item.instruction}`).join('\n')
}

function extractDeckSlidesFromChangeItems(changeItems) {
  const slides = new Set()
  const slidePattern = /\bslide[-\s]*(\d+)\b/gi
  changeItems.forEach((item) => {
    const combined = `${item?.id || ''} ${item?.instruction || ''}`
    let match = slidePattern.exec(combined)
    while (match) {
      const slideNumber = Number.parseInt(match[1], 10)
      if (Number.isFinite(slideNumber)) {
        slides.add(slideNumber)
      }
      match = slidePattern.exec(combined)
    }
  })
  return [...slides].sort((left, right) => left - right)
}

function clampPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10)
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}

function extractFirstInteger(value) {
  const match = `${value ?? ''}`.match(/(\d+)/)
  if (!match) {
    return null
  }
  return Number.parseInt(match[1], 10)
}

function parseSlidesToReviewInput(value) {
  const trimmed = `${value || ''}`.trim()
  if (!trimmed) {
    return []
  }

  const selections = new Set()
  const tokens = trimmed
    .split(/[;,]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (!tokens.length) {
    return []
  }

  tokens.forEach((token) => {
      const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/)
      if (rangeMatch) {
        const start = Number.parseInt(rangeMatch[1], 10)
        const end = Number.parseInt(rangeMatch[2], 10)
      if (start < 1 || end < 1) {
        throw new Error(`Slides To Review contains an out-of-range value: ${token}`)
      }
      const low = Math.min(start, end)
      const high = Math.max(start, end)
      for (let current = low; current <= high; current += 1) {
        selections.add(current)
      }
      return
    }

    const singleMatch = token.match(/^\d+$/)
    if (!singleMatch) {
      throw new Error(`Slides To Review contains an invalid token: ${token}`)
    }

    const slide = Number.parseInt(token, 10)
    if (slide < 1) {
      throw new Error(`Slides To Review contains an out-of-range value: ${token}`)
    }
    selections.add(slide)
  })

  return [...selections].sort((left, right) => left - right)
}

function summarizeSlideGroup(slides) {
  if (!slides.length) {
    return 'no slides'
  }

  const ranges = []
  let rangeStart = slides[0]
  let previous = slides[0]

  for (let index = 1; index < slides.length; index += 1) {
    const current = slides[index]
    if (current === previous + 1) {
      previous = current
      continue
    }
    ranges.push([rangeStart, previous])
    rangeStart = current
    previous = current
  }
  ranges.push([rangeStart, previous])

  const parts = ranges.map(([start, end]) => {
    if (start === end) {
      return `slide ${start}`
    }
    return `slides ${start} through ${end}`
  })

  if (parts.length === 1) {
    return parts[0]
  }

  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

function parseDeckMarkdownSections(markdown) {
  const lines = `${markdown || ''}`.split('\n')
  const sections = []
  let currentSection = null

  lines.forEach((line) => {
    const slideMatch = line.match(/^\s{0,3}(?:[-*]\s*)?(?:#{1,6}\s*)?(?:\*\*)?\s*slide[-\s]*(\d+)\b(?:\s*\*\*)?[:\-]?\s*(.*)$/i)
    if (slideMatch) {
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = {
        slideNumber: Number.parseInt(slideMatch[1], 10),
        title: line.trim(),
        lines: [line]
      }
      return
    }

    if (currentSection) {
      currentSection.lines.push(line)
    }
  })

  if (currentSection) {
    sections.push(currentSection)
  }

  return sections.map((section) => ({
    ...section,
    content: section.lines.join('\n').trim()
  }))
}

function parseDeckCritiqueSections(markdown) {
  return parseDeckMarkdownSections(markdown).map((section) => {
    const content = section.lines.join('\n').trim()
    const issueSet = new Set()
    const issuePattern = /\bissue[-\s]*(\d+)\b/gi
    let issueMatch = issuePattern.exec(content)
    while (issueMatch) {
      issueSet.add(Number.parseInt(issueMatch[1], 10))
      issueMatch = issuePattern.exec(content)
    }
    const issues = [...issueSet]
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right)
      .map((issueNumber) => ({
        issueNumber,
        optionValue: `slide-${section.slideNumber}/issue-${issueNumber}`,
        optionLabel: `Slide ${section.slideNumber} / Issue ${issueNumber}`
      }))

    return {
      ...section,
      content,
      issues
    }
  })
}

function PageShell({
  mode,
  topRightControls = null,
  children,
  appTitle = 'The Document Doctor',
  appSubtitle = 'A Professional Review Tool for Document Authors',
  brandLogo = logo,
  brandAlt = 'Cartoon paper doctor logo'
}) {
  return (
    <main className="layout">
      <header className="hero card">
        <div className="hero-corner hero-left">
          <img className="brand-logo" src={brandLogo} alt={brandAlt} />
        </div>
        <div className="hero-title-group">
          <h1>{appTitle}</h1>
          <p className="hero-subtitle">{appSubtitle}</p>
        </div>
        <div className="hero-corner hero-right">
          <div className="hero-right-stack">{topRightControls}</div>
        </div>
      </header>
      {children}
    </main>
  )
}

function normalizeRequestError(error) {
  if (error instanceof TypeError) {
    return 'Unable to reach the backend API. If this page is loaded over HTTPS, make sure the backend URL is also HTTPS (no mixed content), then rebuild and redeploy your dist files.'
  }

  return error.message || 'Backend request failed.'
}

function preferHttpsOnSecurePage(endpoint) {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && endpoint.startsWith('http://')) {
    return `https://${endpoint.slice('http://'.length)}`
  }

  return endpoint
}

function endpointCandidates(endpoint) {
  const secureEndpoint = preferHttpsOnSecurePage(endpoint)
  const normalized = secureEndpoint.replace(/\/api\/api\//g, '/api/')
  const seeds = [secureEndpoint, normalized]
  const candidates = []

  seeds.forEach((seed) => {
    const base = seed.replace(/\/+$/, '')
    candidates.push(`${base}/`, seed, `${base}/index.php`)
  })

  return [...new Set(candidates)]
}

function isRetryableGatewayError(error) {
  const message = (error && error.message ? String(error.message) : '').toLowerCase()
  return message.includes('status 502') || message.includes('status 503') || message.includes('status 504')
}

function detectAppNameFromPath() {
  if (typeof window === 'undefined') {
    return 'a-ideation'
  }

  if (window.__AIDEATION_APP_NAME) {
    return String(window.__AIDEATION_APP_NAME).toLowerCase()
  }

  const path = `${window.location.pathname}`.toLowerCase()
  if (path.includes('index-dd')) {
    return 'docdoc'
  }
  if (path.includes('index-dm')) {
    return 'deckmate'
  }
  if (path.includes('index-d2d')) {
    return 'doc2deck'
  }

  return 'a-ideation'
}

function withAppHeaders(headers = {}) {
  return {
    ...headers,
    'X-App-Name': detectAppNameFromPath()
  }
}

async function fetchWithEndpointFallback(endpoint, init) {
  const candidates = endpointCandidates(endpoint)
  let lastResponse = null
  const endpointTrace = []

  for (const candidate of candidates) {
    const response = await fetch(candidate, init)
    endpointTrace.push({ endpoint: candidate, status: response.status })
    const isRedirect = [301, 302, 307, 308].includes(response.status)
    const retryableGatewayStatus = [502, 503, 504].includes(response.status)
    const redirectTarget = response.headers.get('location') || ''
    const insecureRedirect =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      redirectTarget.startsWith('http://')

    if (response.status !== 404 && !retryableGatewayStatus && !(isRedirect && insecureRedirect)) {
      response.__endpointTrace = endpointTrace
      return response
    }

    lastResponse = response
  }

  if (lastResponse) {
    lastResponse.__endpointTrace = endpointTrace
  }
  return lastResponse
}

function summarizeEndpointTrace(endpointTrace = []) {
  if (!endpointTrace.length) {
    return ''
  }
  return endpointTrace
    .map((item) => `${item.endpoint} -> ${item.status}`)
    .join(' | ')
}

async function readBackendJson(response) {
  const contentType = response.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    const responseText = await response.text()
    const maybeHtml = responseText.trim().startsWith('<')
    const preview = responseText.replace(/\s+/g, ' ').trim().slice(0, 220)
    throw new Error(
      maybeHtml
        ? `Backend returned HTML instead of JSON (status ${response.status}). Verify VITE_API_BASE_URL points to your backend API and uses HTTPS when the site is served over HTTPS. Response preview: ${preview}`
        : `Backend returned non-JSON response (status ${response.status}). Response preview: ${preview}`
    )
  }

  return response.json()
}

async function postMultipart(endpoint, payload, fileEntries = {}) {
  const formData = new FormData()
  formData.append('request', JSON.stringify(payload))

  Object.entries(fileEntries).forEach(([fieldName, file]) => {
    if (file) {
      formData.append(fieldName, file)
    }
  })

  const response = await fetchWithEndpointFallback(endpoint, {
    method: 'POST',
    headers: withAppHeaders(),
    body: formData,
    credentials: 'include'
  })

  const data = await readBackendJson(response)
  data.__endpointTrace = response.__endpointTrace || []
  if (!response.ok) {
    const traceSummary = summarizeEndpointTrace(response.__endpointTrace || [])
    throw new Error(`${data.detail || 'Backend request failed.'}${traceSummary ? ` Endpoint attempts: ${traceSummary}` : ''}`)
  }

  return data
}

async function postJson(endpoint, payload) {
  const response = await fetchWithEndpointFallback(endpoint, {
    method: 'POST',
    headers: withAppHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify(payload),
    credentials: 'include'
  })

  const data = await readBackendJson(response)
  data.__endpointTrace = response.__endpointTrace || []
  if (!response.ok) {
    const traceSummary = summarizeEndpointTrace(response.__endpointTrace || [])
    throw new Error(`${data.detail || 'Backend request failed.'}${traceSummary ? ` Endpoint attempts: ${traceSummary}` : ''}`)
  }

  return data
}

async function getJson(endpoint) {
  const response = await fetchWithEndpointFallback(endpoint, {
    method: 'GET',
    headers: withAppHeaders(),
    credentials: 'include'
  })

  const data = await readBackendJson(response)
  data.__endpointTrace = response.__endpointTrace || []
  if (!response.ok) {
    const traceSummary = summarizeEndpointTrace(response.__endpointTrace || [])
    throw new Error(`${data.detail || 'Backend request failed.'}${traceSummary ? ` Endpoint attempts: ${traceSummary}` : ''}`)
  }

  return data
}

export default function App({ appShell = 'ai' }) {
  const dedicatedViewByShell = {
    dd: APP_VIEWS.DOCUMENT_DOCTOR,
    dm: APP_VIEWS.DECK_MATE,
    d2d: APP_VIEWS.DOC2DECK
  }
  const dedicatedView = dedicatedViewByShell[appShell] || APP_VIEWS.SUITE_HOME
  const isSuiteShell = dedicatedView === APP_VIEWS.SUITE_HOME
  const homeView = isSuiteShell ? APP_VIEWS.SUITE_HOME : dedicatedView
  const [authLoading, setAuthLoading] = useState(true)
  const [authUser, setAuthUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authDisplayName, setAuthDisplayName] = useState('')
  const [authInfo, setAuthInfo] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [registrationReadyForVerify, setRegistrationReadyForVerify] = useState(false)
  const [authOverlayOpen, setAuthOverlayOpen] = useState(!isSuiteShell)
  const [showAuthRequiredNotice, setShowAuthRequiredNotice] = useState(false)
  const [verifyToken, setVerifyToken] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [activeView, setActiveView] = useState(homeView)
  const isDeckMateWorkflow = activeView === APP_VIEWS.DECK_MATE
  const activeSettings = isDeckMateWorkflow ? DECK_MATE_SETTINGS : APP_SETTINGS
  const contentNoun = isDeckMateWorkflow ? 'presentation' : 'document'
  const contentNounPlural = isDeckMateWorkflow ? 'presentations' : 'documents'
  const contentNounTitle = isDeckMateWorkflow ? 'Presentation' : 'Document'
  const [currentMode, setCurrentMode] = useState(MODES.DOC_DEFINE)
  const [docFile, setDocFile] = useState(null)
  const [supportingFile, setSupportingFile] = useState(null)
  const [priorResponseFile, setPriorResponseFile] = useState(null)
  const [selectedApiMode, setSelectedApiMode] = useState(APP_SETTINGS.defaultApiMode || 'responses')
  const [selectedModel, setSelectedModel] = useState(APP_SETTINGS.defaultModel)
  const [ignoreOcrErrors, setIgnoreOcrErrors] = useState(true)
  const [disableResponseLogging, setDisableResponseLogging] = useState(
    APP_SETTINGS.disableResponseLoggingDefault ?? true
  )
  const [viewPromptEnabled, setViewPromptEnabled] = useState(APP_SETTINGS.viewPromptDefault ?? true)
  const [bypassFileInput, setBypassFileInput] = useState(APP_SETTINGS.bypassFileInputDefault ?? true)
  const [deleteFileOnLlm, setDeleteFileOnLlm] = useState(APP_SETTINGS.deleteFileOnLlmDefault ?? true)
  const [logPanelEnabled, setLogPanelEnabled] = useState(APP_SETTINGS.logPanelEnabledDefault ?? false)
  const [chunkingEnabled, setChunkingEnabled] = useState(APP_SETTINGS.chunkingEnabledDefault ?? false)
  const [chunkSize, setChunkSize] = useState(APP_SETTINGS.chunkSizeDefault ?? 6)
  const [chunkConcurrency, setChunkConcurrency] = useState(APP_SETTINGS.chunkConcurrencyDefault ?? 2)
  const [deckTotalSlidesSetting, setDeckTotalSlidesSetting] = useState(0)
  const [deckTotalSlidesInput, setDeckTotalSlidesInput] = useState(0)
  const [slidesToReviewInput, setSlidesToReviewInput] = useState('')
  const [isCalculatingSlides, setIsCalculatingSlides] = useState(false)
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const [promptPreviewText, setPromptPreviewText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deckSettingsTab, setDeckSettingsTab] = useState('prompt_instructions')
  const settingsDropdownRef = useRef(null)
  const profileSaveTimerRef = useRef(null)
  const activeSubmissionIdRef = useRef(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [docTopic, setDocTopic] = useState(APP_SETTINGS.defaults.topic)
  const [docObjective, setDocObjective] = useState(APP_SETTINGS.defaults.reviewObjective)
  const [docGuidance, setDocGuidance] = useState(APP_SETTINGS.defaults.formattingGuidance)
  const [docAntiGuidance, setDocAntiGuidance] = useState(APP_SETTINGS.defaults.antiGuidance)
  const [docApplyChangeItemsGuidance, setDocApplyChangeItemsGuidance] = useState(
    APP_SETTINGS.defaults.applyChangeItemsGuidance || ''
  )
  const [deckTopic, setDeckTopic] = useState(DECK_MATE_SETTINGS.defaults.topic)
  const [deckObjective, setDeckObjective] = useState(DECK_MATE_SETTINGS.defaults.reviewObjective)
  const [deckGuidance, setDeckGuidance] = useState(DECK_MATE_SETTINGS.defaults.formattingGuidance)
  const [deckAntiGuidance, setDeckAntiGuidance] = useState(DECK_MATE_SETTINGS.defaults.antiGuidance)
  const [deckApplyChangeItemsGuidance, setDeckApplyChangeItemsGuidance] = useState(
    DECK_MATE_SETTINGS.defaults.applyChangeItemsGuidance || ''
  )
  const [docSupportInstructions, setDocSupportInstructions] = useState(defaults.supportInstructions)
  const [docPriorInstructions, setDocPriorInstructions] = useState(defaults.priorInstructions)
  const [deckSupportInstructions, setDeckSupportInstructions] = useState(defaults.supportInstructions)
  const [deckPriorInstructions, setDeckPriorInstructions] = useState(defaults.priorInstructions)
  const topic = isDeckMateWorkflow ? deckTopic : docTopic
  const objective = isDeckMateWorkflow ? deckObjective : docObjective
  const guidance = isDeckMateWorkflow ? deckGuidance : docGuidance
  const antiGuidance = isDeckMateWorkflow ? deckAntiGuidance : docAntiGuidance
  const supportInstructions = isDeckMateWorkflow ? deckSupportInstructions : docSupportInstructions
  const priorInstructions = isDeckMateWorkflow ? deckPriorInstructions : docPriorInstructions
  const applyChangeItemsGuidance = isDeckMateWorkflow ? deckApplyChangeItemsGuidance : docApplyChangeItemsGuidance
  const [critiqueMarkdown, setCritiqueMarkdown] = useState('')
  const [changedDocumentMarkdown, setChangedDocumentMarkdown] = useState('')
  const [critiqueOutputFileName, setCritiqueOutputFileName] = useState('critique.md')
  const [changedOutputFileName, setChangedOutputFileName] = useState('changes.md')
  const [status, setStatus] = useState(`Ready for ${contentNoun} definition.`)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastOperation, setLastOperation] = useState(null)
  const [changeItems, setChangeItems] = useState([])
  const [changeItemDraft, setChangeItemDraft] = useState(emptyChangeDraft())
  const [requestLogLines, setRequestLogLines] = useState([])
  const [lastCritiqueWaitMs, setLastCritiqueWaitMs] = useState(null)
  const [selectedDeckSlideTab, setSelectedDeckSlideTab] = useState('all')
  const [selectedChangedDeckSlideTab, setSelectedChangedDeckSlideTab] = useState('all')
  const [selectedDeckIssueOptions, setSelectedDeckIssueOptions] = useState([])
  const [deckAdaptiveChunkSize, setDeckAdaptiveChunkSize] = useState(null)
  const [deckChunkLastReduction, setDeckChunkLastReduction] = useState(0)
  const [deckChunkSuccessStreak, setDeckChunkSuccessStreak] = useState(0)

  const deckCritiqueSections = useMemo(
    () => (isDeckMateWorkflow ? parseDeckCritiqueSections(critiqueMarkdown) : []),
    [isDeckMateWorkflow, critiqueMarkdown]
  )
  const deckIssueOptions = useMemo(
    () => deckCritiqueSections.flatMap((section) => section.issues),
    [deckCritiqueSections]
  )
  const visibleDeckIssueOptions = useMemo(() => {
    if (selectedDeckSlideTab === 'all') {
      return deckIssueOptions
    }
    return deckIssueOptions.filter((option) => option.optionValue.startsWith(`slide-${selectedDeckSlideTab}/`))
  }, [deckIssueOptions, selectedDeckSlideTab])
  const changedDeckSections = useMemo(
    () => (isDeckMateWorkflow ? parseDeckMarkdownSections(changedDocumentMarkdown) : []),
    [isDeckMateWorkflow, changedDocumentMarkdown]
  )

  function appendRequestLog(message, details = null, options = {}) {
    if (!logPanelEnabled) {
      return
    }
    if (options.submissionId && activeSubmissionIdRef.current !== options.submissionId) {
      return
    }

    const timestamp = new Date().toISOString()
    const body =
      details && typeof details === 'object'
        ? `${message}\n${JSON.stringify(details, null, 2)}`
        : `${message}${details ? ` ${details}` : ''}`
    setRequestLogLines((lines) => [...lines, `[${timestamp}] ${body}`])
  }

  function clearRequestLog() {
    setRequestLogLines([])
  }

  function setTopicForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckTopic(value)
      return
    }
    setDocTopic(value)
  }

  function setObjectiveForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckObjective(value)
      return
    }
    setDocObjective(value)
  }

  function setGuidanceForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckGuidance(value)
      return
    }
    setDocGuidance(value)
  }

  function setAntiGuidanceForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckAntiGuidance(value)
      return
    }
    setDocAntiGuidance(value)
  }

  function setSupportInstructionsForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckSupportInstructions(value)
      return
    }
    setDocSupportInstructions(value)
  }

  function setPriorInstructionsForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckPriorInstructions(value)
      return
    }
    setDocPriorInstructions(value)
  }

  function setApplyChangeItemsGuidanceForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckApplyChangeItemsGuidance(value)
      return
    }
    setDocApplyChangeItemsGuidance(value)
  }

  function applyUserProfileSettings(settings = {}) {
    setSelectedApiMode(settings.apiMode || APP_SETTINGS.defaultApiMode || 'responses')
    setSelectedModel(settings.model || APP_SETTINGS.defaultModel)
    setIgnoreOcrErrors(settings.ignoreOcrErrors ?? true)
    setDisableResponseLogging(settings.disableResponseLogging ?? (APP_SETTINGS.disableResponseLoggingDefault ?? true))
    setViewPromptEnabled(settings.viewPromptEnabled ?? (APP_SETTINGS.viewPromptDefault ?? false))
    setBypassFileInput(settings.bypassFileInput ?? (APP_SETTINGS.bypassFileInputDefault ?? false))
    setDeleteFileOnLlm(settings.deleteFileOnLlm ?? (APP_SETTINGS.deleteFileOnLlmDefault ?? true))
    setLogPanelEnabled(settings.logPanelEnabled ?? (APP_SETTINGS.logPanelEnabledDefault ?? false))
    setChunkingEnabled(settings.chunkingEnabled ?? (APP_SETTINGS.chunkingEnabledDefault ?? false))
    setChunkSize(clampPositiveInteger(settings.chunkSize, APP_SETTINGS.chunkSizeDefault ?? 6))
    setChunkConcurrency(clampPositiveInteger(settings.chunkConcurrency, APP_SETTINGS.chunkConcurrencyDefault ?? 2))
    setDeckTotalSlidesSetting(clampPositiveInteger(settings.deckTotalSlides, 0))

    const docProfile = settings.doc || {}
    const deckProfile = settings.deck || {}
    setDocTopic(docProfile.topic || APP_SETTINGS.defaults.topic)
    setDocObjective(docProfile.objective || APP_SETTINGS.defaults.reviewObjective)
    setDocGuidance(docProfile.guidance || APP_SETTINGS.defaults.formattingGuidance)
    setDocAntiGuidance(docProfile.antiGuidance || APP_SETTINGS.defaults.antiGuidance)
    setDocApplyChangeItemsGuidance(docProfile.applyChangeItemsGuidance || '')

    setDeckTopic(deckProfile.topic || DECK_MATE_SETTINGS.defaults.topic)
    setDeckObjective(deckProfile.objective || DECK_MATE_SETTINGS.defaults.reviewObjective)
    setDeckGuidance(deckProfile.guidance || DECK_MATE_SETTINGS.defaults.formattingGuidance)
    setDeckAntiGuidance(deckProfile.antiGuidance || DECK_MATE_SETTINGS.defaults.antiGuidance)
    setDeckApplyChangeItemsGuidance(deckProfile.applyChangeItemsGuidance || DECK_MATE_SETTINGS.defaults.applyChangeItemsGuidance || '')
  }

  async function loadUserProfileSettings() {
    try {
      const data = await getJson(AUTH_ENDPOINTS.PROFILE)
      if (data.settings && typeof data.settings === 'object') {
        applyUserProfileSettings(data.settings)
      }
    } catch (_profileError) {
      // keep local defaults when profile read fails
    } finally {
      setProfileLoaded(true)
    }
  }

  async function saveUserProfileSettings(settings) {
    try {
      await postJson(AUTH_ENDPOINTS.PROFILE, { settings })
    } catch (_profileSaveError) {
      // ignore persistence failure to avoid blocking UI
    }
  }

  function resetAuthInputs() {
    setAuthEmail('')
    setAuthPassword('')
    setAuthDisplayName('')
    setVerifyToken('')
    setResetToken('')
    setNewPassword('')
    setAuthInfo('')
    setError('')
  }

  async function loadSession() {
    setAuthLoading(true)
    try {
      const data = await getJson(AUTH_ENDPOINTS.SESSION)
      if (data.authenticated && data.user) {
        setAuthUser(data.user)
        await loadUserProfileSettings()
      } else {
        setAuthUser(null)
        setProfileLoaded(false)
      }
    } catch (sessionError) {
      setAuthUser(null)
      setProfileLoaded(false)
      setAuthInfo(`Session check failed: ${normalizeRequestError(sessionError)}`)
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setError('')
    setAuthInfo('')
    setAuthSubmitting(true)
    try {
      if (authMode === 'register') {
        setAuthInfo('Please wait while account is being created...')
        const response = await postJson(AUTH_ENDPOINTS.REGISTER, {
          email: authEmail,
          password: authPassword,
          displayName: authDisplayName
        })
        setRegistrationReadyForVerify(true)
        if (response.verificationEmailSent) {
          setAuthInfo(
            `Registration successful. Verification email sent.${response.verificationToken ? ` Token: ${response.verificationToken}` : ''}`
          )
        } else {
          setAuthInfo(
            `Registration successful, but verification email could not be sent from the server. ${response.verificationEmailError || ''}${response.verificationToken ? ` Token: ${response.verificationToken}` : ''}`
          )
        }
      } else {
        setRegistrationReadyForVerify(false)
        setAuthInfo('Please wait while signing in...')
        const response = await postJson(AUTH_ENDPOINTS.LOGIN, {
          email: authEmail,
          password: authPassword
        })
        setAuthUser(response.user || null)
        setAuthInfo('')
        setAuthOverlayOpen(false)
        setShowAuthRequiredNotice(false)
        await loadUserProfileSettings()
      }
    } catch (authError) {
      setError(normalizeRequestError(authError))
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleVerifyEmail(event) {
    event.preventDefault()
    setError('')
    setAuthInfo('')
    try {
      const response = await postJson(AUTH_ENDPOINTS.VERIFY_EMAIL, { token: verifyToken })
      setAuthInfo(response.message || 'Email verified. You can now sign in.')
      setVerifyToken('')
      setAuthMode('login')
    } catch (verifyError) {
      setError(normalizeRequestError(verifyError))
    }
  }

  async function handleForgotPassword() {
    setError('')
    setAuthInfo('')
    try {
      const response = await postJson(AUTH_ENDPOINTS.FORGOT_PASSWORD, { email: authEmail })
      setAuthInfo(
        `${response.message || 'If the email exists, reset instructions were created.'}${
          response.resetToken ? ` Reset token: ${response.resetToken}` : ''
        }`
      )
    } catch (forgotError) {
      setError(normalizeRequestError(forgotError))
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault()
    setError('')
    setAuthInfo('')
    try {
      const response = await postJson(AUTH_ENDPOINTS.RESET_PASSWORD, {
        token: resetToken,
        newPassword
      })
      setAuthInfo(response.message || 'Password updated. You can sign in now.')
      setResetToken('')
      setNewPassword('')
      setAuthMode('login')
    } catch (resetError) {
      setError(normalizeRequestError(resetError))
    }
  }

  async function handleLogout() {
    setError('')
    try {
      await postJson(AUTH_ENDPOINTS.LOGOUT, {})
    } catch (logoutError) {
      setError(normalizeRequestError(logoutError))
    } finally {
      setAuthUser(null)
      setProfileLoaded(false)
      resetAuthInputs()
      setActiveView(homeView)
      setCurrentMode(MODES.DOC_DEFINE)
      setAuthOverlayOpen(false)
      setShowAuthRequiredNotice(false)
    }
  }

  function handleProtectedNavigation(view) {
    if (authUser) {
      setActiveView(view)
      return
    }

    setShowAuthRequiredNotice(true)
  }

  function buildAntiGuidancePrompt() {
    const parts = [antiGuidance.trim()]

    if (ignoreOcrErrors && activeSettings.ocrGuidanceText.trim()) {
      parts.push(activeSettings.ocrGuidanceText.trim())
    }

    return parts.filter(Boolean).join(' ')
  }

  function saveMarkdownToFile(content, desiredFileName) {
    const safeName = (desiredFileName || 'output.md').trim() || 'output.md'
    const fileName = safeName.toLowerCase().endsWith('.md') ? safeName : `${safeName}.md`
    const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function buildLlmRequest(messages) {
    return {
      apiMode: selectedApiMode,
      model: selectedModel,
      store: !disableResponseLogging,
      deleteFileOnLlm,
      systemPrompt: 'You are a highly skilled assistant to an experienced professional in the field indicated.',
      messages
    }
  }

  async function readFileAsTextPayload(file) {
    if (!file) {
      return ''
    }

    try {
      return await file.text()
    } catch (_error) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const chunkSize = 0x8000
      let binary = ''
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize))
      }
      return `BASE64:${btoa(binary)}`
    }
  }

  async function maybeBypassFileMessages(messages, fileEntries = {}) {
    if (!bypassFileInput) {
      return messages
    }

    const sourceLabels = {
      primary_document: 'PRIMARY DOCUMENT',
      supporting_document: 'SUPPORTING DOCUMENT',
      prior_response_document: 'PRIOR RESPONSE DOCUMENT',
      original_document: 'ORIGINAL DOCUMENT'
    }

    const built = []
    for (const message of messages) {
      if (message.type !== 'input_file') {
        built.push(message)
        continue
      }

      const file = fileEntries[message.source]
      if (!file) {
        continue
      }

      const fileText = await readFileAsTextPayload(file)
      const label = sourceLabels[message.source] || message.source || 'DOCUMENT'
      built.push({
        type: 'input_text',
        text: `${label} CONTENT START:\n${fileText}\n${label} CONTENT END`
      })
    }

    return built
  }

async function buildPrimaryPromptPreviewText() {
    const requestPayload = buildPrimaryCritiqueRequest()
    requestPayload.messages = await maybeBypassFileMessages(requestPayload.messages, {
      primary_document: docFile,
      supporting_document: supportingFile,
      prior_response_document: priorResponseFile
    })

    const openAiEndpoint =
      selectedApiMode === 'chat'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.openai.com/v1/responses'

    if (selectedApiMode !== 'chat') {
      return JSON.stringify(
        {
          openAiEndpoint,
          ...requestPayload
        },
        null,
        2
      )
    }

    const chatContent = requestPayload.messages.map((item) =>
      item.type === 'input_text'
        ? { type: 'text', text: item.text || '' }
        : { type: 'file', file: { source: item.source || 'file_reference' } }
    )

    return JSON.stringify(
      {
        openAiEndpoint,
        model: requestPayload.model,
        store: requestPayload.store,
        messages: [
          { role: 'system', content: requestPayload.systemPrompt },
          { role: 'user', content: chatContent }
        ]
      },
      null,
      2
    )
  }

  function buildPrimaryCritiqueRequest() {
    const messages = [
      {
        type: 'input_text',
        text: `Primary ${contentNoun} to critique. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${buildAntiGuidancePrompt()}`
      },
      { type: 'input_file', source: 'primary_document' }
    ]

    if (supportingFile) {
      messages.push({
        type: 'input_text',
        text: `Supporting ${contentNoun} included for context. Instructions: ${supportInstructions || 'None provided.'}`
      })
      messages.push({ type: 'input_file', source: 'supporting_document' })
    }

    if (priorResponseFile) {
      messages.push({
        type: 'input_text',
        text: `Prior response ${contentNoun} included for context. Instructions: ${priorInstructions || 'None provided.'}`
      })
      messages.push({ type: 'input_file', source: 'prior_response_document' })
    }

    return buildLlmRequest(messages)
  }

  function buildPrimaryChunkedRequests(selectedSlides, explicitChunkSize = null) {
    const normalizedChunkSize = clampPositiveInteger(
      explicitChunkSize ?? chunkSize,
      APP_SETTINGS.chunkSizeDefault ?? 6
    )
    const chunks = []
    for (let start = 0; start < selectedSlides.length; start += normalizedChunkSize) {
      const chunkSlides = selectedSlides.slice(start, start + normalizedChunkSize)
      chunks.push({
        slides: chunkSlides,
        summary: summarizeSlideGroup(chunkSlides)
      })
    }

    return chunks.map((chunk) => {
      const requestPayload = buildPrimaryCritiqueRequest()
      const chunkInstruction = `Chunk instruction: Process only ${chunk.summary}.`
      return {
        chunk,
        requestPayload: {
          ...requestPayload,
          messages: [
            ...requestPayload.messages,
            {
              type: 'input_text',
              text: chunkInstruction
            }
          ]
        }
      }
    })
  }

  function buildApplyChangeItemsRequest() {
    const selectedChangeSlides = isDeckMateWorkflow ? extractDeckSlidesFromChangeItems(changeItems) : []
    const critiqueSectionsBySlide = parseDeckCritiqueSections(critiqueMarkdown)
    const critiqueTextForApply =
      isDeckMateWorkflow && selectedChangeSlides.length && critiqueSectionsBySlide.length
        ? critiqueSectionsBySlide
            .filter((section) => selectedChangeSlides.includes(section.slideNumber))
            .map((section) => section.content)
            .join('\n\n')
        : critiqueMarkdown

    return buildLlmRequest([
      {
        type: 'input_text',
        text: `Main Instruction: Apply all requested change items directly to the original ${contentNoun} and return the changed ${contentNoun} in markdown.${
          applyChangeItemsGuidance ? ` ${applyChangeItemsGuidance}` : ''
        }${
          isDeckMateWorkflow && selectedChangeSlides.length
            ? ` Deck Mate scope: update only these slides: ${selectedChangeSlides.join(', ')}.`
            : ''
        } Anti-Guidance: ${buildAntiGuidancePrompt()}`
      },
      {
        type: 'input_text',
        text: `Change Items:\n${formatChangeItems(changeItems)}`
      },
      {
        type: 'input_text',
        text: `Original critique:\n${critiqueTextForApply}`
      },
      {
        type: 'input_text',
        text: `Original ${contentNoun}:`
      },
      { type: 'input_file', source: 'original_document' }
    ])
  }

  function buildChangedDocCritiqueRequest() {
    return buildLlmRequest([
      {
        type: 'input_text',
        text: `Critique the included changed ${contentNoun} using the original review configuration. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${buildAntiGuidancePrompt()}`
      },
      {
        type: 'input_text',
        text: `Changed ${contentNoun} body:\n${changedDocumentMarkdown}`
      }
    ])
  }

  async function detectDeckTotalSlidesFromFile(file) {
    if (!file || !isDeckMateWorkflow) {
      return
    }

    const requestPayload = {
      apiMode: 'responses',
      model: 'gpt-5.4-nano',
      store: false,
      deleteFileOnLlm,
      systemPrompt:
        'You return only the numeric answer requested by the user. Do not include labels, prose, punctuation, or extra text.',
      messages: [
        {
          type: 'input_text',
          text: 'Return the total number of slides in this presentation as a single integer only.'
        },
        { type: 'input_file', source: 'primary_document' }
      ]
    }

    appendRequestLog('Detecting total slides from selected deck file.', {
      endpoint: API_ENDPOINTS[OPERATIONS.CRITIQUE_PRIMARY],
      model: 'gpt-5.4-nano',
      requestPayload
    })

    const response = await postMultipart(API_ENDPOINTS[OPERATIONS.CRITIQUE_PRIMARY], requestPayload, {
      primary_document: file
    })
    appendRequestLog('Slide detection response received.', {
      outputText: response.outputText
    })
    const detectedSlides = extractFirstInteger(response.outputText)
    if (!detectedSlides || detectedSlides < 1) {
      throw new Error(`Unable to determine total slides from model output: ${response.outputText || '<empty response>'}`)
    }
    setDeckTotalSlidesInput(detectedSlides)
  }

  async function handlePrimaryDocumentChange(event) {
    const selectedFile = event.target.files?.[0] || null
    setDocFile(selectedFile)
    if (!selectedFile || !isDeckMateWorkflow) {
      setIsCalculatingSlides(false)
      return
    }

    try {
      setIsCalculatingSlides(true)
      setDeckTotalSlidesInput(0)
      setStatus('calculating number of slides')
      await detectDeckTotalSlidesFromFile(selectedFile)
      setError('')
      setStatus('Slide count detected from uploaded presentation.')
    } catch (slideCountError) {
      setError(`Slide count detection failed: ${normalizeRequestError(slideCountError)}`)
      setStatus('Slide count detection failed. Enter Total Slides manually.')
    } finally {
      setIsCalculatingSlides(false)
    }
  }

  async function invokeOperation(operation) {
    if (!docFile) {
      setError(`Upload the primary ${contentNoun} before invoking the model.`)
      setCurrentMode(MODES.DOC_DEFINE)
      return
    }

    if (operation === OPERATIONS.APPLY_CHANGE_ITEMS && !changeItems.length) {
      setError('Create at least one change item before applying changes.')
      setCurrentMode(MODES.CRITIQUE_REVIEW)
      return
    }

    if (operation === OPERATIONS.CRITIQUE_CHANGED && !changedDocumentMarkdown.trim()) {
      setError(`There is no changed ${contentNoun} to critique yet.`)
      setCurrentMode(MODES.RESULT_SAVED)
      return
    }

    const submissionId = `submission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const operationStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    activeSubmissionIdRef.current = submissionId
    setLoading(true)
    setError('')
    clearRequestLog()
    appendRequestLog('New user submission started.', {
      operation,
      operationLabel: operationLabels[operation],
      contentNoun,
      selectedApiMode,
      selectedModel,
      chunkingEnabled,
      chunkSize,
      chunkConcurrency,
      deckTotalSlidesInput,
      slidesToReviewInput
    }, { submissionId })
    setCurrentMode(MODES.INVOKE)
    setLastOperation(operation)
    if (operation === OPERATIONS.APPLY_CHANGE_ITEMS) {
      setLastCritiqueWaitMs(null)
    }
    setStatus(`Invoking ${operationLabels[operation]} via the backend proxy...`)

    await new Promise((resolve) => window.setTimeout(resolve, 0))

    try {
      const llmData =
        operation === OPERATIONS.CRITIQUE_PRIMARY
          ? await (async () => {
              const directFileEntries = {
                primary_document: docFile,
                supporting_document: supportingFile,
                prior_response_document: priorResponseFile
              }
              const runSinglePrimaryRequest = async (requestPayload, chunkContext = null) => {
                const requestPayloadBypassed = {
                  ...requestPayload,
                  messages: await maybeBypassFileMessages(requestPayload.messages, directFileEntries)
                }
                appendRequestLog('Submitting primary critique request to backend.', {
                  endpoint: API_ENDPOINTS[operation],
                  bypassFileInput,
                  deleteFileOnLlm,
                  apiMode: selectedApiMode,
                  model: selectedModel,
                  requestPayload: requestPayloadBypassed,
                  chunkContext,
                  fileEntries: Object.fromEntries(
                    Object.entries(directFileEntries).map(([key, file]) => [
                      key,
                      file ? { name: file.name, size: file.size, type: file.type } : null
                    ])
                  )
                }, { submissionId })

                try {
                  const response = await postMultipart(
                    API_ENDPOINTS[operation],
                    requestPayloadBypassed,
                    bypassFileInput ? {} : directFileEntries
                  )
                  appendRequestLog('Primary critique response received.', {
                    chunkContext,
                    outputTextLength: (response.outputText || '').length,
                    deleteLogs: response.deleteLogs || null,
                    endpointTrace: response.__endpointTrace || null
                  }, { submissionId })
                  return response
                } catch (primaryError) {
                  appendRequestLog('Primary critique request failed.', {
                    chunkContext,
                    error: normalizeRequestError(primaryError)
                  }, { submissionId })
                  if (!bypassFileInput || !isRetryableGatewayError(primaryError)) {
                    throw primaryError
                  }

                  setStatus('Gateway timeout detected. Retrying request...')
                  appendRequestLog('Retrying primary critique request after retryable gateway error.', { chunkContext }, { submissionId })
                  const retryResponse = await postMultipart(
                    API_ENDPOINTS[operation],
                    requestPayloadBypassed,
                    bypassFileInput ? {} : directFileEntries
                  )
                  appendRequestLog('Primary critique retry response received.', {
                    chunkContext,
                    outputTextLength: (retryResponse.outputText || '').length,
                    deleteLogs: retryResponse.deleteLogs || null,
                    endpointTrace: retryResponse.__endpointTrace || null
                  }, { submissionId })
                  return retryResponse
                }
              }

              const totalSlides = clampPositiveInteger(deckTotalSlidesInput, 0)
              const selectedSlides = isDeckMateWorkflow
                ? parseSlidesToReviewInput(slidesToReviewInput)
                : []

              if (isDeckMateWorkflow && !selectedSlides.length) {
                throw new Error('Enter Slides To Review before invoking critique.')
              }

              const shouldUseSlideSubsetChunks = isDeckMateWorkflow && chunkingEnabled && selectedSlides.length > 0
              if (!shouldUseSlideSubsetChunks) {
                return runSinglePrimaryRequest(buildPrimaryCritiqueRequest())
              }

              const configuredChunkSize = clampPositiveInteger(chunkSize, APP_SETTINGS.chunkSizeDefault ?? 6)
              let activeChunkSize =
                isDeckMateWorkflow && deckAdaptiveChunkSize
                  ? clampPositiveInteger(deckAdaptiveChunkSize, configuredChunkSize)
                  : configuredChunkSize
              let reductionAmountUsed = deckChunkLastReduction
              let attemptsRemaining = isDeckMateWorkflow ? 3 : 1
              let pendingSlides = [...selectedSlides]
              const accumulatedSuccessfulChunks = []

              while (attemptsRemaining > 0) {
                const chunkedRequests = buildPrimaryChunkedRequests(pendingSlides, activeChunkSize)
                const calculatedParallel = Math.max(1, Math.ceil(pendingSlides.length / activeChunkSize))
                const maxParallel = Math.min(
                  calculatedParallel,
                  clampPositiveInteger(chunkConcurrency, APP_SETTINGS.chunkConcurrencyDefault ?? 2),
                  chunkedRequests.length
                )
                appendRequestLog('Chunking plan calculated for primary critique.', {
                  totalSlidesForDisplay: totalSlides,
                  selectedSlidesCount: pendingSlides.length,
                  chunkSize: activeChunkSize,
                  chunkCount: chunkedRequests.length,
                  calculatedParallel,
                  chunkConcurrencyCap: clampPositiveInteger(chunkConcurrency, APP_SETTINGS.chunkConcurrencyDefault ?? 2),
                  maxParallel
                }, { submissionId })
                const completedResults = []
                const failedResults = []

                for (let assignedIndex = 0; assignedIndex < chunkedRequests.length; assignedIndex += 1) {
                  const assignedChunk = chunkedRequests[assignedIndex]
                  setStatus(
                    `Invoking ${operationLabels[operation]} chunk ${assignedIndex + 1} of ${chunkedRequests.length} (${assignedChunk.chunk.summary})...`
                  )
                  appendRequestLog('Invoking chunk request.', {
                    chunkIndex: assignedIndex + 1,
                    chunkCount: chunkedRequests.length,
                    slideSummary: assignedChunk.chunk.summary,
                    chunkSize: activeChunkSize
                  }, { submissionId })
                  try {
                    const chunkResult = await runSinglePrimaryRequest(assignedChunk.requestPayload, {
                      chunkIndex: assignedIndex + 1,
                      slideSummary: assignedChunk.chunk.summary,
                      chunkSize: activeChunkSize
                    })
                    completedResults.push({
                      index: assignedChunk.chunk.slides[0] ?? assignedIndex,
                      chunk: assignedChunk.chunk,
                      outputText: chunkResult.outputText
                    })
                    setStatus(`Completed ${completedResults.length}/${chunkedRequests.length} chunks...`)
                  } catch (chunkError) {
                    failedResults.push({
                      index: assignedIndex,
                      chunk: assignedChunk.chunk,
                      error: normalizeRequestError(chunkError)
                    })
                    appendRequestLog('Chunk failure detected; stopping remaining chunks for this attempt.', {
                      failedChunkIndex: assignedIndex + 1,
                      failedChunkSummary: assignedChunk.chunk.summary
                    }, { submissionId })
                    break
                  }
                }
                appendRequestLog('Chunking run completed.', {
                  successCount: completedResults.length,
                  failedCount: failedResults.length,
                  chunkSize: activeChunkSize,
                  failedChunks: failedResults.map((item) => ({
                    chunkIndex: item.index + 1,
                    slideSummary: item.chunk.summary,
                    error: item.error
                  }))
                }, { submissionId })

                if (!failedResults.length) {
                  if (isDeckMateWorkflow) {
                    if (activeChunkSize < configuredChunkSize) {
                      const previousAdaptive = clampPositiveInteger(deckAdaptiveChunkSize, configuredChunkSize)
                      const nextStreak = activeChunkSize === previousAdaptive ? deckChunkSuccessStreak + 1 : 1
                      if (nextStreak >= 2 && reductionAmountUsed > 0) {
                        const recoveredChunkSize = Math.min(configuredChunkSize, activeChunkSize + reductionAmountUsed)
                        setDeckAdaptiveChunkSize(recoveredChunkSize >= configuredChunkSize ? null : recoveredChunkSize)
                        setDeckChunkSuccessStreak(0)
                        setDeckChunkLastReduction(
                          recoveredChunkSize >= configuredChunkSize ? 0 : Math.max(1, configuredChunkSize - recoveredChunkSize)
                        )
                        appendRequestLog('Recovered Deck Mate chunk size after consecutive successful calls.', {
                          priorChunkSize: activeChunkSize,
                          recoveredChunkSize
                        }, { submissionId })
                      } else {
                        setDeckAdaptiveChunkSize(activeChunkSize)
                        setDeckChunkSuccessStreak(nextStreak)
                        if (reductionAmountUsed > 0) {
                          setDeckChunkLastReduction(reductionAmountUsed)
                        }
                      }
                    } else {
                      setDeckAdaptiveChunkSize(null)
                      setDeckChunkSuccessStreak(0)
                      setDeckChunkLastReduction(0)
                    }
                  }

                  const orderedOutput = completedResults
                    .concat(accumulatedSuccessfulChunks)
                    .sort((left, right) => left.index - right.index)
                    .map(
                      (item) =>
                        `### ${item.chunk.summary}\n\n${item.outputText || '_No critique returned for this chunk._'}`
                    )
                    .join('\n\n')

                  return { outputText: orderedOutput, chunked: true }
                }

                attemptsRemaining -= 1
                if (attemptsRemaining < 1 || !isDeckMateWorkflow) {
                  const failureSummary = failedResults
                    .map((item) => `chunk ${item.index + 1} (${item.chunk.summary})`)
                    .join(', ')
                  throw new Error(`Chunked critique failed for ${failedResults.length}/${chunkedRequests.length} chunks: ${failureSummary}`)
                }

                const failedChunk = failedResults[0]?.chunk
                const failedSlideStart = failedChunk?.slides?.[0]
                const nextPendingSlidesIndex = Number.isFinite(failedSlideStart)
                  ? pendingSlides.findIndex((slideNumber) => slideNumber >= failedSlideStart)
                  : -1
                if (nextPendingSlidesIndex > 0) {
                  accumulatedSuccessfulChunks.push(...completedResults)
                  pendingSlides = pendingSlides.slice(nextPendingSlidesIndex)
                }

                const reducedChunkSize = Math.max(1, Math.min(activeChunkSize - 1, Math.floor(activeChunkSize * 0.75)))
                reductionAmountUsed = Math.max(1, activeChunkSize - reducedChunkSize)
                setDeckAdaptiveChunkSize(reducedChunkSize)
                setDeckChunkLastReduction(reductionAmountUsed)
                setDeckChunkSuccessStreak(0)
                appendRequestLog('Deck Mate chunk retry triggered after critique failure. Reducing chunk size by 25%.', {
                  previousChunkSize: activeChunkSize,
                  nextChunkSize: reducedChunkSize,
                  retrySlides: pendingSlides,
                  attemptsRemaining
                }, { submissionId })
                activeChunkSize = reducedChunkSize
              }

              throw new Error('Chunked critique failed after retry attempts.')
            })()
          : operation === OPERATIONS.APPLY_CHANGE_ITEMS
            ? await (async () => {
                const requestPayload = buildApplyChangeItemsRequest()
                const directFileEntries = {
                  original_document: docFile
                }
                const requestPayloadBypassed = {
                  ...requestPayload,
                  messages: await maybeBypassFileMessages(requestPayload.messages, directFileEntries)
                }
                appendRequestLog('Submitting apply-change-items request to backend.', {
                  endpoint: API_ENDPOINTS[operation],
                  bypassFileInput,
                  requestPayload: requestPayloadBypassed
                }, { submissionId })

                try {
                  const response = await postMultipart(
                    API_ENDPOINTS[operation],
                    requestPayloadBypassed,
                    bypassFileInput ? {} : directFileEntries
                  )
                  appendRequestLog('Apply-change-items response received.', {
                    outputTextLength: (response.outputText || '').length
                  }, { submissionId })
                  return response
                } catch (applyError) {
                  appendRequestLog('Apply-change-items request failed.', {
                    error: normalizeRequestError(applyError)
                  }, { submissionId })
                  if (!bypassFileInput || !isRetryableGatewayError(applyError)) {
                    throw applyError
                  }

                  setStatus('Gateway timeout detected. Retrying request...')
                  appendRequestLog('Retrying apply-change-items request after retryable gateway error.', null, { submissionId })
                  const retryResponse = await postMultipart(
                    API_ENDPOINTS[operation],
                    requestPayloadBypassed,
                    bypassFileInput ? {} : directFileEntries
                  )
                  appendRequestLog('Apply-change-items retry response received.', {
                    outputTextLength: (retryResponse.outputText || '').length
                  }, { submissionId })
                  return retryResponse
                }
              })()
            : await (async () => {
                const payload = buildChangedDocCritiqueRequest()
                appendRequestLog('Submitting changed-document critique request to backend.', {
                  endpoint: API_ENDPOINTS[operation],
                  payload
                }, { submissionId })
                const response = await postJson(API_ENDPOINTS[operation], payload)
                appendRequestLog('Changed-document critique response received.', {
                  outputTextLength: (response.outputText || '').length
                }, { submissionId })
                return response
              })()

      const outputText = llmData.outputText

      // eslint-disable-next-line no-console
      console.info('[Delete_File_On_LLM] operation response:', {
        operation,
        apiMode: selectedApiMode,
        deleteFileOnLlm,
        deleteLogs: llmData.deleteLogs || null,
      })

      if (operation === OPERATIONS.APPLY_CHANGE_ITEMS) {
        setChangedDocumentMarkdown(outputText)
        setChangeItems([])
        saveMarkdownToFile(outputText, changedOutputFileName)
        setStatus('Applying change items completed successfully.')
      } else {
        setCritiqueMarkdown(outputText)
        if (operation === OPERATIONS.CRITIQUE_PRIMARY || operation === OPERATIONS.CRITIQUE_CHANGED) {
          const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
          setLastCritiqueWaitMs(Math.max(0, finishedAt - operationStartedAt))
        }
        if (operation === OPERATIONS.CRITIQUE_PRIMARY) {
          saveMarkdownToFile(outputText, critiqueOutputFileName)
        }
        setStatus(
          operation === OPERATIONS.CRITIQUE_CHANGED
            ? `Changed-${contentNoun} critique completed successfully.`
            : `Primary ${contentNoun} critique completed successfully.`
        )
      }

      setCurrentMode(MODES.RESULT_SAVED)
    } catch (invocationError) {
      appendRequestLog('Invocation ended in failure.', { error: normalizeRequestError(invocationError) }, { submissionId })
      setError(`Invocation failed: ${normalizeRequestError(invocationError)}`)
      setStatus('The request did not complete.')
      setCurrentMode(
        operation === OPERATIONS.APPLY_CHANGE_ITEMS ? MODES.CRITIQUE_REVIEW : MODES.DOC_DEFINE
      )
    } finally {
      setLoading(false)
    }
  }

  function addChangeItem() {
    const trimmedId = changeItemDraft.id.trim()
    const trimmedInstruction = changeItemDraft.instruction.trim()

    if (!trimmedId) {
      setError('Enter a change item ID before adding it.')
      return
    }

    if (changeItems.some((item) => item.id === trimmedId)) {
      setError(`Change item '${trimmedId}' already exists.`)
      return
    }

    setChangeItems((items) => [
      ...items,
      { id: trimmedId, instruction: trimmedInstruction || 'make the change as recommended' }
    ])
    setChangeItemDraft(emptyChangeDraft())
    setError('')
  }

  function addDeckIssueSelectionsAsChangeItems() {
    if (!selectedDeckIssueOptions.length) {
      setError('Select at least one Slide / Issue combination first.')
      return
    }

    const optionMap = Object.fromEntries(
      deckIssueOptions.map((item) => [item.optionValue, item])
    )
    const itemsToAdd = selectedDeckIssueOptions
      .map((optionValue) => optionMap[optionValue])
      .filter(Boolean)
      .filter((item) => !changeItems.some((existing) => existing.id === item.optionValue))
      .map((item) => ({
        id: item.optionValue,
        instruction: `Apply updates for Slide ${item.optionValue.split('/')[0].replace('slide-', '')}, Issue ${item.issueNumber}.`
      }))

    if (!itemsToAdd.length) {
      setError('All selected Slide / Issue combinations are already present.')
      return
    }

    setChangeItems((items) => [...items, ...itemsToAdd])
    setSelectedDeckIssueOptions([])
    setError('')
  }

  function updateChangeItemInstruction(changeId, instruction) {
    setChangeItems((items) =>
      items.map((item) =>
        item.id === changeId
          ? { ...item, instruction }
          : item
      )
    )
    setError('')
  }

  function removeChangeItem(changeId) {
    setChangeItems((items) => items.filter((item) => item.id !== changeId))
    setError('')
  }

  function resetToDefinitionMode() {
    setCurrentMode(MODES.DOC_DEFINE)
    setDocFile(null)
    setSlidesToReviewInput('')
    setLastCritiqueWaitMs(null)
    setError('')
    setStatus(`Ready for ${contentNoun} definition.`)
  }

  function renderBackToSuiteButton() {
    return (
      <button
        type="button"
        className="header-text-link"
        onClick={() => {
          if (isSuiteShell) {
            setActiveView(APP_VIEWS.SUITE_HOME)
            return
          }
          window.location.assign('./index-ai.html')
        }}
      >
        Back to A-Ideation
      </button>
    )
  }

  function renderLogoutButton() {
    return (
      <button type="button" className="header-text-link" onClick={handleLogout}>
        Logout
      </button>
    )
  }

  function renderError() {
    if (!error) {
      return null
    }

    return <div className="error-banner">{error}</div>
  }

  function renderRequestLogPanel() {
    if (!logPanelEnabled) {
      return null
    }

    return (
      <section className="card">
        <h2>Request Log</h2>
        <textarea
          name="request_log_panel"
          value={requestLogLines.join('\n\n')}
          readOnly
          rows={12}
          className="critique-editor"
        />
      </section>
    )
  }

  useEffect(() => {
    loadSession()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (activeView === APP_VIEWS.DOCUMENT_DOCTOR) {
      window.__AIDEATION_APP_NAME = 'docdoc'
      return
    }
    if (activeView === APP_VIEWS.DECK_MATE) {
      window.__AIDEATION_APP_NAME = 'deckmate'
      return
    }
    if (activeView === APP_VIEWS.DOC2DECK) {
      window.__AIDEATION_APP_NAME = 'doc2deck'
      return
    }

    window.__AIDEATION_APP_NAME = 'a-ideation'
  }, [activeView])

  useEffect(() => {
    if (isDeckMateWorkflow && bypassFileInput) {
      setBypassFileInput(false)
    }
  }, [isDeckMateWorkflow, bypassFileInput])

  useEffect(() => {
    if (!authUser || !profileLoaded) {
      return
    }

    if (profileSaveTimerRef.current) {
      window.clearTimeout(profileSaveTimerRef.current)
    }

    const settings = {
      apiMode: selectedApiMode,
      model: selectedModel,
      ignoreOcrErrors,
      disableResponseLogging,
      viewPromptEnabled,
      bypassFileInput,
      deleteFileOnLlm,
      logPanelEnabled,
      chunkingEnabled,
      chunkSize,
      chunkConcurrency,
      deckTotalSlides: deckTotalSlidesSetting,
      doc: {
        topic: docTopic,
        objective: docObjective,
        guidance: docGuidance,
        antiGuidance: docAntiGuidance,
        applyChangeItemsGuidance: docApplyChangeItemsGuidance
      },
      deck: {
        topic: deckTopic,
        objective: deckObjective,
        guidance: deckGuidance,
        antiGuidance: deckAntiGuidance,
        applyChangeItemsGuidance: deckApplyChangeItemsGuidance
      }
    }

    profileSaveTimerRef.current = window.setTimeout(() => {
      saveUserProfileSettings(settings)
    }, 500)

    return () => {
      if (profileSaveTimerRef.current) {
        window.clearTimeout(profileSaveTimerRef.current)
      }
    }
  }, [
    authUser,
    profileLoaded,
    selectedApiMode,
    selectedModel,
    ignoreOcrErrors,
    disableResponseLogging,
    viewPromptEnabled,
    bypassFileInput,
    deleteFileOnLlm,
    logPanelEnabled,
    chunkingEnabled,
    chunkSize,
    chunkConcurrency,
    deckTotalSlidesSetting,
    docTopic,
    docObjective,
    docGuidance,
    docAntiGuidance,
    docApplyChangeItemsGuidance,
    deckTopic,
    deckObjective,
    deckGuidance,
    deckAntiGuidance,
    deckApplyChangeItemsGuidance
  ])

  useEffect(() => {
    if (!isDeckMateWorkflow || !deckCritiqueSections.length) {
      setSelectedDeckSlideTab('all')
      return
    }
    if (selectedDeckSlideTab === 'all') {
      return
    }
    const hasCurrent = deckCritiqueSections.some((section) => section.slideNumber === selectedDeckSlideTab)
    if (!hasCurrent) {
      setSelectedDeckSlideTab('all')
    }
  }, [isDeckMateWorkflow, deckCritiqueSections, selectedDeckSlideTab])

  useEffect(() => {
    const allowedOptionValues = new Set(visibleDeckIssueOptions.map((option) => option.optionValue))
    setSelectedDeckIssueOptions((items) => items.filter((item) => allowedOptionValues.has(item)))
  }, [visibleDeckIssueOptions])

  useEffect(() => {
    if (!isDeckMateWorkflow || !changedDeckSections.length) {
      setSelectedChangedDeckSlideTab('all')
      return
    }
    if (selectedChangedDeckSlideTab === 'all') {
      return
    }
    const hasCurrent = changedDeckSections.some((section) => section.slideNumber === selectedChangedDeckSlideTab)
    if (!hasCurrent) {
      setSelectedChangedDeckSlideTab('all')
    }
  }, [isDeckMateWorkflow, changedDeckSections, selectedChangedDeckSlideTab])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!settingsOpen) {
        return
      }

      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(event.target)) {
        setSettingsOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [settingsOpen])

  function renderSettingsControl() {
    const settingsLabels = activeSettings.settingsPanelLabels || {}
    const settingsPanelOrder = activeSettings.settingsPanelOrder || []
    const deckSettingsTabs = [
      {
        id: 'prompt_instructions',
        label: 'Prompt Instructions',
        keys: ['defaultTopic', 'reviewObjective', 'formattingGuidance', 'antiGuidance']
      },
      {
        id: 'application_controls',
        label: 'Application Controls',
        keys: [
          'applyChangeItemsGuidance',
          'viewPrompt',
          'logPanelEnabled',
          'chunkingEnabled',
          'deckTotalSlides',
          'chunkSize',
          'chunkConcurrency'
        ]
      },
      {
        id: 'model_controls',
        label: 'Model Controls',
        keys: ['apiMode', 'llmModel', 'ignoreOcrErrors', 'disableResponseLogging', 'deleteFileOnLlm']
      }
    ]

    function renderSettingsField(settingKey) {
      switch (settingKey) {
        case 'apiMode':
          return (
            <label key={settingKey}>
              {settingsLabels.apiMode || 'API Mode'}
              <select name="api_mode" value={selectedApiMode} onChange={(event) => setSelectedApiMode(event.target.value)}>
                {activeSettings.apiModes.map((apiModeOption) => (
                  <option key={apiModeOption.value} value={apiModeOption.value}>
                    {apiModeOption.label}
                  </option>
                ))}
              </select>
            </label>
          )
        case 'llmModel':
          return (
            <label key={settingKey}>
              {settingsLabels.llmModel || 'LLM Model'}
              <select name="llm_model" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
                {activeSettings.llmModels.map((modelOption) => (
                  <option key={modelOption.value} value={modelOption.value}>
                    {modelOption.label}
                  </option>
                ))}
              </select>
            </label>
          )
        case 'defaultTopic':
          return (
            <label key={settingKey}>
              {settingsLabels.defaultTopic || activeSettings.labels.defaultTopic}
              <textarea name="default_topic" value={topic} onChange={(event) => setTopicForActive(event.target.value)} rows={3} />
            </label>
          )
        case 'reviewObjective':
          return (
            <label key={settingKey}>
              {settingsLabels.reviewObjective || activeSettings.labels.reviewObjective}
              <textarea name="review_objective" value={objective} onChange={(event) => setObjectiveForActive(event.target.value)} rows={3} />
            </label>
          )
        case 'formattingGuidance':
          return (
            <label key={settingKey}>
              {settingsLabels.formattingGuidance || activeSettings.labels.formattingGuidance}
              <textarea name="formatting_guidance" value={guidance} onChange={(event) => setGuidanceForActive(event.target.value)} rows={3} />
            </label>
          )
        case 'antiGuidance':
          return (
            <label key={settingKey}>
              {settingsLabels.antiGuidance || activeSettings.labels.antiGuidance}
              <textarea name="anti_guidance" value={antiGuidance} onChange={(event) => setAntiGuidanceForActive(event.target.value)} rows={3} />
            </label>
          )
        case 'applyChangeItemsGuidance':
          return (
            <label key={settingKey}>
              {settingsLabels.applyChangeItemsGuidance || activeSettings.labels.applyChangeItemsGuidance || 'Apply_Change_Items_Guidance'}
              <textarea
                name="apply_change_items_guidance"
                value={applyChangeItemsGuidance}
                onChange={(event) => setApplyChangeItemsGuidanceForActive(event.target.value)}
                rows={3}
              />
            </label>
          )
        case 'ignoreOcrErrors':
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="ignore_ocr_errors"
                type="checkbox"
                checked={ignoreOcrErrors}
                onChange={(event) => setIgnoreOcrErrors(event.target.checked)}
              />
              {settingsLabels.ignoreOcrErrors || 'Ignore obvious OCR misspellings'}
            </label>
          )
        case 'disableResponseLogging':
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="disable_response_logging"
                type="checkbox"
                checked={disableResponseLogging}
                onChange={(event) => setDisableResponseLogging(event.target.checked)}
              />
              {settingsLabels.disableResponseLogging || 'Disable response logging'}
            </label>
          )
        case 'viewPrompt':
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="view_prompt"
                type="checkbox"
                checked={viewPromptEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked
                  setViewPromptEnabled(enabled)
                  if (!enabled) {
                    setShowPromptPanel(false)
                  }
                }}
              />
              {settingsLabels.viewPrompt || 'View Prompt'}
            </label>
          )
        case 'bypassFileInput':
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="bypass_file_input"
                type="checkbox"
                checked={bypassFileInput}
                onChange={(event) => setBypassFileInput(event.target.checked)}
              />
              {settingsLabels.bypassFileInput || 'Bypass_File_Input'}
            </label>
          )
        case 'deleteFileOnLlm':
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="delete_file_on_llm"
                type="checkbox"
                checked={deleteFileOnLlm}
                onChange={(event) => setDeleteFileOnLlm(event.target.checked)}
              />
              {settingsLabels.deleteFileOnLlm || 'Delete_File_On_LLM'}
            </label>
          )
        case 'logPanelEnabled':
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="log_panel_enabled"
                type="checkbox"
                checked={logPanelEnabled}
                onChange={(event) => setLogPanelEnabled(event.target.checked)}
              />
              {settingsLabels.logPanelEnabled || 'Log_Panel_Enabled'}
            </label>
          )
        case 'chunkingEnabled':
          if (!isDeckMateWorkflow) {
            return null
          }
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="chunking_enabled"
                type="checkbox"
                checked={chunkingEnabled}
                onChange={(event) => setChunkingEnabled(event.target.checked)}
              />
              {settingsLabels.chunkingEnabled || 'Enable slide chunking'}
            </label>
          )
        case 'chunkSize':
          if (!isDeckMateWorkflow) {
            return null
          }
          return (
            <label key={settingKey}>
              {settingsLabels.chunkSize || 'Slides per chunk'}
              <input
                name="chunk_size"
                type="number"
                min={1}
                step={1}
                value={chunkSize}
                onChange={(event) => setChunkSize(clampPositiveInteger(event.target.value, APP_SETTINGS.chunkSizeDefault ?? 6))}
              />
            </label>
          )
        case 'deckTotalSlides':
          if (!isDeckMateWorkflow) {
            return null
          }
          return (
            <label key={settingKey}>
              {settingsLabels.deckTotalSlides || 'Total slides in deck'}
              <input
                name="deck_total_slides"
                type="number"
                min={0}
                step={1}
                value={deckTotalSlidesSetting}
                onChange={(event) => setDeckTotalSlidesSetting(clampPositiveInteger(event.target.value, 0))}
              />
            </label>
          )
        case 'chunkConcurrency':
          if (!isDeckMateWorkflow) {
            return null
          }
          return (
            <label key={settingKey}>
              {settingsLabels.chunkConcurrency || 'Parallel chunk requests'}
              <input
                name="chunk_concurrency"
                type="number"
                min={1}
                step={1}
                value={chunkConcurrency}
                onChange={(event) =>
                  setChunkConcurrency(clampPositiveInteger(event.target.value, APP_SETTINGS.chunkConcurrencyDefault ?? 2))
                }
              />
            </label>
          )
        default:
          return null
      }
    }

    return (
      <div className="settings-dropdown" ref={settingsDropdownRef}>
        <button
          type="button"
          className="settings-button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
        >
          ⚙
        </button>
        {settingsOpen ? (
          <div id="settings-panel" className="gear-settings-panel field-group">
            <button type="button" className="settings-close" onClick={() => setSettingsOpen(false)}>
              Close
            </button>
            {isDeckMateWorkflow ? (
              <>
                <div className="settings-tabs" role="tablist" aria-label="Deck Mate settings tabs">
                  {deckSettingsTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={deckSettingsTab === tab.id ? 'settings-tab active' : 'settings-tab'}
                      role="tab"
                      aria-selected={deckSettingsTab === tab.id}
                      aria-pressed={deckSettingsTab === tab.id}
                      onClick={() => setDeckSettingsTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {(deckSettingsTabs.find((tab) => tab.id === deckSettingsTab) || deckSettingsTabs[0]).keys.map(
                  (settingKey) => renderSettingsField(settingKey)
                )}
              </>
            ) : (
              settingsPanelOrder.map((settingKey) => renderSettingsField(settingKey))
            )}
          </div>
        ) : null}
      </div>
    )
  }

  useEffect(() => {
    if (!showPromptPanel || !viewPromptEnabled) {
      return
    }

    let cancelled = false
    ;(async () => {
      const previewText = await buildPrimaryPromptPreviewText()
      if (!cancelled) {
        setPromptPreviewText(previewText)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    showPromptPanel,
    viewPromptEnabled,
    selectedApiMode,
    bypassFileInput,
    topic,
    objective,
    guidance,
    antiGuidance,
    ignoreOcrErrors,
    supportInstructions,
    priorInstructions,
    docFile,
    supportingFile,
    priorResponseFile
  ])

  if (authLoading) {
    return (
      <main className="layout">
        <section className="card auth-card">
          <h2>Checking session...</h2>
          <p className="muted">Please wait while we verify authentication.</p>
        </section>
      </main>
    )
  }

  function renderAuthOverlay() {
    if (!authOverlayOpen) {
      return null
    }

    return (
      <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Sign in or register">
        <section className="card auth-card auth-overlay-card">
          <div className="auth-overlay-header">
            <h1>A-Ideation Access</h1>
            <button type="button" className="secondary-button" onClick={() => setAuthOverlayOpen(false)}>
              Close
            </button>
          </div>
          <p className="muted">Sign in or register to access the A-Ideation solution suite.</p>
          <div className="auth-toggle-row">
            <button
              type="button"
              className={authMode === 'login' ? 'auth-link-toggle active' : 'auth-link-toggle'}
              onClick={() => {
                setAuthMode('login')
                setRegistrationReadyForVerify(false)
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'auth-link-toggle active' : 'auth-link-toggle'}
              onClick={() => {
                setAuthMode('register')
                setRegistrationReadyForVerify(false)
              }}
            >
              Register
            </button>
          </div>

          {authInfo ? <p className="status-message">{authInfo}</p> : null}
          {renderError()}

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
              />
            </label>
            {authMode === 'register' ? (
              <label>
                Display Name
                <input
                  type="text"
                  value={authDisplayName}
                  onChange={(event) => setAuthDisplayName(event.target.value)}
                  placeholder="Optional"
                />
              </label>
            ) : null}
            <button type="submit" className="primary-button" disabled={authSubmitting}>
              {authSubmitting
                ? authMode === 'register'
                  ? 'Creating Account...'
                  : 'Signing In...'
                : authMode === 'register'
                  ? 'Create Account'
                  : 'Sign In'}
            </button>
          </form>

          {authMode === 'register' ? (
            <details className="auth-subpanel" open={registrationReadyForVerify}>
              <summary>Verify Email</summary>
              <form className="auth-inline-form" onSubmit={handleVerifyEmail}>
                <input
                  type="text"
                  value={verifyToken}
                  onChange={(event) => setVerifyToken(event.target.value)}
                  placeholder="Verification token"
                  required
                />
                <button type="submit" className="secondary-button">
                  Verify
                </button>
              </form>
            </details>
          ) : null}

          {authMode === 'login' ? (
            <details className="auth-subpanel">
              <summary>Password Reset</summary>
              <div className="auth-inline-row">
                <button type="button" className="secondary-button" onClick={handleForgotPassword}>
                  Request Reset Token
                </button>
              </div>
              <form className="auth-inline-form" onSubmit={handleResetPassword}>
                <input
                  type="text"
                  value={resetToken}
                  onChange={(event) => setResetToken(event.target.value)}
                  placeholder="Reset token"
                  required
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password"
                  required
                />
                <button type="submit" className="secondary-button">
                  Reset Password
                </button>
              </form>
            </details>
          ) : null}
        </section>
      </div>
    )
  }

  if (activeView === APP_VIEWS.SUITE_HOME) {
    const suiteDisplayName = authUser?.displayName?.trim() ? authUser.displayName : authUser?.email

    return (
      <main className="layout">
        <header className="hero card suite-hero">
          <div className="hero-corner hero-left" />
          <div className="hero-title-group">
            <h1>A-Ideation</h1>
            <p className="hero-subtitle">Improving Professional Productivity</p>
          </div>
          <div className="hero-corner hero-right">
            <div className="hero-right-stack">
              {authUser ? (
                <>
                  <div className="suite-user-info">
                    <span>{suiteDisplayName}</span>
                    <small>({authUser.email})</small>
                  </div>
                  {renderLogoutButton()}
                </>
              ) : (
                <button
                  type="button"
                  className="auth-link-toggle"
                  onClick={() => {
                    setAuthMode('login')
                    setAuthOverlayOpen(true)
                  }}
                >
                  Sign-In / Register
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="card suite-links">
          <h2>Solutions</h2>
          <div className="suite-link-grid">
            <button type="button" className="suite-link-card" onClick={() => handleProtectedNavigation(APP_VIEWS.DOCUMENT_DOCTOR)}>
              <img src={logo} alt="Document Doctor logo" />
              <span>Document Doctor</span>
            </button>
            <button type="button" className="suite-link-card" onClick={() => handleProtectedNavigation(APP_VIEWS.DECK_MATE)}>
              <img src={deckMateLogo} alt="Deck Mate logo" />
              <span>Deck Mate</span>
            </button>
            <button type="button" className="suite-link-card" onClick={() => handleProtectedNavigation(APP_VIEWS.DOC2DECK)}>
              <img src={doc2DeckLogo} alt="Doc 2 Deck logo" />
              <span>Doc2Deck</span>
            </button>
          </div>
        </section>
        {showAuthRequiredNotice ? (
          <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Authentication required">
            <section className="card auth-required-popup">
              <p>Please sign in or register.</p>
              <div className="auth-inline-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setShowAuthRequiredNotice(false)
                    setAuthMode('login')
                    setAuthOverlayOpen(true)
                  }}
                >
                  Open Sign-In
                </button>
                <button type="button" className="secondary-button" onClick={() => setShowAuthRequiredNotice(false)}>
                  Close
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {renderAuthOverlay()}
      </main>
    )
  }

  if (activeView === APP_VIEWS.DOC2DECK) {
    return (
      <PageShell
        mode={MODES.DOC_DEFINE}
        {...workflowShellProps}
        topRightControls={
          <>
            {renderBackToSuiteButton()}
            {renderLogoutButton()}
          </>
        }
        appTitle="Doc 2 Deck"
        appSubtitle="A Professional Review Tool for Presentation Authors"
        brandLogo={doc2DeckLogo}
        brandAlt="Document Doctor and Deck Mate shaking hands logo"
      >
        <section className="card compact-panel">
          <h2>Doc 2 Deck</h2>
          <p className="muted">Doc2Deck home screen placeholder.</p>
        </section>
      </PageShell>
    )
  }

  const workflowShellProps = isDeckMateWorkflow
    ? {
        appTitle: 'Deck Mate',
        appSubtitle: 'A Professional Review Tool for Presentation Authors',
        brandLogo: deckMateLogo,
        brandAlt: 'Cartoon sailor on a boat presentation logo'
      }
    : {
        appTitle: 'The Document Doctor',
        appSubtitle: 'A Professional Review Tool for Document Authors',
        brandLogo: logo,
        brandAlt: 'Cartoon paper doctor logo'
      }

  if (currentMode === MODES.DOC_DEFINE) {
    return (
      <PageShell
        mode={MODES.DOC_DEFINE}
        {...workflowShellProps}
        topRightControls={
          <>
            {renderBackToSuiteButton()}
            {renderLogoutButton()}
            {renderSettingsControl()}
          </>
        }
      >
        {renderError()}
        {!isDeckMateWorkflow ? renderRequestLogPanel() : null}

        <section className="card primary-upload-card">
          <div className="primary-upload-inner split">
            <div className="primary-upload-left">
              {isDeckMateWorkflow ? (
                <div className="deck-file-grid">
                  <span className="panel-label deck-grid-label">Select presentation</span>
                  <span className={`panel-label deck-grid-label${isCalculatingSlides || deckTotalSlidesInput < 1 ? ' disabled-label' : ''}`}>
                    Total Slides
                  </span>
                  <span className={`panel-label deck-grid-label${isCalculatingSlides || deckTotalSlidesInput < 1 ? ' disabled-label' : ''}`}>
                    Slides To Review
                  </span>
                  <span className={`panel-label deck-grid-label${isCalculatingSlides || deckTotalSlidesInput < 1 ? ' disabled-label' : ''}`}>
                    Critique Output File
                  </span>
                  <div className="deck-file-cell">
                    <input
                      id="deck_primary_document"
                      name="primary_document"
                      type="file"
                      onChange={handlePrimaryDocumentChange}
                    />
                  </div>
                  <input
                    id="deck_total_slides_main"
                    type="number"
                    name="deck_total_slides_main"
                    min={0}
                    step={1}
                    className="slide-count-input"
                    disabled={isCalculatingSlides || deckTotalSlidesInput < 1}
                    value={deckTotalSlidesInput}
                    onChange={(event) => setDeckTotalSlidesInput(clampPositiveInteger(event.target.value, 0))}
                  />
                  <input
                    id="slides_to_review_main"
                    type="text"
                    name="slides_to_review_main"
                    className="slides-to-review-input"
                    disabled={isCalculatingSlides || deckTotalSlidesInput < 1}
                    value={slidesToReviewInput}
                    onChange={(event) => setSlidesToReviewInput(event.target.value)}
                  />
                  <input
                    id="critique_output_file"
                    type="text"
                    name="critique_output_file"
                    className="deck-critique-output-input"
                    disabled={isCalculatingSlides || deckTotalSlidesInput < 1}
                    value={critiqueOutputFileName}
                    onChange={(event) => setCritiqueOutputFileName(event.target.value)}
                  />
                </div>
              ) : (
                <>
                  <label className="panel-label">{`Select primary ${contentNoun}`}</label>
                  <div className="file-selector-row">
                  <input
                    name="primary_document"
                    type="file"
                    onChange={handlePrimaryDocumentChange}
                  />
                  {docFile ? (
                    <label className="output-file-field compact-output-field deck-output-field">
                      Critique Output File
                      <input
                        type="text"
                        name="critique_output_file"
                        value={critiqueOutputFileName}
                        onChange={(event) => setCritiqueOutputFileName(event.target.value)}
                      />
                    </label>
                  ) : null}
                  </div>
                </>
              )}
            </div>
            <div className="primary-upload-actions">
              <button
                type="button"
                disabled={
                  !docFile ||
                  (isDeckMateWorkflow &&
                    (isCalculatingSlides || deckTotalSlidesInput < 1 || !slidesToReviewInput.trim()))
                }
                onClick={() => invokeOperation(OPERATIONS.CRITIQUE_PRIMARY)}
              >
                {`Critique ${contentNounTitle}`}
              </button>
              {viewPromptEnabled ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (showPromptPanel) {
                      setShowPromptPanel(false)
                      return
                    }

                    setPromptPreviewText('Building prompt preview...')
                    setShowPromptPanel(true)
                    setPromptPreviewText(await buildPrimaryPromptPreviewText())
                  }}
                >
                  View Prompt
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card grid two-column-grid">
          <div className="field-group">
            <h2>{`Primary ${contentNoun} definition`}</h2>
            <label>
              {activeSettings.labels.defaultTopic}
              <textarea name="topic_main" value={topic} onChange={(event) => setTopicForActive(event.target.value)} rows={3} />
            </label>
            <label>
              {activeSettings.labels.reviewObjective}
              <textarea
                name="objective_main"
                value={objective}
                onChange={(event) => setObjectiveForActive(event.target.value)}
                rows={3}
              />
            </label>
          </div>

          <div className="field-group">
            <h2>Response guidance</h2>
            <label>
              {activeSettings.labels.formattingGuidance}
              <textarea
                name="guidance_main"
                value={guidance}
                onChange={(event) => setGuidanceForActive(event.target.value)}
                rows={3}
              />
            </label>
            <label>
              {activeSettings.labels.antiGuidance}
              <textarea
                name="anti_guidance_main"
                value={antiGuidance}
                onChange={(event) => setAntiGuidanceForActive(event.target.value)}
                rows={3}
              />
            </label>
          </div>

          <details className="collapsible-panel">
            <summary>{`Supporting ${contentNounPlural}`}</summary>
            <div className="collapsible-panel-body field-group">
              <label>
                {`Supporting ${contentNounTitle}`}
                <input
                  name="supporting_document"
                  type="file"
                  onChange={(event) => setSupportingFile(event.target.files?.[0] || null)}
                />
              </label>
              <label>
                {`Supporting ${contentNounTitle} Context`}
                <textarea
                  name="support_instructions"
                  value={supportInstructions}
                  onChange={(event) => setSupportInstructionsForActive(event.target.value)}
                  rows={4}
                />
              </label>
            </div>
          </details>

          <details className="collapsible-panel">
            <summary>Prior response</summary>
            <div className="collapsible-panel-body field-group">
              <label>
                {`Prior Response ${contentNounTitle}`}
                <input
                  name="prior_response_document"
                  type="file"
                  onChange={(event) => setPriorResponseFile(event.target.files?.[0] || null)}
                />
              </label>
              <label>
                Prior Response Context
                <textarea
                  name="prior_instructions"
                  value={priorInstructions}
                  onChange={(event) => setPriorInstructionsForActive(event.target.value)}
                  rows={4}
                />
              </label>
            </div>
          </details>
        </section>

        {viewPromptEnabled && showPromptPanel ? (
          <section className="card prompt-preview-card">
            <h2>Prompt Preview</h2>
            <pre>{promptPreviewText}</pre>
          </section>
        ) : null}
        {isDeckMateWorkflow && isCalculatingSlides ? (
          <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Calculating number of slides">
            <section className="card slide-count-popup">
              <h3>Please wait</h3>
              <p>calculating number of slides</p>
            </section>
          </div>
        ) : null}
        {isDeckMateWorkflow ? renderRequestLogPanel() : null}
      </PageShell>
    )
  }

  if (currentMode === MODES.INVOKE) {
    return (
      <PageShell
        mode={MODES.INVOKE}
        {...workflowShellProps}
        topRightControls={
          <>
            {renderBackToSuiteButton()}
            {renderLogoutButton()}
          </>
        }
      >
        <section className="card invoke-card compact-panel">
          <div className="spinner" aria-hidden="true" />
          <h2>Invoking the AI Model</h2>
        </section>
        {renderRequestLogPanel()}
      </PageShell>
    )
  }

  if (currentMode === MODES.RESULT_SAVED) {
    return (
      <PageShell
        mode={MODES.RESULT_SAVED}
        {...workflowShellProps}
        topRightControls={
          <>
            {renderBackToSuiteButton()}
            {renderLogoutButton()}
          </>
        }
      >
        <section className="card result-card compact-panel">
          <h2>AI Model Result Saved</h2>
          {renderError()}
          {lastCritiqueWaitMs !== null ? (
            <p className="muted">{`Wait Time: ${(lastCritiqueWaitMs / 1000).toFixed(1)}s`}</p>
          ) : null}
          {!isDeckMateWorkflow ? renderRequestLogPanel() : null}
          <div className="action-row wrap-actions center-actions">
            {lastOperation === OPERATIONS.APPLY_CHANGE_ITEMS ? (
              <button type="button" onClick={() => setCurrentMode(MODES.VIEW_CHANGED)}>
                {`View Changed ${contentNounTitle}`}
              </button>
            ) : (
              <button type="button" onClick={() => setCurrentMode(MODES.CRITIQUE_REVIEW)}>
                View Critique
              </button>
            )}
            <button type="button" className="secondary-button" onClick={resetToDefinitionMode}>
              Start Over
            </button>
          </div>
        </section>
        {isDeckMateWorkflow ? renderRequestLogPanel() : null}
      </PageShell>
    )
  }

  if (currentMode === MODES.CRITIQUE_REVIEW) {
    return (
      <PageShell
        mode={MODES.CRITIQUE_REVIEW}
        {...workflowShellProps}
        topRightControls={
          <>
            {renderBackToSuiteButton()}
            {renderLogoutButton()}
          </>
        }
      >
        <section className="card action-row wrap-actions center-actions compact-panel">
            <button type="button" className="secondary-button" onClick={resetToDefinitionMode}>
              Exit Review
            </button>
            <button
              type="button"
              onClick={() => invokeOperation(OPERATIONS.APPLY_CHANGE_ITEMS)}
              disabled={!changeItems.length}
            >
              Apply Change Items
            </button>
            {viewPromptEnabled ? (
              <button
                type="button"
                onClick={async () => {
                  if (showPromptPanel) {
                    setShowPromptPanel(false)
                    return
                  }

                  setPromptPreviewText('Building prompt preview...')
                  setShowPromptPanel(true)
                  setPromptPreviewText(await buildApplyChangeItemsPromptPreviewText())
                }}
              >
                View Prompt
              </button>
            ) : null}
            {changeItems.length ? (
              <label className="output-file-field inline-output-field">
                {`Changed ${contentNounTitle} Output File`}
                <input
                  type="text"
                  name="changed_output_file"
                  value={changedOutputFileName}
                  onChange={(event) => setChangedOutputFileName(event.target.value)}
                />
              </label>
            ) : null}
        </section>

        {renderError()}
        {!isDeckMateWorkflow ? renderRequestLogPanel() : null}

        <section className="card review-grid critique-review-layout">
          <div className="field-group critique-panel">
            {isDeckMateWorkflow && deckCritiqueSections.length ? (
              <>
                <div
                  className={deckCritiqueSections.length > 10 ? 'settings-tabs slide-tabs-scrollable' : 'settings-tabs'}
                  role="tablist"
                  aria-label="Critique slide tabs"
                >
                  <button
                    type="button"
                    className={selectedDeckSlideTab === 'all' ? 'settings-tab active' : 'settings-tab'}
                    onClick={() => setSelectedDeckSlideTab('all')}
                  >
                    All
                  </button>
                  {deckCritiqueSections.map((section) => (
                    <button
                      key={section.slideNumber}
                      type="button"
                      className={selectedDeckSlideTab === section.slideNumber ? 'settings-tab active' : 'settings-tab'}
                      onClick={() => setSelectedDeckSlideTab(section.slideNumber)}
                    >
                      {`Slide ${section.slideNumber}`}
                    </button>
                  ))}
                </div>
                <label className="panel-field">
                  <span className="panel-label">Critique Content</span>
                  <textarea
                    className="critique-editor"
                    value={
                      (selectedDeckSlideTab === 'all'
                        ? critiqueMarkdown
                        : deckCritiqueSections.find((section) => section.slideNumber === selectedDeckSlideTab)?.content) ||
                      critiqueMarkdown
                    }
                    readOnly
                    rows={REVIEW_TEXTAREA_ROWS}
                  />
                </label>
              </>
            ) : (
              <label className="panel-field">
                <span className="panel-label">Critique Content</span>
                <textarea
                  className="critique-editor"
                  value={critiqueMarkdown}
                  onChange={(event) => setCritiqueMarkdown(event.target.value)}
                  rows={REVIEW_TEXTAREA_ROWS}
                />
              </label>
            )}
          </div>

          <aside className="side-panel change-composer">
            <div className="side-panel-header">
              <h3>Create change items</h3>
              <p className="muted">{`Capture concise edits, then apply them to the ${contentNoun}.`}</p>
            </div>

            <div className="change-composer-card">
              {isDeckMateWorkflow ? (
                <>
                  <label>
                    Slide / Issue selections
                    <select
                      multiple
                      value={selectedDeckIssueOptions}
                      onChange={(event) =>
                        setSelectedDeckIssueOptions(
                          [...event.target.selectedOptions].map((option) => option.value)
                        )
                      }
                      size={5}
                    >
                      {visibleDeckIssueOptions.map((option) => (
                        <option key={option.optionValue} value={option.optionValue}>
                          {option.optionLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={addDeckIssueSelectionsAsChangeItems}>
                    Add Selected Issues as Change Items
                  </button>
                </>
              ) : (
                <>
                  <label>
                    Change ID
                    <input
                      type="text"
                      value={changeItemDraft.id}
                      onChange={(event) =>
                        setChangeItemDraft((draft) => ({ ...draft, id: event.target.value }))
                      }
                      placeholder="major-1"
                    />
                  </label>
                  <label>
                    Change Instruction
                    <textarea
                      className="compact-textarea"
                      value={changeItemDraft.instruction}
                      onChange={(event) =>
                        setChangeItemDraft((draft) => ({ ...draft, instruction: event.target.value }))
                      }
                      rows={3}
                    />
                  </label>
                  <button type="button" onClick={addChangeItem}>
                    Create Change Item
                  </button>
                </>
              )}
            </div>

            <div className="change-item-list-card">
              <div className="change-item-list-header">
                <span>Change Items</span>
                <span>{changeItems.length}</span>
              </div>
              <div className="change-item-list">
                {changeItems.length ? (
                  changeItems.map((item) => (
                    <article key={item.id} className="change-item-card">
                      <div className="change-item-header">
                        <h4>{item.id}</h4>
                        <button
                          type="button"
                          className="change-item-remove-link"
                          onClick={() => removeChangeItem(item.id)}
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        className="change-item-instruction-input"
                        value={item.instruction}
                        onChange={(event) => updateChangeItemInstruction(item.id, event.target.value)}
                      />
                    </article>
                  ))
                ) : (
                  <p className="muted">No entries saved yet.</p>
                )}
              </div>
            </div>
          </aside>
        </section>

        {viewPromptEnabled && showPromptPanel ? (
          <section className="card prompt-preview-card">
            <h2>Prompt Preview</h2>
            <pre>{promptPreviewText}</pre>
          </section>
        ) : null}
        {isDeckMateWorkflow ? renderRequestLogPanel() : null}
      </PageShell>
    )
  }

  return (
    <PageShell
      mode={MODES.VIEW_CHANGED}
      {...workflowShellProps}
      topRightControls={
        <>
          {renderBackToSuiteButton()}
          {renderLogoutButton()}
        </>
      }
    >
      <section className="card action-row wrap-actions center-actions compact-panel">
        <button type="button" onClick={() => invokeOperation(OPERATIONS.CRITIQUE_CHANGED)}>
          {`Critique Changed ${contentNounTitle}`}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setChangeItems([])
            setCurrentMode(MODES.CRITIQUE_REVIEW)
          }}
        >
          Discard Changes
        </button>
        <button type="button" className="secondary-button" onClick={resetToDefinitionMode}>
          Start Over
        </button>
      </section>

      {renderError()}
      {!isDeckMateWorkflow ? renderRequestLogPanel() : null}

      <section className="card field-group tall-document-panel">
        {isDeckMateWorkflow ? (
          <>
            <div
              className={changedDeckSections.length > 10 ? 'settings-tabs slide-tabs-scrollable' : 'settings-tabs'}
              role="tablist"
              aria-label="Changed content slide tabs"
            >
              <button
                type="button"
                className={selectedChangedDeckSlideTab === 'all' ? 'settings-tab active' : 'settings-tab'}
                onClick={() => setSelectedChangedDeckSlideTab('all')}
              >
                All
              </button>
              {changedDeckSections.map((section) => (
                <button
                  key={section.slideNumber}
                  type="button"
                  className={selectedChangedDeckSlideTab === section.slideNumber ? 'settings-tab active' : 'settings-tab'}
                  onClick={() => setSelectedChangedDeckSlideTab(section.slideNumber)}
                >
                  {`Slide ${section.slideNumber}`}
                </button>
              ))}
            </div>
            <label>
              {`Changed ${contentNoun} content`}
              <textarea
                value={
                  (selectedChangedDeckSlideTab === 'all'
                    ? changedDocumentMarkdown
                    : changedDeckSections.find((section) => section.slideNumber === selectedChangedDeckSlideTab)?.content) ||
                  changedDocumentMarkdown
                }
                onChange={(event) => {
                  if (selectedChangedDeckSlideTab === 'all') {
                    setChangedDocumentMarkdown(event.target.value)
                  }
                }}
                readOnly={selectedChangedDeckSlideTab !== 'all'}
                rows={REVIEW_TEXTAREA_ROWS}
              />
            </label>
          </>
        ) : (
          <label>
            {`Changed ${contentNoun} content`}
            <textarea
              value={changedDocumentMarkdown}
              onChange={(event) => setChangedDocumentMarkdown(event.target.value)}
              rows={REVIEW_TEXTAREA_ROWS}
            />
          </label>
        )}
      </section>
      {isDeckMateWorkflow ? renderRequestLogPanel() : null}
    </PageShell>
  )
}

  async function buildApplyChangeItemsPromptPreviewText() {
    const requestPayload = buildApplyChangeItemsRequest()
    requestPayload.messages = await maybeBypassFileMessages(requestPayload.messages, {
      original_document: docFile
    })

    const openAiEndpoint =
      selectedApiMode === 'chat'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.openai.com/v1/responses'

    if (selectedApiMode !== 'chat') {
      return JSON.stringify(
        {
          openAiEndpoint,
          ...requestPayload
        },
        null,
        2
      )
    }

    const chatContent = requestPayload.messages.map((item) =>
      item.type === 'input_text'
        ? { type: 'text', text: item.text || '' }
        : { type: 'file', file: { source: item.source || 'file_reference' } }
    )

    return JSON.stringify(
      {
        openAiEndpoint,
        model: requestPayload.model,
        store: requestPayload.store,
        messages: [
          { role: 'system', content: requestPayload.systemPrompt },
          { role: 'user', content: chatContent }
        ]
      },
      null,
      2
    )
  }
