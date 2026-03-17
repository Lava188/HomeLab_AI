export interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: string;
    citations?: string[];
  }
  
  export const mockSendMessage = async (text: string): Promise<Message> => {
    // Simulate network delay (700-1200ms)
    const delay = Math.floor(Math.random() * 500) + 700;
    await new Promise((resolve) => setTimeout(resolve, delay));
  
    // 30% chance to return citations
    const hasCitations = Math.random() < 0.3;
    const citations = hasCitations ? ['KB-12', 'KB-07'] : undefined;
  
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
    return {
      id: Date.now().toString(),
      role: 'assistant',
      text: `This is a simulated response to: "${text}". Please consult a healthcare professional for actual medical advice.`,
      timestamp,
      citations,
    };
  };
  
  /*
  Initial example messages for testing:
  [
    {
      id: '1',
      role: 'user',
      text: 'Hi, I need to book a blood test.',
      timestamp: '10:00 AM'
    },
    {
      id: '2',
      role: 'assistant',
      text: 'Hello! I can help you with that. What kind of blood test are you looking for?',
      timestamp: '10:01 AM'
    },
    {
      id: '3',
      role: 'user',
      text: 'A standard lipid panel.',
      timestamp: '10:02 AM'
    },
    {
      id: '4',
      role: 'user',
      text: 'Do I need to fast?',
      timestamp: '10:02 AM'
    },
    {
      id: '5',
      role: 'assistant',
      text: 'Yes, for a standard lipid panel, you typically need to fast for 9-12 hours before the test. You may drink water.',
      timestamp: '10:03 AM',
      citations: ['KB-04', 'KB-19']
    },
    {
      id: '6',
      role: 'assistant',
      text: 'Would you like to schedule it for tomorrow morning?',
      timestamp: '10:03 AM'
    }
  ]
  */
  