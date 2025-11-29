import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import Button from './ui/Button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AlertCircle, CheckCircle, Clock, User, FileText, MessageSquare } from 'lucide-react';
import { USER_ROLES, USER_DEPARTMENTS } from '../types';
import { useAuth } from '../lib/auth/AuthContext';


interface SOPWorkflowPanelProps {
  onSubmissionSelect?: (submission: SOPSubmission) => void;
}

export const SOPWorkflowPanel: React.FC<SOPWorkflowPanelProps> = ({ onSubmissionSelect }) => {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<SOPSubmission[]>([]);
  const [notifications, setNotifications] = useState<DepartmentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<SOPSubmission | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [approvalComments, setApprovalComments] = useState('');
  const [reviewComments, setReviewComments] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'completed' | 'requires_changes'>('completed');

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [submissionsData, notificationsData] = await Promise.all([
        sopWorkflowService.getSubmissions(),
        sopWorkflowService.getNotificationsForUser(user.id)
      ]);

      setSubmissions(submissionsData);
      setNotifications(notificationsData);
    } catch (error) {
      console.error('Error loading workflow data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approvalId: string, status: 'approved' | 'rejected') => {
    try {
      await sopWorkflowService.updateApproval(approvalId, {
        status,
        comments: approvalComments
      });

      setShowApprovalDialog(false);
      setApprovalComments('');
      loadData();
    } catch (error) {
      console.error('Error updating approval:', error);
    }
  };

  const handleReview = async (reviewId: string) => {
    try {
      await sopWorkflowService.updateReview(reviewId, {
        status: reviewStatus,
        comments: reviewComments
      });

      setShowReviewDialog(false);
      setReviewComments('');
      loadData();
    } catch (error) {
      console.error('Error updating review:', error);
    }
  };

  const handleNotificationResponse = async (notificationId: string, response: DepartmentNotification['response_status'], comments?: string) => {
    try {
      await sopWorkflowService.respondToNotification(notificationId, {
        response_status: response,
        response_comments: comments
      });

      loadData();
    } catch (error) {
      console.error('Error responding to notification:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      draft: 'secondary',
      submitted: 'default',
      under_review: 'outline',
      approved: 'default',
      rejected: 'destructive',
      implemented: 'default'
    };

    return <Badge variant={variants[status] || 'secondary'}>{status.replace('_', ' ')}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      low: 'secondary',
      medium: 'default',
      high: 'outline',
      critical: 'destructive'
    };

    return <Badge variant={variants[priority] || 'secondary'}>{priority}</Badge>;
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading workflow data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">SOP Workflow Management</h2>
        <Button onClick={() => onSubmissionSelect?.(null as any)}>
          Create New Submission
        </Button>
      </div>

      <Tabs defaultValue="submissions" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="approvals">My Approvals</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="submissions" className="space-y-4">
          <div className="grid gap-4">
            {submissions.map((submission) => (
              <Card key={submission.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{submission.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Submitted by {submission.submitted_by_user?.email} on {new Date(submission.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {getStatusBadge(submission.status)}
                      {getPriorityBadge(submission.priority)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        {submission.submission_type}
                      </span>
                      {submission.department?.name && (
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {submission.department.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(submission.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSubmission(submission);
                        onSubmissionSelect?.(submission);
                      }}
                    >
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          <div className="grid gap-4">
            {submissions
              .filter(sub => sub.approvals?.some(approval => approval.approver_id === user?.id && approval.status === 'pending'))
              .map((submission) => (
                <Card key={submission.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{submission.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Requires your approval
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div className="text-sm">
                        <p>Priority: {getPriorityBadge(submission.priority)}</p>
                        <p>Department: {submission.department?.name}</p>
                      </div>
                      <div className="flex gap-2">
                        <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              Review Approval
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Review SOP Submission</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <h4 className="font-medium">{submission.title}</h4>
                                <p className="text-sm text-muted-foreground">{submission.description}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium">Comments</label>
                                <Textarea
                                  value={approvalComments}
                                  onChange={(e) => setApprovalComments(e.target.value)}
                                  placeholder="Add approval comments..."
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleApproval(
                                    submission.approvals?.find(a => a.approver_id === user?.id)?.id || '',
                                    'approved'
                                  )}
                                  className="flex-1"
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleApproval(
                                    submission.approvals?.find(a => a.approver_id === user?.id)?.id || '',
                                    'rejected'
                                  )}
                                  className="flex-1"
                                >
                                  <AlertCircle className="h-4 w-4 mr-2" />
                                  Reject
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <div className="grid gap-4">
            {notifications.map((notification) => (
              <Card key={notification.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    {notification.notification_type.replace('_', ' ')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    From {notification.notifying_department_info?.name}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="mb-4">{notification.message}</p>
                  {notification.requires_response && notification.response_status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleNotificationResponse(notification.id, 'acknowledged')}
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleNotificationResponse(notification.id, 'concerns_raised', 'I have concerns about this change')}
                      >
                        Raise Concerns
                      </Button>
                    </div>
                  )}
                  {notification.response_status !== 'pending' && (
                    <Badge variant="secondary">
                      {notification.response_status.replace('_', ' ')}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};