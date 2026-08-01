import React, { useState, useEffect } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { 
  getAllProjects, 
  createProject, 
  fundMilestone, 
  submitMilestone, 
  approveMilestone, 
  disputeMilestone, 
  resolveDispute, 
  refundMilestone
} from './services/contractService';
import type { Project } from './services/contractService';
import { trackEvent } from './services/analyticsService';
import { submitFeedback } from './services/feedbackService';
import { 
  Wallet, 
  Plus, 
  Check, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  HelpCircle, 
  MessageSquare, 
  Star, 
  Info,
  DollarSign,
  ExternalLink,
  Copy,
  LayoutDashboard,
  Briefcase,
  X,
  ChevronDown,
  Moon,
  Sun
} from 'lucide-react';
import * as Sentry from '@sentry/react';

export default function App() {
  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Contract data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tabs & Forms state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'freelancer' | 'guide'>('dashboard');
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [newFreelancer, setNewFreelancer] = useState('');
  const [newArbiter, setNewArbiter] = useState('');
  const [newMilestones, setNewMilestones] = useState<Array<{ amount: string; description: string; deadline: string }>>([
    { amount: '50', description: 'Design Mockups', deadline: '' }
  ]);
  const [submittingProject, setSubmittingProject] = useState(false);

  // Actions loading state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Notification state
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info'; txHash?: string } | null>(null);

  // Feedback state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Dispute input state
  const [disputeReason, setDisputeReason] = useState<Record<string, string>>({});

  // Connect Wallet handler
  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { address } = await StellarWalletsKit.authModal();
      setWalletAddress(address);
      trackEvent('wallet_connected', { walletType: 'Freighter' });
      showNotification('Wallet connected successfully!', 'success');
    } catch (err: any) {
      console.error('Wallet connection failed:', err);
      Sentry.captureException(err);
      setError(err.message || 'Failed to connect wallet');
      showNotification('Wallet connection failed', 'error');
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect Wallet handler
  const handleDisconnect = async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch (err) {
      console.warn('Disconnect error:', err);
    }
    setWalletAddress(null);
    trackEvent('wallet_disconnected');
    showNotification('Wallet disconnected', 'info');
  };

  // Notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'info', txHash?: string) => {
    setNotification({ message, type, txHash });
    setTimeout(() => {
      setNotification(null);
    }, 7000);
  };

  // Fetch projects from blockchain
  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const data = await getAllProjects();
      setProjects(data);
    } catch (err: any) {
      console.error('Failed to load projects from chain:', err);
      setError(err.message || 'Failed to sync with Stellar network');
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    loadProjects();
    const interval = setInterval(loadProjects, 15000);
    return () => clearInterval(interval);
  }, []);

  const addMilestoneInput = () => {
    setNewMilestones([...newMilestones, { amount: '', description: '', deadline: '' }]);
  };

  const removeMilestoneInput = (index: number) => {
    setNewMilestones(newMilestones.filter((_, i) => i !== index));
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      showNotification('Please connect your wallet first', 'error');
      return;
    }
    if (!newFreelancer) {
      showNotification('Freelancer address is required', 'error');
      return;
    }

    try {
      const formattedMilestones = newMilestones.map((m) => {
        const amountNum = parseFloat(m.amount);
        if (isNaN(amountNum) || amountNum <= 0) throw new Error('Milestone amount must be positive');
        if (!m.description.trim()) throw new Error('Milestone description cannot be empty');
        if (!m.deadline) throw new Error('Milestone deadline is required');
        
        const parsedDate = new Date(m.deadline);
        if (isNaN(parsedDate.getTime())) throw new Error(`Milestone deadline is invalid`);
        const deadlineTimestamp = Math.floor(parsedDate.getTime() / 1000);
        if (deadlineTimestamp <= Math.floor(Date.now() / 1000)) throw new Error('Deadline must be in the future');

        const amountInStroops = Math.round(amountNum * 10000000);
        return { amount: amountInStroops, description: m.description, deadline: deadlineTimestamp };
      });

      setSubmittingProject(true);
      const txHash = await createProject(walletAddress, newFreelancer, newArbiter || walletAddress, formattedMilestones);
      showNotification('Project created successfully on-chain!', 'success', txHash);
      setCreateDrawerOpen(false);
      setNewFreelancer('');
      setNewArbiter('');
      setNewMilestones([{ amount: '50', description: 'Design Mockups', deadline: '' }]);
      loadProjects();
    } catch (err: any) {
      console.error('Failed to create project:', err);
      Sentry.captureException(err);
      showNotification(err.message || 'Transaction rejected or failed', 'error');
    } finally {
      setSubmittingProject(false);
    }
  };

  const handleMilestoneAction = async (projectId: number, milestoneIndex: number, actionName: string, actionFn: () => Promise<string>) => {
    const actionKey = `${projectId}-${milestoneIndex}-${actionName}`;
    setActionLoading(actionKey);
    try {
      const txHash = await actionFn();
      showNotification(`Milestone ${actionName} transaction successful!`, 'success', txHash);
      loadProjects();
    } catch (err: any) {
      console.error(`Action ${actionName} failed:`, err);
      Sentry.captureException(err);
      showNotification(err.message || `Failed to ${actionName} milestone`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackComment.trim()) return;
    setSubmittingFeedback(true);
    try {
      await submitFeedback({ rating: feedbackRating, comment: feedbackComment, walletAddress: walletAddress || undefined });
      showNotification('Thank you for your feedback!', 'success');
      setFeedbackComment('');
      setFeedbackOpen(false);
    } catch (err: any) {
      console.error('Feedback submit failed:', err);
      showNotification(err.message || 'Failed to submit feedback', 'error');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('Address copied to clipboard', 'info');
  };

  return (
    <div 
      className="min-h-screen text-gray-100 flex flex-col md:flex-row bg-darkBg overflow-hidden font-sans relative transition-all duration-500"
      style={!isDarkMode ? { filter: 'invert(1) hue-rotate(180deg)' } : {}}
    >
      {/* Background gradients */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden md:flex w-64 border-r border-darkBorder bg-darkCard/50 backdrop-blur-xl flex-col z-20">
        <div className="p-6 flex items-center space-x-3 border-b border-darkBorder/50">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-lg text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]">
            ML
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Milestora</h1>
            <p className="text-[9px] text-gray-500 font-medium tracking-widest uppercase">Escrow Platform</p>
          </div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className="p-2 rounded-xl bg-gray-800/50 text-gray-400 hover:text-white transition"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="flex-1 px-4 py-6 space-y-2">
          <p className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Main Menu</p>
          
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'dashboard' 
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <LayoutDashboard size={18} />
            <span>Client Dashboard</span>
          </button>
          
          <button
            onClick={() => setActiveTab('freelancer')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'freelancer' 
                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-inner' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <Briefcase size={18} />
            <span>Freelancer Portal</span>
          </button>
          
          <button
            onClick={() => setActiveTab('guide')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'guide' 
                ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20 shadow-inner' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <HelpCircle size={18} />
            <span>How It Works</span>
          </button>
        </div>

        <div className="p-4 border-t border-darkBorder/50">
           <button 
            onClick={() => setFeedbackOpen(true)}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-darkBg border border-darkBorder hover:border-gray-600 text-gray-300 rounded-xl transition duration-200 text-sm font-semibold"
          >
            <MessageSquare size={16} />
            <span>Feedback</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Top Header */}
        <header className="h-16 md:h-20 border-b border-darkBorder/50 px-4 md:px-8 flex items-center justify-between bg-darkBg/30 backdrop-blur-md z-10">
          <div className="flex items-center space-x-2 md:space-x-3">
            <span className="inline-flex items-center px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_10px_rgba(74,222,128,0.1)]">
              <span className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse" />
              Stellar Testnet
            </span>
            <div className="hidden sm:flex items-center text-[11px] text-gray-500 space-x-1 font-medium bg-darkCard/50 px-3 py-1 rounded-full border border-darkBorder/50">
              <RefreshCw size={12} className={`${loadingProjects ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{loadingProjects ? 'Syncing chain state...' : 'Live Sync'}</span>
            </div>
          </div>

          <div>
            {walletAddress ? (
              <div className="flex items-center space-x-2 bg-darkCard/80 border border-darkBorder rounded-xl p-1.5 shadow-lg">
                <span className="text-xs px-3 font-mono text-gray-300 font-semibold tracking-wider">
                  {walletAddress.substring(0, 5)}...{walletAddress.substring(walletAddress.length - 4)}
                </span>
                <button 
                  onClick={() => copyToClipboard(walletAddress)}
                  className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition"
                  title="Copy Address"
                >
                  <Copy size={14} />
                </button>
                <div className="w-px h-4 bg-darkBorder mx-1"></div>
                <button 
                  onClick={handleDisconnect}
                  className="text-xs px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-bold transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="flex items-center space-x-1 md:space-x-2 px-3 py-2 md:px-5 md:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs md:text-sm font-bold rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                <Wallet size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">{connecting ? 'Connecting...' : 'Connect Wallet'}</span>
                <span className="sm:hidden">{connecting ? '...' : 'Connect'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Notifications */}
        {notification && (
          <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-[9999] p-4 rounded-xl shadow-2xl border min-w-[300px] animate-slide-in backdrop-blur-xl ${
            notification.type === 'success' ? 'bg-green-950/80 border-green-500/30 text-green-200' :
            notification.type === 'error' ? 'bg-red-950/80 border-red-500/30 text-red-200' : 'bg-blue-950/80 border-blue-500/30 text-blue-200'
          }`}>
            <div className="flex items-start space-x-3">
              <div className="mt-0.5">
                {notification.type === 'success' && <Check className="text-green-400" size={18} />}
                {notification.type === 'error' && <AlertTriangle className="text-red-400" size={18} />}
                {notification.type === 'info' && <Info className="text-blue-400" size={18} />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{notification.message}</p>
                {notification.txHash && (
                  <a 
                    href={`https://stellar.expert/explorer/testnet/tx/${notification.txHash}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center text-xs text-indigo-400 hover:text-indigo-300 font-bold"
                  >
                    View on StellarExpert
                    <ExternalLink size={12} className="ml-1" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative pb-24 md:pb-8">
          
          {error && (
            <div className="mb-6 p-4 bg-red-950/20 border border-red-500/30 text-red-200 rounded-2xl flex items-start space-x-3">
              <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-bold">RPC Synchronizer Error</p>
                <p className="text-xs text-red-300/80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Header Area per Tab */}
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-xl md:text-3xl font-extrabold text-white tracking-tight">
                  {activeTab === 'dashboard' ? 'Client Dashboard' : 
                   activeTab === 'freelancer' ? 'Freelancer Portal' : 'How It Works'}
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {activeTab === 'dashboard' ? 'Manage your escrow projects and release payments.' : 
                   activeTab === 'freelancer' ? 'View your assigned milestones and submit work.' : 'Learn how Milestora secures trust.'}
                </p>
              </div>
              {activeTab === 'dashboard' && (
                <button
                  onClick={() => setCreateDrawerOpen(true)}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white text-sm font-bold rounded-xl shadow-[0_4px_20px_rgba(99,102,241,0.3)] transition transform hover:-translate-y-0.5"
                >
                  <Plus size={18} />
                  <span>Create Escrow</span>
                </button>
              )}
            </div>

            {/* List View For Projects */}
            {(activeTab === 'dashboard' || activeTab === 'freelancer') && (
              <div className="bg-darkCard/40 border border-darkBorder rounded-3xl overflow-x-auto shadow-2xl backdrop-blur-sm">
                <div className="min-w-[700px]">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-darkBorder/60 bg-gray-900/40 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <div className="col-span-1 pl-4">ID</div>
                  <div className="col-span-3">Counterparty</div>
                  <div className="col-span-3">Balance</div>
                  <div className="col-span-3">Progress</div>
                  <div className="col-span-2 text-right pr-4">Details</div>
                </div>

                {/* Projects List */}
                <div className="divide-y divide-darkBorder/40">
                  {projects.filter(p => !walletAddress || (activeTab === 'dashboard' ? p.client === walletAddress : p.freelancer === walletAddress)).length === 0 ? (
                    <div className="py-20 text-center">
                      <div className="w-16 h-16 bg-darkBg rounded-full flex items-center justify-center mx-auto mb-4 border border-darkBorder shadow-inner">
                        <Briefcase className="text-gray-600" size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-300">No Projects Found</h3>
                      <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
                        {walletAddress 
                          ? activeTab === 'dashboard' ? "You haven't created any escrows yet." : "You have no assigned freelance work." 
                          : "Please connect your wallet to view projects."}
                      </p>
                    </div>
                  ) : (
                    projects.filter(p => !walletAddress || (activeTab === 'dashboard' ? p.client === walletAddress : p.freelancer === walletAddress)).map((project) => (
                      <ProjectListRow 
                        key={project.id} 
                        project={project} 
                        userAddress={walletAddress}
                        role={activeTab === 'dashboard' ? 'client' : 'freelancer'}
                        actionLoading={actionLoading}
                        onAction={handleMilestoneAction}
                        disputeReason={disputeReason}
                        setDisputeReason={setDisputeReason}
                      />
                    ))
                  )}
                </div>
                </div>
              </div>
            )}

            {/* Onboarding Guide */}
            {activeTab === 'guide' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  <div className="p-8 bg-darkCard/40 border border-darkBorder rounded-3xl backdrop-blur-sm">
                    <h3 className="text-xl font-bold text-white mb-4">Welcome to Milestora</h3>
                    <p className="text-sm text-gray-400 leading-relaxed mb-8">
                      Milestora is a decentralized freelance payment milestone escrow trust system. It uses Stellar Soroban smart contracts to enforce payment trust, preventing disputes and securing payments without a middleman.
                    </p>
                    <div className="space-y-4">
                      <div className="flex items-start space-x-4 p-5 bg-darkBg/50 rounded-2xl border border-darkBorder/50">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black flex-shrink-0">1</div>
                        <div>
                          <h4 className="text-base font-bold text-gray-200">Wallet Setup</h4>
                          <p className="text-sm text-gray-500 mt-1">Install Freighter Extension. Switch network to <b>Test Net</b>.</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-4 p-5 bg-darkBg/50 rounded-2xl border border-darkBorder/50">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center font-black flex-shrink-0">2</div>
                        <div>
                          <h4 className="text-base font-bold text-gray-200">Get Testnet XLM</h4>
                          <p className="text-sm text-gray-500 mt-1">Use the Stellar Laboratory Friendbot to fund your test account.</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-4 p-5 bg-darkBg/50 rounded-2xl border border-darkBorder/50">
                        <div className="w-10 h-10 rounded-xl bg-accent-500/20 text-accent-400 flex items-center justify-center font-black flex-shrink-0">3</div>
                        <div>
                          <h4 className="text-base font-bold text-gray-200">Create & Transact</h4>
                          <p className="text-sm text-gray-500 mt-1">Create projects, deposit funds, submit work, and release payments securely!</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="p-6 bg-indigo-900/10 border border-indigo-500/20 rounded-3xl">
                    <h4 className="text-sm font-bold text-indigo-300 mb-4 uppercase tracking-wider">Milestone States</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><span className="text-xs font-bold text-gray-400">Created</span> <span className="w-3 h-3 rounded-full bg-gray-600"></span></div>
                      <div className="flex items-center justify-between"><span className="text-xs font-bold text-blue-400">Funded</span> <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span></div>
                      <div className="flex items-center justify-between"><span className="text-xs font-bold text-yellow-400">Submitted</span> <span className="w-3 h-3 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"></span></div>
                      <div className="flex items-center justify-between"><span className="text-xs font-bold text-green-400">Released</span> <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span></div>
                      <div className="flex items-center justify-between"><span className="text-xs font-bold text-red-400">Disputed</span> <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Slide-out Drawer for Create Project */}
      {createDrawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity" onClick={() => setCreateDrawerOpen(false)}></div>
          <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-darkCard border-l border-darkBorder shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out">
            <div className="px-8 py-6 border-b border-darkBorder flex items-center justify-between bg-darkBg/50">
              <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                <Plus className="text-indigo-400" size={24} />
                <span>New Escrow Project</span>
              </h3>
              <button onClick={() => setCreateDrawerOpen(false)} className="p-2 hover:bg-gray-800 rounded-full text-gray-400 transition">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateProject} className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Freelancer Public Address</label>
                  <input type="text" required value={newFreelancer} onChange={(e) => setNewFreelancer(e.target.value)} placeholder="G..." className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 font-mono shadow-inner" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Arbiter Address (Optional)</label>
                  <input type="text" value={newArbiter} onChange={(e) => setNewArbiter(e.target.value)} placeholder="Defaults to you if empty" className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 font-mono shadow-inner" />
                </div>
              </div>

              <div className="pt-6 border-t border-darkBorder">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Milestones Overview</label>
                  <button type="button" onClick={addMilestoneInput} className="flex items-center space-x-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition bg-indigo-500/10 px-3 py-1.5 rounded-lg">
                    <Plus size={14} />
                    <span>Add Step</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {newMilestones.map((m, index) => (
                    <div key={index} className="p-5 bg-darkBg rounded-2xl border border-darkBorder shadow-sm space-y-4 relative group">
                      {newMilestones.length > 1 && (
                        <button type="button" onClick={() => removeMilestoneInput(index)} className="absolute top-4 right-4 text-gray-600 hover:text-red-400 transition">
                          <X size={16} />
                        </button>
                      )}
                      <div>
                        <input type="text" required value={m.description} onChange={(e) => { const items = [...newMilestones]; items[index].description = e.target.value; setNewMilestones(items); }} placeholder="e.g. Frontend Development" className="w-full bg-transparent border-b border-darkBorder pb-2 text-sm text-white font-bold focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div className="flex space-x-4">
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Amount (XLM)</label>
                          <input type="number" required step="0.0000001" min="0.0000001" value={m.amount} onChange={(e) => { const items = [...newMilestones]; items[index].amount = e.target.value; setNewMilestones(items); }} className="w-full bg-darkCard border border-darkBorder rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Deadline</label>
                          <input type="date" required min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} value={m.deadline} onChange={(e) => { const items = [...newMilestones]; items[index].deadline = e.target.value; setNewMilestones(items); }} className="w-full bg-darkCard border border-darkBorder rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
            
            <div className="p-6 border-t border-darkBorder bg-darkBg/80 flex space-x-4">
              <button type="button" onClick={() => setCreateDrawerOpen(false)} className="flex-1 px-4 py-3 border border-darkBorder hover:bg-gray-800 rounded-xl text-sm font-bold text-gray-300 transition">
                Cancel
              </button>
              <button type="submit" onClick={handleCreateProject} disabled={submittingProject} className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-sm font-bold shadow-[0_0_20px_rgba(99,102,241,0.4)] transition disabled:opacity-50">
                {submittingProject ? 'Deploying...' : 'Confirm & Deploy'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Feedback Modal (kept as centered modal) */}
      {feedbackOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-darkCard border border-darkBorder w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-6 py-5 border-b border-darkBorder flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <MessageSquare className="text-accent-400" size={18} />
                <span>Submit Feedback</span>
              </h3>
              <button onClick={() => setFeedbackOpen(false)} className="text-gray-400 hover:text-white transition">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleFeedbackSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">Your Rating</label>
                <div className="flex items-center space-x-3">
                  {[1, 2, 3, 4, 5].map((stars) => (
                    <button key={stars} type="button" onClick={() => setFeedbackRating(stars)} className="text-yellow-500 transform hover:scale-110 transition">
                      <Star size={32} fill={stars <= feedbackRating ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Comments</label>
                <textarea required rows={4} value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="How can we improve?" className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-accent-500 shadow-inner" />
              </div>
              <button type="submit" disabled={submittingFeedback || !feedbackComment.trim()} className="w-full py-3 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(236,72,153,0.3)] transition disabled:opacity-50">
                {submittingFeedback ? 'Submitting...' : 'Send Feedback'}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-darkCard border-t border-darkBorder z-40 flex items-center justify-around pb-safe shadow-[0_-4px_15px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center w-full py-3 space-y-1 transition ${
            activeTab === 'dashboard' ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Client</span>
        </button>
        <button
          onClick={() => setActiveTab('freelancer')}
          className={`flex flex-col items-center justify-center w-full py-3 space-y-1 transition ${
            activeTab === 'freelancer' ? 'text-violet-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Briefcase size={20} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Work</span>
        </button>
        <button
          onClick={() => setActiveTab('guide')}
          className={`flex flex-col items-center justify-center w-full py-3 space-y-1 transition ${
            activeTab === 'guide' ? 'text-accent-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <HelpCircle size={20} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Guide</span>
        </button>
        <button
          onClick={() => setFeedbackOpen(true)}
          className="flex flex-col items-center justify-center w-full py-3 space-y-1 text-gray-500 hover:text-gray-300 transition"
        >
          <MessageSquare size={20} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Feedback</span>
        </button>
      </nav>

    </div>
  );
}

// Sub-component: Project List Row
function ProjectListRow({ project, userAddress, role, actionLoading, onAction, disputeReason, setDisputeReason }: any) {
  const [expanded, setExpanded] = useState(false);
  const isProjectArbiter = userAddress && project.arbiter === userAddress;

  const getEscrowBalance = () => {
    const sum = project.milestones.filter((m: any) => m.status === 1 || m.status === 2 || m.status === 4).reduce((acc: number, m: any) => acc + m.amount, 0);
    return (sum / 10000000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 7 });
  };

  const progress = project.milestones.filter((m:any) => m.status === 5).length / project.milestones.length * 100;

  return (
    <div className="group">
      {/* Table Row Header */}
      <div 
        onClick={() => setExpanded(!expanded)}
        className="grid grid-cols-12 gap-4 p-5 items-center cursor-pointer hover:bg-darkBg/50 transition-colors"
      >
        <div className="col-span-1 pl-3 font-bold text-white text-sm">
          #{project.id}
        </div>
        <div className="col-span-3 flex flex-col justify-center">
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{role === 'client' ? 'Freelancer' : 'Client'}</span>
          <span className="font-mono text-xs text-gray-300">
            {role === 'client' 
              ? `${project.freelancer.substring(0, 5)}...${project.freelancer.substring(project.freelancer.length - 4)}`
              : `${project.client.substring(0, 5)}...${project.client.substring(project.client.length - 4)}`
            }
          </span>
        </div>
        <div className="col-span-3 flex items-center text-sm font-bold text-indigo-400">
          <DollarSign size={14} className="-mr-0.5" />
          {getEscrowBalance()} XLM
        </div>
        <div className="col-span-3 pr-4">
           <div className="w-full bg-gray-800 rounded-full h-1.5 mb-1.5">
              <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-1.5 rounded-full" style={{ width: `${progress}%` }}></div>
           </div>
           <p className="text-[10px] font-bold text-gray-400 text-right">{Math.round(progress)}% Completed</p>
        </div>
        <div className="col-span-2 text-right pr-4">
          <button className="text-gray-500 hover:text-white transition p-2 bg-darkBg rounded-lg border border-darkBorder group-hover:border-gray-600">
            <ChevronDown size={16} className={`transform transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expandable Details Area */}
      {expanded && (
        <div className="p-6 bg-darkBg/80 border-t border-darkBorder/40 border-b-4 border-b-darkBorder/40">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold text-white uppercase tracking-widest">Milestones Journey</h4>
            {isProjectArbiter && <span className="text-[10px] font-bold text-accent-400 bg-accent-500/10 px-2 py-1 rounded border border-accent-500/20">Arbiter Mode Active</span>}
          </div>
          
          <div className="space-y-4">
            {project.milestones.map((milestone: any, index: number) => {
              const formatAmount = (stroops: number) => (stroops / 10000000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 7 });
              const isExpired = Math.floor(Date.now() / 1000) > milestone.deadline;
              const actionKey = (name: string) => `${project.id}-${index}-${name}`;
              const isCurrentLoading = (name: string) => actionLoading === actionKey(name);

              const getStatusBadge = (status: number) => {
                const map: any = {
                  0: { text: 'Created', color: 'bg-gray-800 text-gray-300' },
                  1: { text: 'Funded', color: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
                  2: { text: 'Submitted', color: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
                  4: { text: 'Disputed', color: 'bg-red-500/20 text-red-400 border border-red-500/30' },
                  5: { text: 'Released', color: 'bg-green-500/20 text-green-400 border border-green-500/30' },
                  6: { text: 'Refunded', color: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' }
                };
                return map[status] || map[0];
              };
              const badge = getStatusBadge(milestone.status);

              return (
                <div key={index} className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-darkCard border border-darkBorder rounded-2xl gap-4 hover:border-gray-700 transition">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center space-x-3">
                      <span className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-black">{index + 1}</span>
                      <h5 className="font-bold text-sm text-gray-200">{milestone.description}</h5>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badge.color}`}>{badge.text}</span>
                    </div>
                    <div className="flex items-center space-x-6 text-xs text-gray-500 pl-9 font-medium">
                      <span className="flex items-center"><DollarSign size={12} className="text-green-500 mr-0.5"/> {formatAmount(milestone.amount)} XLM</span>
                      <span className="flex items-center"><Clock size={12} className="text-gray-400 mr-1"/> {new Date(milestone.deadline * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-9 lg:pl-0">
                    {/* Role specific actions */}
                    {role === 'client' && (
                      <>
                        {milestone.status === 0 && (
                          <button disabled={actionLoading !== null} onClick={() => onAction(project.id, index, 'fund', () => fundMilestone(userAddress, project.id, index))} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition">
                            {isCurrentLoading('fund') ? 'Funding...' : 'Deposit Funds'}
                          </button>
                        )}
                        {(milestone.status === 1 || milestone.status === 2 || milestone.status === 4) && (
                          <button disabled={actionLoading !== null} onClick={() => onAction(project.id, index, 'approve', () => approveMilestone(userAddress, project.id, index))} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl shadow-lg transition">
                            {isCurrentLoading('approve') ? 'Approving...' : 'Release Payment'}
                          </button>
                        )}
                        {milestone.status === 2 && (
                          <div className="flex items-center space-x-2 bg-darkBg p-1 border border-darkBorder rounded-xl">
                            <input type="text" placeholder="Dispute reason" value={disputeReason[`${project.id}-${index}`] || ''} onChange={(e) => setDisputeReason({...disputeReason, [`${project.id}-${index}`]: e.target.value})} className="bg-transparent px-2 py-1 text-xs text-white focus:outline-none w-32" />
                            <button disabled={actionLoading !== null || !disputeReason[`${project.id}-${index}`]?.trim()} onClick={() => onAction(project.id, index, 'dispute', () => disputeMilestone(userAddress, project.id, index, disputeReason[`${project.id}-${index}`]))} className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-lg transition disabled:opacity-50">
                              {isCurrentLoading('dispute') ? 'Wait...' : 'Dispute'}
                            </button>
                          </div>
                        )}
                        {(milestone.status === 1 || milestone.status === 2 || milestone.status === 4) && isExpired && (
                          <button disabled={actionLoading !== null} onClick={() => onAction(project.id, index, 'refund', () => refundMilestone(userAddress, project.id, index))} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-xl transition">
                            {isCurrentLoading('refund') ? 'Wait...' : 'Claim Refund'}
                          </button>
                        )}
                      </>
                    )}

                    {role === 'freelancer' && (
                      <>
                        {(milestone.status === 1 || milestone.status === 4) && (
                          <button disabled={actionLoading !== null} onClick={() => onAction(project.id, index, 'submit', () => submitMilestone(userAddress, project.id, index))} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded-xl shadow-lg transition">
                            {isCurrentLoading('submit') ? 'Submitting...' : 'Submit Work'}
                          </button>
                        )}
                        {(milestone.status === 1 || milestone.status === 2 || milestone.status === 4) && (
                          <button disabled={actionLoading !== null} onClick={() => onAction(project.id, index, 'refund', () => refundMilestone(userAddress, project.id, index))} className="px-4 py-2 border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-xs font-bold rounded-xl transition">
                            {isCurrentLoading('refund') ? 'Wait...' : 'Voluntary Refund'}
                          </button>
                        )}
                      </>
                    )}

                    {isProjectArbiter && milestone.status === 4 && (
                      <div className="flex space-x-2 pl-4 border-l border-darkBorder">
                        <button disabled={actionLoading !== null} onClick={() => onAction(project.id, index, 'resolve_client', () => resolveDispute(userAddress, project.id, index, true))} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg transition">
                          Resolve to Client
                        </button>
                        <button disabled={actionLoading !== null} onClick={() => onAction(project.id, index, 'resolve_freelancer', () => resolveDispute(userAddress, project.id, index, false))} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-[11px] font-bold rounded-lg transition">
                          Resolve to Freelancer
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


