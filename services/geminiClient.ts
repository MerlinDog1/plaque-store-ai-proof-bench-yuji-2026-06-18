import { GoogleGenAI } from "@google/genai";

type GenerateContentArgs = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GenerateImagesArgs = Parameters<GoogleGenAI["models"]["generateImages"]>[0];

const callGeminiProxy = async <T,>(path: string, payload: unknown): Promise<T> => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || `Gemini proxy failed with HTTP ${response.status}`);
  }
  return body as T;
};

const createBrowserProxyClient = () => ({
  models: {
    generateContent: (args: GenerateContentArgs) =>
      callGeminiProxy<Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>>(
        "/api/gemini/generate-content",
        args,
      ),
    generateImages: (args: GenerateImagesArgs) =>
      callGeminiProxy<Awaited<ReturnType<GoogleGenAI["models"]["generateImages"]>>>(
        "/api/gemini/generate-images",
        args,
      ),
  },
});

export const getGeminiClient = (): GoogleGenAI => {
  if (typeof window !== "undefined") {
    return createBrowserProxyClient() as unknown as GoogleGenAI;
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
};

export const hasBrowserGeminiProxy = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  try {
    const response = await fetch("/api/gemini/health", { method: "GET" });
    const body = await response.json();
    return Boolean(response.ok && body?.hasKey);
  } catch {
    return false;
  }
};
