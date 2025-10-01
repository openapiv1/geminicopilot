"use client";

import type { ComponentType } from "react";
import { Markdown } from "./markdown";
import { ABORTED, cn } from "@/lib/utils";
import {
  Camera,
  CheckCircle,
  CircleSlash,
  Clock,
  Keyboard,
  KeyRound,
  Loader2,
  MousePointer,
  MousePointerClick,
  ScrollText,
  StopCircle,
} from "lucide-react";

 codex/revamp-chat-component-for-live-streaming-qepge9
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


 main
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
 codex/revamp-chat-component-for-live-streaming-qepge9
  parts?: Array<TextPart | ToolInvocationPart | ScreenshotUpdatePart>;

  parts?: Array<
    | { type: "text"; text: string }
    | {
        type: "tool-invocation";
        toolInvocation: {
          toolCallId: string;
          toolName?: string;
          state: "streaming" | "call" | "result";
          args?: Record<string, any>;
          argsText?: string;
          result?: any;
        };
      }
  >;
 main
};

type PreviewMessageProps = {
  message: Message;
  status: "error" | "submitted" | "streaming" | "ready";
  isLatestMessage: boolean;
  isLoading: boolean;
};

type ComputerActionDescriptor = {
  label: string;
  detail?: string;
  icon: ComponentType<{ className?: string }> | null;
  showSkeleton?: boolean;
};

const streamingSpinner = (
  <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-hidden="true" />
);

const idleSpinner = (
  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" aria-hidden="true" />
);

const abortedIcon = (
  <CircleSlash className="h-4 w-4 text-amber-600" aria-hidden="true" />
);

const completedIcon = (
  <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
);

function formatCoordinate(value?: number[]) {
  if (!value || value.length < 2) return undefined;
  return `(${value[0]}, ${value[1]})`;
}

 codex/revamp-chat-component-for-live-streaming-qepge9
