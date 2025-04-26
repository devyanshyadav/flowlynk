import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat";
import { LynkConfig, StepOutput } from "./types";
import systemMessage from "./system-prompt";

const createLynk = (config: LynkConfig) => {
  const {
    tools,
    model,
    url,
    apiKey,
    temperature = null,
    maxTokens = null,
    history = [],
  } = config;

  const openai = new OpenAI({
    apiKey: apiKey || "",
    ...(url ? { baseURL: url } : {}),
  });
  let messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemMessage(config) },
    ...history,
  ];
  let steps: StepOutput[] = [];

  // Helper function to create error steps
  const createErrorStep = (message: string): StepOutput => ({
    step: "error",
    content: message,
    status: false,
    function: null,
    input: null,
  });

  // Helper function to create output steps
  const createOutputStep = (content: string): StepOutput => ({
    step: "output",
    content,
    function: null,
    input: null,
  });

  const generateContent = async (): Promise<StepOutput> => {
    try {
      if (!apiKey) {
        throw new Error("API key is required");
      }
      const response = await openai.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return createErrorStep("No response content received from API");
      }

      return parseModelOutput(content);
    } catch (error) {
      const stringifyData = JSON.stringify(error);
      const statusCode = parseInt(stringifyData.match(/\d+/)?.[0] || "500");
      return createErrorStep(
        `API error: ${((error as Error).message &&
          `${(error as Error).message
          }, For more info visit https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/${statusCode}`) ||
        "Unknown API error"
        }`
      );
    }
  };

  const parseModelOutput = (content: string): StepOutput => {
    try {
      const cleaned = content.replace(/^```json\s*|\s*```$/gm, "").trim();
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch (error) {
      return createErrorStep(
        `JSON parsing error: ${(error as Error).message || "Invalid response format"
        }`
      );
    }
  };

  const executeTool = async (
    functionName: string,
    input: object
  ) => {
    if (!tools) {
      return createErrorStep("No tools provided");
    }
    const tool = tools[functionName];
    if (!tool) {
      return createErrorStep(`Tool not found: ${functionName}`);
    }

    const toolResult = await tool.function(input);
    return toolResult;
  };

  const handleError = (
    errorStep: StepOutput
  ): { result: string; steps: StepOutput[] } => {
    messages.push({ role: "assistant", content: JSON.stringify(errorStep) });
    const outputStep = createOutputStep(
      errorStep.content || "An error occurred"
    );
    steps.push(outputStep);
    return { result: outputStep.content || "An error occurred", steps };
  };

  const run = async (
    query: string,
    onStep?: (step: StepOutput) => Promise<void> | void
  ): Promise<{ result: string; steps: StepOutput[] }> => {
    steps = [];
    messages.push({ role: "user", content: query });

    while (true) {
      const parsedData = await generateContent();
      steps.push(parsedData);

      if (onStep) {
        await onStep(parsedData);
      }

      if (parsedData.step === "error") {
        return handleError(parsedData);
      }

      messages.push({ role: "assistant", content: JSON.stringify(parsedData) });

      switch (parsedData.step) {
        case "action":
          if (!parsedData.function || !parsedData.input) {
            const errorStep = createErrorStep(
              "Invalid action step: Missing function or input fields"
            );
            steps.push(errorStep);
            return handleError(errorStep);
          }

          const toolResult = await executeTool(
            parsedData.function,
            parsedData.input
          );
          messages.push({
            role: "user",
            content: `{step: "observe", content: ${JSON.stringify(
              toolResult
            )}}`,
          });
          break;

        case "output":
          return {
            result: parsedData.content || "No response provided",
            steps,
          };

        default:
          messages.push({ role: "user", content: "Proceed with the next step" });
          break;
      }
    }
  };

  const reset = () => {
    messages = [{ role: "system", content: systemMessage(config) }];
    steps = [];
  };

  return {
    run,
    reset,
    getSteps: () => [...steps],
    messageLogs: () => [...messages.slice(1)],
  };
};

export default createLynk;
