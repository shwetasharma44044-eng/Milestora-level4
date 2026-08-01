import posthog from 'posthog-js';

const POSTHOG_TOKEN = import.meta.env.VITE_POSTHOG_TOKEN || '';
const POSTHOG_API_HOST = import.meta.env.VITE_POSTHOG_API_HOST || 'https://us.i.posthog.com';

export const initAnalytics = () => {
  if (POSTHOG_TOKEN) {
    posthog.init(POSTHOG_TOKEN, {
      api_host: POSTHOG_API_HOST,
      loaded: () => {
        console.log("PostHog Analytics initialized successfully.");
      }
    });
  } else {
    console.warn("VITE_POSTHOG_TOKEN not configured. Analytics events will be logged to console.");
  }
};

export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  console.log(`[Analytics Event] ${eventName}:`, properties);
  if (POSTHOG_TOKEN) {
    posthog.capture(eventName, properties);
  }
};
