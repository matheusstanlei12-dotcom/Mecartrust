/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  ShoppingCart, 
  TrendingUp, 
  Sparkles, 
  ChevronRight, 
  Search,
  CheckCircle2,
  AlertCircle,
  Camera,
  Loader2,
  Image as ImageIcon,
  Package,
  History,
  Share2,
  Minus,
  MessageSquare,
  ChevronDown,
  Gift,
  Wrench,
  DollarSign,
  ClipboardList,
  Home,
  RefreshCcw,
  Settings,
  X,
  FileText,
  FileUp,
  BarChart,
  PieChart,
  Download,
  ExternalLink,
  MapPin,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc,
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  query, 
  where, 
  serverTimestamp,
  getDocs,
  runTransaction,
  arrayUnion
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Types
interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  prices: {
    [storeName: string]: number;
  };
  checked: boolean;
}

interface StoreData {
  name: string;
  icon: string;
}

interface InventoryItem {
  id: string;
  name: string;
  current: number;
  min: number;
  unit: string;
}

interface SavedList {
  id: string;
  name: string;
  date: string;
  items: GroceryItem[];
  total: number;
  store: string;
}

interface GiftItem {
  id: string;
  recipient: string;
  occasion: string;
  ideas: string;
  status: 'planning' | 'bought' | 'given';
}

interface Residence {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  inviteCode: string;
  createdAt: any;
}

interface HomeTask {
  id: string;
  title: string;
  priority: 'low' | 'med' | 'high';
  status: 'todo' | 'doing' | 'done';
  category: string;
}

interface FinanceItem {
  id: string;
  description: string;
  value: number;
  type: 'fixed' | 'variable';
  category: string;
  date: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

const STORES_INITIAL: StoreData[] = [
  { name: 'Supermercados BH', icon: '🛒' },
  { name: 'EPA Supermercados', icon: '🏪' },
  { name: 'Apoio Mineiro', icon: '🏛️' },
];

const DEFAULT_CATEGORIES = [
  'Frutas & Vegetais', 
  'Laticínios', 
  'Padaria', 
  'Carnes e Frios', 
  'Congelados', 
  'Bebidas', 
  'Mercearia/Despensa', 
  'Higiene Pessoal',
  'Limpeza', 
  'Pet Shop',
  'Lanches e Snacks',
  'Outros'
];

const COMMON_PRICES: Record<string, number> = {
  'arroz': 24.90,
  'feijão': 8.50,
  'leite': 4.90,
  'açúcar': 4.20,
  'café': 18.90,
  'óleo': 6.50,
  'pão': 0.75,
  'manteiga': 12.90,
  'ovos': 16.00,
  'frango': 15.90,
  'carne': 35.00,
  'cerveja': 4.50,
  'refrigerante': 8.90,
  'papel higiênico': 14.00,
  'detergente': 2.50,
  'sabão': 12.00
};

// Segurança Atômica: Formata qualquer valor sem nunca crashar
const safeToFixed = (val: any, decimals: number = 2) => {
  try {
    const n = Number(val);
    return isNaN(n) ? (0).toFixed(decimals) : n.toFixed(decimals);
  } catch (e) {
    return (0).toFixed(decimals);
  }
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  // Onboarding Phone State
  const [needsPhoneOnboarding, setNeedsPhoneOnboarding] = useState(false);
  const [onboardPhone, setOnboardPhone] = useState('');
  const [onboardName, setOnboardName] = useState('');
  const [onboardSaving, setOnboardSaving] = useState(false);

  const [lists, setLists] = useState<Record<string, GroceryItem[]>>({
    'Compras da Semana': [],
    'Carnes e Frios': [],
    'Bebidas': [],
    'Padaria': [],
    'Limpeza e Higiene': [],
    'Hortifruti': [],
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'lists' | 'stock' | 'history' | 'admin' | 'gifts' | 'tasks' | 'finances' | 'settings' | 'monthly_report'>('dashboard');
  const [activeList, setActiveList] = useState('Compras da Semana');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<SavedList[]>([]);
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [homeTasks, setHomeTasks] = useState<HomeTask[]>([]);
  const [finances, setFinances] = useState<FinanceItem[]>([]);
  const [residences, setResidences] = useState<Residence[]>([]);
  const [selectedResidenceId, setSelectedResidenceId] = useState<string | null>(localStorage.getItem('lar360_selected_residence'));
  const [residenceNameInput, setResidenceNameInput] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  
  const [newItemName, setNewItemName] = useState('');
  const [inventoryForm, setInventoryForm] = useState({ name: '', current: 0, min: 1, unit: 'un' });
  const [isAddingInventory, setIsAddingInventory] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSearchingStores, setIsSearchingStores] = useState(false);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState<'shopping' | 'stock' | 'prices' | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [stores, setStores] = useState<StoreData[]>(STORES_INITIAL);
  const [selectedStore, setSelectedStore] = useState(STORES_INITIAL[0].name);
  const [locationName, setLocationName] = useState<string | null>(localStorage.getItem('lar360_last_location') || 'Sua Região');
  const [historySearch, setHistorySearch] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [newItemQuantity, setNewItemQuantity] = useState<number>(1);
  const [newItemUnit, setNewItemUnit] = useState<string>('un');
  const [isReceiptMode, setIsReceiptMode] = useState<'shopping' | 'stock' | 'prices'>('shopping');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const listsRef = useRef(lists);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  // New Security & Feedback states
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackFeature, setFeedbackFeature] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);

