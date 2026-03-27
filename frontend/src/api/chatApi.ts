export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citations?: string[];
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const CHAT_SESSION_KEY = 'homelab_chat_session_id';

type BackendChatData = {
  sessionId?: string;
  reply?: string;
  timestamp?: string;
  meta?: {
    knowledgeItem?: {
      source?: string | null;
    };
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
      : undefined;

    return {
      id: Date.now().toString(),
      role: 'assistant',
      text:
        result.data.reply ||
        'HomeLab hiện chưa có phản hồi phù hợp cho yêu cầu này.',
      timestamp: buildTimestamp(result.data.timestamp),
      citations,
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