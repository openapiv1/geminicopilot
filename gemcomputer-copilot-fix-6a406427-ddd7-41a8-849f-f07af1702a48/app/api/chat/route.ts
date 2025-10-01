import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { killDesktop, getDesktop } from "@/lib/e2b/utils";
import { resolution } from "@/lib/e2b/tool";

type IncomingChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatInlineData = {
  mimeType: string;
  data: string;
};

type GenerativePart =
  | { text: string }
  | { inlineData: ChatInlineData }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GenerativeMessage = {
  role: "user" | "model";
  parts: GenerativePart[];
};

type ToolCallRecord = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

type ToolResponseRecord = {
  name: string;
  response: Record<string, unknown>;
};

type ToolOutputPayload =
  | { type: "text"; text: string; status?: string }
  | { type: "image"; data: string; resolution: { width: number; height: number } };

type ComputerUseArgs = {
  action?: string;
  coordinate?: [number, number];
  start_coordinate?: [number, number];
  text?: string;
  duration?: number;
  scroll_direction?: "up" | "down";
  scroll_amount?: number;
};

type BashCommandArgs = {
  command?: string;
};

type ToolDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: SchemaType;
    properties: Record<string, unknown>;
    required: string[];
  };
};

const GEMINI_API_KEY = "AIzaSyBo8xPG6pmn1pwQ1nzLvGfvE_nXrYzBTgs";

export const maxDuration = 36000;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const INSTRUCTIONS = `Nazywasz się Gemini. Jesteś pomocnym asystentem z dostępem do komputera Ubuntu 22.04. 

DOSTĘPNE NARZĘDZIA:
- bash_command: Wykonywanie poleceń bash w terminalu (tworzenie plików, instalacja, skrypty)
- computer_use: Kontrola desktopa (screenshot, klikanie, pisanie, przewijanie, przeciąganie)

ZASADY UŻYWANIA NARZĘDZI:
- Używaj przedewszystkim narzędzia computer_use, staraj się nie użwywać bash dopóki nie będzie to konieczne.
- bash_command: dla operacji terminalowych (mkdir, touch, apt install, python, itp.)
- computer_use: dla interakcji GUI (otwieranie aplikacji, klikanie w przeglądarce, itp.)
- Jeśli przeglądarka otworzy się z kreatorem konfiguracji, ZIGNORUJ GO i przejdź do następnego kroku

KRYTYCZNIE WAŻNE - ZRZUTY EKRANU:
- Po każdych 2-3 akcjach ROB ZRZUT EKRANU (computer_use z action: screenshot)
- Zawsze sprawdzaj stan sandboxa przed kontynuowaniem
- Jeśli coś się ładuje lub wykonuje - zrób screenshot aby zobaczyć wynik
- Nie zakładaj że coś się udało - ZWERYFIKUJ screenshotem

KRYTYCZNIE WAŻNE - PROAKTYWNA KOMUNIKACJA:  
- ZAWSZE najpierw wyślij wiadomość tekstową opisującą DOKŁADNIE co zamierzasz zrobić
- Podziel złożone zadania na kroki i przed każdym krokiem powiedz użytkownikowi co planujesz  
- Wykonuj wiele akcji w jednym zadaniu bez przerywania - kontynuuj aż do pełnego wykonania
- Po każdej akcji krótko podsumuj co zostało zrobione i co będzie dalej  
- Twoje działania mają być w pełni transparentne - użytkownik MUSI wiedzieć co robisz
- Nie pytaj o pozwolenie, po prostu informuj co będziesz robić i rób to

WORKFLOW:
1. Przeanalizuj aktualny zrzut ekranu
2. Powiedz użytkownikowi co widzisz i co zamierzasz zrobić
3. Wykonaj akcje (bash_command lub computer_use)
4. Po 2-3 akcjach zrób screenshot (computer_use) aby sprawdzić stan
5. Przeanalizuj nowy screenshot i kontynuuj lub zakończ zadanie`;

