import { create } from "zustand";
import type { RecordingStep } from "../types/shared";

interface RecorderState {
  isRecording: boolean;
  sessionId: string;
  steps: RecordingStep[];
  setRecording: (v: boolean) => void;
  addStep: (step: RecordingStep) => void;
  clearSteps: () => void;
  setSessionId: (id: string) => void;
}

const generateSessionId = () => `session_${Date.now()}`;

export const useRecorderStore = create<RecorderState>((set, get) => ({
  isRecording: false,
  sessionId: generateSessionId(),
  steps: [],

  setRecording: (v: boolean) => {
    if (v) {
      // Reset session when starting fresh
      set({ isRecording: true, steps: [], sessionId: generateSessionId() });
    } else {
      set({ isRecording: false });
    }
  },

  addStep: (step: RecordingStep) => {
    set((state) => ({ steps: [...state.steps, step] }));
  },

  clearSteps: () => {
    set({ steps: [] });
  },

  setSessionId: (id: string) => {
    set({ sessionId: id });
  },
}));
