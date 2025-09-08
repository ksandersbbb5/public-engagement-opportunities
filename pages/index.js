import React, { useState } from 'react';
import { Search, Calendar, MapPin, Users, DollarSign, Phone, ExternalLink, Target } from 'lucide-react';

export default function Home() {
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

  const findOpportunities = async () => {
    const startTime = Date.now();
    setIsLoading(true);
    setError('');
    setSearchTime(null);
    
    try {
      const response = await fetch('/api/find-opportunities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceAreas,
          bbbTopics,
          timeframe: '90 days'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch opportunities');
      }

      const data = await response.json();
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      
      setResults(data);
      setSearchTime({ minutes, seconds });
    } catch (err) {
      setError('Unable to fetch opportunities at this time. Please try again later.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const EventCard = ({ event }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-xl font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Arial, sans-serif' }}>
        {event.name}
      </h3>
      
      <div className="space-y-3">
        <div className="flex items-center text-gray-700">
          <Calendar className="w-4 h-4 mr-2 text-blue-600" />
          <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.date || 'Date TBD'}</span>
        </div>
        
        <div className="flex items-center text-gray-700">
          <MapPin className="w-4 h-4 mr-2 text-blue-600" />
          <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.location || 'Location TBD'}</span>
        </div>
        
        <div className="flex items-center text-gray-700">
          <DollarSign className="w-4 h-4 mr-2 text-blue-600" />
          <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.cost || 'Cost TBD'}</span>
        </div>
        
        <div className="flex items-center text-gray-700">
          <Users className="w-4 h-4 mr-2 text-blue-600" />
          <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.audienceType || 'General Business Audience'}</span>
        </div>
        
        {event.contactInfo && (
          <div className="flex items-center text-gray-700">
            <Phone className="w-4 h-4 mr-2 text-blue-600" />
            <span style={{ fontFamily: 'Arial, sans-serif' }}>{event.contactInfo}</span>
          </div>
        )}
        
        {event.link && (
          <div className="flex items-center text-gray-700">
            <ExternalLink className="w-4 h-4 mr-2 text-blue-600" />
            <a href={event.link} target="_blank" rel="noopener noreferrer" 
               className="text-blue-600 hover:text-blue-800 underline"
               style={{ fontFamily: 'Arial, sans-serif' }}>
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
              Business Engagement Opportunities
            </h1>
          </div>
          
          <p className="text-lg text-gray-600 mb-4 max-w-3xl mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
            This will generate what business focus events are occurring
          </p>
          <p className="text-lg text-gray-600 mb-8 max-w-3xl mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
            in our service area in the next 90 days.
          </p>
          
          <button
            onClick={findOpportunities}
            disabled={isLoading}
            className="px-8 py-3 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            style={{ 
              backgroundColor: '#00965E',
              fontFamily: 'Arial, sans-serif'
            }}
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Searching...
              </div>
            ) : (
              <div className="flex items-center">
                <Search className="w-5 h-5 mr-2" />
                Find Me Opportunities
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
            {serviceAreas.map((area, index) => (
              <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm" 
                    style={{ fontFamily: 'Arial, sans-serif' }}>
                {area}
              </span>
            ))}
          </div>
        </div>

        {/* Search Completion Message */}
        {searchTime && results && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-6" 
               style={{ fontFamily: 'Arial, sans-serif' }}>
            Search completed in {searchTime.minutes > 0 ? `${searchTime.minutes} minute${searchTime.minutes > 1 ? 's' : ''} and ` : ''}{searchTime.seconds} second{searchTime.seconds !== 1 ? 's' : ''}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6" 
               style={{ fontFamily: 'Arial, sans-serif' }}>
            {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-8">
            {Object.entries(results).map(([state, events]) => (
              <div key={state}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b-2 border-gray-300" 
                    style={{ fontFamily: 'Arial, sans-serif' }}>
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
            <EventCard 
              event={{
                name: "2025 North Shore Business Expo",
                date: "March 15, 2025",
                location: "North Shore, Massachusetts",
                cost: "$25 for exhibitors, Free for attendees",
                audienceType: "Small and medium-sized business owners, entrepreneurs, and local professionals",
                contactInfo: "info@northshorebusinessexpo.com",
                link: "https://northshorebusinessexpo.com",
                whyBBBShouldBeThere: "This is a prime networking opportunity to directly engage with local business leaders. BBB can offer a free seminar on 'Protecting Your Business from Scams & Fraud' or 'Unlocking the Power of Conflict Resolution in the Workplace,' directly aligning with BBB's mission. A booth presence allows for one-on-one conversations to recruit new accredited businesses and offer resources on ethical business practices."
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
