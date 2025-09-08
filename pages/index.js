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

  const bb
