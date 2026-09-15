import React from 'react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '3rem 2rem' }}>
        <EmptyState
          title="404 - Page Not Found"
          message="The page or resource you are trying to access does not exist or has been moved."
          actionText="Return to Dashboard"
          onAction={() => navigate('/')}
        />
      </div>
    </div>
  );
};

