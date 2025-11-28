import React, { useEffect, useState, useRef } from 'react';
import Button from '@/components/ui/Button';
import { supabase } from '../lib/supabase/client';
import { aiTemplateGenerator } from '../services/aiTemplateGenerator';
import { externalDocumentService, DocumentItem } from '../services/externalDocumentService';
import { SOPWorkflowPanel } from './SOPWorkflowPanel';
import { SOPSubmissionForm } from './SOPSubmissionForm';
import JobDescriptionPanel from './JobDescriptionPanel';
import DelegationSettingsPanel from './DelegationSettingsPanel';
import {
  BotIcon,
  SaveIcon,
  MagicSparklesIcon,
  TrashIcon,
  PlusCircleIcon,
  DocumentTextIcon,
  CloudUploadIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  PencilIcon,
  LinkIcon,
  FolderIcon,
  SearchIcon,
  FilterIcon,
  SparklesIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  TagIcon,
  InformationCircleIcon,
  CogIcon,
  ServerStackIcon,
  DocumentTextIcon,
  UsersIcon,
} from './icons';
import { getGoogleDocsService } from '../services/googleDocsService';
import * as XLSX from 'xlsx';

interface SOPSettingsPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type SOPRepositoryItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  estimatedTimeMinutes: number;
  content: string;
  googleDocId?: string;
  googleDocUrl?: string;
  lastSyncedAt?: string;
  isAiGenerated: boolean;
  aiConfidence?: number;
  usageCount: number;
  lastUsedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'published' | 'archived';
  department: string;
  applicableRoles: string[];
  templateId?: string;
  templateData?: any;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    type: 'pdf' | 'image' | 'video' | 'document';
  }>;
};

type SOPTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  department: string;
  applicableRoles: string[];
  templateStructure: any;
  isDefault: boolean;
  isActive: boolean;
};

type ExternalDocumentServer = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  lastSyncedAt?: string;
};

type SOPRecommendation = {
  id: string;
  bomId: string;
  sopId: string;
  confidence: number;
  reasoning: string;
  suggestedBy: 'ai' | 'manual';
  createdAt: string;
  applied: boolean;
};

const SOP_CATEGORIES = [
  'Manufacturing',
  'Quality Control',
  'Safety',
  'Packaging',
  'Maintenance',
  'Setup',
  'Troubleshooting',
  'Training',
  'Compliance',
  'Other'
];

