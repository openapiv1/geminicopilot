import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { killDesktop, getDesktop } from "@/lib/e2b/utils";
import { resolution } from "@/lib/e2b/tool";

const GEMINI_API_KEY = "AIzaSyA_8oLS-4FgJJ9-x7l5_xl1RORmJyUUKzw";

export const maxDuration = 300;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const INSTRUCTIONS = `Jesteś Surfem, pomocnym asystentem, który potrafi korzystać z komputera, aby wspierać użytkownika w jego zadaniach.  
Możesz używać komputera do wyszukiwania w internecie, pisania kodu i wielu innych rzeczy.  

Surf został stworzony przez E2B, które dostarcza otwartoźródłowy, odizolowany wirtualny komputer w chmurze, przeznaczony do zastosowań AI.  
Ta aplikacja integruje pulpitową piaskownicę E2B z Gemini AI, tworząc agenta AI, który może wykonywać zadania  
na wirtualnym komputerze poprzez polecenia w języku naturalnym.  

Zrzuty ekranu, które otrzymujesz, pochodzą z działającej instancji piaskownicy, co pozwala ci widzieć i wchodzić w interakcję z prawdziwym  
środowiskiem wirtualnego komputera w czasie rzeczywistym.  

Ponieważ działasz w bezpiecznej, odizolowanej mikro-VM piaskownicy, możesz wykonywać większość poleceń i operacji bez obaw  
o kwestie bezpieczeństwa. To środowisko zostało zaprojektowane specjalnie do eksperymentów z AI i wykonywania zadań.  

Piaskownica oparta jest na Ubuntu 22.04 i zawiera wiele preinstalowanych aplikacji, w tym:  
- przeglądarkę Firefox  
- Visual Studio Code  
- pakiet LibreOffice  
- Pythona 3 z popularnymi bibliotekami  
- terminal ze standardowymi narzędziami Linuksa  
- menedżer plików (PCManFM)  
- edytor tekstu (Gedit)  
- kalkulator i inne podstawowe narzędzia  

WAŻNE: Możesz uruchamiać polecenia w terminalu w dowolnym momencie bez pytania o potwierdzenie,  
o ile są one potrzebne do wykonania zadania, które użytkownik ci powierzył.  
Powinieneś wykonywać polecenia natychmiast, kiedy są potrzebne, aby sprawnie zrealizować prośbę użytkownika.  

WAŻNE: Wpisując polecenia w terminalu, ZAWSZE wysyłaj akcję key z "Return" natychmiast po wpisaniu komendy, aby ją uruchomić.  
Polecenia terminalowe nie zostaną wykonane, dopóki nie naciśniesz Enter.  

WAŻNE: Podczas edytowania plików preferuj użycie Visual Studio Code (VS Code), ponieważ zapewnia ono lepsze środowisko edycji  
z podświetlaniem składni, uzupełnianiem kodu i innymi przydatnymi funkcjami.  

Masz dostęp do narzędzi:
- computer_use: Przechwytywać ekran, klikać, pisać, używać klawiatury, przewijać  
- bash_command: Wykonywać polecenia bash na komputerze  

KRYTYCZNIE WAŻNE - PROAKTYWNA KOMUNIKACJA:  
- ZAWSZE najpierw wyślij wiadomość tekstową opisującą DOKŁADNIE co zamierzasz zrobić, zanim wykonasz jakiekolwiek akcje  
- Podziel złożone zadania na kroki i przed każdym krokiem powiedz użytkownikowi co planujesz  
- Wykonuj wiele akcji w jednym zadaniu bez przerywania - kontynuuj aż do pełnego wykonania zadania  
- Po każdej akcji krótko podsumuj co zostało zrobione i co będzie dalej  
- Twoje działania mają być w pełni transparentne - użytkownik MUSI wiedzieć co robisz zanim to zrobisz  
- Nie pytaj o pozwolenie, po prostu informuj co będziesz robić i rób to  

PRZYKŁAD DOBREGO ZACHOWANIA:
1. "Zaraz otwieram Firefox, żeby wyszukać informacje o..."  
2. [wykonaj akcję otwarcia Firefox]  
3. "Teraz klikam w pasek adresu i wpisuję adres..."  
4. [wykonaj akcje]  
5. "Widzę wyniki, teraz klikam w pierwszy link..."  

Zawsze najpierw przeanalizuj zrzut ekranu, powiedz użytkownikowi co widzisz i co zamierzasz zrobić, a następnie wykonaj wszystkie potrzebne akcje.`;

