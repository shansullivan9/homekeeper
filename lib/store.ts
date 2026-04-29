import { create } from 'zustand';
import { Profile, Home, Task, Category, Appliance, TaskHistory, HomeMember, Document } from './types';

interface AppState {
  user: Profile | null;
  home: Home | null;
  members: HomeMember[];
  tasks: Task[];
  categories: Category[];
  appliances: Appliance[];
  history: TaskHistory[];
  documents: Document[];
  /**
   * Lower-cased suggestion titles the user has dismissed for this home.
   * The dashboard's SuggestionBanner uses this to keep dismissed
   * items hidden even after generate_suggestions re-inserts them.
   */
  dismissedSuggestions: string[];
  loading: boolean;
  setUser: (user: Profile | null) => void;
  setHome: (home: Home | null) => void;
  setMembers: (members: HomeMember[]) => void;
  setTasks: (tasks: Task[]) => void;
  setCategories: (categories: Category[]) => void;
  setAppliances: (appliances: Appliance[]) => void;
  setHistory: (history: TaskHistory[]) => void;
  setDocuments: (documents: Document[]) => void;
  setDismissedSuggestions: (titles: string[]) => void;
  setLoading: (loading: boolean) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  removeTask: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  home: null,
  members: [],
  tasks: [],
  categories: [],
  appliances: [],
  history: [],
  documents: [],
  dismissedSuggestions: [],
  loading: true,
  setUser: (user) => set({ user }),
  setHome: (home) => set({ home }),
  setMembers: (members) => set({ members }),
  setTasks: (tasks) => set({ tasks }),
  setCategories: (categories) => set({ categories }),
  setAppliances: (appliances) => set({ appliances }),
  setHistory: (history) => set({ history }),
  setDocuments: (documents) => set({ documents }),
  setDismissedSuggestions: (titles) => set({ dismissedSuggestions: titles }),
  setLoading: (loading) => set({ loading }),
  addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
  updateTask: (task) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? task : t)) })),
  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
}));
