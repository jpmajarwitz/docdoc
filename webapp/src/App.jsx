import { useEffect, useMemo, useRef, useState } from 'react'
import * as mammoth from 'mammoth'
import { APP_SETTINGS } from './config/appSettings'
import { DECK_MATE_SETTINGS } from './config/deckMateSettings'
import { DOC2DECK_SETTINGS } from './config/doc2DeckSettings'
import { RESUNATOR_SETTINGS } from './config/resunatorSettings'

const APP_VIEWS = {
  SUITE_HOME: 'suite_home',
  DOCUMENT_DOCTOR: 'document_doctor',
  DECK_MATE: 'deck_mate',
  DOC2DECK: 'doc2deck',
  ZOOM_ZILLA: 'zoom_zilla',
  RESUNATOR: 'resunator',
  REGISTRATION_ADMIN: 'registration_admin'
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

const RESUNATOR_FILE_SOURCES = {
  RESUME: 'Resume file',
  JOB_DESCRIPTION: 'Job Description file'
}

const FILE_SOURCE_TRANSPORT_ALIASES = {
  [RESUNATOR_FILE_SOURCES.RESUME]: 'primary_document',
  [RESUNATOR_FILE_SOURCES.JOB_DESCRIPTION]: 'job_description_document'
}

function resunatorResumeSourceLabel(index) {
  return `Resume_${index + 1}`
}

const AUTH_ENDPOINTS = {
  SESSION: `${API_BASE_URL}/api/auth/session/`,
  REGISTER: `${API_BASE_URL}/api/auth/register/`,
  VERIFY_EMAIL: `${API_BASE_URL}/api/auth/verify-email/`,
  LOGIN: `${API_BASE_URL}/api/auth/login/`,
  LOGOUT: `${API_BASE_URL}/api/auth/logout/`,
  PROFILE: `${API_BASE_URL}/api/auth/profile/`,
  FORGOT_PASSWORD: `${API_BASE_URL}/api/auth/forgot-password/`,
  RESET_PASSWORD: `${API_BASE_URL}/api/auth/reset-password/`,
  CONTACT_REQUEST: `${API_BASE_URL}/api/auth/contact-request/`,
  ACCESS_CHECK: `${API_BASE_URL}/api/auth/access-check/`,
  RESUNATOR_JOB_REQ: `${API_BASE_URL}/api/resunator/job-req-url/`,
  REGISTRATION_PENDING: `${API_BASE_URL}/api/auth/registration-pending/`,
  REGISTRATION_APPROVE: `${API_BASE_URL}/api/auth/registration-approve/`,
  REGISTRATION_USERS: `${API_BASE_URL}/api/auth/registration-users/`,
  REGISTRATION_USER_UPDATE: `${API_BASE_URL}/api/auth/registration-user-update/`,
  REGISTRATION_CONTACT_CREATE: `${API_BASE_URL}/api/auth/registration-contact-create/`,
  REGISTRATION_SESSION_CLEANUP: `${API_BASE_URL}/api/auth/registration-session-cleanup/`,
  GETTING_STARTED: `${API_BASE_URL}/api/getting-started/`
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
const DOCDOC_LOGO_PATH = `${import.meta.env.BASE_URL}assets/docdoc-logo-small.jpg`
const DECK_MATE_LOGO_PATH = `${import.meta.env.BASE_URL}assets/deck-mate-logo-small.jpg`
const DOC2DECK_LOGO_PATH = `${import.meta.env.BASE_URL}assets/doc2deck-logo-small.jpg`
const ZOOM_ZILLA_LOGO_PATH = `${import.meta.env.BASE_URL}assets/zoom-zilla-logo-small.jpg`
const RESUNATOR_LOGO_PATH = `${import.meta.env.BASE_URL}assets/reso-nator-logo-small.jpg`

function emptyChangeDraft(defaultInstruction = 'create item as stated') {
  return {
    id: '',
    instruction: defaultInstruction
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

function isDocxFile(file) {
  if (!file) return false
  const name = `${file.name || ''}`.toLowerCase()
  return name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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
      const matchedSlideNumber = Number.parseInt(slideMatch[1], 10)
      if (currentSection && currentSection.slideNumber === matchedSlideNumber) {
        currentSection.lines.push(line)
        return
      }
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = {
        slideNumber: matchedSlideNumber,
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

function parseDoc2DeckPptxJsonSections(rawText) {
  const parsed = parseDoc2DeckPptxJson(rawText)
  if (!parsed) {
    return []
  }

  const slides = Array.isArray(parsed?.deck?.slides) ? parsed.deck.slides : []
  return slides
    .map((slide, index) => {
      const slideNumber = Number.parseInt(`${slide?.slide_number ?? slide?.slideNumber ?? index + 1}`, 10)
      if (!Number.isFinite(slideNumber)) {
        return null
      }
      const title = `${slide?.title || `Slide ${slideNumber}`}`.trim() || `Slide ${slideNumber}`
      const bullets = Array.isArray(slide?.bullets) ? slide.bullets.filter(Boolean).map((item) => `${item}`.trim()) : []
      const speakerNotes = `${slide?.speaker_notes || slide?.speakerNotes || ''}`.trim()

      const lines = [`Slide-${slideNumber} — ${title}`]
      if (bullets.length) {
        lines.push('', 'Bullets:')
        bullets.forEach((bullet) => {
          lines.push(`- ${bullet}`)
        })
      }
      if (speakerNotes) {
        lines.push('', 'Speaker Notes:', speakerNotes)
      }

      return {
        slideNumber,
        title,
        lines,
        content: lines.join('\n').trim()
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.slideNumber - right.slideNumber)
}

function parseDoc2DeckPptxJsonWithMeta(rawText) {
  const text = `${rawText || ''}`.trim()
  if (!text) {
    return { parsed: null, usedFallback: false }
  }

  const candidates = []
  candidates.push(text)

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim())
  }

  const balancedJsonObjects = []
  let depth = 0
  let inString = false
  let escaped = false
  let objectStart = -1
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        objectStart = index
      }
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0 && objectStart >= 0) {
        balancedJsonObjects.push(text.slice(objectStart, index + 1).trim())
        objectStart = -1
      }
    }
  }

  if (balancedJsonObjects.length) {
    const parsedObjects = balancedJsonObjects
      .map((chunk) => {
        try {
          return JSON.parse(chunk)
        } catch (_error) {
          return null
        }
      })
      .filter(Boolean)
    const deckObjects = parsedObjects.filter((item) => Array.isArray(item?.deck?.slides))

    if (deckObjects.length) {
      const mergedSlidesMap = new Map()
      deckObjects.forEach((item) => {
        item.deck.slides.forEach((slide, index) => {
          const parsedSlideNumber = Number.parseInt(`${slide?.slide_number ?? slide?.slideNumber ?? ''}`, 10)
          const slideKey = Number.isFinite(parsedSlideNumber) ? parsedSlideNumber : `fallback-${mergedSlidesMap.size}-${index}`
          mergedSlidesMap.set(slideKey, slide)
        })
      })

      const firstDeck = deckObjects[0]
      const mergedSlides = [...mergedSlidesMap.entries()]
        .sort((left, right) => {
          const [leftKey] = left
          const [rightKey] = right
          if (typeof leftKey === 'number' && typeof rightKey === 'number') {
            return leftKey - rightKey
          }
          return `${leftKey}`.localeCompare(`${rightKey}`)
        })
        .map(([, slide]) => slide)

      return {
        usedFallback: false,
        parsed: {
        ...firstDeck,
        deck: {
          ...firstDeck.deck,
          slides: mergedSlides
        }
      }
      }
    }

    candidates.push(...balancedJsonObjects)
  }

  for (const candidate of candidates) {
    try {
      return { parsed: JSON.parse(candidate), usedFallback: true }
    } catch (_error) {
      // try next candidate
    }
  }
  return { parsed: null, usedFallback: false }
}

function parseDoc2DeckPptxJson(rawText) {
  return parseDoc2DeckPptxJsonWithMeta(rawText).parsed
}

let pptxGenJsLoaderPromise = null

function loadPptxGenJsFromCdn() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PptxGenJS can only be loaded in a browser environment.'))
  }
  if (window.PptxGenJS) {
    return Promise.resolve(window.PptxGenJS)
  }
  if (!pptxGenJsLoaderPromise) {
    pptxGenJsLoaderPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-pptxgenjs-cdn="true"]')
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.PptxGenJS))
        existingScript.addEventListener('error', () => reject(new Error('Failed to load PptxGenJS from CDN.')))
        return
      }

      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js'
      script.async = true
      script.dataset.pptxgenjsCdn = 'true'
      script.addEventListener('load', () => {
        if (window.PptxGenJS) {
          resolve(window.PptxGenJS)
        } else {
          reject(new Error('PptxGenJS loaded but global constructor was not found.'))
        }
      })
      script.addEventListener('error', () => reject(new Error('Failed to load PptxGenJS from CDN.')))
      document.head.appendChild(script)
    })
  }
  return pptxGenJsLoaderPromise
}

