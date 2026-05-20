import { getDemoAuthHeaders } from '../auth/demoAuth';

export type SourceCitation =
  | string
  | {
      name?: string | null;
      source_name?: string | null;
      sourceName?: string | null;
      domain?: string | null;
      url?: string | null;
      source_url?: string | null;
      sourceUrl?: string | null;
      finalUrl?: string | null;
      final_url?: string | null;
      title?: string | null;
    };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citations?: SourceCitation[];
  variant?: 'default' | 'clarify';
  packageCandidates?: PackageSummary[];
  selectedPackage?: PackageSummary | null;
  meta?: {
    flow?: string;
    action?: string;
    routing?: {
      lowConfidenceGuard?: {
        triggered?: boolean;
        reason?: string | null;
      } | null;
    } | null;
  };
}

export type PackageSummary = {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  components?: string[];
  suitableFor?: string | null;
  preparationNotes?: string[];
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const CHAT_SESSION_KEY = 'homelab_chat_session_id';

type BackendChatData = {
  sessionId?: string;
  reply?: string;
  timestamp?: string;
  flow?: string;
  action?: string;
    meta?: {
    debug?: {
      runtimeMode?: string | null;
      queryExpansions?: string[];
      queryRewriteRules?: string[];
      topicIntent?: {
        topic?: string | null;
        score?: number;
      } | null;
      rewrittenQuery?: string | null;
    };
    routing?: {
      lowConfidenceGuard?: {
        triggered?: boolean;
        reason?: string | null;
      } | null;
    } | null;
    knowledgeItem?: {
      source?: string | null;
    };
    citations?: SourceCitation[];
    packageCandidates?: PackageSummary[];
    selectedPackage?: PackageSummary | null;
  };
};

type BackendChatResponse = {
  success: boolean;
  data?: BackendChatData;
  message?: string;
};

function generateSessionId() {
  return `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getOrCreateSessionId() {
  const existingSessionId = localStorage.getItem(CHAT_SESSION_KEY);

  if (existingSessionId) {
    return existingSessionId;
  }

  const newSessionId = generateSessionId();
  localStorage.setItem(CHAT_SESSION_KEY, newSessionId);
  return newSessionId;
}

export function clearChatSession() {
  localStorage.removeItem(CHAT_SESSION_KEY);
}

function buildTimestamp(isoTimestamp?: string) {
  const date = isoTimestamp ? new Date(isoTimestamp) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const mockSendMessage = async (text: string): Promise<Message> => {
  const sessionId = getOrCreateSessionId();

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getDemoAuthHeaders(),
      },
      body: JSON.stringify({
        message: text,
        sessionId,
      }),
    });

    const result: BackendChatResponse = await response.json();

    if (!response.ok || !result.success || !result.data) {
      return {
        id: Date.now().toString(),
        role: 'assistant',
        text:
          result.message ||
          'Không thể kết nối tới HomeLab backend. Vui lòng thử lại.',
        timestamp: buildTimestamp(),
      };
    }

    if (result.data.sessionId) {
      localStorage.setItem(CHAT_SESSION_KEY, result.data.sessionId);
    }

    const citations = result.data.meta?.knowledgeItem?.source
      ? [result.data.meta.knowledgeItem.source]
      : result.data.meta?.citations && result.data.meta.citations.length > 0
        ? result.data.meta.citations
        : undefined;
    const isClarifyingResponse =
      result.data.action === 'FALLBACK_RESPONSE' &&
      result.data.meta?.routing?.lowConfidenceGuard?.triggered === true;

    return {
      id: Date.now().toString(),
      role: 'assistant',
      text:
        result.data.reply ||
        'HomeLab hiện chưa có phản hồi phù hợp cho yêu cầu này.',
      timestamp: buildTimestamp(result.data.timestamp),
      citations: isClarifyingResponse ? undefined : citations,
      variant: isClarifyingResponse ? 'clarify' : 'default',
      packageCandidates: result.data.meta?.packageCandidates,
      selectedPackage: result.data.meta?.selectedPackage ?? null,
      meta: {
        flow: result.data.flow,
        action: result.data.action,
        routing: result.data.meta?.routing ?? null,
      },
    };
  } catch (error) {
    console.error('mockSendMessage error:', error);

    return {
      id: Date.now().toString(),
      role: 'assistant',
      text:
        'Không thể gọi API backend lúc này. Vui lòng kiểm tra backend server và thử lại.',
      timestamp: buildTimestamp(),
    };
  }
};
