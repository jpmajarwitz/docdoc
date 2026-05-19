export const APP_SETTINGS = {
  llmModels: [
    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
    { value: 'gpt-5.4-nano', label: 'gpt-5.4-nano' },
    { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'gpt-5.4', label: 'gpt-5.4' }
  ],
  apiModes: [
    { value: 'responses', label: 'responses' },
    { value: 'chat', label: 'chat' }
  ],
  defaultApiMode: 'responses',
  defaultModel: 'gpt-5-mini',
  critiqueResponseFormats: [
    { value: 'json', label: 'JSON (Default)' },
    { value: 'markdown', label: 'Markdown (Legacy)' }
  ],
  defaultCritiqueResponseFormat: 'json',
  labels: {
    defaultTopic: 'Default Topic',
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    changeItemInstruction: 'Change Item Instruction'
  },
  settingsPanelLabels: {
    apiMode: 'API Mode',
    llmModel: 'LLM Model',
    critiqueResponseFormat: 'Critique Response Format',
    defaultTopic: 'Default Topic',
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    changeItemInstruction: 'Change Item Instruction',
    ignoreOcrErrors: 'Ignore obvious OCR misspellings',
    disableResponseLogging: 'Disable response logging',
    viewPrompt: 'View Prompt',
    bypassFileInput: 'Bypass_File_Input',
    deleteFileOnLlm: 'Delete File on AI Platform',
    logPanelEnabled: 'Log Panel Enabled',
    chunkingEnabled: 'Enable slide chunking',
    deckTotalSlides: 'Total slides in deck',
    chunkSize: 'Slides per chunk',
    chunkConcurrency: 'Parallel chunk requests'
  },
  settingsPanelOrder: [
    'apiMode',
    'llmModel',
    'critiqueResponseFormat',
    'defaultTopic',
    'reviewObjective',
    'formattingGuidance',
    'antiGuidance',
    'changeItemInstruction',
    'ignoreOcrErrors',
    'disableResponseLogging',
    'viewPrompt',
    'bypassFileInput',
    'deleteFileOnLlm',
    'logPanelEnabled',
    'chunkingEnabled',
    'deckTotalSlides',
    'chunkSize',
    'chunkConcurrency'
  ],
  defaults: {
    topic: 'This is a professional journal article in the <XXX> profession covering <YYY>',
    reviewObjective:
      'Proofread the document for consistency in tone, scope, and level of detail. Consider the document to be a refined draft that is complete in scope and intent. Suggest improvements only where necessary.',
    formattingGuidance:
      'Your response should be in Markdown format. Provide a section of major changes needed and a section of minor changes needed. Use enumerations for each change recommended, e.g., major-1, major-2,... minor-1, minor-2....',
    antiGuidance:
      'Do not add new ideas into the document. Your job is to sharpen up what is already being communicated',
    changeItemInstruction: 'create item as stated'
  },
  ocrGuidanceText:
    'Ignore any OCR errors related to the mis-spelling of words that seems obvious. Do not report back these types of errors. For example: Objec@ive instead of Objective.',
  disableResponseLoggingDefault: true,
  viewPromptDefault: false,
  bypassFileInputDefault: false,
  deleteFileOnLlmDefault: true,
  logPanelEnabledDefault: false,
  chunkingEnabledDefault: false,
  chunkSizeDefault: 6,
  chunkConcurrencyDefault: 2
}
