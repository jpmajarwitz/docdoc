import { useMemo, useState } from 'react'
import OpenAI from 'openai'

const defaults = {
  topic: 'This is a professional journal article in the <XXX> profession covering <YYY>',
  objective:
    'Proofread the document for consistency in tone, scope, and level of detail. Consider the document to be a refined draft that is complete in scope and intent. Suggest improvements only where necessary.',
  guidance:
    'Your response should be in Markdown format. Provide a section of major changes needed and a section of minor changes needed. Use enumerations for each change recommended, e.g., major-1, major-2,... minor-1, minor-2....',
  antiGuidance:
    'Do not add new ideas into the document. Your job is to sharpen up what is already being communicated'
}

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [docFile, setDocFile] = useState(null)
  const [supportingFile, setSupportingFile] = useState(null)
  const [priorResponseFile, setPriorResponseFile] = useState(null)
  const [topic, setTopic] = useState(defaults.topic)
  const [objective, setObjective] = useState(defaults.objective)
  const [guidance, setGuidance] = useState(defaults.guidance)
  const [antiGuidance, setAntiGuidance] = useState(defaults.antiGuidance)
  const [critiqueMarkdown, setCritiqueMarkdown] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const client = useMemo(() => {
    if (!apiKey) return null
    return new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  }, [apiKey])

  async function uploadIfPresent(file) {
    if (!file) return null
    return client.files.create({ file, purpose: 'user_data' })
  }

  async function handleCritique() {
    if (!client) {
      setStatus('Enter an OpenAI API key first.')
      return
    }
    if (!docFile) {
      setStatus('Upload the primary document before running critique.')
      return
    }

    setLoading(true)
    setStatus('Uploading files and invoking model...')

    try {
      const content = []
      const primary = await uploadIfPresent(docFile)
      content.push({
        type: 'input_text',
        text: `Primary document to critique. Topic: ${topic} Objective: ${objective} Guidance: ${guidance} Anti-Guidance: ${antiGuidance}`
      })
      content.push({ type: 'input_file', file_id: primary.id })

      const supporting = await uploadIfPresent(supportingFile)
      if (supporting) {
        content.push({ type: 'input_text', text: 'Supporting document included for context.' })
        content.push({ type: 'input_file', file_id: supporting.id })
      }

      const prior = await uploadIfPresent(priorResponseFile)
      if (prior) {
        content.push({ type: 'input_text', text: 'Prior response included for context.' })
        content.push({ type: 'input_file', file_id: prior.id })
      }

      const response = await client.responses.create({
        model: 'gpt-5-mini',
        input: [
          { role: 'system', content: 'You are a highly skilled assistant to an experienced professional in the field indicated.' },
          { role: 'user', content }
        ]
      })

      setCritiqueMarkdown(response.output_text || 'No output text returned.')
      setStatus('Critique generated successfully.')
    } catch (error) {
      setStatus(`Failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="layout">
      <h1>The Document Doctor: <span>A Professional Review and Critique Tool</span></h1>
      <p className="notice">Browser-resident React version (client-side OpenAI call).</p>

      <section className="card">
        <h2>Setup</h2>
        <label>
          OpenAI API Key
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </label>
      </section>

      <section className="card grid">
        <h2>Document Definition</h2>
        <label>Primary Document (PDF, DOCX, TXT, MD)
          <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
        </label>
        <label>Supporting Document
          <input type="file" onChange={(e) => setSupportingFile(e.target.files?.[0] || null)} />
        </label>
        <label>Prior Response Document
          <input type="file" onChange={(e) => setPriorResponseFile(e.target.files?.[0] || null)} />
        </label>
        <label>Topic
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} />
        </label>
        <label>Review Objective
          <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={4} />
        </label>
        <label>Formatting Guidance
          <textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} rows={4} />
        </label>
        <label>Anti-Guidance
          <textarea value={antiGuidance} onChange={(e) => setAntiGuidance(e.target.value)} rows={3} />
        </label>
        <button disabled={loading} onClick={handleCritique}>{loading ? 'Running...' : 'Critique Primary Document'}</button>
        <p>{status}</p>
      </section>

      <section className="card">
        <h2>Critique Output (Markdown)</h2>
        <textarea value={critiqueMarkdown} onChange={(e) => setCritiqueMarkdown(e.target.value)} rows={20} />
      </section>
    </main>
  )
}
