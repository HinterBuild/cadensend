export type CustomVoice = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export type CustomGoal = {
  id: string;
  label: string;
  text: string;
};

export type ContentPreferences = {
  custom_voices: CustomVoice[];
  custom_goals: CustomGoal[];
};

export const EMPTY_CONTENT_PREFERENCES: ContentPreferences = {
  custom_voices: [],
  custom_goals: [],
};
