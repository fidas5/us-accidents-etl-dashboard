// frontend/src/components/AIChat.tsx (version corrigée pour compare_years)
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { MessageCircle, Send, Loader, X, Minimize2, Maximize2, Bot, Sparkles, TrendingUp, Map, CloudRain, Clock, AlertTriangle } from 'lucide-react';

const API = "http://127.0.0.1:5050";

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  data?: any;
  analysis?: any;
  intent?: string;
  duration_data?: any;
  yearly_changes?: any;
  growth?: any;
}

const AIChat: React.FC = () => {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: "👋 Hello! I'm your **AI Assistant** specialized in road accident analysis. Feel free to ask me!",
      timestamp: new Date(),
      intent: 'welcome',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        content: response.data.answer || response.data.analysis?.summary || "Analysis completed",
        timestamp: new Date(),
        data: response.data.data,
        analysis: response.data.analysis,
        intent: response.data.intent,
        duration_data: response.data.duration_data,
        yearly_changes: response.data.yearly_changes,
        growth: response.data.growth,
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
      case 'factor_analysis': return <Sparkles size={12} />;
      case 'severity_analysis': return <AlertTriangle size={12} />;
      default: return <Sparkles size={12} />;
    }
  };

  const isDarkMode = () => {
    if (typeof window !== 'undefined') {
      return document.body.classList.contains('dark') || 
             localStorage.getItem('theme') === 'dark';
    }
    return false;
  };

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(isDarkMode());
    const observer = new MutationObserver(() => {
      setIsDark(isDarkMode());
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const colors = {
    background: isDark ? '#1e1e2e' : '#ffffff',
    surface: isDark ? '#2a2a3a' : '#f8fafc',
    border: isDark ? '#3a3a4a' : '#e2e8f0',
    text: isDark ? '#e0e0e0' : '#1e293b',
    textMuted: isDark ? '#888888' : '#64748b',
    botBg: isDark ? '#2a2a3a' : '#ffffff',
    userBg: '#667eea',
    cardBg: isDark ? '#1e1e2e' : '#f1f5f9',
  };

  const chatStyles = {
    container: {
      position: 'fixed' as const,
      bottom: '24px',
      right: '24px',
      width: isMinimized ? 'auto' : '450px',
      height: isMinimized ? 'auto' : '650px',
      maxHeight: '85vh',
      backgroundColor: colors.background,
      borderRadius: '20px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
      zIndex: 1000,
      fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
      border: `1px solid ${colors.border}`,
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
      backgroundColor: colors.surface,
    },
    userMessage: {
      maxWidth: '85%',
      padding: '12px 16px',
      borderRadius: '20px 20px 4px 20px',
      backgroundColor: colors.userBg,
      color: 'white',
      fontSize: '14px',
      lineHeight: 1.5,
      wordBreak: 'break-word' as const,
      boxShadow: '0 2px 5px rgba(102,126,234,0.3)',
    },
    botMessage: {
      maxWidth: '85%',
      padding: '12px 16px',
      borderRadius: '20px 20px 20px 4px',
      backgroundColor: colors.botBg,
      color: colors.text,
      fontSize: '14px',
      lineHeight: 1.5,
      wordBreak: 'break-word' as const,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: `1px solid ${colors.border}`,
    },
    cardData: {
      backgroundColor: colors.cardBg,
      borderRadius: '8px',
      padding: '12px',
      marginTop: '10px',
      border: `1px solid ${colors.border}`,
    },
    inputContainer: {
      padding: '14px 18px',
      borderTop: `1px solid ${colors.border}`,
      backgroundColor: colors.background,
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-end' as const,
    },
    textarea: {
      flex: 1,
      padding: '10px 14px',
      borderRadius: '20px',
      border: `1px solid ${colors.border}`,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: '13px',
      resize: 'none' as const,
      fontFamily: "'Inter', system-ui, sans-serif",
      outline: 'none',
      transition: 'border-color 0.2s',
    },
    sendButton: {
      width: '38px',
      height: '38px',
      borderRadius: '19px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 0.2s',
      cursor: 'pointer',
    },
    suggestionsContainer: {
      padding: '10px 18px 14px 18px',
      borderTop: `1px solid ${colors.border}`,
      backgroundColor: colors.surface,
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: '6px',
    },
    suggestionButton: {
      fontSize: '11px',
      padding: '5px 12px',
      borderRadius: '16px',
      backgroundColor: colors.background,
      border: `1px solid ${colors.border}`,
      color: colors.textMuted,
      cursor: 'pointer',
      transition: 'all 0.2s',
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    loadingMessage: {
      padding: '10px 16px',
      borderRadius: '20px 20px 20px 4px',
      backgroundColor: colors.botBg,
      border: `1px solid ${colors.border}`,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    loadingText: {
      fontSize: '12px',
      color: colors.textMuted,
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    timeStamp: {
      fontSize: '10px',
      marginTop: '6px',
      opacity: 0.6,
      fontFamily: 'monospace',
      textAlign: 'right' as const,
    },
    botHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      marginBottom: '6px',
      fontSize: '10px',
      color: colors.textMuted,
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    suggestionText: {
      fontSize: '10px',
      color: colors.textMuted,
      fontFamily: "'Inter', system-ui, sans-serif",
    },
  };

  // =========================================================
  // RENDER FUNCTIONS
  // =========================================================

  const renderKeyObservation = (observation: string) => {
    if (!observation) return null;
    return (
      <div style={chatStyles.cardData}>
        <div style={{ fontWeight: 600, marginBottom: '6px', color: '#667eea', fontSize: '10px', textTransform: 'uppercase' }}>
          🔍 Key Observation
        </div>
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: colors.text }}>
          {observation}
        </div>
      </div>
    );
  };

  const renderRecommendations = (recommendations: string[]) => {
    if (!recommendations || recommendations.length === 0) return null;
    return (
      <div style={{ ...chatStyles.cardData, backgroundColor: isDark ? '#1a2a3a' : '#e8f4f8', borderColor: '#667eea' }}>
        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#667eea', fontSize: '11px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>💡</span> Recommendations
        </div>
        {recommendations.map((rec, idx) => (
          <div key={idx} style={{ fontSize: '12px', marginBottom: '6px', paddingLeft: '16px', position: 'relative', lineHeight: 1.5 }}>
            <span style={{ position: 'absolute', left: '0', color: '#667eea', fontWeight: 'bold' }}>{idx + 1}.</span> 
            {rec}
          </div>
        ))}
      </div>
    );
  };

  const renderYearComparison = (data: any[], growth?: any, yearlyChanges?: any[], analysis?: any) => {
    if (!data || data.length === 0) return null;
    
    // Trier par année
    const sortedData = [...data].sort((a, b) => a.year - b.year);
    
    return (
      <>
        {/* Key Observation */}
        {analysis?.key_observation && renderKeyObservation(analysis.key_observation)}
        
        {/* Data Table */}
        <div style={chatStyles.cardData}>
          <div style={{ fontWeight: 600, marginBottom: '8px', color: colors.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>
            📊 Year-by-Year Comparison
          </div>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: colors.textMuted }}>Year</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>Accidents</th>
                {yearlyChanges && yearlyChanges.length > 0 && (
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>Change</th>
                )}
               </tr>
            </thead>
            <tbody>
              {sortedData.map((row, idx) => {
                const change = yearlyChanges?.find((c: any) => c.year === row.year);
                return (
                  <tr key={idx} style={{ borderBottom: idx < sortedData.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                    <td style={{ padding: '6px 4px', fontWeight: 500 }}>{row.year}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(row.accidents)}</td>
                    {yearlyChanges && (
                      <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {change?.change_percentage ? (
                          <span style={{ color: change.change_percentage > 0 ? '#ef4444' : '#22c55e' }}>
                            {change.change_percentage > 0 ? '+' : ''}{change.change_percentage}%
                          </span>
                        ) : idx === 0 ? '-' : 
                          change?.change_absolute ? (
                            <span style={{ color: change.change_absolute > 0 ? '#ef4444' : '#22c55e' }}>
                              {change.change_absolute > 0 ? '+' : ''}{formatNumber(change.change_absolute)}
                            </span>
                          ) : '-'
                        }
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {growth && growth.growth_percentage && (
            <div style={{ marginTop: '8px', fontSize: '11px', textAlign: 'center', padding: '6px', backgroundColor: colors.cardBg, borderRadius: '6px' }}>
              📈 Overall growth: <strong style={{ color: '#667eea' }}>{growth.growth_percentage}%</strong> from {growth.first_year} to {growth.last_year}
            </div>
          )}
        </div>
        
        {/* Recommendations */}
        {analysis?.recommendations && renderRecommendations(analysis.recommendations)}
      </>
    );
  };

  const renderStateAnalysis = (data: any[]) => {
    if (!data || data.length === 0) return null;
    return (
      <div style={chatStyles.cardData}>
        <div style={{ fontWeight: 600, marginBottom: '8px', color: colors.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>
          📍 Top States by Accidents
        </div>
        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 4px', color: colors.textMuted }}>Rank</th>
              <th style={{ textAlign: 'left', padding: '6px 4px', color: colors.textMuted }}>State</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>Accidents</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 10).map((row, idx) => (
              <tr key={idx} style={{ borderBottom: idx < 9 ? `1px solid ${colors.border}` : 'none' }}>
                <td style={{ padding: '6px 4px', color: colors.textMuted, fontWeight: 500 }}>#{idx + 1}</td>
                <td style={{ padding: '6px 4px', fontWeight: 500 }}>{row.state || row.region}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(row.accidents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data[0] && (
          <div style={{ marginTop: '8px', fontSize: '10px', color: colors.textMuted, fontStyle: 'italic' }}>
            🏆 {data[0].state || data[0].region} has the highest number of accidents
          </div>
        )}
      </div>
    );
  };

  const renderWeatherAnalysis = (data: any[]) => {
    if (!data || data.length === 0) return null;
    return (
      <div style={chatStyles.cardData}>
        <div style={{ fontWeight: 600, marginBottom: '8px', color: colors.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>
          🌤️ Weather Impact on Accidents
        </div>
        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 4px', color: colors.textMuted }}>Condition</th>
              <th style={{ textAlign: 'left', padding: '6px 4px', color: colors.textMuted }}>Temp</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>Accidents</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>%</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 7).map((row, idx) => (
              <tr key={idx} style={{ borderBottom: idx < 6 ? `1px solid ${colors.border}` : 'none' }}>
                <td style={{ padding: '6px 4px' }}>{row.weather || row.condition}</td>
                <td style={{ padding: '6px 4px' }}>{row.temp_bucket || row.temp}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(row.accidents)}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#667eea' }}>{row.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSeverityAnalysis = (data: any[], durationData: any[]) => {
    if (!data || data.length === 0) return null;
    const order = { 'Low': 1, 'Moderate': 2, 'High': 3, 'Critical': 4 };
    const sortedData = [...data].sort((a, b) => (order[a.severity] || 0) - (order[b.severity] || 0));
    
    return (
      <div style={chatStyles.cardData}>
        <div style={{ fontWeight: 600, marginBottom: '8px', color: colors.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>
          ⚠️ Severity Distribution
        </div>
        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 4px', color: colors.textMuted }}>Severity</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>Accidents</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>Percentage</th>
              {durationData && <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>Avg Duration (min)</th>}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => {
              const duration = durationData?.find((d: any) => d.severity === row.severity);
              const severityColor = row.severity === 'Critical' ? '#ef4444' : row.severity === 'High' ? '#f97316' : row.severity === 'Moderate' ? '#eab308' : '#22c55e';
              return (
                <tr key={idx} style={{ borderBottom: idx < sortedData.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                  <td style={{ padding: '6px 4px', fontWeight: 500, color: severityColor }}>{row.severity}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(row.accidents)}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#667eea' }}>{row.percentage}%</td>
                  {durationData && (
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {duration?.avg_duration_min ? `${duration.avg_duration_min} min` : '-'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFactorAnalysis = (data: any, analysis: any, top_factors: any) => {
    if (!data) return null;

    return (
      <>
        {/* Observations */}
        {analysis?.observations && analysis.observations.length > 0 && (
          <div style={chatStyles.cardData}>
            <div style={{ fontWeight: 600, marginBottom: '8px', color: colors.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>
              🔍 Key Observations
            </div>
            {analysis.observations.map((obs: string, idx: number) => (
              <div key={idx} style={{ fontSize: '12px', marginBottom: '8px', paddingLeft: '12px', position: 'relative', lineHeight: 1.5 }}>
                <span style={{ position: 'absolute', left: '0', color: '#667eea' }}>•</span> 
                {obs}
              </div>
            ))}
          </div>
        )}

        {/* Weather Impact Table */}
        {data.weather_impact && data.weather_impact.length > 0 && (
          <div style={chatStyles.cardData}>
            <div style={{ fontWeight: 600, marginBottom: '8px', color: colors.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>
              🌤️ Weather Impact (Top 5)
            </div>
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={{ textAlign: 'left', padding: '6px 4px', color: colors.textMuted }}>Condition</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>Accidents</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: colors.textMuted }}>%</th>
                </tr>
              </thead>
              <tbody>
                {data.weather_impact.slice(0, 5).map((row: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: idx < 4 ? `1px solid ${colors.border}` : 'none' }}>
                    <td style={{ padding: '6px 4px' }}>{row.condition}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(row.accidents)}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace', color: '#667eea' }}>{row.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Top Factors Summary */}
        {top_factors && (
          <div style={chatStyles.cardData}>
            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#667eea', fontSize: '11px', textTransform: 'uppercase' }}>
              🎯 Top Factors Summary
            </div>
            {top_factors.weather && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px' }}>🌤️ Weather</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#667eea' }}>{top_factors.weather.percentage}%</span>
              </div>
            )}
            {top_factors.temporal && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px' }}>⏰ Time Period</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#667eea' }}>{top_factors.temporal.percentage}%</span>
              </div>
            )}
            {top_factors.region && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px' }}>📍 Region</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#667eea' }}>{top_factors.region.percentage}%</span>
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {analysis?.recommendations && renderRecommendations(analysis.recommendations)}
      </>
    );
  };

  const renderDataByIntent = (message: Message) => {
    const { intent, data, analysis, duration_data, yearly_changes, growth } = message;
    
    switch(intent) {
      case 'compare_years':
        return renderYearComparison(data, growth, yearly_changes, analysis);
      case 'state_analysis':
        return renderStateAnalysis(data);
      case 'weather_analysis':
        return renderWeatherAnalysis(data);
      case 'severity_analysis':
        return renderSeverityAnalysis(data, duration_data);
      case 'factor_analysis':
        return renderFactorAnalysis(data, analysis, message.data?.top_factors);
      default:
        if (data && Array.isArray(data) && data.length > 0 && data[0]?.year) {
          return renderYearComparison(data, growth, yearly_changes, analysis);
        }
        return null;
    }
  };

  // Bouton flottant
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
    <div style={chatStyles.container}>
      <div style={chatStyles.header} onClick={() => setIsMinimized(!isMinimized)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: '10px',
            padding: '5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={16} />
          </div>
          <div>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Accident Analyst AI</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <X size={14} style={{ cursor: 'pointer' }} onClick={() => setIsOpen(false)} />
        </div>
      </div>

      {!isMinimized && (
        <>
          <div style={chatStyles.messagesContainer}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={message.type === 'user' ? chatStyles.userMessage : chatStyles.botMessage}>
                  {message.type === 'bot' && (
                    <div style={chatStyles.botHeader}>
                      {getIntentIcon(message.intent)}
                      <span>AI Assistant</span>
                    </div>
                  )}
                  
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {message.content}
                  </div>
                  
                  {renderDataByIntent(message)}
                  
                  <div style={chatStyles.timeStamp}>
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={chatStyles.loadingMessage}>
                  <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} color="#667eea" />
                  <span style={chatStyles.loadingText}>AI is analyzing your question...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <div style={chatStyles.inputContainer}>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask your question..."
              rows={1}
              style={chatStyles.textarea}
              onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
              onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputValue.trim()}
              style={{
                ...chatStyles.sendButton,
                opacity: isLoading || !inputValue.trim() ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading && inputValue.trim()) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Send size={16} color="white" />
            </button>
          </div>

          <div style={chatStyles.suggestionsContainer}>
            <span style={chatStyles.suggestionText}>💡 Suggestions:</span>
            {[
              "Compare 2016 and 2022",
              "Which states are the most dangerous?",
              "What is the weather impact on accidents?",
              "What is the most impactful factor?",
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setInputValue(suggestion);
                  inputRef.current?.focus();
                }}
                style={chatStyles.suggestionButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.color = '#667eea';
                  e.currentTarget.style.backgroundColor = colors.surface;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.color = colors.textMuted;
                  e.currentTarget.style.backgroundColor = colors.background;
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