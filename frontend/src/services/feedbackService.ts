const API_URL = import.meta.env.VITE_FEEDBACK_API_URL || 'http://localhost:5000/api';

/**
 * Input structure required to submit user feedback.
 */
export interface FeedbackInput {
  rating: number;
  comment: string;
  walletAddress?: string;
}

/**
 * Representation of a single feedback submission stored in the database.
 */
export interface FeedbackSubmission {
  id: number;
  rating: number;
  comment: string;
  wallet_address: string | null;
  timestamp: string;
}

/**
 * Aggregated statistics and history returned by the feedback service.
 */
export interface FeedbackStats {
  totalSubmissions: number;
  averageRating: number;
  submissions: FeedbackSubmission[];
}

/**
 * Submit user rating and comment feedback to the backend API.
 * @param data FeedbackInput containing rating, comment, and optional walletAddress.
 * @returns Promise that resolves on successful submission.
 * @throws Error when backend request fails or validation fails.
 */
export const submitFeedback = async (data: FeedbackInput): Promise<void> => {
  const response = await fetch(`${API_URL}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to submit feedback');
  }
};

/**
 * Fetch aggregated statistics and all individual submissions.
 * @returns Promise resolving to a FeedbackStats object.
 * @throws Error when retrieving feedback history fails.
 */
export const getFeedbackStats = async (): Promise<FeedbackStats> => {
  const response = await fetch(`${API_URL}/feedback`);
  if (!response.ok) {
    throw new Error('Failed to retrieve feedback history');
  }
  return response.json();
};
