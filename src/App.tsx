import { useState, useRef, useMemo, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Send, Brain, Loader2, FileText, Image as ImageIcon, Video, Mic, X, Archive, Square, Link as LinkIcon, Search, Download, Edit2, History, Save, PlusCircle, Menu, Clock, Mail } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import JSZip from 'jszip';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
# PERSONA
Você é o "Cérebro Digital" pessoal do usuário. Sua função é atuar como um sistema avançado de Gerenciamento de Conhecimento Pessoal (PKM). Você recebe entradas multimodais (texto, áudio, imagem e vídeo) e as transforma em conhecimento estruturado, acionável e organizado.

# DIRETRIZES DE PROCESSAMENTO
Sempre que receber um arquivo ou texto, siga este protocolo de extração:

1. IDENTIFICAÇÃO: Determine o tipo de entrada (Pensamento rápido, Reunião, Print, Tutorial, Recibo, Conversa de WhatsApp, E-mail, etc.).
2. TRANSCRIÇÃO/DESCRIÇÃO: 
   - Áudio: Transcreva fielmente, mas corrija vícios de linguagem.
   - Imagem/Print: Realize OCR para extrair textos e descreva elementos visuais relevantes.
   - Vídeo: Resuma os pontos principais e momentos-chave.
3. EXTRAÇÃO DE DADOS E ORGANIZAÇÃO: 
   - Identifique: Nomes de pessoas, datas, valores, links, marcas, locais e CONCESSIONÁRIAS.
   - **CRÍTICO:** Organize todas as solicitações e demandas agrupando-as explicitamente por **Concessionária** e, dentro de cada uma, por **Pessoa** responsável ou envolvida.
4. CATEGORIZAÇÃO: Atribua tags lógicas.

# FORMATO DE SAÍDA (PADRÃO)
Sempre responda estruturando a informação da seguinte forma:

---
## 📥 Resumo da Entrada
[Breve frase descrevendo o que foi enviado]

## 🏢 Demandas por Concessionária e Pessoa
[Agrupe as informações extraídas aqui. Exemplo:
**[Nome da Concessionária A]**
- **[Nome da Pessoa 1]:** [Solicitação/Demanda]
- **[Nome da Pessoa 2]:** [Solicitação/Demanda]

**[Nome da Concessionária B]**
- **[Nome da Pessoa 3]:** [Solicitação/Demanda]]

## 📝 Outros Detalhes
[Outros pontos principais que não são demandas específicas]

## 🚀 Próximos Passos / Ações
- [ ] Listar tarefas gerais.
- [ ] Agendar [Data/Hora] se mencionado.

## ✉️ Mensagem Pronta para Envio
[Elabore um rascunho de mensagem profissional, clara e cordial. A mensagem deve resumir as demandas organizadas acima, estando pronta para ser copiada e enviada por e-mail ou WhatsApp para a equipe ou responsáveis.]

## 🗂️ Metadados & Organização
- **Tags:** #exemplo
- **Contexto:** [ex: Urgente, Acompanhamento]
---

