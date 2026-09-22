'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";

export default function ServiceStatusCheck({ showDetails = false }) {
  const [serviceStatus, setServiceStatus] = useState({
    jobDescService: { status: 'checking', name: 'AI Support (Port 8001)' },
    ragService: { status: 'checking', name: 'AI Core (Port 8000)' },
  });

  useEffect(() => {
    checkServices();
  }, []);

  const checkServices = async () => {
    const services = [
      { key: 'jobDescService', url: 'http://localhost:8001/', name: 'AI Support (Port 8001)' },
      { key: 'ragService', url: 'http://localhost:8000/health', name: 'AI Core (Port 8000)' }
    ];

    for (const service of services) {
      try {
        const response = await fetch(service.url, { 
          method: 'GET',
          mode: 'no-cors',
          signal: AbortSignal.timeout(3000)
        });
        
        setServiceStatus(prev => ({
          ...prev,
          [service.key]: { status: 'online', name: service.name }
        }));
      } catch (error) {
        setServiceStatus(prev => ({
          ...prev,
          [service.key]: { status: 'offline', name: service.name }
        }));
      }
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'offline':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return 'text-green-600';
      case 'offline':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  const hasOfflineServices = Object.values(serviceStatus).some(service => service.status === 'offline');

  if (!showDetails && !hasOfflineServices) {
    return null; // Don't show anything if all services are online and details not requested
  }

  return (
    <div className="space-y-2">
      {hasOfflineServices && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <div className="text-sm text-red-800 dark:text-red-200">
                Some backend services are offline. PDF file upload may not work. Please start the required services or use manual text input.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {showDetails && (
        <div className="text-sm space-y-1">
          <div className="font-medium text-muted-foreground">Service Status:</div>
          {Object.entries(serviceStatus).map(([key, service]) => (
            <div key={key} className="flex items-center gap-2">
              {getStatusIcon(service.status)}
              <span className={getStatusColor(service.status)}>
                {service.name}: {service.status}
              </span>
            </div>
          ))}
          
          {hasOfflineServices && (
            <div className="mt-2 text-xs text-muted-foreground">
              <div>To start services:</div>
              <div>• AI Support: <code>npm run job-desc-service</code></div>
              <div>• AI Core: <code>npm run rag-service</code></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
