'use client';

import { useState } from 'react';
import { ArrowLeft, Save, Calendar, Clock, Send, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { seriesApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type FormValues = {
  topic: string;
  goal: string;
  level: string;
  timezone: string;
  startDate: string;
  duration: string;
  cadence: string;
  sendDays: string;
  sendTime: string;
  verifyRecipient: boolean;
  manualApproval: boolean;
};

const steps = [
  { id: 1, title: 'Topic & Goal', desc: 'What are you creating?' },
  { id: 2, title: 'Timeline', desc: 'When and how often?' },
  { id: 3, title: 'Preferences', desc: 'Fine-tune delivery' },
];

const levelOptions = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const durationOptions = [
  { value: '1 week', label: '1 Week' },
  { value: '1 month', label: '1 Month' },
  { value: '3 months', label: '3 Months' },
  { value: '6 months', label: '6 Months' },
];

const cadenceOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function CreateSeriesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormValues>({
    topic: '',
    goal: '',
    level: 'beginner',
    timezone: 'UTC',
    startDate: '',
    duration: '1 month',
    cadence: 'weekly',
    sendDays: 'Monday, Wednesday, Friday',
    sendTime: '09:00',
    verifyRecipient: true,
    manualApproval: true,
  });

  const updateField = (field: keyof FormValues, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!formData.topic.trim() || formData.topic.length < 3) {
        setError('Please enter a topic (at least 3 characters)');
        return false;
      }
      if (!formData.goal.trim() || formData.goal.length < 10) {
        setError('Please enter a goal (at least 10 characters)');
        return false;
      }
    }
    if (step === 2) {
      if (!formData.startDate) {
        setError('Please select a start date');
        return false;
      }
      if (!formData.sendDays.trim()) {
        setError('Please specify the days you want to send');
        return false;
      }
      if (!formData.sendTime) {
        setError('Please specify the send time');
        return false;
      }
    }
    return true;
  };

  const handleNextWithValidation = () => {
    if (validateStep(currentStep)) {
      handleNext();
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    setSubmitting(true);
    setError(null);
    try {
      await seriesApi.create({
        topic: formData.topic,
        goal: formData.goal,
        level: formData.level,
        timezone: formData.timezone,
        start_date: formData.startDate,
        duration: formData.duration,
        cadence: formData.cadence,
        send_days: formData.sendDays,
        send_time: formData.sendTime,
        verify_recipient: formData.verifyRecipient,
        manual_approval: formData.manualApproval,
      });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to create series. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <nav aria-label="Progress">
        <ol className="flex items-center justify-center space-x-4">
          {steps.map((step, idx) => (
            <li key={step.id} className="flex items-center">
              {idx > 0 && (
                <div className={`h-px w-12 ${
                  currentStep > step.id ? 'bg-blue-600' : 'bg-gray-300'
                }`} />
              )}
              <div className="flex items-center justify-center">
                {currentStep > step.id ? (
                  <CheckCircle className="h-6 w-6 text-blue-600" />
                ) : (
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    currentStep === step.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {step.id}
                  </div>
                )}
                <div className="ml-3 text-center">
                  <span className={`text-sm font-medium ${
                    currentStep >= step.id ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                  <p className="text-xs text-gray-500">{step.desc}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Topic <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.topic}
          onChange={(e) => updateField('topic', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          placeholder="e.g. Introduction to Kubernetes"
          maxLength={100}
        />
        <p className="mt-1 text-xs text-gray-500">{formData.topic.length}/100 characters</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Goal <span className="text-red-500">*</span>
        </label>
        <textarea
          value={formData.goal}
          onChange={(e) => updateField('goal', e.target.value)}
          rows={4}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white resize-none"
          placeholder="By the end of this series, you should be able to..."
          maxLength={500}
        />
        <p className="mt-1 text-xs text-gray-500">{formData.goal.length}/500 characters</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Audience Level
        </label>
        <div className="grid grid-cols-3 gap-3">
          {levelOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateField('level', option.value)}
              className={`p-3 border rounded-lg text-center transition-all ${
                formData.level === option.value
                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Start Date <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="date"
            value={formData.startDate}
            onChange={(e) => updateField('startDate', e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Duration <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {durationOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateField('duration', option.value)}
              className={`p-3 border rounded-lg text-center transition-all ${
                formData.duration === option.value
                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Cadence <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {cadenceOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateField('cadence', option.value)}
              className={`p-3 border rounded-lg text-center transition-all ${
                formData.cadence === option.value
                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Send Days <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.sendDays}
          onChange={(e) => updateField('sendDays', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          placeholder="e.g. Monday, Wednesday, Friday"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Send Time <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="time"
            value={formData.sendTime}
            onChange={(e) => updateField('sendTime', e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Timezone
        </label>
        <select
          value={formData.timezone}
          onChange={(e) => updateField('timezone', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
        >
          <option value="UTC">UTC</option>
          <option value="America/New_York">America/New_York</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="Europe/London">Europe/London</option>
          <option value="Asia/Tokyo">Asia/Tokyo</option>
        </select>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-4">
          Delivery Preferences
        </label>
        <div className="space-y-4">
          <div className="flex items-start p-4 border border-gray-200 rounded-lg">
            <div className="flex-shrink-0 mt-1">
              <input
                type="checkbox"
                checked={formData.verifyRecipient}
                onChange={(e) => updateField('verifyRecipient', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3">
              <label className="text-sm font-medium text-gray-700 cursor-pointer">
                Require verified recipients
              </label>
              <p className="text-sm text-gray-500 mt-1">
                Only send to subscribers who have confirmed their email address.
              </p>
            </div>
          </div>

          <div className="flex items-start p-4 border border-gray-200 rounded-lg">
            <div className="flex-shrink-0 mt-1">
              <input
                type="checkbox"
                checked={formData.manualApproval}
                onChange={(e) => updateField('manualApproval', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3">
              <label className="text-sm font-medium text-gray-700 cursor-pointer">
                Manual approval before sending
              </label>
              <p className="text-sm text-gray-500 mt-1">
                Review and approve each issue before it goes to subscribers.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Review your settings</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Topic:</span>
            <span className="text-gray-900 font-medium">{formData.topic}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Level:</span>
            <span className="text-gray-900 font-medium">
              {levelOptions.find((o) => o.value === formData.level)?.label}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Duration:</span>
            <span className="text-gray-900 font-medium">{formData.duration}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Cadence:</span>
            <span className="text-gray-900 font-medium">{formData.cadence}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return renderStep1();
    }
  };

  const isLastStep = currentStep === steps.length;
  const isFirstStep = currentStep === 1;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="mb-6">
          <Link href="/dashboard">
            <button className="flex items-center text-gray-600 hover:text-gray-900 text-sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </button>
          </Link>
        </div>

        {renderStepIndicator()}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {steps[currentStep - 1].title}
          </h2>
          {renderCurrentStep()}

          <div className="flex justify-between items-center mt-10 pt-6 border-t border-gray-200">
            <button
              onClick={handleBack}
              disabled={isFirstStep}
              className={`text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Back
            </button>
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
              >
                {submitting ? 'Creating...' : 'Create Series'}
                <Save className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleNextWithValidation}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
