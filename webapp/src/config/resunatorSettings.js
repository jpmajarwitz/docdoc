import { APP_SETTINGS } from './appSettings'

export const RESUNATOR_SETTINGS = {
  ...APP_SETTINGS,
  labels: {
    ...APP_SETTINGS.labels,
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    changeItemInstruction: 'Change Item Instruction'
  },
  settingsPanelLabels: {
    ...APP_SETTINGS.settingsPanelLabels,
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    changeItemInstruction: 'Change Item Instruction'
  },
  settingsPanelOrder: APP_SETTINGS.settingsPanelOrder.filter((key) => key !== 'defaultTopic'),
  defaults: {
    ...APP_SETTINGS.defaults,
    topic: '',
    reviewObjective: 'Review the attached resume and provide recommendations to best meet the attached job description.',
    antiGuidance: 'Do not embellish the resume with unsubstantiated claims or experiences. Your job is to present the actual experiences and skills of the applicant in the best possible way for the job description provided.'
  },
  systemPrompt: 'You are a highly skilled advisor to an experienced professional seeking a new job.'
}
