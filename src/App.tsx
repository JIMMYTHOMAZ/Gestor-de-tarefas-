import { useState, useRef, useMemo, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Send, Brain, Loader2, FileText, Image as ImageIcon, Video, Mic, X, Archive, Square, Link as LinkIcon, Search, Download, Edit2, History, Save, PlusCircle, Menu, Clock, Trash2, BarChart3, PieChart as PieChartIcon, HelpCircle, AlertTriangle, ChevronRight, Share2, Car, HeartPulse, RotateCcw, Palette } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import JSZip from 'jszip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  suggestions?: string[];
  chartData?: {
    type: 'bar' | 'pie' | 'particles';
    data: any[];
    title: string;
  };
  editHistory?: EditHistoryItem[];
};

const CHEVROLET_KNOWLEDGE_BASE = `
# REGRAS TÉCNICAS - CONSÓRCIO CHEVROLET
- Segmentos: Automóveis (0km e seminovos até 10 anos) e Veículos Comerciais.
- Prazos: 60, 84 e 100 meses.
- Taxas: Taxa de Administração Total de 14,5% (diluída pelo prazo) + 1% de Fundo de Reserva.
- Reajuste: Baseado na Tabela FIPE ou Preço Público Sugerido pela Montadora (PPS).

# MECÂNICAS DE CONTEMPLAÇÃO
- Sorteio: Realizado mensalmente via Loteria Federal.
- Lance Livre: Maior percentual de antecipação de parcelas do grupo.
- Lance Fixo: 20% ou 30% do valor total do crédito (conforme contrato do grupo).
- Lance Embutido: Permite utilizar até 25% do valor da própria carta de crédito para pagar o lance.

# DIFERENCIAIS COMPETITIVOS
- Poder de negociação à vista (compra programada).
- Isenção de juros bancários.
- Flexibilidade: Possibilidade de usar o crédito para quitação de financiamento próprio.

# OPERAÇÃO PARTNER 360
- Foco em alta performance e relacionamento com concessionárias, agentes autônomos e revendas.
- Gargalos comuns: Documentação pendente, baixa conversão de leads, erros de sistema.

# CONTORNO DE OBJEÇÕES
- "Demora muito": O consórcio é estratégia. Use Lance Fixo + Lance Embutido.
- "Prefiro financiamento": O custo da pressa é alto. No consórcio economiza-se o valor de quase dois carros em juros.
`;