function PageShell({
  mode,
  topLeftControls = null,
  topRightControls = null,
  children,
  appTitle = 'The Document Doctor',
  appSubtitle = 'A Professional Review Tool for Document Authors',
  brandLogo = DOCDOC_LOGO_PATH,
  brandAlt = 'Cartoon paper doctor logo',
  brandFallbackText = '',
  showBrand = true,
  shellClassName = ''
}) {
  const [brandLoadFailed, setBrandLoadFailed] = useState(false)

  useEffect(() => {
    setBrandLoadFailed(false)
  }, [brandLogo])

  return (
    <main className="layout">
      <header className={`hero card ${shellClassName}`.trim()}>
        <div className="hero-corner hero-left">
          {showBrand ? (
            brandLoadFailed ? (
              <div className="brand-logo-placeholder">{brandFallbackText || 'Logo'}</div>
            ) : (
              <img
                className="brand-logo"
                src={brandLogo}
                alt={brandAlt}
                onError={() => {
                  setBrandLoadFailed(true)
                }}
              />
            )
          ) : null}
          {topLeftControls ? <div className="hero-left-controls">{topLeftControls}</div> : null}
        </div>
        <div className="hero-title-group">
          <h1>{appTitle}</h1>
          {appSubtitle ? <p className="hero-subtitle">{appSubtitle}</p> : null}
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
  const phpMirrorSeeds = []
  seeds.forEach((seed) => {
    if (seed.includes('/api/')) {
      phpMirrorSeeds.push(seed.replace('/api/', '/src_php/api/'))
    }
  })
  seeds.push(...phpMirrorSeeds)
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
  if (path.includes('index-zz')) {
    return 'zoom-zilla'
  }

  return 'a-ideation'
}

function withAppHeaders(headers = {}) {
  const csrfToken = typeof window !== 'undefined' ? (window.__AIDEATION_CSRF_TOKEN || '') : ''
  return {
    ...headers,
    'X-App-Name': detectAppNameFromPath(),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
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
  const traceSummary = summarizeEndpointTrace(response.__endpointTrace || [])

  if (!contentType.includes('application/json')) {
    const responseText = await response.text()
    const maybeHtml = responseText.trim().startsWith('<')
    const preview = responseText.replace(/\s+/g, ' ').trim().slice(0, 220)
    throw new Error(
      maybeHtml
        ? `Backend returned HTML instead of JSON (status ${response.status}). Verify VITE_API_BASE_URL points to your backend API and uses HTTPS when the site is served over HTTPS.${traceSummary ? ` Endpoint attempts: ${traceSummary}.` : ''} Response preview: ${preview}`
        : `Backend returned non-JSON response (status ${response.status}).${traceSummary ? ` Endpoint attempts: ${traceSummary}.` : ''} Response preview: ${preview}`
    )
  }

  return response.json()
}

function normalizeFileMessageSourcesForTransport(payload) {
  return {
    ...payload,
    messages: (payload.messages || []).map((message) => {
      if (message.type !== 'input_file') {
        return message
      }
      return {
        ...message,
        source: FILE_SOURCE_TRANSPORT_ALIASES[message.source] || message.source
      }
    })
  }
}

async function postMultipart(endpoint, payload, fileEntries = {}) {
  const formData = new FormData()
  formData.append('request', JSON.stringify(normalizeFileMessageSourcesForTransport(payload)))

  Object.entries(fileEntries).forEach(([fieldName, file]) => {
    if (file) {
      formData.append(FILE_SOURCE_TRANSPORT_ALIASES[fieldName] || fieldName, file)
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
  const defaultGettingStartedItems = [
    { subsection: 'A-Ideation Overview', question: 'What is the A-Ideation Professional Productivity toolset?', answer: '' },
    { subsection: 'A-Ideation Overview', question: 'What are the benefits of using a browser-based AI agent?', answer: '' },
    { subsection: 'A-Ideation Overview', question: 'How do I get started with A-Ideation?', answer: '' },
    { subsection: 'A-Ideation Overview', question: 'Who should use A-Ideation?', answer: '' },
    { subsection: 'A-Ideation Overview', question: 'What types of files can I use?', answer: '' },
    { subsection: 'A-Ideation Overview', question: 'How is data handled in A-Ideation?', answer: '' },
    { subsection: 'A-Ideation Overview', question: 'What output can I expect from A-Ideation tools?', answer: '' },
    { subsection: 'Applications', question: 'What is Document Doctor?', answer: '' },
    { subsection: 'Applications', question: 'What is Deck Mate?', answer: '' },
    { subsection: 'Applications', question: 'What is Doc2Deck?', answer: '' },
    { subsection: 'Applications', question: 'What is Zoom-Zilla?', answer: '' }
  ]
  const dedicatedViewByShell = {
    dd: APP_VIEWS.DOCUMENT_DOCTOR,
    dm: APP_VIEWS.DECK_MATE,
    d2d: APP_VIEWS.DOC2DECK,
    zz: APP_VIEWS.ZOOM_ZILLA,
    rn: APP_VIEWS.RESUNATOR
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
  const [authFirstName, setAuthFirstName] = useState('')
  const [authLastName, setAuthLastName] = useState('')
  const [authPhoneNumber, setAuthPhoneNumber] = useState('')
  const [authJobTitle, setAuthJobTitle] = useState('')
  const [contactSubmittedForEmail, setContactSubmittedForEmail] = useState('')
  const [accessEmailInput, setAccessEmailInput] = useState('')
  const [accessCaptureEmailInput, setAccessCaptureEmailInput] = useState('')
  const [showAccessCaptureModal, setShowAccessCaptureModal] = useState(false)
  const [accessFlowMode, setAccessFlowMode] = useState('entry')
  const [accessFlowMessage, setAccessFlowMessage] = useState('')
  const [authEmailLocked, setAuthEmailLocked] = useState(false)
  const [authAccountType, setAuthAccountType] = useState('trial')
  const [authInfo, setAuthInfo] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [registrationReadyForVerify, setRegistrationReadyForVerify] = useState(false)
  const [authOverlayOpen, setAuthOverlayOpen] = useState(!isSuiteShell)
  const [showAuthRequiredNotice, setShowAuthRequiredNotice] = useState(false)
  const [showTrialExpiredNotice, setShowTrialExpiredNotice] = useState(false)
  const [verifyToken, setVerifyToken] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [activeView, setActiveView] = useState(homeView)
  const [activeGettingStartedQuestion, setActiveGettingStartedQuestion] = useState('')
  const [gettingStartedItems, setGettingStartedItems] = useState(defaultGettingStartedItems)
  const [adminGettingStartedDraft, setAdminGettingStartedDraft] = useState(defaultGettingStartedItems)
  const [expandedGettingStartedSections, setExpandedGettingStartedSections] = useState({})
  const groupedGettingStartedItems = useMemo(() => {
    const grouped = new Map()
    gettingStartedItems.forEach((item) => {
      const subsection = `${item?.subsection || 'Applications'}`.trim() || 'Applications'
      if (!grouped.has(subsection)) grouped.set(subsection, [])
      grouped.get(subsection).push(item)
    })
    return Array.from(grouped.entries()).map(([subsection, items]) => ({ subsection, items }))
  }, [gettingStartedItems])
  const [pendingContacts, setPendingContacts] = useState([])
  const [approvedContacts, setApprovedContacts] = useState([])
  const [activeUsers, setActiveUsers] = useState([])
  const [inactiveUsers, setInactiveUsers] = useState([])
  const [pendingContactsLoading, setPendingContactsLoading] = useState(false)
  const [adminResultModal, setAdminResultModal] = useState({ open: false, message: '' })
  const [adminApproveModal, setAdminApproveModal] = useState({ open: false, contactId: null, durationDays: 30, registrationType: 'trial' })
  const [adminTab, setAdminTab] = useState('manage_registration')
  const [createContactDraft, setCreateContactDraft] = useState({ firstName: '', lastName: '', phoneNumber: '', email: '', jobTitle: '' })
  const [sessionCleanupDate, setSessionCleanupDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [adminUserEditModal, setAdminUserEditModal] = useState({ open: false, user: null })
  const [zoomTileLogoFailed, setZoomTileLogoFailed] = useState(false)
  const [resunatorTileLogoFailed, setResunatorTileLogoFailed] = useState(false)
  const isDeckMateWorkflow = activeView === APP_VIEWS.DECK_MATE
  const isDoc2DeckWorkflow = activeView === APP_VIEWS.DOC2DECK
  const isResunatorWorkflow = activeView === APP_VIEWS.RESUNATOR
  const activeSettings = isDeckMateWorkflow
    ? DECK_MATE_SETTINGS
    : isDoc2DeckWorkflow
      ? DOC2DECK_SETTINGS
      : isResunatorWorkflow
        ? RESUNATOR_SETTINGS
        : APP_SETTINGS
  const contentNoun = isDeckMateWorkflow ? 'presentation' : isResunatorWorkflow ? 'resume' : 'document'
  const contentNounPlural = isDeckMateWorkflow ? 'presentations' : isResunatorWorkflow ? 'resumes' : 'documents'
  const contentNounTitle = isDeckMateWorkflow ? 'Presentation' : isResunatorWorkflow ? 'Resume' : 'Document'
  const [currentMode, setCurrentMode] = useState(MODES.DOC_DEFINE)
  const [docFile, setDocFile] = useState(null)
  const [resunatorResumeEntries, setResunatorResumeEntries] = useState([{ file: null, description: '' }])
  const [selectedResunatorContextResumeSources, setSelectedResunatorContextResumeSources] = useState([])
  const [supportingFile, setSupportingFile] = useState(null)
  const [jobReqFile, setJobReqFile] = useState(null)
  const [jobReqInputMode, setJobReqInputMode] = useState('file')
  const [jobReqUrl, setJobReqUrl] = useState('')
  const [jobReqUrlStatus, setJobReqUrlStatus] = useState('')
  const [jobReqUrlJson, setJobReqUrlJson] = useState(null)
  const [acceptedJobReqJson, setAcceptedJobReqJson] = useState(null)
  const [jobReqText, setJobReqText] = useState('')
  const [isFetchingJobReqUrl, setIsFetchingJobReqUrl] = useState(false)
  const [priorResponseFile, setPriorResponseFile] = useState(null)
  const [selectedApiMode, setSelectedApiMode] = useState(APP_SETTINGS.defaultApiMode || 'responses')
  const [selectedModel, setSelectedModel] = useState(APP_SETTINGS.defaultModel)
  const [critiqueResponseFormat, setCritiqueResponseFormat] = useState(APP_SETTINGS.defaultCritiqueResponseFormat || 'json')
  const [critiqueSeverityFilter, setCritiqueSeverityFilter] = useState('all')
  const [critiqueCategoryFilter, setCritiqueCategoryFilter] = useState('all')
  const [docxToJson, setDocxToJson] = useState(APP_SETTINGS.defaultDocxToJson ?? true)
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
  const [doc2DeckChunkingEnabled, setDoc2DeckChunkingEnabled] = useState(
    DOC2DECK_SETTINGS.chunkingEnabledDefault ?? false
  )
  const [doc2DeckChunkSize, setDoc2DeckChunkSize] = useState(
    DOC2DECK_SETTINGS.chunkSizeDefault ?? 6
  )
  const [doc2DeckChunkConcurrency, setDoc2DeckChunkConcurrency] = useState(
    DOC2DECK_SETTINGS.chunkConcurrencyDefault ?? 2
  )
  const [deckTotalSlidesSetting, setDeckTotalSlidesSetting] = useState(0)
  const [deckTotalSlidesInput, setDeckTotalSlidesInput] = useState(0)
  const [slidesToReviewInput, setSlidesToReviewInput] = useState('')
  const [isCalculatingSlides, setIsCalculatingSlides] = useState(false)
  const [deckCachedPrimaryFileId, setDeckCachedPrimaryFileId] = useState('')
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const [promptPreviewText, setPromptPreviewText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deckSettingsTab, setDeckSettingsTab] = useState('prompt_instructions')
  const settingsDropdownRef = useRef(null)
  const profileSaveTimerRef = useRef(null)
  const activeSubmissionIdRef = useRef(null)
  const deckFileExpiryTimerRef = useRef(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [docTopic, setDocTopic] = useState(APP_SETTINGS.defaults.topic)
  const [docObjective, setDocObjective] = useState(APP_SETTINGS.defaults.reviewObjective)
  const [docGuidance, setDocGuidance] = useState(APP_SETTINGS.defaults.formattingGuidance)
  const [docAntiGuidance, setDocAntiGuidance] = useState(APP_SETTINGS.defaults.antiGuidance)
  const [docApplyChangeItemsGuidance, setDocApplyChangeItemsGuidance] = useState(
    APP_SETTINGS.defaults.applyChangeItemsGuidance || ''
  )
  const [docChangeItemInstruction, setDocChangeItemInstruction] = useState(
    APP_SETTINGS.defaults.changeItemInstruction || 'create item as stated'
  )
  const [deckTopic, setDeckTopic] = useState(DECK_MATE_SETTINGS.defaults.topic)
  const [deckObjective, setDeckObjective] = useState(DECK_MATE_SETTINGS.defaults.reviewObjective)
  const [deckGuidance, setDeckGuidance] = useState(DECK_MATE_SETTINGS.defaults.formattingGuidance)
  const [deckAntiGuidance, setDeckAntiGuidance] = useState(DECK_MATE_SETTINGS.defaults.antiGuidance)
  const [deckApplyChangeItemsGuidance, setDeckApplyChangeItemsGuidance] = useState(
    DECK_MATE_SETTINGS.defaults.applyChangeItemsGuidance || ''
  )
  const [deckChangeItemInstruction, setDeckChangeItemInstruction] = useState(
    DECK_MATE_SETTINGS.defaults.changeItemInstruction || 'create item as stated'
  )
  const [doc2DeckTopic, setDoc2DeckTopic] = useState(DOC2DECK_SETTINGS.defaults.topic)
  const [doc2DeckObjective, setDoc2DeckObjective] = useState(DOC2DECK_SETTINGS.defaults.reviewObjective)
  const [doc2DeckGuidance, setDoc2DeckGuidance] = useState(DOC2DECK_SETTINGS.defaults.formattingGuidance)
  const [doc2DeckAntiGuidance, setDoc2DeckAntiGuidance] = useState(DOC2DECK_SETTINGS.defaults.antiGuidance)
  const [doc2DeckApplyChangeItemsGuidance, setDoc2DeckApplyChangeItemsGuidance] = useState(
    DOC2DECK_SETTINGS.defaults.applyChangeItemsGuidance || ''
  )
  const [doc2DeckApplyChangesFormattingGuidance, setDoc2DeckApplyChangesFormattingGuidance] = useState(
    DOC2DECK_SETTINGS.defaults.applyChangesFormattingGuidance || ''
  )
  const [doc2DeckApplyChangesAntiGuidance, setDoc2DeckApplyChangesAntiGuidance] = useState(
    DOC2DECK_SETTINGS.defaults.applyChangesAntiGuidance || ''
  )
  const [doc2DeckPptxOutputMode, setDoc2DeckPptxOutputMode] = useState(
    DOC2DECK_SETTINGS.defaults.pptxOutputMode ?? false
  )
  const [doc2DeckChangeItemInstruction, setDoc2DeckChangeItemInstruction] = useState(
    DOC2DECK_SETTINGS.defaults.changeItemInstruction || 'create item as stated'
  )
  const [docSupportInstructions, setDocSupportInstructions] = useState(defaults.supportInstructions)
  const [docPriorInstructions, setDocPriorInstructions] = useState(defaults.priorInstructions)
  const [deckSupportInstructions, setDeckSupportInstructions] = useState(defaults.supportInstructions)
  const [deckPriorInstructions, setDeckPriorInstructions] = useState(defaults.priorInstructions)
  const [doc2DeckSupportInstructions, setDoc2DeckSupportInstructions] = useState(defaults.supportInstructions)
  const [doc2DeckPriorInstructions, setDoc2DeckPriorInstructions] = useState(defaults.priorInstructions)
  const [resunatorTopic, setResunatorTopic] = useState(RESUNATOR_SETTINGS.defaults.topic)
  const [resunatorObjective, setResunatorObjective] = useState(RESUNATOR_SETTINGS.defaults.reviewObjective)
  const [resunatorGuidance, setResunatorGuidance] = useState(RESUNATOR_SETTINGS.defaults.formattingGuidance)
  const [resunatorAntiGuidance, setResunatorAntiGuidance] = useState(RESUNATOR_SETTINGS.defaults.antiGuidance)
  const [resunatorApplyChangeItemsGuidance, setResunatorApplyChangeItemsGuidance] = useState(
    RESUNATOR_SETTINGS.defaults.applyChangeItemsGuidance || ''
  )
  const [resunatorChangeItemInstruction, setResunatorChangeItemInstruction] = useState(
    RESUNATOR_SETTINGS.defaults.changeItemInstruction || 'create item as stated'
  )
  const [resunatorSupportInstructions, setResunatorSupportInstructions] = useState(defaults.supportInstructions)
  const [resunatorPriorInstructions, setResunatorPriorInstructions] = useState(defaults.priorInstructions)
  const topic = isDeckMateWorkflow ? deckTopic : isDoc2DeckWorkflow ? doc2DeckTopic : isResunatorWorkflow ? resunatorTopic : docTopic
  const objective = isDeckMateWorkflow ? deckObjective : isDoc2DeckWorkflow ? doc2DeckObjective : isResunatorWorkflow ? resunatorObjective : docObjective
  const guidance = isDeckMateWorkflow ? deckGuidance : isDoc2DeckWorkflow ? doc2DeckGuidance : isResunatorWorkflow ? resunatorGuidance : docGuidance
  const antiGuidance = isDeckMateWorkflow ? deckAntiGuidance : isDoc2DeckWorkflow ? doc2DeckAntiGuidance : isResunatorWorkflow ? resunatorAntiGuidance : docAntiGuidance
  const supportInstructions = isDeckMateWorkflow
    ? deckSupportInstructions
    : isDoc2DeckWorkflow
      ? doc2DeckSupportInstructions
      : isResunatorWorkflow
        ? resunatorSupportInstructions
        : docSupportInstructions
  const priorInstructions = isDeckMateWorkflow
    ? deckPriorInstructions
    : isDoc2DeckWorkflow
      ? doc2DeckPriorInstructions
      : isResunatorWorkflow
        ? resunatorPriorInstructions
        : docPriorInstructions
  const applyChangeItemsGuidance = isDeckMateWorkflow
    ? deckApplyChangeItemsGuidance
    : isDoc2DeckWorkflow
      ? doc2DeckApplyChangeItemsGuidance
      : isResunatorWorkflow
        ? resunatorApplyChangeItemsGuidance
        : docApplyChangeItemsGuidance
  const applyChangesAntiGuidance = isDoc2DeckWorkflow
    ? doc2DeckApplyChangesAntiGuidance
    : antiGuidance
  const activeChunkingEnabled = isDoc2DeckWorkflow ? doc2DeckChunkingEnabled : chunkingEnabled
  const activeChunkSize = isDoc2DeckWorkflow ? doc2DeckChunkSize : chunkSize
  const activeChunkConcurrency = isDoc2DeckWorkflow ? doc2DeckChunkConcurrency : chunkConcurrency
  const changeItemInstruction = isDeckMateWorkflow
    ? deckChangeItemInstruction
    : isDoc2DeckWorkflow
      ? doc2DeckChangeItemInstruction
      : isResunatorWorkflow
        ? resunatorChangeItemInstruction
        : docChangeItemInstruction
  const [critiqueMarkdown, setCritiqueMarkdown] = useState('')
  const [changedDocumentMarkdown, setChangedDocumentMarkdown] = useState('')
  const [resunatorRefinementInstruction, setResunatorRefinementInstruction] = useState('')
  const [critiqueOutputFileName, setCritiqueOutputFileName] = useState('critique.md')
  const [changedOutputFileName, setChangedOutputFileName] = useState('changes.md')
  const [status, setStatus] = useState(`Ready for ${contentNoun} definition.`)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastOperation, setLastOperation] = useState(null)
  const [changeItems, setChangeItems] = useState([])
  const [changeItemDraft, setChangeItemDraft] = useState(
    emptyChangeDraft(APP_SETTINGS.defaults.changeItemInstruction || 'create item as stated')
  )
  const [requestLogLines, setRequestLogLines] = useState([])
  const [lastCritiqueWaitMs, setLastCritiqueWaitMs] = useState(null)
  const [selectedDeckSlideTab, setSelectedDeckSlideTab] = useState('all')
  const [selectedChangedDeckSlideTab, setSelectedChangedDeckSlideTab] = useState('all')
  const [selectedDeckIssueOptions, setSelectedDeckIssueOptions] = useState([])
  const [selectedDoc2DeckSlideTab, setSelectedDoc2DeckSlideTab] = useState('all')
  const [selectedChangedDoc2DeckSlideTab, setSelectedChangedDoc2DeckSlideTab] = useState('all')
  const [selectedDoc2DeckSlides, setSelectedDoc2DeckSlides] = useState([])
  const [selectedDocIssueOptions, setSelectedDocIssueOptions] = useState([])
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
  const doc2DeckCritiqueSections = useMemo(
    () => (isDoc2DeckWorkflow ? parseDeckMarkdownSections(critiqueMarkdown) : []),
    [isDoc2DeckWorkflow, critiqueMarkdown]
  )
  const changedDoc2DeckJsonParse = useMemo(
    () => (isDoc2DeckWorkflow ? parseDoc2DeckPptxJsonWithMeta(changedDocumentMarkdown) : { parsed: null, usedFallback: false }),
    [isDoc2DeckWorkflow, changedDocumentMarkdown]
  )
  const changedDoc2DeckJsonSections = useMemo(
    () => (isDoc2DeckWorkflow ? parseDoc2DeckPptxJsonSections(changedDocumentMarkdown) : []),
    [isDoc2DeckWorkflow, changedDocumentMarkdown]
  )
  const changedDoc2DeckSections = useMemo(
    () => {
      if (!isDoc2DeckWorkflow) {
        return []
      }
      if (changedDoc2DeckJsonSections.length) {
        return changedDoc2DeckJsonSections
      }
      return parseDeckMarkdownSections(changedDocumentMarkdown)
    },
    [isDoc2DeckWorkflow, changedDocumentMarkdown, changedDoc2DeckJsonSections]
  )
  const changedDoc2DeckDisplayText = useMemo(() => {
    if (!isDoc2DeckWorkflow || !changedDoc2DeckSections.length) {
      return changedDocumentMarkdown
    }
    if (!changedDoc2DeckJsonSections.length && !doc2DeckPptxOutputMode) {
      return changedDocumentMarkdown
    }
    return changedDoc2DeckSections.map((section) => section.content).join('\n\n')
  }, [isDoc2DeckWorkflow, doc2DeckPptxOutputMode, changedDoc2DeckSections, changedDoc2DeckJsonSections, changedDocumentMarkdown])
  const parsedCritiqueJson = useMemo(() => {
    if (critiqueResponseFormat !== 'json') return null
    try {
      return validateCritiqueJsonOutput(critiqueMarkdown)
    } catch (_error) {
      return null
    }
  }, [critiqueResponseFormat, critiqueMarkdown])
  function extractIssueCardinality(issueId) {
    const match = `${issueId || ''}`.match(/(\d+)(?!.*\d)/)
    return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY
  }

  const orderedCritiqueIssues = useMemo(() => {
    if (!parsedCritiqueJson) return []
    const combined = [
      ...(parsedCritiqueJson.major_issues || []).map((item) => ({ ...item, _severityRank: 0 })),
      ...(parsedCritiqueJson.minor_issues || []).map((item) => ({ ...item, _severityRank: 1 }))
    ]
    return [...combined].sort((left, right) => {
      return (left._severityRank - right._severityRank) || extractIssueCardinality(left.id) - extractIssueCardinality(right.id) || `${left.id}`.localeCompare(`${right.id}`)
    })
  }, [parsedCritiqueJson])

  const critiqueCategoryOptions = useMemo(() => {
    return orderedCritiqueIssues.map((item) => ({ value: item.id, label: `${item.id} · ${item.category}` }))
  }, [orderedCritiqueIssues])

  const visibleCritiqueIssues = useMemo(() => {
    return orderedCritiqueIssues.filter((item) => (
      (critiqueSeverityFilter === 'all' || item.severity === critiqueSeverityFilter) &&
      (critiqueCategoryFilter === 'all' || item.id === critiqueCategoryFilter)
    ))
  }, [orderedCritiqueIssues, critiqueSeverityFilter, critiqueCategoryFilter])



  const nonActivatedApprovedUsers = useMemo(() => {
    const registeredEmails = new Set([
      ...activeUsers.map((user) => `${user?.email || ''}`.trim().toLowerCase()),
      ...inactiveUsers.map((user) => `${user?.email || ''}`.trim().toLowerCase())
    ].filter(Boolean))

    return approvedContacts
      .filter((contact) => !registeredEmails.has(`${contact?.email || ''}`.trim().toLowerCase()))
      .map((contact) => {
        const approvedAtRaw = `${contact?.updated_at || contact?.created_at || ''}`.trim()
        const approvedAt = approvedAtRaw ? new Date(approvedAtRaw) : null
        const daysSinceApproval = approvedAt && !Number.isNaN(approvedAt.getTime())
          ? Math.max(0, Math.floor((Date.now() - approvedAt.getTime()) / (1000 * 60 * 60 * 24)))
          : null
        return { ...contact, daysSinceApproval }
      })
  }, [approvedContacts, activeUsers, inactiveUsers])

  useEffect(() => {
    if (!isDoc2DeckWorkflow || !changedDoc2DeckJsonParse.usedFallback) {
      return
    }
    setError('Warning: Doc2Deck JSON fallback parsing was used. Some chunk content may not be fully processed.')
  }, [isDoc2DeckWorkflow, changedDoc2DeckJsonParse.usedFallback])

  function extractFirstDeleteLogFileId(response) {
    const firstId = response?.deleteLogs?.fileIds?.[0]
    if (typeof firstId === 'string' && firstId.startsWith('file-')) {
      return firstId
    }

    const firstPhpId = response?.deleteLogs?.files?.[0]?.fileId
    if (typeof firstPhpId === 'string' && firstPhpId.startsWith('file-')) {
      return firstPhpId
    }

    return ''
  }

  function clearDeckFileExpiryTimer() {
    if (deckFileExpiryTimerRef.current) {
      window.clearTimeout(deckFileExpiryTimerRef.current)
      deckFileExpiryTimerRef.current = null
    }
  }

  function scheduleDeckFileExpiryCleanup() {
    clearDeckFileExpiryTimer()
    deckFileExpiryTimerRef.current = window.setTimeout(() => {
      cleanupDeckCachedPrimaryFile('Deck file cache expired after 10 minutes.')
    }, 10 * 60 * 1000)
  }

  async function cleanupDeckCachedPrimaryFile(reason = 'Deck file cleanup requested.') {
    clearDeckFileExpiryTimer()
    if (!deckCachedPrimaryFileId) {
      return
    }

    const cachedId = deckCachedPrimaryFileId
    setDeckCachedPrimaryFileId('')
    try {
      appendRequestLog('Deleting cached Deck Mate file id.', { reason, fileId: cachedId })
      await postMultipart(API_ENDPOINTS[OPERATIONS.CRITIQUE_PRIMARY], {
        apiMode: 'responses',
        model: 'gpt-5.4-nano',
        store: false,
        deleteFileOnLlm: true,
        systemPrompt: 'You are a highly skilled assistant to an experienced professional in the field indicated.',
        messages: [
          { type: 'input_text', text: 'Acknowledge file deletion request.' },
          { type: 'input_file', source: cachedId }
        ]
      }, {})
    } catch (cleanupError) {
      appendRequestLog('Cached Deck Mate file deletion failed.', { reason, error: normalizeRequestError(cleanupError), fileId: cachedId })
    }
  }

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
    if (isDoc2DeckWorkflow) {
      setDoc2DeckTopic(value)
      return
    }
    if (isResunatorWorkflow) {
      setResunatorTopic(value)
      return
    }
    setDocTopic(value)
  }

  function setObjectiveForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckObjective(value)
      return
    }
    if (isDoc2DeckWorkflow) {
      setDoc2DeckObjective(value)
      return
    }
    if (isResunatorWorkflow) {
      setResunatorObjective(value)
      return
    }
    setDocObjective(value)
  }

  function setGuidanceForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckGuidance(value)
      return
    }
    if (isDoc2DeckWorkflow) {
      setDoc2DeckGuidance(value)
      return
    }
    if (isResunatorWorkflow) {
      setResunatorGuidance(value)
      return
    }
    setDocGuidance(value)
  }

  function setAntiGuidanceForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckAntiGuidance(value)
      return
    }
    if (isDoc2DeckWorkflow) {
      setDoc2DeckAntiGuidance(value)
      return
    }
    if (isResunatorWorkflow) {
      setResunatorAntiGuidance(value)
      return
    }
    setDocAntiGuidance(value)
  }

  function setSupportInstructionsForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckSupportInstructions(value)
      return
    }
    if (isDoc2DeckWorkflow) {
      setDoc2DeckSupportInstructions(value)
      return
    }
    if (isResunatorWorkflow) {
      setResunatorSupportInstructions(value)
      return
    }
    setDocSupportInstructions(value)
  }

  function setPriorInstructionsForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckPriorInstructions(value)
      return
    }
    if (isDoc2DeckWorkflow) {
      setDoc2DeckPriorInstructions(value)
      return
    }
    if (isResunatorWorkflow) {
      setResunatorPriorInstructions(value)
      return
    }
    setDocPriorInstructions(value)
  }

  function setApplyChangeItemsGuidanceForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckApplyChangeItemsGuidance(value)
      return
    }
    if (isDoc2DeckWorkflow) {
      setDoc2DeckApplyChangeItemsGuidance(value)
      return
    }
    if (isResunatorWorkflow) {
      setResunatorApplyChangeItemsGuidance(value)
      return
    }
    setDocApplyChangeItemsGuidance(value)
  }

  function setChangeItemInstructionForActive(value) {
    if (isDeckMateWorkflow) {
      setDeckChangeItemInstruction(value)
      return
    }
    if (isDoc2DeckWorkflow) {
      setDoc2DeckChangeItemInstruction(value)
      return
    }
    if (isResunatorWorkflow) {
      setResunatorChangeItemInstruction(value)
      return
    }
    setDocChangeItemInstruction(value)
  }

  function setChunkingEnabledForActive(value) {
    if (isDoc2DeckWorkflow) {
      setDoc2DeckChunkingEnabled(value)
      return
    }
    setChunkingEnabled(value)
  }

  function setChunkSizeForActive(value) {
    if (isDoc2DeckWorkflow) {
      setDoc2DeckChunkSize(clampPositiveInteger(value, DOC2DECK_SETTINGS.chunkSizeDefault ?? 6))
      return
    }
    setChunkSize(clampPositiveInteger(value, APP_SETTINGS.chunkSizeDefault ?? 6))
  }

  function setChunkConcurrencyForActive(value) {
    if (isDoc2DeckWorkflow) {
      setDoc2DeckChunkConcurrency(clampPositiveInteger(value, DOC2DECK_SETTINGS.chunkConcurrencyDefault ?? 2))
      return
    }
    setChunkConcurrency(clampPositiveInteger(value, APP_SETTINGS.chunkConcurrencyDefault ?? 2))
  }

  function applyUserProfileSettings(settings = {}) {
    setSelectedApiMode(settings.apiMode || APP_SETTINGS.defaultApiMode || 'responses')
    setSelectedModel(settings.model || APP_SETTINGS.defaultModel)
    setCritiqueResponseFormat(settings.critiqueResponseFormat || APP_SETTINGS.defaultCritiqueResponseFormat || 'json')
    setDocxToJson(settings.docxToJson ?? (APP_SETTINGS.defaultDocxToJson ?? true))
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
    const doc2DeckProfile = settings.doc2deck || {}
    setDocTopic(docProfile.topic || APP_SETTINGS.defaults.topic)
    setDocObjective(docProfile.objective || APP_SETTINGS.defaults.reviewObjective)
    setDocGuidance(docProfile.guidance || APP_SETTINGS.defaults.formattingGuidance)
    setDocAntiGuidance(docProfile.antiGuidance || APP_SETTINGS.defaults.antiGuidance)
    setDocApplyChangeItemsGuidance(docProfile.applyChangeItemsGuidance || '')
    setDocChangeItemInstruction(docProfile.changeItemInstruction || APP_SETTINGS.defaults.changeItemInstruction || 'create item as stated')
    setDocSupportInstructions(docProfile.supportInstructions || defaults.supportInstructions)
    setDocPriorInstructions(docProfile.priorInstructions || defaults.priorInstructions)

    setDeckTopic(deckProfile.topic || DECK_MATE_SETTINGS.defaults.topic)
    setDeckObjective(deckProfile.objective || DECK_MATE_SETTINGS.defaults.reviewObjective)
    setDeckGuidance(deckProfile.guidance || DECK_MATE_SETTINGS.defaults.formattingGuidance)
    setDeckAntiGuidance(deckProfile.antiGuidance || DECK_MATE_SETTINGS.defaults.antiGuidance)
    setDeckApplyChangeItemsGuidance(deckProfile.applyChangeItemsGuidance || DECK_MATE_SETTINGS.defaults.applyChangeItemsGuidance || '')
    setDeckChangeItemInstruction(deckProfile.changeItemInstruction || DECK_MATE_SETTINGS.defaults.changeItemInstruction || 'create item as stated')
    setDeckSupportInstructions(deckProfile.supportInstructions || defaults.supportInstructions)
    setDeckPriorInstructions(deckProfile.priorInstructions || defaults.priorInstructions)

    setDoc2DeckTopic(doc2DeckProfile.topic || DOC2DECK_SETTINGS.defaults.topic)
    setDoc2DeckObjective(doc2DeckProfile.objective || DOC2DECK_SETTINGS.defaults.reviewObjective)
    setDoc2DeckGuidance(doc2DeckProfile.guidance || DOC2DECK_SETTINGS.defaults.formattingGuidance)
    setDoc2DeckAntiGuidance(doc2DeckProfile.antiGuidance || DOC2DECK_SETTINGS.defaults.antiGuidance)
    setDoc2DeckApplyChangeItemsGuidance(doc2DeckProfile.applyChangeItemsGuidance || DOC2DECK_SETTINGS.defaults.applyChangeItemsGuidance || '')
    setDoc2DeckApplyChangesFormattingGuidance(doc2DeckProfile.applyChangesFormattingGuidance || DOC2DECK_SETTINGS.defaults.applyChangesFormattingGuidance || '')
    setDoc2DeckApplyChangesAntiGuidance(doc2DeckProfile.applyChangesAntiGuidance || DOC2DECK_SETTINGS.defaults.applyChangesAntiGuidance || '')
    const legacyDoc2DeckChunkingEnabled = settings.chunkingEnabled
    const legacyDoc2DeckChunkSize = settings.chunkSize
    const legacyDoc2DeckChunkConcurrency = settings.chunkConcurrency
    setDoc2DeckPptxOutputMode(doc2DeckProfile.pptxOutputMode ?? (DOC2DECK_SETTINGS.defaults.pptxOutputMode ?? false))
    setDoc2DeckChunkingEnabled(
      doc2DeckProfile.chunkingEnabled ??
        legacyDoc2DeckChunkingEnabled ??
        (DOC2DECK_SETTINGS.chunkingEnabledDefault ?? false)
    )
    setDoc2DeckChunkSize(
      clampPositiveInteger(
        doc2DeckProfile.chunkSize ?? legacyDoc2DeckChunkSize,
        DOC2DECK_SETTINGS.chunkSizeDefault ?? 6
      )
    )
    setDoc2DeckChunkConcurrency(
      clampPositiveInteger(
        doc2DeckProfile.chunkConcurrency ?? legacyDoc2DeckChunkConcurrency,
        DOC2DECK_SETTINGS.chunkConcurrencyDefault ?? 2
      )
    )
    setDoc2DeckChangeItemInstruction(doc2DeckProfile.changeItemInstruction || DOC2DECK_SETTINGS.defaults.changeItemInstruction || 'create item as stated')
    setDoc2DeckSupportInstructions(doc2DeckProfile.supportInstructions || defaults.supportInstructions)
    setDoc2DeckPriorInstructions(doc2DeckProfile.priorInstructions || defaults.priorInstructions)


    const resunatorProfile = settings.resunator || {}
    setResunatorTopic(resunatorProfile.topic || RESUNATOR_SETTINGS.defaults.topic)
    setResunatorObjective(resunatorProfile.objective || RESUNATOR_SETTINGS.defaults.reviewObjective)
    setResunatorGuidance(resunatorProfile.guidance || RESUNATOR_SETTINGS.defaults.formattingGuidance)
    setResunatorAntiGuidance(resunatorProfile.antiGuidance || RESUNATOR_SETTINGS.defaults.antiGuidance)
    setResunatorApplyChangeItemsGuidance(resunatorProfile.applyChangeItemsGuidance || RESUNATOR_SETTINGS.defaults.applyChangeItemsGuidance || '')
    setResunatorChangeItemInstruction(resunatorProfile.changeItemInstruction || RESUNATOR_SETTINGS.defaults.changeItemInstruction || 'create item as stated')
    setResunatorSupportInstructions(resunatorProfile.supportInstructions || defaults.supportInstructions)
    setResunatorPriorInstructions(resunatorProfile.priorInstructions || defaults.priorInstructions)
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
      if (typeof window !== 'undefined') {
        window.__AIDEATION_CSRF_TOKEN = data.csrfToken || ''
      }
      if (data.authenticated && data.user) {
        setAuthUser(data.user)
        await loadUserProfileSettings()
      } else {
        setAuthUser(null)
        setProfileLoaded(false)
        if (data.trialExpired) {
          setShowTrialExpiredNotice(true)
        }
      }
    } catch (sessionError) {
      setAuthUser(null)
      setProfileLoaded(false)
      setAuthInfo(`Session check failed: ${normalizeRequestError(sessionError)}`)
    } finally {
      setAuthLoading(false)
    }
  }

  function clearAuthPanelMessages() {
    setError('')
    setAuthInfo('')
    setRegistrationReadyForVerify(false)
  }

  function openAuthOverlay(mode = 'login') {
    clearAuthPanelMessages()
    setAuthMode(mode)
    setAuthOverlayOpen(true)
  }

  function closeAuthOverlay() {
    clearAuthPanelMessages()
    setAuthOverlayOpen(false)
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
        if (typeof window !== 'undefined') window.__AIDEATION_CSRF_TOKEN = response.csrfToken || window.__AIDEATION_CSRF_TOKEN || ''
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
        if (typeof window !== 'undefined') window.__AIDEATION_CSRF_TOKEN = response.csrfToken || window.__AIDEATION_CSRF_TOKEN || ''
        setAuthUser(response.user || null)
        setAuthInfo('')
        setAuthOverlayOpen(false)
        setShowAuthRequiredNotice(false)
        await loadUserProfileSettings()
      }
    } catch (authError) {
      const message = normalizeRequestError(authError)
      if (message.toLowerCase().includes('trial period has ended')) {
        setShowTrialExpiredNotice(true)
      } else {
        setError(message)
      }
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleContactRequestSubmit(event) {
    event.preventDefault()
    setError('')
    setAuthInfo('')
    try {
      await postJson(AUTH_ENDPOINTS.CONTACT_REQUEST, {
        firstName: authFirstName,
        lastName: authLastName,
        phoneNumber: authPhoneNumber,
        email: authEmail,
        jobTitle: authJobTitle
      })
      setContactSubmittedForEmail(authEmail.trim().toLowerCase())
      setAuthInfo('')
    } catch (contactError) {
      setError(normalizeRequestError(contactError))
      setAuthInfo('')
    }
  }

  async function processAccessEmailLookup(rawEmail) {
    setError('')
    setAuthInfo('')
    setAccessFlowMessage('')
    try {
      const enteredEmail = `${rawEmail}`.trim().toLowerCase()
      setAccessEmailInput(enteredEmail)
      const response = await postJson(AUTH_ENDPOINTS.ACCESS_CHECK, { email: enteredEmail })
      const checkedEmail = `${response.email || enteredEmail}`.trim()
      setAuthEmail(checkedEmail)
      if (response.mode === 'pending') {
        const pendingEmail = checkedEmail || `${accessEmailInput}`.trim().toLowerCase()
        setAccessFlowMode('pending')
        setAccessFlowMessage(
          `Your contact information has been received and is being processed. You will be notified at ${pendingEmail} when registration is approved.`
        )
        return
      }
      if (response.mode === 'contact') {
        setAccessFlowMode('contact')
        setAuthEmailLocked(true)
        openAuthOverlay('register')
        return
      }
      if (response.mode === 'register') {
        setAccessFlowMode('register')
        setAuthAccountType((response.accountType || 'trial') === 'subscription' ? 'subscription' : 'trial')
        setAuthEmailLocked(true)
        openAuthOverlay('register')
        return
      }
      setAccessFlowMode('login')
      setAuthEmailLocked(true)
      openAuthOverlay('login')
    } catch (accessError) {
      const normalizedError = normalizeRequestError(accessError)
      const isMissingAccessEndpoint = normalizedError.includes('status 404')
        || normalizedError.toLowerCase().includes('not found')
      if (isMissingAccessEndpoint) {
        setAuthEmail(`${accessEmailInput}`.trim().toLowerCase())
        setAuthEmailLocked(true)
        setAccessFlowMode('login')
        setAuthInfo('Access lookup endpoint is unavailable on this deployment. Please sign in directly.')
        openAuthOverlay('login')
        return
      }
      setError(normalizedError)
    }
  }

  async function handleAccessEmailSubmit(event) {
    event.preventDefault()
    await processAccessEmailLookup(accessEmailInput)
  }

  async function handleAccessCaptureSubmit(event) {
    event.preventDefault()
    setShowAccessCaptureModal(false)
    await processAccessEmailLookup(accessCaptureEmailInput)
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
      await clearApplicationContext('User logout; clearing application context.')
      setAuthUser(null)
      setProfileLoaded(false)
      resetAuthInputs()
      setActiveView(APP_VIEWS.SUITE_HOME)
      setAccessEmailInput('')
      setAuthOverlayOpen(false)
      setShowAuthRequiredNotice(false)
    }
  }

  async function clearApplicationContext(reason = 'Clearing application context.') {
    if (deckCachedPrimaryFileId) {
      await cleanupDeckCachedPrimaryFile(reason)
    }
    setCurrentMode(MODES.DOC_DEFINE)
    setDocFile(null)
    setResunatorResumeEntries([{ file: null, description: '' }])
    setSelectedResunatorContextResumeSources([])
    setSupportingFile(null)
    setJobReqFile(null)
    setJobReqInputMode('file')
    setJobReqUrl('')
    setJobReqUrlStatus('')
    setJobReqUrlJson(null)
    setAcceptedJobReqJson(null)
    setJobReqText('')
    setIsFetchingJobReqUrl(false)
    setPriorResponseFile(null)
    setDeckTotalSlidesInput(0)
    setSlidesToReviewInput('')
    setIsCalculatingSlides(false)
    setShowPromptPanel(false)
    setPromptPreviewText('')
    setSettingsOpen(false)
    setCritiqueMarkdown('')
    setChangedDocumentMarkdown('')
    setCritiqueOutputFileName('critique.md')
    setChangedOutputFileName('changes.md')
    setStatus(`Ready for ${contentNoun} definition.`)
    setError('')
    setLoading(false)
    setLastOperation(null)
    setChangeItems([])
    setChangeItemDraft(emptyChangeDraft(changeItemInstruction.trim() || 'create item as stated'))
    setRequestLogLines([])
    setLastCritiqueWaitMs(null)
    setSelectedDeckSlideTab('all')
    setSelectedChangedDeckSlideTab('all')
    setSelectedDeckIssueOptions([])
    setSelectedDoc2DeckSlideTab('all')
    setSelectedChangedDoc2DeckSlideTab('all')
    setSelectedDoc2DeckSlides([])
  }

  async function handleProtectedNavigation(view) {
    setError('')
    setAuthInfo('')
    try {
      const session = await getJson(AUTH_ENDPOINTS.SESSION)
      if (session.authenticated && session.user) {
        setAuthUser(session.user)
        if (!profileLoaded || !authUser || authUser.id !== session.user.id) {
          await loadUserProfileSettings()
        }
        await clearApplicationContext('Switching applications from A-Ideation home.')
        setActiveView(view)
        return
      }
    } catch (sessionError) {
      setAuthInfo(`Session check failed: ${normalizeRequestError(sessionError)}`)
    }

    const enteredEmail = `${accessEmailInput}`.trim()
    if (!enteredEmail) {
      setAuthUser(null)
      setProfileLoaded(false)
      setShowAccessCaptureModal(true)
      setAccessCaptureEmailInput('')
      return
    }

    setAuthUser(null)
    setProfileLoaded(false)
    await processAccessEmailLookup(enteredEmail)
  }

  async function loadRegistrationContacts() {
    const response = await getJson(AUTH_ENDPOINTS.REGISTRATION_PENDING)
    setPendingContacts(response.items || [])
    setApprovedContacts(response.approvedItems || [])
  }

  async function loadRegistrationUsers() {
    const response = await getJson(AUTH_ENDPOINTS.REGISTRATION_USERS)
    setActiveUsers(response.activeUsers || [])
    setInactiveUsers(response.inactiveUsers || [])
  }

  async function handleOpenRegistrationAdmin() {
    setError('')
    setPendingContactsLoading(true)
    try {
      await loadRegistrationContacts()
      await loadRegistrationUsers()
      await loadGettingStartedItems()
      setActiveView(APP_VIEWS.REGISTRATION_ADMIN)
    } catch (adminError) {
      setError(normalizeRequestError(adminError))
    } finally {
      setPendingContactsLoading(false)
    }
  }

  async function loadGettingStartedItems() {
    const response = await getJson(AUTH_ENDPOINTS.GETTING_STARTED)
    const items = Array.isArray(response.items) ? response.items : []
    const normalized = items
      .map((item, index) => ({
        question: `${item?.question || ''}`.trim(),
        answer: `${item?.answer || ''}`.trim(),
        subsection: `${item?.subsection || ''}`.trim() || (index < 7 ? 'A-Ideation Overview' : 'Applications')
      }))
      .filter((item) => item.question)
    const nextItems = normalized.length ? normalized : defaultGettingStartedItems
    setGettingStartedItems(nextItems)
    setAdminGettingStartedDraft(nextItems)
  }

  async function handleSaveGettingStarted(event) {
    event.preventDefault()
    const normalized = adminGettingStartedDraft
      .map((item) => ({
        question: `${item?.question || ''}`.trim(),
        answer: `${item?.answer || ''}`.trim(),
        subsection: `${item?.subsection || ''}`.trim() || 'Applications'
      }))
      .filter((item) => item.question)

    try {
      const response = await postJson(AUTH_ENDPOINTS.GETTING_STARTED, { items: normalized })
      const savedItems = Array.isArray(response.items) ? response.items : normalized
      setGettingStartedItems(savedItems)
      setAdminGettingStartedDraft(savedItems)
      setAdminResultModal({ open: true, message: response.message || 'Getting Started content saved.' })
    } catch (error) {
      setAdminResultModal({ open: true, message: `Getting Started save failed: ${normalizeRequestError(error)}` })
    }
  }

  function moveGettingStartedItem(index, direction) {
    setAdminGettingStartedDraft((prev) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= prev.length) {
        return prev
      }
      const draft = [...prev]
      const [item] = draft.splice(index, 1)
      draft.splice(nextIndex, 0, item)
      return draft
    })
  }

  async function handleApproveContact(contactId, durationDays, registrationType) {
    setError('')
    setPendingContactsLoading(true)
    try {
      const response = await postJson(AUTH_ENDPOINTS.REGISTRATION_APPROVE, { contactId, durationDays, registrationType })
      setAdminResultModal({ open: true, message: response.message || 'Access request approved successfully.' })
    } catch (approveError) {
      setAdminResultModal({ open: true, message: `Approval failed: ${normalizeRequestError(approveError)}` })
    } finally {
      setPendingContactsLoading(false)
    }
  }

  async function handleCreateContactFromAdmin(event) {
    event.preventDefault()
    try {
      const response = await postJson(AUTH_ENDPOINTS.REGISTRATION_CONTACT_CREATE, createContactDraft)
      setAdminResultModal({ open: true, message: response.message || 'Contact created successfully.' })
      setCreateContactDraft({ firstName: '', lastName: '', phoneNumber: '', email: '', jobTitle: '' })
    } catch (error) {
      setAdminResultModal({ open: true, message: `Create contact failed: ${normalizeRequestError(error)}` })
    }
  }

  async function handleAdminUserUpdate(userRow) {
    try {
      const response = await postJson(AUTH_ENDPOINTS.REGISTRATION_USER_UPDATE, {
        userId: userRow.id,
        accountType: userRow.account_type,
        status: userRow.status,
        trialPeriodDays: userRow.trial_period_days
      })
      setAdminResultModal({ open: true, message: response.message || 'User updated successfully.' })
    } catch (error) {
      setAdminResultModal({ open: true, message: `Update failed: ${normalizeRequestError(error)}` })
    }
  }

  async function handleSessionCleanup(event) {
    event.preventDefault()
    try {
      const response = await postJson(AUTH_ENDPOINTS.REGISTRATION_SESSION_CLEANUP, { asOfDate: sessionCleanupDate })
      setAdminResultModal({ open: true, message: `${response.message || 'Completed.'} Deleted: ${response.deletedCount ?? 0}` })
    } catch (error) {
      setAdminResultModal({ open: true, message: `Session cleanup failed: ${normalizeRequestError(error)}` })
    }
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

  function saveTextToFile(content, desiredFileName, mimeType = 'text/plain;charset=utf-8') {
    const fileName = (desiredFileName || 'output.txt').trim() || 'output.txt'
    const blob = new Blob([content || ''], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function renderResumeMarkdownAsHtml(content) {
    const lines = String(content || '').split(/\r?\n/)
    const html = []
    let listOpen = false
    const closeList = () => {
      if (listOpen) {
        html.push('</ul>')
        listOpen = false
      }
    }

    lines.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        closeList()
        return
      }
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/)
      if (heading) {
        closeList()
        const level = Math.min(heading[1].length + 1, 4)
        html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`)
        return
      }
      const bullet = trimmed.match(/^[-*•]\s+(.+)$/)
      if (bullet) {
        if (!listOpen) {
          html.push('<ul>')
          listOpen = true
        }
        html.push(`<li>${escapeHtml(bullet[1])}</li>`)
        return
      }
      closeList()
      html.push(`<p>${escapeHtml(trimmed)}</p>`)
    })
    closeList()
    return html.join('\n')
  }

  function saveResunatorResumeAsPdf() {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer')
    if (!printWindow) {
      setError('Unable to open the print window. Allow popups, then try Save Resume as PDF again.')
      return
    }

    const html = renderResumeMarkdownAsHtml(changedDocumentMarkdown)
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <title>RESUnator Resume</title>
  <style>
    @page { margin: 0.55in; }
    body { color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.35; }
    h1, h2, h3, h4 { color: #111827; margin: 0.18in 0 0.07in; }
    h1 { font-size: 19pt; text-align: center; margin-top: 0; }
    h2 { border-bottom: 1px solid #6b21a8; font-size: 13pt; padding-bottom: 0.03in; text-transform: uppercase; }
    h3, h4 { font-size: 11.5pt; }
    p { margin: 0 0 0.07in; }
    ul { margin: 0 0 0.08in 0.2in; padding-left: 0.16in; }
    li { margin: 0 0 0.035in; }
  </style>
</head>
<body>${html}</body>
</html>`)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  async function saveDoc2DeckPptxFromJsonOutput(jsonText, sourceFileName) {
    const parseResult = parseDoc2DeckPptxJsonWithMeta(jsonText)
    const parsed = parseResult.parsed
    const slides = Array.isArray(parsed?.deck?.slides) ? parsed.deck.slides : []
    if (!slides.length) {
      throw new Error('PPTX mode expected strict JSON with deck.slides[] but it could not be parsed.')
    }

    const safeSource = (sourceFileName || 'changes.json').trim() || 'changes.json'
    const pptxFileName = `${safeSource.replace(/\.[^/.]+$/, '')}.pptx`
    const PptxGenJS = await loadPptxGenJsFromCdn()
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'
    pptx.author = 'DocDoc'
    pptx.subject = `${parsed?.deck?.title || 'Doc2Deck'}`
    pptx.title = `${parsed?.deck?.title || 'Doc2Deck Output'}`

    slides.forEach((slideData, index) => {
      const slide = pptx.addSlide()
      const slideNumber = Number.parseInt(`${slideData?.slide_number ?? index + 1}`, 10)
      const title = `${slideData?.title || `Slide ${slideNumber}`}`.trim() || `Slide ${slideNumber}`
      const bullets = Array.isArray(slideData?.bullets) ? slideData.bullets.filter(Boolean).map((item) => `${item}`.trim()) : []
      const speakerNotes = `${slideData?.speaker_notes || ''}`.trim()

      slide.addText(`Slide ${slideNumber}: ${title}`, {
        x: 0.5,
        y: 0.3,
        w: 12.3,
        h: 0.6,
        fontSize: 24,
        bold: true
      })

      slide.addText(bullets.length ? bullets.map((item) => `• ${item}`).join('\n') : '• (No bullets provided)', {
        x: 0.7,
        y: 1.2,
        w: 11.8,
        h: 4.8,
        fontSize: 18,
        valign: 'top'
      })

      if (speakerNotes) {
        slide.addNotes(`Speaker Notes:\n${speakerNotes}`)
      }
    })

    await pptx.writeFile({ fileName: pptxFileName })
    return { pptxFileName, usedFallback: parseResult.usedFallback }
  }

  function buildLlmRequest(messages) {
    return {
      apiMode: selectedApiMode,
      model: selectedModel,
      store: !disableResponseLogging,
      deleteFileOnLlm,
      systemPrompt: isResunatorWorkflow
        ? RESUNATOR_SETTINGS.systemPrompt
        : 'You are a highly skilled assistant to an experienced professional in the field indicated.',
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
      job_description_document: 'JOB DESCRIPTION',
      [RESUNATOR_FILE_SOURCES.RESUME]: 'RESUME',
      [RESUNATOR_FILE_SOURCES.JOB_DESCRIPTION]: 'JOB DESCRIPTION',
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

  async function buildCanonicalDocxV1(file) {
    const arrayBuffer = await file.arrayBuffer()
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
    const parser = new DOMParser()
    const doc = parser.parseFromString(html || '', 'text/html')
    const elements = []
    let index = 0
    const push = (item) => elements.push({ ...item, index: index++ })

    const titleNode = doc.querySelector('h1, h2, p')
    const title = `${titleNode?.textContent || file.name || 'Untitled Document'}`.trim()

    doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,ul,ol,table,img').forEach((node) => {
      const tag = node.tagName.toLowerCase()
      if (tag.startsWith('h')) {
        const text = `${node.textContent || ''}`.trim()
        if (text) push({ type: 'heading', level: Number.parseInt(tag.slice(1), 10) || 1, text })
        return
      }
      if (tag === 'p') {
        const text = `${node.textContent || ''}`.trim()
        if (text) push({ type: 'paragraph', text })
        return
      }
      if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(node.querySelectorAll('li')).map((li) => `${li.textContent || ''}`.trim()).filter(Boolean)
        if (items.length) push({ type: 'list', ordered: tag === 'ol', items })
        return
      }
      if (tag === 'table') {
        const rows = Array.from(node.querySelectorAll('tr')).map((tr) => (
          Array.from(tr.querySelectorAll('th,td')).map((cell) => `${cell.textContent || ''}`.trim())
        ))
        if (rows.length) {
          const headers = rows[0] || []
          const bodyRows = rows.slice(1)
          push({ type: 'table', headers, rows: bodyRows })
        }
        return
      }
      if (tag === 'img') {
        const label = `${node.getAttribute('alt') || node.getAttribute('title') || 'Unlabeled diagram'}`.trim()
        push({ type: 'diagram_placeholder', label, placement_hint: 'inline' })
      }
    })

    return {
      format: 'canonical_docdoc_v1',
      source_type: 'docx',
      title,
      elements,
      extraction: {
        tracked_changes_included: false,
        comments_included: false,
        page_breaks_included: false,
        generator: 'mammoth',
        generated_at: new Date().toISOString()
      }
    }
  }

async function buildPrimaryPromptPreviewText() {
    const requestPayload = buildPrimaryCritiqueRequest()
    const promptFileEntries = isResunatorWorkflow
      ? {
          ...buildResunatorResumeFileEntries(),
          supporting_document: supportingFile,
          [RESUNATOR_FILE_SOURCES.JOB_DESCRIPTION]: jobReqInputMode === 'file' ? jobReqFile : null,
          prior_response_document: priorResponseFile
        }
      : {
          primary_document: docFile,
          supporting_document: supportingFile,
          job_description_document: jobReqFile,
          prior_response_document: priorResponseFile
        }
    requestPayload.messages = await maybeBypassFileMessages(requestPayload.messages, promptFileEntries)

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

  function activeResunatorResumeEntries() {
    return resunatorResumeEntries
      .map((entry, index) => ({ ...entry, index }))
      .filter((entry) => Boolean(entry.file))
  }

  function hasResunatorResumeInput() {
    return activeResunatorResumeEntries().length > 0
  }

  function buildResunatorResumeMessages() {
    return activeResunatorResumeEntries().flatMap((entry) => {
      const source = resunatorResumeSourceLabel(entry.index)
      const messages = []
      if ((entry.description || '').trim()) {
        messages.push({
          type: 'input_text',
          text: `${source} context: ${(entry.description || '').trim()}`
        })
      }
      messages.push({ type: 'input_file', source })
      return messages
    })
  }

  function buildResunatorResumeFileEntries() {
    return Object.fromEntries(
      activeResunatorResumeEntries().map((entry) => [resunatorResumeSourceLabel(entry.index), entry.file])
    )
  }

  function selectedResunatorContextResumeEntries() {
    const selectedSources = new Set(selectedResunatorContextResumeSources)
    return activeResunatorResumeEntries().filter((entry) => selectedSources.has(resunatorResumeSourceLabel(entry.index)))
  }

  function buildSelectedResunatorResumeContextMessages() {
    return selectedResunatorContextResumeEntries().flatMap((entry) => {
      const source = resunatorResumeSourceLabel(entry.index)
      const messages = []
      if ((entry.description || '').trim()) {
        messages.push({
          type: 'input_text',
          text: `${source} additional context description: ${(entry.description || '').trim()}`
        })
      }
      messages.push({ type: 'input_file', source })
      return messages
    })
  }

  function buildSelectedResunatorResumeContextFileEntries() {
    return Object.fromEntries(
      selectedResunatorContextResumeEntries().map((entry) => [resunatorResumeSourceLabel(entry.index), entry.file])
    )
  }

  function toggleResunatorContextResume(source) {
    setSelectedResunatorContextResumeSources((sources) =>
      sources.includes(source) ? sources.filter((item) => item !== source) : [...sources, source]
    )
  }

  function updateResunatorResumeEntry(index, updates) {
    setResunatorResumeEntries((entries) => {
      const nextEntries = entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...updates } : entry))
      if (Object.prototype.hasOwnProperty.call(updates, 'file')) {
        setSelectedResunatorContextResumeSources([])
      }
      const firstFile = nextEntries.find((entry) => entry.file)?.file || null
      setDocFile(firstFile)
      return nextEntries
    })
  }

  function addResunatorResumeEntry() {
    setResunatorResumeEntries((entries) => [...entries, { file: null, description: '' }])
  }

  function removeResunatorResumeEntry(index) {
    setResunatorResumeEntries((entries) => {
      const nextEntries = entries.length > 1 ? entries.filter((_, entryIndex) => entryIndex !== index) : [{ file: null, description: '' }]
      setSelectedResunatorContextResumeSources([])
      const firstFile = nextEntries.find((entry) => entry.file)?.file || null
      setDocFile(firstFile)
      return nextEntries
    })
  }

  function hasResunatorJobReqInput() {
    if (!isResunatorWorkflow) {
      return true
    }
    if (jobReqInputMode === 'file') {
      return Boolean(jobReqFile)
    }
    if (jobReqInputMode === 'url') {
      return Boolean(acceptedJobReqJson)
    }
    return jobReqText.trim() !== ''
  }

  function formatAcceptedJobReqJson() {
    return acceptedJobReqJson ? JSON.stringify(acceptedJobReqJson, null, 2) : ''
  }

  function buildResunatorJobDescriptionMessages(contextLabel = 'Job Description') {
    if (jobReqInputMode === 'file') {
      return [{ type: 'input_file', source: RESUNATOR_FILE_SOURCES.JOB_DESCRIPTION }]
    }

    if (jobReqInputMode === 'url' && acceptedJobReqJson) {
      return [
        {
          type: 'input_text',
          text: `${contextLabel} JSON extracted from the accepted job requisition URL:\n${formatAcceptedJobReqJson()}`
        }
      ]
    }

    if (jobReqInputMode === 'text' && jobReqText.trim()) {
      return [
        {
          type: 'input_text',
          text: `${contextLabel}:\n${jobReqText.trim()}`
        }
      ]
    }

    return []
  }

  async function fetchJobReqUrl() {
    const trimmedUrl = jobReqUrl.trim()
    setJobReqUrlJson(null)
    setAcceptedJobReqJson(null)
    if (!trimmedUrl) {
      setJobReqUrlStatus('Enter a job requisition URL first.')
      return
    }

    setIsFetchingJobReqUrl(true)
    setJobReqUrlStatus('Retrieving and parsing job requisition...')
    try {
      const response = await postJson(AUTH_ENDPOINTS.RESUNATOR_JOB_REQ, { url: trimmedUrl })
      setJobReqUrlJson(response.job_req || null)
      setJobReqUrlStatus('Review the extracted job requisition JSON, then accept or reject it.')
    } catch (jobReqError) {
      setJobReqUrlStatus(normalizeRequestError(jobReqError))
    } finally {
      setIsFetchingJobReqUrl(false)
    }
  }

  function acceptJobReqUrlJson() {
    if (!jobReqUrlJson) {
      setJobReqUrlStatus('Fetch a job requisition URL before accepting it.')
      return
    }
    setAcceptedJobReqJson(jobReqUrlJson)
    setJobReqUrlStatus('Accepted the extracted job requisition JSON for this RESUnator prompt.')
  }

  function rejectJobReqUrlJson() {
    setAcceptedJobReqJson(null)
    setJobReqUrlJson(null)
    setJobReqUrlStatus('Rejected the extracted job requisition JSON. Choose another mode or fetch a different URL.')
  }

  function buildResunatorCritiqueRequest() {
    const messages = [
      {
        type: 'input_text',
        text: `Critique the attached Resume against the attached Job Description. Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${buildAntiGuidancePrompt()}`
      },
      ...buildResunatorResumeMessages(),
      ...buildResunatorJobDescriptionMessages('Job Description')
    ]

    if (supportingFile) {
      messages.push({
        type: 'input_text',
        text: `Supporting document included for context. Instructions: ${supportInstructions || 'None provided.'}`
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

    if (critiqueResponseFormat === 'json') {
      messages.push({
        type: 'input_text',
        text: 'Return only valid JSON with this schema: {"overall_assessment":string,"major_issues":[{"id":string,"category":string,"severity":"major","justification":string,"recommended_change":string,"suggested_rewrite":string|null,"confidence_notes":string}],"minor_issues":[{"id":string,"category":string,"severity":"minor","justification":string,"recommended_change":string,"suggested_rewrite":string|null,"confidence_notes":string}],"metadata":{"model":string,"timestamp":string,"input_digest":string,"prompt_size":integer,"document_size":integer,"response_size":integer,"processing_time_ms":integer}}. Do not return markdown.'
      })
    }

    return buildLlmRequest(messages)
  }

  function buildPrimaryCritiqueRequest(slideScopeSummary = '') {
    if (isResunatorWorkflow) {
      return buildResunatorCritiqueRequest()
    }

    const messages = [
      {
        type: 'input_text',
        text: `Primary ${contentNoun} to critique. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${buildAntiGuidancePrompt()}`
      },
      { type: 'input_file', source: 'primary_document' }
    ]

    if (isDeckMateWorkflow && slideScopeSummary) {
      messages.push({
        type: 'input_text',
        text: `Chunk instruction: Process only ${slideScopeSummary}.`
      })
    }

    if (supportingFile && !isResunatorWorkflow) {
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

    if (critiqueResponseFormat === 'json' && !isDeckMateWorkflow && !isDoc2DeckWorkflow) {
      messages.push({
        type: 'input_text',
        text: 'Return only valid JSON with this schema: {"overall_assessment":string,"major_issues":[{"id":string,"category":string,"severity":"major","justification":string,"recommended_change":string,"suggested_rewrite":string|null,"confidence_notes":string}],"minor_issues":[{"id":string,"category":string,"severity":"minor","justification":string,"recommended_change":string,"suggested_rewrite":string|null,"confidence_notes":string}],"metadata":{"model":string,"timestamp":string,"input_digest":string,"prompt_size":integer,"document_size":integer,"response_size":integer,"processing_time_ms":integer}}. Do not return markdown.'
      })
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

  function buildApplyChangeItemsRequest(changeItemsInput = changeItems) {
    const selectedChangeSlides = (isDeckMateWorkflow || isDoc2DeckWorkflow)
      ? extractDeckSlidesFromChangeItems(changeItemsInput)
      : []
    const critiqueSectionsBySlide = parseDeckCritiqueSections(critiqueMarkdown)
    const critiqueTextForApply =
      (isDeckMateWorkflow || isDoc2DeckWorkflow) && selectedChangeSlides.length && critiqueSectionsBySlide.length
        ? critiqueSectionsBySlide
            .filter((section) => selectedChangeSlides.includes(section.slideNumber))
            .map((section) => section.content)
            .join('\n\n')
        : critiqueMarkdown

    const applyChangeLabel = 'Change Items'
    const critiqueLabel = isDoc2DeckWorkflow ? 'Slide Plan' : 'Original critique'
    const slideScopeDirective =
      isDeckMateWorkflow && selectedChangeSlides.length
        ? ` Slide scope: update only these slides: ${selectedChangeSlides.join(', ')}.`
        : ''
    const doc2DeckPptxFormattingGuidance = (
      doc2DeckApplyChangesFormattingGuidance || DOC2DECK_SETTINGS.defaults.applyChangesFormattingGuidance || ''
    ).trim()
    const mainInstructionText = isDoc2DeckWorkflow || isResunatorWorkflow
      ? (applyChangeItemsGuidance || '').trim()
      : `Apply all requested change items directly to the original ${contentNoun} and return the changed ${contentNoun} in markdown.${
          applyChangeItemsGuidance ? ` ${applyChangeItemsGuidance}` : ''
        }`
    const applyAntiGuidance = isDoc2DeckWorkflow
      ? (applyChangesAntiGuidance.trim() || DOC2DECK_SETTINGS.defaults.applyChangesAntiGuidance || '')
      : buildAntiGuidancePrompt()

    const applyMessages = [
      {
        type: 'input_text',
        text: `Main Instruction: ${mainInstructionText}${slideScopeDirective}`
      },
      ...(isDoc2DeckWorkflow
        ? [
            {
              type: 'input_text',
              text: `Anti-Guidance: ${applyAntiGuidance}`
            },
            {
              type: 'input_text',
              text: `Formatting Guidance: ${
                doc2DeckPptxOutputMode
                  ? doc2DeckPptxFormattingGuidance
                  : `Return the changed ${contentNoun} in markdown.`
              }`
            }
          ]
        : []),
      ...(!isDoc2DeckWorkflow
        ? [
            {
              type: 'input_text',
              text: `Anti-Guidance: ${applyAntiGuidance}`
            }
          ]
        : []),
      {
        type: 'input_text',
        text: `${applyChangeLabel}:\n${formatChangeItems(changeItemsInput)}`
      },
      {
        type: 'input_text',
        text: `${critiqueLabel}:\n${critiqueTextForApply}`
      },
      ...(!isResunatorWorkflow
        ? [
            {
              type: 'input_text',
              text: `Original ${contentNoun}:`
            },
            { type: 'input_file', source: 'original_document' }
          ]
        : []),
      ...(isResunatorWorkflow ? buildSelectedResunatorResumeContextMessages() : []),
      ...(isResunatorWorkflow ? buildResunatorJobDescriptionMessages('Job Description context') : [])
    ]

    const requestPayload = buildLlmRequest(applyMessages)

    if (isDeckMateWorkflow) {
      return {
        ...requestPayload,
        deleteFileOnLlm: true
      }
    }

    return requestPayload
  }

  function buildResunatorRefineResumeRequest() {
    const messages = [
      {
        type: 'input_text',
        text: `Refinement Instruction: ${resunatorRefinementInstruction.trim()}`
      },
      {
        type: 'input_text',
        text: `Current generated resume content to revise:\n${changedDocumentMarkdown}`
      },
      {
        type: 'input_text',
        text: `${critiqueLabelForRefinement()}:\n${critiqueMarkdown}`
      },
      {
        type: 'input_text',
        text: `Change Items previously applied:\n${formatChangeItems(changeItems)}`
      },
      ...buildSelectedResunatorResumeContextMessages(),
      ...buildResunatorJobDescriptionMessages('Job Description context')
    ]

    return buildLlmRequest(messages)
  }

  function critiqueLabelForRefinement() {
    return isResunatorWorkflow ? 'Original resume critique' : 'Original critique'
  }

  async function refineResunatorResume() {
    if (!resunatorRefinementInstruction.trim()) {
      setError('Enter a refinement instruction before refining the resume.')
      return
    }
    if (!changedDocumentMarkdown.trim()) {
      setError('There is no generated resume content to refine.')
      return
    }

    setError('')
    setStatus('Refining resume...')
    const requestPayload = buildResunatorRefineResumeRequest()
    const directFileEntries = {
      ...buildSelectedResunatorResumeContextFileEntries(),
      supporting_document: supportingFile,
      [RESUNATOR_FILE_SOURCES.JOB_DESCRIPTION]: jobReqInputMode === 'file' ? jobReqFile : null
    }
    const requestPayloadBypassed = {
      ...requestPayload,
      messages: await maybeBypassFileMessages(requestPayload.messages, directFileEntries)
    }

    appendRequestLog('Submitting RESUnator resume refinement request to backend.', {
      endpoint: API_ENDPOINTS[OPERATIONS.APPLY_CHANGE_ITEMS],
      requestPayload: requestPayloadBypassed,
      fileEntries: Object.fromEntries(
        Object.entries(directFileEntries).map(([key, file]) => [
          key,
          file ? { name: file.name, size: file.size, type: file.type } : null
        ])
      )
    })

    try {
      const response = await postMultipart(
        API_ENDPOINTS[OPERATIONS.APPLY_CHANGE_ITEMS],
        requestPayloadBypassed,
        bypassFileInput ? {} : directFileEntries
      )
      setChangedDocumentMarkdown(response.outputText || '')
      setStatus('Resume refinement completed successfully.')
      appendRequestLog('RESUnator resume refinement response received.', {
        outputTextLength: (response.outputText || '').length,
        deleteLogs: response.deleteLogs || null
      })
    } catch (refineError) {
      const normalizedError = normalizeRequestError(refineError)
      setError(normalizedError)
      appendRequestLog('RESUnator resume refinement request failed.', { error: normalizedError })
    }
  }

  function buildChangedDocCritiqueRequest() {
    const messages = [
      {
        type: 'input_text',
        text: isResunatorWorkflow
          ? `Critique the included changed ${contentNoun} using the original review configuration. Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${buildAntiGuidancePrompt()}`
          : `Critique the included changed ${contentNoun} using the original review configuration. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${buildAntiGuidancePrompt()}`
      },
      {
        type: 'input_text',
        text: `Changed ${contentNoun} body:\n${changedDocumentMarkdown}`
      }
    ]
    if (critiqueResponseFormat === 'json' && !isDeckMateWorkflow && !isDoc2DeckWorkflow) {
      messages.push({
        type: 'input_text',
        text: 'Return only valid JSON with this schema: {"overall_assessment":string,"major_issues":[{"id":string,"category":string,"severity":"major","justification":string,"recommended_change":string,"suggested_rewrite":string|null,"confidence_notes":string}],"minor_issues":[{"id":string,"category":string,"severity":"minor","justification":string,"recommended_change":string,"suggested_rewrite":string|null,"confidence_notes":string}],"metadata":{"model":string,"timestamp":string,"input_digest":string,"prompt_size":integer,"document_size":integer,"response_size":integer,"processing_time_ms":integer}}. Do not return markdown.'
      })
    }
    return buildLlmRequest(messages)
  }

  function validateCritiqueJsonOutput(outputText) {
    let parsed
    try {
      parsed = JSON.parse(outputText || '{}')
    } catch (error) {
      throw new Error(`JSON parse error: ${error.message}`)
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('Root must be an object.')
    if (typeof parsed.overall_assessment !== 'string' || !parsed.overall_assessment.trim()) throw new Error('overall_assessment must be a non-empty string.')
    if (!Array.isArray(parsed.major_issues)) throw new Error('major_issues must be an array.')
    if (!Array.isArray(parsed.minor_issues)) throw new Error('minor_issues must be an array.')
    const validateIssue = (item, severity) => {
      if (!item || typeof item !== 'object') throw new Error(`${severity} issue must be an object.`)
      if (`${item.severity || ''}` !== severity) throw new Error(`${severity} issue severity must be "${severity}".`)
      ;['id', 'category', 'justification', 'recommended_change', 'confidence_notes'].forEach((field) => {
        if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error(`${severity} issue ${field} must be a non-empty string.`)
      })
      if (!(typeof item.suggested_rewrite === 'string' || item.suggested_rewrite === null || typeof item.suggested_rewrite === 'undefined')) {
        throw new Error(`${severity} issue suggested_rewrite must be string or null.`)
      }
    }
    parsed.major_issues.forEach((item) => validateIssue(item, 'major'))
    parsed.minor_issues.forEach((item) => validateIssue(item, 'minor'))
    const metadata = parsed.metadata
    if (!metadata || typeof metadata !== 'object') throw new Error('metadata must be an object.')
    ;['model', 'timestamp', 'input_digest'].forEach((field) => {
      if (typeof metadata[field] !== 'string' || !metadata[field].trim()) throw new Error(`metadata.${field} must be a non-empty string.`)
    })
    ;['prompt_size', 'document_size', 'response_size', 'processing_time_ms'].forEach((field) => {
      if (!Number.isInteger(metadata[field]) || metadata[field] < 0) throw new Error(`metadata.${field} must be a non-negative integer.`)
    })
    return parsed
  }

  async function detectDeckTotalSlidesFromFile(file) {
    if (!file || !isDeckMateWorkflow) {
      return
    }

    const requestPayload = {
      apiMode: 'responses',
      model: 'gpt-5.4-nano',
      store: false,
      deleteFileOnLlm: false,
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
    const detectedFileId = extractFirstDeleteLogFileId(response)
    if (detectedFileId) {
      setDeckCachedPrimaryFileId(detectedFileId)
      scheduleDeckFileExpiryCleanup()
    }
    appendRequestLog('Slide detection response received.', {
      outputText: response.outputText,
      retainedFileId: detectedFileId || null
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
      if (!selectedFile && isDeckMateWorkflow) {
        await cleanupDeckCachedPrimaryFile('Deck file cleared by user.')
      }
      setIsCalculatingSlides(false)
      return
    }

    try {
      await cleanupDeckCachedPrimaryFile('Replacing Deck file with newly selected file.')
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

    if (isResunatorWorkflow && operation === OPERATIONS.CRITIQUE_PRIMARY && !hasResunatorResumeInput()) {
      setError('Upload at least one resume version before critiquing the resume.')
      setCurrentMode(MODES.DOC_DEFINE)
      return
    }

    if (isResunatorWorkflow && operation === OPERATIONS.CRITIQUE_PRIMARY && !hasResunatorJobReqInput()) {
      setError('Provide the job requisition by file, accepted URL extraction, or pasted text before critiquing the resume.')
      setCurrentMode(MODES.DOC_DEFINE)
      return
    }

    if (operation === OPERATIONS.APPLY_CHANGE_ITEMS && !changeItems.length) {
      setError('Create at least one change item before applying changes.')
      setCurrentMode(MODES.CRITIQUE_REVIEW)
      return
    }

    if (isResunatorWorkflow && operation === OPERATIONS.APPLY_CHANGE_ITEMS && !selectedResunatorContextResumeEntries().length) {
      setError('Select at least one submitted resume version to include in the Apply Changes prompt.')
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
      chunkingEnabled: activeChunkingEnabled,
      chunkSize: activeChunkSize,
      chunkConcurrency: activeChunkConcurrency,
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
              const useCanonicalDocxForPrimary =
                !isDeckMateWorkflow &&
                !isDoc2DeckWorkflow &&
                docxToJson &&
                isDocxFile(docFile)
              const canonicalDocxPayload = useCanonicalDocxForPrimary
                ? await buildCanonicalDocxV1(docFile)
                : null
              const directFileEntries = isResunatorWorkflow
                ? {
                    ...buildResunatorResumeFileEntries(),
                    supporting_document: supportingFile,
                    [RESUNATOR_FILE_SOURCES.JOB_DESCRIPTION]: jobReqInputMode === 'file' ? jobReqFile : null,
                    prior_response_document: priorResponseFile
                  }
                : {
                    primary_document: useCanonicalDocxForPrimary ? null : docFile,
                    supporting_document: supportingFile,
                    job_description_document: jobReqFile,
                    prior_response_document: priorResponseFile
                  }
              const runSinglePrimaryRequest = async (requestPayload, chunkContext = null) => {
                const usingDeckCachedFile = isDeckMateWorkflow && Boolean(deckCachedPrimaryFileId)
                const requestPayloadWithCachedFile = usingDeckCachedFile
                  ? {
                      ...requestPayload,
                      deleteFileOnLlm: false,
                      messages: requestPayload.messages.map((message) =>
                        message.type === 'input_file' && message.source === 'primary_document'
                          ? { ...message, source: deckCachedPrimaryFileId }
                          : message
                      )
                    }
                  : requestPayload
                const requestPayloadWithCanonical =
                  useCanonicalDocxForPrimary && canonicalDocxPayload
                    ? {
                        ...requestPayloadWithCachedFile,
                        messages: requestPayloadWithCachedFile.messages
                          .filter((message) => !(message.type === 'input_file' && message.source === 'primary_document'))
                          .concat([
                            {
                              type: 'input_text',
                              text: `PRIMARY DOCUMENT CONTENT (canonical_docdoc_v1 JSON):\n${JSON.stringify(canonicalDocxPayload)}`
                            }
                          ])
                      }
                    : requestPayloadWithCachedFile
                const requestPayloadBypassed = {
                  ...requestPayloadWithCanonical,
                  messages: await maybeBypassFileMessages(
                    requestPayloadWithCanonical.messages,
                    usingDeckCachedFile
                      ? {
                          ...directFileEntries,
                          primary_document: null
                        }
                      : directFileEntries
                  )
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
                    bypassFileInput
                      ? {}
                      : usingDeckCachedFile
                        ? {
                            ...directFileEntries,
                            primary_document: null
                          }
                        : directFileEntries
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
                    bypassFileInput
                      ? {}
                      : usingDeckCachedFile
                        ? {
                            ...directFileEntries,
                            primary_document: null
                          }
                        : directFileEntries
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

              const shouldUseSlideSubsetChunks = isDeckMateWorkflow && activeChunkingEnabled && selectedSlides.length > 0
              if (!shouldUseSlideSubsetChunks) {
                const singleSlideScopeSummary =
                  isDeckMateWorkflow && selectedSlides.length ? summarizeSlideGroup(selectedSlides) : ''
                return runSinglePrimaryRequest(buildPrimaryCritiqueRequest(singleSlideScopeSummary))
              }

              const configuredChunkSize = clampPositiveInteger(activeChunkSize, APP_SETTINGS.chunkSizeDefault ?? 6)
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
                  clampPositiveInteger(activeChunkConcurrency, APP_SETTINGS.chunkConcurrencyDefault ?? 2),
                  chunkedRequests.length
                )
                appendRequestLog('Chunking plan calculated for primary critique.', {
                  totalSlidesForDisplay: totalSlides,
                  selectedSlidesCount: pendingSlides.length,
                  chunkSize: activeChunkSize,
                  chunkCount: chunkedRequests.length,
                  calculatedParallel,
                  chunkConcurrencyCap: clampPositiveInteger(activeChunkConcurrency, APP_SETTINGS.chunkConcurrencyDefault ?? 2),
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
                const buildApplyChunkRequest = async (
                  chunkChangeItems,
                  {
                    cachedFileId = '',
                    shouldDeleteOnLlm = true
                  } = {}
                ) => {
                  let requestPayload = buildApplyChangeItemsRequest(chunkChangeItems)
                  requestPayload = {
                    ...requestPayload,
                    deleteFileOnLlm: shouldDeleteOnLlm
                  }
                  if (cachedFileId) {
                    requestPayload = {
                      ...requestPayload,
                      messages: requestPayload.messages.map((message) =>
                        message.type === 'input_file' && message.source === 'original_document'
                          ? { ...message, source: cachedFileId }
                          : message
                      )
                    }
                  }
                  const directFileEntries = {
                    original_document: cachedFileId ? null : docFile
                  }
                  const requestPayloadBypassed = {
                    ...requestPayload,
                    messages: await maybeBypassFileMessages(requestPayload.messages, directFileEntries)
                  }
                  return { requestPayloadBypassed, directFileEntries }
                }

                const cleanupApplyCachedFile = async (fileId, reason) => {
                  if (!fileId) {
                    return
                  }
                  try {
                    appendRequestLog('Deleting cached Doc2Deck apply file id.', { reason, fileId }, { submissionId })
                    await postMultipart(API_ENDPOINTS[OPERATIONS.CRITIQUE_PRIMARY], {
                      apiMode: 'responses',
                      model: 'gpt-5.4-nano',
                      store: false,
                      deleteFileOnLlm: true,
                      systemPrompt: 'Acknowledge file deletion request.',
                      messages: [
                        { type: 'input_text', text: 'Acknowledge file deletion request.' },
                        { type: 'input_file', source: fileId }
                      ]
                    }, {})
                  } catch (cleanupError) {
                    if (isRetryableGatewayError(cleanupError)) {
                      appendRequestLog('Cached Doc2Deck apply file deletion returned a retryable gateway error; file may already be deleted on OpenAI.', {
                        reason,
                        fileId,
                        error: normalizeRequestError(cleanupError)
                      }, { submissionId })
                      return
                    }
                    appendRequestLog('Cached Doc2Deck apply file deletion failed.', {
                      reason,
                      fileId,
                      error: normalizeRequestError(cleanupError)
                    }, { submissionId })
                  }
                }

                const selectedApplySlides = isDoc2DeckWorkflow
                  ? extractDeckSlidesFromChangeItems(changeItems)
                  : []
                const shouldUseDoc2DeckApplyChunks =
                  isDoc2DeckWorkflow &&
                  activeChunkingEnabled &&
                  !bypassFileInput &&
                  selectedApplySlides.length > 0

                if (shouldUseDoc2DeckApplyChunks) {
                  const configuredChunkSize = clampPositiveInteger(activeChunkSize, DOC2DECK_SETTINGS.chunkSizeDefault ?? 6)
                  const chunkPlans = buildPrimaryChunkedRequests(selectedApplySlides, configuredChunkSize).map((entry) => entry.chunk)
                  const nonSlideChangeItems = changeItems.filter((item) => !/^slide-\d+$/i.test(item.id || ''))
                  const chunkOutputs = []
                  let cachedApplyFileId = ''

                  try {
                    appendRequestLog('Chunking plan calculated for Doc2Deck apply changes.', {
                      selectedSlidesCount: selectedApplySlides.length,
                      chunkSize: configuredChunkSize,
                      chunkCount: chunkPlans.length
                    }, { submissionId })

                    for (let chunkIndex = 0; chunkIndex < chunkPlans.length; chunkIndex += 1) {
                      const chunkPlan = chunkPlans[chunkIndex]
                      const isFinalChunk = chunkIndex === chunkPlans.length - 1
                      const shouldDeleteOnLlm = chunkPlans.length === 1 || isFinalChunk
                      const chunkSlideSet = new Set(chunkPlan.slides)
                      const chunkSlideItems = changeItems.filter((item) => {
                        const match = `${item.id || ''}`.match(/^slide-(\d+)$/i)
                        if (!match) {
                          return false
                        }
                        const slideNumber = Number.parseInt(match[1], 10)
                        return chunkSlideSet.has(slideNumber)
                      })
                      const chunkChangeItems = chunkIndex === 0
                        ? [...nonSlideChangeItems, ...chunkSlideItems]
                        : chunkSlideItems

                      setStatus(`Invoking ${operationLabels[operation]} chunk ${chunkIndex + 1} of ${chunkPlans.length} (${chunkPlan.summary})...`)
                      const { requestPayloadBypassed, directFileEntries } = await buildApplyChunkRequest(
                        chunkChangeItems,
                        {
                          cachedFileId: cachedApplyFileId,
                          shouldDeleteOnLlm
                        }
                      )
                      appendRequestLog('Submitting apply-change-items chunk request to backend.', {
                        chunkIndex: chunkIndex + 1,
                        chunkCount: chunkPlans.length,
                        chunkSummary: chunkPlan.summary,
                        usingCachedFileId: Boolean(cachedApplyFileId),
                        requestPayload: requestPayloadBypassed,
                        fileEntries: Object.fromEntries(
                          Object.entries(directFileEntries).map(([key, file]) => [
                            key,
                            file ? { name: file.name, size: file.size, type: file.type } : null
                          ])
                        )
                      }, { submissionId })

                      const response = await postMultipart(
                        API_ENDPOINTS[operation],
                        requestPayloadBypassed,
                        bypassFileInput ? {} : directFileEntries
                      )
                      if (!cachedApplyFileId && !shouldDeleteOnLlm) {
                        cachedApplyFileId = extractFirstDeleteLogFileId(response) || ''
                      }

                      appendRequestLog('Apply-change-items chunk response received.', {
                        chunkIndex: chunkIndex + 1,
                        chunkCount: chunkPlans.length,
                        chunkSummary: chunkPlan.summary,
                        outputTextLength: (response.outputText || '').length,
                        retainedFileId: cachedApplyFileId || null
                      }, { submissionId })
                      chunkOutputs.push(
                        `### ${chunkPlan.summary}\n\n${response.outputText || '_No changed content returned for this chunk._'}`
                      )
                    }

                    return { outputText: chunkOutputs.join('\n\n'), chunked: true }
                  } catch (chunkApplyError) {
                    await cleanupApplyCachedFile(cachedApplyFileId, 'Doc2Deck apply chunking failed; deleting cached file.')
                    throw chunkApplyError
                  }
                }

                const requestPayload = buildApplyChangeItemsRequest()
                const directFileEntries = isResunatorWorkflow
                  ? {
                      ...buildSelectedResunatorResumeContextFileEntries(),
                      supporting_document: supportingFile,
                      [RESUNATOR_FILE_SOURCES.JOB_DESCRIPTION]: jobReqInputMode === 'file' ? jobReqFile : null
                    }
                  : {
                      original_document: docFile,
                      supporting_document: supportingFile,
                      job_description_document: jobReqFile
                    }
                const requestPayloadBypassed = {
                  ...requestPayload,
                  messages: await maybeBypassFileMessages(requestPayload.messages, directFileEntries)
                }
                appendRequestLog('Submitting apply-change-items request to backend.', {
                  endpoint: API_ENDPOINTS[operation],
                  bypassFileInput,
                  requestPayload: requestPayloadBypassed,
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
                  appendRequestLog('Apply-change-items response received.', {
                    outputTextLength: (response.outputText || '').length,
                    deleteLogs: response.deleteLogs || null,
                    endpointTrace: response.__endpointTrace || null
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
        if (isDoc2DeckWorkflow && doc2DeckPptxOutputMode) {
          saveTextToFile(outputText, changedOutputFileName, 'application/json;charset=utf-8')
          try {
            const { pptxFileName, usedFallback } = await saveDoc2DeckPptxFromJsonOutput(outputText, changedOutputFileName)
            appendRequestLog('Generated PPTX from Doc2Deck JSON output.', { pptxFileName }, { submissionId })
            if (usedFallback) {
              setError('Warning: Doc2Deck JSON fallback parsing was used. Some chunk content may not be fully processed.')
            }
          } catch (pptxError) {
            appendRequestLog('PPTX generation from Doc2Deck JSON output failed.', {
              error: normalizeRequestError(pptxError)
            }, { submissionId })
            setError(`PPTX generation failed: ${normalizeRequestError(pptxError)}`)
          }
        } else {
          saveMarkdownToFile(outputText, changedOutputFileName)
        }
        setStatus('Applying change items completed successfully.')
      } else {
        let critiqueTextToRender = outputText
        if (critiqueResponseFormat === 'json' && !isDeckMateWorkflow && !isDoc2DeckWorkflow && (operation === OPERATIONS.CRITIQUE_PRIMARY || operation === OPERATIONS.CRITIQUE_CHANGED)) {
          try {
            const validatedCritique = validateCritiqueJsonOutput(outputText)
            critiqueTextToRender = JSON.stringify(validatedCritique, null, 2)
          } catch (validationError) {
            throw new Error(`Critique JSON validation failed. ${normalizeRequestError(validationError)}. Diagnostics: received ${`${outputText || ''}`.length} characters.`)
          }
        }
        setCritiqueMarkdown(critiqueTextToRender)
        if (operation === OPERATIONS.CRITIQUE_PRIMARY || operation === OPERATIONS.CRITIQUE_CHANGED) {
          const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
          setLastCritiqueWaitMs(Math.max(0, finishedAt - operationStartedAt))
        }
        if (operation === OPERATIONS.CRITIQUE_PRIMARY) {
          if (critiqueResponseFormat === 'json' && !isDeckMateWorkflow && !isDoc2DeckWorkflow) {
            saveTextToFile(critiqueTextToRender, critiqueOutputFileName || 'critique.json', 'application/json;charset=utf-8')
          } else {
            saveMarkdownToFile(outputText, critiqueOutputFileName)
          }
          if (isDeckMateWorkflow) {
            await cleanupDeckCachedPrimaryFile('Primary Deck Mate critique completed; deleting cached file.')
          }
        }
        setStatus(
          operation === OPERATIONS.CRITIQUE_CHANGED
            ? `Changed-${contentNoun} critique completed successfully.`
            : `Primary ${contentNoun} critique completed successfully.`
        )
      }

      setCurrentMode(MODES.RESULT_SAVED)
    } catch (invocationError) {
      if (operation === OPERATIONS.CRITIQUE_PRIMARY && isDeckMateWorkflow) {
        await cleanupDeckCachedPrimaryFile('Primary Deck Mate critique failed; deleting cached file.')
      }
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
      { id: trimmedId, instruction: trimmedInstruction || changeItemInstruction.trim() || 'create item as stated' }
    ])
    setChangeItemDraft(emptyChangeDraft(changeItemInstruction.trim() || 'create item as stated'))
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
        instruction: changeItemInstruction.trim() || 'create item as stated'
      }))

    if (!itemsToAdd.length) {
      setError('All selected Slide / Issue combinations are already present.')
      return
    }

    setChangeItems((items) => [...items, ...itemsToAdd])
    setSelectedDeckIssueOptions([])
    setError('')
  }


  function addDocIssueSelectionsAsChangeItems() {
    if (!selectedDocIssueOptions.length) {
      setError('Select at least one issue first.')
      return
    }

    const itemsToAdd = selectedDocIssueOptions
      .map((issueIdRaw) => `${issueIdRaw}`.trim())
      .filter((issueId) => issueId.length > 0)
      .filter((issueId) => !changeItems.some((existing) => existing.id.toLowerCase() === issueId.toLowerCase()))
      .map((issueId) => ({
        id: issueId,
        instruction: changeItemInstruction.trim() || 'create item as stated'
      }))

    if (!itemsToAdd.length) {
      setError('All selected issues are already present in Change Items.')
      return
    }

    setChangeItems((items) => [...items, ...itemsToAdd])
    setSelectedDocIssueOptions([])
    setError('')
  }

  function addDoc2DeckSlideSelectionsAsChangeItems() {
    if (!selectedDoc2DeckSlides.length) {
      setError('Select at least one Slide first.')
      return
    }

    const itemsToAdd = selectedDoc2DeckSlides
      .map((slideIdRaw) => `${slideIdRaw}`.trim())
      .filter((slideId) => /^slide-\d+$/i.test(slideId))
      .map((slideId) => slideId.toLowerCase())
      .filter((slideId) => !changeItems.some((existing) => existing.id.toLowerCase() === slideId))
      .map((slideId) => {
        return {
          id: slideId,
          instruction: changeItemInstruction.trim() || 'create item as stated'
        }
      })

    if (!itemsToAdd.length) {
      setError('All selected slides are already present in Change Items.')
      return
    }

    setChangeItems((items) => [...items, ...itemsToAdd])
    setSelectedDoc2DeckSlides([])
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
    if (isDeckMateWorkflow) {
      void cleanupDeckCachedPrimaryFile('Reset to definition mode; clearing cached Deck file.')
    }
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
        onClick={async () => {
          await clearApplicationContext('Navigating back to A-Ideation home.')
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


  function renderUserIdentity() {
    if (!authUser) return null
    const suiteDisplayName = authUser?.displayName?.trim() ? authUser.displayName : authUser?.email
    return (
      <div className="suite-user-info">
        <span>{suiteDisplayName}</span>
        <small>({authUser.email})</small>
      </div>
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

  function renderPendingAccessPopup() {
    if (accessFlowMode !== 'pending' || !accessFlowMessage) {
      return null
    }

    return (
      <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Contact request pending approval">
        <section className="card auth-card auth-overlay-card">
          <div className="auth-overlay-header">
            <h2>Registration Pending</h2>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setAccessFlowMode('entry')
                setAccessFlowMessage('')
              }}
            >
              Close
            </button>
          </div>
          <p className="muted">{accessFlowMessage}</p>
        </section>
      </div>
    )
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
    loadGettingStartedItems().catch(() => {})
  }, [])

  useEffect(() => {
    const isDefaultName = critiqueOutputFileName === 'critique.md' || critiqueOutputFileName === 'critique.json' || !`${critiqueOutputFileName || ''}`.trim()
    if (!isDefaultName) return
    setCritiqueOutputFileName(critiqueResponseFormat === 'json' ? 'critique.json' : 'critique.md')
  }, [critiqueResponseFormat, critiqueOutputFileName])

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
    if (activeView === APP_VIEWS.ZOOM_ZILLA) {
      window.__AIDEATION_APP_NAME = 'zoom-zilla'
      return
    }
    if (activeView === APP_VIEWS.RESUNATOR) {
      window.__AIDEATION_APP_NAME = 'resunator'
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
      critiqueResponseFormat,
      docxToJson,
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
        applyChangeItemsGuidance: docApplyChangeItemsGuidance,
        changeItemInstruction: docChangeItemInstruction,
        supportInstructions: docSupportInstructions,
        priorInstructions: docPriorInstructions
      },
      deck: {
        topic: deckTopic,
        objective: deckObjective,
        guidance: deckGuidance,
        antiGuidance: deckAntiGuidance,
        applyChangeItemsGuidance: deckApplyChangeItemsGuidance,
        changeItemInstruction: deckChangeItemInstruction,
        supportInstructions: deckSupportInstructions,
        priorInstructions: deckPriorInstructions
      },
      resunator: {
        topic: resunatorTopic,
        objective: resunatorObjective,
        guidance: resunatorGuidance,
        antiGuidance: resunatorAntiGuidance,
        applyChangeItemsGuidance: resunatorApplyChangeItemsGuidance,
        changeItemInstruction: resunatorChangeItemInstruction,
        supportInstructions: resunatorSupportInstructions,
        priorInstructions: resunatorPriorInstructions
      },
      doc2deck: {
        topic: doc2DeckTopic,
        objective: doc2DeckObjective,
        guidance: doc2DeckGuidance,
        antiGuidance: doc2DeckAntiGuidance,
        applyChangeItemsGuidance: doc2DeckApplyChangeItemsGuidance,
        applyChangesFormattingGuidance: doc2DeckApplyChangesFormattingGuidance,
        applyChangesAntiGuidance: doc2DeckApplyChangesAntiGuidance,
        pptxOutputMode: doc2DeckPptxOutputMode,
        chunkingEnabled: doc2DeckChunkingEnabled,
        chunkSize: doc2DeckChunkSize,
        chunkConcurrency: doc2DeckChunkConcurrency,
        changeItemInstruction: doc2DeckChangeItemInstruction,
        supportInstructions: doc2DeckSupportInstructions,
        priorInstructions: doc2DeckPriorInstructions
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
    critiqueResponseFormat,
    docxToJson,
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
    docChangeItemInstruction,
    docSupportInstructions,
    docPriorInstructions,
    deckTopic,
    deckObjective,
    deckGuidance,
    deckAntiGuidance,
    deckApplyChangeItemsGuidance,
    deckChangeItemInstruction,
    deckSupportInstructions,
    deckPriorInstructions,
    doc2DeckTopic,
    doc2DeckObjective,
    doc2DeckGuidance,
    doc2DeckAntiGuidance,
    doc2DeckApplyChangeItemsGuidance,
    doc2DeckApplyChangesFormattingGuidance,
    doc2DeckApplyChangesAntiGuidance,
    doc2DeckPptxOutputMode,
    doc2DeckChunkingEnabled,
    doc2DeckChunkSize,
    doc2DeckChunkConcurrency,
    doc2DeckChangeItemInstruction,
    doc2DeckSupportInstructions,
    doc2DeckPriorInstructions,
    resunatorTopic,
    resunatorObjective,
    resunatorGuidance,
    resunatorAntiGuidance,
    resunatorApplyChangeItemsGuidance,
    resunatorChangeItemInstruction,
    resunatorSupportInstructions,
    resunatorPriorInstructions
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
    if (!isDoc2DeckWorkflow || !doc2DeckCritiqueSections.length) {
      setSelectedDoc2DeckSlideTab('all')
      return
    }
    if (selectedDoc2DeckSlideTab === 'all') {
      return
    }
    const hasCurrent = doc2DeckCritiqueSections.some((section) => section.slideNumber === selectedDoc2DeckSlideTab)
    if (!hasCurrent) {
      setSelectedDoc2DeckSlideTab('all')
    }
  }, [isDoc2DeckWorkflow, doc2DeckCritiqueSections, selectedDoc2DeckSlideTab])

  useEffect(() => {
    const allowedOptionValues = new Set(visibleDeckIssueOptions.map((option) => option.optionValue))
    setSelectedDeckIssueOptions((items) => items.filter((item) => allowedOptionValues.has(item)))
  }, [visibleDeckIssueOptions])

  useEffect(() => () => {
    clearDeckFileExpiryTimer()
  }, [])

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
    if (!isDoc2DeckWorkflow || !changedDoc2DeckSections.length) {
      setSelectedChangedDoc2DeckSlideTab('all')
      return
    }
    if (selectedChangedDoc2DeckSlideTab === 'all') {
      return
    }
    const hasCurrent = changedDoc2DeckSections.some((section) => section.slideNumber === selectedChangedDoc2DeckSlideTab)
    if (!hasCurrent) {
      setSelectedChangedDoc2DeckSlideTab('all')
    }
  }, [isDoc2DeckWorkflow, changedDoc2DeckSections, selectedChangedDoc2DeckSlideTab])

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
    const settingsTabs = isDoc2DeckWorkflow
      ? [
          {
            id: 'prompt_instructions',
            label: 'Prompt Instructions',
            keys: [
              'defaultTopic',
              'reviewObjective',
              'formattingGuidance',
              'antiGuidance',
              'changeItemInstruction',
              'applyChangeItemsGuidance',
              'applyChangesFormattingGuidance',
              'applyChangesAntiGuidance'
            ]
          },
          {
            id: 'application_controls',
            label: 'Application Controls',
            keys: ['viewPrompt', 'logPanelEnabled', 'chunkingEnabled', 'chunkSize', 'chunkConcurrency', 'pptxOutputMode']
          },
          {
            id: 'model_controls',
            label: 'Model Controls',
            keys: ['apiMode', 'llmModel', 'critiqueResponseFormat', 'docxToJson', 'ignoreOcrErrors', 'disableResponseLogging', 'deleteFileOnLlm']
          }
        ]
      : isDeckMateWorkflow
        ? [
            {
              id: 'prompt_instructions',
              label: 'Prompt Instructions',
              keys: [
                'defaultTopic',
                'reviewObjective',
                'formattingGuidance',
                'antiGuidance',
                'changeItemInstruction',
                'applyChangeItemsGuidance'
              ]
            },
            {
              id: 'application_controls',
              label: 'Application Controls',
              keys: ['viewPrompt', 'logPanelEnabled', 'chunkingEnabled', 'deckTotalSlides', 'chunkSize', 'chunkConcurrency']
            },
            {
              id: 'model_controls',
              label: 'Model Controls',
              keys: ['apiMode', 'llmModel', 'critiqueResponseFormat', 'docxToJson', 'ignoreOcrErrors', 'disableResponseLogging', 'deleteFileOnLlm']
            }
          ]
        : isResunatorWorkflow
          ? [
              {
                id: 'prompt_instructions',
                label: 'Prompt Instructions',
                keys: ['reviewObjective', 'formattingGuidance', 'antiGuidance', 'changeItemInstruction']
              },
              {
                id: 'application_controls',
                label: 'Application Controls',
                keys: ['viewPrompt', 'bypassFileInput', 'logPanelEnabled']
              },
              {
                id: 'model_controls',
                label: 'Model Controls',
                keys: ['apiMode', 'llmModel', 'critiqueResponseFormat', 'docxToJson', 'ignoreOcrErrors', 'disableResponseLogging', 'deleteFileOnLlm']
              }
            ]
          : [
            {
              id: 'prompt_instructions',
              label: 'Prompt Instructions',
              keys: ['defaultTopic', 'reviewObjective', 'formattingGuidance', 'antiGuidance', 'changeItemInstruction']
            },
            {
              id: 'application_controls',
              label: 'Application Controls',
              keys: ['viewPrompt', 'bypassFileInput', 'logPanelEnabled']
            },
            {
              id: 'model_controls',
              label: 'Model Controls',
              keys: ['apiMode', 'llmModel', 'critiqueResponseFormat', 'docxToJson', 'ignoreOcrErrors', 'disableResponseLogging', 'deleteFileOnLlm']
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
        case 'critiqueResponseFormat':
          return (
            <label key={settingKey}>
              {settingsLabels.critiqueResponseFormat || 'Critique Response Format'}
              <select
                name="critique_response_format"
                value={critiqueResponseFormat}
                onChange={(event) => setCritiqueResponseFormat(event.target.value)}
              >
                {(APP_SETTINGS.critiqueResponseFormats || [{ value: 'json', label: 'JSON (Default)' }, { value: 'markdown', label: 'Markdown (Legacy)' }]).map((formatOption) => (
                  <option key={formatOption.value} value={formatOption.value}>
                    {formatOption.label}
                  </option>
                ))}
              </select>
            </label>
          )
        case 'docxToJson':
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="docx_to_json"
                type="checkbox"
                checked={docxToJson}
                onChange={(event) => setDocxToJson(event.target.checked)}
              />
              {settingsLabels.docxToJson || 'DOCX to JSON'}
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
              {settingsLabels.applyChangeItemsGuidance || activeSettings.labels.applyChangeItemsGuidance || 'Apply Change Items Guidance'}
              <textarea
                name="apply_change_items_guidance"
                value={applyChangeItemsGuidance}
                onChange={(event) => setApplyChangeItemsGuidanceForActive(event.target.value)}
                rows={3}
              />
            </label>
          )
        case 'applyChangesAntiGuidance':
          return (
            <label key={settingKey}>
              {settingsLabels.applyChangesAntiGuidance || activeSettings.labels.applyChangesAntiGuidance || 'Apply Changes Anti-Guidance'}
              <textarea
                name="apply_changes_anti_guidance"
                value={isDoc2DeckWorkflow ? doc2DeckApplyChangesAntiGuidance : ''}
                onChange={(event) => {
                  if (isDoc2DeckWorkflow) {
                    setDoc2DeckApplyChangesAntiGuidance(event.target.value)
                  }
                }}
                rows={3}
              />
            </label>
          )
        case 'applyChangesFormattingGuidance':
          return (
            <label key={settingKey}>
              {settingsLabels.applyChangesFormattingGuidance || activeSettings.labels.applyChangesFormattingGuidance || 'Apply Changes Formatting Guidance'}
              <textarea
                name="apply_changes_formatting_guidance"
                value={isDoc2DeckWorkflow ? doc2DeckApplyChangesFormattingGuidance : ''}
                onChange={(event) => {
                  if (isDoc2DeckWorkflow) {
                    setDoc2DeckApplyChangesFormattingGuidance(event.target.value)
                  }
                }}
                rows={4}
              />
            </label>
          )
        case 'pptxOutputMode':
          return (
            <label key={settingKey} className="checkbox-label">
              <input
                name="pptx_output_mode"
                type="checkbox"
                checked={isDoc2DeckWorkflow ? doc2DeckPptxOutputMode : false}
                onChange={(event) => {
                  if (isDoc2DeckWorkflow) {
                    setDoc2DeckPptxOutputMode(event.target.checked)
                  }
                }}
              />
              {settingsLabels.pptxOutputMode || activeSettings.labels.pptxOutputMode || 'pptx output mode'}
            </label>
          )
        case 'changeItemInstruction':
          return (
            <label key={settingKey}>
              {settingsLabels.changeItemInstruction || activeSettings.labels.changeItemInstruction || 'Change Item Instruction'}
              <textarea
                name="change_item_instruction"
                value={changeItemInstruction}
                onChange={(event) => setChangeItemInstructionForActive(event.target.value)}
                rows={2}
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
              {settingsLabels.deleteFileOnLlm || 'Delete File on AI Platform'}
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
              {settingsLabels.logPanelEnabled || 'Log Panel Enabled'}
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
                checked={activeChunkingEnabled}
                onChange={(event) => setChunkingEnabledForActive(event.target.checked)}
              />
              {settingsLabels.chunkingEnabled || 'Enable slide chunking'}
            </label>
          )
        case 'chunkSize':
          if (!isDeckMateWorkflow && !isDoc2DeckWorkflow) {
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
                value={activeChunkSize}
                onChange={(event) => setChunkSizeForActive(event.target.value)}
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
          if (!isDeckMateWorkflow && !isDoc2DeckWorkflow) {
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
                value={activeChunkConcurrency}
                onChange={(event) => setChunkConcurrencyForActive(event.target.value)}
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
            {isDeckMateWorkflow || isDoc2DeckWorkflow || activeView === APP_VIEWS.DOCUMENT_DOCTOR ? (
              <>
                <div
                  className="settings-tabs"
                  role="tablist"
                  aria-label={
                    isDoc2DeckWorkflow
                      ? 'Doc2Deck settings tabs'
                      : isDeckMateWorkflow
                        ? 'Deck Mate settings tabs'
                        : 'Document Doctor settings tabs'
                  }
                >
                  {settingsTabs.map((tab) => (
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
                {(settingsTabs.find((tab) => tab.id === deckSettingsTab) || settingsTabs[0]).keys.map(
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
    const contactOnlyMode = accessFlowMode === 'contact'
    const loginOnlyMode = accessFlowMode === 'login'
    const contactRequestSubmittedForCurrentEmail = contactOnlyMode
      && contactSubmittedForEmail
      && contactSubmittedForEmail === authEmail.trim().toLowerCase()

    return (
      <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Sign in or register">
        <section className="card auth-card auth-overlay-card">
          <div className="auth-overlay-header">
            <h1>A-Ideation Access</h1>
            <button type="button" className="secondary-button" onClick={closeAuthOverlay}>
              Close
            </button>
          </div>
          <p className="muted">
            {authMode === 'register'
              ? (registrationReadyForVerify
                ? 'Your account has been created. Enter the token from your verification email.'
                : 'Create your account to access the A-Ideation solution suite.')
              : loginOnlyMode
              ? 'Sign in to access the A-Ideation solution suite.'
              : contactOnlyMode
              ? (contactRequestSubmittedForCurrentEmail
                ? 'Contact request submitted. You will receive an email with approval to register shortly.'
                : 'Submit your contact details first. Access credentials will be enabled after approval.')
              : 'Sign in to access the A-Ideation solution suite.'}
          </p>

          {!contactOnlyMode && authInfo ? <p className="status-message">{authInfo}</p> : null}
          {renderError()}

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
                readOnly={authEmailLocked}
              />
            </label>
            {accessFlowMode === 'login' || accessFlowMode === 'register' ? (
            <label>
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
              />
            </label>
            ) : null}
            {accessFlowMode === 'contact' ? (
              <label>
                First Name
                <input type="text" value={authFirstName} onChange={(event) => setAuthFirstName(event.target.value)} required readOnly={contactRequestSubmittedForCurrentEmail} />
              </label>
            ) : null}
            {accessFlowMode === 'contact' ? (
              <label>
                Last Name
                <input type="text" value={authLastName} onChange={(event) => setAuthLastName(event.target.value)} required readOnly={contactRequestSubmittedForCurrentEmail} />
              </label>
            ) : null}
            {accessFlowMode === 'contact' ? (
              <label>
                Phone Number
                <input type="text" value={authPhoneNumber} onChange={(event) => setAuthPhoneNumber(event.target.value)} required readOnly={contactRequestSubmittedForCurrentEmail} />
              </label>
            ) : null}
            {accessFlowMode === 'contact' ? (
              <label>
                Job Title
                <input type="text" value={authJobTitle} onChange={(event) => setAuthJobTitle(event.target.value)} readOnly={contactRequestSubmittedForCurrentEmail} />
              </label>
            ) : null}
            {accessFlowMode === 'register' ? (
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
            {accessFlowMode === 'contact' && !contactRequestSubmittedForCurrentEmail ? (
              <button type="button" className="secondary-button" onClick={handleContactRequestSubmit}>
                Submit Contact Request
              </button>
            ) : null}
            {accessFlowMode === 'register' ? (
              <label>
                Account Type
                <input type="text" value={authAccountType === 'subscription' ? 'subscription account' : 'trial account'} readOnly />
              </label>
            ) : null}
            {accessFlowMode !== 'contact' && !(authMode === 'register' && registrationReadyForVerify) ? <button type="submit" className="primary-button" disabled={authSubmitting}>
              {authSubmitting
                ? authMode === 'register'
                  ? 'Creating Account...'
                  : 'Signing In...'
                : authMode === 'register'
                  ? 'Create Account'
                  : 'Sign In'}
            </button> : null}
          </form>

          {authMode === 'register' && !contactOnlyMode && registrationReadyForVerify ? (
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
                <button type="submit" className="primary-button">
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
    return (
      <main className="layout">
        <header className="hero card suite-hero">
          <div className="hero-corner hero-left">
            {authUser?.userType === 'registration_admin' ? (
              <button type="button" className="header-text-link" onClick={handleOpenRegistrationAdmin} disabled={pendingContactsLoading}>
                admin
              </button>
            ) : null}
          </div>
          <div className="hero-title-group">
            <h1>A-Ideation</h1>
            <p className="hero-subtitle">Improving Professional Productivity</p>
          </div>
          <div className="hero-corner hero-right">
            <div className="hero-right-stack">
              {authUser ? (
                <>
                  {renderUserIdentity()}
                  {renderLogoutButton()}
                </>
              ) : (
                <form className="auth-inline-form" onSubmit={handleAccessEmailSubmit}>
                  <div className="auth-inline-row">
                    <label className="access-email-inline-label" htmlFor="suite-access-email-input">Email:</label>
                    <input
                      className="access-email-input"
                      id="suite-access-email-input"
                      type="email"
                      placeholder="Enter email for access"
                      value={accessEmailInput}
                      onChange={(event) => setAccessEmailInput(event.target.value)}
                      required
                    />
                    <button type="submit" className="secondary-button small-submit-button">Submit</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </header>
        {renderPendingAccessPopup()}

        <section className="card suite-links">
          <h2>Solutions</h2>
          <div className="suite-link-grid">
            <div className="suite-link-item">
              <button type="button" className="suite-link-card" onClick={() => handleProtectedNavigation(APP_VIEWS.DOCUMENT_DOCTOR)}>
                <img src={DOCDOC_LOGO_PATH} alt="Document Doctor logo" />
                <span>Document<br />Doctor</span>
              </button>
              <div className="suite-link-status">Ready To Use</div>
            </div>
            <div className="suite-link-item">
              <button type="button" className="suite-link-card" onClick={() => handleProtectedNavigation(APP_VIEWS.DECK_MATE)}>
                <img src={DECK_MATE_LOGO_PATH} alt="Deck Mate logo" />
                <span>Deck Mate</span>
              </button>
              <div className="suite-link-status">Ready To Use</div>
            </div>
            <div className="suite-link-item">
              <button type="button" className="suite-link-card" onClick={() => handleProtectedNavigation(APP_VIEWS.DOC2DECK)}>
                <img src={DOC2DECK_LOGO_PATH} alt="Doc 2 Deck logo" />
                <span>Doc2Deck</span>
              </button>
              <div className="suite-link-status">Ready To Use</div>
            </div>
            <div className="suite-link-item">
              <button type="button" className="suite-link-card" onClick={() => handleProtectedNavigation(APP_VIEWS.ZOOM_ZILLA)}>
                {zoomTileLogoFailed ? (
                  <div className="suite-link-logo-placeholder">Zoom-Zilla</div>
                ) : (
                  <img
                    src={ZOOM_ZILLA_LOGO_PATH}
                    alt="Zoom-Zilla logo"
                    onError={() => {
                      setZoomTileLogoFailed(true)
                    }}
                  />
                )}
                <span>Zoom-Zilla</span>
              </button>
              <div className="suite-link-status">(Coming Soon)</div>
            </div>
            <div className="suite-link-item">
              <button type="button" className="suite-link-card" onClick={() => handleProtectedNavigation(APP_VIEWS.RESUNATOR)}>
                {resunatorTileLogoFailed ? (
                  <div className="suite-link-logo-placeholder">RESUnator</div>
                ) : (
                  <img
                    src={RESUNATOR_LOGO_PATH}
                    alt="RESUnator logo"
                    onError={() => {
                      setResunatorTileLogoFailed(true)
                    }}
                  />
                )}
                <span>RESUnator</span>
              </button>
              <div className="suite-link-status">(Coming Soon)</div>
            </div>
          </div>
        </section>
        <section className="card suite-links getting-started-panel">
          <h2>Getting Started</h2>
          <ul className="getting-started-list">
            {groupedGettingStartedItems.map((group) => (
              <li key={group.subsection}>
                <button
                  type="button"
                  className="getting-started-subsection"
                  onClick={() => setExpandedGettingStartedSections((prev) => ({
                    ...prev,
                    [group.subsection]: !prev[group.subsection]
                  }))}
                >
                  <span>{group.subsection}</span>
                  <span className="getting-started-subsection-chevron" aria-hidden="true">{expandedGettingStartedSections[group.subsection] ? '▲' : '▼'}</span>
                </button>
                {expandedGettingStartedSections[group.subsection] ? (
                  <ul className="getting-started-list">
                    {group.items.map((item) => (
                      <li key={`${group.subsection}-${item.question}`}>
                        <button
                          type="button"
                          className="getting-started-question"
                          onClick={() => setActiveGettingStartedQuestion(item.question)}
                        >
                          {item.question}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        {activeGettingStartedQuestion ? (
          <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Getting Started answer">
            <section className="card auth-required-popup getting-started-answer-panel">
              <h3>{activeGettingStartedQuestion}</h3>
              <p>{gettingStartedItems.find((item) => item.question === activeGettingStartedQuestion)?.answer || 'Answer coming soon.'}</p>
              <div className="auth-inline-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveGettingStartedQuestion('')}
                >
                  Close
                </button>
              </div>
            </section>
          </div>
        ) : null}
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
                    openAuthOverlay('login')
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
        {showAccessCaptureModal ? (
          <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Enter email for access">
            <section className="card auth-required-popup">
              <p>Please enter your email to continue.</p>
              <form className="auth-inline-form" onSubmit={handleAccessCaptureSubmit}>
                <input
                  type="email"
                  value={accessCaptureEmailInput}
                  onChange={(event) => setAccessCaptureEmailInput(event.target.value)}
                  placeholder="Enter email for access"
                  required
                />
                <div className="auth-inline-row">
                  <button type="submit" className="primary-button">Submit</button>
                  <button type="button" className="secondary-button" onClick={() => setShowAccessCaptureModal(false)}>
                    Close
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
        {showTrialExpiredNotice ? (
          <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Trial period ended">
            <section className="card auth-required-popup">
              <p>Your trial period has ended.</p>
              <div className="auth-inline-row">
                <button type="button" className="secondary-button" onClick={() => setShowTrialExpiredNotice(false)}>
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

  const workflowShellProps = isDeckMateWorkflow
    ? {
        appTitle: 'Deck Mate',
        appSubtitle: 'A Professional Review Tool for Presentation Authors',
        brandLogo: DECK_MATE_LOGO_PATH,
        brandAlt: 'Cartoon sailor on a boat presentation logo'
      }
    : isDoc2DeckWorkflow
      ? {
          appTitle: 'Doc 2 Deck',
          appSubtitle: 'Create Powerpoint Decks from Published Documents',
          brandLogo: DOC2DECK_LOGO_PATH,
          brandAlt: 'Document Doctor and Deck Mate united logo'
        }
      : activeView === APP_VIEWS.ZOOM_ZILLA
        ? {
            appTitle: 'Zoom-Zilla (Coming Soon)',
            appSubtitle: 'Create Actionable Insight from Meeting Transcripts',
            brandLogo: ZOOM_ZILLA_LOGO_PATH,
            brandAlt: 'Zoom-Zilla dinosaur assistant logo',
            brandFallbackText: 'Zoom-Zilla'
          }
      : activeView === APP_VIEWS.RESUNATOR
        ? {
            appTitle: 'RESUnator (Coming Soon)',
            appSubtitle: 'Create curated resumes and cover letters in minutes based on job descriptions',
            brandLogo: RESUNATOR_LOGO_PATH,
            brandAlt: 'RESUnator logo',
            brandFallbackText: 'RESUnator'
          }
      : {
          appTitle: 'The Document Doctor',
          appSubtitle: 'A Professional Review Tool for Document Authors',
          brandLogo: DOCDOC_LOGO_PATH,
          brandAlt: 'Cartoon paper doctor logo'
        }

  if (activeView === APP_VIEWS.ZOOM_ZILLA) {
    return (
      <PageShell
        mode={MODES.DOC_DEFINE}
        {...workflowShellProps}
        topLeftControls={renderBackToSuiteButton()}
        topRightControls={
          <>
            {renderUserIdentity()}
            {renderLogoutButton()}
          </>
        }
      >
        {renderError()}
        <section className="card">
          <h2>Zoom-Zilla (Coming Soon)</h2>
          <p className="muted">Create Actionable Insight from Meeting Transcripts</p>
        </section>
      </PageShell>
    )
  }

  if (activeView === APP_VIEWS.REGISTRATION_ADMIN) {
    return (
      <PageShell
        mode={MODES.DOC_DEFINE}
        appTitle="A-Ideation Administration"
        appSubtitle=""
        showBrand={false}
        shellClassName="admin-hero"
        topLeftControls={renderBackToSuiteButton()}
        topRightControls={
          <>
            {renderUserIdentity()}
            {renderLogoutButton()}
          </>
        }
      >
        <section className="card">
          <div className="auth-toggle-row">
            <button type="button" className="secondary-button" onClick={() => setAdminTab('manage_registration')}>Manage Registration</button>
            <button type="button" className="secondary-button" onClick={() => setAdminTab('manage_users')}>Manage Users</button>
            <button type="button" className="secondary-button" onClick={() => setAdminTab('getting_started')}>Getting Started</button>
            <button type="button" className="secondary-button" onClick={() => setAdminTab('session')}>Session</button>
          </div>
        </section>
        {adminTab === 'manage_registration' ? (
          <div className="admin-registration-grid">
            <div className="admin-registration-left">
              <section className="card">
                <h2>Pending Access Requests</h2>
                {pendingContactsLoading ? <p>Loading pending contacts...</p> : null}
                {!pendingContactsLoading && !pendingContacts.length ? <p>No pending contact requests.</p> : null}
                {!pendingContactsLoading && pendingContacts.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Email</th><th>First Name</th><th>Last Name</th><th>Phone</th><th>Job Title</th><th>Created</th><th>Action</th></tr>
                      </thead>
                      <tbody>
                        {pendingContacts.map((item) => (
                          <tr key={`${item.id}-${item.email}`}>
                            <td>{item.email}</td><td>{item.first_name}</td><td>{item.last_name}</td><td>{item.phone_number}</td><td>{item.job_title}</td><td>{item.created_at}</td>
                            <td>
                              <button type="button" className="header-text-link" onClick={() => setAdminApproveModal({ open: true, contactId: item.id, durationDays: 30, registrationType: 'trial' })}>
                                Approve
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
              <section className="card">
                <h2>Approved Access Requests</h2>
                {!approvedContacts.length ? <p>No approved contacts yet.</p> : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Email</th><th>First Name</th><th>Last Name</th><th>Phone</th><th>Job Title</th><th>Updated</th></tr>
                      </thead>
                      <tbody>
                        {approvedContacts.map((item) => (
                          <tr key={`approved-${item.id}-${item.email}`}>
                            <td>{item.email}</td><td>{item.first_name}</td><td>{item.last_name}</td><td>{item.phone_number}</td><td>{item.job_title}</td><td>{item.updated_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
            <section className="card admin-registration-right">
              <h2>Create Contact</h2>
              <form className="auth-form" onSubmit={handleCreateContactFromAdmin}>
                <label>First Name<input type="text" value={createContactDraft.firstName} onChange={(e) => setCreateContactDraft((p) => ({ ...p, firstName: e.target.value }))} required /></label>
                <label>Last Name<input type="text" value={createContactDraft.lastName} onChange={(e) => setCreateContactDraft((p) => ({ ...p, lastName: e.target.value }))} required /></label>
                <label>Phone Number<input type="text" value={createContactDraft.phoneNumber} onChange={(e) => setCreateContactDraft((p) => ({ ...p, phoneNumber: e.target.value }))} required /></label>
                <label>Email<input type="email" value={createContactDraft.email} onChange={(e) => setCreateContactDraft((p) => ({ ...p, email: e.target.value }))} required /></label>
                <label>Job Title<input type="text" value={createContactDraft.jobTitle} onChange={(e) => setCreateContactDraft((p) => ({ ...p, jobTitle: e.target.value }))} /></label>
                <button type="submit" className="primary-button">Create Contact</button>
              </form>
            </section>
          </div>
        ) : null}
        {adminTab === 'manage_users' ? (
          <>
            <section className="card">
              <h2>Active Users</h2>
              {!activeUsers.length ? <p>No active users.</p> : (
                <div className="table-wrap"><table><thead><tr><th>ID</th><th>Email</th><th>Display Name</th><th>Status</th><th>Account Type</th><th>Trial Days</th><th>Trial Start</th><th>Action</th></tr></thead><tbody>
                  {activeUsers.map((userRow) => <tr key={`active-${userRow.id}`}><td>{userRow.id}</td><td>{userRow.email}</td><td>{userRow.display_name}</td><td>{userRow.status}</td><td>{userRow.account_type}</td><td>{userRow.trial_period_days}</td><td>{userRow.trial_start_at}</td><td><button type="button" className="header-text-link" onClick={() => setAdminUserEditModal({ open: true, user: { ...userRow } })}>Edit</button></td></tr>)}
                </tbody></table></div>
              )}
            </section>
            <section className="card">
              <h2>Inactive Users</h2>
              {!inactiveUsers.length ? <p>No inactive users.</p> : (
                <div className="table-wrap"><table><thead><tr><th>ID</th><th>Email</th><th>Display Name</th><th>Status</th><th>Account Type</th><th>Trial Days</th><th>Trial Start</th><th>Action</th></tr></thead><tbody>
                  {inactiveUsers.map((userRow) => <tr key={`inactive-${userRow.id}`}><td>{userRow.id}</td><td>{userRow.email}</td><td>{userRow.display_name}</td><td>{userRow.status}</td><td>{userRow.account_type}</td><td>{userRow.trial_period_days}</td><td>{userRow.trial_start_at}</td><td><button type="button" className="header-text-link" onClick={() => setAdminUserEditModal({ open: true, user: { ...userRow } })}>Edit</button></td></tr>)}
                </tbody></table></div>
              )}
            </section>

            <section className="card">
              <h2>Non-Activated Approved Users</h2>
              {!nonActivatedApprovedUsers.length ? <p>No non-activated approved users.</p> : (
                <div className="table-wrap"><table><thead><tr><th>Email</th><th>First Name</th><th>Last Name</th><th>Phone</th><th>Job Title</th><th>Approved</th><th>Days Since Approval</th></tr></thead><tbody>
                  {nonActivatedApprovedUsers.map((item) => <tr key={`non-activated-${item.id}-${item.email}`}><td>{item.email}</td><td>{item.first_name}</td><td>{item.last_name}</td><td>{item.phone_number}</td><td>{item.job_title}</td><td>{item.updated_at || item.created_at || ''}</td><td>{item.daysSinceApproval === null ? 'n/a' : item.daysSinceApproval}</td></tr>)}
                </tbody></table></div>
              )}
            </section>
          </>
        ) : null}
        {adminTab === 'getting_started' ? (
          <section className="card getting-started-admin-card">
            <h2>Getting Started Content</h2>
            <form className="auth-form getting-started-admin-form" onSubmit={handleSaveGettingStarted}>
              {adminGettingStartedDraft.map((item, index) => (
                <div className="field-group" key={`gs-${index}`}>
                  <label>
                    Subsection
                    <input
                      type="text"
                      value={item.subsection || ''}
                      onChange={(event) =>
                        setAdminGettingStartedDraft((prev) => prev.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, subsection: event.target.value } : row
                        )))
                      }
                      placeholder="e.g. A-Ideation Overview"
                    />
                  </label>
                  <label>
                    <span className="question-label-row">
                      <span>Question</span>
                      <span className="question-order-controls">
                        <button
                          type="button"
                          className="header-text-link"
                          onClick={() => moveGettingStartedItem(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move question ${index + 1} up`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="header-text-link"
                          onClick={() => moveGettingStartedItem(index, 1)}
                          disabled={index === adminGettingStartedDraft.length - 1}
                          aria-label={`Move question ${index + 1} down`}
                        >
                          ▼
                        </button>
                      </span>
                    </span>
                    <input
                      type="text"
                      value={item.question}
                      onChange={(event) =>
                        setAdminGettingStartedDraft((prev) => prev.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, question: event.target.value } : row
                        )))
                      }
                      placeholder="Enter question"
                    />
                  </label>
                  <label>
                    Answer
                    <textarea
                      rows={3}
                      value={item.answer}
                      onChange={(event) =>
                        setAdminGettingStartedDraft((prev) => prev.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, answer: event.target.value } : row
                        )))
                      }
                      placeholder="Enter answer"
                    />
                  </label>
                  {index < adminGettingStartedDraft.length - 1 ? <hr className="getting-started-item-divider" /> : null}
                </div>
              ))}
              <div className="auth-inline-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAdminGettingStartedDraft((prev) => [...prev, { subsection: 'Applications', question: '', answer: '' }])}
                >
                  Add Question
                </button>
                <button type="submit" className="primary-button">Save Getting Started</button>
              </div>
            </form>
          </section>
        ) : null}
        {adminTab === 'session' ? (
          <section className="card">
            <h2>Session</h2>
            <form className="auth-form" onSubmit={handleSessionCleanup}>
              <label>As-of Date<input type="date" value={sessionCleanupDate} onChange={(e) => setSessionCleanupDate(e.target.value)} required /></label>
              <button type="submit" className="primary-button">Delete Terminated Sessions</button>
            </form>
          </section>
        ) : null}
        {adminResultModal.open ? (
          <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Approval result">
            <section className="card auth-required-popup">
              <p>{adminResultModal.message}</p>
              <div className="auth-inline-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={async () => {
                    setAdminResultModal({ open: false, message: '' })
                    setPendingContactsLoading(true)
                    try {
                      await loadRegistrationContacts()
                    } finally {
                      setPendingContactsLoading(false)
                    }
                  }}
                >
                  Close
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {adminApproveModal.open ? (
          <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Approve access request">
            <section className="card auth-required-popup">
              <p>Enter duration (days):</p>
              <form
                className="auth-inline-form"
                onSubmit={async (event) => {
                  event.preventDefault()
                  const duration = Number(adminApproveModal.durationDays) || 30
                  const contactId = adminApproveModal.contactId
                  const registrationType = adminApproveModal.registrationType || 'trial'
                  await handleApproveContact(contactId, duration, registrationType)
                  setAdminApproveModal({ open: false, contactId: null, durationDays: 30, registrationType: 'trial' })
                }}
              >
                <input
                  type="number"
                  min={1}
                  value={adminApproveModal.durationDays}
                  onChange={(event) => setAdminApproveModal((prev) => ({ ...prev, durationDays: event.target.value }))}
                  required
                />
                <div className="auth-inline-row">
                  <label>
                    Registration Type
                    <select
                      value={adminApproveModal.registrationType}
                      onChange={(event) => setAdminApproveModal((prev) => ({ ...prev, registrationType: event.target.value }))}
                    >
                      <option value="trial">trial</option>
                      <option value="subscription">subscription</option>
                    </select>
                  </label>
                </div>
                <div className="auth-inline-row">
                  <button type="submit" className="primary-button">Approve</button>
                  <button type="button" className="secondary-button" onClick={() => setAdminApproveModal({ open: false, contactId: null, durationDays: 30, registrationType: 'trial' })}>
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
        {adminUserEditModal.open && adminUserEditModal.user ? (
          <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Edit user">
            <section className="card auth-required-popup">
              <h3>Edit User</h3>
              <form className="auth-form" onSubmit={async (event) => {
                event.preventDefault()
                await handleAdminUserUpdate(adminUserEditModal.user)
                setAdminUserEditModal({ open: false, user: null })
                await loadRegistrationUsers()
              }}>
                <label>Account Type
                  <select value={adminUserEditModal.user.account_type || 'subscription'} onChange={(e) => setAdminUserEditModal((p) => ({ ...p, user: { ...p.user, account_type: e.target.value } }))}>
                    <option value="trial">trial</option><option value="subscription">subscription</option>
                  </select>
                </label>
                <label>Status
                  <select value={adminUserEditModal.user.status || 'inactive'} onChange={(e) => setAdminUserEditModal((p) => ({ ...p, user: { ...p.user, status: e.target.value } }))}>
                    <option value="active">active</option><option value="inactive">inactive</option>
                  </select>
                </label>
                <label>Trial Duration
                  <input type="number" min={1} value={adminUserEditModal.user.trial_period_days || ''} onChange={(e) => setAdminUserEditModal((p) => ({ ...p, user: { ...p.user, trial_period_days: e.target.value } }))} />
                </label>
                <div className="auth-inline-row">
                  <button type="submit" className="primary-button">Update</button>
                  <button type="button" className="secondary-button" onClick={() => setAdminUserEditModal({ open: false, user: null })}>Cancel</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </PageShell>
    )
  }

  if (currentMode === MODES.DOC_DEFINE) {
    return (
      <PageShell
        mode={MODES.DOC_DEFINE}
        {...workflowShellProps}
        topLeftControls={renderBackToSuiteButton()}
        topRightControls={
          <>
            {renderUserIdentity()}
            {renderLogoutButton()}
            {renderSettingsControl()}
          </>
        }
      >
        {renderError()}
        <section className="card primary-upload-card">
          <div className="primary-upload-inner split">
            <div className="primary-upload-left">
              {isResunatorWorkflow ? (
                <>
                  <label className="panel-label">Submit Job Req</label>
                  <div className="field-group">
                    <div className="auth-inline-row">
                      {['file', 'url', 'text'].map((mode) => (
                        <label key={mode} className="checkbox-row">
                          <input
                            type="radio"
                            name="job_req_input_mode"
                            value={mode}
                            checked={jobReqInputMode === mode}
                            onChange={() => {
                              setJobReqInputMode(mode)
                              setJobReqUrlStatus('')
                            }}
                          />
                          {mode === 'file' ? 'Upload File' : mode === 'url' ? 'Use URL' : 'Paste Text'}
                        </label>
                      ))}
                    </div>
                    {jobReqInputMode === 'file' ? (
                      <div className="file-selector-row">
                        <input
                          name="job_description_document"
                          type="file"
                          accept=".pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(event) => setJobReqFile(event.target.files?.[0] || null)}
                        />
                      </div>
                    ) : null}
                    {jobReqInputMode === 'url' ? (
                      <div className="field-group">
                        <label>
                          Job Req URL
                          <input
                            type="url"
                            name="job_req_url"
                            value={jobReqUrl}
                            onChange={(event) => {
                              setJobReqUrl(event.target.value)
                              setAcceptedJobReqJson(null)
                              setJobReqUrlJson(null)
                            }}
                            placeholder="https://example.com/job-posting"
                          />
                        </label>
                        <div className="auth-inline-row">
                          <button type="button" className="secondary-button" disabled={isFetchingJobReqUrl} onClick={fetchJobReqUrl}>
                            {isFetchingJobReqUrl ? 'Fetching...' : 'Fetch Job Req'}
                          </button>
                          {jobReqUrlJson ? (
                            <>
                              <button type="button" className="primary-button" onClick={acceptJobReqUrlJson}>Accept</button>
                              <button type="button" className="secondary-button" onClick={rejectJobReqUrlJson}>Reject</button>
                            </>
                          ) : null}
                        </div>
                        {jobReqUrlStatus ? <p className="help-text">{jobReqUrlStatus}</p> : null}
                        {jobReqUrlJson ? (
                          <pre className="prompt-preview compact-prompt-preview">{JSON.stringify(jobReqUrlJson, null, 2)}</pre>
                        ) : null}
                      </div>
                    ) : null}
                    {jobReqInputMode === 'text' ? (
                      <label>
                        Job Req Text
                        <textarea
                          name="job_req_text"
                          value={jobReqText}
                          onChange={(event) => setJobReqText(event.target.value)}
                          rows={8}
                          placeholder="Paste the job description here."
                        />
                      </label>
                    ) : null}
                  </div>
                  <label className="panel-label">Submit Resume Versions</label>
                  <div className="field-group">
                    {resunatorResumeEntries.map((entry, index) => (
                      <div key={index} className="resunator-resume-entry">
                        <label className="panel-label">{resunatorResumeSourceLabel(index)}</label>
                        <div className="file-selector-row">
                          <input
                            name={resunatorResumeSourceLabel(index)}
                            type="file"
                            accept=".pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(event) => updateResunatorResumeEntry(index, { file: event.target.files?.[0] || null })}
                          />
                          {resunatorResumeEntries.length > 1 ? (
                            <button type="button" className="secondary-button" onClick={() => removeResunatorResumeEntry(index)}>
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <label>
                          Resume Context Description
                          <textarea
                            name={`${resunatorResumeSourceLabel(index)}_description`}
                            value={entry.description}
                            onChange={(event) => updateResunatorResumeEntry(index, { description: event.target.value })}
                            rows={3}
                            placeholder="Describe when this resume version should be used or what role/context it targets."
                          />
                        </label>
                      </div>
                    ))}
                    <button type="button" className="secondary-button" onClick={addResunatorResumeEntry}>
                      Add Resume Version
                    </button>
                    {hasResunatorResumeInput() ? (
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
              ) : isDeckMateWorkflow ? (
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
                    accept={isDoc2DeckWorkflow ? '.pdf' : '.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
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
                  (isResunatorWorkflow ? !hasResunatorResumeInput() : !docFile) ||
                  (isResunatorWorkflow && !hasResunatorJobReqInput()) ||
                  (isDeckMateWorkflow &&
                    (isCalculatingSlides || deckTotalSlidesInput < 1 || !slidesToReviewInput.trim()))
                }
                onClick={() => invokeOperation(OPERATIONS.CRITIQUE_PRIMARY)}
              >
                {isDoc2DeckWorkflow ? 'Create Presentation Outline' : isResunatorWorkflow ? 'Critique Resume' : `Critique ${contentNounTitle}`}
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
            {!isResunatorWorkflow ? (
              <label>
                {activeSettings.labels.defaultTopic}
                <textarea name="topic_main" value={topic} onChange={(event) => setTopicForActive(event.target.value)} rows={3} />
              </label>
            ) : null}
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
            <summary>{isResunatorWorkflow ? 'Supporting Documents' : `Supporting ${contentNounPlural}`}</summary>
            <div className="collapsible-panel-body field-group">
              <label>
                {isResunatorWorkflow ? 'Supporting Document' : `Supporting ${contentNounTitle}`}
                <input
                  name="supporting_document"
                  type="file"
                  onChange={(event) => setSupportingFile(event.target.files?.[0] || null)}
                />
              </label>
              <label>
                {isResunatorWorkflow ? 'Supporting Document Context' : `Supporting ${contentNounTitle} Context`}
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
        {renderRequestLogPanel()}
      </PageShell>
    )
  }

  if (currentMode === MODES.INVOKE) {
    return (
      <PageShell
        mode={MODES.INVOKE}
        {...workflowShellProps}
        topLeftControls={renderBackToSuiteButton()}
        topRightControls={
          <>
            {renderUserIdentity()}
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
        topLeftControls={renderBackToSuiteButton()}
        topRightControls={
          <>
            {renderUserIdentity()}
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
        {renderRequestLogPanel()}
      </PageShell>
    )
  }

  if (currentMode === MODES.CRITIQUE_REVIEW) {
    return (
      <PageShell
        mode={MODES.CRITIQUE_REVIEW}
        {...workflowShellProps}
        topLeftControls={renderBackToSuiteButton()}
        topRightControls={
          <>
            {renderUserIdentity()}
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
            ) : isDoc2DeckWorkflow && doc2DeckCritiqueSections.length ? (
              <>
                <div
                  className={doc2DeckCritiqueSections.length > 10 ? 'settings-tabs slide-tabs-scrollable' : 'settings-tabs'}
                  role="tablist"
                  aria-label="Critique slide tabs"
                >
                  <button
                    type="button"
                    className={selectedDoc2DeckSlideTab === 'all' ? 'settings-tab active' : 'settings-tab'}
                    onClick={() => setSelectedDoc2DeckSlideTab('all')}
                  >
                    All
                  </button>
                  {doc2DeckCritiqueSections.map((section) => (
                    <button
                      key={section.slideNumber}
                      type="button"
                      className={selectedDoc2DeckSlideTab === section.slideNumber ? 'settings-tab active' : 'settings-tab'}
                      onClick={() => setSelectedDoc2DeckSlideTab(section.slideNumber)}
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
                      (selectedDoc2DeckSlideTab === 'all'
                        ? critiqueMarkdown
                        : doc2DeckCritiqueSections.find((section) => section.slideNumber === selectedDoc2DeckSlideTab)?.content) ||
                      critiqueMarkdown
                    }
                    readOnly
                    rows={REVIEW_TEXTAREA_ROWS}
                  />
                </label>
              </>
            ) : (
              <>
                {critiqueResponseFormat === 'json' && parsedCritiqueJson ? (
                  <section className="field-group">
                    <div className="auth-inline-row">
                      <label>Severity
                        <select value={critiqueSeverityFilter} onChange={(event) => setCritiqueSeverityFilter(event.target.value)}>
                          <option value="all">All</option>
                          <option value="major">Major</option>
                          <option value="minor">Minor</option>
                        </select>
                      </label>
                      <label>Category
                        <select value={critiqueCategoryFilter} onChange={(event) => setCritiqueCategoryFilter(event.target.value)}>
                          <option value="all">All</option>
                          {critiqueCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="doc2deck-slide-grid">
                      {visibleCritiqueIssues.map((issue, index) => (
                        <div key={issue.id}>
                          <article className="doc2deck-slide-card">
                          <h4>{issue.id} · {issue.category} · {issue.severity}</h4>
                          <p><strong>Justification:</strong> {issue.justification}</p>
                          <p><strong>Recommended:</strong> {issue.recommended_change}</p>
                          {issue.suggested_rewrite ? <p><strong>Rewrite:</strong> {issue.suggested_rewrite}</p> : null}
                          <p><strong>Confidence:</strong> {issue.confidence_notes}</p>
                          </article>
                          {index < visibleCritiqueIssues.length - 1 ? <hr className="getting-started-item-divider" /> : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                <label className="panel-field">
                  <span className="panel-label">Critique Content</span>
                  <textarea
                    className="critique-editor"
                    value={critiqueMarkdown}
                    onChange={(event) => setCritiqueMarkdown(event.target.value)}
                    rows={REVIEW_TEXTAREA_ROWS}
                  />
                </label>
              </>
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
              ) : isDoc2DeckWorkflow ? (
                <>
                  <label>
                    Slides (Change IDs)
                    <select
                      multiple
                      value={selectedDoc2DeckSlides}
                      onChange={(event) =>
                        setSelectedDoc2DeckSlides(
                          [...event.target.selectedOptions].map((option) => option.value)
                        )
                      }
                      size={5}
                    >
                      {doc2DeckCritiqueSections.map((section) => (
                        <option key={section.slideNumber} value={`slide-${section.slideNumber}`}>
                          {`Slide ${section.slideNumber} (slide-${section.slideNumber})`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={addDoc2DeckSlideSelectionsAsChangeItems}>
                    Add Selected Slides as Change Items
                  </button>
                </>
              ) : (
                <>
                  <label>
                    Issue selections
                    <select
                      multiple
                      value={selectedDocIssueOptions}
                      onChange={(event) =>
                        setSelectedDocIssueOptions(
                          [...event.target.selectedOptions].map((option) => option.value)
                        )
                      }
                      size={5}
                    >
                      {visibleCritiqueIssues.map((issue) => (
                        <option key={issue.id} value={issue.id}>
                          {`${issue.id} · ${issue.category} · ${issue.severity}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={addDocIssueSelectionsAsChangeItems}>
                    Add Selected Issues as Change Items
                  </button>
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

            {isResunatorWorkflow ? (
              <div className="change-item-list-card">
                <div className="change-item-list-header">
                  <span>Additional Resume Context</span>
                  <span>{selectedResunatorContextResumeSources.length}</span>
                </div>
                <div className="change-item-list">
                  {activeResunatorResumeEntries().length ? (
                    activeResunatorResumeEntries().map((entry) => {
                      const source = resunatorResumeSourceLabel(entry.index)
                      return (
                        <label key={source} className="resunator-context-choice">
                          <input
                            type="checkbox"
                            checked={selectedResunatorContextResumeSources.includes(source)}
                            onChange={() => toggleResunatorContextResume(source)}
                          />
                          <span>
                            <strong>{source}</strong> — {entry.file?.name || 'No file selected'}
                            {(entry.description || '').trim() ? ` (${(entry.description || '').trim()})` : ''}
                          </span>
                        </label>
                      )
                    })
                  ) : (
                    <p className="muted">No submitted resume versions are available.</p>
                  )}
                </div>
              </div>
            ) : null}
          </aside>
        </section>

        {viewPromptEnabled && showPromptPanel ? (
          <section className="card prompt-preview-card">
            <h2>Prompt Preview</h2>
            <pre>{promptPreviewText}</pre>
          </section>
        ) : null}
        {renderRequestLogPanel()}
      </PageShell>
    )
  }

  return (
    <PageShell
      mode={MODES.VIEW_CHANGED}
      {...workflowShellProps}
      topLeftControls={renderBackToSuiteButton()}
      topRightControls={
        <>
          {renderUserIdentity()}
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

      {isResunatorWorkflow ? (
        <section className="card field-group compact-panel">
          <div className="action-row wrap-actions center-actions">
            <button type="button" className="secondary-button" onClick={saveResunatorResumeAsPdf}>
              Save Resume as PDF
            </button>
          </div>
          <label>
            Refinement Instruction
            <textarea
              className="compact-textarea"
              value={resunatorRefinementInstruction}
              onChange={(event) => setResunatorRefinementInstruction(event.target.value)}
              rows={3}
              placeholder="Describe how the generated resume should be refined."
            />
          </label>
          <div className="action-row wrap-actions center-actions">
            <button
              type="button"
              onClick={refineResunatorResume}
              disabled={!resunatorRefinementInstruction.trim() || !changedDocumentMarkdown.trim()}
            >
              Refine Resume
            </button>
          </div>
        </section>
      ) : null}

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
        ) : isDoc2DeckWorkflow && changedDoc2DeckSections.length ? (
          <>
            <div
              className={changedDoc2DeckSections.length > 10 ? 'settings-tabs slide-tabs-scrollable' : 'settings-tabs'}
              role="tablist"
              aria-label="Changed content slide tabs"
            >
              <button
                type="button"
                className={selectedChangedDoc2DeckSlideTab === 'all' ? 'settings-tab active' : 'settings-tab'}
                onClick={() => setSelectedChangedDoc2DeckSlideTab('all')}
              >
                All
              </button>
              {changedDoc2DeckSections.map((section) => (
                <button
                  key={section.slideNumber}
                  type="button"
                  className={selectedChangedDoc2DeckSlideTab === section.slideNumber ? 'settings-tab active' : 'settings-tab'}
                  onClick={() => setSelectedChangedDoc2DeckSlideTab(section.slideNumber)}
                >
                  {`Slide ${section.slideNumber}`}
                </button>
              ))}
            </div>
            <label>
              {`Changed ${contentNoun} content`}
              <textarea
                value={
                  (selectedChangedDoc2DeckSlideTab === 'all'
                    ? changedDoc2DeckDisplayText
                    : changedDoc2DeckSections.find((section) => section.slideNumber === selectedChangedDoc2DeckSlideTab)?.content) ||
                  changedDoc2DeckDisplayText
                }
                onChange={(event) => {
                  if (selectedChangedDoc2DeckSlideTab === 'all' && !doc2DeckPptxOutputMode && !changedDoc2DeckJsonSections.length) {
                    setChangedDocumentMarkdown(event.target.value)
                  }
                }}
                readOnly={selectedChangedDoc2DeckSlideTab !== 'all' || doc2DeckPptxOutputMode || changedDoc2DeckJsonSections.length > 0}
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
      {renderRequestLogPanel()}
    </PageShell>
  )
}

  async function buildApplyChangeItemsPromptPreviewText() {
    const requestPayload = buildApplyChangeItemsRequest()
    const promptFileEntries = isResunatorWorkflow
      ? {
          ...buildSelectedResunatorResumeContextFileEntries(),
          supporting_document: supportingFile,
          [RESUNATOR_FILE_SOURCES.JOB_DESCRIPTION]: jobReqInputMode === 'file' ? jobReqFile : null
        }
      : {
          original_document: docFile,
          supporting_document: supportingFile,
          job_description_document: jobReqFile
        }
    requestPayload.messages = await maybeBypassFileMessages(requestPayload.messages, promptFileEntries)

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