const tools = [
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
  const { messages, sandboxId }: { messages: any[]; sandboxId: string } = await req.json();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const desktop = await getDesktop(sandboxId);
        
        const screenshot = await desktop.screenshot();
        const screenshotBase64 = Buffer.from(screenshot).toString('base64');
        
        sendEvent({
          type: "screenshot-update",
          screenshot: screenshotBase64
        });
        
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: INSTRUCTIONS,
          tools: [{ functionDeclarations: tools as any }]
        });

        const chatHistory: any[] = [];
        
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

          let fullText = "";
          let functionCalls: any[] = [];
          let toolCallIndex = 0;

          for await (const chunk of result.stream) {
            const candidate = chunk.candidates?.[0];
            if (!candidate) continue;

            const content = candidate.content;
            if (!content) continue;

            for (const part of content.parts) {
              if (part.text) {
                fullText += part.text;
                sendEvent({ type: "text-delta", delta: part.text, id: "default" });
              }

              if (part.functionCall) {
                const fc = part.functionCall;
                const toolCallId = `call_${toolCallIndex}_${Date.now()}`;
                const toolName = fc.name === "computer_use" ? "computer" : "bash";
                const currentIndex = toolCallIndex;
                toolCallIndex++;
                
                let parsedArgs = fc.args || {};
                if (typeof fc.args === 'string') {
                  try {
                    parsedArgs = JSON.parse(fc.args);
                  } catch (e) {
                    console.error("Failed to parse function args:", fc.args);
                    parsedArgs = {};
                  }
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
              }
            }
          }

          if (functionCalls.length > 0) {
            const functionResponses: any[] = [];

            for (const fc of functionCalls) {
              try {
                const args = fc.args;
                let resultData: any = { type: "text", text: "" };
                let resultText = "";

                if (fc.name === "computer_use") {
                  const action = args.action;

                  switch (action) {
                    case "screenshot": {
                      const image = await desktop.screenshot();
                      const base64Data = Buffer.from(image).toString("base64");
                      resultText = "Screenshot taken successfully";
                      resultData = { type: "image", data: base64Data };
                      
                      sendEvent({
                        type: "screenshot-update",
                        screenshot: base64Data
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
                      const [x, y] = args.coordinate;
                      await desktop.moveMouse(x, y);
                      await desktop.leftClick();
                      resultText = `Left clicked at ${x}, ${y}`;
                      resultData = { type: "text", text: resultText };
                      break;
                    }
                    case "double_click": {
                      const [x, y] = args.coordinate;
                      await desktop.moveMouse(x, y);
                      await desktop.doubleClick();
                      resultText = `Double clicked at ${x}, ${y}`;
                      resultData = { type: "text", text: resultText };
                      break;
                    }
                    case "right_click": {
                      const [x, y] = args.coordinate;
                      await desktop.moveMouse(x, y);
                      await desktop.rightClick();
                      resultText = `Right clicked at ${x}, ${y}`;
                      resultData = { type: "text", text: resultText };
                      break;
                    }
                    case "mouse_move": {
                      const [x, y] = args.coordinate;
                      await desktop.moveMouse(x, y);
                      resultText = `Moved mouse to ${x}, ${y}`;
                      resultData = { type: "text", text: resultText };
                      break;
                    }
                    case "type": {
                      await desktop.write(args.text);
                      resultText = `Typed: ${args.text}`;
                      resultData = { type: "text", text: resultText };
                      break;
                    }
                    case "key": {
                      const keyToPress = args.text === "Return" ? "enter" : args.text;
                      await desktop.press(keyToPress);
                      resultText = `Pressed key: ${args.text}`;
                      resultData = { type: "text", text: resultText };
                      break;
                    }
                    case "scroll": {
                      const direction = args.scroll_direction as "up" | "down";
                      const amount = args.scroll_amount || 3;
                      await desktop.scroll(direction, amount);
                      resultText = `Scrolled ${direction} by ${amount} clicks`;
                      resultData = { type: "text", text: resultText };
                      break;
                    }
                    case "left_click_drag": {
                      const [startX, startY] = args.start_coordinate;
                      const [endX, endY] = args.coordinate;
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
                    toolCallId: fc.id,
                    output: resultData
                  });

                  functionResponses.push({
                    name: fc.name,
                    response: { result: resultText }
                  });
                } else if (fc.name === "bash_command") {
                  const result = await desktop.commands.run(args.command);
                  const output = result.stdout || result.stderr || "(Command executed successfully with no output)";
                  
                  sendEvent({
                    type: "tool-output-available",
                    toolCallId: fc.id,
                    output: { type: "text", text: output }
                  });
                  
                  functionResponses.push({
                    name: fc.name,
                    response: { result: output }
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
            }

            const newScreenshot = await desktop.screenshot();
            const newScreenshotBase64 = Buffer.from(newScreenshot).toString('base64');
            
            sendEvent({
              type: "screenshot-update",
              screenshot: newScreenshotBase64
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

            functionCalls = [];
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
