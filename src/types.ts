import { ChatCompletionMessageParam } from "openai/resources/chat";

export type Tool = {
  function: (input: any) => Promise<object> | object;
  description: string;
  input: object;
};

export type StepOutput = {
  step: string;
  content?: string;
  function?: string | null;
  input?: object | null;
  status?: boolean;
};

export type ExampleStep = {
  step: string;
  content: string;
  function?: string | null;
  input?: object | null;
};

export type Example = {
  UserQuery: string;
  Output: ExampleStep[];
};

export type LynkStep = {
  name: string;
  purpose: string;
};

export type LynkConfig = {
  userSystemPrompt?: string;
  tools?: Record<string, Tool>;
  steps?: LynkStep[];
  model: string;
  url: string;
  apiKey: string;
  examples?: Example[];
  history?: ChatCompletionMessageParam[];
  temperature?: number | null | undefined;
  maxTokens?: number | null | undefined;
};
