import React, { useState } from 'react';
import {
  Search, Calendar, MapPin, Users, DollarSign, Phone, ExternalLink, Target, Tag, Clock
} from 'lucide-react';

export default function Home() {
  const [mode, setMode] = useState('business'); // 'business' | 'public'
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [searchTime, setSearchTime] = useState(null);

  const serviceAreas = [
    'Vermont',
    'Maine', 
    'Rhode Island',
    'Barnstable County, MA',
    'Bristol County, MA',
    'Dukes County, MA',
    'Essex County, MA',
    'Middlesex County, MA',
    'Nantucket County, MA',
    'Norfolk County, MA',
    'Plymouth County, MA',
    'Suffolk County, MA'
  ];

  const bbbTopics = [
    "Creating and Enhancing Your BBB Business Profile",
    "Behind the Seal: Building Better Business -- A Conversation on Freedom, Leadership, and Growth",
    "Behind the Seal: Building Better Business -- Creating Events That Move People",
    "Behind the Seal: Building Better Business -- Launching a Women-Centered Business Hub",
    "Behind the Seal: Building Better Business -- Marketing That Shines",
    "Behind the Seal: Building Better Business -- Building a Business with Heart",
    "Behind the Seal: Building Better Business -- Mastering Business Insurance"
  ];

  async function runSearch(which = mode) {
    const startTime = Date.now();
    setIsLoading(true);
    setError('');
    setSearchTime(null);
    setResults(null);

    const endpoint = which === 'public' ? '/api/find-public-events' : '/api/find-opportunities';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceAreas,
          bbbTopics,
          timeframe: '90 days',
          mode: which
        }),
      });

      if (!response.ok) throw new Error(`Failed to fetch ${which} opportunities`);

      const data = await response.json();
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      setResults(data);
      setSearchTime({ minutes: Math.floor(elapsed / 60), seconds: elapsed % 60 });
    } catch (err) {
      console.error(err);
      setError('Unable to fetch opportunities at this time. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }

  const EventCard = ({ event }) => {
    const hasTopic = Boolean(event.topic);
    const locationFallback = event.location ||
      [event.city, event.state].filter(Boolean).join(', ') || 'Location TBD';

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Arial, sans-serif' }}>
            {event.name}
          </h3>
          {hasTopic && (
            <span className="ml-3 inline-flex items-center bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">
              <Tag className="w-3 h-3 mr-1" />
              {event.topic}
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center text-gray-700">
            <Calendar className="w-4 h-4 mr-2 text-blue-600" />
            <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.date || 'Date TBD'}</span>
          </div>

          {event.time && (
            <div className="flex items-center text-gray-700">
              <Clock className="w-4 h-4 mr-2 text-blue-600" />
              <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.time}</span>
            </div>
          )}

          <div className="flex items-center text-gray-700">
            <MapPin className="w-4 h-4 mr-2 text-blue-600" />
            <span style={{ fontFamily: 'Arial, sans-serif' }}>{locationFallback}</span>
          </div>

          {event.cost && (
            <div className="flex items-center text-gray-700">
              <DollarSign className="w-4 h-4 mr-2 text-blue-600" />
              <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.cost}</span>
            </div>
          )}

          {event.audienceType && (
            <div className="flex items-center text-gray-700">
              <Users className="w-4 h-4 mr-2 text-blue-600" />
              <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.audienceType}</span>
            </div>
          )}

          {event.contactInfo && (
            <div className="flex items-center text-gray-700">
              <Phone className="w-4 h-4 mr-2 text-blue-600" />
              <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.contactInfo}</span>
            </div>
          )}

          {event.link && (
            <div className="flex items-center text-gray-700">
              <ExternalLink className="w-4 h-4 mr-2 text-blue-600" />
              <a
                href={event.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                Event Link
              </a>
            </div>
          )}

          {event.whyBBBShouldBeThere && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
              <div className="flex items-start">
                <Target className="w-4 h-4 mr-2 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-green-800 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                    Why BBB Should Be There:
                  </h4>
                  <p className="text-green-700 text-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
                    {event.whyBBBShouldBeThere}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Title = mode === 'public' ? 'Public Engagement Opportunities' : 'Business Engagement Opportunities';
  const Subtitle =
    mode === 'public'
      ? 'This will generate public-facing events (festivals, fairs, town days, library programs, etc.)'
      : 'This will generate what business focus events are occurring';
  const Subtitle2 = 'in our service area in the next 90 days.';
  const buttonText = mode === 'public' ? 'Find Public Opportunities' : 'Find Business Opportunities';

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/images/bbb-logo.png"
              alt="BBB Logo"
              className="w-16 h-16 mr-4"
              style={{ fontFamily: 'Arial, sans-serif' }}
            />
            <h1 className="text-4xl font-bold text-gray-900" style={{ fontFamily: 'Arial, sans-serif' }}>
              {Title}
            </h1>
          </div>

          {/* Mode toggle */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setMode('business')}
                className={`px-4 py-2 text-sm font-semibold ${mode === 'business' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
              >
                Business
              </button>
              <button
                onClick={() => setMode('public')}
                className={`px-4 py-2 text-sm font-semibold border-l border-gray-300 ${mode === 'public' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
              >
                Public
              </button>
            </div>
          </div>

          <p className="text-lg text-gray-600 mb-4 max-w-3xl mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
            {Subtitle}
          </p>
          <p className="text-lg text-gray-600 mb-8 max-w-3xl mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
            {Subtitle2}
          </p>

          <button
            onClick={() => runSearch(mode)}
            disabled={isLoading}
            className="px-8 py-3 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            style={{ backgroundColor: '#00965E', fontFamily: 'Arial, sans-serif' }}
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Searching...
              </div>
            ) : (
              <div className="flex items-center">
                <Search className="w-5 h-5 mr-2" />
                {buttonText}
              </div>
            )}
          </button>
        </div>

        {/* Service Areas Info */}
        <div className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Arial, sans-serif' }}>
            Service Areas
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {serviceAreas.map((area, idx) => (
              <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
                {area}
              </span>
            ))}
          </div>
        </div>

        {/* Search Completion Message */}
        {searchTime && results && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-6" style={{ fontFamily: 'Arial, sans-serif' }}>
            Search completed in {searchTime.minutes > 0 ? `${searchTime.minutes} minute${searchTime.minutes > 1 ? 's' : ''} and ` : ''}{searchTime.seconds} second{searchTime.seconds !== 1 ? 's' : ''}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6" style={{ fontFamily: 'Arial, sans-serif' }}>
            {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-8">
            {Object.entries(results).map(([state, events]) => (
              <div key={state}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b-2 border-gray-300" style={{ fontFamily: 'Arial, sans-serif' }}>
                  {state} - {events.length} Opportunit{events.length === 1 ? 'y' : 'ies'} Found
                </h2>
                <div className="grid gap-6 md:grid-cols-2">
                  {events.map((event, index) => (
                    <EventCard key={index} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sample Result (shown when no real results) */}
        {!results && !isLoading && (
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Arial, sans-serif' }}>
              Sample Result
            </h2>
            {mode === 'business' ? (
              <EventCard
                event={{
                  name: "2025 North Shore Business Expo",
                  date: "March 15, 2025",
                  location: "North Shore, Massachusetts",
                  cost: "$25 for exhibitors, Free for attendees",
                  audienceType: "Small and medium-sized business owners, entrepreneurs, and local professionals",
                  contactInfo: "info@northshorebusinessexpo.com",
                  link: "https://northshorebusinessexpo.com",
                  whyBBBShouldBeThere: "Prime networking to engage business leaders; host a BBB seminar on scam prevention."
                }}
              />
            ) : (
              <EventCard
                event={{
                  name: "City Spring Festival",
                  date: "April 20, 2025",
                  time: "10:00 AM – 3:00 PM",
                  city: "Boston",
                  state: "MA",
                  cost: "Free",
                  topic: "Community Festival/Fair",
                  contactInfo: "events@boston.gov",
                  link: "https://www.boston.gov/events",
                  whyBBBShouldBeThere: "Large general audience for consumer education and scam-prevention outreach."
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
