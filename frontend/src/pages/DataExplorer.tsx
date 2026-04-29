// frontend/src/components/AIChat.tsx
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { MessageCircle, Send, Loader, X, Minimize2, Maximize2, Bot, Sparkles, TrendingUp, Map, CloudRain, Clock } from 'lucide-react';

const API = "http://127.0.0.1:5050";

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  data?: any;
  intent?: string;
}

const AIChat: React.FC = () => {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: "👋 Hello! I'm your **AI Assistant** specialized in road accident analysis. Feel free to ask me !!",
      timestamp: new Date(),
      intent: 'welcome',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll vers le dernier message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus sur l'input quand le chat s'ouvre
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API}/ai/ask`,
        { question: inputValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: response.data.answer,
        timestamp: new Date(),
        data: response.data.data,
        intent: response.data.intent,
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error calling AI:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: "❌ Sorry, an error occurred. Please try again later.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getIntentIcon = (intent?: string) => {
    switch(intent) {
      case 'compare_years': return <TrendingUp size={12} />;
      case 'state_analysis': return <Map size={12} />;
      case 'weather_analysis': return <CloudRain size={12} />;
      case 'temporal_analysis': return <Clock size={12} />;
      default: return <Sparkles size={12} />;
    }
  };

  // Styles utilisant les variables CSS de l'application (comme dans DataExplorerPage)
  const styles = {
    container: {
      position: 'fixed' as const,
      bottom: '24px',
      right: '24px',
      width: isMinimized ? 'auto' : '450px',
      height: isMinimized ? 'auto' : '650px',
      maxHeight: '85vh',
      backgroundColor: 'var(--surface, #ffffff)',
      borderRadius: '20px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
      zIndex: 1000,
      fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
      border: '1px solid var(--border, #e2e8f0)',
    },
    header: {
      padding: '16px 20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: 'pointer',
    },
    messagesContainer: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '20px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      backgroundColor: 'var(--surface2, #f8fafc)',
    },
    userMessage: {
      maxWidth: '85%',
      padding: '12px 16px',
      borderRadius: '20px 20px 4px 20px',
      backgroundColor: '#667eea',
      color: 'white',
      fontSize: '14px',
      lineHeight: 1.6,
      wordBreak: 'break-word' as const,
      boxShadow: '0 2px 5px rgba(102,126,234,0.3)',
    },
    botMessage: {
      maxWidth: '85%',
      padding: '12px 16px',
      borderRadius: '20px 20px 20px 4px',
      backgroundColor: 'var(--surface, #ffffff)',
      color: 'var(--text-main, #1e293b)',
      fontSize: '14px',
      lineHeight: 1.6,
      wordBreak: 'break-word' as const,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid var(--border, #e2e8f0)',
    },
    cardData: {
      backgroundColor: 'var(--surface2, #f1f5f9)',
      borderRadius: '12px',
      padding: '12px',
      marginTop: '12px',
      border: '1px solid var(--border, #e2e8f0)',
    },
    cardTitle: {
      fontWeight: 600,
      marginBottom: '8px',
      color: 'var(--text-muted, #64748b)',
      fontSize: '11px',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    tableHeader: {
      textAlign: 'left' as const,
      padding: '6px 4px',
      color: 'var(--text-muted, #64748b)',
    },
    tableHeaderRight: {
      textAlign: 'right' as const,
      padding: '6px 4px',
      color: 'var(--text-muted, #64748b)',
    },
    inputContainer: {
      padding: '16px 20px',
      borderTop: '1px solid var(--border, #e2e8f0)',
      backgroundColor: 'var(--surface, #ffffff)',
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-end' as const,
    },
    textarea: {
      flex: 1,
      padding: '12px 16px',
      borderRadius: '24px',
      border: '1px solid var(--border, #e2e8f0)',
      backgroundColor: 'var(--surface2, #f8fafc)',
      color: 'var(--text-main, #1e293b)',
      fontSize: '13px',
      resize: 'none' as const,
      fontFamily: "'Inter', system-ui, sans-serif",
      outline: 'none',
      transition: 'border-color 0.2s',
    },
    sendButton: {
      width: '42px',
      height: '42px',
      borderRadius: '21px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 0.2s',
    },
    suggestionsContainer: {
      padding: '12px 20px 16px 20px',
      borderTop: '1px solid var(--border, #e2e8f0)',
      backgroundColor: 'var(--surface2, #f8fafc)',
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: '3px',
    },
    suggestionButton: {
      fontSize: '11px',
      padding: '6px 14px',
      borderRadius: '20px',
      backgroundColor: 'var(--surface, #ffffff)',
      border: '1px solid var(--border, #e2e8f0)',
      color: 'var(--text-muted, #475569)',
      cursor: 'pointer',
      transition: 'all 0.2s',
      fontWeight: 500,
    },
    loadingMessage: {
      padding: '12px 18px',
      borderRadius: '20px 20px 20px 4px',
      backgroundColor: 'var(--surface, #ffffff)',
      border: '1px solid var(--border, #e2e8f0)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    loadingText: {
      fontSize: '13px',
      color: 'var(--text-muted, #64748b)',
    },
    timeStamp: {
      fontSize: '10px',
      marginTop: '8px',
      opacity: 0.6,
      fontFamily: 'monospace',
    },
    botHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginBottom: '8px',
      fontSize: '11px',
      color: 'var(--text-muted, #94a3b8)',
    },
    suggestionText: {
      fontSize: '11px',
      color: 'var(--text-muted, #94a3b8)',
      marginRight: '4px',
    },
  };

  // Bouton flottant pour ouvrir le chat
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          zIndex: 1000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.4)';
        }}
      >
        <MessageCircle size={28} color="white" />
      </button>
    );
  }

  // Fenêtre de chat
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header} onClick={() => setIsMinimized(!isMinimized)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: '12px',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={18} />
          </div>
          <div>
            <span style={{ fontWeight: 600, fontSize: '15px' }}>Accident Analyst AI</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {isMinimized ? (
            <Maximize2 size={16} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }} />
          ) : (
            <Minimize2 size={16} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }} />
          )}
          <X size={16} style={{ cursor: 'pointer' }} onClick={() => setIsOpen(false)} />
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div style={styles.messagesContainer}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={message.type === 'user' ? styles.userMessage : styles.botMessage}>
                  {message.type === 'bot' && (
                    <div style={styles.botHeader}>
                      {getIntentIcon(message.intent)}
                      <span>AI Assistant</span>
                    </div>
                  )}
                  
                  <div style={{ whiteSpace: 'pre-wrap', fontFamily: "'Inter', system-ui, sans-serif" }}>
                    {message.content}
                  </div>
                  
                  {/* Display data in a nice card format */}
                  {message.data && message.data.length > 0 && message.data[0]?.year && (
                    <div style={styles.cardData}>
                      <div style={styles.cardTitle}>📊 Analyzed Data</div>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border, #cbd5e1)' }}>
                            <th style={styles.tableHeader}>Year</th>
                            <th style={styles.tableHeaderRight}>Accidents</th>
                          </tr>
                        </thead>
                        <tbody>
                          {message.data.map((row: any, index: number) => (
                            <tr key={index} style={{ borderBottom: index < message.data.length - 1 ? '1px solid var(--border, #e2e8f0)' : 'none' }}>
                              <td style={{ padding: '6px 4px', fontWeight: 500 }}>{row.year}</td>
                              <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(row.accidents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Display top factors data */}
                  {message.data && message.data.top_factors && (
                    <div style={styles.cardData}>
                      <div style={styles.cardTitle}>🎯 Key Factors Identified</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {message.data.top_factors.weather && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px' }}>🌤️ Weather</span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#667eea' }}>{message.data.top_factors.weather.percentage}%</span>
                          </div>
                        )}
                        {message.data.top_factors.temporal && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px' }}>⏰ Time Period</span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#667eea' }}>{message.data.top_factors.temporal.percentage}%</span>
                          </div>
                        )}
                        {message.data.top_factors.region && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px' }}>📍 Region</span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#667eea' }}>{message.data.top_factors.region.percentage}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div style={styles.timeStamp}>
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={styles.loadingMessage}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} color="#667eea" />
                  <span style={styles.loadingText}>AI is analyzing your question...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={styles.inputContainer}>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask your question..."
              rows={1}
              style={styles.textarea}
              onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)'}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputValue.trim()}
              style={{
                ...styles.sendButton,
                cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
                opacity: isLoading || !inputValue.trim() ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading && inputValue.trim()) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Send size={18} color="white" />
            </button>
          </div>

          {/* Suggestions */}
          <div style={styles.suggestionsContainer}>
            <span style={styles.suggestionText}>💡 Suggestions:</span>
            {[
              "Compare 2016 and 2022",
              "Which states are the most dangerous?",
              "What is the weather impact on accidents?",
              "What is the most impactful factor affecting accidents?",
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setInputValue(suggestion);
                  inputRef.current?.focus();
                }}
                style={styles.suggestionButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.color = '#667eea';
                  e.currentTarget.style.backgroundColor = 'var(--surface2, #f0f4ff)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)';
                  e.currentTarget.style.color = 'var(--text-muted, #475569)';
                  e.currentTarget.style.backgroundColor = 'var(--surface, #ffffff)';
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default AIChat;

// Ajoutez cette animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);