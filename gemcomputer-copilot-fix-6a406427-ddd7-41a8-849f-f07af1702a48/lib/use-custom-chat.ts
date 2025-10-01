"use client";

import { useState, useCallback, useRef, FormEvent, ChangeEvent } from "react";
import { ABORTED } from "@/lib/utils";

type TextPart = { type: "text"; text: string };

type ScreenshotUpdatePart = {
  type: "screenshot-update";
  screenshot: string;
  timestamp?: number;
  resolution?: { width: number; height: number };
};

type ToolInvocationArgs = {
  action?: string;
  coordinate?: number[];
  start_coordinate?: number[];
  text?: string;
  duration?: number;
  scroll_direction?: string;
  scroll_amount?: number;
  command?: string;
  [key: string]: unknown;
};

type ToolInvocationResult = Record<string, unknown> | typeof ABORTED | null | undefined;

type ToolInvocationPart = {
  type: "tool-invocation";
  toolInvocation: {
    toolCallId: string;
    toolName?: string;
    state: "streaming" | "call" | "result";
    args?: ToolInvocationArgs;
    argsText?: string;
    result?: ToolInvocationResult;
  };
};

type MessagePart = TextPart | ScreenshotUpdatePart | ToolInvocationPart;

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: MessagePart[];
};

type UseChatOptions = {
  api: string;
  id?: string;
  body?: Record<string, unknown>;
  maxSteps?: number;
  onError?: (error: Error) => void;
};

type ChatStatus = "ready" | "streaming" | "error";

