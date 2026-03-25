import { useState } from 'react'
import logo from './assets/docdoc-logo.svg'

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
  [OPERATIONS.CRITIQUE_PRIMARY]: `${API_BASE_URL}/api/critique`,
  [OPERATIONS.APPLY_CHANGE_ITEMS]: `${API_BASE_URL}/api/apply-change-items`,
  [OPERATIONS.CRITIQUE_CHANGED]: `${API_BASE_URL}/api/critique-changed-document`
}

const defaults = {
  topic: 'This is a professional journal article in the <XXX> profession covering <YYY>',
  objective:
    'Proofread the document for consistency in tone, scope, and level of detail. Consider the document to be a refined draft that is complete in scope and intent. Suggest improvements only where necessary.',
  guidance:
    'Your response should be in Markdown format. Provide a section of major changes needed and a section of minor changes needed. Use enumerations for each change recommended, e.g., major-1, major-2,... minor-1, minor-2....',
  antiGuidance:
    'Do not add new ideas into the document. Your job is to sharpen up what is already being communicated',
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

function PageShell({ mode, children }) {
  return (
    <main className="layout">
      <header className="hero card">
        <div className="hero-corner hero-left">
          <img className="brand-logo" src={logo} alt="Cartoon paper doctor logo" />
        </div>
        <div className="hero-title-group">
          <h1>The Document Doctor</h1>
          <p className="hero-subtitle">A Professional Review and Critique Tool</p>
        </div>
        <div className="hero-corner hero-right">
          <div className="mode-pill">{MODE_LABELS[mode] || mode}</div>
        </div>
      </header>
      {children}
    </main>
  )
}

function normalizeRequestError(error) {
  if (error instanceof TypeError) {
    return 'Unable to reach the backend proxy. Start `uvicorn backend_main:app --reload --port 8000`, or set `VITE_API_BASE_URL` if the backend is running elsewhere.'
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
    candidates.push(seed, `${base}/`, `${base}/index.php`)
  })

  return [...new Set(candidates)]
}

