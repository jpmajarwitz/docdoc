import { APP_SETTINGS } from './appSettings'

export const ZOOM_ZILLA_SETTINGS = {
  ...APP_SETTINGS,
  labels: {
    ...APP_SETTINGS.labels,
    reviewObjective: 'Review Objective',
    antiGuidance: 'Anti-Guidance'
  },
  settingsPanelLabels: {
    ...APP_SETTINGS.settingsPanelLabels,
    reviewObjective: 'Review Objective',
    antiGuidance: 'Anti-Guidance',
    chunkingEnabled: 'File Chunking',
    chunkSize: 'Chunk Size'
  },
  settingsPanelOrder: [
    ...APP_SETTINGS.settingsPanelOrder.filter((key) => !['defaultTopic', 'formattingGuidance'].includes(key))
  ],
  defaults: {
    ...APP_SETTINGS.defaults,
    topic: '',
    reviewObjective: "Review the attached vtt and resume files from an online meeting and provide an integrated json file with the information contained in the files. You can edit the content to fix typo’s, stammering, etc.",
    antiGuidance: 'Do not modify content if you are unsure of its meaning'
  },
  systemPrompt: 'You are a highly skilled advisor to an experienced professional reviewing meeting transcripts.',
  chunkingEnabledDefault: true,
  chunkSizeDefault: 40,
  openAiTimeoutSecondsDefault: 300
}
