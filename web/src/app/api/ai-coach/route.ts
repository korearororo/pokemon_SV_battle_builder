import { NextResponse } from "next/server";

import { loadFullDexData } from "@/lib/pokemon/full-dex-data";

type PokemonRole = "sweeper" | "bulky-sweeper" | "wall" | "support" | "speed-control";

type StatSpread = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

type AiBuild = {
  nickname?: string;
  pokemonName?: string;
  role?: string;
  teraType?: string;
  ability?: string;
  item?: string;
  moves?: string[];
};

type AiCoachRequest = {
  message?: string;
  builds?: AiBuild[];
};

type AiSuggestedBuild = {
  nickname: string;
  pokemonName: string;
  role: PokemonRole;
  teraType: string;
  nature: string;
  ability: string;
  item: string;
  evs: StatSpread;
  ivs: StatSpread;
  moves: string[];
  reason: string;
};

type AiCoachStructuredResponse = {
  reply: string;
  suggestedBuilds: AiSuggestedBuild[];
};

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

const DEFAULT_MODEL = process.env.AI_COACH_MODEL ?? "gpt-4o-mini";
const DEFAULT_API_URL = process.env.AI_COACH_API_URL ?? "https://api.openai.com/v1/chat/completions";
const DEFAULT_EVS: StatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const DEFAULT_IVS: StatSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeBuilds(builds: unknown): AiBuild[] {
  if (!Array.isArray(builds)) {
    return [];
  }

  return builds
    .slice(0, 12)
    .filter((entry): entry is AiBuild => Boolean(entry && typeof entry === "object"))
    .map((entry) => ({
      nickname: typeof entry.nickname === "string" ? entry.nickname : "",
      pokemonName: typeof entry.pokemonName === "string" ? entry.pokemonName : "",
      role: typeof entry.role === "string" ? entry.role : "",
      teraType: typeof entry.teraType === "string" ? entry.teraType : "",
      ability: typeof entry.ability === "string" ? entry.ability : "",
      item: typeof entry.item === "string" ? entry.item : "",
      moves: Array.isArray(entry.moves)
        ? entry.moves.filter((move): move is string => typeof move === "string").slice(0, 6)
        : [],
    }));
}

function buildRegisteredContext(builds: AiBuild[]): string {
  if (builds.length === 0) {
    return "등록된 개체 없음";
  }

  return builds
    .map((entry, index) => {
      const displayName = entry.nickname?.trim()
        ? `${entry.nickname}(${entry.pokemonName || "미지정"})`
        : entry.pokemonName || "미지정";
      const moves = entry.moves && entry.moves.length > 0 ? entry.moves.join(", ") : "기술 없음";
      return `${index + 1}. ${displayName} | 역할:${entry.role || "미지정"} | 테라:${entry.teraType || "미지정"} | 특성:${entry.ability || "미지정"} | 도구:${entry.item || "미지정"} | 기술:${moves}`;
    })
    .join("\n");
}

function buildRagContext(
  message: string,
  fullDex: Awaited<ReturnType<typeof loadFullDexData>>,
): string {
  const q = normalize(message);
  const chunks: string[] = [];

  const matchedPokemon = fullDex.pokemonNamesKo
    .filter((name) => q.includes(normalize(name)))
    .slice(0, 6);

  for (const name of matchedPokemon) {
    const entry = fullDex.pokemonByName[normalize(name)];
    if (!entry) {
      continue;
    }
    chunks.push(
      `포켓몬: ${entry.name} | 타입:${entry.types.join("/")} | 특성:${entry.abilities.join(", ") || "없음"} | 종족값: H${entry.baseStats.hp} A${entry.baseStats.atk} B${entry.baseStats.def} C${entry.baseStats.spa} D${entry.baseStats.spd} S${entry.baseStats.spe}`,
    );
  }

  const matchedMoves = fullDex.moveNamesKo
    .filter((name) => q.includes(normalize(name)))
    .slice(0, 10);

  for (const name of matchedMoves) {
    const entry = fullDex.moveByName[normalize(name)];
    if (!entry) {
      continue;
    }
    chunks.push(
      `기술: ${entry.name} | 타입:${entry.type} | 분류:${entry.category} | 위력:${entry.power ?? "변동/없음"} | 우선도:${entry.priority}`,
    );
  }

  const matchedItems = fullDex.itemNamesKo
    .filter((name) => q.includes(normalize(name)))
    .slice(0, 8);

  if (matchedItems.length > 0) {
    chunks.push(`질문 매칭 도구: ${matchedItems.join(", ")}`);
  }

  const matchedAbilities = fullDex.abilityNamesKo
    .filter((name) => q.includes(normalize(name)))
    .slice(0, 8);

  if (matchedAbilities.length > 0) {
    chunks.push(`질문 매칭 특성: ${matchedAbilities.join(", ")}`);
  }

  if (chunks.length === 0) {
    return "질문과 직접 매칭된 내부 도감 정보 없음";
  }

  return chunks.join("\n");
}

