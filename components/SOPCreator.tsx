import React, { useState, useEffect } from 'react';
import Button from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select } from './ui/select';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Progress } from './ui/progress';
import {
  FileTextIcon,
  Wand2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
  UserIcon,
  DownloadIcon,
  EditIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
  SaveIcon,
  SendIcon,
  ClockIcon,
  ShieldIcon,
  SettingsIcon
} from './ui/icons';

import type {
  StandardOperatingProcedure,
  SOPSection,
  SOPTemplate,
  BillOfMaterials,
  User
} from '../types';
import {
  generateSOPFromBOM,
  getSOPTemplates,
  saveSOP,
  generateSOPPdf,
  addManagerInput,
  approveSOP,
  validateSOP,
  getSOPsForBOM
} from '../services/sopService';
import { sendChatMessage } from '../services/aiGatewayService';

interface SOPCreatorProps {
  bom: BillOfMaterials;
  currentUser: User;
  onSOPCreated?: (sop: StandardOperatingProcedure) => void;
  onClose?: () => void;
}

export default function SOPCreator({ bom, currentUser, onSOPCreated, onClose }: SOPCreatorProps) {
  const [step, setStep] = useState<'template' | 'generate' | 'review' | 'manager' | 'finalize'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<SOPTemplate | null>(null);
  const [sop, setSop] = useState<Partial<StandardOperatingProcedure> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [managerInput, setManagerInput] = useState('');
  const [managerInputType, setManagerInputType] = useState<'comment' | 'revision' | 'addition'>('comment');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [existingSOPs, setExistingSOPs] = useState<StandardOperatingProcedure[]>([]);

  const templates = getSOPTemplates();

  useEffect(() => {
    // Load existing SOPs for this BOM
    getSOPsForBOM(bom.id).then(setExistingSOPs).catch(console.error);
  }, [bom.id]);

  const handleTemplateSelect = (template: SOPTemplate) => {
    setSelectedTemplate(template);
    setStep('generate');
  };

  const handleGenerateSOP = async () => {
    if (!selectedTemplate) return;

    setIsGenerating(true);
    setGenerationProgress(0);
    setErrors([]);

    try {
      // Generate SOP using AI
      const generatedSOP = await generateSOPFromBOM(bom, selectedTemplate.id, currentUser.id);

      // Update progress
      setGenerationProgress(50);

      // Generate PDF
      const pdfDataUrl = await generateSOPPdf(generatedSOP);
      generatedSOP.pdfUrl = pdfDataUrl;
      generatedSOP.pdfGeneratedAt = new Date().toISOString();

      setGenerationProgress(100);
      setSop(generatedSOP);
      setStep('review');

    } catch (error) {
      console.error('Failed to generate SOP:', error);
      setErrors(['Failed to generate SOP. Please try again.']);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditSection = async (sectionId: string, newContent: string) => {
    if (!sop) return;

    const updatedSections = sop.sections?.map(section =>
      section.id === sectionId
        ? { ...section, content: newContent, lastEditedBy: currentUser.id, lastEditedAt: new Date().toISOString() }
        : section
    );

    setSop({ ...sop, sections: updatedSections });
  };

  const handleAddManagerInput = async () => {
    if (!sop || !managerInput.trim() || !selectedSection) return;

    try {
      await addManagerInput(
        sop.id!,
        currentUser.id,
        currentUser.name,
        selectedSection,
        managerInputType,
        managerInput
      );

      // Update local state
      const newInput = {
        id: `input_${Date.now()}`,
        sopId: sop.id!,
        managerId: currentUser.id,
        managerName: currentUser.name,
        sectionId: selectedSection,
        inputType: managerInputType,
        content: managerInput,
        timestamp: new Date().toISOString(),
        resolved: false,
      };

      setSop({
        ...sop,
        managerInputs: [...(sop.managerInputs || []), newInput]
      });

      setManagerInput('');
      setSelectedSection('');

    } catch (error) {
      console.error('Failed to add manager input:', error);
      setErrors(['Failed to add manager input. Please try again.']);
    }
  };

  const handleSaveSOP = async () => {
    if (!sop) return;

    const validationErrors = validateSOP(sop);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      const savedSOP = await saveSOP(sop as StandardOperatingProcedure);
      setSop(savedSOP);

      if (onSOPCreated) {
        onSOPCreated(savedSOP);
      }

      setStep('finalize');

    } catch (error) {
      console.error('Failed to save SOP:', error);
      setErrors(['Failed to save SOP. Please try again.']);
    }
  };

  const handleApproveSOP = async () => {
    if (!sop?.id) return;

    try {
      await approveSOP(sop.id, currentUser.id);
      setSop({ ...sop, status: 'approved', approvedBy: currentUser.id, approvedAt: new Date().toISOString() });
      setStep('finalize');
    } catch (error) {
      console.error('Failed to approve SOP:', error);
      setErrors(['Failed to approve SOP. Please try again.']);
    }
  };

  const handleDownloadPDF = () => {
    if (!sop?.pdfUrl) return;

    const link = document.createElement('a');
    link.href = sop.pdfUrl;
    link.download = `${sop.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_v${sop.version}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (existingSOPs.length > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">SOP Management for {bom.name}</h2>
          <Button onClick={onClose} variant="outline">Close</Button>
        </div>

        <Alert>
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertDescription>
            This BOM already has {existingSOPs.length} SOP(s). You can create a new version or manage existing ones.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4">
          {existingSOPs.map(existingSop => (
            <Card key={existingSop.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileTextIcon className="h-5 w-5" />
                    {existingSop.title}
                  </CardTitle>
                  <Badge variant={existingSop.status === 'approved' ? 'default' : 'secondary'}>
                    {existingSop.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Version {existingSop.version} • {existingSop.estimatedTimeMinutes} min • {existingSop.difficulty}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleDownloadPDF}>
                      <DownloadIcon className="h-4 w-4 mr-1" />
                      PDF
                    </Button>
                    <Button size="sm" variant="outline">
                      <EditIcon className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-center">
          <Button onClick={() => setStep('template')} className="flex items-center gap-2">
            <PlusIcon className="h-4 w-4" />
            Create New SOP Version
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Create SOP for {bom.name}</h1>
          <p className="text-gray-600">AI-assisted Standard Operating Procedure generation</p>
        </div>
        <Button onClick={onClose} variant="outline">Close</Button>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center space-x-4">
        {[
          { key: 'template', label: 'Template', icon: SettingsIcon },
          { key: 'generate', label: 'Generate', icon: Wand2Icon },
          { key: 'review', label: 'Review', icon: EyeIcon },
          { key: 'manager', label: 'Manager Input', icon: UserIcon },
          { key: 'finalize', label: 'Finalize', icon: CheckCircleIcon },
        ].map(({ key, label, icon: Icon }, index) => (
          <React.Fragment key={key}>
            <div className={`flex items-center space-x-2 ${
              step === key ? 'text-blue-600' : step > key ? 'text-green-600' : 'text-gray-400'
            }`}>
              <Icon className="h-5 w-5" />
              <span className="font-medium">{label}</span>
            </div>
            {index < 4 && <div className={`flex-1 h-px ${
              step > key ? 'bg-green-600' : 'bg-gray-200'
            }`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Error Display */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Template Selection */}
      {step === 'template' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Choose SOP Template</h2>
            <p className="text-gray-600 mb-6">
              Select a template that best matches your manufacturing process. Each template includes
              AI-generated content tailored to your BOM specifications.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map(template => (
              <Card
                key={template.id}
                className={`cursor-pointer transition-all ${
                  selectedTemplate?.id === template.id ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                }`}
                onClick={() => handleTemplateSelect(template)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileTextIcon className="h-5 w-5" />
                    {template.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-4 w-4" />
                      {template.estimatedTimeMinutes} min
                    </span>
                    <Badge variant="outline">{template.difficulty}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Sections: {template.requiredSections.join(', ')}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* AI Generation */}
      {step === 'generate' && selectedTemplate && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Generate SOP Content</h2>
            <p className="text-gray-600">
              AI will analyze your BOM and generate comprehensive operating procedures
              using the {selectedTemplate.name} template.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Generation Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Product:</strong> {bom.name} ({bom.finishedSku})
                </div>
                <div>
                  <strong>Template:</strong> {selectedTemplate.name}
                </div>
                <div>
                  <strong>Sections:</strong> {selectedTemplate.requiredSections.length}
                </div>
                <div>
                  <strong>Estimated Time:</strong> {selectedTemplate.estimatedTimeMinutes} min
                </div>
              </div>

              {isGenerating && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Generating SOP content...</span>
                    <span>{generationProgress}%</span>
                  </div>
                  <Progress value={generationProgress} />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button onClick={() => setStep('template')} variant="outline">
              Back
            </Button>
            <Button
              onClick={handleGenerateSOP}
              disabled={isGenerating}
              className="flex items-center gap-2"
            >
              <Wand2Icon className="h-4 w-4" />
              {isGenerating ? 'Generating...' : 'Generate SOP'}
            </Button>
          </div>
        </div>
      )}

      {/* Review and Edit */}
      {step === 'review' && sop && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Review and Edit SOP</h2>
            <p className="text-gray-600">
              Review the AI-generated content and make any necessary edits before proceeding.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{sop.title}</CardTitle>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>Version {sop.version}</span>
                <span>•</span>
                <span>{sop.estimatedTimeMinutes} minutes</span>
                <span>•</span>
                <span>{sop.difficulty}</span>
                <span>•</span>
                <span>Safety: {sop.safetyLevel}</span>
              </div>
            </CardHeader>
          </Card>

          <Tabs defaultValue="content" className="w-full">
            <TabsList>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
              <TabsTrigger value="ai-info">AI Generation</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-4">
              {sop.sections?.map((section, index) => (
                <Card key={section.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{index + 1}. {section.title}</span>
                      {section.isAiGenerated && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Wand2Icon className="h-3 w-3" />
                          AI Generated
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={section.content}
                      onChange={(e) => handleEditSection(section.id, e.target.value)}
                      rows={8}
                      className="w-full"
                    />
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="metadata" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>SOP Metadata</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Title</label>
                      <Input
                        value={sop.title}
                        onChange={(e) => setSop({ ...sop, title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Difficulty</label>
                      <Select
                        value={sop.difficulty}
                        onValueChange={(value) => setSop({ ...sop, difficulty: value as any })}
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="expert">Expert</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Estimated Time (minutes)</label>
                      <Input
                        type="number"
                        value={sop.estimatedTimeMinutes}
                        onChange={(e) => setSop({ ...sop, estimatedTimeMinutes: parseInt(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Safety Level</label>
                      <Select
                        value={sop.safetyLevel}
                        onValueChange={(value) => setSop({ ...sop, safetyLevel: value as any })}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Required Skills</label>
                    <Input
                      value={sop.requiredSkills?.join(', ')}
                      onChange={(e) => setSop({
                        ...sop,
                        requiredSkills: e.target.value.split(',').map(s => s.trim())
                      })}
                      placeholder="Separate skills with commas"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <Textarea
                      value={sop.description}
                      onChange={(e) => setSop({ ...sop, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai-info" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>AI Generation Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <strong>AI Generated:</strong> {sop.isAiGenerated ? 'Yes' : 'No'}
                    </div>
                    <div>
                      <strong>Model Used:</strong> {sop.aiModelUsed || 'Unknown'}
                    </div>
                    <div>
                      <strong>Confidence:</strong> {sop.aiConfidence ? `${Math.round(sop.aiConfidence * 100)}%` : 'N/A'}
                    </div>
                    <div>
                      <strong>Sections Generated:</strong> {sop.sections?.length || 0}
                    </div>
                  </div>
                  {sop.generationPrompt && (
                    <div>
                      <strong>Generation Prompt:</strong>
                      <p className="text-sm text-gray-600 mt-1 p-3 bg-gray-50 rounded">
                        {sop.generationPrompt}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-between">
            <Button onClick={() => setStep('generate')} variant="outline">
              Back
            </Button>
            <div className="flex gap-2">
              <Button onClick={handleDownloadPDF} variant="outline" className="flex items-center gap-2">
                <DownloadIcon className="h-4 w-4" />
                Preview PDF
              </Button>
              <Button onClick={() => setStep('manager')} className="flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                Add Manager Input
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manager Input */}
      {step === 'manager' && sop && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Managerial Review & Input</h2>
            <p className="text-gray-600">
              Add managerial oversight, approvals, or revisions before finalizing the SOP.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Add Manager Input</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Section</label>
                  <Select
                    value={selectedSection}
                    onValueChange={setSelectedSection}
                  >
                    <option value="">Select a section...</option>
                    {sop.sections?.map(section => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Input Type</label>
                  <Select
                    value={managerInputType}
                    onValueChange={(value) => setManagerInputType(value as any)}
                  >
                    <option value="comment">Comment</option>
                    <option value="revision">Revision Request</option>
                    <option value="addition">Addition Request</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Your Input</label>
                  <Textarea
                    value={managerInput}
                    onChange={(e) => setManagerInput(e.target.value)}
                    rows={4}
                    placeholder="Enter your feedback, revisions, or approvals..."
                  />
                </div>

                <Button
                  onClick={handleAddManagerInput}
                  disabled={!managerInput.trim() || !selectedSection}
                  className="w-full"
                >
                  Add Input
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Manager Inputs ({sop.managerInputs?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  {sop.managerInputs?.length ? (
                    <div className="space-y-3">
                      {sop.managerInputs.map(input => (
                        <div key={input.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{input.managerName}</span>
                            <Badge variant="outline">{input.inputType}</Badge>
                          </div>
                          <p className="text-sm text-gray-700">{input.content}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(input.timestamp).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">No manager inputs yet</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-between">
            <Button onClick={() => setStep('review')} variant="outline">
              Back
            </Button>
            <div className="flex gap-2">
              <Button onClick={handleSaveSOP} variant="outline" className="flex items-center gap-2">
                <SaveIcon className="h-4 w-4" />
                Save Draft
              </Button>
              {currentUser.role === 'Manager' || currentUser.role === 'Admin' ? (
                <Button onClick={handleApproveSOP} className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4" />
                  Approve & Finalize
                </Button>
              ) : (
                <Button onClick={handleSaveSOP} className="flex items-center gap-2">
                  <SendIcon className="h-4 w-4" />
                  Submit for Approval
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finalize */}
      {step === 'finalize' && sop && (
        <div className="space-y-6">
          <div className="text-center">
            <CheckCircleIcon className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">SOP Created Successfully!</h2>
            <p className="text-gray-600">
              Your Standard Operating Procedure has been {sop.status === 'approved' ? 'approved' : 'saved'}
              and is ready for use in build orders.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>SOP Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Title:</strong> {sop.title}</div>
                <div><strong>Version:</strong> {sop.version}</div>
                <div><strong>Status:</strong> <Badge variant={sop.status === 'approved' ? 'default' : 'secondary'}>{sop.status}</Badge></div>
                <div><strong>Difficulty:</strong> {sop.difficulty}</div>
                <div><strong>Estimated Time:</strong> {sop.estimatedTimeMinutes} minutes</div>
                <div><strong>Safety Level:</strong> {sop.safetyLevel}</div>
              </div>

              <Separator />

              <div className="flex justify-center gap-4">
                <Button onClick={handleDownloadPDF} className="flex items-center gap-2">
                  <DownloadIcon className="h-4 w-4" />
                  Download PDF
                </Button>
                <Button onClick={onClose} variant="outline">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}