const SOPSettingsPanel: React.FC<SOPSettingsPanelProps> = ({ addToast }) => {
  // Repository state
  const [sops, setSops] = useState<SOPRepositoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  // Template and categorization state
  const [templates, setTemplates] = useState<SOPTemplate[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  // External document servers
  const [externalServers, setExternalServers] = useState<ExternalDocumentServer[]>([]);
  const [externalDocuments, setExternalDocuments] = useState<DocumentItem[]>([]);

  // AI Recommendations
  const [recommendations, setRecommendations] = useState<SOPRecommendation[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isServerConfigModalOpen, setIsServerConfigModalOpen] = useState(false);
  const [editingSop, setEditingSop] = useState<SOPRepositoryItem | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<SOPTemplate | null>(null);

  // Form state
  const [newSop, setNewSop] = useState<Partial<SOPRepositoryItem>>({
    title: '',
    description: '',
    category: 'Manufacturing',
    tags: [],
    difficulty: 'intermediate',
    estimatedTimeMinutes: 30,
    content: '',
    status: 'draft',
    department: 'General',
    applicableRoles: [],
    attachments: []
  });

  const [newTemplate, setNewTemplate] = useState<Partial<SOPTemplate>>({
    name: '',
    description: '',
    category: 'General',
    department: 'All',
    applicableRoles: [],
    templateStructure: {
      sections: [],
      metadata: {}
    },
    isDefault: false,
    isActive: true
  });

  // Google Docs integration
  const [syncingDocs, setSyncingDocs] = useState(false);
  const [googleDocs, setGoogleDocs] = useState<Array<{id: string, name: string, modifiedTime: string}>>([]);

  // Workflow state
  const [activeTab, setActiveTab] = useState<'repository' | 'jobs' | 'delegation' | 'workflow' | 'templates'>('repository');
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);

  useEffect(() => {
    loadSOPRepository();
    loadRecommendations();
    loadTemplates();
    loadDepartmentsAndRoles();
    loadExternalServers();
    loadGoogleDocs();
  }, []);

  const loadSOPRepository = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sop_repository')
        .select('*')
        .order('updatedAt', { ascending: false });

      if (error) throw error;
      setSops(data || []);
    } catch (error) {
      console.error('Failed to load SOP repository:', error);
      addToast?.('Failed to load SOP repository', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('sop_templates')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Failed to load SOP templates:', error);
    }
  };

  const loadDepartmentsAndRoles = async () => {
    try {
      // Get unique departments and roles from existing SOPs
      const { data: sopsData, error: sopsError } = await supabase
        .from('sop_repository')
        .select('department, applicable_roles');

      if (sopsError) throw sopsError;

      const deptSet = new Set<string>();
      const roleSet = new Set<string>();

      sopsData?.forEach(sop => {
        if (sop.department) deptSet.add(sop.department);
        sop.applicable_roles?.forEach(role => roleSet.add(role));
      });

      // Add default values
      deptSet.add('General');
      deptSet.add('Production');
      deptSet.add('Quality');
      deptSet.add('Maintenance');
      deptSet.add('Engineering');

      roleSet.add('Operator');
      roleSet.add('Supervisor');
      roleSet.add('Engineer');
      roleSet.add('Inspector');
      roleSet.add('Manager');

      setDepartments(Array.from(deptSet).sort());
      setRoles(Array.from(roleSet).sort());
    } catch (error) {
      console.error('Failed to load departments and roles:', error);
    }
  };

  const loadExternalServers = async () => {
    try {
      await externalDocumentService.loadServers();
      const servers = await externalDocumentService.getAllServers();
      setExternalServers(servers);
    } catch (error) {
      console.error('Failed to load external servers:', error);
    }
  };

  const loadRecommendations = async () => {
    try {
      const { data, error } = await supabase
        .from('sop_recommendations')
        .select('*')
        .eq('applied', false)
        .order('createdAt', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecommendations(data || []);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    }
  };

  const loadGoogleDocs = async () => {
    try {
      const docsService = getGoogleDocsService();
      const docs = await docsService.listDocuments();
      setGoogleDocs(docs);
    } catch (error) {
      console.error('Failed to load Google Docs:', error);
    }
  };

  const filteredSops = sops.filter(sop => {
    const matchesSearch = sop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         sop.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         sop.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || sop.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || sop.status === selectedStatus;
    const matchesDepartment = selectedDepartment === 'all' || sop.department === selectedDepartment;
    const matchesRole = selectedRole === 'all' ||
                       (sop.applicableRoles && sop.applicableRoles.includes(selectedRole));

    return matchesSearch && matchesCategory && matchesStatus && matchesDepartment && matchesRole;
  });

  const generateAISuggestions = async () => {
    try {
      addToast?.('Generating AI SOP suggestions...', 'info');

      // Get context from current BOM data or user preferences
      const context = {
        processType: 'manufacturing', // Could be made dynamic
        userRole: 'operator', // Could be made dynamic
        department: 'production', // Could be made dynamic
        customInstructions: 'Focus on safety procedures and quality control'
      };

      const result = await aiTemplateGenerator.generateSOPSuggestions(context);

      // Convert suggestions to display format
      const suggestions = result.suggestions.map(sop => `${sop.title}: ${sop.description}`);
      setAiSuggestions(suggestions);

      addToast?.('AI SOP suggestions generated!', 'success');
    } catch (error) {
      console.error('Failed to generate AI suggestions:', error);
      addToast?.('Failed to generate AI suggestions', 'error');
    }
  };

  const createSOP = async () => {
    try {
      if (!newSop.title || !newSop.description || !newSop.content) {
        addToast?.('Please fill in all required fields', 'error');
        return;
      }

      // Validate against template if selected
      if (newSop.templateId) {
        const template = templates.find(t => t.id === newSop.templateId);
        if (template) {
          const { data: validationResult, error: validationError } = await supabase
            .rpc('validate_sop_template', {
              sop_data: newSop.templateData || {},
              template_id: newSop.templateId
            });

          if (validationError) throw validationError;

          if (!validationResult?.is_valid) {
            addToast?.(`Template validation failed: ${validationResult?.validation_errors?.join(', ')}`, 'error');
            return;
          }
        }
      }

      const sopData = {
        ...newSop,
        id: `sop_${Date.now()}`,
        isAiGenerated: false,
        usageCount: 0,
        createdBy: 'admin', // TODO: Get from auth context
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        applicableRoles: newSop.applicableRoles || [],
      };

      const { error } = await supabase
        .from('sop_repository')
        .insert(sopData);

      if (error) throw error;

      addToast?.('SOP created successfully!', 'success');
      setIsCreateModalOpen(false);
      setNewSop({
        title: '',
        description: '',
        category: 'Manufacturing',
        tags: [],
        difficulty: 'intermediate',
        estimatedTimeMinutes: 30,
        content: '',
        status: 'draft',
        department: 'General',
        applicableRoles: [],
        attachments: []
      });
      loadSOPRepository();
    } catch (error) {
      console.error('Failed to create SOP:', error);
      addToast?.('Failed to create SOP', 'error');
    }
  };

  const updateSOP = async () => {
    try {
      if (!editingSop) return;

      const { error } = await supabase
        .from('sop_repository')
        .update({
          ...editingSop,
          updatedAt: new Date().toISOString()
        })
        .eq('id', editingSop.id);

      if (error) throw error;

      addToast?.('SOP updated successfully!', 'success');
      setIsEditModalOpen(false);
      setEditingSop(null);
      loadSOPRepository();
    } catch (error) {
      console.error('Failed to update SOP:', error);
      addToast?.('Failed to update SOP', 'error');
    }
  };

  const deleteSOP = async (sopId: string) => {
    if (!confirm('Are you sure you want to delete this SOP?')) return;

    try {
      const { error } = await supabase
        .from('sop_repository')
        .delete()
        .eq('id', sopId);

      if (error) throw error;

      addToast?.('SOP deleted successfully!', 'success');
      loadSOPRepository();
    } catch (error) {
      console.error('Failed to delete SOP:', error);
      addToast?.('Failed to delete SOP', 'error');
    }
  };

  const importFromGoogleDoc = async (docId: string, docName: string) => {
    try {
      setSyncingDocs(true);
      const docsService = getGoogleDocsService();
      const content = await docsService.getDocumentContent(docId);

      const newSop: Partial<SOPRepositoryItem> = {
        title: docName,
        description: `Imported from Google Docs: ${docName}`,
        category: 'Other',
        tags: ['imported', 'google-docs'],
        difficulty: 'intermediate',
        estimatedTimeMinutes: 30,
        content: content,
        googleDocId: docId,
        googleDocUrl: `https://docs.google.com/document/d/${docId}/edit`,
        lastSyncedAt: new Date().toISOString(),
        status: 'draft',
        attachments: [],
        isAiGenerated: false,
        usageCount: 0,
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('sop_repository')
        .insert(newSop);

      if (error) throw error;

      addToast?.('SOP imported from Google Docs!', 'success');
      loadSOPRepository();
    } catch (error) {
      console.error('Failed to import from Google Docs:', error);
      addToast?.('Failed to import from Google Docs', 'error');
    } finally {
      setSyncingDocs(false);
    }
  };

  const syncWithGoogleDoc = async (sop: SOPRepositoryItem) => {
    if (!sop.googleDocId) return;

    try {
      setSyncingDocs(true);
      const docsService = getGoogleDocsService();

      // Update Google Doc with current content
      await docsService.updateDocument(sop.googleDocId, {
        title: sop.title,
        content: sop.content
      });

      // Update sync timestamp
      const { error } = await supabase
        .from('sop_repository')
        .update({
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .eq('id', sop.id);

      if (error) throw error;

      addToast?.('SOP synced with Google Docs!', 'success');
      loadSOPRepository();
    } catch (error) {
      console.error('Failed to sync with Google Docs:', error);
      addToast?.('Failed to sync with Google Docs', 'error');
    } finally {
      setSyncingDocs(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Handle PDF uploads
    if (file.type === 'application/pdf') {
      // TODO: Implement PDF parsing
      addToast?.('PDF upload not yet implemented', 'info');
    }
  };

  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      addToast?.('Processing Excel file...', 'info');

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        addToast?.('Excel file is empty or invalid format', 'error');
        return;
      }

      // Process each row as a potential SOP
      const importedSops = [];
      let successCount = 0;
      let errorCount = 0;

      for (const row of jsonData as any[]) {
        try {
          // Map Excel columns to SOP fields (case-insensitive)
          const getColumnValue = (columnNames: string[]) => {
            for (const name of columnNames) {
              if (row[name] !== undefined) return row[name];
            }
            return '';
          };

          const sopData = {
            title: getColumnValue(['Title', 'title', 'SOP Title', 'Name']) || 'Untitled SOP',
            description: getColumnValue(['Description', 'description', 'Summary', 'Overview']) || '',
            category: getColumnValue(['Category', 'category', 'Type']) || 'Other',
            content: getColumnValue(['Content', 'content', 'Procedure', 'Steps', 'Instructions']) || '',
            difficulty: getColumnValue(['Difficulty', 'difficulty', 'Level']) || 'intermediate',
            estimatedTimeMinutes: parseInt(getColumnValue(['Time', 'time', 'Duration', 'estimatedTimeMinutes']) || '30'),
            tags: (getColumnValue(['Tags', 'tags', 'Keywords']) || '')
              .split(',')
              .map((tag: string) => tag.trim())
              .filter((tag: string) => tag),
            status: getColumnValue(['Status', 'status']) || 'draft',
            isAiGenerated: false,
            usageCount: 0,
            createdBy: 'admin', // TODO: Get from auth context
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attachments: []
          };

          // Validate required fields
          if (!sopData.title || !sopData.content) {
            console.warn('Skipping row - missing required fields:', row);
            errorCount++;
            continue;
          }

          // Ensure category is valid
          if (!SOP_CATEGORIES.includes(sopData.category)) {
            sopData.category = 'Other';
          }

          // Ensure difficulty is valid
          const validDifficulties = ['beginner', 'intermediate', 'advanced', 'expert'];
          if (!validDifficulties.includes(sopData.difficulty)) {
            sopData.difficulty = 'intermediate';
          }

          importedSops.push(sopData);
          successCount++;
        } catch (rowError) {
          console.error('Error processing row:', row, rowError);
          errorCount++;
        }
      }

      // Insert all valid SOPs
      if (importedSops.length > 0) {
        const { error } = await supabase
          .from('sop_repository')
          .insert(importedSops);

        if (error) throw error;

        addToast?.(`Successfully imported ${successCount} SOPs${errorCount > 0 ? ` (${errorCount} rows skipped)` : ''}!`, 'success');
        loadSOPRepository();
      } else {
        addToast?.('No valid SOPs found in Excel file', 'error');
      }

      // Clear the file input
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to import Excel file:', error);
      addToast?.('Failed to import Excel file', 'error');

      // Clear the file input
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
    }
  };

  const createTemplate = async () => {
    try {
      if (!newTemplate.name || !newTemplate.description) {
        addToast?.('Please fill in template name and description', 'error');
        return;
      }

      const templateData = {
        ...newTemplate,
        id: `template_${Date.now()}`,
        createdBy: 'admin', // TODO: Get from auth context
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('sop_templates')
        .insert(templateData);

      if (error) throw error;

      addToast?.('Template created successfully!', 'success');
      setIsTemplateModalOpen(false);
      setNewTemplate({
        name: '',
        description: '',
        category: 'General',
        department: 'All',
        applicableRoles: [],
        templateStructure: {
          sections: [],
          metadata: {}
        },
        isDefault: false,
        isActive: true
      });
      loadTemplates();
    } catch (error) {
      console.error('Failed to create template:', error);
      addToast?.('Failed to create template', 'error');
    }
  };

  const importFromExternalServer = async (serverId: string, documentId: string, documentTitle: string) => {
    try {
      setSyncingDocs(true);
      const server = await externalDocumentService.getServer(serverId);
      if (!server) throw new Error('Server not found');

      const content = await server.getDocumentContent(documentId);

      const newSop: Partial<SOPRepositoryItem> = {
        title: documentTitle,
        description: `Imported from ${externalServers.find(s => s.id === serverId)?.name}: ${documentTitle}`,
        category: 'Other',
        tags: ['imported', 'external'],
        difficulty: 'intermediate',
        estimatedTimeMinutes: 30,
        content: content,
        status: 'draft',
        department: 'General',
        applicableRoles: [],
        attachments: [],
        isAiGenerated: false,
        usageCount: 0,
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('sop_repository')
        .insert(newSop);

      if (error) throw error;

      addToast?.('SOP imported from external server!', 'success');
      loadSOPRepository();
    } catch (error) {
      console.error('Failed to import from external server:', error);
      addToast?.('Failed to import from external server', 'error');
    } finally {
      setSyncingDocs(false);
    }
  };

  const loadExternalDocuments = async (serverId: string) => {
    try {
      const server = await externalDocumentService.getServer(serverId);
      if (!server) return;

      const documents = await server.listDocuments();
      setExternalDocuments(documents);
    } catch (error) {
      console.error('Failed to load external documents:', error);
      addToast?.('Failed to load external documents', 'error');
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading SOP repository...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">SOP Repository & Manuals</h3>
          <p className="text-sm text-gray-400">
            AI-curated repository of standard operating procedures and reference manuals
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setIsTemplateModalOpen(true)}
            variant="ghost"
            className="flex items-center gap-2"
          >
            <CogIcon className="w-4 h-4 text-blue-300" />
            Templates
          </Button>
          <Button
            onClick={() => setIsServerConfigModalOpen(true)}
            variant="ghost"
            className="flex items-center gap-2"
          >
            <ServerStackIcon className="w-4 h-4 text-green-300" />
            Servers
          </Button>
          <Button
            onClick={generateAISuggestions}
            variant="ghost"
            className="flex items-center gap-2"
          >
            <SparklesIcon className="w-4 h-4 text-purple-300" />
            AI Suggestions
          </Button>
          <Button
            onClick={() => setIsImportModalOpen(true)}
            variant="ghost"
            className="flex items-center gap-2"
          >
            <CloudUploadIcon className="w-4 h-4 text-blue-300" />
            Import
          </Button>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
          >
            <PlusCircleIcon className="w-4 h-4" />
            Create SOP
          </Button>
        </div>
      </div>

      {/* Unified Tab Navigation */}
      <div className="flex border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('repository')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'repository'
              ? 'text-white border-b-2 border-indigo-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <DocumentTextIcon className="w-4 h-4 inline mr-2" />
          Repository
        </button>
        <button
          onClick={() => setActiveTab('jobs')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'jobs'
              ? 'text-white border-b-2 border-indigo-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <DocumentTextIcon className="w-4 h-4 inline mr-2" />
          Job Descriptions
        </button>
        <button
          onClick={() => setActiveTab('delegation')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'delegation'
              ? 'text-white border-b-2 border-indigo-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <UsersIcon className="w-4 h-4 inline mr-2" />
          Task Delegation
        </button>
        <button
          onClick={() => setActiveTab('workflow')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'workflow'
              ? 'text-white border-b-2 border-indigo-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <ClockIcon className="w-4 h-4 inline mr-2" />
          Workflow
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'templates'
              ? 'text-white border-b-2 border-indigo-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <CogIcon className="w-4 h-4 inline mr-2" />
          Templates
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'repository' && (
        <>
          <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <BotIcon className="w-5 h-5 text-blue-400" />
              <h4 className="text-sm font-semibold text-blue-300">AI Recommendations</h4>
            </div>
            <div className="space-y-2">
              {recommendations.slice(0, 3).map(rec => (
                <div key={rec.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm text-gray-200">{rec.reasoning}</p>
                    <p className="text-xs text-gray-400">Confidence: {Math.round(rec.confidence * 100)}%</p>
                  </div>
                  <Button
                    onClick={() => applyRecommendation(rec)}
                    size="sm"
                    variant="ghost"
                    className="text-blue-300 hover:text-blue-200"
                  >
                    Apply
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search SOPs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-indigo-400"
                />
              </div>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-indigo-400"
            >
              <option value="all">All Categories</option>
              {SOP_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-indigo-400"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-indigo-400"
            >
              <option value="all">All Roles</option>
              {roles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-indigo-400"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* SOP Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSops.map(sop => (
              <div key={sop.id} className="rounded-xl border border-gray-700 bg-gray-900/50 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-white line-clamp-2">{sop.title}</h4>
                    <p className="text-xs text-gray-400 mt-1">{sop.category}</p>
                  </div>
                  <div className="flex gap-1">
                    {sop.googleDocId && (
                      <LinkIcon className="w-4 h-4 text-blue-400" title="Linked to Google Docs" />
                    )}
                    {sop.isAiGenerated && (
                      <BotIcon className="w-4 h-4 text-purple-400" title="AI Generated" />
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-300 line-clamp-3">{sop.description}</p>

                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{sop.difficulty}</span>
                  <span>{sop.estimatedTimeMinutes}min</span>
                  <span>{sop.usageCount} uses</span>
                </div>

                <div className="flex items-center gap-2">
                  {sop.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
                      {tag}
                    </span>
                  ))}
                  {sop.tags.length > 2 && (
                    <span className="text-xs text-gray-500">+{sop.tags.length - 2}</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setEditingSop(sop);
                      setIsEditModalOpen(true);
                    }}
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </Button>
                  {sop.googleDocId && (
                    <Button
                      onClick={() => syncWithGoogleDoc(sop)}
                      size="sm"
                      variant="ghost"
                      disabled={syncingDocs}
                    >
                      <CloudUploadIcon className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    onClick={() => deleteSOP(sop.id)}
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'jobs' && (
        <JobDescriptionPanel addToast={addToast} />
      )}

      {activeTab === 'delegation' && (
        <DelegationSettingsPanel addToast={addToast} />
      )}

      {activeTab === 'workflow' && (
        <div className="space-y-6">
          {showSubmissionForm ? (
            <SOPSubmissionForm
              submission={selectedSubmission}
              onSave={() => {
                setShowSubmissionForm(false);
                setSelectedSubmission(null);
              }}
              onCancel={() => {
                setShowSubmissionForm(false);
                setSelectedSubmission(null);
              }}
            />
          ) : (
            <SOPWorkflowPanel
              onSubmissionSelect={(submission) => {
                setSelectedSubmission(submission);
                setShowSubmissionForm(true);
              }}
            />
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Template Management Content */}
          <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-6">
            <h4 className="text-lg font-semibold text-white mb-4">SOP Template Management</h4>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map(template => (
                <div key={template.id} className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h5 className="text-sm font-semibold text-white">{template.name}</h5>
                      <p className="text-xs text-gray-400 mt-1">{template.description}</p>
                    </div>
                    {template.isDefault && (
                      <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded text-xs">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs">
                        {template.category}
                      </span>
                      <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded text-xs">
                        {template.department}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => setEditingTemplate(template)}
                        size="sm"
                        variant="ghost"
                        className="flex-1"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => {/* TODO: Delete template */}}
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <Button
                onClick={() => setIsTemplateModalOpen(true)}
                className="flex items-center gap-2"
              >
                <PlusCircleIcon className="w-4 h-4" />
                Create New Template
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modals remain the same */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Create New SOP</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
                <input
                  type="text"
                  value={newSop.title}
                  onChange={(e) => setNewSop(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                  placeholder="Enter SOP title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description *</label>
                <textarea
                  value={newSop.description}
                  onChange={(e) => setNewSop(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                  placeholder="Brief description of the SOP"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                  <select
                    value={newSop.category}
                    onChange={(e) => setNewSop(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                  >
                    {SOP_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Template</label>
                  <select
                    value={newSop.templateId || ''}
                    onChange={(e) => setNewSop(prev => ({ ...prev, templateId: e.target.value || undefined }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                  >
                    <option value="">No Template</option>
                    {templates
                      .filter(t => t.category === newSop.category || t.category === 'General')
                      .map(template => (
                        <option key={template.id} value={template.id}>
                          {template.name} {template.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Department</label>
                  <select
                    value={newSop.department}
                    onChange={(e) => setNewSop(prev => ({ ...prev, department: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                  >
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Applicable Roles</label>
                  <input
                    type="text"
                    value={newSop.applicableRoles?.join(', ')}
                    onChange={(e) => setNewSop(prev => ({
                      ...prev,
                      applicableRoles: e.target.value.split(',').map(r => r.trim()).filter(r => r)
                    }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                    placeholder="Operator, Supervisor, Engineer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Estimated Time (minutes)</label>
                <input
                  type="number"
                  value={newSop.estimatedTimeMinutes}
                  onChange={(e) => setNewSop(prev => ({ ...prev, estimatedTimeMinutes: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Content *</label>
                <textarea
                  value={newSop.content}
                  onChange={(e) => setNewSop(prev => ({ ...prev, content: e.target.value }))}
                  rows={10}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2 font-mono text-sm"
                  placeholder="Enter the full SOP content..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={newSop.tags?.join(', ')}
                  onChange={(e) => setNewSop(prev => ({
                    ...prev,
                    tags: e.target.value.split(',').map(t => t.trim()).filter(t => t)
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                  placeholder="safety, equipment, quality"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={createSOP} className="flex-1">
                <SaveIcon className="w-4 h-4 mr-2" />
                Create SOP
              </Button>
              <Button
                onClick={() => setIsCreateModalOpen(false)}
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit SOP Modal */}
      {isEditModalOpen && editingSop && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Edit SOP</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
                <input
                  type="text"
                  value={editingSop.title}
                  onChange={(e) => setEditingSop(prev => prev ? { ...prev, title: e.target.value } : null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description *</label>
                <textarea
                  value={editingSop.description}
                  onChange={(e) => setEditingSop(prev => prev ? { ...prev, description: e.target.value } : null)}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                  <select
                    value={editingSop.category}
                    onChange={(e) => setEditingSop(prev => prev ? { ...prev, category: e.target.value } : null)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                  >
                    {SOP_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
                  <select
                    value={editingSop.status}
                    onChange={(e) => setEditingSop(prev => prev ? { ...prev, status: e.target.value as any } : null)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Content *</label>
                <textarea
                  value={editingSop.content}
                  onChange={(e) => setEditingSop(prev => prev ? { ...prev, content: e.target.value } : null)}
                  rows={10}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={updateSOP} className="flex-1">
                <SaveIcon className="w-4 h-4 mr-2" />
                Update SOP
              </Button>
              <Button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingSop(null);
                }}
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Import SOPs & Manuals</h3>

            <div className="space-y-6">
              {/* Google Docs Import */}
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-blue-400" />
                  Google Docs
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {googleDocs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <div>
                        <p className="text-sm text-white">{doc.name}</p>
                        <p className="text-xs text-gray-400">
                          Modified: {new Date(doc.modifiedTime).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        onClick={() => importFromGoogleDoc(doc.id, doc.name)}
                        size="sm"
                        disabled={syncingDocs}
                      >
                        {syncingDocs ? 'Importing...' : 'Import'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* External Document Servers */}
              {externalServers.filter(s => s.isActive).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                    <ServerIcon className="w-4 h-4 text-green-400" />
                    External Servers
                  </h4>
                  <div className="space-y-3">
                    {externalServers.filter(s => s.isActive).map(server => (
                      <div key={server.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-white">{server.name}</span>
                          <Button
                            onClick={() => loadExternalDocuments(server.id)}
                            size="sm"
                            variant="ghost"
                          >
                            Load Documents
                          </Button>
                        </div>
                        {externalDocuments.length > 0 && (
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {externalDocuments.slice(0, 5).map(doc => (
                              <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-800/30 rounded">
                                <span className="text-xs text-gray-300 truncate">{doc.title}</span>
                                <Button
                                  onClick={() => importFromExternalServer(server.id, doc.id, doc.title)}
                                  size="sm"
                                  disabled={syncingDocs}
                                >
                                  Import
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* File Upload */}
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <CloudUploadIcon className="w-4 h-4 text-green-400" />
                  File Upload
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="ghost"
                      className="w-full h-20 border-2 border-dashed border-gray-600 hover:border-gray-500"
                    >
                      <div className="text-center">
                        <DocumentTextIcon className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-400">Upload PDF</p>
                      </div>
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  <div>
                    <Button
                      onClick={() => excelInputRef.current?.click()}
                      variant="ghost"
                      className="w-full h-20 border-2 border-dashed border-gray-600 hover:border-gray-500"
                    >
                      <div className="text-center">
                        <ArrowDownTrayIcon className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-400">Import Excel</p>
                      </div>
                    </Button>
                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleExcelImport}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => setIsImportModalOpen(false)}
                variant="ghost"
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Template Management Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">SOP Template Management</h3>

            <div className="space-y-6">
              {/* Existing Templates */}
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Existing Templates</h4>
                <div className="grid gap-3 max-h-60 overflow-y-auto">
                  {templates.map(template => (
                    <div key={template.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <div className="flex-1">
                        <h5 className="text-sm font-semibold text-white">{template.name}</h5>
                        <p className="text-xs text-gray-400">{template.description}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs">
                            {template.category}
                          </span>
                          <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded text-xs">
                            {template.department}
                          </span>
                          {template.isDefault && (
                            <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded text-xs">
                              Default
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => setEditingTemplate(template)}
                          size="sm"
                          variant="ghost"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Create New Template */}
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Create New Template</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Template Name *</label>
                      <input
                        type="text"
                        value={newTemplate.name}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                        placeholder="e.g., Manufacturing SOP Template"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                      <select
                        value={newTemplate.category}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                      >
                        {SOP_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Description *</label>
                    <textarea
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                      placeholder="Brief description of this template"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Department</label>
                      <select
                        value={newTemplate.department}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, department: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                      >
                        <option value="All">All Departments</option>
                        {departments.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Applicable Roles</label>
                      <input
                        type="text"
                        value={newTemplate.applicableRoles?.join(', ')}
                        onChange={(e) => setNewTemplate(prev => ({
                          ...prev,
                          applicableRoles: e.target.value.split(',').map(r => r.trim()).filter(r => r)
                        }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white px-3 py-2"
                        placeholder="Operator, Supervisor, Engineer"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isDefault"
                      checked={newTemplate.isDefault}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, isDefault: e.target.checked }))}
                      className="rounded border-gray-700"
                    />
                    <label htmlFor="isDefault" className="text-sm text-gray-300">
                      Set as default template for this category/department
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={createTemplate} className="flex-1">
                <SaveIcon className="w-4 h-4 mr-2" />
                Create Template
              </Button>
              <Button
                onClick={() => setIsTemplateModalOpen(false)}
                variant="ghost"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* External Server Configuration Modal */}
      {isServerConfigModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">External Document Server Configuration</h3>

            <div className="space-y-6">
              {/* Existing Servers */}
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Configured Servers</h4>
                <div className="grid gap-3 max-h-60 overflow-y-auto">
                  {externalServers.map(server => (
                    <div key={server.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <div className="flex-1">
                        <h5 className="text-sm font-semibold text-white">{server.name}</h5>
                        <p className="text-xs text-gray-400 capitalize">{server.type.replace('_', ' ')}</p>
                        <p className="text-xs text-gray-500">
                          Last synced: {server.lastSyncedAt ? new Date(server.lastSyncedAt).toLocaleDateString() : 'Never'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => loadExternalDocuments(server.id)}
                          size="sm"
                          variant="ghost"
                          disabled={!server.isActive}
                        >
                          <FolderIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => externalDocumentService.testServerConnection(server.id)}
                          size="sm"
                          variant="ghost"
                        >
                          <CheckCircleIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* External Documents */}
              {externalDocuments.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-3">Available Documents</h4>
                  <div className="grid gap-2 max-h-60 overflow-y-auto">
                    {externalDocuments.slice(0, 10).map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                        <div className="flex-1">
                          <p className="text-sm text-white">{doc.title}</p>
                          <p className="text-xs text-gray-400">
                            Modified: {new Date(doc.lastModified).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          onClick={() => importFromExternalServer(
                            externalServers.find(s => s.isActive)?.id || '',
                            doc.id,
                            doc.title
                          )}
                          size="sm"
                          disabled={syncingDocs}
                        >
                          {syncingDocs ? 'Importing...' : 'Import'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Server Types Info */}
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Supported Server Types</h4>
                <div className="grid gap-3">
                  <div className="p-3 bg-gray-800/30 rounded-lg">
                    <h5 className="text-sm font-semibold text-white">Notion</h5>
                    <p className="text-xs text-gray-400">Connect to Notion workspaces and databases</p>
                    <p className="text-xs text-gray-500 mt-1">Requires: API Token, Database ID</p>
                  </div>
                  <div className="p-3 bg-gray-800/30 rounded-lg">
                    <h5 className="text-sm font-semibold text-white">Confluence</h5>
                    <p className="text-xs text-gray-400">Connect to Atlassian Confluence spaces</p>
                    <p className="text-xs text-gray-500 mt-1">Requires: Base URL, Username, API Token, Space Key</p>
                  </div>
                  <div className="p-3 bg-gray-800/30 rounded-lg">
                    <h5 className="text-sm font-semibold text-white">MCP Server</h5>
                    <p className="text-xs text-gray-400">Connect to Model Context Protocol servers</p>
                    <p className="text-xs text-gray-500 mt-1">Requires: Base URL, API Token</p>
                  </div>
                  <div className="p-3 bg-gray-800/30 rounded-lg">
                    <h5 className="text-sm font-semibold text-white">Google Docs</h5>
                    <p className="text-xs text-gray-400">Already configured - access your Google Drive documents</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => setIsServerConfigModalOpen(false)}
                variant="ghost"
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SOPSettingsPanel;