  // Audit Logging Helper
  const logAction = async (action: string, context: string = '') => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'logs'), {
        userId: user.uid,
        userEmail: user.email,
        action,
        context,
        timestamp: serverTimestamp(),
        // IP registration would normally happen server-side, but we log the attempt here
      });
    } catch (e) {
      console.error("Logging error:", e);
    }
  };

  // Feedback Helper
  const submitFeedback = async () => {
    if (!user || feedbackRating === 0) return;
    try {
      await addDoc(collection(db, 'feedback'), {
        userId: user.uid,
        rating: feedbackRating,
        message: feedbackMessage,
        feature: feedbackFeature,
        timestamp: serverTimestamp()
      });
      setShowFeedbackModal(false);
      setFeedbackRating(0);
      setFeedbackMessage('');
    } catch (e) {
      console.error("Feedback error:", e);
    }
  };

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        logAction('login', u.email || 'unknown');
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync: Profile & Admin-only Data
  useEffect(() => {
    if (!user) return;

    // Check Profile (Admin & Approval Status)
    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), 
      (doc) => {
        const isHardcodedAdmin = user.email?.toLowerCase() === 'thiago.orlandi1@gmail.com';
        if (doc.exists()) {
          const data = doc.data();
          setIsAdmin(!!data.isAdmin || isHardcodedAdmin);
          setIsApproved(!!data.isApproved || isHardcodedAdmin);
          
          if (!data.phone) {
            setNeedsPhoneOnboarding(true);
          } else {
            setNeedsPhoneOnboarding(false);
          }
        } else if (isHardcodedAdmin) {
          setIsAdmin(true);
          setIsApproved(true);
        }
      },
      (error) => console.error("Profile sync error:", error)
    );

    // Sync Users (only if admin)
    let unsubUsers = () => {};
    if (isAdmin) {
      const qUsers = query(collection(db, 'users'));
      unsubUsers = onSnapshot(qUsers, 
        (snapshot) => {
          const users: any[] = [];
          snapshot.forEach(d => users.push(d.data()));
          setAllUsers(users);
        },
        (error) => console.error("Users sync error:", error)
      );
    }

    return () => {
      unsubProfile();
      unsubUsers();
    };
  }, [user, isAdmin]);

  // Sync Residences
  useEffect(() => {
    if (!user) return;

    let qRes;
    if (isAdmin) {
      qRes = query(collection(db, 'residences'));
    } else {
      qRes = query(collection(db, 'residences'), where('members', 'array-contains', user.uid));
    }

    const unsubRes = onSnapshot(qRes, (snapshot) => {
      const res: Residence[] = [];
      snapshot.forEach(d => res.push({ id: d.id, ...d.data() } as Residence));
      setResidences(res);
      
      const persistedId = localStorage.getItem('lar360_selected_residence');
      const isStillMember = res.some(r => r.id === persistedId);

      // Check for onboarding for new users
      if (res.length === 0 && !localStorage.getItem('lar360_onboarded')) {
        setShowOnboarding(true);
      }

      // Auto-select first if none selected or no longer member
      if (res.length > 0 && (!selectedResidenceId || !isStillMember)) {
        const defaultId = res[0].id;
        setSelectedResidenceId(defaultId);
        localStorage.setItem('lar360_selected_residence', defaultId);
      } else if (res.length === 0 || (selectedResidenceId && !isStillMember)) {
        // Se o usuário não tem NENHUMA residência, force a tela de Selecionar/Criar
        setSelectedResidenceId(null);
        localStorage.removeItem('lar360_selected_residence');
      }
    });

    return () => unsubRes();
  }, [user, isAdmin, selectedResidenceId]);

  // Sync Access Requests (for residence owners)
  useEffect(() => {
    if (!user || !selectedResidenceId) return;
    const res = residences.find(r => r.id === selectedResidenceId);
    if (!res || res.ownerId !== user.uid) return;

    const qReq = query(collection(db, 'residences', selectedResidenceId, 'accessRequests'), where('status', '==', 'pending'));
    const unsubReq = onSnapshot(qReq, (snapshot) => {
      const reqs: any[] = [];
      snapshot.forEach(d => reqs.push({ id: d.id, ...d.data() }));
      setAccessRequests(reqs);
    });

    return () => unsubReq();
  }, [user, selectedResidenceId, residences]);

  // Sync Residence Specific Data
  useEffect(() => {
    if (!user || !selectedResidenceId) {
      // Clear data if no residence selected
      setInventory([]);
      setHistory([]);
      setGifts([]);
      setHomeTasks([]);
      setFinances([]);
      setLists({
        'Compras da Semana': [],
        'Carnes e Frios': [],
        'Bebidas': [],
        'Padaria': [],
        'Limpeza e Higiene': [],
        'Hortifruti': [],
      });
      return;
    }

    // Sync Lists
    const qLists = query(collection(db, `residences/${selectedResidenceId}/lists`));
    const unsubLists = onSnapshot(qLists, 
      (snapshot) => {
        const newLists: Record<string, GroceryItem[]> = {
          'Compras da Semana': [],
          'Carnes e Frios': [],
          'Bebidas': [],
          'Padaria': [],
          'Limpeza e Higiene': [],
          'Hortifruti': [],
        };
        snapshot.forEach((doc) => {
          const data = doc.data();
          newLists[doc.id] = data.items || [];
        });
        setLists(newLists);
      },
      (error) => console.error("Lists sync error:", error)
    );

    // Sync Inventory
    const qInv = query(collection(db, `residences/${selectedResidenceId}/inventory`));
    const unsubInv = onSnapshot(qInv, 
      (snapshot) => {
        const newInv: InventoryItem[] = [];
        snapshot.forEach((doc) => {
          newInv.push({ id: doc.id, ...doc.data() } as InventoryItem);
        });
        setInventory(newInv.sort((a,b) => a.name.localeCompare(b.name)));
      },
      (error) => console.error("Inventory sync error:", error)
    );

    // Sync History
    const qHist = query(collection(db, `residences/${selectedResidenceId}/history`));
    const unsubHist = onSnapshot(qHist, 
      (snapshot) => {
        const newHist: SavedList[] = [];
        snapshot.forEach((doc) => {
          newHist.push({ id: doc.id, ...doc.data() } as SavedList);
        });
        setHistory(newHist.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      },
      (error) => console.error("History sync error:", error)
    );

    // Sync Gifts
    const qGifts = query(collection(db, `residences/${selectedResidenceId}/gifts`));
    const unsubGifts = onSnapshot(qGifts, 
      (snapshot) => {
        const g: GiftItem[] = [];
        snapshot.forEach(d => g.push({ id: d.id, ...d.data() } as GiftItem));
        setGifts(g);
      },
      (error) => console.error("Gifts sync error:", error)
    );

    // Sync Tasks
    const qTasks = query(collection(db, `residences/${selectedResidenceId}/tasks`));
    const unsubTasks = onSnapshot(qTasks, 
      (snapshot) => {
        const t: HomeTask[] = [];
        snapshot.forEach(d => t.push({ id: d.id, ...d.data() } as HomeTask));
        setHomeTasks(t);
      },
      (error) => console.error("Tasks sync error:", error)
    );

    // Sync Finances
    const qFinances = query(collection(db, `residences/${selectedResidenceId}/finances`));
    const unsubFinances = onSnapshot(qFinances, 
      (snapshot) => {
        const f: FinanceItem[] = [];
        snapshot.forEach(d => f.push({ id: d.id, ...d.data() } as FinanceItem));
        setFinances(f);
      },
      (error) => console.error("Finances sync error:", error)
    );

    return () => {
      unsubLists();
      unsubInv();
      unsubHist();
      unsubGifts();
      unsubTasks();
      unsubFinances();
    };
  }, [user, selectedResidenceId]);

  const [financeForm, setFinanceForm] = useState({ description: '', value: 0, type: 'variable' as 'fixed' | 'variable', category: 'Alimentação', attachmentUrl: '', attachmentName: '' });
  const [taskForm, setTaskForm] = useState({ 
    title: '', 
    priority: 'med' as 'low' | 'med' | 'high',
    category: 'Geral'
  });

  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [giftForm, setGiftForm] = useState({ recipient: '', occasion: '', ideas: '' });

  const addFinanceItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedResidenceId || !financeForm.description) return;
    await addDoc(collection(db, `residences/${selectedResidenceId}/finances`), {
      ...financeForm,
      date: new Date().toISOString().split('T')[0]
    });
    setFinanceForm({ description: '', value: 0, type: 'variable', category: 'Alimentação', attachmentUrl: '', attachmentName: '' });
  };

  const handleFinanceAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Arquivo muito grande. Limite de 2MB para anexos.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setFinanceForm(prev => ({
        ...prev,
        attachmentUrl: event.target?.result as string,
        attachmentName: file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  const generateMonthlyReport = async () => {
    if (!user || !selectedResidenceId) return;
    setIsGeneratingReport(true);
    setAiReport(null);

    const fixedCosts = finances.filter(f => f.type === 'fixed').reduce((acc, f) => acc + f.value, 0);
    const varCosts = finances.filter(f => f.type === 'variable').reduce((acc, f) => acc + f.value, 0);
    const groceryTotal = Object.values(lists || {}).reduce((acc, items) => {
      return acc + (items || []).reduce((itemAcc, item) => {
        const prices = Object.values(item?.prices || {});
        const avg = prices.length > 0 ? (prices.reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0) / prices.length) : 0;
        return itemAcc + avg;
      }, 0);
    }, 0);

    const details = finances.map(f => `${f.description}: R$ ${f.value.toFixed(2)} (${f.type})`).join(', ');

    try {
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `Você é um consultor financeiro residencial especialista em economia doméstica. 
        Analise os gastos da residência atual para o mês presente.
        
        DADOS:
        - Custos Fixos: R$ ${(fixedCosts ?? 0).toFixed(2)}
        - Custos Variáveis: R$ ${(varCosts ?? 0).toFixed(2)}
        - Estimativa de Compras Atuais: R$ ${(groceryTotal ?? 0).toFixed(2)}
        - Total Geral: R$ ${((fixedCosts ?? 0) + (varCosts ?? 0) + (groceryTotal ?? 0)).toFixed(2)}
        - Lançamentos detalhados: ${details}
        
        OBJETIVO:
        Forneça uma análise crítica em português estruturada em Markdown.
        1. Resumo da situação.
        2. Top 3 áreas para redução de custos imediatos.
        3. Dicas específicas para economizar usando os preços dos supermercados BH, EPA e Apoio Mineiro.
        4. Meta de economia sugerida.` }]} ],
        generationConfig: { systemInstruction: "Seja prático e motivador." } as any
      });
      setAiReport(response.response.text());
    } catch (e) {
      console.error(e);
      setAiReport("Erro ao gerar análise I.A. Verifique sua conexão.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const exportListAsReport = () => {
    if (!activeList) return;
    const items = lists[activeList];
    if (!items) return;

    let content = `LAR360 - RELATÓRIO DE COMPRAS - ${activeList.toUpperCase()}\n`;
    content += `Data: ${new Date().toLocaleDateString('pt-BR')}\n`;
    content += `------------------------------------------\n\n`;

    stores.forEach(store => {
      let storeTotal = 0;
      content += `SUPERMERCADO: ${store.name}\n`;
      (items || []).forEach(item => {
        const price = (item.prices?.[store.name] ?? 0);
        storeTotal += price;
        content += `- ${item.name.padEnd(25)} R$ ${price.toFixed(2)}\n`;
      });
      content += `TOTAL ESTIMADO NESTA LOJA: R$ ${(storeTotal ?? 0).toFixed(2)}\n`;
      content += `------------------------------------------\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_compras_${activeList.toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const addHomeTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedResidenceId || !taskForm.title) return;
    await addDoc(collection(db, `residences/${selectedResidenceId}/tasks`), {
      ...taskForm,
      status: 'todo'
    });
    setTaskForm({ title: '', priority: 'med', category: 'Geral' });
  };

  const addGiftItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedResidenceId || !giftForm.recipient) return;
    await addDoc(collection(db, `residences/${selectedResidenceId}/gifts`), {
      ...giftForm,
      status: 'planning'
    });
    setGiftForm({ recipient: '', occasion: '', ideas: '' });
  };

  const deleteFinance = async (id: string) => {
    if (!user || !selectedResidenceId) return;
    await deleteDoc(doc(db, `residences/${selectedResidenceId}/finances`, id));
  };

  const deleteTask = async (id: string) => {
    if (!user || !selectedResidenceId) return;
    await deleteDoc(doc(db, `residences/${selectedResidenceId}/tasks`, id));
  };

  const toggleTaskStatus = async (id: string, current: string) => {
    if (!user || !selectedResidenceId) return;
    const nextStatus = current === 'todo' ? 'doing' : current === 'doing' ? 'done' : 'todo';
    await updateDoc(doc(db, `residences/${selectedResidenceId}/tasks`, id), { status: nextStatus });
  };

  const deleteGift = async (id: string) => {
    if (!user || !selectedResidenceId) return;
    await deleteDoc(doc(db, `residences/${selectedResidenceId}/gifts`, id));
  };

  const updateGiftStatus = async (id: string, status: string) => {
    if (!user || !selectedResidenceId) return;
    await updateDoc(doc(db, `residences/${selectedResidenceId}/gifts`, id), { status });
  };

  const createResidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !residenceNameInput) return;
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const resRef = await addDoc(collection(db, 'residences'), {
      name: residenceNameInput,
      ownerId: user.uid,
      members: [user.uid],
      inviteCode,
      createdAt: serverTimestamp()
    });
    setSelectedResidenceId(resRef.id);
    localStorage.setItem('lar360_selected_residence', resRef.id);
    setResidenceNameInput('');
    logAction('create_residence', residenceNameInput);
  };

  const joinResidence = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (!user || !code) return;
    setIsJoining(true);
    try {
      const q = query(collection(db, 'residences'), where('inviteCode', '==', code));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        alert('Código de convite inválido.');
        setIsJoining(false);
        return;
      }

      const resDoc = querySnapshot.docs[0];
      const resData = resDoc.data();

      if (resData.members.includes(user.uid)) {
        setSelectedResidenceId(resDoc.id);
        localStorage.setItem('lar360_selected_residence', resDoc.id);
        setIsJoining(false);
        return;
      }

      await addDoc(collection(db, 'residences', resDoc.id, 'accessRequests'), {
        requestingUserId: user.uid,
        requestingUserEmail: user.email,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      
      alert('Solicitação de acesso enviada! Aguarde a aprovação do proprietário.');
      setJoinCodeInput('');
      logAction('request_join', resData.name);
    } catch (error) {
      console.error("Error joining residence:", error);
      alert('Erro ao entrar na residência.');
    } finally {
      setIsJoining(false);
    }
  };

  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);

  const createNewList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !selectedResidenceId) return;
    
    await setDoc(doc(db, `residences/${selectedResidenceId}/lists`, newListName), {
      items: [],
      createdAt: serverTimestamp()
    });
    
    setActiveList(newListName);
    setNewListName('');
    setIsAddingList(false);
  };

  const shareInviteCode = async (specificCode?: string) => {
    const inviteCode = specificCode || residences.find(r => r.id === selectedResidenceId)?.inviteCode;
    if (!inviteCode) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Lar360 - Convite',
          text: `Entre na minha residência no Lar360 usando o código: ${inviteCode}`,
          url: window.location.href
        });
      } catch (err) {
        // Only log if not a user cancel
        if ((err as Error).name !== 'AbortError') {
          console.error('Erro ao compartilhar:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(inviteCode);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch (err) {
        console.error('Clipboard error:', err);
        alert(`Código: ${inviteCode}`);
      }
    }
  };

  const shareInviteWhatsApp = (specificCode?: string) => {
    const inviteCode = specificCode || residences.find(r => r.id === selectedResidenceId)?.inviteCode;
    if (!inviteCode) return;
    const text = `Oi! Entre na minha residência no app Lar360 com este código: *${inviteCode}*\n\nAcesse aqui: ${window.location.origin}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const approveAccess = async (requestId: string, requestingUid: string) => {
    if (!user || !selectedResidenceId) return;
    try {
      await runTransaction(db, async (transaction) => {
        const resRef = doc(db, 'residences', selectedResidenceId);
        const reqRef = doc(db, 'residences', selectedResidenceId, 'accessRequests', requestId);
        
        transaction.update(resRef, {
          members: arrayUnion(requestingUid)
        });
        transaction.update(reqRef, {
          status: 'approved'
        });
      });
      logAction('approve_access', requestingUid);
    } catch (e) {
      console.error("Approval error:", e);
    }
  };

  const rejectAccess = async (requestId: string) => {
    if (!user || !selectedResidenceId) return;
    try {
      await updateDoc(doc(db, 'residences', selectedResidenceId, 'accessRequests', requestId), {
        status: 'rejected'
      });
      logAction('reject_access', requestId);
    } catch (e) {
      console.error("Rejection error:", e);
    }
  };

  const updateResidenceName = async (newName: string) => {
    if (!user || !selectedResidenceId) return;
    const res = residences.find(r => r.id === selectedResidenceId);
    if (res?.ownerId !== user.uid) {
      alert('Apenas o proprietário pode renomear a residência.');
      return;
    }
    await updateDoc(doc(db, 'residences', selectedResidenceId), { name: newName });
  };

  const leaveResidence = async () => {
    if (!user || !selectedResidenceId) return;
    const res = residences.find(r => r.id === selectedResidenceId);
    if (!res) return;
    
    if (res.ownerId === user.uid) {
      alert('O proprietário não pode sair da residência. Você deve excluir a residência ou transferir a propriedade.');
      return;
    }

    if (confirm('Deseja realmente sair desta residência?')) {
      const updatedMembers = res.members.filter(m => m !== user.uid);
      await updateDoc(doc(db, 'residences', selectedResidenceId), { members: updatedMembers });
      setSelectedResidenceId(null);
      localStorage.removeItem('lar360_selected_residence');
    }
  };

  const deleteResidence = async () => {
    if (!user || !selectedResidenceId) return;
    const res = residences.find(r => r.id === selectedResidenceId);
    if (res?.ownerId !== user.uid) return;

    if (confirm('Tem certeza? Isso excluirá permanentemente todos os dados (estoque, listas, histórico) desta residência.')) {
      await deleteDoc(doc(db, 'residences', selectedResidenceId));
      setSelectedResidenceId(null);
      localStorage.removeItem('lar360_selected_residence');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) {
        const result = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        const isFirstAdmin = authEmail.toLowerCase() === 'thiago.orlandi1@gmail.com';

        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          email: result.user.email,
          isAdmin: isFirstAdmin,
          isApproved: isFirstAdmin,
          createdAt: serverTimestamp()
        }, { merge: true });

        // Novo usuário: pedir nome e telefone imediatamente
        if (!isFirstAdmin) {
          setNeedsPhoneOnboarding(true);
        }
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (error: any) {
      setAuthError(error.message);
    }
  };

  const toggleUserApproval = async (targetUid: string, currentStatus: boolean) => {
    if (!isAdmin) return;
    await updateDoc(doc(db, 'users', targetUid), {
      isApproved: !currentStatus
    });
  };

  const signInWithGoogle = async (e: React.MouseEvent) => {
    e.preventDefault();
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const userRef = doc(db, 'users', result.user.uid);
      const isFirstAdmin = result.user.email?.toLowerCase() === 'thiago.orlandi1@gmail.com';
      
      // Verificar se já tem telefone cadastrado
      const userSnap = await getDoc(userRef);
      const isNewUser = !userSnap.exists() || !userSnap.data()?.phone;

      await setDoc(userRef, {
        uid: result.user.uid,
        email: result.user.email,
        isAdmin: isFirstAdmin,
        isApproved: isFirstAdmin,
        createdAt: serverTimestamp()
      }, { merge: true });

      // Se não tem telefone ainda, pedir agora
      if (isNewUser && !isFirstAdmin) {
        setNeedsPhoneOnboarding(true);
      }
    } catch (error: any) {
      console.error(error);
      setAuthError("Erro no Google: " + error.message);
    }
  };

  const handleSignOut = () => signOut(auth);

  const saveOnboardPhone = async () => {
    if (!user || !onboardPhone || !onboardName) return;
    setOnboardSaving(true);
    const cleanPhone = onboardPhone.replace(/\D/g, '');
    try {
      await setDoc(doc(db, 'users', user.uid), {
        phone: cleanPhone,
        name: onboardName
      }, { merge: true });
      setNeedsPhoneOnboarding(false);
    } catch(e) {
      console.error(e);
      alert('Erro ao salvar o telefone');
    }
    setOnboardSaving(false);
  };

  const handleCameraClick = (mode: 'shopping' | 'stock' | 'prices') => {
    setIsReceiptMode(mode);
    fileInputRef.current?.click();
  };

  const items = lists[activeList] || [];

  const setItems = async (newItems: GroceryItem[] | ((prev: GroceryItem[]) => GroceryItem[])) => {
    if (!user || !selectedResidenceId) return [];
    // Use the ref to get the absolute latest state from the last render
    const currentItems = listsRef.current[activeList] || [];
    const updatedItems = typeof newItems === 'function' ? newItems(currentItems) : newItems;
    
    await setDoc(doc(db, `residences/${selectedResidenceId}/lists`, activeList), {
      items: updatedItems,
      updatedAt: serverTimestamp()
    });
    return updatedItems;
  };

  const deleteInventoryItem = async (id: string) => {
    if (!user || !selectedResidenceId) return;
    await deleteDoc(doc(db, `residences/${selectedResidenceId}/inventory`, id));
  };

  const addInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventoryForm.name || !user || !selectedResidenceId || isAddingInventory) return;
    
    setIsAddingInventory(true);
    try {
      const newItem = {
        ...inventoryForm
      };
      
      const docRef = await addDoc(collection(db, `residences/${selectedResidenceId}/inventory`), newItem);
      setInventoryForm({ name: '', current: 0, min: 1, unit: 'un' });
      logAction('add_to_stock', newItem.name);
      // Note: checkAndRefill is async but we don't await it here as it's secondary
      checkAndRefill({ ...newItem, id: docRef.id });
    } finally {
      setIsAddingInventory(false);
    }
  };

  const updateInventory = async (id: string, delta: number) => {
    if (!user || !selectedResidenceId) return;
    const item = inventory.find(i => i.id === id);
    if (!item) return;

    const newCount = Math.max(0, item.current + delta);
    await updateDoc(doc(db, `residences/${selectedResidenceId}/inventory`, id), {
      current: newCount
    });
    
    checkAndRefill({ ...item, current: newCount });
  };

  const analyzeItem = async (itemName: string, itemId: string, listName: string, baseList?: GroceryItem[]) => {
    if (!user || !selectedResidenceId) return;
    try {
      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              category: { type: SchemaType.STRING },
              prices: {
                type: SchemaType.OBJECT,
                properties: stores.reduce((acc, s) => ({ ...acc, [s.name]: { type: SchemaType.NUMBER } }), {})
              }
            }
          }
        }
      });

      const response = await model.generateContent(`Analise o item de mercado "${itemName}". 
        Determine a categoria entre: ${DEFAULT_CATEGORIES.join(', ')}.
        Estime o preço médio em Reais (BRL) para os seguintes supermercados reais de Belo Horizonte/MG: ${stores.map(s => s.name).join(', ')}.
        Seja realista com os preços praticados nessas redes (BH, EPA, Apoio).
        Retorne um JSON puro.`);

      const data = JSON.parse(response.response.text() || '{}');
      
      // Use provided baseList or current state
      const currentListItems = baseList || lists[listName] || [];
      const listData = currentListItems.map(item => 
        item.id === itemId ? { ...item, category: data.category || 'Outros', prices: data.prices || item.prices } : item
      );

      await setDoc(doc(db, `residences/${selectedResidenceId}/lists`, listName), {
        items: listData,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Erro ao analisar item:", error);
    }
  };

  const checkAndRefill = async (item: InventoryItem) => {
    if (!user || !selectedResidenceId) return;
    if (item.current <= item.min) {
      const weeklyItems = lists['Compras da Semana'] || [];
      const existingItemIndex = weeklyItems.findIndex(i => i.name.toLowerCase().includes(item.name.toLowerCase()));
      
      let quantityToAdd = item.min - item.current;
      if (quantityToAdd <= 0) quantityToAdd = 1;

      if (existingItemIndex === -1) {
        const initialPrices: Record<string, number> = {};
        stores.forEach(s => initialPrices[s.name] = 0);
        const tempId = Math.random().toString(36).substr(2, 9);

        const newItem: GroceryItem = {
          id: tempId,
          name: `${item.name} (Reposição Estoque)`,
          quantity: quantityToAdd,
          unit: item.unit || 'un',
          category: 'Outros',
          prices: initialPrices,
          checked: false,
        };

        const newList = [...weeklyItems, newItem];
        await setDoc(doc(db, `residences/${selectedResidenceId}/lists`, 'Compras da Semana'), {
          items: newList,
          updatedAt: serverTimestamp()
        });

        await analyzeItem(item.name, tempId, 'Compras da Semana', newList);
      } else {
        if (weeklyItems[existingItemIndex].quantity < quantityToAdd) {
          const newList = [...weeklyItems];
          newList[existingItemIndex] = {
            ...newList[existingItemIndex],
            quantity: quantityToAdd
          };
          await setDoc(doc(db, `residences/${selectedResidenceId}/lists`, 'Compras da Semana'), {
            items: newList,
            updatedAt: serverTimestamp()
          });
        }
      }
    }
  };

  // Initialize Gemini
  const ai = useMemo(() => {
    // Busca priorizando VITE_GEMINI_API_KEY do build e tenta remover espaços extras
    const key = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
    if (!key) console.warn("⚠️ VITE_GEMINI_API_KEY não encontrada no build.");
    return new GoogleGenerativeAI(key || 'DUMMY_KEY'); 
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          findLocalStores(latitude, longitude);
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          findLocalStores(); // Fallback to generic city
        }
      );
    } else {
      findLocalStores();
    }
  }, []);

  const findLocalStores = async (lat?: number, lon?: number) => {
    setIsSearchingStores(true);
    try {
      let locationQuery = "Brasil";
      if (lat && lon) {
        locationQuery = `latitude: ${lat}, longitude: ${lon}`;
      }

      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              city: { type: SchemaType.STRING },
              stores: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    icon: { type: SchemaType.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const response = await model.generateContent(`Encontre os nomes de 3 supermercados reais e grandes próximos a esta localização: ${locationQuery}. Se não encontrar uma localização exata, use a capital mais próxima no Brasil. 
        Retorne um JSON com a propriedade "city" (nome da cidade) e "stores" (array de objetos com "name" e "icon" que deve ser um emoji de mercado).`);

      const data = JSON.parse(response.response.text() || '{}');
      if (data.stores && data.stores.length > 0) {
        setStores(data.stores);
        setSelectedStore(data.stores[0].name);
        setLocationName(data.city);
        localStorage.setItem('lar360_last_location', data.city);
      }
    } catch (error) {
      console.error("Erro ao buscar supermercados locais:", error);
      // Fallback em caso de erro na API ou localização
      setStores(STORES_INITIAL);
      setLocationName("Belo Horizonte (Padrão)");
    } finally {
      setIsSearchingStores(false);
    }
  };

  const addItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanName = newItemName.trim();
    if (!cleanName) return;

    setIsAnalyzing(true);
    
    // Create local item first
    const tempId = Math.random().toString(36).substr(2, 9);
    const initialPrices: Record<string, number> = {};
    
    // Optimistic Prices from COMMON_PRICES
    const lowerName = cleanName.toLowerCase();
    const basePrice = Object.entries(COMMON_PRICES).find(([k]) => lowerName.includes(k))?.[1] || 0;
    
    stores.forEach(s => {
      // Add a small random variation (+/- 5%) to make it look real across stores
      const variation = basePrice > 0 ? (1 + (Math.random() * 0.1 - 0.05)) : 1;
      initialPrices[s.name] = basePrice * variation;
    });

    const newItem: GroceryItem = {
      id: tempId,
      name: cleanName,
      quantity: newItemQuantity,
      unit: newItemUnit,
      category: 'Outros',
      prices: initialPrices,
      checked: false,
    };

    const currentList = lists[activeList] || [];
    
    let updatedList;
    let targetId = tempId;
    
    const existingIndex = currentList.findIndex(i => i.name.trim().toLowerCase() === lowerName);
    if (existingIndex >= 0) {
      updatedList = [...currentList];
      updatedList[existingIndex] = {
        ...updatedList[existingIndex],
        quantity: updatedList[existingIndex].quantity + newItemQuantity
      };
      targetId = updatedList[existingIndex].id;
    } else {
      updatedList = [...currentList, newItem];
    }
    
    // Use the custom setItems but await it
    await setItems(updatedList);
    
    const nameAtCapture = cleanName;
    setNewItemName('');
    setNewItemQuantity(1);
    setNewItemUnit('un');

    try {
      if (existingIndex < 0 || basePrice === 0) {
        // Run AI to refine or find real prices
        analyzeItem(nameAtCapture, targetId, activeList, updatedList);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const refreshPricesByLocation = async () => {
    if (!user || !selectedResidenceId || items.length === 0) return;
    setIsAnalyzing(true);
    
    // Mostremos um feedback claro de que pode demorar
    alert("O Radar de Inteligência Artificial está cotando o preço total do seu carrinho nos maiores hipermercados mais perto de você agora!");

    try {
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `Você é um avaliador de supermercados. Localização do usuário: ${locationName}. 
        Mercados atuais sendo analisados: ${stores.map(s => s.name).join(', ')}.
        Para a seguinte lista de produtos:
        ${items.map(i => `- ${i.quantity} ${i.unit} de ${i.name}`).join('\n')}
        
        Estime o preço atual (realista, em BRL, na última semana) do valor unitário de cada um desses produtos em cada um desses supermercados locais.
        Retorne exatamente um JSON neste formato:
        {
          "items": [
            {
               "itemName": "nome exato do item conforme listado",
               "prices": {
                  "Nome Exato do Mercado 1": 15.99,
                  "Nome Exato do Mercado 2": 16.50
               }
            }
          ]
        }` }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.response.text() || '{}');
      if (data.items) {
        const updatedItems = items.map(item => {
          // Busca case insensitive
          const match = data.items.find((resItem: any) => 
             resItem.itemName.toLowerCase() === item.name.toLowerCase()
          );
          if (match && match.prices) {
             return { ...item, prices: match.prices };
          }
          return item;
        });

        await setItems(updatedItems);
      }
    } catch (err) {
      console.error(err);
      alert(`Erro na cotação: ${err instanceof Error ? err.message : 'Falha na conexão com a nuvem'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'shopping' | 'stock' | 'prices' = 'shopping') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingReceipt(mode);
    
    try {
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      const promptMap = {
        shopping: `Analise esta imagem (nota fiscal, panfleto ou propaganda) e extraia uma lista de itens de mercado. 
            Para cada item, identifique o NOME PADRONIZADO (ex: "Leite Integral 1L" em vez de "LEITE UHT"), a categoria mais próxima entre (${DEFAULT_CATEGORIES.join(', ')}) 
            e o preço encontrado na imagem. Estime para as lojas reais: ${stores.map(s => s.name).join(', ')}.
            Retorne uma lista JSON de objetos com: name, category, prices (objeto com os nomes das lojas).`,
        stock: `Analise este CUPOM FISCAL e extraia os itens comprados. 
            Para cada item, identifique o NOME PADRONIZADO de mercado (ex: "Arroz Agulhinha 5kg", "Detergente Líquido 500ml").
            Identifique a QUANTIDADE comprada e o VALOR PAGO.
            O objetivo é REPOR O ESTOQUE. 
            Retorne um JSON: { items: [{ name: string, quantity: number, price: number }] }.`,
        prices: `Analise este CUPOM FISCAL ou PANFLETO e extraia apenas os PREÇOS atuais.
            Use NOMES PADRONIZADOS de mercado.
            Identifique o mercado emissor se possível ou use o preço para atualizar a base de dados.
            Retorne um JSON: { items: [{ name: string, price: number }] }.`
      };

      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: mode === 'shopping' ? {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                name: { type: SchemaType.STRING },
                category: { type: SchemaType.STRING },
                prices: {
                  type: SchemaType.OBJECT,
                  properties: stores.reduce((acc, s) => ({ ...acc, [s.name]: { type: SchemaType.NUMBER } }), {})
                }
              }
            }
          } : {
            type: SchemaType.OBJECT,
            properties: {
              items: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    quantity: { type: SchemaType.NUMBER },
                    price: { type: SchemaType.NUMBER }
                  }
                }
              }
            }
          }
        }
      });

      const response = await model.generateContent([
        {
          text: promptMap[mode]
        },
        {
          inlineData: {
            mimeType: file.type,
            data: base64Data
          }
        }
      ]);

      const data = JSON.parse(response.response.text() || (mode === 'shopping' ? '[]' : '{"items":[]}'));

      if (mode === 'shopping') {
        const processedItems: GroceryItem[] = data.map((raw: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: raw.name || "Item sem nome",
          quantity: raw.quantity || 1,
          unit: raw.unit || 'un',
          category: raw.category || "Outros",
          prices: raw.prices || stores.reduce((acc, s) => ({ ...acc, [s.name]: 0 }), {}),
          checked: false
        }));
        setItems(prev => [...prev, ...processedItems]);
      } else if (mode === 'stock') {
        // Update Inventory in Firestore
        for (const item of data.items) {
          const matchedItem = inventory.find(i => i.name.toLowerCase() === item.name.toLowerCase());
          if (matchedItem && selectedResidenceId) {
            await updateDoc(doc(db, `residences/${selectedResidenceId}/inventory`, matchedItem.id), {
              current: matchedItem.current + (item.quantity || 1)
            });
          } else if (selectedResidenceId) {
            await addDoc(collection(db, `residences/${selectedResidenceId}/inventory`), {
              name: item.name,
              current: item.quantity || 1,
              min: 1,
              unit: 'un'
            });
          }
        }

        // Update list prices in Firestore
        for (const listName of Object.keys(lists)) {
          const updatedItems = lists[listName].map(li => {
            const matchedUpdate = data.items.find((u: any) => u.name.toLowerCase() === li.name.toLowerCase());
            if (matchedUpdate) {
              return {
                ...li,
                prices: { ...li.prices, [selectedStore]: matchedUpdate.price }
              };
            }
            return li;
          });
          
          if (JSON.stringify(updatedItems) !== JSON.stringify(lists[listName]) && selectedResidenceId) {
            await setDoc(doc(db, `residences/${selectedResidenceId}/lists`, listName), {
              items: updatedItems,
              updatedAt: serverTimestamp()
            });
          }
        }
      } else if (mode === 'prices') {
        // Update prices globally in Firestore
        for (const listName of Object.keys(lists)) {
          const updatedItems = lists[listName].map(li => {
            const matchedUpdate = data.items.find((u: any) => u.name.toLowerCase() === li.name.toLowerCase());
            if (matchedUpdate) {
              return {
                ...li,
                prices: { ...li.prices, [selectedStore]: matchedUpdate.price }
              };
            }
            return li;
          });

          if (JSON.stringify(updatedItems) !== JSON.stringify(lists[listName]) && selectedResidenceId) {
            await setDoc(doc(db, `residences/${selectedResidenceId}/lists`, listName), {
              items: updatedItems,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
      logAction('image_processed', mode);
      setFeedbackFeature('Leitura de IA');
      setShowFeedbackModal(true);
    } catch (error) {
      console.error("Erro ao processar imagem:", error);
    } finally {
      setIsProcessingReceipt(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const shareViaWhatsApp = (itemsToShare: GroceryItem[], listName: string, total: number) => {
    const text = `🛒 *Lista de Compras: ${listName}*\n\n` + 
      itemsToShare.map(i => `${i.checked ? '✅' : '⬜'} ${i.name} - R$ ${(i.prices[selectedStore] ?? 0).toFixed(2)}`).join('\n') +
      `\n\n💰 *Total Estimado: R$ ${(total || 0).toFixed(2)}* (no ${selectedStore})`;
    
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const finishList = async () => {
    if (!user || !selectedResidenceId || items.length === 0) return;
    setShowFinished(true);
    logAction('finish_list', activeList);
    
    const newHistoryEntry: SavedList = {
      id: Math.random().toString(36).substr(2, 9),
      name: activeList,
      date: new Date().toLocaleString('pt-BR'),
      items: [...items],
      total: (totalsByStore && selectedStore) ? (totalsByStore[selectedStore] || 0) : 0,
      store: selectedStore || 'Padrão'
    };

    await addDoc(collection(db, `residences/${selectedResidenceId}/history`), newHistoryEntry);
    
    setTimeout(async () => {
      await setDoc(doc(db, `residences/${selectedResidenceId}/lists`, activeList), {
        items: [],
        updatedAt: serverTimestamp()
      });
      setShowFinished(false);
      
      // Trigger feedback after finishing a list
      setTimeout(() => {
        setFeedbackFeature('Lista de Compras');
        setShowFeedbackModal(true);
      }, 1000);
    }, 3000);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const toggleCheck = (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const totalsByStore = useMemo(() => {
    return stores.reduce((acc, store) => {
      acc[store.name] = items.reduce((sum, item) => sum + ((item?.prices?.[store.name] || 0) * (item?.quantity || 0)), 0);
      return acc;
    }, {} as Record<string, number>);
  }, [items, stores]);

  const bestStore = useMemo(() => {
    if (items.length === 0) return null;
    const sorted = Object.entries(totalsByStore).sort((a, b) => (a[1] as number) - (b[1] as number));
    return sorted[0];
  }, [totalsByStore, items]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (user && needsPhoneOnboarding) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card w-full max-w-lg p-8 rounded-3xl border border-border-main shadow-2xl text-center flex flex-col items-center"
        >
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <span className="text-5xl">🤖</span>
          </div>
          <h2 className="text-3xl font-black text-primary mb-4">Bem-vindo ao Mercatrust!</h2>
          <p className="text-[#6B705C] font-medium leading-relaxed mb-6">
            Vamos começar a planejar o seu estoque inteligente. Nossa IA integrada permite que você controle sua despensa enviando áudios no WhatsApp!<br/><br/>
            Para conectar o seu "controle remoto", por favor insira abaixo o seu <strong>número de WhatsApp com DDD</strong>:
          </p>
          
          <div className="text-left w-full mb-4">
            <label className="block text-xs font-black uppercase text-[#6B705C] mb-1.5 ml-1">👤 Como quer ser chamado?</label>
            <input 
              type="text" 
              value={onboardName}
              onChange={(e) => setOnboardName(e.target.value)}
              className="w-full bg-[#f8f9fa] border border-border-main rounded-xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium text-lg"
              placeholder="Seu primeiro nome"
            />
          </div>

          <div className="text-left w-full mb-8">
            <label className="block text-xs font-black uppercase text-[#6B705C] mb-1.5 ml-1">📱 Seu melhor número (WhatsApp)</label>
            <input 
              type="tel" 
              value={onboardPhone}
              onChange={(e) => setOnboardPhone(e.target.value)}
              className="w-full bg-[#f8f9fa] border border-border-main rounded-xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium text-lg"
              placeholder="DDD + Número"
            />
          </div>

          <button 
            onClick={saveOnboardPhone}
            disabled={onboardSaving || onboardPhone.length < 10 || !onboardName}
            className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {onboardSaving ? 'Salvando...' : 'OK, CONECTAR!'}
          </button>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card w-full max-w-md p-8 rounded-3xl border border-border-main shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="text-4xl mb-2">🏠</div>
            <h1 className="text-2xl font-black text-primary">Lar3600</h1>
            <p className="text-[#6B705C] text-sm">Organize sua residência de forma inteligente</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase text-[#6B705C] mb-1.5 ml-1">E-mail</label>
              <input 
                type="email" 
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full bg-[#f8f9fa] border border-border-main rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-[#6B705C] mb-1.5 ml-1">Senha</label>
              <input 
                type="password" 
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full bg-[#f8f9fa] border border-border-main rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium"
                placeholder="••••••••"
              />
            </div>

            {authError && (
              <div className="bg-error/10 text-error text-xs p-3 rounded-xl flex items-center gap-2 font-bold">
                <AlertCircle size={14} /> {authError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg hover:bg-primary/90 transition-all active:scale-[0.98]"
            >
              {isSignUp ? 'Criar Conta' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 flex flex-col gap-3">
            <button 
              type="button"
              onClick={signInWithGoogle}
              className="w-full bg-white border border-border-main text-text-main py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#f8f9fa] transition-all"
            >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
              Continuar com Google
            </button>

            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary text-sm font-black uppercase tracking-wider hover:underline"
            >
              {isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Cadastrar'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!selectedResidenceId && !authLoading && user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card w-full max-w-lg p-8 rounded-3xl border border-border-main shadow-2xl"
        >
          {residences.length === 0 ? (
            <div className="animate-fade-in flex flex-col items-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary">
                <MapPin size={40} />
              </div>
              <h2 className="text-xl font-black text-primary mb-3">1. Localização do Estoque</h2>
              <p className="text-sm text-[#6B705C] mb-6 text-center">Para que o nosso robô do Gemini consiga buscar as ofertas dos hipermercados perto da sua casa, libere o seu GPS.</p>
              
              <button 
                type="button"
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { alert('Localização ativada! Você já pode criar sua casa.'); findLocalStores(pos.coords.latitude, pos.coords.longitude); },
                      () => alert('Acesso negado. Usaremos localização macro.')
                    );
                  }
                }}
                className="w-full bg-[#006D77] text-white py-3.5 rounded-xl font-black uppercase tracking-widest text-xs mb-8 hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-md"
              >
                <MapPin size={16} /> Liberar Radar (GPS)
              </button>

              <div className="w-full border-t border-border-main pt-6">
                <h2 className="text-xl font-black text-primary mb-3 text-center">2. Nome da sua Casa</h2>
                <form onSubmit={createResidence} className="space-y-4">
                  <input
                    type="text"
                    required
                    placeholder="Ex: Minha Casa, Fazenda, Apê..."
                    value={residenceNameInput}
                    onChange={(e) => setResidenceNameInput(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-4 text-center text-lg font-medium shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={!residenceNameInput.trim()}
                    className="w-full bg-primary text-white py-4 rounded-xl hover:opacity-90 transition-all shadow-xl font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    FINALIZAR CADASTRO
                  </button>
                </form>
              </div>
              <div className="w-full border-t border-border-main mt-6 pt-4 text-center">
                 <p className="text-xs text-[#6B705C] mb-2 font-bold uppercase">Ou foi convidado?</p>
                 <form onSubmit={joinResidence} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Cole o CÓDIGO de convite..."
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    className="flex-1 bg-[#f8f9fa] border border-border-main rounded-xl p-3 text-sm font-medium uppercase text-center"
                  />
                  <button
                    type="submit"
                    disabled={isJoining || !joinCodeInput.trim()}
                    className="bg-secondary text-white px-5 py-3 rounded-xl hover:opacity-90 font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
                  >
                    Entrar
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="text-5xl mb-4">🏠</div>
                <h1 className="text-2xl font-black text-primary mb-2">Selecionar Residência</h1>
                <p className="text-[#6B705C]">Escolha uma residência ativa ou cadastre uma nova.</p>
              </div>

              <div className="space-y-4 mb-8 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {residences.map(res => (
                  <button
                    key={res.id}
                    onClick={() => {
                      setSelectedResidenceId(res.id);
                      localStorage.setItem('lar360_selected_residence', res.id);
                    }}
                    className="w-full p-4 border border-border-main rounded-2xl flex items-center justify-between hover:bg-primary/5 hover:border-primary transition-all group"
                  >
                    <div className="text-left flex-1">
                      <p className="font-bold text-lg">{res.name}</p>
                      <p className="text-[10px] font-black uppercase text-[#6B705C] tracking-widest flex items-center gap-2">
                        {res.members.length} Membros • CÓDIGO: {res.inviteCode}
                        <span className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={(e) => { e.preventDefault(); shareInviteCode(res.inviteCode); }}
                            className="bg-secondary/10 p-1.5 rounded-lg text-secondary hover:bg-secondary hover:text-white transition-all"
                          >
                            <Share2 size={12} />
                          </button>
                          <button 
                            onClick={(e) => { e.preventDefault(); shareInviteWhatsApp(res.inviteCode); }}
                            className="bg-[#25D366]/10 p-1.5 rounded-lg text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all"
                          >
                            <MessageSquare size={12} />
                          </button>
                        </span>
                      </p>
                    </div>
                    <ChevronRight className="text-[#6B705C] group-hover:text-primary transition-all" size={20} />
                  </button>
                ))}
              </div>

              <div className="border-t border-border-main pt-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#6B705C] mb-4">Entrar com Código</h3>
                <form onSubmit={joinResidence} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: ABC123"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    className="flex-1 bg-[#f8f9fa] border border-border-main rounded-xl p-3 text-sm font-medium uppercase"
                  />
                  <button
                    type="submit"
                    disabled={isJoining}
                    className="bg-secondary text-white px-5 py-3 rounded-xl hover:opacity-90 transition-all font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
                  >
                    {isJoining ? '...' : 'Entrar'}
                  </button>
                </form>
              </div>

              <div className="border-t border-border-main pt-6 mt-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#6B705C] mb-4">Nova Residência</h3>
                <form onSubmit={createResidence} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: Minha Casa, Sítio..."
                    value={residenceNameInput}
                    onChange={(e) => setResidenceNameInput(e.target.value)}
                    className="flex-1 bg-[#f8f9fa] border border-border-main rounded-xl p-3 text-sm font-medium"
                  />
                  <button
                    type="submit"
                    className="bg-primary text-white p-3 rounded-xl hover:opacity-90 transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </form>
              </div>
            </>
          )}
          
          <button 
            onClick={handleSignOut}
            className="w-full mt-8 text-[#6B705C] font-black uppercase tracking-widest text-[10px] hover:underline"
          >
            Sair da Conta
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-text-main flex flex-col overflow-hidden h-screen">
      {/* Header */}
      <header className="bg-primary text-white border-b-4 border-secondary px-4 md:px-8 py-3 md:py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3 md:gap-6">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className="text-xl md:text-2xl font-extrabold tracking-tight flex items-center gap-2 hover:opacity-80 transition-opacity"
            title="Ir para o Início"
          >
            <span className="text-xl md:text-2xl">🏠</span> Lar360
          </button>
          <div className="h-6 w-px bg-white/20 hidden lg:block"></div>
          <div className="hidden lg:flex items-center gap-3">
            <div className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2">
              <Home size={14} className="text-secondary" />
              <span className="font-bold text-sm tracking-tight">
                {residences.find(r => r.id === selectedResidenceId)?.name || 'Residência'}
              </span>
            </div>
            <button 
              onClick={() => setSelectedResidenceId(null)}
              className="text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100 flex items-center gap-1 transition-all"
            >
              <RefreshCcw size={12} /> Trocar
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm">
          <div className="hidden sm:flex items-center gap-1 opacity-80">
            <CheckCircle2 size={14} className="text-secondary" /> {user.email?.split('@')[0]}
          </div>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className="lg:hidden bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors"
            title="Página Inicial"
          >
            <Home size={16} />
          </button>
          <button 
            onClick={handleSignOut}
            className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors font-bold uppercase text-[10px] tracking-widest"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex flex-col md:grid md:grid-cols-[240px_1fr] lg:grid-cols-[260px_1fr_300px] gap-3 md:gap-5 p-3 md:p-5 overflow-hidden">
        
        {/* Sidebar - Hidden on mobile, shown as bottom nav instead? No, let's keep it but make it hideable or scrollable */}
        <aside className="hidden md:flex bg-card rounded-[20px] p-5 border border-border-main flex flex-col h-full overflow-hidden">
          <div className="space-y-6 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <div>
              <h2 className="text-[12px] uppercase tracking-widest text-[#6B705C] mb-4 font-black">Navegação</h2>
              <div className="space-y-1">
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'dashboard' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <Home size={16} /> Início
                </button>
                <button 
                  onClick={() => setActiveTab('lists')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'lists' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <ShoppingCart size={16} /> Listas Ativas
                </button>
                <button 
                  onClick={() => setActiveTab('stock')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'stock' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <Package size={16} /> Meu Estoque
                </button>
                <button 
                  onClick={() => setActiveTab('history')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'history' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <History size={16} /> Histórico Salvo
                </button>

                <div className="h-px bg-border-main my-2"></div>

                <button 
                  onClick={() => setActiveTab('tasks')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'tasks' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <Wrench size={16} /> Tarefas da Casa
                </button>
                <button 
                  onClick={() => setActiveTab('gifts')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'gifts' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <Gift size={16} /> Presentes
                </button>
                <button 
                  onClick={() => setActiveTab('finances')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'finances' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <DollarSign size={16} /> Custos Mensais
                </button>
                <button 
                  onClick={() => setActiveTab('monthly_report')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'monthly_report' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <PieChart size={16} /> Relatório Geral
                </button>
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                    activeTab === 'settings' ? 'bg-primary text-white shadow-sm' : 'hover:bg-primary/5 text-[#6B705C]'
                  }`}
                >
                  <Home size={16} /> Gerenciar Residência
                </button>

                {isAdmin && (
                  <button 
                    onClick={() => setActiveTab('admin')}
                    className={`w-full p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold text-sm ${
                      activeTab === 'admin' ? 'bg-[#EF233C] text-white shadow-sm' : 'hover:bg-[#EF233C]/5 text-[#EF233C]'
                    }`}
                  >
                    <Plus size={16} /> Gerenciar Usuários
                  </button>
                )}
              </div>
            </div>

            {activeTab === 'lists' && (
              <div>
                <h2 className="text-[12px] uppercase tracking-widest text-[#6B705C] mb-4 font-black">Listas Disponíveis</h2>
                <div className="space-y-2">
                  {Object.keys(lists).map(listName => (
                    <button 
                      key={listName}
                      onClick={() => setActiveList(listName)}
                      className={`w-full p-3 rounded-xl cursor-pointer transition-all flex items-center gap-2 font-semibold text-left text-xs ${
                        activeList === listName 
                        ? 'bg-secondary text-white shadow-md' 
                        : 'bg-[#f0f2f0] hover:bg-[#e0e2e0] text-[#6B705C]'
                      }`}
                    >
                      {listName.includes('Compras') ? <ShoppingCart size={14} /> : 
                       listName.includes('Hortifruti') ? '🍎' : '🧼'} 
                      <span className="truncate">{listName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto p-4 bg-[#fff4e6] border border-[#ffe8cc] rounded-2xl">
            <p className="text-[10px] font-black uppercase text-secondary mb-1">Dica de IA</p>
            <p className="text-xs text-[#1A1A1A] leading-relaxed">
              Baseado no seu histórico, você costuma comprar <strong>Leite</strong> hoje.
            </p>
          </div>
        </aside>

        {/* Content Area */}
        <section className="bg-card rounded-[24px] p-4 md:p-6 border border-border-main flex flex-col overflow-hidden shadow-sm relative h-full">
          {activeTab === 'dashboard' && (
            <div className="h-full flex flex-col overflow-hidden">
              <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black text-primary mb-2">Bem-vindo ao Lar360</h1>
                  <p className="text-[#6B705C] font-medium">O que você deseja gerenciar hoje?</p>
                </div>
                <div className="bg-white border border-border-main p-4 rounded-3xl flex items-center gap-4 shadow-sm">
                  <div className="bg-primary/5 p-3 rounded-2xl">
                    <Home size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-[#6B705C] tracking-widest leading-none mb-1">Residência Atual</p>
                    <p className="font-bold text-lg leading-none flex items-center gap-2">
                      {residences.find(r => r.id === selectedResidenceId)?.name || 'Carregando...'}
                      {residences.find(r => r.id === selectedResidenceId)?.ownerId === user?.uid && (
                        <button 
                          onClick={() => {
                            const n = prompt('Novo nome da residência:', residences.find(r => r.id === selectedResidenceId)?.name);
                            if (n) updateResidenceName(n);
                          }}
                          className="text-[#6B705C] opacity-40 hover:opacity-100 transition-all"
                        >
                          <Wrench size={12} />
                        </button>
                      )}
                    </p>
                    <p className="text-[10px] font-bold text-secondary mt-1 flex items-center gap-2">
                      CÓDIGO: 
                      <span 
                        onClick={() => shareInviteCode()}
                        className="cursor-pointer hover:underline decoration-dotted"
                      >
                        {residences.find(r => r.id === selectedResidenceId)?.inviteCode || '---'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => shareInviteCode()}
                          className="bg-secondary/10 p-1.5 rounded-lg text-secondary hover:bg-secondary/20 transition-all relative"
                          title="Compartilhar Geral"
                        >
                          <Share2 size={12} />
                          {copyFeedback && (
                            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-secondary text-white text-[8px] font-black uppercase tracking-widest py-1 px-3 rounded shadow-xl whitespace-nowrap z-50">
                              Copiado!
                            </span>
                          )}
                        </button>
                        <button 
                          onClick={() => shareInviteWhatsApp()}
                          className="bg-[#25D366]/10 p-1.5 rounded-lg text-[#25D366] hover:bg-[#25D366]/20 transition-all"
                          title="Compartilhar no WhatsApp"
                        >
                          <MessageSquare size={12} />
                        </button>
                      </div>
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <button 
                  onClick={() => setActiveTab('lists')}
                  className="bg-white border-2 border-primary/5 rounded-[32px] p-8 flex flex-col items-center justify-center text-center gap-5 hover:border-primary hover:bg-primary/5 transition-all group shadow-sm min-h-[180px]"
                >
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <ShoppingCart size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-primary uppercase tracking-tight">Lista de Compras</h3>
                    <p className="text-[10px] text-[#6B705C] font-black uppercase tracking-widest mt-1">Gestão inteligente e preços</p>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab('stock')}
                  className="bg-white border-2 border-secondary/5 rounded-[32px] p-8 flex flex-col items-center justify-center text-center gap-5 hover:border-secondary hover:bg-secondary/5 transition-all group shadow-sm min-h-[180px]"
                >
                  <div className="w-16 h-16 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                    <Package size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-secondary uppercase tracking-tight">Estoque</h3>
                    <p className="text-[10px] text-[#6B705C] font-black uppercase tracking-widest mt-1">Controle e reposição</p>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab('tasks')}
                  className="bg-white border-2 border-accent/5 rounded-[32px] p-8 flex flex-col items-center justify-center text-center gap-5 hover:border-accent hover:bg-accent/5 transition-all group shadow-sm min-h-[180px]"
                >
                  <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                    <ClipboardList size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-accent uppercase tracking-tight">Tarefas</h3>
                    <p className="text-[10px] text-[#6B705C] font-black uppercase tracking-widest mt-1">Rotina e organização</p>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab('finances')}
                  className="bg-white border-2 border-primary/5 rounded-[32px] p-8 flex flex-col items-center justify-center text-center gap-5 hover:border-primary hover:bg-primary/5 transition-all group shadow-sm min-h-[180px]"
                >
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <DollarSign size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-primary uppercase tracking-tight">Finanças</h3>
                    <p className="text-[10px] text-[#6B705C] font-black uppercase tracking-widest mt-1">Gastos e economias</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="h-full flex flex-col">
              <div className="mb-6">
                <h1 className="text-2xl font-black text-primary">Gerenciar Residência</h1>
                <p className="text-sm text-[#6B705C]">Configure os detalhes da sua residência atual.</p>
              </div>

              <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
                {/* Info Card */}
                <div className="bg-white border-2 border-primary/5 rounded-3xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-[#6B705C] tracking-widest block mb-1">Nome da Residência</label>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold">{residences.find(r => r.id === selectedResidenceId)?.name}</h2>
                        {residences.find(r => r.id === selectedResidenceId)?.ownerId === user?.uid && (
                          <button 
                            onClick={() => {
                              const n = prompt('Novo nome:', residences.find(r => r.id === selectedResidenceId)?.name);
                              if (n) updateResidenceName(n);
                            }}
                            className="bg-primary/5 text-primary p-2 rounded-xl hover:bg-primary hover:text-white transition-all"
                          >
                            <Wrench size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <label className="text-[10px] font-black uppercase text-[#6B705C] tracking-widest block mb-1">Código de Convite</label>
                      <div className="bg-[#f8f9fa] border-2 border-dashed border-secondary/30 px-4 py-2 rounded-xl inline-flex items-center gap-3">
                        <span 
                          onClick={() => shareInviteCode()}
                          className="font-black text-secondary tracking-widest cursor-pointer hover:underline decoration-dotted"
                        >
                          {residences.find(r => r.id === selectedResidenceId)?.inviteCode}
                        </span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => shareInviteCode()}
                            title="Compartilhar Geral"
                            className="text-secondary opacity-60 hover:opacity-100 p-1 relative"
                          >
                            <Share2 size={16} />
                            {copyFeedback && (
                              <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-secondary text-white text-[8px] font-black uppercase tracking-widest py-1.5 px-3 rounded shadow-xl whitespace-nowrap z-50">
                                Copiado!
                              </span>
                            )}
                          </button>
                          <button 
                            onClick={() => shareInviteWhatsApp()}
                            className="bg-[#25D366]/10 p-1.5 rounded-lg text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all"
                            title="Compartilhar no WhatsApp"
                          >
                            <MessageSquare size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-border-main my-6 opacity-30"></div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#6B705C]">Moradores ({residences.find(r => r.id === selectedResidenceId)?.members.length})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {residences.find(r => r.id === selectedResidenceId)?.members.map(memberUid => {
                        const isOwner = residences.find(r => r.id === selectedResidenceId)?.ownerId === memberUid;
                        return (
                          <div key={memberUid} className="flex items-center justify-between bg-[#f8f9fa] p-3 rounded-2xl border border-border-main">
                            <span className="text-xs font-bold truncate opacity-80">{memberUid === user?.uid ? 'Você' : memberUid}</span>
                            {isOwner && <span className="text-[9px] font-black bg-secondary/10 text-secondary px-2 py-0.5 rounded-full uppercase">Proprietário</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {residences.find(r => r.id === selectedResidenceId)?.ownerId === user?.uid && accessRequests.length > 0 && (
                    <div className="mt-8 pt-8 border-t border-border-main border-dashed">
                      <h3 className="text-xs font-black uppercase tracking-widest text-error mb-4 flex items-center gap-2">
                        <AlertCircle size={14} /> Solicitações Pendentes
                      </h3>
                      <div className="space-y-3">
                        {accessRequests.map(req => (
                          <div key={req.id} className="bg-white border-2 border-error/10 p-4 rounded-2xl flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold">{req.requestingUserEmail}</p>
                              <p className="text-[10px] text-[#6B705C]">Deseja entrar na sua residência.</p>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => approveAccess(req.id, req.requestingUserId)}
                                className="bg-[#2D6A4F] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:opacity-90"
                              >
                                Aprovar
                              </button>
                              <button 
                                onClick={() => rejectAccess(req.id)}
                                className="bg-[#E5383B] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:opacity-90"
                              >
                                Negar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => setSelectedResidenceId(null)}
                      className="flex-1 bg-white border border-border-main p-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#f8f9fa] transition-all"
                    >
                      <RefreshCcw size={16} /> Trocar de Residência
                    </button>
                    {residences.find(r => r.id === selectedResidenceId)?.ownerId !== user?.uid && (
                      <button 
                        onClick={leaveResidence}
                        className="flex-1 bg-white border border-error text-error p-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-error/5 transition-all"
                      >
                        <AlertCircle size={16} /> Sair da Residência
                      </button>
                    )}
                  </div>

                  {residences.find(r => r.id === selectedResidenceId)?.ownerId === user?.uid && (
                    <button 
                      onClick={deleteResidence}
                      className="w-full bg-[#3D405B] text-white p-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all shadow-lg"
                    >
                      <Trash2 size={16} /> Excluir Residência Permanentemente
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin' && isAdmin && (
            <div className="h-full flex flex-col">
              <div className="mb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-2xl font-black text-primary">Gestão de Usuários</h1>
                  <p className="text-sm text-[#6B705C]">Aprove ou remova o acesso de pessoas à sua residência.</p>
                </div>
                {selectedResidenceId && (
                  <div className="bg-secondary/5 border-2 border-secondary/20 p-4 rounded-2xl text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-secondary mb-1">Código de Convite</p>
                    <p className="text-2xl font-black text-secondary tracking-tighter">
                      {residences.find(r => r.id === selectedResidenceId)?.inviteCode || 'N/A'}
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-card rounded-2xl border border-border-main overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-[#f8f9fa] border-b border-border-main">
                    <tr>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-[#6B705C]">Usuário</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-[#6B705C]">Status</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-[#6B705C] text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-main">
                    {allUsers.map((u) => (
                      <tr key={u.uid} className="hover:bg-primary/5 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold">{u.email}</p>
                          <p className="text-[10px] text-[#9E9E9E] font-medium">{u.uid}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            u.isApproved ? 'bg-[#D8F3DC] text-[#2D6A4F]' : 'bg-[#FFDDD2] text-[#E5383B]'
                          }`}>
                            {u.isApproved ? 'Aprovado' : 'Pendente'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => toggleUserApproval(u.uid, u.isApproved)}
                            disabled={u.uid === user.uid}
                            className={`p-2 rounded-lg transition-all ${
                              u.isApproved ? 'text-[#E5383B] hover:bg-[#FFDDD2]' : 'text-[#2D6A4F] hover:bg-[#D8F3DC]'
                            } disabled:opacity-20`}
                          >
                            {u.isApproved ? 'Bloquear' : 'Aprovar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'lists' && (
            <>
              <AnimatePresence>
                {showFinished && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center text-center p-10 font-sans"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 10 }}
                      className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center text-white mb-4 shadow-xl"
                    >
                      <CheckCircle2 size={40} />
                    </motion.div>
                    <h2 className="text-2xl font-black text-primary uppercase tracking-tight">Lista Finalizada!</h2>
                    <p className="text-[#6B705C] mt-2 mb-6">A lista foi salva em seu Histórico.</p>
                    <button 
                      onClick={() => shareViaWhatsApp(history[0]?.items || [], history[0]?.name || 'Lista', history[0]?.total || 0)}
                      className="bg-[#25D366] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-md"
                    >
                      <MessageSquare size={18} /> Compartilhar Recibo
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mobile Submenu for Lists */}
              <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-4 mb-4 custom-scrollbar whitespace-nowrap">
                {Object.keys(lists).sort().map(listName => (
                  <button 
                    key={listName}
                    onClick={() => setActiveList(listName)}
                    className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeList === listName 
                      ? 'bg-secondary text-white shadow-md' 
                      : 'bg-[#f0f2f0] text-[#6B705C]'
                    }`}
                  >
                    {listName}
                  </button>
                ))}
                <button 
                  onClick={() => setIsAddingList(true)}
                  className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center border-2 border-primary/20"
                >
                  <Plus size={16} />
                </button>
              </div>

              {isAddingList && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border-2 border-primary/20 rounded-2xl p-4 mb-4 shadow-xl"
                >
                  <form onSubmit={createNewList} className="flex gap-2">
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="Nome da nova lista..."
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      className="flex-1 bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary"
                    />
                    <button type="submit" className="bg-primary text-white px-4 py-2 rounded-xl font-bold text-xs">
                      Criar
                    </button>
                    <button type="button" onClick={() => setIsAddingList(false)} className="text-[#6B705C] px-2">
                      <X size={18} />
                    </button>
                  </form>
                </motion.div>
              )}

              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                    {activeList || 'Lista'}
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => shareViaWhatsApp(lists[activeList] || [], activeList, totalsByStore[selectedStore || ''])}
                        className="p-1.5 hover:bg-primary/5 text-primary rounded-lg transition-all"
                        title="Compartilhar via WhatsApp"
                      >
                        <Share2 size={18} />
                      </button>
                    </div>
                  </h2>
                  <p className="text-sm text-[#666]">{(lists[activeList] || []).length} itens adicionados</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-[#666] uppercase tracking-wider opacity-60">Estimativa Total</p>
                  <p className="text-3xl font-black text-primary">R$ {safeToFixed(totalsByStore[selectedStore || ''])}</p>
                </div>
              </div>

              {/* Action Area */}
              <div className="space-y-4 mb-6">
                <div className="flex flex-col lg:flex-row gap-3">
                  <form onSubmit={addItem} className="relative group flex-[3] flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        placeholder="Ex: Leite, Carne, Pão..."
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        className="w-full bg-[#f8f9fa] border border-border-main rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm font-medium"
                      />
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9E9E9E]" size={18} />
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
                      <input 
                        type="number" 
                        step="0.1"
                        placeholder="Qtd"
                        value={newItemQuantity}
                        onChange={(e) => setNewItemQuantity(parseFloat(e.target.value) || 0)}
                        className="w-20 bg-[#f8f9fa] border border-border-main rounded-xl py-3.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm font-medium"
                      />
                      <select 
                        value={newItemUnit}
                        onChange={(e) => setNewItemUnit(e.target.value)}
                        className="bg-[#f8f9fa] border border-border-main rounded-xl py-3.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm font-medium"
                      >
                        <option value="un">un</option>
                        <option value="kg">kg</option>
                        <option value="L">L</option>
                      </select>
                    </div>

                    <button 
                      type="submit"
                      disabled={!newItemName.trim() || isAnalyzing}
                      className="bg-primary text-white p-3.5 rounded-xl hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-20"
                    >
                      <Plus size={22} />
                    </button>
                  </form>

                  <div className="flex gap-2">
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={(e) => handleImageUpload(e, isReceiptMode)}
                    />
                    
                    <button 
                      onClick={() => handleCameraClick('shopping')}
                      disabled={!!isProcessingReceipt}
                      className="bg-primary text-white p-3.5 rounded-xl hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 flex-1 lg:flex-none"
                    >
                      <Camera size={20} />
                      <span className="text-xs font-black uppercase tracking-widest">Escanear</span>
                    </button>
                  </div>
                </div>

                {isProcessingReceipt && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#E9F5EE] border border-primary/20 p-3 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="text-primary animate-spin" size={18} />
                      <p className="text-xs font-black text-primary uppercase tracking-widest">
                        {isProcessingReceipt === 'shopping' ? 'IA Processando Lista...' : 
                         isProcessingReceipt === 'stock' ? 'IA Atualizando Estoque...' : 
                         'IA Atualizando Preços...'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Grocery List Scroll Area */}
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {items.length === 0 ? (
                  <div className="text-center py-24 flex flex-col items-center opacity-40">
                    <div className="w-16 h-16 bg-[#F5F5F5] rounded-3xl flex items-center justify-center mb-4">
                      <ImageIcon size={32} className="text-[#6B705C]" />
                    </div>
                    <p className="text-[#6B705C] font-black uppercase text-[10px] tracking-widest">Lista Vazia</p>
                    <p className="text-xs text-[#6B705C] mt-1">Sua lista aparecerá aqui.</p>
                  </div>
                ) : (
                  DEFAULT_CATEGORIES.map(category => {
                    const categoryItems = items.filter(i => i.category === category);
                    if (categoryItems.length === 0) return null;

                    return (
                      <div key={category} className="mb-8 last:mb-0">
                        <div className="flex items-center gap-2 mb-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#6B705C] whitespace-nowrap">{category}</h3>
                          <div className="h-px bg-border-main flex-1 opacity-50"></div>
                        </div>
                        <div className="space-y-px">
                          {categoryItems.map(item => (
                            <motion.div 
                              key={item.id}
                              layout
                              className={`grid grid-cols-[40px_1fr_80px_100px] items-center py-3.5 border-b border-border-main/40 last:border-0 group transition-all ${item.checked ? 'bg-[#F9F9F9]/50' : ''}`}
                            >
                              <button 
                                onClick={() => toggleCheck(item.id)}
                                className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                                  item.checked 
                                  ? 'bg-primary border-primary text-white rotate-6 scale-110 shadow-sm' 
                                  : 'border-primary/30 hover:border-primary hover:bg-primary/5'
                                }`}
                              >
                                {item.checked && <CheckCircle2 size={12} />}
                              </button>
                              <div>
                                <p className={`font-bold text-sm ${item.checked ? 'text-[#D1D1D1] line-through' : 'text-text-main'}`}>{item.name}</p>
                                <p className="text-[9px] font-black uppercase tracking-tighter text-[#6B705C]/60">Gemini AI Check</p>
                              </div>
                              <div className="text-[10px] text-[#6B705C] font-black uppercase">{item.quantity} {item.unit}</div>
                              <div className="flex items-center justify-end gap-3 px-1">
                                <span className={`text-sm font-black ${item.checked ? 'text-[#D1D1D1]' : 'text-primary'}`}>
                                  {((item?.prices?.[selectedStore] ?? 0) > 0) 
                                    ? `R$ ${safeToFixed((item.prices[selectedStore] || 0) * (item.quantity || 1))}`
                                    : 'Calculando...'}
                                </span>
                                <button 
                                  onClick={() => removeItem(item.id)}
                                  className="text-error opacity-0 group-hover:opacity-100 hover:scale-110 transition-all p-1"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Action Footer */}
              <div className="pt-5 mt-4 border-t-2 border-dashed border-border-main">
                <button 
                  onClick={finishList}
                  disabled={items.length === 0}
                  className="bg-primary hover:bg-primary/90 text-white w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-20 disabled:shadow-none"
                >
                  Finalizar e Arquivar
                </button>
              </div>
            </>
          )}

          {activeTab === 'stock' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="mb-6">
                <h2 className="text-2xl font-black tracking-tight mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package size={24} className="text-secondary" /> Meu Estoque Inteligente
                  </span>
                  <button 
                    onClick={() => handleCameraClick('stock')}
                    disabled={!!isProcessingReceipt}
                    className="text-xs font-black uppercase tracking-widest bg-secondary/10 text-secondary px-4 py-2 rounded-xl border-2 border-secondary/20 hover:bg-secondary hover:text-white transition-all flex items-center gap-2"
                  >
                    <Camera size={14} /> Repor via Cupom
                  </button>
                </h2>
                <form onSubmit={addInventoryItem} className="grid grid-cols-[1fr_80px_80px_50px] gap-2 items-end">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Nome do Item</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Arroz, Detergente..."
                      value={inventoryForm.name}
                      onChange={(e) => setInventoryForm(p => ({...p, name: e.target.value}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Atual</label>
                    <input 
                      type="number" 
                      value={inventoryForm.current}
                      onChange={(e) => setInventoryForm(p => ({...p, current: parseInt(e.target.value) || 0}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Mínimo</label>
                    <input 
                      type="number" 
                      value={inventoryForm.min}
                      onChange={(e) => setInventoryForm(p => ({...p, min: parseInt(e.target.value) || 0}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isAddingInventory}
                    className="bg-secondary text-white p-2.5 rounded-xl hover:opacity-90 transition-all shadow-md disabled:opacity-50"
                  >
                    {isAddingInventory ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
                  </button>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {inventory.length === 0 ? (
                  <div className="text-center py-20 opacity-40">
                    <Package size={48} className="mx-auto mb-4 text-[#6B705C]" />
                    <p className="font-black uppercase text-[10px] tracking-widest text-[#6B705C]">Sem Itens no Estoque</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {inventory.map(item => (
                      <div key={item.id} className="bg-white border border-border-main rounded-2xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                          <p className="font-bold text-sm">{item.name}</p>
                          <p className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${item.current <= item.min ? 'text-error animate-pulse' : 'text-accent'}`}>
                            {item.current <= item.min ? 'Status: Reposição Necessária' : 'Status: OK'}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-black uppercase opacity-40">Qtd</span>
                            <div className="flex items-center gap-2 mt-1">
                              <button 
                                onClick={() => updateInventory(item.id, -1)}
                                className="w-7 h-7 bg-[#F5F5F5] rounded-lg flex items-center justify-center hover:bg-error/10 hover:text-error transition-all"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="font-black text-sm w-4 text-center">{item.current}</span>
                              <button 
                                onClick={() => updateInventory(item.id, 1)}
                                className="w-7 h-7 bg-[#F5F5F5] rounded-lg flex items-center justify-center hover:bg-accent/10 hover:text-accent transition-all"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="h-8 w-px bg-border-main opacity-40"></div>
                          <div className="text-right">
                            <span className="text-[9px] font-black uppercase opacity-40 block">Mínimo</span>
                            <span className="font-bold text-xs">{item.min} {item.unit}</span>
                          </div>
                          <button 
                            onClick={() => deleteInventoryItem(item.id)}
                            className="text-error/30 hover:text-error transition-all p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="flex flex-col h-full">
              <div className="mb-6 flex justify-between items-center">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                  <History size={24} className="text-primary" /> Histórico de Compras
                </h2>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Filtrar por data ou nome..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="bg-[#f8f9fa] border border-border-main rounded-xl py-2 px-8 text-xs focus:ring-1 focus:ring-primary w-48"
                  />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9E9E9E]" size={14} />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="text-center py-20 opacity-40">
                    <History size={48} className="mx-auto mb-4 text-[#6B705C]" />
                    <p className="font-black uppercase text-[10px] tracking-widest text-[#6B705C]">Histórico Vazio</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history
                      .filter(h => h.name.toLowerCase().includes(historySearch.toLowerCase()) || h.date.includes(historySearch))
                      .map(list => (
                        <div key={list.id} className="bg-white border border-border-main rounded-2xl p-5 shadow-sm">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="font-bold text-base">{list.name}</h3>
                              <p className="text-[10px] font-black text-[#6B705C]">{list.date}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-black text-primary">R$ {safeToFixed(list.total || 0)}</p>
                              <p className="text-[9px] font-black uppercase text-accent tracking-widest">{list.store}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-dashed border-border-main">
                            <span className="text-[10px] font-black uppercase text-[#6B705C] opacity-60">
                              {list.items.length} ITENS COMPRADOS
                            </span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => shareViaWhatsApp(list.items, list.name, list.total)}
                                className="p-2 bg-[#25D366] text-white rounded-lg hover:opacity-90 transition-all shadow-sm"
                              >
                                <MessageSquare size={16} />
                              </button>
                               <button 
                                onClick={() => setHistory(prev => prev.filter(h => h.id !== list.id))}
                                className="p-2 border border-error/20 text-error rounded-lg hover:bg-error/5 transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="mb-6">
                <h2 className="text-2xl font-black tracking-tight mb-4 flex items-center gap-2">
                  <Wrench size={24} className="text-primary" /> Manutenção e Tarefas
                </h2>
                <form onSubmit={addHomeTask} className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_50px] gap-2 items-end">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">O que precisa ser feito?</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Trocar lâmpada, Consertar pia..."
                      value={taskForm.title}
                      onChange={(e) => setTaskForm(p => ({...p, title: e.target.value}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Categoria</label>
                    <select 
                      value={taskForm.category}
                      onChange={(e) => setTaskForm(p => ({...p, category: e.target.value}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary"
                    >
                      <option value="Geral">Geral</option>
                      <option value="Escola">Escola</option>
                      <option value="Reparos">Reparos</option>
                      <option value="Limpeza">Limpeza</option>
                      <option value="Compras">Compras</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Prioridade</label>
                    <select 
                      value={taskForm.priority}
                      onChange={(e) => setTaskForm(p => ({...p, priority: e.target.value as any}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary"
                    >
                      <option value="low">Baixa</option>
                      <option value="med">Média</option>
                      <option value="high">Alta</option>
                    </select>
                  </div>
                  <button type="submit" className="bg-primary text-white p-2.5 rounded-xl hover:opacity-90 transition-all shadow-md">
                    <Plus size={20} />
                  </button>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                {homeTasks.length === 0 ? (
                  <div className="text-center py-20 opacity-30">
                    <ClipboardList size={48} className="mx-auto mb-4" />
                    <p className="font-black uppercase text-[10px] tracking-widest">Nenhuma tarefa pendente</p>
                  </div>
                ) : (
                  homeTasks.map(task => (
                    <div key={task.id} className="bg-white border border-border-main rounded-2xl p-4 flex items-center justify-between shadow-sm group">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => toggleTaskStatus(task.id, task.status)}
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                            task.status === 'done' ? 'bg-accent border-accent text-white' : 'border-border-main hover:border-primary'
                          }`}
                        >
                          {task.status === 'done' && <CheckCircle2 size={14} />}
                          {task.status === 'doing' && <Loader2 size={14} className="animate-spin text-primary" />}
                        </button>
                        <div>
                          <p className={`font-bold text-sm ${task.status === 'done' ? 'line-through opacity-40' : ''}`}>{task.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] font-black uppercase tracking-widest ${
                              task.priority === 'high' ? 'text-error' : task.priority === 'med' ? 'text-secondary' : 'text-[#6B705C]'
                            }`}>
                              {task.priority === 'high' ? 'Alta' : task.priority === 'med' ? 'Média' : 'Baixa'}
                            </span>
                            <span className="text-[9px] font-black uppercase text-primary/60 tracking-widest bg-primary/5 px-1.5 py-0.5 rounded">
                              {task.category || 'Geral'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => deleteTask(task.id)} className="text-error/30 hover:text-error transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'gifts' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="mb-6">
                <h2 className="text-2xl font-black tracking-tight mb-4 flex items-center gap-2">
                  <Gift size={24} className="text-[#FF6B6B]" /> Lista de Presentes
                </h2>
                <form onSubmit={addGiftItem} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_50px] gap-2 items-end">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Para quem?</label>
                    <input 
                      type="text" 
                      placeholder="Nome..."
                      value={giftForm.recipient}
                      onChange={(e) => setGiftForm(p => ({...p, recipient: e.target.value}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-[#FF6B6B]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Ocasião</label>
                    <input 
                      type="text" 
                      placeholder="Aniversário, Natal..."
                      value={giftForm.occasion}
                      onChange={(e) => setGiftForm(p => ({...p, occasion: e.target.value}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-[#FF6B6B]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Ideias</label>
                    <input 
                      type="text" 
                      placeholder="Perfume, Livro..."
                      value={giftForm.ideas}
                      onChange={(e) => setGiftForm(p => ({...p, ideas: e.target.value}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-[#FF6B6B]"
                    />
                  </div>
                  <button type="submit" className="bg-[#FF6B6B] text-white p-2.5 rounded-xl hover:opacity-90 transition-all shadow-md">
                    <Plus size={20} />
                  </button>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                {gifts.length === 0 ? (
                  <div className="text-center py-20 opacity-30">
                    <Gift size={48} className="mx-auto mb-4" />
                    <p className="font-black uppercase text-[10px] tracking-widest">Nenhum presente planejado</p>
                  </div>
                ) : (
                  gifts.map(gift => (
                    <div key={gift.id} className="bg-white border border-border-main rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between shadow-sm group gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#FF6B6B]/10 rounded-full flex items-center justify-center text-[#FF6B6B]">
                          <Gift size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{gift.recipient} <span className="text-[#9E9E9E] font-medium text-xs">- {gift.occasion}</span></p>
                          <p className="text-xs text-[#6B705C]">{gift.ideas}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <select 
                          value={gift.status}
                          onChange={(e) => updateGiftStatus(gift.id, e.target.value)}
                          className={`text-[9px] font-black uppercase tracking-widest border-2 rounded-lg px-2 py-1 transition-all ${
                            gift.status === 'given' ? 'bg-accent/10 border-accent text-accent' : 
                            gift.status === 'bought' ? 'bg-secondary/10 border-secondary text-secondary' : 'bg-[#f0f2f0] border-border-main'
                          }`}
                        >
                          <option value="planning">Planejando</option>
                          <option value="bought">Comprado</option>
                          <option value="given">Entregue</option>
                        </select>
                        <button onClick={() => deleteGift(gift.id)} className="text-error/30 hover:text-error transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'finances' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Total Lançado</p>
                  <p className="text-3xl font-black text-primary italic">R$ {safeToFixed(finances.reduce((acc, f) => acc + f.value, 0))}</p>
                </div>
                <div className="bg-[#D8F3DC] border border-[#2D6A4F]/20 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase text-[#2D6A4F] tracking-widest mb-1">Custos Fixos</p>
                  <p className="text-xl font-black text-[#2D6A4F]">R$ {finances.filter(f => f.type === 'fixed').reduce((acc, f) => acc + f.value, 0).toFixed(2)}</p>
                </div>
                <div className="bg-[#FFDDD2] border border-[#E5383B]/20 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase text-[#E5383B] tracking-widest mb-1">Variáveis</p>
                  <p className="text-xl font-black text-[#E5383B]">R$ {finances.filter(f => f.type === 'variable').reduce((acc, f) => acc + f.value, 0).toFixed(2)}</p>
                </div>
              </div>

              <div className="mb-6">
                <form onSubmit={addFinanceItem} className="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_160px] gap-2 items-end">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Descrição do Gasto</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Aluguel, Internet..."
                      value={financeForm.description}
                      onChange={(e) => setFinanceForm(p => ({...p, description: e.target.value}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Valor (R$)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={financeForm.value}
                      onChange={(e) => setFinanceForm(p => ({...p, value: parseFloat(e.target.value) || 0}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#6B705C] mb-1 block">Tipo</label>
                    <select 
                      value={financeForm.type}
                      onChange={(e) => setFinanceForm(p => ({...p, type: e.target.value as any}))}
                      className="w-full bg-[#f8f9fa] border border-border-main rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary"
                    >
                      <option value="fixed">Fixo</option>
                      <option value="variable">Variável</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <label 
                      className={`flex-1 p-2.5 rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        financeForm.attachmentName ? 'bg-secondary/10 border-secondary text-secondary' : 'bg-[#f8f9fa] border-border-main text-[#6B705C] hover:border-primary'
                      }`}
                    >
                      <FileUp size={16} />
                      <span className="text-[9px] font-black uppercase truncate max-w-[80px]">
                        {financeForm.attachmentName || 'Anexar Fatura'}
                      </span>
                      <input type="file" className="hidden" onChange={handleFinanceAttachment} accept="image/*,application/pdf" />
                    </label>
                    <button type="submit" className="bg-primary text-white p-2.5 rounded-xl hover:opacity-90 transition-all shadow-md">
                      <Plus size={20} />
                    </button>
                  </div>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                {finances.length === 0 ? (
                  <div className="text-center py-10 opacity-30">
                    <DollarSign size={48} className="mx-auto mb-4" />
                    <p className="font-black uppercase text-[10px] tracking-widest">Nenhum custo registrado</p>
                  </div>
                ) : (
                  finances.sort((a,b) => b.date.localeCompare(a.date)).map(finance => (
                    <div key={finance.id} className="bg-white border border-border-main rounded-2xl p-4 flex items-center justify-between shadow-sm group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${finance.type === 'fixed' ? 'bg-[#D8F3DC] text-[#2D6A4F]' : 'bg-[#FFDDD2] text-[#E5383B]'}`}>
                          <DollarSign size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm">{finance.description}</p>
                            {finance.attachmentUrl && (
                              <button 
                                onClick={() => {
                                  const win = window.open();
                                  win?.document.write(`
                                    <html>
                                      <body style="margin:0; background:#333; display:flex; align-items:center; justify-content:center;">
                                        ${finance.attachmentUrl.startsWith('data:application/pdf') 
                                          ? `<embed src="${finance.attachmentUrl}" type="application/pdf" width="100%" height="100%">`
                                          : `<img src="${finance.attachmentUrl}" style="max-width:100%; max-height:100%; object-fit:contain;">`
                                        }
                                      </body>
                                    </html>
                                  `);
                                }}
                                className="text-secondary hover:text-secondary/70 transition-all"
                                title="Ver Anexo"
                              >
                                <ExternalLink size={12} />
                              </button>
                            )}
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#9E9E9E]">{finance.date} - {finance.type === 'fixed' ? 'Custo Fixo' : 'Custo Variável'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-lg font-black text-primary">R$ {(finance.value || 0).toFixed(2)}</p>
                        <button onClick={() => deleteFinance(finance.id)} className="text-error/30 hover:text-error transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'monthly_report' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="mb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-2xl font-black text-primary">Relatório Geral Mensal</h1>
                  <p className="text-sm text-[#6B705C]">Visão consolidada de todas as despesas da casa.</p>
                </div>
                <button 
                  onClick={generateMonthlyReport}
                  disabled={isGeneratingReport}
                  className="bg-accent text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-accent/20 flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                >
                  {isGeneratingReport ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Gerar Análise I.A
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white border border-border-main p-5 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-[#D8F3DC] text-[#2D6A4F] rounded-lg"><Home size={18} /></div>
                      <p className="text-[10px] font-black uppercase text-[#6B705C] tracking-widest">Fixos</p>
                    </div>
                    <p className="text-2xl font-black text-[#1A1A1A]">R$ {finances.filter(f => f.type === 'fixed').reduce((acc, f) => acc + f.value, 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-white border border-border-main p-5 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                       <div className="p-2 bg-[#FFDDD2] text-[#E5383B] rounded-lg"><DollarSign size={18} /></div>
                       <p className="text-[10px] font-black uppercase text-[#6B705C] tracking-widest">Variáveis</p>
                    </div>
                    <p className="text-2xl font-black text-[#1A1A1A]">R$ {finances.filter(f => f.type === 'variable').reduce((acc, f) => acc + f.value, 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-white border border-border-main p-5 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                       <div className="p-2 bg-primary/10 text-primary rounded-lg"><ShoppingCart size={18} /></div>
                       <p className="text-[10px] font-black uppercase text-[#6B705C] tracking-widest">Compras</p>
                    </div>
                    <p className="text-2xl font-black text-[#1A1A1A]">R$ {Object.values(lists).reduce((acc, items) => acc + items.reduce((ia, item) => ia + (Object.values(item.prices || {})[0] || 0), 0), 0).toFixed(2)}</p>
                  </div>
                </div>

                {aiReport && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border-2 border-accent/20 rounded-3xl p-6 shadow-xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                      <Sparkles size={80} />
                    </div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="bg-accent text-white p-2 rounded-xl shadow-lg">
                        <Sparkles size={20} />
                      </div>
                      <h3 className="text-xl font-black text-primary tracking-tight">Análise Estratégica I.A</h3>
                    </div>
                    <div className="prose prose-sm max-w-none text-[#333] leading-relaxed markdown-report">
                      <ReactMarkdown>{aiReport}</ReactMarkdown>
                    </div>
                  </motion.div>
                )}

                {!aiReport && !isGeneratingReport && (
                  <div className="text-center py-20 opacity-30">
                    <PieChart size={64} className="mx-auto mb-4" />
                    <p className="font-black uppercase text-xs tracking-[0.2em]">Clique em "Gerar Análise" para insights</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Comparison Pane */}
        <section className="hidden lg:flex bg-[#E9F5EE] border border-[#D1E7DD] rounded-[20px] p-5 flex-col overflow-hidden max-h-full">
          <h2 className="text-[12px] font-black uppercase tracking-widest text-[#6B705C] mb-5">Visão do Mercado</h2>
          
          <div className="space-y-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {stores.map(store => {
              const total = (activeTab === 'lists' ? (totalsByStore[store.name] || 0) : 0);
              const isBest = activeTab === 'lists' && bestStore?.[0] === store.name && items.length > 0;
              const isSelected = activeTab === 'lists' && selectedStore === store.name;
              
              return (
                <div 
                  key={store.name}
                  onClick={() => {
                    if (activeTab !== 'lists') setActiveTab('lists');
                    setSelectedStore(store.name);
                  }}
                  className={`bg-white rounded-2xl p-4 transition-all border-2 cursor-pointer relative shadow-sm hover:-translate-y-0.5 active:scale-[0.98] ${
                    isSelected ? 'border-primary ring-4 ring-primary/5' : 
                    isBest ? 'border-accent' : 'border-transparent hover:border-border-main'
                  } ${activeTab !== 'lists' ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                >
                  {isBest && (
                    <div className="absolute -top-2.5 right-3 bg-accent text-white text-[9px] px-2 py-0.5 rounded-full font-black tracking-tighter shadow-sm border border-white">
                      MELHOR PREÇO
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{store.icon}</span>
                    <span className="text-xs font-black text-text-main uppercase tracking-tight">{store.name}</span>
                  </div>
                  <div className="text-2xl font-black text-[#1A1A1A] tracking-tighter">
                    R$ {total.toFixed(2)}
                  </div>
                  {isBest && (
                    <div className="text-[9px] text-accent font-black mt-1 uppercase tracking-widest">
                      ✓ Economia Máxima
                    </div>
                  )}
                  {!isBest && activeTab === 'lists' && items.length > 0 && totalsByStore[store.name] > (bestStore?.[1] as number) && (
                    <div className="text-[9px] text-error font-black mt-1 uppercase">
                      ✗ +{(((totalsByStore[store.name] / ((bestStore?.[1] as number) || 1)) - 1) * 100).toFixed(0)}% mais caro
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-white/60 border border-white rounded-2xl shadow-sm">
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">Radar Ativo: {locationName || 'Buscando...'}</p>
            {isSearchingStores && <p className="text-[9px] text-accent animate-pulse mb-2">Localizando mercados...</p>}
            
            <button 
              onClick={refreshPricesByLocation}
              disabled={isAnalyzing || isSearchingStores}
              className="w-full mt-2 mb-4 bg-primary text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#006D77] shadow-md active:scale-95 transition-all text-center"
            >
              {isAnalyzing || isSearchingStores ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />} 
              Cotar na Minha Região
            </button>

            <p className="text-[10px] text-[#444] leading-relaxed font-medium">
              O sistema usará seu GPS para analisar ofertas reais na sua cidade usando a I.A. Gemini.
            </p>
          </div>
        </section>
      </main>

      {/* Mobile Bottom Navigation */}
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
      <AnimatePresence>
        {showFeedbackModal && (
          <FeedbackModal 
            onClose={() => setShowFeedbackModal(false)}
            onSave={submitFeedback}
            rating={feedbackRating}
            setRating={setFeedbackRating}
            message={feedbackMessage}
            setMessage={setFeedbackMessage}
            feature={feedbackFeature}
          />
        )}
      </AnimatePresence>
      <nav className="md:hidden bg-card border-t border-border-main px-2 py-2 flex items-center justify-between shrink-0 overflow-x-auto custom-scrollbar">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'dashboard' ? 'text-primary' : 'text-[#6B705C] opacity-60'}`}
        >
          <Home size={18} />
          <span className="text-[8px] font-black uppercase">Início</span>
        </button>
        <button 
          onClick={() => setActiveTab('lists')}
          className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'lists' ? 'text-primary' : 'text-[#6B705C] opacity-60'}`}
        >
          <ShoppingCart size={18} />
          <span className="text-[8px] font-black uppercase">Listas</span>
        </button>
        <button 
          onClick={() => setActiveTab('stock')}
          className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'stock' ? 'text-secondary' : 'text-[#6B705C] opacity-60'}`}
        >
          <Package size={18} />
          <span className="text-[8px] font-black uppercase">Estoque</span>
        </button>
        <button 
          onClick={() => setActiveTab('monthly_report')}
          className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'monthly_report' ? 'text-accent' : 'text-[#6B705C] opacity-60'}`}
        >
          <PieChart size={18} />
          <span className="text-[8px] font-black uppercase">Relatório</span>
        </button>
        <button 
          onClick={() => setActiveTab('tasks')}
          className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'tasks' ? 'text-accent' : 'text-[#6B705C] opacity-60'}`}
        >
          <ClipboardList size={18} />
          <span className="text-[8px] font-black uppercase">Tarefas</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'settings' ? 'text-primary' : 'text-[#6B705C] opacity-60'}`}
        >
          <Settings size={18} />
          <span className="text-[8px] font-black uppercase">Ajustes</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'history' ? 'text-primary' : 'text-[#6B705C] opacity-60'}`}
        >
          <History size={18} />
          <span className="text-[8px] font-black uppercase">Histórico</span>
        </button>
        <button 
          onClick={() => setActiveTab('finances')}
          className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'finances' ? 'text-primary' : 'text-[#6B705C] opacity-60'}`}
        >
          <DollarSign size={18} />
          <span className="text-[8px] font-black uppercase">Grana</span>
        </button>
        {isAdmin && (
          <button 
            onClick={() => setActiveTab('admin')}
            className={`shrink-0 flex flex-col items-center gap-1 p-2 min-w-[60px] rounded-xl transition-all ${activeTab === 'admin' ? 'text-primary' : 'text-[#6B705C] opacity-60'}`}
          >
            <Wrench size={18} />
            <span className="text-[8px] font-black uppercase">Admin</span>
          </button>
        )}
      </nav>
    </div>
  );
}

function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const steps = [
    {
      title: "Boas-vindas ao Lar360 Beta!",
      desc: "Sua nova central de organização residencial. Totalmente segura e focada na sua privacidade.",
      icon: "🎉"
    },
    {
      title: "Sua Residência, Seus Dados",
      desc: "Cada casa é isolada. Você só vê o que é seu ou o que foi explicitamente compartilhado com você.",
      icon: "🏠"
    },
    {
      title: "Compartilhamento Seguro",
      desc: "Convide moradores usando o Código de Convite. Você aprova cada solicitação manualmente para total controle.",
      icon: "🔒"
    },
    {
      title: "Auditabilidade Total",
      desc: "Registramos cada ação importante para sua segurança. Nada acontece sem rastro.",
      icon: "📝"
    }
  ];

  const handleNext = () => {
    if (step < steps.length) setStep(step + 1);
    else {
      localStorage.setItem('lar360_onboarded', 'true');
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center p-6 text-center">
      <motion.div 
        key={step}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="text-6xl mb-6">{steps[step-1].icon}</div>
        <h1 className="text-3xl font-black text-primary mb-4 tracking-tight">{steps[step-1].title}</h1>
        <p className="text-[#6B705C] font-medium leading-relaxed mb-10">{steps[step-1].desc}</p>
        
        <div className="flex flex-col gap-4">
          <button 
            onClick={handleNext}
            className="bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-primary/20"
          >
            {step === steps.length ? "Começar Agora" : "Próximo"}
          </button>
          <div className="flex justify-center gap-2">
            {steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i + 1 === step ? 'bg-primary' : 'bg-primary/10'}`} />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function FeedbackModal({ 
  onClose, 
  onSave, 
  rating, 
  setRating, 
  message, 
  setMessage,
  feature 
}: any) {
  return (
    <div className="fixed inset-0 z-[110] bg-primary/20 backdrop-blur-md flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white max-w-sm w-full p-8 rounded-[40px] shadow-2xl relative border-2 border-primary/5"
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-[#6B705C] hover:text-primary transition-all">
          <RefreshCcw size={20} />
        </button>
        
        <div className="text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mx-auto mb-4">
            <MessageSquare size={32} />
          </div>
          <h2 className="text-xl font-black text-primary mb-2">O que achou desta feature?</h2>
          <p className="text-xs text-[#6B705C] mb-6 font-medium uppercase tracking-widest">Feature: {feature}</p>
          
          <div className="flex justify-center gap-2 mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <button 
                key={n}
                onClick={() => setRating(n)}
                className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center text-[10px] transition-all ${rating >= n ? 'bg-primary text-white' : 'bg-[#f8f9fa] text-[#6B705C] hover:bg-primary/10'}`}
              >
                {n}
              </button>
            ))}
          </div>

          <textarea 
            placeholder="Sugestões ou melhorias..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full bg-[#f8f9fa] border border-border-main rounded-2xl p-4 text-sm mb-6 h-28 focus:ring-2 focus:ring-primary outline-none"
          />

          <button 
            onClick={onSave}
            disabled={rating === 0}
            className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20 disabled:opacity-30"
          >
            Enviar Feedback Beta
          </button>
        </div>
      </motion.div>
    </div>
  );
}
