import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { EmptyState } from '../../components/EmptyState';

export const StaffDashboard = () => {
  const { user } = useAuth();
  const { currentOrg, effectiveRole } = useTenant();
  const navigate = useNavigate();

  return (
    <div className="app-container animate-page-entrance">
      <div className="card" style={{ marginBottom: '1.75rem', backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex justify-between items-center flex-wrap gap-md">
          <div>
            <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Staff Operations Command</span>
            <h1 style={{ marginTop: '0.25rem' }}>Welcome, {user?.first_name || user?.email}!</h1>
            <p className="subtitle" style={{ marginTop: '0.25rem' }}>
              Front-desk check-in & queue supervision for <strong>{currentOrg?.name || 'SmartQueue'}</strong>.
            </p>
          </div>
          <div className="flex gap-sm">
            <button className="btn btn-primary" onClick={() => navigate('/staff/appointments')}>
              📋 Search Appointments
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/staff/queue')}>
              ⏳ Monitor Queue Board
            </button>
          </div>
        </div>
      </div>

      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the header selector above to view staff operations."
        />
      ) : (
        <div className="grid-responsive grid-cols-2 animate-section stagger-1">
          <div className="card card-hover flex flex-col justify-between">
            <div>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📋</div>
              <h3>Customer Check-In & Appointments</h3>
              <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                Lookup customer bookings, verify identity, and trigger instant queue check-in tokens.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/staff/appointments')}
              style={{ marginTop: '1.5rem' }}
            >
              Open Appointments &rarr;
            </button>
          </div>

          <div className="card card-hover flex flex-col justify-between">
            <div>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
              <h3>Live Queue Board Monitor</h3>
              <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                Supervise active queue tokens across all providers in {currentOrg.name}.
              </p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/staff/queue')}
              style={{ marginTop: '1.5rem' }}
            >
              Open Queue Board &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffDashboard;
