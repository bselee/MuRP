import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import Button from './ui/Button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Save, Send, AlertTriangle, Users } from 'lucide-react';
import { USER_ROLES, USER_DEPARTMENTS } from '../types';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useAuth } from '../lib/auth/AuthContext';


interface SOPSubmissionFormProps {
  submission?: SOPSubmission | null;
  onSave?: () => void;
  onCancel?: () => void;
}

export const SOPSubmissionForm: React.FC<SOPSubmissionFormProps> = ({
  submission,
  onSave,
  onCancel
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: submission?.title || '',
    description: submission?.description || '',
    content: submission?.content || '',
    department_id: submission?.department_id || '',
    role_id: submission?.role_id || '',
    submission_type: submission?.submission_type || 'create' as 'create' | 'update' | 'deprecate',
    priority: submission?.priority || 'medium' as 'low' | 'medium' | 'high' | 'critical',
    affected_departments: submission?.affected_departments || [] as string[]
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = 'Title is required';
    }
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }
    if (!formData.content.trim()) {
      errors.content = 'SOP content is required';
    }
    if (!formData.department_id) {
      errors.department_id = 'Department is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (submitForReview = false) => {
    if (!validateForm() || !user) return;

    try {
      setLoading(true);

      const submissionData = {
        ...formData,
        submitted_by: user.id,
        sop_id: submission?.sop_id || '', // Will be set when creating new SOP
        status: submitForReview ? 'submitted' : 'draft'
      };

      if (submission) {
        // Update existing submission
        await sopWorkflowService.updateSubmission(submission.id, submissionData);
        if (submitForReview) {
          await sopWorkflowService.submitForReview(submission.id);
        }
      } else {
        // Create new submission
        await sopWorkflowService.createSubmission(submissionData);
      }

      console.log(submitForReview
        ? 'SOP submission sent for review'
        : 'SOP submission saved as draft');

      onSave?.();
    } catch (error) {
      console.error('Error saving submission:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentToggle = (deptId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      affected_departments: checked
        ? [...prev.affected_departments, deptId]
        : prev.affected_departments.filter(id => id !== deptId)
    }));
  };

  const getAffectedDepartmentsText = () => {
    if (formData.affected_departments.length === 0) return 'None selected';
    if (formData.affected_departments.length === 1) {
      const dept = USER_DEPARTMENTS.find(d => d.id === formData.affected_departments[0]);
      return dept?.name || 'Unknown department';
    }
    return `${formData.affected_departments.length} departments selected`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          {submission ? 'Edit SOP Submission' : 'Create SOP Submission'}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={loading}>
            <Send className="h-4 w-4 mr-2" />
            Submit for Review
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Submission Type</label>
                <Select
                  value={formData.submission_type}
                  onValueChange={(value: 'create' | 'update' | 'deprecate') =>
                    setFormData(prev => ({ ...prev, submission_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create">Create New SOP</SelectItem>
                    <SelectItem value="update">Update Existing SOP</SelectItem>
                    <SelectItem value="deprecate">Deprecate SOP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: 'low' | 'medium' | 'high' | 'critical') =>
                    setFormData(prev => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter SOP title"
                className={validationErrors.title ? 'border-red-500' : ''}
              />
              {validationErrors.title && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.title}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the purpose and scope of this SOP"
                rows={3}
                className={validationErrors.description ? 'border-red-500' : ''}
              />
              {validationErrors.description && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Department</label>
                <Select
                  value={formData.department_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, department_id: value }))}
                >
                  <SelectTrigger className={validationErrors.department_id ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validationErrors.department_id && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.department_id}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Role (Optional)</label>
                <Select
                  value={formData.role_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, role_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLES.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Affected Departments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Interdepartmental Impact Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Select departments that may be affected by this SOP change. They will be notified and may need to provide approval.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {USER_DEPARTMENTS.map((dept) => (
                <div key={dept.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={dept.id}
                    checked={formData.affected_departments.includes(dept.id)}
                    onCheckedChange={(checked) => handleDepartmentToggle(dept.id, checked as boolean)}
                  />
                  <label htmlFor={dept.id} className="text-sm">
                    {dept.name}
                  </label>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-muted rounded-md">
              <p className="text-sm">
                <strong>Affected Departments:</strong> {getAffectedDepartmentsText()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SOP Content */}
        <Card>
          <CardHeader>
            <CardTitle>SOP Content</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Enter the complete SOP content, including procedures, requirements, and guidelines..."
              rows={20}
              className={validationErrors.content ? 'border-red-500' : ''}
            />
            {validationErrors.content && (
              <p className="text-sm text-red-500 mt-1">{validationErrors.content}</p>
            )}
          </CardContent>
        </Card>

        {/* Submission Warnings */}
        {formData.submission_type !== 'create' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Updating or deprecating an existing SOP will trigger the approval workflow and may affect other departments.
              Please ensure all necessary stakeholders are aware of this change.
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-6 border-t">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={loading}>
            <Send className="h-4 w-4 mr-2" />
            Submit for Review
          </Button>
        </div>
      </div>
    </div>
  );
};