export function useCustomChat(options: UseChatOptions) {
  const { api, body, onError } = options;

  const [messages, internalSetMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const abortControllerRef = useRef<AbortController | null>(null);

  const messagesRef = useRef<Message[]>(messages);
  const toolMessageMapRef = useRef<Map<string, string>>(new Map());
  const currentAssistantTextMessageIdRef = useRef<string | null>(null);

  messagesRef.current = messages;

  const setMessages = useCallback(
    (value: Message[] | ((prev: Message[]) => Message[])) => {
      internalSetMessages((prev) => {
        const next = typeof value === "function" ? (value as (prev: Message[]) => Message[])(prev) : value;
        messagesRef.current = next;
        return next;
      });
    },
    [internalSetMessages]
  );

  const handleInputChange = (e: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const append = useCallback(
    async ({ role, content }: { role: "user" | "assistant"; content: string }) => {
      const userMessage: Message = {
        id: Date.now().toString(),
        role,
        content,
      };

      const nextMessages = [...messagesRef.current, userMessage];
      setMessages(nextMessages);
      setStatus("streaming");

      try {
        abortControllerRef.current = new AbortController();
        toolMessageMapRef.current = new Map();
        currentAssistantTextMessageIdRef.current = null;

        const response = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages,
            ...body,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No reader available");
        }

        const appendAssistantText = (delta: string) => {
          if (!delta) return;
          setMessages((prev) => {
            const newMessages = [...prev];
            const currentId = currentAssistantTextMessageIdRef.current;
            const index = currentId ? newMessages.findIndex((message) => message.id === currentId) : -1;

            if (index === -1) {
              const newMessage: Message = {
                id: `${Date.now()}-${Math.random()}`,
                role: "assistant",
                content: delta,
              };
              newMessages.push(newMessage);
              currentAssistantTextMessageIdRef.current = newMessage.id;
              return newMessages;
            }

            const existing = newMessages[index];
            const updated: Message = {
              ...existing,
              content: `${existing.content ?? ""}${delta}`,
            };
            newMessages[index] = updated;
            return newMessages;
          });
        };

        const mutateToolInvocation = (
          toolCallId: string,
          updater: (part: ToolInvocationPart) => ToolInvocationPart
        ) => {
          setMessages((prev) => {
            const newMessages = [...prev];
            const messageId = toolMessageMapRef.current.get(toolCallId);
            if (!messageId) return prev;

            const messageIndex = newMessages.findIndex((message) => message.id === messageId);
            if (messageIndex === -1) return prev;

            const targetMessage = newMessages[messageIndex];
            if (!targetMessage.parts || targetMessage.parts.length === 0) return prev;

            const partIndex = targetMessage.parts.findIndex(
              (part): part is ToolInvocationPart =>
                part.type === "tool-invocation" && part.toolInvocation.toolCallId === toolCallId
            );

            if (partIndex === -1) return prev;

            const existingPart = targetMessage.parts[partIndex] as ToolInvocationPart;
            const updatedPart = updater({
              ...existingPart,
              toolInvocation: { ...existingPart.toolInvocation },
            });

            const updatedParts = [...targetMessage.parts];
            updatedParts[partIndex] = updatedPart;

            newMessages[messageIndex] = {
              ...targetMessage,
              parts: updatedParts,
            };

            return newMessages;
          });
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || !line.startsWith("data: ")) {
              continue;
            }

            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "text-delta") {
                appendAssistantText(data.delta);
              } else if (data.type === "tool-call-start") {
                const toolPart: ToolInvocationPart = {
                  type: "tool-invocation",
                  toolInvocation: {
                    toolCallId: data.toolCallId,
                    toolName: "",
                    args: {},
                    argsText: "",
                    state: "streaming",
                  },
                };

                const toolMessageId = `${data.toolCallId}-${Date.now()}-${Math.random()}`;
                toolMessageMapRef.current.set(data.toolCallId, toolMessageId);
                currentAssistantTextMessageIdRef.current = null;

                setMessages((prev) => [
                  ...prev,
                  {
                    id: toolMessageId,
                    role: "assistant",
                    content: "",
                    parts: [toolPart],
                  },
                ]);
              } else if (data.type === "tool-name-delta") {
                mutateToolInvocation(data.toolCallId, (part) => ({
                  ...part,
                  toolInvocation: {
                    ...part.toolInvocation,
                    toolName: data.toolName,
                  },
                }));
              } else if (data.type === "tool-argument-delta") {
                mutateToolInvocation(data.toolCallId, (part) => {
                  const nextArgsText = `${part.toolInvocation.argsText ?? ""}${data.delta}`;
                  let parsedArgs: ToolInvocationArgs | undefined = part.toolInvocation.args;
                  try {
                    parsedArgs = JSON.parse(nextArgsText) as ToolInvocationArgs;
                  } catch {
                    // ignore parse errors while streaming
                  }

                  return {
                    ...part,
                    toolInvocation: {
                      ...part.toolInvocation,
                      argsText: nextArgsText,
                      args: parsedArgs,
                    },
                  };
                });
              } else if (data.type === "tool-input-available") {
                mutateToolInvocation(data.toolCallId, (part) => ({
                  ...part,
                  toolInvocation: {
                    ...part.toolInvocation,
                    args: data.input as ToolInvocationArgs,
                    state: "call",
                  },
                }));
                currentAssistantTextMessageIdRef.current = null;
              } else if (data.type === "tool-output-available") {
                mutateToolInvocation(data.toolCallId, (part) => ({
                  ...part,
                  toolInvocation: {
                    ...part.toolInvocation,
                    state: "result",
                    result: data.output as ToolInvocationResult,
                  },
                }));
                currentAssistantTextMessageIdRef.current = null;
              } else if (data.type === "screenshot-update") {
                const screenshotPart: ScreenshotUpdatePart = {
                  type: "screenshot-update",
                  screenshot: data.screenshot,
                  timestamp: Date.now(),
                  resolution: data.resolution,
                };

                const screenshotMessage: Message = {
                  id: `screenshot-${Date.now()}-${Math.random()}`,
                  role: "assistant",
                  content: "",
                  parts: [screenshotPart],
                };

                currentAssistantTextMessageIdRef.current = null;
                setMessages((prev) => [...prev, screenshotMessage]);
              } else if (data.type === "error") {
                throw new Error(data.errorText);
              }
            } catch (error) {
              if (error instanceof SyntaxError) continue;
              throw error;
            }
          }
        }

        setStatus("ready");
        currentAssistantTextMessageIdRef.current = null;
        toolMessageMapRef.current = new Map();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setStatus("ready");
          return;
        }

        setStatus("error");
        if (onError && error instanceof Error) {
          onError(error);
        }
        console.error("Chat error:", error);
      }
    },
    [api, body, onError, setMessages]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim() || status === "streaming") return;

      const userInput = input;
      setInput("");
      await append({ role: "user", content: userInput });
    },
    [append, input, status]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("ready");
  }, []);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    stop,
    append,
    setMessages,
  };
}