function describeComputerAction(part: ToolInvocationPart): ComputerActionDescriptor {

function describeComputerAction(part: Message["parts"][number] & { type: "tool-invocation" }): ComputerActionDescriptor {
 main
  const { args = {}, argsText, state } = part.toolInvocation;
  const action: string | undefined = args?.action;

  if (!action && state === "streaming") {
    if (argsText) {
      return {
        label: "Analyzing action",
        detail: argsText.slice(0, 50),
        icon: Loader2,
      };
    }
    return {
      label: "Preparing action",
      icon: Loader2,
      showSkeleton: false,
    };
  }

  switch (action) {
    case "screenshot":
      return { label: "Taking screenshot", icon: Camera, showSkeleton: state !== "result" };
    case "left_click":
      return {
        label: "Left click",
        detail: formatCoordinate(args?.coordinate) ?? (argsText ? "(streaming...)" : undefined),
        icon: MousePointer,
      };
    case "right_click":
      return {
        label: "Right click",
        detail: formatCoordinate(args?.coordinate) ?? (argsText ? "(streaming...)" : undefined),
        icon: MousePointerClick,
      };
    case "double_click":
      return {
        label: "Double click",
        detail: formatCoordinate(args?.coordinate) ?? (argsText ? "(streaming...)" : undefined),
        icon: MousePointerClick,
      };
    case "mouse_move":
      return {
        label: "Move mouse",
        detail: formatCoordinate(args?.coordinate) ?? (argsText ? "(streaming...)" : undefined),
        icon: MousePointer,
      };
    case "type":
      return {
        label: "Typing",
        detail: args?.text ? `"${args.text}"` : argsText ? "(streaming...)" : undefined,
        icon: Keyboard,
      };
    case "key":
      return {
        label: "Pressing key",
        detail: args?.text ? `"${args.text}"` : argsText ? "(streaming...)" : undefined,
        icon: KeyRound,
      };
    case "wait":
      return {
        label: "Waiting",
        detail: args?.duration ? `${args.duration} seconds` : argsText ? "(streaming...)" : undefined,
        icon: Clock,
      };
    case "scroll":
      return {
        label: "Scrolling",
        detail:
          args?.scroll_direction && args?.scroll_amount
            ? `${args.scroll_direction} by ${args.scroll_amount}`
            : argsText
              ? "(streaming...)"
              : undefined,
        icon: ScrollText,
      };
    case "left_click_drag":
      return {
        label: "Dragging",
        detail:
          args?.start_coordinate && args?.coordinate
            ? `${formatCoordinate(args.start_coordinate)} → ${formatCoordinate(args.coordinate)}`
            : argsText
              ? "(streaming...)"
              : undefined,
        icon: MousePointer,
      };
    default:
      return {
        label: action ?? "Computer action",
        detail: argsText ? argsText.slice(0, 60) : undefined,
        icon: Loader2,
      };
  }
}

function renderInvocationStatus(
  state: "streaming" | "call" | "result",
  isLatestMessage: boolean,
  chatStatus: PreviewMessageProps["status"],
 codex/revamp-chat-component-for-live-streaming-qepge9
  result?: ToolInvocationResult,

  result?: any,
 main
) {
  if (state === "streaming") {
    return streamingSpinner;
  }

  if (state === "call") {
    return isLatestMessage && chatStatus !== "ready" ? idleSpinner : <StopCircle className="h-4 w-4 text-red-500" aria-hidden="true" />;
  }

  if (state === "result") {
 codex/revamp-chat-component-for-live-streaming-qepge9
    const statusValue =
      result && typeof result === "object" && "status" in result
        ? (result as { status?: string }).status
        : undefined;

    if (result === ABORTED || statusValue === "aborted" || statusValue === "blocked") {

    if (result === ABORTED || result?.status === "aborted") {
 main
      return abortedIcon;
    }
    return completedIcon;
  }

  return null;
}

function ComputerInvocation({
  part,
  isLatestMessage,
  status,
}: {
 codex/revamp-chat-component-for-live-streaming-qepge9
  part: ToolInvocationPart;

  part: Extract<Message["parts"][number], { type: "tool-invocation" }>;
 main
  isLatestMessage: boolean;
  status: PreviewMessageProps["status"];
}) {
  const descriptor = describeComputerAction(part);
  const IconComponent = descriptor.icon;
  const { state, result } = part.toolInvocation;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          {IconComponent ? <IconComponent className="h-4 w-4" aria-hidden="true" /> : null}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-2 font-mono text-sm font-medium">
            <span>{descriptor.label}</span>
            {descriptor.detail ? (
              <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">{descriptor.detail}</span>
            ) : null}
          </div>
        </div>
        <div className="flex h-5 w-5 items-center justify-center">
          {renderInvocationStatus(state, isLatestMessage, status, result)}
        </div>
      </div>

      {state === "result" && result?.type === "image" ? (
        <div className="overflow-hidden rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${result.data}`}
            alt="Generated screenshot"
            className="aspect-[1024/768] w-full object-cover"
          />
        </div>
      ) : null}

      {descriptor.showSkeleton ? (
        <div className="aspect-[1024/768] w-full animate-pulse rounded-sm bg-zinc-200 dark:bg-zinc-800" />
      ) : null}
    </div>
  );
}

function BashInvocation({
  part,
  isLatestMessage,
  status,
}: {
 codex/revamp-chat-component-for-live-streaming-qepge9
  part: ToolInvocationPart;

  part: Extract<Message["parts"][number], { type: "tool-invocation" }>;
 main
  isLatestMessage: boolean;
  status: PreviewMessageProps["status"];
}) {
  const { args = {}, argsText, state, result } = part.toolInvocation;
  const command = args?.command as string | undefined;
  const displayCommand = argsText?.trim()?.length
    ? argsText.trim().slice(0, 80)
    : command
      ? command.slice(0, 80)
      : "...";

  const statusIcon = renderInvocationStatus(state, isLatestMessage, status, result);

  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <ScrollText className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium">
            {state === "streaming" ? "Generating command" : "Running command"}
          </span>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{displayCommand}</span>
        </div>
      </div>
      <div className="flex h-5 w-5 items-center justify-center">{statusIcon}</div>
    </div>
  );
}