# REGRAS CRÍTICAS
- A mensagem para envio deve ser educada, direta e listar claramente o que cada pessoa precisa fazer em cada concessionária.
- Se não houver concessionária clara, agrupe apenas por pessoa ou assunto.
`;

type EditHistoryItem = {
  timestamp: Date;
  content: string;
};

type Entry = {
  id: string;
  date: Date;
  input: {
    text: string;
    files?: { name: string; type: string }[];
  };
  output: string;
  editHistory?: EditHistoryItem[];
};

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<'home' | 'search'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Edit State
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchGmailMessages();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectGmail = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      
      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        alert('Por favor, permita popups para conectar sua conta do Gmail.');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      alert('Erro ao iniciar conexão com Gmail. Verifique se as variáveis de ambiente GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET estão configuradas.');
    }
  };

  const fetchGmailMessages = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/gmail/messages');
      if (response.status === 401) {
        handleConnectGmail();
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch emails');
      
      const { emails } = await response.json();
      
      if (emails && emails.length > 0) {
        const emailText = emails.map((e: any) => 
          `De: ${e.from}\nAssunto: ${e.subject}\nData: ${e.date}\nResumo: ${e.snippet}\n---`
        ).join('\n\n');

        const prompt = `Aqui estão meus últimos e-mails do Gmail. Por favor, processe-os como uma entrada única, extraindo as informações mais importantes, compromissos ou tarefas pendentes.\n\n${emailText}`;

        const genResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: { parts: [{ text: prompt }] },
          config: { systemInstruction: SYSTEM_INSTRUCTION }
        });

        const newEntry: Entry = {
          id: crypto.randomUUID(),
          date: new Date(),
          input: {
            text: "Importação de e-mails recentes do Gmail.",
          },
          output: genResponse.text || 'Nenhum conteúdo gerado.',
          editHistory: []
        };

        setEntries(prev => [newEntry, ...prev]);
        setActiveTab('home');
      } else {
        alert("Nenhum e-mail recente encontrado.");
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao buscar e-mails.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => {
        const combined = [...prev, ...newFiles];
        if (combined.length > 15) {
          alert('Você pode anexar no máximo 15 arquivos por vez.');
          return combined.slice(0, 15);
        }
        return combined;
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `gravacao_audio_${Date.now()}.webm`, { type: 'audio/webm' });
        setSelectedFiles(prev => {
          const combined = [...prev, audioFile];
          if (combined.length > 15) {
            alert('Limite de 15 arquivos atingido.');
            return combined.slice(0, 15);
          }
          return combined;
        });
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Erro ao acessar microfone", err);
      alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = async () => {
    if (!inputText.trim() && selectedFiles.length === 0) return;

    setIsLoading(true);
    try {
      const parts: any[] = [];
      
      if (inputText.trim()) {
        parts.push({ text: inputText });
      }

      if (selectedFiles.length > 0) {
        // Optimize file processing with Promise.all
        const fileParts = await Promise.all(selectedFiles.map(async (file) => {
          if (file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.rar')) {
            const zip = new JSZip();
            const loadedZip = await zip.loadAsync(file);
            let zipContentText = `Conteúdo do arquivo ZIP '${file.name}':\n\n`;
            
            for (const [filename, zipEntry] of Object.entries(loadedZip.files)) {
              if (!zipEntry.dir) {
                if (filename.match(/\.(txt|md|csv|json|js|ts|html|css|xml)$/i)) {
                  const content = await zipEntry.async('string');
                  zipContentText += `--- Arquivo: ${filename} ---\n${content}\n\n`;
                } else {
                  zipContentText += `--- Arquivo: ${filename} (Formato não lido como texto) ---\n\n`;
                }
              }
            }
            return { text: zipContentText };
          } else {
            const base64 = await fileToBase64(file);
            const base64Data = base64.split(',')[1];
            return {
              inlineData: {
                data: base64Data,
                mimeType: file.type || 'application/octet-stream'
              }
            };
          }
        }));
        
        parts.push(...fileParts);
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ urlContext: {} }]
        }
      });

      const newEntry: Entry = {
        id: crypto.randomUUID(),
        date: new Date(),
        input: {
          text: inputText,
          files: selectedFiles.map(f => ({ name: f.name, type: f.type }))
        },
        output: response.text || 'Nenhum conteúdo gerado.',
        editHistory: []
      };

      setEntries(prev => [newEntry, ...prev]);
      setInputText('');
      setSelectedFiles([]);
      setActiveTab('home');
      if (isMobileMenuOpen) setIsMobileMenuOpen(false);
    } catch (error) {
      console.error("Error processing input:", error);
      alert("Ocorreu um erro ao processar sua entrada. Verifique o console para mais detalhes.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(entries, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cerebro_digital_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startEditing = (entry: Entry) => {
    setEditingEntryId(entry.id);
    setEditingContent(entry.output);
  };

  const saveEdit = (id: string) => {
    setEntries(prev => prev.map(e => {
      if (e.id === id) {
        const history = e.editHistory || [];
        return {
          ...e,
          output: editingContent,
          editHistory: [...history, { timestamp: new Date(), content: e.output }]
        };
      }
      return e;
    }));
    setEditingEntryId(null);
  };

  const getFileIcon = (type?: string, name?: string) => {
    if (name?.toLowerCase().endsWith('.zip') || name?.toLowerCase().endsWith('.rar')) return <Archive className="w-4 h-4" />;
    if (!type) return <FileText className="w-4 h-4" />;
    if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
    if (type.startsWith('video/')) return <Video className="w-4 h-4" />;
    if (type.startsWith('audio/')) return <Mic className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const filteredEntries = useMemo(() => {
    if (activeTab !== 'search' || !searchQuery.trim()) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter(e => 
      e.input.text.toLowerCase().includes(query) ||
      e.output.toLowerCase().includes(query) ||
      e.input.files?.some(f => f.name.toLowerCase().includes(query))
    );
  }, [entries, activeTab, searchQuery]);

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-gray-200 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm">
          <Brain className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-gray-900 leading-tight">Cérebro Digital</h1>
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Seu PKM Pessoal</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <button 
          onClick={() => { setActiveTab('home'); setIsMobileMenuOpen(false); }} 
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'home' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <PlusCircle className="w-4 h-4" /> Nova Entrada
        </button>
        <button 
          onClick={() => { setActiveTab('search'); setIsMobileMenuOpen(false); }} 
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'search' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <Search className="w-4 h-4" /> Buscar ({entries.length})
        </button>
      </nav>
      <div className="p-4 border-t border-gray-200">
        <button 
          onClick={handleExport} 
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" /> Exportar Dados
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[#f5f5f5] text-gray-900 font-sans overflow-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col z-20">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/20 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      
      {/* Mobile Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col z-50 transform transition-transform duration-300 md:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-blue-600" />
            <h1 className="font-bold text-gray-900">Cérebro Digital</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1 text-gray-600 hover:bg-gray-100 rounded-lg">
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-3xl mx-auto flex flex-col gap-8 pb-20">
            
            {/* Search Tab Header */}
            {activeTab === 'search' && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Buscar em suas anotações, tags ou arquivos..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {/* Input Section (Home Tab Only) */}
            {activeTab === 'home' && (
              <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
                <div className="p-4">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Cole um texto, link, anotação ou grave um áudio..."
                    className="w-full min-h-[120px] resize-none outline-none text-gray-700 placeholder:text-gray-400 text-lg"
                    disabled={isLoading || isRecording}
                  />
                  
                  {selectedFiles.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                          <div className="text-blue-600">
                            {getFileIcon(file.type, file.name)}
                          </div>
                          <div className="flex flex-col max-w-[120px]">
                            <span className="text-xs font-medium text-gray-700 truncate" title={file.name}>{file.name}</span>
                            <span className="text-[10px] text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                          <button 
                            onClick={() => removeFile(index)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            disabled={isLoading}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.rar"
                      multiple
                      disabled={isLoading || isRecording}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      disabled={isLoading || isRecording}
                      title="Anexar Arquivos (Até 15)"
                    >
                      <Upload className="w-4 h-4" />
                      <span className="hidden sm:inline">Anexar ({selectedFiles.length}/15)</span>
                    </button>

                    {isRecording ? (
                      <button
                        onClick={stopRecording}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors animate-pulse"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        <span className="hidden sm:inline">Parar Gravação</span>
                      </button>
                    ) : (
                      <button
                        onClick={startRecording}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        disabled={isLoading || selectedFiles.length >= 15}
                        title="Gravar Áudio"
                      >
                        <Mic className="w-4 h-4" />
                        <span className="hidden sm:inline">Gravar Áudio</span>
                      </button>
                    )}

                    <button
                      onClick={fetchGmailMessages}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      disabled={isLoading || isRecording}
                      title="Importar do Gmail"
                    >
                      <Mail className="w-4 h-4" />
                      <span className="hidden sm:inline">Gmail</span>
                    </button>
                  </div>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading || isRecording || (!inputText.trim() && selectedFiles.length === 0)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Processar</span>
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}

            {/* Feed Section */}
            <section className="flex flex-col gap-6">
              {filteredEntries.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <Brain className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-lg font-medium text-gray-600">
                    {activeTab === 'search' ? 'Nenhum resultado encontrado.' : 'Seu cérebro digital está vazio.'}
                  </p>
                  <p className="text-sm mt-1">
                    {activeTab === 'search' ? 'Tente buscar por outras palavras-chave.' : 'Envie um texto, link, áudio, imagem, vídeo ou arquivos ZIP para começar a organizar seu conhecimento.'}
                  </p>
                </div>
              ) : (
                filteredEntries.map((entry) => (
                  <article key={entry.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                          {entry.input.files && entry.input.files.length > 0 ? (
                            getFileIcon(entry.input.files[0].type, entry.input.files[0].name)
                          ) : (
                            entry.input.text.match(/https?:\/\//) ? <LinkIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {entry.input.files && entry.input.files.length > 0 ? 'Arquivos Processados' : (entry.input.text.match(/https?:\/\//) ? 'Link Analisado' : 'Nota de Texto')}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(entry.date).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingEntryId !== entry.id && (
                          <button 
                            onClick={() => startEditing(entry)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar anotação"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="p-6">
                      {/* Input Preview */}
                      {(entry.input.text || (entry.input.files && entry.input.files.length > 0)) && (
                        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                          {entry.input.text && (
                            <p className="text-sm text-gray-600 italic line-clamp-3 mb-3">"{entry.input.text}"</p>
                          )}
                          {entry.input.files && entry.input.files.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {entry.input.files.map((f, i) => (
                                <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-white text-gray-700 rounded text-xs font-medium border border-gray-200">
                                  <span className="text-blue-600">{getFileIcon(f.type, f.name)}</span>
                                  <span className="truncate max-w-[150px]">{f.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Output Content */}
                      {editingEntryId === entry.id ? (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                          <textarea
                            value={editingContent}
                            onChange={e => setEditingContent(e.target.value)}
                            className="w-full min-h-[300px] p-4 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm bg-blue-50/30"
                          />
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setEditingEntryId(null)} 
                              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                            <button 
                              onClick={() => saveEdit(entry.id)} 
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                            >
                              <Save className="w-4 h-4" /> Salvar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {entry.output}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Edit History Toggle */}
                      {entry.editHistory && entry.editHistory.length > 0 && editingEntryId !== entry.id && (
                        <div className="mt-6 pt-4 border-t border-gray-100">
                          <button 
                            onClick={() => setViewingHistoryId(viewingHistoryId === entry.id ? null : entry.id)}
                            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 transition-colors"
                          >
                            <History className="w-3.5 h-3.5" />
                            {viewingHistoryId === entry.id ? 'Ocultar Histórico de Edições' : `Ver Histórico de Edições (${entry.editHistory.length})`}
                          </button>

                          {viewingHistoryId === entry.id && (
                            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                              {entry.editHistory.map((hist, idx) => (
                                <div key={idx} className="p-4 bg-orange-50/50 rounded-xl border border-orange-100">
                                  <p className="text-xs text-orange-600 mb-3 font-medium flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" />
                                    Versão de {new Date(hist.timestamp).toLocaleString('pt-BR')}
                                  </p>
                                  <div className="text-sm text-gray-700 bg-white p-4 rounded-lg border border-orange-100/50 markdown-body opacity-80">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{hist.content}</ReactMarkdown>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ))
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
