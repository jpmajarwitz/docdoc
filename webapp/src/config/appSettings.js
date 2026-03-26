export const APP_SETTINGS = {
  llmModels: [
    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
    { value: 'gpt-5', label: 'gpt-5' },
    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' }
  ],
  defaultModel: 'gpt-5-mini',
  labels: {
    defaultTopic: 'Default Topic',
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance'
  },
  defaults: {
    topic: 'This is a professional journal article in the <XXX> profession covering <YYY>',
    reviewObjective:
      'Proofread the document for consistency in tone, scope, and level of detail. Consider the document to be a refined draft that is complete in scope and intent. Suggest improvements only where necessary.',
    formattingGuidance:
      'Your response should be in Markdown format. Provide a section of major changes needed and a section of minor changes needed. Use enumerations for each change recommended, e.g., major-1, major-2,... minor-1, minor-2....',
    antiGuidance:
      'Do not add new ideas into the document. Your job is to sharpen up what is already being communicated'
  },
  ocrGuidanceText:
    'Ignore any OCR errors related to the mis-spelling of words that seems obvious. Do not report back these types of errors. For example: Objec@ive instead of Objective.'
}