const PERSONAS = {
  storytelling: {
    id: 'storytelling',
    name: 'Storytelling Omnichannel',
    icon: Share2,
    placeholder: 'Cole aqui seus dados, relatórios, ideias ou desabafos... para transformá-los em histórias envolventes.',
    instruction: `Você é a inteligência central de um aplicativo avançado de Storytelling Omnichannel.
Sua função primária é receber dados, fatos ou ideias de absolutamente qualquer área do conhecimento, transformá-los em uma narrativa envolvente (storytelling) e, em seguida, adaptar essa história para a rede social escolhida pelo usuário.

REGRAS DE PLATAFORMA E EMOJIS OBRIGATÓRIOS:
No resultado, ao lado do nome de cada plataforma de destino listada, você DEVE adicionar o emoji correspondente:
- 👔 LinkedIn: Tom mais profissional e reflexivo. Estruture com frases curtas, parágrafos espaçados para facilitar a leitura rápida e termine com uma pergunta para gerar debate.
- 📸 Instagram (Feed/Carrossel): Linguagem visual e dinâmica. Use emojis de forma estratégica e inclua uma Chamada para Ação (CTA) clara para os comentários ou link na bio.
- 🐦 Twitter/X: Direto ao ponto. Se a história for longa, estruture como uma "Thread" (fio), garantindo que o primeiro tweet seja um gancho irresistível.
- 🎵 TikTok/Reels: Entregue em formato de roteiro de vídeo. Divida em [CENA/VISUAL] e [FALA/ÁUDIO], garantindo que os primeiros 3 segundos tenham altíssima retenção.
- 💬 WhatsApp/Telegram: Texto persuasivo, porém informal, com uso de negrito (*) e itálico (_) para destacar pontos-chave.

# IMPORTANTE: VISUALIZAÇÃO DE DADOS
Se a entrada ou o resultado contiver dados estruturados, você DEVE fornecer um bloco JSON para visualização.
Formate exatamente assim no final:
[CHART]
{
  "type": "bar" | "pie",
  "title": "Título do Gráfico",
  "data": [ { "name": "Categoria 1", "value": 100 } ]
}
[/CHART]

# IMPORTANTE: SUGESTÕES DE EXPLORAÇÃO
Sempre termine sua resposta com uma seção de "SUGESTÕES" que eu usarei para criar botões clicáveis.
[SUGESTÕES]
- Pergunta sugerida 1?
- Pergunta sugerida 2?
[/SUGESTÕES]`
  },
  partner360: {
    id: 'partner360',
    name: 'Consultor Partner 360',
    icon: Car,
    placeholder: 'Descreva uma objeção, solicite uma regra técnica ou anexe dados de vendas...',
    instruction: `Você é o "Especialista Partner 360" do Consórcio Chevrolet. Sua função é atuar como um consultor avançado para parceiros e vendedores, transformando dúvidas e dados em estratégias de vendas e organização.

# CONTEXTO DO NEGÓCIO
${CHEVROLET_KNOWLEDGE_BASE}

# MEMÓRIA E CONTEXTO
Você tem acesso ao histórico recente da conversa. Use-o para manter a continuidade, responder perguntas de acompanhamento e cruzar informações de consultas anteriores se o usuário solicitar.

# DIRETRIZES DE PROCESSAMENTO
1. IDENTIFICAÇÃO: Determine se é uma dúvida técnica, uma objeção de cliente, um lead para qualificar ou um relatório de vendas.
2. ANÁLISE ESTRATÉGICA: Use as regras do Consórcio Chevrolet para fornecer a melhor resposta.
3. FORMATO DE SAÍDA:
   - Use uma linguagem profissional, mas ágil (estilo Partner 360).
   - Estruture com Markdown (tabelas, listas, negrito).
   - Se for uma objeção, forneça o "Script de Contorno".

# IMPORTANTE: VISUALIZAÇÃO DE DADOS
Se a entrada ou o resultado contiver dados estruturados, você DEVE fornecer um bloco JSON para visualização.
[CHART]
{
  "type": "bar" | "pie",
  "title": "Título do Gráfico",
  "data": [ { "name": "Categoria 1", "value": 100 } ]
}
[/CHART]

# IMPORTANTE: SUGESTÕES DE EXPLORAÇÃO
Sempre termine sua resposta com uma seção de "SUGESTÕES" que eu usarei para criar botões clicáveis.
[SUGESTÕES]
- Pergunta sugerida 1?
- Pergunta sugerida 2?
[/SUGESTÕES]`
  },
  sentiment: {
    id: 'sentiment',
    name: 'Análise de Sentimentos',
    icon: HeartPulse,
    placeholder: 'Cole os feedbacks, avaliações ou comentários dos clientes para análise de sentimento...',
    instruction: `Você é um modelo de IA especializado em Análise de Sentimentos e Experiência do Cliente (CX).
Sua função é analisar feedbacks, avaliações, desabafos ou comentários de clientes e extrair insights valiosos.

DIRETRIZES:
1. Classifique o sentimento geral (Positivo, Negativo, Neutro).
2. Identifique os principais pontos de dor (pain points) ou pontos de elogio.
3. Sugira planos de ação práticos para a equipe de atendimento ou produto.
4. Formate a saída em Markdown claro e estruturado.

# IMPORTANTE: VISUALIZAÇÃO DE DADOS
Se houver múltiplos feedbacks ou dados quantificáveis, gere um gráfico com a distribuição de sentimentos ou categorias.
[CHART]
{
  "type": "pie",
  "title": "Distribuição de Sentimentos",
  "data": [ { "name": "Positivo", "value": 10 }, { "name": "Negativo", "value": 2 } ]
}
[/CHART]

# IMPORTANTE: SUGESTÕES DE EXPLORAÇÃO
Sempre termine sua resposta com uma seção de "SUGESTÕES" que eu usarei para criar botões clicáveis.
[SUGESTÕES]
- Como podemos melhorar o ponto de dor X?
- Quais ações imediatas tomar para os feedbacks negativos?
[/SUGESTÕES]`
  },
  dataArt: {
    id: 'dataArt',
    name: 'Arte de Dados (Refik Anadol)',
    icon: Palette,
    placeholder: 'Insira números, métricas ou conceitos para transformá-los em uma escultura de dados fluida...',
    instruction: `Você é um artista de dados e IA inspirado pelas obras de Refik Anadol.
Sua função é transformar dados brutos, métricas ou conceitos em descrições poéticas de "esculturas de dados" e gerar uma visualização fluida.

DIRETRIZES:
1. Descreva como os dados se transformam em pigmentos, memórias fluidas, ondas ou partículas.
2. Use uma linguagem sinestésica, artística e tecnológica.
3. Relacione os valores numéricos com cores vibrantes, movimentos e texturas.

# IMPORTANTE: VISUALIZAÇÃO DE DADOS (OBRIGATÓRIO)
Você DEVE gerar um bloco JSON com o tipo "particles" para que o sistema renderize a escultura de dados.
Formate exatamente assim no final:
[CHART]
{
  "type": "particles",
  "title": "Memória Fluida dos Dados",
  "data": [
    { "name": "Dado 1", "value": 150 },
    { "name": "Dado 2", "value": 80 }
  ]
}
[/CHART]

# IMPORTANTE: SUGESTÕES DE EXPLORAÇÃO
Sempre termine com sugestões para explorar a arte.
[SUGESTÕES]
- Como esses dados soariam se fossem música?
- Adicionar mais variáveis à escultura?
[/SUGESTÕES]`
  }
};

