export const DOC2DECK_SETTINGS = {
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
  labels: {
    defaultTopic: 'Default Topic',
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    changeItemInstruction: 'Change Item Instruction',
    applyChangesAntiGuidance: 'Apply Changes Anti Guidance',
    applyChangeItemsGuidance: 'Apply_Change_Items_Guidance'
  },
  settingsPanelLabels: {
    apiMode: 'API Mode',
    llmModel: 'LLM Model',
    defaultTopic: 'Default Topic',
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    changeItemInstruction: 'Change Item Instruction',
    applyChangesAntiGuidance: 'Apply Changes Anti Guidance',
    applyChangeItemsGuidance: 'Apply_Change_Items_Guidance',
    ignoreOcrErrors: 'Ignore obvious OCR misspellings',
    disableResponseLogging: 'Disable response logging',
    viewPrompt: 'View Prompt',
    bypassFileInput: 'Bypass_File_Input',
    deleteFileOnLlm: 'Delete_File_On_LLM',
    logPanelEnabled: 'Log_Panel_Enabled',
    chunkingEnabled: 'Enable slide chunking',
    chunkSize: 'Slides per chunk',
    chunkConcurrency: 'Parallel chunk requests'
  },
  settingsPanelOrder: [
    'apiMode',
    'llmModel',
    'defaultTopic',
    'reviewObjective',
    'formattingGuidance',
    'antiGuidance',
    'changeItemInstruction',
    'applyChangesAntiGuidance',
    'applyChangeItemsGuidance',
    'ignoreOcrErrors',
    'disableResponseLogging',
    'viewPrompt',
    'bypassFileInput',
    'deleteFileOnLlm',
    'logPanelEnabled',
    'chunkingEnabled',
    'chunkSize',
    'chunkConcurrency'
  ],
  defaults: {
    topic: 'This is a professional document intended for conversion into a presentation outline.',
    reviewObjective:
      'Based on the document provided, create an outline plan for a powerpoint type presentation. Assume the presenter is a knowledgeable professional on the subject matter and that the audience has the background to understand the original document’s meaning. The outline plan should list each slide and its purpose within the presentation but don’t generate the slide content, just the outline plan.',
    formattingGuidance:
      'Your response should be partitioned by Slide number, e.g., Slide-1, Slide-2, etc. with the purpose of each slide stated clearly. If there are any items to consider or to clarify these should be listed after the purpose for each slide.',
    antiGuidance:
      'Do not add new ideas into the outline plan. Your job is to reflect only what is in the document.',
    changeItemInstruction: 'create item as stated',
    applyChangesAntiGuidance:
      'You are creating the actual presentation this user will deliver. Do not add comments or meta-statements or other forms of guidance.',
    applyChangeItemsGuidance: ''
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