function extractContent(data: ChatCompletionsResponse): string {
  const raw = data.choices?.[0]?.message?.content;
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (Array.isArray(raw)) {
    return raw
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitizeSpread(raw: unknown, fallback: StatSpread, max: number): StatSpread {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const read = (key: keyof StatSpread): number => {
    const target = value[key];
    if (typeof target !== "number" || !Number.isFinite(target)) {
      return fallback[key];
    }
    return Math.max(0, Math.min(max, Math.trunc(target)));
  };

  return {
    hp: read("hp"),
    atk: read("atk"),
    def: read("def"),
    spa: read("spa"),
    spd: read("spd"),
    spe: read("spe"),
  };
}

function sanitizeRole(raw: unknown): PokemonRole {
  if (raw === "sweeper" || raw === "bulky-sweeper" || raw === "wall" || raw === "support" || raw === "speed-control") {
    return raw;
  }
  return "sweeper";
}

function sanitizeSuggestedBuilds(raw: unknown): AiSuggestedBuild[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .slice(0, 6)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => ({
      nickname: typeof entry.nickname === "string" ? entry.nickname.trim() : "",
      pokemonName: typeof entry.pokemonName === "string" ? entry.pokemonName.trim() : "",
      role: sanitizeRole(entry.role),
      teraType: typeof entry.teraType === "string" ? entry.teraType.trim() : "",
      nature: typeof entry.nature === "string" ? entry.nature.trim() : "Jolly",
      ability: typeof entry.ability === "string" ? entry.ability.trim() : "",
      item: typeof entry.item === "string" ? entry.item.trim() : "",
      evs: sanitizeSpread(entry.evs, DEFAULT_EVS, 252),
      ivs: sanitizeSpread(entry.ivs, DEFAULT_IVS, 31),
      moves: Array.isArray(entry.moves)
        ? entry.moves.filter((move): move is string => typeof move === "string").map((move) => move.trim()).filter((move) => move.length > 0).slice(0, 4)
        : [],
      reason: typeof entry.reason === "string" ? entry.reason.trim() : "",
    }))
    .filter((entry) => entry.pokemonName.length > 0);
}

function parseStructuredResponse(raw: string): AiCoachStructuredResponse {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") {
    return { reply: raw.trim(), suggestedBuilds: [] };
  }

  const value = parsed as Record<string, unknown>;
  const reply = typeof value.reply === "string" && value.reply.trim().length > 0
    ? value.reply.trim()
    : raw.trim();

  return {
    reply,
    suggestedBuilds: sanitizeSuggestedBuilds(value.suggestedBuilds),
  };
}

async function callExternalLlm(args: {
  apiUrl: string;
  apiKey: string;
  model: string;
  userMessage: string;
  registeredContext: string;
  ragContext: string;
}): Promise<AiCoachStructuredResponse> {
  const { apiUrl, apiKey, model, userMessage, registeredContext, ragContext } = args;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "너는 포켓몬 SV 실전 코치다. 항상 한국어로 답하고, 확실하지 않은 내용은 추측하지 말고 불확실하다고 명시한다. 반드시 JSON 객체 하나만 출력한다.",
        },
        {
          role: "system",
          content: [
            "아래 내부 지식(RAG)은 이 앱의 우선 참조 데이터다.",
            "- 내부 지식에 없는 세부 룰/메타는 일반 지식으로 보완 가능",
            "- 단, 포켓몬/기술/특성/도구 명칭은 가능한 내부 지식과 일치시킬 것",
            "- 샘플 추천 요청이면 suggestedBuilds에 1~3개를 넣어라",
            "",
            "출력 JSON 스키마:",
            "{",
            "  \"reply\": \"string\",",
            "  \"suggestedBuilds\": [",
            "    {",
            "      \"nickname\": \"string\",",
            "      \"pokemonName\": \"string\",",
            "      \"role\": \"sweeper|bulky-sweeper|wall|support|speed-control\",",
            "      \"teraType\": \"string\",",
            "      \"nature\": \"string\",",
            "      \"ability\": \"string\",",
            "      \"item\": \"string\",",
            "      \"evs\": {\"hp\":0,\"atk\":0,\"def\":0,\"spa\":0,\"spd\":0,\"spe\":0},",
            "      \"ivs\": {\"hp\":31,\"atk\":31,\"def\":31,\"spa\":31,\"spd\":31,\"spe\":31},",
            "      \"moves\": [\"string\"],",
            "      \"reason\": \"string\"",
            "    }",
            "  ]",
            "}",
            "",
            "[등록 개체]",
            registeredContext,
            "",
            "[RAG 컨텍스트]",
            ragContext,
          ].join("\n"),
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API request failed (${response.status}): ${errorText.slice(0, 400)}`);
  }

  const data = (await response.json()) as ChatCompletionsResponse;
  const content = extractContent(data);

  if (!content) {
    throw new Error("LLM API returned empty content");
  }

  return parseStructuredResponse(content);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as AiCoachRequest;
    const userMessage = (payload.message ?? "").trim();
    if (!userMessage) {
      return NextResponse.json({ reply: "질문을 입력해 주세요.", suggestedBuilds: [], mode: "validation" });
    }

    const apiKey = process.env.AI_COACH_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        reply:
          "AI 연결 설정이 비어 있습니다. `web/.env.local`에 `AI_COACH_API_KEY`를 설정해 주세요. (예: OpenAI API 키)",
        suggestedBuilds: [],
        mode: "missing-api-key",
      });
    }

    const builds = sanitizeBuilds(payload.builds);
    const fullDex = await loadFullDexData();
    const registeredContext = buildRegisteredContext(builds);
    const ragContext = buildRagContext(userMessage, fullDex);

    const result = await callExternalLlm({
      apiUrl: DEFAULT_API_URL,
      apiKey,
      model: DEFAULT_MODEL,
      userMessage,
      registeredContext,
      ragContext,
    });

    return NextResponse.json({
      reply: result.reply,
      suggestedBuilds: result.suggestedBuilds,
      mode: "internet-llm-rag",
      model: DEFAULT_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    return NextResponse.json({
      reply: [
        "외부 AI 연결에 실패했습니다.",
        "확인할 항목:",
        "1) web/.env.local 의 AI_COACH_API_KEY",
        "2) AI_COACH_API_URL(기본: OpenAI Chat Completions)",
        "3) 네트워크/방화벽",
        "",
        `에러: ${message}`,
      ].join("\n"),
      suggestedBuilds: [],
      mode: "internet-llm-rag-error",
    });
  }
}