async function fetchWithEndpointFallback(endpoint, init) {
  const candidates = endpointCandidates(endpoint)
  let lastResponse = null

  for (const candidate of candidates) {
    const response = await fetch(candidate, init)
    if (response.status !== 404) {
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
    throw new Error(
      maybeHtml
        ? `Backend returned HTML instead of JSON (status ${response.status}). Verify VITE_API_BASE_URL points to your backend API and uses HTTPS when the site is served over HTTPS.`
        : `Backend returned non-JSON response (status ${response.status}).`
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
    body: formData
  })

  const data = await readBackendJson(response)
  if (!response.ok) {
    throw new Error(data.detail || 'Backend request failed.')
  }

  return data.outputText
}

async function postJson(endpoint, payload) {
  const response = await fetchWithEndpointFallback(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const data = await readBackendJson(response)
  if (!response.ok) {
    throw new Error(data.detail || 'Backend request failed.')
  }

  return data.outputText
}

export default function App() {
  const [currentMode, setCurrentMode] = useState(MODES.DOC_DEFINE)
  const [docFile, setDocFile] = useState(null)
  const [supportingFile, setSupportingFile] = useState(null)
  const [priorResponseFile, setPriorResponseFile] = useState(null)
  const [topic, setTopic] = useState(defaults.topic)
  const [objective, setObjective] = useState(defaults.objective)
  const [guidance, setGuidance] = useState(defaults.guidance)
  const [antiGuidance, setAntiGuidance] = useState(defaults.antiGuidance)
  const [supportInstructions, setSupportInstructions] = useState(defaults.supportInstructions)
  const [priorInstructions, setPriorInstructions] = useState(defaults.priorInstructions)
  const [critiqueMarkdown, setCritiqueMarkdown] = useState('')
  const [changedDocumentMarkdown, setChangedDocumentMarkdown] = useState('')
  const [status, setStatus] = useState('Ready for document definition.')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastOperation, setLastOperation] = useState(null)
  const [changeItems, setChangeItems] = useState([])
  const [changeItemDraft, setChangeItemDraft] = useState(emptyChangeDraft())

  function buildLlmRequest(messages) {
    return {
      model: 'gpt-5-mini',
      systemPrompt: 'You are a highly skilled assistant to an experienced professional in the field indicated.',
      messages
    }
  }

  function buildPrimaryCritiqueRequest() {
    const messages = [
      {
        type: 'input_text',
        text: `Primary document to critique. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${antiGuidance}`
      },
      { type: 'input_file', source: 'primary_document' }
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
        text: `Prior response document included for context. Instructions: ${priorInstructions || 'None provided.'}`
      })
      messages.push({ type: 'input_file', source: 'prior_response_document' })
    }

    return buildLlmRequest(messages)
  }

  function buildApplyChangeItemsRequest() {
    return buildLlmRequest([
      {
        type: 'input_text',
        text: `Main Instruction: Apply all requested change items directly to the original document and return the changed document in markdown. Anti-Guidance: ${antiGuidance}`
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
        text: 'Original document:'
      },
      { type: 'input_file', source: 'original_document' }
    ])
  }

  function buildChangedDocCritiqueRequest() {
    return buildLlmRequest([
      {
        type: 'input_text',
        text: `Critique the included changed document using the original review configuration. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${antiGuidance}`
      },
      {
        type: 'input_text',
        text: `Changed document body:\n${changedDocumentMarkdown}`
      }
    ])
  }

  async function invokeOperation(operation) {
    if (!docFile) {
      setError('Upload the primary document before invoking the model.')
      setCurrentMode(MODES.DOC_DEFINE)
      return
    }

    if (operation === OPERATIONS.APPLY_CHANGE_ITEMS && !changeItems.length) {
      setError('Create at least one change item before applying changes.')
      setCurrentMode(MODES.CRITIQUE_REVIEW)
      return
    }

    if (operation === OPERATIONS.CRITIQUE_CHANGED && !changedDocumentMarkdown.trim()) {
      setError('There is no changed document to critique yet.')
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
      const outputText =
        operation === OPERATIONS.CRITIQUE_PRIMARY
          ? await postMultipart(API_ENDPOINTS[operation], buildPrimaryCritiqueRequest(), {
              primary_document: docFile,
              supporting_document: supportingFile,
              prior_response_document: priorResponseFile
            })
          : operation === OPERATIONS.APPLY_CHANGE_ITEMS
            ? await postMultipart(API_ENDPOINTS[operation], buildApplyChangeItemsRequest(), {
                original_document: docFile
              })
            : await postJson(API_ENDPOINTS[operation], buildChangedDocCritiqueRequest())

      if (operation === OPERATIONS.APPLY_CHANGE_ITEMS) {
        setChangedDocumentMarkdown(outputText)
        setStatus('Applying change items completed successfully.')
      } else {
        setCritiqueMarkdown(outputText)
        setStatus(
          operation === OPERATIONS.CRITIQUE_CHANGED
            ? 'Changed-document critique completed successfully.'
            : 'Primary document critique completed successfully.'
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
    setError('')
    setStatus('Ready for document definition.')
  }

  function renderError() {
    if (!error) {
      return null
    }

    return <div className="error-banner">{error}</div>
  }

  if (currentMode === MODES.DOC_DEFINE) {
    return (
      <PageShell mode={MODES.DOC_DEFINE}>
        {renderError()}

        <section className="card primary-upload-card">
          <div className="primary-upload-inner">
            <h2>Select primary document</h2>
            <input type="file" onChange={(event) => setDocFile(event.target.files?.[0] || null)} />
          </div>
        </section>

        <section className="card grid two-column-grid">
          <div className="field-group">
            <h2>Primary document definition</h2>
            <label>
              Topic
              <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} />
            </label>
            <label>
              Review Objective
              <textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} />
            </label>
          </div>

          <div className="field-group">
            <h2>Response guidance</h2>
            <label>
              Formatting Guidance
              <textarea value={guidance} onChange={(event) => setGuidance(event.target.value)} rows={3} />
            </label>
            <label>
              Anti-Guidance
              <textarea value={antiGuidance} onChange={(event) => setAntiGuidance(event.target.value)} rows={3} />
            </label>
          </div>

          <details className="collapsible-panel">
            <summary>Supporting documents</summary>
            <div className="collapsible-panel-body field-group">
              <label>
                Supporting Document
                <input
                  type="file"
                  onChange={(event) => setSupportingFile(event.target.files?.[0] || null)}
                />
              </label>
              <label>
                Supporting Document Context
                <textarea
                  value={supportInstructions}
                  onChange={(event) => setSupportInstructions(event.target.value)}
                  rows={4}
                />
              </label>
            </div>
          </details>

          <details className="collapsible-panel">
            <summary>Prior response</summary>
            <div className="collapsible-panel-body field-group">
              <label>
                Prior Response Document
                <input
                  type="file"
                  onChange={(event) => setPriorResponseFile(event.target.files?.[0] || null)}
                />
              </label>
              <label>
                Prior Response Context
                <textarea
                  value={priorInstructions}
                  onChange={(event) => setPriorInstructions(event.target.value)}
                  rows={4}
                />
              </label>
            </div>
          </details>
        </section>

        <section className="card action-panel right-aligned">
          <button type="button" onClick={() => invokeOperation(OPERATIONS.CRITIQUE_PRIMARY)}>
            Critique Primary Document
          </button>
        </section>
      </PageShell>
    )
  }

  if (currentMode === MODES.INVOKE) {
    return (
      <PageShell mode={MODES.INVOKE}>
        <section className="card invoke-card compact-panel">
          <div className="spinner" aria-hidden="true" />
          <h2>Invoking the model</h2>
        </section>
      </PageShell>
    )
  }

  if (currentMode === MODES.RESULT_SAVED) {
    return (
      <PageShell mode={MODES.RESULT_SAVED}>
        <section className="card result-card compact-panel">
          <h2>Result saved</h2>
          {renderError()}
          <div className="action-row wrap-actions center-actions">
            {lastOperation === OPERATIONS.APPLY_CHANGE_ITEMS ? (
              <button type="button" onClick={() => setCurrentMode(MODES.VIEW_CHANGED)}>
                View Changed Document
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
      <PageShell mode={MODES.CRITIQUE_REVIEW}>
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
              <p className="muted">Capture concise edits, then apply them to the document.</p>
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
    <PageShell mode={MODES.VIEW_CHANGED}>
      <section className="card action-row wrap-actions center-actions compact-panel">
        <button type="button" className="secondary-button" onClick={resetToDefinitionMode}>
          Exit Review
        </button>
        <button type="button" onClick={() => invokeOperation(OPERATIONS.CRITIQUE_CHANGED)}>
          Critique Changed Document
        </button>
      </section>

      {renderError()}

      <section className="card field-group tall-document-panel">
        <label>
          Changed document content
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
