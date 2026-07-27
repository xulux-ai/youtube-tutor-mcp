import { MCPServer, text } from "mcp-use/server";
import { z } from "zod";

const server = new MCPServer({
  name: "youtube-tutor",
  version: "0.1.0",
  description:
    "Tutor over YouTube public captions: load a video, set a timestamp, ask questions grounded in the transcript.",
});

server.tool(
  {
    name: "ping",
    description: "Health check",
    schema: z.object({}),
  },
  async () => text("ok")
);

// Remove ping in Task 8 when real tools are registered.
server.listen().catch(console.error);
