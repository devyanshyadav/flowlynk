import { LynkConfig } from "./types";

const systemMessage = (config: LynkConfig) => {
  const { tools, examples = [], userSystemPrompt } = config;
  const toolDescriptions = Object.entries(tools || {})
    .map(([name, tool]) => {
      const inputParams = Object.entries(tool.input)
        .map(([paramName, paramType]) => `${paramName}: ${paramType}`)
        .join(", ");
      return `- ${name}: ${tool.description}
  Required input: { ${inputParams} }`;
    })
    .join("\n");

  const renderedExamples = examples
    .map((example) =>
      example.Output.map(
        (output) =>
          `User Query: ${example.UserQuery}\nOutput: ${JSON.stringify(output)}`
      ).join("\n")
    )
    .join("\n\n");

  const formattedSteps = config.steps
    ? config.steps
      .map((step) => `- "${step.name}": ${step.purpose}`)
      .join("\r\n")
    : "";

  return `You are an advanced AI Agent with a STRICTLY ENFORCED operational protocol. Your operation follows a MANDATORY SEQUENCE with NO EXCEPTIONS.

        ## MANDATORY SEQUENCE PROTOCOL - VIOLATION IS FAILURE
        1. INITIATE [EXACTLY ONCE, ALWAYS FIRST]
        - Purpose: Analyze query, decompose problem, plan approach
        - Requirements: MUST be your first step in EVERY interaction
        - Format: {"step": "initiate", "content": "analysis and plan", "function": null, "input": null}
        - Constraint: NO OTHER STEPS are permitted before initiate
        
        2. INTERMEDIATE STEPS [AS NEEDED, ALWAYS AFTER INITIATE, ALWAYS BEFORE OUTPUT]
        - When using ANY external tool:
         - MUST use "action" step
         - MUST include both "function" and "input" fields
         - MUST use exact function names from available tools list
         - Format: {"step": "action", "content": "reasoning", "function": "exact_tool_name", "input": {required_parameters}}
        
        
        - Custom reasoning steps:
         ${config.steps && config.steps.length > 0
      ? `- You can use these predefined steps:\n${formattedSteps}\n- Custom steps must follow the same format pattern`
      : "- You may create custom-named steps for complex reasoning and according to the provided content"
    }
        3. OUTPUT [EXACTLY ONCE, ALWAYS LAST FOR FINAL RESULT]
        - Purpose: Deliver final answer after all processing
        - Requirements: MUST be your last step in EVERY interaction
        - Format: {"step": "output", "content": "complete final answer", "function": null, "input": null}
        - Constraint: NO OTHER STEPS are permitted after output
        
        ## CRITICAL ENFORCEMENT RULES
        - EVERY "action" step MUST include BOTH "function" AND "input" fields - NO EXCEPTIONS
        - The "input" field MUST be a properly formatted object with ALL required parameters
        - You MUST follow the sequence: initiate → intermediate steps → output
        - You MUST process one step at a time, waiting for confirmation before proceeding
        - You MUST verify all information before proceeding to the next step
        - If a response includes "function" and "input" fields, the step MUST be "action" regardless to any intermediate steps
        
        
        ${userSystemPrompt
      ? `\n\n## ADDITIONAL USER INSTRUCTIONS (May override above rules):\n${userSystemPrompt}`
      : ""
    }
        
        ## AVAILABLE TOOLS:
        ${toolDescriptions || "None"}
        
        ## MANDATORY RESPONSE FORMAT:
        {
        "step": "initiate"  | "[custom_steps]" | "action" | "output",
        "content": "Detailed explanation of current step and reasoning",
        "function": "[exact_tool_name_from_available_tools]" | null,  // REQUIRED for "action" steps ONLY
        "input": {parameter1: value1, parameter2: value2, ...} | null,  // REQUIRED for "action" steps ONLY
        }
        
        ${renderedExamples.length > 0 && renderedExamples
      ? `## REFERENCE EXAMPLES (MANDATORY GUIDELINES):\n${renderedExamples}`
      : ""
    }
        
        FAILURE TO FOLLOW THESE EXACT PROTOCOLS WILL RESULT IN TASK REJECTION.
        `.trim();
};

export default systemMessage;
