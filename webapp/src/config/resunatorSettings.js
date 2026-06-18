import { APP_SETTINGS } from './appSettings'

export const RESUNATOR_SETTINGS = {
  ...APP_SETTINGS,
  labels: {
    ...APP_SETTINGS.labels,
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    changeItemInstruction: 'Change Item Instruction',
    applyChangeItemsGuidance: 'Apply Changes Instruction'
  },
  settingsPanelLabels: {
    ...APP_SETTINGS.settingsPanelLabels,
    reviewObjective: 'Review Objective',
    formattingGuidance: 'Formatting Guidance',
    antiGuidance: 'Anti-Guidance',
    changeItemInstruction: 'Change Item Instruction',
    applyChangeItemsGuidance: 'Apply Changes Instruction'
  },
  settingsPanelOrder: [
    ...APP_SETTINGS.settingsPanelOrder.filter((key) => key !== 'defaultTopic'),
    'applyChangeItemsGuidance'
  ],
  defaults: {
    ...APP_SETTINGS.defaults,
    topic: '',
    reviewObjective: 'Review the attached resumes and provide a listing of resume entries you recommend to includer to best meet the attached job description.  I have intentionally included multiple resumes that overlap and are based on different points in my career. I want to create a single resume that uses the most relevant information from the set of resumes being provided to you.',
    formattingGuidance: 'Follow the json structure provided.',
    applyChangeItemsGuidance: 'Create a new resume that is curated for the job description by applying all the change items.',
    antiGuidance: 'Do not embellish the resume with unsubstantiated claims or experiences. Your job is to present the actual experiences and skills of the applicant in the best possible way for the job description provided. You may provide re-wording to align to the job description.'
  },
  systemPrompt: 'You are a highly skilled advisor to an experienced professional seeking a new job.'
}
