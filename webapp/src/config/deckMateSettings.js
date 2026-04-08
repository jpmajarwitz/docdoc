export const DECK_MATE_SETTINGS = {
  llmModels: [
    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
    { value: 'gpt-5', label: 'gpt-5' },
    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' }
  ],
  apiModes: [
    { value: 'responses', label: 'responses' },
    { value: 'chat', label: 'chat' }
  ],
  defaultApiMode: 'responses',
  defaultModel: 'gpt-5-mini',
  labels: {
    defaultTopic: 'Default Topic',
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance'
  },
  settingsPanelLabels: {
    apiMode: 'API Mode',
    llmModel: 'LLM Model',
    defaultTopic: 'Default Topic',
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    ignoreOcrErrors: 'Ignore obvious OCR misspellings',
    disableResponseLogging: 'Disable response logging',
    viewPrompt: 'View Prompt',
    deleteFileOnLlm: 'Delete_File_On_LLM'
  },
  settingsPanelOrder: [
    'apiMode',
    'llmModel',
    'defaultTopic',
    'reviewObjective',
    'formattingGuidance',
    'antiGuidance',
    'ignoreOcrErrors',
    'disableResponseLogging',
    'viewPrompt',
    'deleteFileOnLlm'
  ],
  defaults: {
    topic: 'This is a professional presentation covering <XXX>.',
    reviewObjective:
      'Proofread the presentation for consistency in tone, scope, and level of detail. Consider the presentation to be a refined draft that is complete in scope and intent. Suggest improvements only where necessary.',
    formattingGuidance:
      'Your response should be in Markdown format. Provide your output critique on a slide by slide basis with enumerated issues per slide, e.g., slide-1, issue-1, issue-2 … slide-2, issue1, issue2 …',
    antiGuidance:
      'Do not add new ideas into the presentation. Your job is to sharpen up what is already being communicated.'
  },
  ocrGuidanceText:
    'Ignore any OCR errors related to the mis-spelling of words that seems obvious. Do not report back these types of errors. For example: Objec@ive instead of Objective.',
  disableResponseLoggingDefault: true,
  viewPromptDefault: false,
  bypassFileInputDefault: false,
  deleteFileOnLlmDefault: true
}
