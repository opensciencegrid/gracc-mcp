import { JsonObject } from "../types.js";

export const toStructuredToolResult = <T extends JsonObject>(payload: T) => {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
};

export const toErrorToolResult = (message: string, details?: JsonObject) => {
  const payload = details ? { error: message, ...details } : { error: message };
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
};