const CHART_COLORS = ['#CD9834', '#003366', '#1A1A1A', '#4A4A4A', '#8E8E8E'];

const ParticleCanvas = ({ data }: { data: any[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: any[] = [];
    
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    window.addEventListener('resize', resize);
    resize();

    const colors = ['#00f3ff', '#ff0099', '#7000ff', '#ffcc00', '#ffffff'];

    data.forEach((d, i) => {
      const count = Math.min(Math.max(Number(d.value) || 50, 20), 300); 
      const color = colors[i % colors.length];
      
      for (let j = 0; j < count; j++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          color: color,
          size: Math.random() * 2 + 0.5
        });
      }
    });

    let time = 0;

    const draw = () => {
      time += 0.005;
      
      ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        const angle = Math.sin(p.x * 0.003 + time) * Math.cos(p.y * 0.003 + time) * Math.PI * 2;
        
        p.vx += Math.cos(angle) * 0.15;
        p.vy += Math.sin(angle) * 0.15;

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 2.5) {
          p.vx = (p.vx / speed) * 2.5;
          p.vy = (p.vy / speed) * 2.5;
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [data]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-[#0a0a0f]">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 z-10">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10">
            <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: ['#00f3ff', '#ff0099', '#7000ff', '#ffcc00', '#ffffff'][i % 5], color: ['#00f3ff', '#ff0099', '#7000ff', '#ffcc00', '#ffffff'][i % 5] }} />
            <span className="text-[11px] text-white/90 font-mono font-medium">{d.name}: {d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ChartRenderer = ({ chartData }: { chartData: Entry['chartData'] }) => {
  if (!chartData) return null;

  if (chartData.type === 'particles') {
    return (
      <div className="mt-8 p-1 rounded-3xl bg-gradient-to-b from-gray-800 to-black shadow-2xl border border-gray-800">
        <div className="flex items-center gap-3 p-5 border-b border-white/10">
          <Palette className="w-6 h-6 text-[#00f3ff]" />
          <h3 className="font-display font-bold text-white tracking-wide text-lg">{chartData.title}</h3>
        </div>
        <div className="h-[400px] w-full p-2">
          <ParticleCanvas data={chartData.data} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 p-6 bg-gray-50 rounded-2xl border border-gray-100 shadow-inner">
      <div className="flex items-center gap-2 mb-6">
        {chartData.type === 'bar' ? <BarChart3 className="w-5 h-5 text-chevrolet-gold" /> : <PieChartIcon className="w-5 h-5 text-chevrolet-gold" />}
        <h3 className="font-display font-bold text-chevrolet-black">{chartData.title}</h3>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartData.type === 'bar' ? (
            <BarChart data={chartData.data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                cursor={{ fill: '#F3F4F6' }}
              />
              <Bar dataKey="value" fill="#CD9834" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          ) : (
            <PieChart>
              <Pie
                data={chartData.data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {chartData.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-6">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-display font-bold text-chevrolet-black mb-2">{title}</h3>
          <p className="text-gray-500 font-medium leading-relaxed">{message}</p>
        </div>
        <div className="bg-gray-50 p-6 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-100 transition-all"
          >
            Cancelar
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

const Documentation = () => (
  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="bg-chevrolet-black rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 w-64 h-64 bg-chevrolet-gold/10 rounded-full -mr-32 -mt-32 blur-3xl" />
      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-chevrolet-gold rounded-2xl flex items-center justify-center text-chevrolet-black">
            <HelpCircle className="w-7 h-7" />
          </div>
          <h2 className="text-3xl font-display font-extrabold tracking-tight">Guia Partner 360</h2>
        </div>
        <p className="text-gray-300 text-lg max-w-2xl leading-relaxed">
          Bem-vindo ao seu centro de inteligência avançada. O Partner 360 foi projetado para ser o braço direito do consultor Chevrolet, processando qualquer tipo de informação e transformando-a em estratégia pura.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 hover:shadow-chevrolet-gold/5 transition-all">
        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 mb-6">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-display font-bold mb-4">Processamento de Texto</h3>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Insira dúvidas técnicas sobre o Consórcio Chevrolet, peça scripts para contornar objeções ou solicite resumos de reuniões.
        </p>
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Exemplo de Prompt</p>
          <p className="text-xs font-mono text-chevrolet-black italic">"Como explicar a vantagem do lance embutido de 25% para um cliente conservador?"</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 hover:shadow-chevrolet-gold/5 transition-all">
        <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500 mb-6">
          <Mic className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-display font-bold mb-4">Inteligência de Áudio</h3>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Grave briefings de campo ou conversas com clientes. O sistema transcreve, analisa o sentimento e extrai os próximos passos.
        </p>
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Dica de Uso</p>
          <p className="text-xs font-mono text-chevrolet-black italic">Use o botão "Gravar Áudio" para capturar insights rápidos enquanto está em trânsito entre concessionárias.</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 hover:shadow-chevrolet-gold/5 transition-all">
        <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500 mb-6">
          <ImageIcon className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-display font-bold mb-4">Visão Computacional</h3>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Anexe prints de telas de sistemas, tabelas de preços concorrentes ou conversas de WhatsApp. A IA lê e interpreta os dados visuais.
        </p>
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Exemplo de Prompt</p>
          <p className="text-xs font-mono text-chevrolet-black italic">"Analise este print da tabela do concorrente e aponte 3 diferenciais do Consórcio Chevrolet."</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 hover:shadow-chevrolet-gold/5 transition-all">
        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-500 mb-6">
          <Video className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-display font-bold mb-4">Análise de Vídeo</h3>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Envie vídeos de treinamentos ou apresentações. O sistema extrai os pontos-chave, timestamps e gera um checklist de ações.
        </p>
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Dica de Uso</p>
          <p className="text-xs font-mono text-chevrolet-black italic">Ideal para resumir lives de lançamentos de novos grupos ou modelos Chevrolet.</p>
        </div>
      </div>
    </div>

    <div className="bg-white p-10 rounded-3xl shadow-xl border border-gray-100">
      <h3 className="text-2xl font-display font-bold mb-8 flex items-center gap-3">
        <BarChart3 className="w-6 h-6 text-chevrolet-gold" /> Visualização de Dados
      </h3>
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 bg-chevrolet-gray-light rounded-lg flex items-center justify-center text-chevrolet-black shrink-0">
            <ChevronRight className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-chevrolet-black mb-1">Gráficos Automáticos</p>
            <p className="text-gray-500 text-sm">Sempre que você enviar dados estruturados (ex: lista de vendas por mês), a IA gerará um gráfico de barras ou pizza para facilitar a visualização.</p>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 bg-chevrolet-gray-light rounded-lg flex items-center justify-center text-chevrolet-black shrink-0">
            <ChevronRight className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-chevrolet-black mb-1">Memória de Sessão</p>
            <p className="text-gray-500 text-sm">O Partner 360 lembra das últimas consultas. Você pode fazer perguntas de acompanhamento como "Baseado no que falamos antes, qual o próximo passo?"</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Personas
  const [activePersona, setActivePersona] = useState<keyof typeof PERSONAS>('storytelling');

  // Persistence
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('partner360_entries');
    if (saved) {
      try {
        const parsed = JSON.parse(saved, (key, value) => {
          if (key === 'date' || key === 'timestamp') return new Date(value);
          return value;
        });
        setEntries(parsed);
      } catch (e) {
        console.error("Failed to load entries", e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('partner360_entries', JSON.stringify(entries));
    }
  }, [entries, isLoaded]);

  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'docs'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Modal State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; entryId: string | null }>({ isOpen: false, entryId: null });
  
  // Edit State
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  const handleSubmit = async (overrideText?: string) => {
    const textToSubmit = overrideText || inputText;
    if (!textToSubmit.trim() && selectedFiles.length === 0) return;

    setIsLoading(true);
    try {
      const contents: any[] = [];
      
      // Add conversation history (last 5 entries)
      const history = entries.slice(0, 5).reverse();
      history.forEach(entry => {
        contents.push({
          role: 'user',
          parts: [{ text: entry.input.text }]
        });
        contents.push({
          role: 'model',
          parts: [{ text: entry.output }]
        });
      });

      const currentParts: any[] = [];
      
      if (textToSubmit.trim()) {
        currentParts.push({ text: textToSubmit });
      }

      if (selectedFiles.length > 0) {
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
        
        currentParts.push(...fileParts);
      }

      contents.push({
        role: 'user',
        parts: currentParts
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction: PERSONAS[activePersona].instruction,
          tools: [{ urlContext: {} }]
        }
      });

      const fullText = response.text || 'Nenhum conteúdo gerado.';
      
      // Extract chart data
      let cleanOutput = fullText;
      let chartData: Entry['chartData'] | undefined;
      
      const chartMatch = fullText.match(/\[CHART\]([\s\S]*?)\[\/CHART\]/);
      if (chartMatch) {
        try {
          chartData = JSON.parse(chartMatch[1].trim());
          cleanOutput = cleanOutput.replace(/\[CHART\][\s\S]*?\[\/CHART\]/, '').trim();
        } catch (e) {
          console.error("Error parsing chart data:", e);
        }
      }

      // Extract suggestions
      let suggestions: string[] = [];
      
      const suggestionsMatch = cleanOutput.match(/\[SUGESTÕES\]([\s\S]*?)\[\/SUGESTÕES\]/);
      if (suggestionsMatch) {
        suggestions = suggestionsMatch[1]
          .split('\n')
          .map(s => s.replace(/^-\s*/, '').trim())
          .filter(s => s.length > 0);
        cleanOutput = cleanOutput.replace(/\[SUGESTÕES\][\s\S]*?\[\/SUGESTÕES\]/, '').trim();
      }

      const newEntry: Entry = {
        id: crypto.randomUUID(),
        date: new Date(),
        input: {
          text: textToSubmit,
          files: selectedFiles.map(f => ({ name: f.name, type: f.type }))
        },
        output: cleanOutput,
        suggestions: suggestions,
        chartData: chartData,
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
    a.download = `partner_360_export_${new Date().toISOString().split('T')[0]}.json`;
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

  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const revertToHistory = (entryId: string, historyItem: EditHistoryItem) => {
    if (confirm('Deseja reverter para esta versão? A versão atual será salva no histórico.')) {
      setEntries(prev => prev.map(e => {
        if (e.id === entryId) {
          const newHistory = [...(e.editHistory || []), { timestamp: new Date(), content: e.output }];
          return { ...e, output: historyItem.content, editHistory: newHistory };
        }
        return e;
      }));
      setViewingHistoryId(null);
    }
  };

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b border-modern-border flex items-center gap-4 bg-modern-surface text-modern-text">
        <div className="w-10 h-10 bg-modern-accent/10 rounded-lg flex items-center justify-center text-modern-accent shadow-[0_0_15px_rgba(59,130,246,0.2)] border border-modern-accent/20">
          <Brain className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-display font-extrabold text-lg leading-tight tracking-tight">Partner 360</h1>
          <p className="text-[10px] text-modern-accent font-bold uppercase tracking-[0.2em]">Inteligência Avançada</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto bg-modern-bg">
        <button 
          onClick={() => { setActiveTab('home'); setIsMobileMenuOpen(false); }} 
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'home' ? 'bg-modern-surface text-modern-text shadow-sm border border-modern-border' : 'text-modern-text-muted hover:bg-modern-surface-hover hover:text-modern-text'}`}
        >
          <PlusCircle className="w-4 h-4" /> Nova Estratégia
        </button>
        <button 
          onClick={() => { setActiveTab('search'); setIsMobileMenuOpen(false); }} 
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'search' ? 'bg-modern-surface text-modern-text shadow-sm border border-modern-border' : 'text-modern-text-muted hover:bg-modern-surface-hover hover:text-modern-text'}`}
        >
          <Search className="w-4 h-4" /> Inteligência ({entries.length})
        </button>
        <button 
          onClick={() => { setActiveTab('docs'); setIsMobileMenuOpen(false); }} 
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'docs' ? 'bg-modern-surface text-modern-text shadow-sm border border-modern-border' : 'text-modern-text-muted hover:bg-modern-surface-hover hover:text-modern-text'}`}
        >
          <HelpCircle className="w-4 h-4" /> Ajuda & Guia
        </button>
      </nav>
      <div className="p-4 border-t border-modern-border bg-modern-bg">
        <button 
          onClick={handleExport} 
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-modern-text-muted hover:bg-modern-surface hover:text-modern-text transition-all duration-200"
        >
          <Download className="w-4 h-4" /> Exportar Relatórios
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-modern-bg text-modern-text font-sans overflow-hidden animated-gradient-bg">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-72 bg-modern-surface border-r border-modern-border flex-col z-20 shadow-2xl">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-md" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      
      {/* Mobile Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-modern-surface border-r border-modern-border flex flex-col z-50 transform transition-transform duration-500 ease-out md:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-modern-accent/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Mobile Header */}
        <header className="md:hidden bg-modern-surface/80 backdrop-blur-md border-b border-modern-border p-4 flex items-center justify-between z-10 text-modern-text sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-modern-accent/10 rounded flex items-center justify-center text-modern-accent border border-modern-accent/20">
              <Brain className="w-5 h-5" />
            </div>
            <h1 className="font-display font-bold text-lg">Partner 360</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-modern-text-muted hover:text-modern-text hover:bg-modern-surface-hover rounded-xl transition-colors">
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-10 relative z-10">
          <div className="max-w-4xl mx-auto flex flex-col gap-10 pb-24">
            
            {/* Documentation Tab */}
            {activeTab === 'docs' && <Documentation />}

            {/* Search Tab Header */}
            {activeTab === 'search' && (
              <div className="bg-modern-surface p-6 rounded-3xl shadow-xl border border-modern-border animate-in fade-in zoom-in-95 duration-300">
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-modern-text-muted group-focus-within:text-modern-accent w-6 h-6 transition-colors" />
                  <input
                    type="text"
                    placeholder="Pesquisar em estratégias, objeções ou leads..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-14 pr-6 py-4 rounded-2xl bg-modern-bg border border-modern-border focus:border-modern-accent focus:ring-1 focus:ring-modern-accent/50 outline-none transition-all text-lg font-medium text-modern-text placeholder-modern-text-muted"
                  />
                </div>
              </div>
            )}

            {/* Input Section (Home Tab Only) */}
            {activeTab === 'home' && (
              <section className="bg-modern-surface/80 backdrop-blur-md rounded-3xl shadow-2xl border border-modern-border overflow-hidden transition-all duration-300 hover:border-modern-accent/30 focus-within:border-modern-accent/50 focus-within:shadow-[0_0_40px_rgba(59,130,246,0.1)]">
                
                {/* Persona Selector */}
                <div className="flex border-b border-modern-border overflow-x-auto hide-scrollbar bg-modern-bg/50">
                  {(Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>).map(key => {
                    const persona = PERSONAS[key];
                    const Icon = persona.icon;
                    const isActive = activePersona === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setActivePersona(key)}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all whitespace-nowrap ${isActive ? 'text-modern-accent border-b-2 border-modern-accent bg-modern-surface' : 'text-modern-text-muted hover:text-modern-text hover:bg-modern-surface-hover'}`}
                      >
                        <Icon className="w-4 h-4" />
                        {persona.name}
                      </button>
                    );
                  })}
                </div>

                <div className="p-6">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={PERSONAS[activePersona].placeholder}
                    className="w-full min-h-[160px] resize-none outline-none bg-transparent text-modern-text placeholder:text-modern-text-muted text-xl font-medium leading-relaxed"
                    disabled={isLoading || isRecording}
                  />
                  
                  {selectedFiles.length > 0 && (
                    <div className="mt-6 flex flex-wrap gap-3">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-3 bg-modern-bg p-3 rounded-2xl border border-modern-border group transition-all hover:border-modern-accent/50">
                          <div className="text-modern-accent">
                            {getFileIcon(file.type, file.name)}
                          </div>
                          <div className="flex flex-col max-w-[140px]">
                            <span className="text-xs font-bold text-modern-text truncate" title={file.name}>{file.name}</span>
                            <span className="text-[10px] text-modern-text-muted font-bold uppercase tracking-wider">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                          <button 
                            onClick={() => removeFile(index)}
                            className="p-1.5 text-modern-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all"
                            disabled={isLoading}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="bg-modern-bg/80 px-6 py-4 border-t border-modern-border flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
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
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-modern-text-muted hover:text-modern-accent hover:bg-modern-surface rounded-xl transition-all border border-transparent hover:border-modern-border"
                      disabled={isLoading || isRecording}
                    >
                      <Upload className="w-4 h-4" />
                      <span className="hidden sm:inline">Anexar ({selectedFiles.length}/15)</span>
                    </button>

                    {isRecording ? (
                      <button
                        onClick={stopRecording}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all animate-pulse border border-red-500/20"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        <span className="hidden sm:inline">Parar Gravação</span>
                      </button>
                    ) : (
                      <button
                        onClick={startRecording}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-modern-text-muted hover:text-modern-accent hover:bg-modern-surface rounded-xl transition-all border border-transparent hover:border-modern-border"
                        disabled={isLoading || selectedFiles.length >= 15}
                      >
                        <Mic className="w-4 h-4" />
                        <span className="hidden sm:inline">Gravar Áudio</span>
                      </button>
                    )}
                  </div>
                  
                  <button
                    onClick={() => handleSubmit()}
                    disabled={isLoading || isRecording || (!inputText.trim() && selectedFiles.length === 0)}
                    className="flex items-center gap-3 px-8 py-3 bg-modern-accent text-white text-sm font-bold rounded-xl hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:shadow-none"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Gerar Estratégia</span>
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}

            {/* Feed Section */}
            <section className="flex flex-col gap-10">
              {filteredEntries.length === 0 ? (
                <div className="text-center py-24 text-modern-text-muted animate-in fade-in duration-700">
                  <div className="w-20 h-20 bg-modern-surface rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-modern-border">
                    <Brain className="w-10 h-10 text-modern-border" />
                  </div>
                  <p className="text-2xl font-display font-bold text-modern-text mb-2">
                    {activeTab === 'search' ? 'Nenhuma inteligência encontrada.' : 'Pronto para o Lift-Off?'}
                  </p>
                  <p className="text-modern-text-muted max-w-md mx-auto font-medium">
                    {activeTab === 'search' ? 'Tente refinar sua busca por termos técnicos ou nomes de parceiros.' : 'Comece enviando uma solicitação para transformar dados em resultados de alta performance.'}
                  </p>
                </div>
              ) : (
                filteredEntries.map((entry) => (
                  <article key={entry.id} className="bg-modern-surface/80 backdrop-blur-md rounded-3xl shadow-xl border border-modern-border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 hover:border-modern-accent/30 transition-all group">
                    <div className="px-8 py-5 border-b border-modern-border bg-modern-bg/50 flex items-center justify-between text-modern-text">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-modern-surface flex items-center justify-center text-modern-accent border border-modern-border shadow-sm">
                          {entry.input.files && entry.input.files.length > 0 ? (
                            getFileIcon(entry.input.files[0].type, entry.input.files[0].name)
                          ) : (
                            entry.input.text.match(/https?:\/\//) ? <LinkIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold tracking-tight text-modern-text">
                            {entry.input.files && entry.input.files.length > 0 ? 'ANÁLISE DE DADOS' : (entry.input.text.match(/https?:\/\//) ? 'ANÁLISE DE LINK' : 'CONSULTORIA TÉCNICA')}
                          </p>
                          <p className="text-[10px] text-modern-text-muted font-bold uppercase tracking-widest">
                            {new Date(entry.date).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingEntryId !== entry.id && (
                          <>
                            <button 
                              onClick={() => startEditing(entry)}
                              className="p-2 text-modern-text-muted hover:text-modern-accent hover:bg-modern-accent/10 rounded-xl transition-all"
                              title="Editar Estratégia"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => setDeleteModal({ isOpen: true, entryId: entry.id })}
                              className="p-2 text-modern-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                              title="Excluir Estratégia"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="p-8">
                      {/* Input Preview */}
                      {(entry.input.text || (entry.input.files && entry.input.files.length > 0)) && (
                        <div className="mb-8 p-5 bg-modern-bg rounded-2xl border border-modern-border relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-modern-accent" />
                          {entry.input.text && (
                            <p className="text-sm text-modern-text-muted font-medium italic line-clamp-3 mb-4">"{entry.input.text}"</p>
                          )}
                          {entry.input.files && entry.input.files.length > 0 && (
                            <div className="flex flex-wrap gap-3">
                              {entry.input.files.map((f, i) => (
                                <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-modern-surface text-modern-text rounded-xl text-[10px] font-bold uppercase tracking-wider border border-modern-border shadow-sm">
                                  <span className="text-modern-accent">{getFileIcon(f.type, f.name)}</span>
                                  <span className="truncate max-w-[180px]">{f.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Output Content */}
                      {editingEntryId === entry.id ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                          <textarea
                            value={editingContent}
                            onChange={e => setEditingContent(e.target.value)}
                            className="w-full min-h-[350px] p-6 border border-modern-accent/50 rounded-2xl focus:border-modern-accent focus:ring-1 focus:ring-modern-accent/50 outline-none font-mono text-sm bg-modern-bg text-modern-text leading-relaxed"
                          />
                          <div className="flex justify-end gap-3">
                            <button 
                              onClick={() => setEditingEntryId(null)} 
                              className="px-6 py-2.5 text-sm font-bold text-modern-text-muted hover:bg-modern-surface hover:text-modern-text rounded-xl transition-all border border-transparent hover:border-modern-border"
                            >
                              Descartar
                            </button>
                            <button 
                              onClick={() => saveEdit(entry.id)} 
                              className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-modern-accent hover:bg-blue-600 rounded-xl transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                            >
                              <Save className="w-4 h-4" /> Salvar Alterações
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {entry.output}
                            </ReactMarkdown>
                          </div>
                          <ChartRenderer chartData={entry.chartData} />
                        </>
                      )}

                      {/* Suggestions Section */}
                      {entry.suggestions && entry.suggestions.length > 0 && editingEntryId !== entry.id && (
                        <div className="mt-10 pt-8 border-t border-modern-border">
                          <p className="text-[10px] font-bold text-modern-accent uppercase tracking-[0.2em] mb-4">Exploração Recomendada</p>
                          <div className="flex flex-wrap gap-3">
                            {entry.suggestions.map((suggestion, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setInputText(suggestion);
                                  handleSubmit(suggestion);
                                }}
                                className="px-4 py-2 bg-modern-surface border border-modern-border rounded-full text-xs font-semibold text-modern-text-muted hover:border-modern-accent hover:text-modern-accent transition-all duration-200 shadow-sm hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] flex items-center gap-2 group"
                              >
                                <PlusCircle className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Edit History Toggle */}
                      {entry.editHistory && entry.editHistory.length > 0 && editingEntryId !== entry.id && (
                        <div className="mt-8 pt-6 border-t border-modern-border/50">
                          <button 
                            onClick={() => setViewingHistoryId(viewingHistoryId === entry.id ? null : entry.id)}
                            className="flex items-center gap-2 text-[10px] font-bold text-modern-text-muted hover:text-modern-accent transition-all uppercase tracking-widest mb-4"
                          >
                            <History className="w-4 h-4" />
                            {viewingHistoryId === entry.id ? 'Ocultar Histórico' : `Ver Histórico de Versões (${entry.editHistory.length})`}
                          </button>
                          
                          {/* Interactive History Viewer */}
                          {viewingHistoryId === entry.id && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                              {entry.editHistory.map((hist, idx) => (
                                <div key={idx} className="bg-modern-bg p-5 rounded-2xl border border-modern-border hover:border-modern-accent/30 transition-all group">
                                  <div className="flex justify-between items-center mb-3">
                                    <span className="text-xs font-bold text-modern-text-muted bg-modern-surface px-3 py-1 rounded-full border border-modern-border">
                                      {new Date(hist.timestamp).toLocaleString('pt-BR')}
                                    </span>
                                    <button 
                                      onClick={() => revertToHistory(entry.id, hist)} 
                                      className="text-xs flex items-center gap-1.5 text-modern-accent hover:text-blue-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-modern-accent/10 px-3 py-1 rounded-full border border-modern-accent/20"
                                    >
                                      <RotateCcw className="w-3 h-3" /> Reverter para esta versão
                                    </button>
                                  </div>
                                  <div className="text-sm text-modern-text-muted line-clamp-3 font-mono bg-modern-surface p-3 rounded-lg border border-modern-border/50">
                                    {hist.content}
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

      {/* Modals */}
      <ConfirmModal 
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, entryId: null })}
        onConfirm={() => deleteModal.entryId && deleteEntry(deleteModal.entryId)}
        title="Excluir Inteligência"
        message="Tem certeza que deseja remover esta estratégia permanentemente? Esta ação não pode ser desfeita."
      />
    </div>
  );
}
