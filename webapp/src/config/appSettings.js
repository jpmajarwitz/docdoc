export const APP_SETTINGS = {
  llmModels: [
    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
    { value: 'gpt-5', label: 'gpt-5' },
    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' }
  ],
  defaultModel: 'gpt-5-mini',
  ocrGuidanceText:
    'Ignore any OCR errors related to the mis-spelling of words that seems obvious. Do not report back these types of errors. For example: Objec@ive instead of Objective.'
}
