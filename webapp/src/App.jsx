import { useEffect, useRef, useState } from 'react'
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

async function fetchWithEndpointFallback(endpoint, init) {
  const candidates = endpointCandidates(endpoint)
  let lastResponse = null

  for (const candidate of candidates) {
    const response = await fetch(candidate, init)
    const isRedirect = [301, 302, 307, 308].includes(response.status)
    const retryableGatewayStatus = [502, 503, 504].includes(response.status)
    const redirectTarget = response.headers.get('location') || ''
    const insecureRedirect =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      redirectTarget.startsWith('http://')

    if (response.status !== 404 && !retryableGatewayStatus && !(isRedirect && insecureRedirect)) {
      return response
    }

    lastResponse = response
  }

  return lastResponse
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
    body: formData,
    credentials: 'include'
  })

  const data = await readBackendJson(response)
  if (!response.ok) {
    throw new Error(data.detail || 'Backend request failed.')
  }

  return data
}

async function postJson(endpoint, payload) {
  const response = await fetchWithEndpointFallback(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    credentials: 'include'
  })

  const data = await readBackendJson(response)
  if (!response.ok) {
    throw new Error(data.detail || 'Backend request failed.')
  }

  return data
}

async function getJson(endpoint) {
  const response = await fetchWithEndpointFallback(endpoint, {
    method: 'GET',
    credentials: 'include'
  })

  const data = await readBackendJson(response)
  if (!response.ok) {
    throw new Error(data.detail || 'Backend request failed.')
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
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const [promptPreviewText, setPromptPreviewText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsDropdownRef = useRef(null)
  const [docTopic, setDocTopic] = useState(APP_SETTINGS.defaults.topic)
  const [docObjective, setDocObjective] = useState(APP_SETTINGS.defaults.reviewObjective)
  const [docGuidance, setDocGuidance] = useState(APP_SETTINGS.defaults.formattingGuidance)
  const [docAntiGuidance, setDocAntiGuidance] = useState(APP_SETTINGS.defaults.antiGuidance)
  const [deckTopic, setDeckTopic] = useState(DECK_MATE_SETTINGS.defaults.topic)
  const [deckObjective, setDeckObjective] = useState(DECK_MATE_SETTINGS.defaults.reviewObjective)
  const [deckGuidance, setDeckGuidance] = useState(DECK_MATE_SETTINGS.defaults.formattingGuidance)
  const [deckAntiGuidance, setDeckAntiGuidance] = useState(DECK_MATE_SETTINGS.defaults.antiGuidance)
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
      } else {
        setAuthUser(null)
      }
    } catch (sessionError) {
      setAuthUser(null)
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

  function buildApplyChangeItemsRequest() {
    return buildLlmRequest([
      {
        type: 'input_text',
        text: `Main Instruction: Apply all requested change items directly to the original ${contentNoun} and return the changed ${contentNoun} in markdown. Anti-Guidance: ${buildAntiGuidancePrompt()}`
      },
      {
        type: 'input_text',
        text: `Change Items:\n${formatChangeItems(changeItems)}`
      },
      {
        type: 'input_text',
        text: `Original critique:\n${critiqueMarkdown}`
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

    setLoading(true)
    setError('')
    setCurrentMode(MODES.INVOKE)
    setLastOperation(operation)
    setStatus(`Invoking ${operationLabels[operation]} via the backend proxy...`)

    await new Promise((resolve) => window.setTimeout(resolve, 0))

    try {
      const llmData =
        operation === OPERATIONS.CRITIQUE_PRIMARY
          ? await (async () => {
              const requestPayload = buildPrimaryCritiqueRequest()
              const directFileEntries = {
                primary_document: docFile,
                supporting_document: supportingFile,
                prior_response_document: priorResponseFile
              }
              const requestPayloadBypassed = {
                ...requestPayload,
                messages: await maybeBypassFileMessages(requestPayload.messages, directFileEntries)
              }

              try {
                return await postMultipart(
                  API_ENDPOINTS[operation],
                  requestPayloadBypassed,
                  bypassFileInput ? {} : directFileEntries
                )
              } catch (primaryError) {
                if (!bypassFileInput || !isRetryableGatewayError(primaryError)) {
                  throw primaryError
                }

                setStatus('Gateway timeout detected. Retrying request...')
                return postMultipart(
                  API_ENDPOINTS[operation],
                  requestPayloadBypassed,
                  bypassFileInput ? {} : directFileEntries
                )
              }
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

                try {
                  return await postMultipart(
                    API_ENDPOINTS[operation],
                    requestPayloadBypassed,
                    bypassFileInput ? {} : directFileEntries
                  )
                } catch (applyError) {
                  if (!bypassFileInput || !isRetryableGatewayError(applyError)) {
                    throw applyError
                  }

                  setStatus('Gateway timeout detected. Retrying request...')
                  return postMultipart(
                    API_ENDPOINTS[operation],
                    requestPayloadBypassed,
                    bypassFileInput ? {} : directFileEntries
                  )
                }
              })()
            : await postJson(API_ENDPOINTS[operation], buildChangedDocCritiqueRequest())

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

  function resetToDefinitionMode() {
    setCurrentMode(MODES.DOC_DEFINE)
    setDocFile(null)
    setError('')
    setStatus(`Ready for ${contentNoun} definition.`)
  }

  function renderBackToSuiteButton() {
    return (
      <button
        type="button"
        className="secondary-button"
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
      <button type="button" className="secondary-button" onClick={handleLogout}>
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

  useEffect(() => {
    loadSession()
  }, [])

  useEffect(() => {
    if (isDeckMateWorkflow && bypassFileInput) {
      setBypassFileInput(false)
    }
  }, [isDeckMateWorkflow, bypassFileInput])

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
          ⚙ Settings
        </button>
        {settingsOpen ? (
          <div id="settings-panel" className="gear-settings-panel field-group">
            <button type="button" className="settings-close" onClick={() => setSettingsOpen(false)}>
              Close
            </button>
            {settingsPanelOrder.map((settingKey) => renderSettingsField(settingKey))}
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

        <section className="card primary-upload-card">
          <div className="primary-upload-inner split">
            <div className="primary-upload-left">
              <h2>{`Select primary ${contentNoun}`}</h2>
              <div className="file-selector-row">
                <input
                  name="primary_document"
                  type="file"
                  onChange={(event) => setDocFile(event.target.files?.[0] || null)}
                />
                {docFile ? (
                  <label className="output-file-field">
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
            </div>
            <div className="primary-upload-actions">
              <button type="button" disabled={!docFile} onClick={() => invokeOperation(OPERATIONS.CRITIQUE_PRIMARY)}>
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
            <label className="panel-field">
              <span className="panel-label">Critique Content</span>
              <textarea
                className="critique-editor"
                value={critiqueMarkdown}
                onChange={(event) => setCritiqueMarkdown(event.target.value)}
                rows={REVIEW_TEXTAREA_ROWS}
              />
            </label>
          </div>

          <aside className="side-panel change-composer">
            <div className="side-panel-header">
              <h3>Create change items</h3>
              <p className="muted">{`Capture concise edits, then apply them to the ${contentNoun}.`}</p>
            </div>

            <div className="change-composer-card">
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
                      <h4>{item.id}</h4>
                      <p>{item.instruction}</p>
                    </article>
                  ))
                ) : (
                  <p className="muted">No entries saved yet.</p>
                )}
              </div>
            </div>
          </aside>
        </section>
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

      <section className="card field-group tall-document-panel">
        <label>
          {`Changed ${contentNoun} content`}
          <textarea
            value={changedDocumentMarkdown}
            onChange={(event) => setChangedDocumentMarkdown(event.target.value)}
            rows={REVIEW_TEXTAREA_ROWS}
          />
        </label>
      </section>
    </PageShell>
  )
}