const tools: ToolDeclaration[] = [
  {
    name: "computer_use",
    description: "Use the computer to perform actions like clicking, typing, taking screenshots, etc.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        action: {
          type: SchemaType.STRING,
          description: "The action to perform. Must be one of: screenshot, left_click, double_click, right_click, mouse_move, type, key, scroll, left_click_drag, wait"
        },
        coordinate: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
          description: "X,Y coordinates for actions that require positioning"
        },
        text: {
          type: SchemaType.STRING,
          description: "Text to type or key to press"
        },
        scroll_direction: {
          type: SchemaType.STRING,
          description: "Direction to scroll. Must be 'up' or 'down'"
        },
        scroll_amount: {
          type: SchemaType.NUMBER,
          description: "Number of scroll clicks"
        },
        start_coordinate: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
          description: "Start coordinates for drag operations"
        },
        duration: {
          type: SchemaType.NUMBER,
          description: "Duration for wait action in seconds"
        }
      },
      required: ["action"]
    }
  },
  {
    name: "bash_command",
    description: "Execute bash commands on the computer",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        command: {
          type: SchemaType.STRING,
          description: "The bash command to execute"
        }
      },
      required: ["command"]
    }
  }
];

export async function POST(req: Request) {
  const { messages, sandboxId }: { messages: IncomingChatMessage[]; sandboxId: string } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const desktop = await getDesktop(sandboxId);
        let agentHasTakenInitialScreenshot = false;

        const screenshot = await desktop.screenshot();
        const screenshotBase64 = Buffer.from(screenshot).toString('base64');

        sendEvent({
          type: "screenshot-update",
          screenshot: screenshotBase64,
          resolution: { width: resolution.x, height: resolution.y }
        });
        
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: INSTRUCTIONS,
          tools: [{ functionDeclarations: tools }]
        });

        const chatHistory: GenerativeMessage[] = [];

        for (const msg of messages) {
          if (msg.role === "user") {
            chatHistory.push({
              role: "user",
              parts: [{ text: msg.content }]
            });
          } else if (msg.role === "assistant") {
            chatHistory.push({
              role: "model",
              parts: [{ text: msg.content }]
            });
          }
        }

        chatHistory.push({
          role: "user",
          parts: [
            { text: "Oto aktualny ekran. Przeanalizuj go i pomóż użytkownikowi z zadaniem. Pamiętaj o proaktywnej komunikacji - najpierw powiedz co zamierzasz zrobić." },
            {
              inlineData: {
                mimeType: "image/png",
                data: screenshotBase64
              }
            }
          ]
        });

        const chat = model.startChat({
          history: chatHistory.slice(0, -1)
        });

        while (true) {
          const lastMessage = chatHistory[chatHistory.length - 1];
          const result = await chat.sendMessageStream(lastMessage.parts);

          const functionCalls: ToolCallRecord[] = [];
          const functionResponses: ToolResponseRecord[] = [];
          let toolCallIndex = 0;
          const toolExecutionPromises: Promise<void>[] = [];

          for await (const chunk of result.stream) {
            const candidate = chunk.candidates?.[0];
            if (!candidate) continue;

            const content = candidate.content;
            if (!content) continue;

            for (const part of content.parts) {
              if (part.text) {
                sendEvent({ type: "text-delta", delta: part.text, id: "default" });
              }

              if (part.functionCall) {
                const fc = part.functionCall;
                const toolCallId = `call_${toolCallIndex}_${Date.now()}`;
                const toolName = fc.name === "computer_use" ? "computer" : "bash";
                const currentIndex = toolCallIndex;
                toolCallIndex++;

                let parsedArgs: Record<string, unknown> = {};
                if (typeof fc.args === "string") {
                  try {
                    parsedArgs = JSON.parse(fc.args) as Record<string, unknown>;
                  } catch {
                    console.error("Failed to parse function args:", fc.args);
                    parsedArgs = {};
                  }
                } else if (fc.args && typeof fc.args === "object") {
                  parsedArgs = fc.args as Record<string, unknown>;
                }

                sendEvent({
                  type: "tool-call-start",
                  toolCallId: toolCallId,
                  index: currentIndex
                });

                sendEvent({
                  type: "tool-name-delta",
                  toolCallId: toolCallId,
                  toolName: toolName,
                  index: currentIndex
                });

                const argsStr = JSON.stringify(parsedArgs);
                for (let i = 0; i < argsStr.length; i += 10) {
                  sendEvent({
                    type: "tool-argument-delta",
                    toolCallId: toolCallId,
                    delta: argsStr.slice(i, i + 10),
                    index: currentIndex
                  });
                }

                sendEvent({
                  type: "tool-input-available",
                  toolCallId: toolCallId,
                  toolName: toolName,
                  input: parsedArgs
                });

                functionCalls.push({
                  id: toolCallId,
                  name: fc.name,
                  args: parsedArgs
                });
 codex/revamp-chat-component-for-live-streaming-qepge9

                (async () => {

                
                const toolPromise = (async () => {
 main
                  try {
                    const args = parsedArgs as ComputerUseArgs & BashCommandArgs;
                    let resultData: ToolOutputPayload = { type: "text", text: "" };
                    let resultText = "";

                    if (fc.name === "computer_use") {
                      const action = args.action;

                      if (!agentHasTakenInitialScreenshot) {
                        if (action !== "screenshot") {
                          const requirementText = `First computer action must be a screenshot at resolution ${resolution.x}x${resolution.y}. Please perform a screenshot before continuing.`;

                          sendEvent({
                            type: "tool-output-available",
                            toolCallId: toolCallId,
                            output: { type: "text", text: requirementText, status: "blocked" }
                          });

                          functionResponses.push({
                            name: fc.name,
                            response: { error: requirementText }
                          });

                          return;
                        }

                        agentHasTakenInitialScreenshot = true;
                      }

                      switch (action) {
                        case "screenshot": {
                          const image = await desktop.screenshot();
                          const base64Data = Buffer.from(image).toString("base64");
                          resultText = `Screenshot taken successfully at ${resolution.x}x${resolution.y}`;
                          resultData = {
                            type: "image",
                            data: base64Data,
                            resolution: { width: resolution.x, height: resolution.y }
                          };

                          sendEvent({
                            type: "screenshot-update",
                            screenshot: base64Data,
                            resolution: { width: resolution.x, height: resolution.y }
                          });
                          break;
                        }
                        case "wait": {
                          const actualDuration = Math.min(args.duration || 1, 2);
                          await new Promise(resolve => setTimeout(resolve, actualDuration * 1000));
                          resultText = `Waited for ${actualDuration} seconds`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "left_click": {
                          const coordinate = args.coordinate ?? [0, 0];
                          const [x, y] = coordinate;
                          await desktop.moveMouse(x, y);
                          await desktop.leftClick();
                          resultText = `Left clicked at ${x}, ${y}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "double_click": {
                          const coordinate = args.coordinate ?? [0, 0];
                          const [x, y] = coordinate;
                          await desktop.moveMouse(x, y);
                          await desktop.doubleClick();
                          resultText = `Double clicked at ${x}, ${y}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "right_click": {
                          const coordinate = args.coordinate ?? [0, 0];
                          const [x, y] = coordinate;
                          await desktop.moveMouse(x, y);
                          await desktop.rightClick();
                          resultText = `Right clicked at ${x}, ${y}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "mouse_move": {
                          const coordinate = args.coordinate ?? [0, 0];
                          const [x, y] = coordinate;
                          await desktop.moveMouse(x, y);
                          resultText = `Moved mouse to ${x}, ${y}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "type": {
                          const textToType = args.text ?? "";
                          await desktop.write(textToType);
                          resultText = `Typed: ${textToType}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "key": {
                          const keyValue = args.text ?? "";
                          const keyToPress = keyValue === "Return" ? "enter" : keyValue;
                          await desktop.press(keyToPress);
                          resultText = `Pressed key: ${keyValue}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "scroll": {
                          const direction = (args.scroll_direction ?? "down") as "up" | "down";
                          const amount = args.scroll_amount ?? 3;
                          await desktop.scroll(direction, amount);
                          resultText = `Scrolled ${direction} by ${amount} clicks`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "left_click_drag": {
                          const start = args.start_coordinate ?? [0, 0];
                          const end = args.coordinate ?? [0, 0];
                          const [startX, startY] = start;
                          const [endX, endY] = end;
                          await desktop.drag([startX, startY], [endX, endY]);
                          resultText = `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        default: {
                          resultText = `Unknown action: ${action}`;
                          resultData = { type: "text", text: resultText };
                          console.warn("Unknown action:", action);
                        }
                      }

                      sendEvent({
                        type: "tool-output-available",
                        toolCallId: toolCallId,
                        output: resultData
                      });

                      functionResponses.push({
                        name: fc.name,
                        response: { result: resultText }
                      });
                      
                      if (action !== "screenshot") {
                        const actionScreenshot = await desktop.screenshot();
                        const actionScreenshotBase64 = Buffer.from(actionScreenshot).toString('base64');
                        sendEvent({
                          type: "screenshot-update",
                          screenshot: actionScreenshotBase64,
                          resolution: { width: resolution.x, height: resolution.y }
                        });
                      }
                    } else if (fc.name === "bash_command") {
                      const command = args.command;
                      if (!command) {
                        throw new Error("Missing command for bash_command tool invocation");
                      }

                      const result = await desktop.commands.run(command);
                      const output = result.stdout || result.stderr || "(Command executed successfully with no output)";

                      sendEvent({
                        type: "tool-output-available",
                        toolCallId: toolCallId,
                        output: { type: "text", text: output }
                      });
                      
                      functionResponses.push({
                        name: fc.name,
                        response: { result: output }
                      });
                      
                      const bashScreenshot = await desktop.screenshot();
                      const bashScreenshotBase64 = Buffer.from(bashScreenshot).toString('base64');
                      sendEvent({
                        type: "screenshot-update",
                        screenshot: bashScreenshotBase64,
                        resolution: { width: resolution.x, height: resolution.y }
                      });
                    }
                  } catch (error) {
                    console.error("Error executing tool:", error);
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    sendEvent({
                      type: "error",
                      errorText: errorMsg
                    });
                    functionResponses.push({
                      name: fc.name,
                      response: { error: errorMsg }
                    });
                  }
                })();
                
                toolExecutionPromises.push(toolPromise);
              }
            }
          }
          
          // Wait for all tool executions to complete before continuing
          await Promise.all(toolExecutionPromises);
          
          if (functionCalls.length > 0) {
            const newScreenshot = await desktop.screenshot();
            const newScreenshotBase64 = Buffer.from(newScreenshot).toString('base64');

            sendEvent({
              type: "screenshot-update",
              screenshot: newScreenshotBase64,
              resolution: { width: resolution.x, height: resolution.y }
            });

            chatHistory.push({
              role: "model",
              parts: functionCalls.map(fc => ({
                functionCall: {
                  name: fc.name,
                  args: fc.args
                }
              }))
            });

            chatHistory.push({
              role: "user",
              parts: functionResponses.map(fr => ({
                functionResponse: {
                  name: fr.name,
                  response: fr.response
                }
              }))
            });

            chatHistory.push({
              role: "user",
              parts: [
                { text: `All ${functionCalls.length} action(s) completed. Continue with the next steps. Here is the current screen:` },
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: newScreenshotBase64
                  }
                }
              ]
            });
          } else {
            controller.close();
            return;
          }
        }
        
        controller.close();
      } catch (error) {
        console.error("Chat API error:", error);
        await killDesktop(sandboxId);
        sendEvent({
          type: "error",
          errorText: String(error)
        });
        controller.close();
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
