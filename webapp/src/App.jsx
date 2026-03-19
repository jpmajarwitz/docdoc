import { useMemo, useState } from 'react'
import OpenAI from 'openai'

const MODES = {
  DOC_DEFINE: 'doc_define_mode',
  INVOKE: 'invoke_model_mode',
  RESULT_SAVED: 'llm_result_saved_mode',
  CRITIQUE_REVIEW: 'critique_review_mode',
  VIEW_CHANGED: 'view_changed_document_mode'
}

const OPERATIONS = {
  CRITIQUE_PRIMARY: 'critique_primary_document',
  APPLY_CHANGE_ITEMS: 'apply_change_items',
  CRITIQUE_CHANGED: 'critique_changed_document'
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

function emptyChangeDraft() {
  return {
    id: '',
    instruction: 'make the change as recommended'
  }
}

function extractOutputText(response) {
  if (response?.output_text) {
    return response.output_text
  }

  const output = response?.output ?? []
  return output
    .flatMap((item) => item.content ?? [])
    .map((contentItem) => contentItem.text ?? '')
    .join('\n')
    .trim()
}

function formatChangeItems(changeItems) {
  if (!changeItems.length) {
    return 'No change items were supplied.'
  }

  return changeItems
    .map((item) => `- ${item.id}: ${item.instruction}`)
    .join('\n')
}

function PageShell({ mode, children }) {
  return (
    <main className="layout">
      <header className="hero card">
        <div>
          <p className="eyebrow">Mode-driven browser app</p>
          <h1>
            The Document Doctor: <span>A Professional Review and Critique Tool</span>
          </h1>
        </div>
        <div className="mode-pill">{mode}</div>
      </header>
      {children}
    </main>
  )
}

export default function App() {
  const [currentMode, setCurrentMode] = useState(MODES.DOC_DEFINE)
  const [apiKey, setApiKey] = useState('')
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
  const [uploadedFileIds, setUploadedFileIds] = useState({
    primary: null,
    supporting: null,
    prior: null
  })

  const client = useMemo(() => {
    if (!apiKey) {
      return null
    }

    return new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  }, [apiKey])

  async function ensureUploadedFiles(activeClient) {
    const nextIds = { ...uploadedFileIds }

    if (docFile && !nextIds.primary) {
      const primary = await activeClient.files.create({ file: docFile, purpose: 'user_data' })
      nextIds.primary = primary.id
    }

    if (supportingFile && !nextIds.supporting) {
      const supporting = await activeClient.files.create({ file: supportingFile, purpose: 'user_data' })
      nextIds.supporting = supporting.id
    }

    if (priorResponseFile && !nextIds.prior) {
      const prior = await activeClient.files.create({ file: priorResponseFile, purpose: 'user_data' })
      nextIds.prior = prior.id
    }

    setUploadedFileIds(nextIds)
    return nextIds
  }

  function buildPrimaryCritiqueInput(fileIds) {
    const content = [
      {
        type: 'input_text',
        text: `Primary document to critique. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${antiGuidance}`
      },
      { type: 'input_file', file_id: fileIds.primary }
    ]

    if (fileIds.supporting) {
      content.push({
        type: 'input_text',
        text: `Supporting document included for context. Instructions: ${supportInstructions || 'None provided.'}`
      })
      content.push({ type: 'input_file', file_id: fileIds.supporting })
    }

    if (fileIds.prior) {
      content.push({
        type: 'input_text',
        text: `Prior response document included for context. Instructions: ${priorInstructions || 'None provided.'}`
      })
      content.push({ type: 'input_file', file_id: fileIds.prior })
    }

    return content
  }

  function buildApplyChangeItemsInput(fileIds) {
    return [
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
      { type: 'input_file', file_id: fileIds.primary }
    ]
  }

  function buildChangedDocCritiqueInput() {
    return [
      {
        type: 'input_text',
        text: `Critique the included changed document using the original review configuration. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${antiGuidance}`
      },
      {
        type: 'input_text',
        text: `Changed document body:\n${changedDocumentMarkdown}`
      }
    ]
  }

  async function invokeOperation(operation) {
    if (!client) {
      setError('Enter an OpenAI API key before invoking the model.')
      setCurrentMode(MODES.DOC_DEFINE)
      return
    }

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
    setStatus(`Invoking ${operationLabels[operation]}...`)

    await new Promise((resolve) => window.setTimeout(resolve, 0))

    try {
      const fileIds = await ensureUploadedFiles(client)
      const input =
        operation === OPERATIONS.CRITIQUE_PRIMARY
          ? buildPrimaryCritiqueInput(fileIds)
          : operation === OPERATIONS.APPLY_CHANGE_ITEMS
            ? buildApplyChangeItemsInput(fileIds)
            : buildChangedDocCritiqueInput()

      const response = await client.responses.create({
        model: 'gpt-5-mini',
        input: [
          {
            role: 'system',
            content: 'You are a highly skilled assistant to an experienced professional in the field indicated.'
          },
          { role: 'user', content: input }
        ]
      })

      const outputText = extractOutputText(response) || 'No output text returned.'

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
      setError(`Invocation failed: ${invocationError.message}`)
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
        <section className="card split-card">
          <div>
            <h2>OpenAI setup</h2>
            <label>
              OpenAI API Key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-..."
              />
            </label>
          </div>
          <div>
            <h2>Mode entry criteria</h2>
            <ul className="bullet-list">
              <li>Enter the API key.</li>
              <li>Choose the primary document.</li>
              <li>Review or edit the critique instructions.</li>
              <li>Press the critique button to transition to <code>invoke_model_mode</code>.</li>
            </ul>
          </div>
        </section>

        {renderError()}

        <section className="card grid two-column-grid">
          <div className="field-group">
            <h2>Primary document definition</h2>
            <label>
              Primary Document
              <input type="file" onChange={(event) => setDocFile(event.target.files?.[0] || null)} />
            </label>
            <label>
              Topic
              <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} />
            </label>
            <label>
              Review Objective
              <textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={5} />
            </label>
          </div>

          <div className="field-group">
            <h2>Response guidance</h2>
            <label>
              Formatting Guidance
              <textarea value={guidance} onChange={(event) => setGuidance(event.target.value)} rows={4} />
            </label>
            <label>
              Anti-Guidance
              <textarea value={antiGuidance} onChange={(event) => setAntiGuidance(event.target.value)} rows={4} />
            </label>
          </div>

          <div className="field-group">
            <h2>Supporting document</h2>
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

          <div className="field-group">
            <h2>Prior response</h2>
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
        </section>

        <section className="card action-row">
          <div>
            <strong>Status:</strong> {status}
          </div>
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
        <section className="card invoke-card">
          <div className="spinner" aria-hidden="true" />
          <h2>Invoking the model</h2>
          <p>
            <strong>Current operation:</strong> {operationLabels[lastOperation]}
          </p>
          <p>{loading ? 'Uploading any required files and waiting for the model response...' : status}</p>
        </section>
      </PageShell>
    )
  }

  if (currentMode === MODES.RESULT_SAVED) {
    const resultMessage =
      lastOperation === OPERATIONS.APPLY_CHANGE_ITEMS
        ? 'Applying change items completed. The changed document is ready to view.'
        : 'Critique completed and saved in browser state.'

    return (
      <PageShell mode={MODES.RESULT_SAVED}>
        <section className="card result-card">
          <h2>Result saved</h2>
          {renderError()}
          <p>{resultMessage}</p>
          <div className="action-row wrap-actions">
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
        <section className="card split-card">
          <div>
            <h2>Critique review</h2>
          </div>
          <div className="action-row wrap-actions right-aligned">
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
          </div>
        </section>

        {renderError()}

        <section className="card review-grid">
          <div className="field-group">
            <h3>Critique content</h3>
            <textarea value={critiqueMarkdown} onChange={(event) => setCritiqueMarkdown(event.target.value)} rows={24} />
          </div>

          <div className="field-group side-panel">
            <h3>Create change items</h3>
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
                value={changeItemDraft.instruction}
                onChange={(event) =>
                  setChangeItemDraft((draft) => ({ ...draft, instruction: event.target.value }))
                }
                rows={4}
              />
            </label>
            <button type="button" onClick={addChangeItem}>
              Create Change Item
            </button>

            <div className="change-item-list">
              <div className="change-item-list-header">
                <span>Change Items</span>
                <span>{changeItems.length}</span>
              </div>
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
        </section>
      </PageShell>
    )
  }

  return (
    <PageShell mode={MODES.VIEW_CHANGED}>
      <section className="card split-card">
        <div>
          <h2>Changed document</h2>
        </div>
        <div className="action-row wrap-actions right-aligned">
          <button type="button" className="secondary-button" onClick={resetToDefinitionMode}>
            Exit Review
          </button>
          <button type="button" onClick={() => invokeOperation(OPERATIONS.CRITIQUE_CHANGED)}>
            Critique Changed Document
          </button>
        </div>
      </section>

      {renderError()}

      <section className="card field-group">
        <label>
          Changed document content
          <textarea
            value={changedDocumentMarkdown}
            onChange={(event) => setChangedDocumentMarkdown(event.target.value)}
            rows={24}
          />
        </label>
      </section>
    </PageShell>
  )
}