function GenericInvocation({
  part,
  isLatestMessage,
  status,
}: {
 codex/revamp-chat-component-for-live-streaming-qepge9
  part: ToolInvocationPart;

  part: Extract<Message["parts"][number], { type: "tool-invocation" }>;
 main
  isLatestMessage: boolean;
  status: PreviewMessageProps["status"];
}) {
  const { toolName = "tool", state, args, result } = part.toolInvocation;
  const statusIcon = renderInvocationStatus(state, isLatestMessage, status, result);

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <div className="font-mono text-xs uppercase text-zinc-500">{toolName}</div>
        <div className="ml-auto flex h-5 w-5 items-center justify-center">{statusIcon}</div>
      </div>
      <pre className="mt-2 overflow-x-auto rounded bg-zinc-900/5 p-3 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
        {JSON.stringify(args, null, 2)}
      </pre>
    </div>
  );
}

 codex/revamp-chat-component-for-live-streaming-qepge9
function renderToolInvocation(part: ToolInvocationPart, props: PreviewMessageProps) {

function renderToolInvocation(part: Extract<Message["parts"][number], { type: "tool-invocation" }>, props: PreviewMessageProps) {
 main
  const toolName = part.toolInvocation.toolName;

  if (toolName === "computer" || (!toolName && part.toolInvocation.args?.action)) {
    return <ComputerInvocation part={part} isLatestMessage={props.isLatestMessage} status={props.status} />;
  }

  if (toolName === "bash" || (!toolName && part.toolInvocation.args?.command)) {
    return <BashInvocation part={part} isLatestMessage={props.isLatestMessage} status={props.status} />;
  }

  return <GenericInvocation part={part} isLatestMessage={props.isLatestMessage} status={props.status} />;
}

export function PreviewMessage(props: PreviewMessageProps) {
  const { message } = props;

  return (
    <div className="group/message w-full px-4" data-role={message.role}>
      <div
        className={cn(
          "flex w-full gap-4",
          message.role === "user"
            ? "ml-auto max-w-2xl"
            : "",
        )}
      >
        <div className="flex w-full flex-col gap-4">
          {message.content ? (
            <div
              className={cn(
                "flex w-full flex-row gap-2",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn("max-w-prose", {
                  "rounded-xl bg-secondary px-3 py-2 text-secondary-foreground": message.role === "user",
                })}
              >
                <Markdown>{message.content}</Markdown>
              </div>
            </div>
          ) : null}

          {message.parts?.map((part, index) => {
            if (part.type === "text") {
              return (
                <div key={`${message.id}-text-${index}`} className="max-w-prose">
                  <Markdown>{part.text}</Markdown>
 codex/revamp-chat-component-for-live-streaming-qepge9
                </div>
              );
            }

            if (part.type === "tool-invocation") {
              return (
                <div key={`${message.id}-tool-${part.toolInvocation.toolCallId}-${index}`}>
                  {renderToolInvocation(part, props)}
                </div>
              );
            }

            if (part.type === "screenshot-update") {
              const resolutionLabel = part.resolution
                ? `${part.resolution.width}×${part.resolution.height}`
                : undefined;

              return (
                <div
                  key={`${message.id}-screenshot-${index}`}
                  className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between font-mono text-xs uppercase text-zinc-500">
                    <span>Live screenshot</span>
                    {resolutionLabel ? <span className="text-[10px] text-zinc-400">{resolutionLabel}</span> : null}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${part.screenshot}`}
                    alt="Live desktop screenshot"
                    className="aspect-[1024/768] w-full rounded-sm object-cover"
                  />

 main
                </div>
              );
            }

 codex/revamp-chat-component-for-live-streaming-qepge9

            if (part.type === "tool-invocation") {
              return (
                <div key={`${message.id}-tool-${part.toolInvocation.toolCallId}-${index}`}>
                  {renderToolInvocation(part, props)}
                </div>
              );
            }

 main
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
