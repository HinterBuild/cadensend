'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { seriesApi } from '@/lib/api';

const briefSchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters'),
  goal: z.string().min(10, 'Goal must be at least 10 characters'),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  timezone: z.string().default('UTC'),
  startDate: z.string().min(1, 'Start date is required'),
  duration: z.enum(['1 day', '3 days', '1 week', '1 month', '3 months', '6 months']),
  cadence: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
  sendDays: z.string().min(1, 'Send days are required'),
  sendTime: z.string().min(1, 'Send time is required'),
  verifyRecipient: z.boolean().default(true),
  manualApproval: z.boolean().default(true),
});

type BriefFormData = z.infer<typeof briefSchema>;

export default function CreateSeriesPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BriefFormData>({
    resolver: zodResolver(briefSchema),
    defaultValues: {
      level: 'beginner',
      timezone: 'UTC',
      duration: '1 month',
      cadence: 'weekly',
      verifyRecipient: true,
      manualApproval: true,
    },
  });

  const onSubmit = async (data: BriefFormData) => {
    setSubmitting(true);
    try {
      await seriesApi.create({
        topic: data.topic,
        goal: data.goal,
        level: data.level,
        timezone: data.timezone,
        start_date: data.startDate,
        duration: data.duration,
        cadence: data.cadence,
        send_days: data.sendDays,
        send_time: data.sendTime,
        verify_recipient: data.verifyRecipient,
        manual_approval: data.manualApproval,
      });
      setSubmitted(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (err: any) {
      console.error('Failed to create series:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Creating your series...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <Link href="/dashboard">
          <button className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </button>
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Create New Series</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Topic & Goal</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Topic</label>
                <input
                  type="text"
                  placeholder="e.g. Introduction to Kubernetes"
                  {...register('topic')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.topic && <p className="text-sm text-red-600">{errors.topic.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Goal</label>
                <textarea
                  placeholder="By the end of this series, you should be able to..."
                  {...register('goal')}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.goal && <p className="text-sm text-red-600">{errors.goal.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Audience Level</label>
                <select
                  {...register('level')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Timeline</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                <input type="date" {...register('startDate')} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {errors.startDate && <p className="text-sm text-red-600">{errors.startDate.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                <select {...register('duration')} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="1 week">1 Week</option>
                  <option value="1 month">1 Month</option>
                  <option value="3 months">3 Months</option>
                  <option value="6 months">6 Months</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cadence</label>
                <select {...register('cadence')} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Send Time</label>
                <input type="time" {...register('sendTime')} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Send Days</label>
              <input type="text" placeholder="e.g. Monday, Wednesday, Friday" {...register('sendDays')} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Delivery Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" {...register('verifyRecipient')} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                <label className="text-sm text-gray-700">Require verified recipients</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" {...register('manualApproval')} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                <label className="text-sm text-gray-700">Manual approval required before sending</label>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <Link href="/dashboard">
              <button type="button" className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
            </Link>
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Series'}
              <Save className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
