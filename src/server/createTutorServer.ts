import { MCPServer, object, error } from "mcp-use/server";
import { z } from "zod";
import { loadVideoHandler } from "../tools/loadVideo.js";
import { setPositionHandler } from "../tools/setPosition.js";
import { getContextHandler } from "../tools/getContext.js";
import { askAtPositionHandler } from "../tools/askAtPosition.js";
import { findConceptHandler } from "../tools/findConcept.js";
import { getVideoStatusHandler } from "../tools/getVideoStatus.js";

export function createTutorServer() {
  const server = new MCPServer({
    name: "youtube-tutor",
    title: "YouTube Tutor",
    version: "0.1.0",
    description:
      "Tutor over YouTube public captions. Load a video, set a timestamp, ask grounded questions. Does not download video files — only public captions into .cache.",
    host: "localhost",
    baseUrl: process.env.MCP_URL || `http://localhost:${process.env.PORT ?? 3000}`,
    instructions:
      "Call load-video before tutoring a new URL. For timestamp questions call set-position then get-context or ask-at-position. For concept confusion call find-concept. Always cite timestamps from tool results; never invent quotes.",
  });

  server.tool(
    {
      name: "load-video",
      description:
        "Load a YouTube video by URL or video ID. Fetches public captions if not cached, stores them under .cache, and sets the active video for tutoring.",
      schema: z.object({
        url: z.string().describe("YouTube URL or 11-character video ID"),
        language: z
          .string()
          .optional()
          .describe("Caption language code, default en"),
      }),
      annotations: {
        readOnlyHint: false, // sets the active video and writes captions to .cache
        openWorldHint: true, // fetches public captions from YouTube
      },
    },
    async ({ url, language }) => {
      try {
        return object(await loadVideoHandler({ url, language }));
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.tool(
    {
      name: "set-position",
      description:
        "Set the sticky playback position (e.g. when the user says \"I'm at 12:34\"). Accepts mm:ss, h:mm:ss, or seconds.",
      schema: z.object({
        timestamp: z
          .string()
          .describe("Timestamp like 12:34, 1:02:03, or seconds as a string"),
      }),
      annotations: {
        readOnlyHint: false, // mutates the sticky playback position
        openWorldHint: false,
      },
    },
    async ({ timestamp }) => {
      try {
        return object(await setPositionHandler({ timestamp }));
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.tool(
    {
      name: "get-context",
      description:
        "Get transcript segments around the sticky position (or an override timestamp). Use this to answer questions about what is being said at that time.",
      schema: z.object({
        timestamp: z
          .string()
          .optional()
          .describe("Optional override timestamp; defaults to sticky position"),
        halfWindowSec: z
          .number()
          .optional()
          .describe("Seconds before/after position to include (default 60)"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ timestamp, halfWindowSec }) => {
      try {
        return object(await getContextHandler({ timestamp, halfWindowSec }));
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.tool(
    {
      name: "ask-at-position",
      description:
        "Answer a user question using transcript context at the sticky (or override) position. Returns grounded segments + the question; you must explain using only that evidence and cite timestamps.",
      schema: z.object({
        question: z.string().describe("The user's question"),
        timestamp: z.string().optional().describe("Optional override timestamp"),
        halfWindowSec: z
          .number()
          .optional()
          .describe("Seconds before/after position to include (default 60)"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ question, timestamp, halfWindowSec }) => {
      try {
        return object(
          await askAtPositionHandler({ question, timestamp, halfWindowSec }),
        );
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.tool(
    {
      name: "find-concept",
      description:
        "Search the active video transcript for a concept/term. Returns timestamped quotes so you can point the user to rewind times.",
      schema: z.object({
        query: z.string().describe("Concept or phrase to find"),
        limit: z.number().optional().describe("Max hits (default 5)"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false, // searches the already-cached transcript
      },
    },
    async ({ query, limit }) => {
      try {
        return object(await findConceptHandler({ query, limit }));
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.tool(
    {
      name: "get-video-status",
      description:
        "Return the active video id, sticky position, cache status, and basic metadata.",
      schema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        return object(await getVideoStatusHandler());
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  return server;
}
