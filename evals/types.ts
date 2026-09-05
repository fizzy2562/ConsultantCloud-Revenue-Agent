export type EvalResult = {
  passed: boolean;
  skipped?: boolean;
  notes: string;
};

export type EvalScenario = {
  id: string;
  name: string;
  input: string;
  run: () => Promise<EvalResult>;
};
