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
  } = config;

  if (!apiKey) {
    return {
      run: async () => ({
        result: "API key is required",
        steps: [
          {
            step: "error",
            content: "API key is required",
            status: false,
            function: null,
            input: null,
          },
        ],
      }),
      reset: () => {},
      getSteps: () => [
        {
          step: "error",
          content: "API key is required",
          status: false,
          function: null,
          input: null,
        },
      ],
      messageLogs: () => [],
    };
  }

  const openai = new OpenAI({
    apiKey,
    ...(url ? { baseURL: url } : {}),
  });

  let messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemMessage(config) },
    ...(config.history || []),
  ];
  let steps: StepOutput[] = [];

  const generateContent = async (): Promise<StepOutput> => {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature: temperature,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return {
          step: "error",
          content: "No response content received from API",
          status: false,
          function: null,
          input: null,
        };
      }
      return parseModelOutput(content);
    } catch (error) {
      return {
        step: "error",
        content: `API error: ${
          (error as Error).message || "Unknown API error"
        }`,
        status: false,
        function: null,
        input: null,
      };
    }
  };

  const parseModelOutput = (content: string): StepOutput => {
    try {
      const cleaned = content.replace(/^```json\s*|\s*```$/gm, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.function && parsed.input && parsed.step !== "action") {
        return {
          step: "error",
          content:
            "Invalid step name: Tool/function calls must use 'action' step",
          status: false,
          function: null,
          input: null,
        };
      }
      return parsed;
    } catch (error) {
      return {
        step: "error",
        content: `JSON parsing error: ${
          (error as Error).message || "Invalid response format"
        }`,
        status: false,
        function: null,
        input: null,
      };
    }
  };

  const executeTool = async (
    functionName: string,
    input: object
  ): Promise<StepOutput> => {
    try {
      const tool = tools[functionName];
      if (!tool) {
        return {
          step: "error",
          content: `Tool not found: ${functionName}`,
          status: false,
          function: null,
          input: null,
        };
      }
      await tool.function(input);
      return {
        step: "action",
        content: `Successfully executed tool ${functionName}`,
        function: functionName,
        input,
        status: true,
      };
    } catch (error) {
      return {
        step: "error",
        content: `Tool execution error: ${functionName} failed - ${
          (error as Error).message || "Unknown tool error"
        }`,
        status: false,
        function: null,
        input: null,
      };
    }
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
        messages.push({
          role: "assistant",
          content: JSON.stringify(parsedData),
        });
        const errorStep = {
          step: "output",
          content: parsedData.content || "An error occurred",
          function: null,
          input: null,
        };
        steps.push(errorStep);
        return { result: errorStep.content, steps };
      }

      messages.push({ role: "assistant", content: JSON.stringify(parsedData) });

      switch (parsedData.step) {
        case "action":
          if (parsedData.function && parsedData.input) {
            const toolResult = await executeTool(
              parsedData.function,
              parsedData.input
            );
            steps.push(toolResult);
            if (toolResult.step === "error") {
              messages.push({
                role: "assistant",
                content: JSON.stringify(toolResult),
              });
              const errorStep = {
                step: "output",
                content: toolResult.content || "Tool execution failed",
                function: null,
                input: null,
              };
              steps.push(errorStep);
              return { result: errorStep.content, steps };
            }
            messages.push({
              role: "user",
              content: `{step: "observe", content: ${JSON.stringify(
                toolResult
              )}}`,
            });
          } else {
            const errorStep = {
              step: "error",
              content: "Invalid action step: Missing function or input fields",
              status: false,
              function: null,
              input: null,
            };
            steps.push(errorStep);
            messages.push({
              role: "assistant",
              content: JSON.stringify(errorStep),
            });
            const outputStep = {
              step: "output",
              content: errorStep.content,
              function: null,
              input: null,
            };
            steps.push(outputStep);
            return { result: outputStep.content, steps };
          }
          break;
        case "demand":
          const demandStep = {
            step: "output",
            content: parsedData.content || "Tool required but not available",
            function: null,
            input: null,
          };
          steps.push(demandStep);
          return { result: demandStep.content, steps };
        case "output":
          const finalResult = parsedData.content || "No response provided";
          return { result: finalResult, steps };
        default:
          messages.push({ role: "user", content: "proceed with next step" });
          break;
      }
    }
  };

  const reset = () => {
    messages = [{ role: "system", content: systemMessage(config) }];
    steps = [];
  };

  const getSteps = () => [...steps];
  return { run, reset, getSteps, messageLogs: () => [...messages.slice(1)] };
};

export default createLynk;
